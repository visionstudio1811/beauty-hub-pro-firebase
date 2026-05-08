import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface ProductItemInput {
  product_id: string;
  quantity?: number;
  // Optional override; if absent we use the product's catalog price.
  unit_price?: number;
  // Optional override of the displayed line name (defaults to product.name).
  name?: string;
}

interface TreatmentItemInput {
  treatment_id: string;
  quantity?: number;
  unit_price?: number;
  name?: string;
}

interface CreateInvoiceRequest {
  organizationId: string;
  // Either provide purchaseId (package-based invoice) OR clientId + at least
  // one item (product or treatment) for a standalone invoice.
  purchaseId?: string | null;
  clientId?: string | null;
  product_items?: ProductItemInput[];
  treatment_items?: TreatmentItemInput[];
  payment_method?: string;
  // Optional free-form line note appended to the description on the standalone
  // invoice. Ignored for purchase-based invoices.
  notes?: string;
  // Optional idempotency key: prevents duplicate invoices when retried.
  // Used for standalone invoices (purchaseId-based ones already de-dupe by
  // purchase_id + status='issued').
  idempotency_key?: string;
}

interface TreatmentLine {
  treatment_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

interface BundledProductLine {
  product_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

interface BusinessSnapshot {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  tax_id: string;
  payment_terms: string;
  notes: string;
  timezone: string;
  invoice_template: string;
}

interface ClientSnapshot {
  name: string;
  email: string;
  phone: string;
  address: string;
}

// Per-org sequential invoice numbers with a zero-padded 5-digit suffix
// (INV-00001). We don't reuse numbers for voided invoices — auditors rely on
// that. The counter lives at organizations/{orgId}/config/invoiceCounter.
export const createInvoice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const data = request.data as CreateInvoiceRequest;
  const { organizationId, purchaseId, clientId, payment_method, notes, idempotency_key } = data;
  const productItems = Array.isArray(data.product_items) ? data.product_items : [];
  const treatmentItemsInput = Array.isArray(data.treatment_items) ? data.treatment_items : [];

  if (!organizationId) {
    throw new HttpsError('invalid-argument', 'organizationId is required');
  }

  const isStandalone = !purchaseId;
  if (isStandalone) {
    if (!clientId) {
      throw new HttpsError('invalid-argument', 'clientId is required for standalone invoices');
    }
    if (productItems.length === 0 && treatmentItemsInput.length === 0) {
      throw new HttpsError('invalid-argument', 'At least one product or treatment line item is required for standalone invoices');
    }
    if (productItems.some(p => !p.product_id)) {
      throw new HttpsError('invalid-argument', 'Every product line item needs a product_id');
    }
    if (treatmentItemsInput.some(t => !t.treatment_id)) {
      throw new HttpsError('invalid-argument', 'Every treatment line item needs a treatment_id');
    }
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

  // Idempotency:
  // - For purchase-based: dedupe on purchase_id + status='issued'.
  // - For standalone: dedupe on idempotency_key (if provided) + status='issued'.
  if (purchaseId) {
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
  } else if (idempotency_key) {
    const existingSnap = await orgRef
      .collection('invoices')
      .where('idempotency_key', '==', idempotency_key)
      .where('status', '==', 'issued')
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0];
      return { invoice: { id: existing.id, ...existing.data() }, reused: true };
    }
  }

  // ── Read-only phase ────────────────────────────────────────────
  // Common: business info + org doc.
  const [businessInfoSnap, orgSnap] = await Promise.all([
    orgRef.collection('config').doc('businessInfo').get(),
    orgRef.get(),
  ]);
  const businessInfo = businessInfoSnap.exists ? businessInfoSnap.data() ?? {} : {};
  const org = orgSnap.exists ? orgSnap.data() ?? {} : {};

  let resolvedClientId: string;
  let lineItems: any[];
  let subtotalCents: number;
  const taxRate = Number(businessInfo.tax_rate ?? 0);

