import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface CreateInvoiceRequest {
  organizationId: string;
  purchaseId: string;
}

interface TreatmentLine {
  treatment_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

// Per-org sequential invoice numbers with a zero-padded 5-digit suffix
// (INV-00001). We don't reuse numbers for voided invoices — auditors rely on
// that. The counter lives at organizations/{orgId}/config/invoiceCounter.
export const createInvoice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const { organizationId, purchaseId } = request.data as CreateInvoiceRequest;
  if (!organizationId || !purchaseId) {
    throw new HttpsError('invalid-argument', 'organizationId and purchaseId are required');
  }

  // Caller must be an admin of this org.
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('permission-denied', 'User not found');
  }
  const userData = userDoc.data()!;
  if (userData.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  await consumeRateLimit(organizationId, 'generateInvoice', 100);

  const orgRef = db.collection('organizations').doc(organizationId);

  // Idempotency: if we've already issued an invoice for this purchase, return it.
  // Protects against double-click and accidental re-generation.
  const existingSnap = await orgRef
    .collection('invoices')
    .where('purchase_id', '==', purchaseId)
    .where('status', '==', 'issued')
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0];
    return { invoice: { id: existing.id, ...existing.data() }, reused: true };
  }

  // Read-only phase — heavy reads outside the transaction to keep retries cheap.
  const purchaseRef = orgRef.collection('purchases').doc(purchaseId);
  const purchaseSnap = await purchaseRef.get();
  if (!purchaseSnap.exists) {
    throw new HttpsError('not-found', 'Purchase not found');
  }
  const purchase = purchaseSnap.data()!;

  if (purchase.organization_id && purchase.organization_id !== organizationId) {
    throw new HttpsError('permission-denied', 'Purchase does not belong to this organization');
  }

  if (!purchase.client_id) {
    throw new HttpsError('failed-precondition', 'Purchase has no client');
  }

  const [clientSnap, pkgSnap, businessInfoSnap, orgSnap] = await Promise.all([
    orgRef.collection('clients').doc(purchase.client_id).get(),
    purchase.package_id
      ? orgRef.collection('packages').doc(purchase.package_id).get()
      : Promise.resolve(null),
    orgRef.collection('config').doc('businessInfo').get(),
    orgRef.get(),
  ]);

  if (!clientSnap.exists) {
    throw new HttpsError('not-found', 'Client not found');
  }
  const client = clientSnap.data()!;
  const pkgData = pkgSnap && pkgSnap.exists ? pkgSnap.data() ?? {} : {};
  const businessInfo = businessInfoSnap.exists ? businessInfoSnap.data() ?? {} : {};
  const org = orgSnap.exists ? orgSnap.data() ?? {} : {};

  // Treatments: prefer sessions_by_treatment from the purchase (authoritative
  // for per-treatment quantities), fall back to the package's treatment_items,
  // finally the bare treatments[] list with quantity unknown.
  const sessionsByTreatment: any[] = Array.isArray(purchase.sessions_by_treatment)
    ? purchase.sessions_by_treatment
    : [];
  const treatmentItems: any[] = Array.isArray(pkgData.treatment_items)
    ? pkgData.treatment_items
    : [];
  const pkgTreatmentIds: string[] = Array.isArray(pkgData.treatments)
    ? pkgData.treatments
    : [];

  const treatmentIds = new Set<string>();
  sessionsByTreatment.forEach((s: any) => s?.treatment_id && treatmentIds.add(s.treatment_id));
  treatmentItems.forEach((t: any) => t?.treatment_id && treatmentIds.add(t.treatment_id));
  pkgTreatmentIds.forEach((tid) => tid && treatmentIds.add(tid));

  const treatmentsMap = new Map<string, any>();
  if (treatmentIds.size > 0) {
    const treatmentSnaps = await Promise.all(
      Array.from(treatmentIds).map((tid) => orgRef.collection('treatments').doc(tid).get()),
    );
    treatmentSnaps.forEach((t) => {
      if (t.exists) treatmentsMap.set(t.id, t.data());
    });
  }

  const treatments: TreatmentLine[] = [];
  if (sessionsByTreatment.length > 0) {
    sessionsByTreatment.forEach((s: any) => {
      if (!s?.treatment_id) return;
      const t = treatmentsMap.get(s.treatment_id);
      treatments.push({
        treatment_id: s.treatment_id,
        name: (t?.name as string) ?? 'Treatment',
        quantity: Number(s.total ?? s.remaining ?? 0),
        unit_price_cents: Math.round(Number(t?.price ?? 0) * 100),
      });
    });
  } else if (treatmentItems.length > 0) {
    treatmentItems.forEach((ti: any) => {
      if (!ti?.treatment_id) return;
      const t = treatmentsMap.get(ti.treatment_id);
      treatments.push({
        treatment_id: ti.treatment_id,
        name: (t?.name as string) ?? 'Treatment',
        quantity: Number(ti.quantity ?? 0),
        unit_price_cents: Math.round(Number(t?.price ?? 0) * 100),
      });
    });
  } else {
    pkgTreatmentIds.forEach((tid) => {
      const t = treatmentsMap.get(tid);
      treatments.push({
        treatment_id: tid,
        name: (t?.name as string) ?? 'Treatment',
        quantity: 0,
        unit_price_cents: Math.round(Number(t?.price ?? 0) * 100),
      });
    });
  }

  // Money: ints-only everywhere. `total_amount` on the purchase is the price
  // actually charged (may differ from the package catalog price after overrides).
  const chargedAmount = Number(
    purchase.total_amount ?? purchase.price ?? pkgData.price ?? 0,
  );
  const unitPriceCents = Math.round(chargedAmount * 100);
  const quantity = 1;
  const subtotalCents = unitPriceCents * quantity;
  const taxRate = Number(businessInfo.tax_rate ?? 0);
  const taxAmountCents = Math.round((subtotalCents * taxRate) / 100);
  const totalCents = subtotalCents + taxAmountCents;

  const currency = (businessInfo.currency as string) || 'USD';
  const invoicePrefix = (businessInfo.invoice_prefix as string) || 'INV';

  const nowTs = admin.firestore.Timestamp.now();
  const invoiceRef = orgRef.collection('invoices').doc();
  const counterRef = orgRef.collection('config').doc('invoiceCounter');

  // Atomic: read + increment counter and write the invoice together. If this
  // retries under contention, both writes retry together — we never issue an
  // invoice without claiming a number, or claim a number without an invoice.
  const invoiceNumberInt = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const next = counterSnap.exists
      ? Number((counterSnap.data() as any).next_number ?? 1)
      : 1;

    tx.set(
      counterRef,
      {
        next_number: next + 1,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const invoiceNumber = `${invoicePrefix}-${String(next).padStart(5, '0')}`;

    tx.set(invoiceRef, {
      invoice_number: invoiceNumber,
      invoice_number_int: next,
      issued_at: nowTs,
      purchase_id: purchaseId,
      client_id: purchase.client_id,
      client_snapshot: {
        name: (client.name as string) ?? '',
        email: (client.email as string) ?? '',
        phone: (client.phone as string) ?? '',
        address: (client.address as string) ?? '',
      },
      business_snapshot: {
        name: (businessInfo.name as string) ?? (org.name as string) ?? '',
        address: (businessInfo.address as string) ?? '',
        phone: (businessInfo.phone as string) ?? '',
        email: (businessInfo.email as string) ?? '',
        website: (businessInfo.website as string) ?? '',
        logo_url: (org.logoUrl as string) ?? '',
        tax_id: (businessInfo.tax_id as string) ?? '',
        payment_terms: (businessInfo.invoice_payment_terms as string) ?? '',
        notes: (businessInfo.invoice_notes as string) ?? '',
        timezone: (org.timezone as string) ?? 'UTC',
        invoice_template: (businessInfo.invoice_template as string) ?? 'classic',
      },
      line_items: [
        {
          type: 'package',
          name: (pkgData.name as string) ?? 'Package',
          description: (pkgData.description as string) ?? '',
          package_id: purchase.package_id ?? null,
          treatments,
          quantity,
          unit_price_cents: unitPriceCents,
          subtotal_cents: subtotalCents,
        },
      ],
      subtotal_cents: subtotalCents,
      tax_rate: taxRate,
      tax_amount_cents: taxAmountCents,
      total_cents: totalCents,
      currency,
      pdf_url: null,
      pdf_storage_path: null,
      status: 'issued',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by: request.auth!.uid,
    });

    return next;
  });

  // Re-read so the returned doc has resolved serverTimestamps for `created_at`.
  const written = await invoiceRef.get();
  return {
    invoice: { id: invoiceRef.id, ...written.data() },
    reused: false,
    invoiceNumberInt,
  };
});
