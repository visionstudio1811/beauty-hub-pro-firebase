import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, getOrgLanguage, isAppLanguage, makeT } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Staff-facing HttpsError messages — the CRM (CreateInvoiceDialog) shows
// err.message verbatim in a toast, so they follow the caller's language.
// Error codes and the English wording are unchanged; pure developer errors
// (malformed payloads such as a missing organizationId) stay English.
const STRINGS = defineStrings({
  en: {
    err_client_required: 'clientId is required for standalone invoices',
    err_items_required: 'At least one product, treatment, or add-on line item is required for standalone invoices',
    err_user_not_found: 'User not found',
    err_org_mismatch: 'Organization mismatch',
    err_admin_required: 'Admin access required',
    err_purchase_not_found: 'Purchase not found',
    err_purchase_wrong_org: 'Purchase does not belong to this organization',
    err_purchase_no_client: 'Purchase has no client',
    err_product_not_found: 'Product {{id}} not found',
    err_treatment_not_found: 'Treatment {{id}} not found',
    err_addon_not_found: 'Add-on {{id}} not found',
    err_product_price: 'Invalid unit price for product line "{{name}}"',
    err_treatment_price: 'Invalid unit price for treatment line "{{name}}"',
    err_addon_price: 'Invalid unit price for add-on line "{{name}}"',
    err_totals_invalid: 'Computed invoice totals are invalid',
    err_client_not_found: 'Client not found',
    err_insufficient_credit: 'Club credit balance ({{balance}}) is lower than the invoice total ({{total}})',
    err_credit_zero_total: 'Club credit cannot be used for a zero-amount invoice',
  },
  he: {
    err_client_required: 'יש לבחור לקוח עבור חשבונית עצמאית',
    err_items_required: 'חשבונית עצמאית חייבת לכלול לפחות שורה אחת של מוצר, טיפול או תוסף',
    err_user_not_found: 'המשתמש לא נמצא',
    err_org_mismatch: 'אי-התאמה בין הארגונים',
    err_admin_required: 'נדרשת הרשאת מנהל',
    err_purchase_not_found: 'הרכישה לא נמצאה',
    err_purchase_wrong_org: 'הרכישה אינה שייכת לארגון זה',
    err_purchase_no_client: 'לרכישה לא משויך לקוח',
    err_product_not_found: 'המוצר {{id}} לא נמצא',
    err_treatment_not_found: 'הטיפול {{id}} לא נמצא',
    err_addon_not_found: 'התוסף {{id}} לא נמצא',
    err_product_price: 'מחיר יחידה לא תקין בשורת המוצר "{{name}}"',
    err_treatment_price: 'מחיר יחידה לא תקין בשורת הטיפול "{{name}}"',
    err_addon_price: 'מחיר יחידה לא תקין בשורת התוסף "{{name}}"',
    err_totals_invalid: 'סכומי החשבונית שחושבו אינם תקינים',
    err_client_not_found: 'הלקוח לא נמצא',
    err_insufficient_credit: 'יתרת קרדיט המועדון ({{balance}}) נמוכה מסכום החשבונית ({{total}})',
    err_credit_zero_total: 'לא ניתן להשתמש בקרדיט המועדון לחשבונית בסכום אפס',
  },
});


/**
 * Caller (staff) language from the already-loaded users/{uid} doc: their own
 * preference → their OWN org's default → en. Uses userData.organizationId (the
 * verified identity), never the caller-supplied organizationId, so no other
 * tenant's org doc is read before the membership check, and users/{uid} is
 * read exactly once per invocation.
 */
async function callerLanguage(userData: FirebaseFirestore.DocumentData | undefined): Promise<AppLanguage> {
  if (isAppLanguage(userData?.language)) return userData!.language as AppLanguage;
  const ownOrg = userData?.organizationId;
  return typeof ownOrg === 'string' && ownOrg ? getOrgLanguage(ownOrg) : DEFAULT_LANGUAGE;
}

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

interface AddonItemInput {
  addon_id: string;
  quantity?: number;
  unit_price?: number;
  name?: string;
}

interface CreateInvoiceRequest {
  organizationId: string;
  // Either provide purchaseId (package-based invoice) OR clientId + at least
  // one item (product, treatment, or add-on) for a standalone invoice.
  purchaseId?: string | null;
  clientId?: string | null;
  product_items?: ProductItemInput[];
  treatment_items?: TreatmentItemInput[];
  addon_items?: AddonItemInput[];
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
  const addonItemsInput = Array.isArray(data.addon_items) ? data.addon_items : [];

  if (!organizationId) {
    throw new HttpsError('invalid-argument', 'organizationId is required');
  }

  // Caller lookup first: the language derives from it (user preference →
  // caller's own org default → en), so the caller-supplied organizationId is
  // never read before the membership check below. Read-only otherwise.
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const userData = userDoc.data();
  const t = makeT(STRINGS, await callerLanguage(userData));