  if (purchaseId) {
    // Package-based invoice (existing flow).
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
    resolvedClientId = purchase.client_id;

    const pkgSnap = purchase.package_id
      ? await orgRef.collection('packages').doc(purchase.package_id).get()
      : null;
    const pkgData = pkgSnap && pkgSnap.exists ? pkgSnap.data() ?? {} : {};

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
    subtotalCents = unitPriceCents * quantity;

    lineItems = [
      {
        type: 'package',
        name: (pkgData.name as string) ?? 'Package',
        description: (pkgData.description as string) ?? '',
        package_id: purchase.package_id ?? null,
        treatments,
        bundled_products: Array.isArray(purchase.product_snapshot)
          ? (purchase.product_snapshot as any[])
              .filter((p) => p?.product_id)
              .map((p): BundledProductLine => ({
                product_id: p.product_id,
                name: p.product_name || 'Product',
                quantity: Number(p.quantity ?? 1),
                unit_price_cents: Math.round(Number(p.price ?? 0) * 100),
              }))
          : [],
        quantity,
        unit_price_cents: unitPriceCents,
        subtotal_cents: subtotalCents,
      },
    ];
  } else {
    // Standalone invoice — no purchase doc. Mix of products + treatments.
    resolvedClientId = clientId!;

    const totalItemCount = productItems.length + treatmentItemsInput.length;
    const singleLineNote = totalItemCount === 1 ? notes : undefined;

    // Resolve products + treatments in parallel.
    const productIds = Array.from(new Set(productItems.map(p => p.product_id)));
    const treatmentIds = Array.from(new Set(treatmentItemsInput.map(t => t.treatment_id)));

    const [productSnaps, treatmentSnaps] = await Promise.all([
      Promise.all(productIds.map(pid => orgRef.collection('products').doc(pid).get())),
      Promise.all(treatmentIds.map(tid => orgRef.collection('treatments').doc(tid).get())),
    ]);

    const productMap = new Map<string, any>();
    productSnaps.forEach(snap => {
      if (snap.exists) productMap.set(snap.id, snap.data());
    });
    const treatmentMap = new Map<string, any>();
    treatmentSnaps.forEach(snap => {
      if (snap.exists) treatmentMap.set(snap.id, snap.data());
    });

    const productLines = productItems.map((item) => {
      const product = productMap.get(item.product_id);
      if (!product) {
        throw new HttpsError('not-found', `Product ${item.product_id} not found`);
      }
      const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitPrice = Number(item.unit_price ?? product.price ?? 0);
      const unitPriceCents = Math.round(unitPrice * 100);
      const lineSubtotal = unitPriceCents * qty;
      return {
        type: 'product' as const,
        name: item.name || product.name || 'Product',
        description: singleLineNote ?? (product.description || ''),
        product_id: item.product_id,
        package_id: null,
        quantity: qty,
        unit_price_cents: unitPriceCents,
        subtotal_cents: lineSubtotal,
      };
    });

    const treatmentLines = treatmentItemsInput.map((item) => {
      const treatment = treatmentMap.get(item.treatment_id);
      if (!treatment) {
        throw new HttpsError('not-found', `Treatment ${item.treatment_id} not found`);
      }
      const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitPrice = Number(item.unit_price ?? treatment.price ?? 0);
      const unitPriceCents = Math.round(unitPrice * 100);
      const lineSubtotal = unitPriceCents * qty;
      return {
        type: 'treatment' as const,
        name: item.name || treatment.name || 'Treatment',
        description: singleLineNote ?? (treatment.description || ''),
        treatment_id: item.treatment_id,
        package_id: null,
        quantity: qty,
        unit_price_cents: unitPriceCents,
        subtotal_cents: lineSubtotal,
      };
    });

    lineItems = [...treatmentLines, ...productLines];
    subtotalCents = lineItems.reduce((sum, li) => sum + Number(li.subtotal_cents || 0), 0);
  }

  const taxAmountCents = Math.round((subtotalCents * taxRate) / 100);
  const totalCents = subtotalCents + taxAmountCents;

  // Resolve client snapshot.
  const clientSnap = await orgRef.collection('clients').doc(resolvedClientId).get();
  if (!clientSnap.exists) {
    throw new HttpsError('not-found', 'Client not found');
  }
  const client = clientSnap.data()!;

  const clientSnapshot: ClientSnapshot = {
    name: (client.name as string) ?? '',
    email: (client.email as string) ?? '',
    phone: (client.phone as string) ?? '',
    address: (client.address as string) ?? '',
  };

  const businessSnapshot: BusinessSnapshot = {
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
  };

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
      purchase_id: purchaseId ?? null,
      idempotency_key: idempotency_key ?? null,
      client_id: resolvedClientId,
      client_snapshot: clientSnapshot,
      business_snapshot: businessSnapshot,
      line_items: lineItems,
      subtotal_cents: subtotalCents,
      tax_rate: taxRate,
      tax_amount_cents: taxAmountCents,
      total_cents: totalCents,
      currency,
      pdf_url: null,
      pdf_storage_path: null,
      status: 'issued',
      payment_method: payment_method ?? '',
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