  const isStandalone = !purchaseId;
  if (isStandalone) {
    if (!clientId) {
      throw new HttpsError('invalid-argument', t('err_client_required'));
    }
    if (productItems.length === 0 && treatmentItemsInput.length === 0 && addonItemsInput.length === 0) {
      throw new HttpsError('invalid-argument', t('err_items_required'));
    }
    if (productItems.some(p => !p.product_id)) {
      throw new HttpsError('invalid-argument', 'Every product line item needs a product_id');
    }
    if (treatmentItemsInput.some(t => !t.treatment_id)) {
      throw new HttpsError('invalid-argument', 'Every treatment line item needs a treatment_id');
    }
    if (addonItemsInput.some(a => !a.addon_id)) {
      throw new HttpsError('invalid-argument', 'Every add-on line item needs an addon_id');
    }
  }

  // Caller must be an admin of this org.
  if (!userDoc.exists || !userData) {
    throw new HttpsError('permission-denied', t('err_user_not_found'));
  }
  if (userData.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', t('err_org_mismatch'));
  }
  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', t('err_admin_required'));
  }

  await consumeRateLimit(organizationId, 'generateInvoice', 100);

  const orgRef = db.collection('organizations').doc(organizationId);

  // Idempotency:
  // - For purchase-based: dedupe on purchase_id + status='issued'.
  // - For standalone: dedupe on idempotency_key (if provided) + status='issued'.
  // These are equality-only filters, so no composite index is required. The same
  // query is re-run INSIDE the issuing transaction (via tx.get) as the
  // authoritative guard against concurrent double-issues; the check here is just
  // a cheap early-out so we can skip the expensive read/build phase on retries.
  const dedupQuery = purchaseId
    ? orgRef
        .collection('invoices')
        .where('purchase_id', '==', purchaseId)
        .where('status', '==', 'issued')
        .limit(1)
    : idempotency_key
      ? orgRef
          .collection('invoices')
          .where('idempotency_key', '==', idempotency_key)
          .where('status', '==', 'issued')
          .limit(1)
      : null;

  if (dedupQuery) {
    const existingSnap = await dedupQuery.get();
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
      throw new HttpsError('not-found', t('err_purchase_not_found'));
    }
    const purchase = purchaseSnap.data()!;

    if (purchase.organization_id && purchase.organization_id !== organizationId) {
      throw new HttpsError('permission-denied', t('err_purchase_wrong_org'));
    }
    if (!purchase.client_id) {
      throw new HttpsError('failed-precondition', t('err_purchase_no_client'));
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

    const totalItemCount = productItems.length + treatmentItemsInput.length + addonItemsInput.length;
    const singleLineNote = totalItemCount === 1 ? notes : undefined;

    // Resolve products + treatments + add-ons in parallel.
    const productIds = Array.from(new Set(productItems.map(p => p.product_id)));
    const treatmentIds = Array.from(new Set(treatmentItemsInput.map(t => t.treatment_id)));
    const addonIds = Array.from(new Set(addonItemsInput.map(a => a.addon_id)));

    const [productSnaps, treatmentSnaps, addonSnaps] = await Promise.all([
      Promise.all(productIds.map(pid => orgRef.collection('products').doc(pid).get())),
      Promise.all(treatmentIds.map(tid => orgRef.collection('treatments').doc(tid).get())),
      Promise.all(addonIds.map(aid => orgRef.collection('addons').doc(aid).get())),
    ]);

    const productMap = new Map<string, any>();
    productSnaps.forEach(snap => {
      if (snap.exists) productMap.set(snap.id, snap.data());
    });
    const treatmentMap = new Map<string, any>();
    treatmentSnaps.forEach(snap => {
      if (snap.exists) treatmentMap.set(snap.id, snap.data());
    });
    const addonMap = new Map<string, any>();
    addonSnaps.forEach(snap => {
      if (snap.exists) addonMap.set(snap.id, snap.data());
    });

    const productLines = productItems.map((item) => {
      const product = productMap.get(item.product_id);
      if (!product) {
        throw new HttpsError('not-found', t('err_product_not_found', { id: item.product_id }));
      }
      const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitPrice = Number(item.unit_price ?? product.price ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new HttpsError('invalid-argument', t('err_product_price', { name: item.name || product.name || item.product_id }));
      }
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
        throw new HttpsError('not-found', t('err_treatment_not_found', { id: item.treatment_id }));
      }
      const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitPrice = Number(item.unit_price ?? treatment.price ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new HttpsError('invalid-argument', t('err_treatment_price', { name: item.name || treatment.name || item.treatment_id }));
      }
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

    const addonLines = addonItemsInput.map((item) => {
      const addon = addonMap.get(item.addon_id);
      if (!addon) {
        throw new HttpsError('not-found', t('err_addon_not_found', { id: item.addon_id }));
      }
      const qty = Math.max(1, Math.floor(Number(item.quantity ?? 1)));
      const unitPrice = Number(item.unit_price ?? addon.price ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new HttpsError('invalid-argument', t('err_addon_price', { name: item.name || addon.name || item.addon_id }));
      }
      const unitPriceCents = Math.round(unitPrice * 100);
      const lineSubtotal = unitPriceCents * qty;
      return {
        type: 'addon' as const,
        name: item.name || addon.name || 'Add-on',
        description: singleLineNote ?? (addon.description || ''),
        addon_id: item.addon_id,
        package_id: null,
        quantity: qty,
        unit_price_cents: unitPriceCents,
        subtotal_cents: lineSubtotal,
      };
    });

    lineItems = [...treatmentLines, ...addonLines, ...productLines];
    subtotalCents = lineItems.reduce((sum, li) => sum + Number(li.subtotal_cents || 0), 0);
  }

  const taxAmountCents = Math.round((subtotalCents * taxRate) / 100);
  const totalCents = subtotalCents + taxAmountCents;

  // Guard the immutable invoice against non-finite or negative monetary totals
  // (e.g. a bad unit price or tax rate slipping through).
  if (
    !Number.isFinite(subtotalCents) || subtotalCents < 0 ||
    !Number.isFinite(taxAmountCents) || taxAmountCents < 0 ||
    !Number.isFinite(totalCents) || totalCents < 0
  ) {
    throw new HttpsError('invalid-argument', t('err_totals_invalid'));
  }

  // Resolve client snapshot.
  const clientSnap = await orgRef.collection('clients').doc(resolvedClientId).get();
  if (!clientSnap.exists) {
    throw new HttpsError('not-found', t('err_client_not_found'));
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
    logo_url: (org.logo_url as string) ?? '',
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

  const payClubCredit = payment_method === 'club_credit';
  if (payClubCredit && totalCents <= 0) {
    throw new HttpsError('failed-precondition', t('err_credit_zero_total'));
  }
  const clientRef = orgRef.collection('clients').doc(resolvedClientId);
  const creditEntryRef = orgRef.collection('creditLedger').doc(`invoice_${invoiceRef.id}`);

  // Atomic: authoritative dedup check + read/increment counter + write the
  // invoice together. Firestore requires all reads before writes in a
  // transaction, so we run the dedup query and the counter read first, then the
  // writes. The dedup tx.get is what actually stops two concurrent calls
  // (double-click / retry) from each claiming a distinct sequential number and
  // producing two immutable issued invoices for one purchase. If it finds an
  // existing issued invoice we bail out without touching the counter.
  const txResult = await db.runTransaction(async (tx) => {
    if (dedupQuery) {
      const existingSnap = await tx.get(dedupQuery);
      if (!existingSnap.empty) {
        const existing = existingSnap.docs[0];
        return {
          reused: true as const,
          existing: { id: existing.id, ...existing.data() },
        };
      }
    }

    const counterSnap = await tx.get(counterRef);
    const next = counterSnap.exists
      ? Number((counterSnap.data() as any).next_number ?? 1)
      : 1;

    // Club credit: read the live balance inside the transaction so two concurrent
    // invoices can't both spend the same credit. Reads must precede writes.
    let creditBalanceAfter: number | null = null;
    let creditCurrency = currency;
    if (payClubCredit) {
      const [creditClientSnap, creditEntrySnap] = await Promise.all([tx.get(clientRef), tx.get(creditEntryRef)]);
      if (creditEntrySnap.exists) {
        throw new HttpsError('failed-precondition', t('err_totals_invalid'));
      }
      const balance = Number(creditClientSnap.data()?.club_credit_balance ?? 0);
      const totalMajor = totalCents / 100;
      if (Math.round(balance * 100) < totalCents) {
        throw new HttpsError('failed-precondition', t('err_insufficient_credit', {
          balance: balance.toFixed(2),
          total: totalMajor.toFixed(2),
        }));
      }
      creditBalanceAfter = Math.round((balance - totalMajor) * 100) / 100;
      creditCurrency = String(creditClientSnap.data()?.club_credit_currency || currency);
    }

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
      club_credit_applied_cents: payClubCredit ? totalCents : 0,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      created_by: request.auth!.uid,
    });

    if (payClubCredit && creditBalanceAfter !== null) {
      tx.set(creditEntryRef, {
        organization_id: organizationId,
        client_id: resolvedClientId,
        membership_id: null,
        type: 'credit_spend',
        amount: -(totalCents / 100),
        balance_after: creditBalanceAfter,
        currency: creditCurrency,
        description: `Invoice ${invoiceNumber}`,
        ref_type: 'invoice',
        ref_id: invoiceRef.id,
        created_by: request.auth!.uid,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(clientRef, {
        club_credit_balance: creditBalanceAfter,
        club_credit_currency: creditCurrency,
        club_credit_updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { reused: false as const, next };
  });

  // A concurrent call already issued this invoice — return the existing one with
  // the exact same shape as the pre-transaction early-out.
  if (txResult.reused) {
    return { invoice: txResult.existing, reused: true };
  }

  // Re-read so the returned doc has resolved serverTimestamps for `created_at`.
  const written = await invoiceRef.get();
  return {
    invoice: { id: invoiceRef.id, ...written.data() },
    reused: false,
    invoiceNumberInt: txResult.next,
  };
});
