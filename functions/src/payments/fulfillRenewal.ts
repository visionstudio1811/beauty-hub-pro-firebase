import * as admin from 'firebase-admin';
import type { PaymentProvider } from './settings';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export interface FulfillPayment {
  provider: PaymentProvider;
  payment_id: string;
  amount: number;
  currency: string;
}

export interface FulfillResult {
  alreadyDone: boolean;
  purchaseId: string | null;
}

interface SessionSlot {
  treatment_id: string;
  remaining: number;
  total: number;
}

interface ProductSnapshotItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

function todayInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function computeSessionSlots(pkg: admin.firestore.DocumentData): { sessions_remaining: number; sessions_by_treatment: SessionSlot[] } {
  const items = Array.isArray(pkg.treatment_items) ? pkg.treatment_items : [];
  const slots: SessionSlot[] = [];
  for (const item of items) {
    const treatmentId = typeof item?.treatment_id === 'string' ? item.treatment_id : '';
    const qty = Math.max(0, Math.floor(Number(item?.quantity ?? 0)));
    if (!treatmentId || qty <= 0) continue;
    const existing = slots.find((s) => s.treatment_id === treatmentId);
    if (existing) {
      existing.remaining += qty;
      existing.total += qty;
    } else {
      slots.push({ treatment_id: treatmentId, remaining: qty, total: qty });
    }
  }
  if (slots.length === 0) {
    return { sessions_remaining: Math.max(0, Math.floor(Number(pkg.total_sessions ?? 0))), sessions_by_treatment: [] };
  }
  return { sessions_remaining: slots.reduce((sum, s) => sum + s.remaining, 0), sessions_by_treatment: slots };
}

async function buildProductSnapshot(
  orgRef: admin.firestore.DocumentReference,
  pkg: admin.firestore.DocumentData,
): Promise<ProductSnapshotItem[]> {
  const items = Array.isArray(pkg.product_items) ? pkg.product_items : [];
  const valid = items.filter((i) => typeof i?.product_id === 'string' && i.product_id);
  if (valid.length === 0) return [];
  const ids = Array.from(new Set(valid.map((i) => i.product_id as string)));
  const snaps = await Promise.all(ids.map((id) => orgRef.collection('products').doc(id).get()));
  const names = new Map<string, string>();
  snaps.forEach((s) => {
    if (s.exists && typeof s.data()?.name === 'string') names.set(s.id, s.data()!.name as string);
  });
  return valid.map((i) => ({
    product_id: i.product_id as string,
    product_name: names.get(i.product_id as string) ?? (i.product_id as string),
    quantity: Math.max(1, Math.floor(Number(i.quantity ?? 1))),
    price: Number(i.price ?? 0),
  }));
}

export async function fulfillRenewal(
  orgId: string,
  renewalRequestId: string,
  payment: FulfillPayment,
): Promise<FulfillResult> {
  const orgRef = db.collection('organizations').doc(orgId);
  const requestRef = orgRef.collection('renewalRequests').doc(renewalRequestId);

  const [orgSnap, preSnap] = await Promise.all([orgRef.get(), requestRef.get()]);
  if (!preSnap.exists) throw new Error(`Renewal request ${renewalRequestId} not found`);
  const pre = preSnap.data()!;
  if (pre.status === 'paid') return { alreadyDone: true, purchaseId: (pre.new_purchase_id as string) ?? null };

  const packageId = typeof pre.package_id === 'string' ? pre.package_id : '';
  if (!packageId) throw new Error(`Renewal request ${renewalRequestId} has no package_id`);
  const packageRef = orgRef.collection('packages').doc(packageId);
  const prePkgSnap = await packageRef.get();
  if (!prePkgSnap.exists) throw new Error(`Package ${packageId} not found for renewal ${renewalRequestId}`);
  const productSnapshot = await buildProductSnapshot(orgRef, prePkgSnap.data()!);

  const timezone = (orgSnap.data()?.timezone as string | undefined) || 'UTC';
  const purchaseRef = orgRef.collection('purchases').doc();

  return db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(requestRef);
    if (!reqSnap.exists) throw new Error(`Renewal request ${renewalRequestId} not found`);
    const req = reqSnap.data()!;
    if (req.status === 'paid') return { alreadyDone: true, purchaseId: (req.new_purchase_id as string) ?? null };

    const clientId = typeof req.client_id === 'string' ? req.client_id : '';
    if (!clientId) throw new Error(`Renewal request ${renewalRequestId} has no client_id`);
    const clientRef = orgRef.collection('clients').doc(clientId);

    const [pkgSnap, clientSnap] = await Promise.all([tx.get(packageRef), tx.get(clientRef)]);
    if (!pkgSnap.exists) throw new Error(`Package ${packageId} not found for renewal ${renewalRequestId}`);
    const pkg = pkgSnap.data()!;

    const { sessions_remaining, sessions_by_treatment } = computeSessionSlots(pkg);
    const validityMonths = Math.max(0, Math.floor(Number(pkg.validity_months ?? 0)));
    const purchaseDate = todayInTimezone(timezone);
    const expiryDate = addMonths(purchaseDate, validityMonths);
    const paidAmount = Number.isFinite(payment.amount) && payment.amount > 0
      ? payment.amount / 100
      : Number(req.package_price ?? pkg.price ?? 0);
    const now = new Date().toISOString();
    const serverNow = admin.firestore.FieldValue.serverTimestamp();

    tx.set(purchaseRef, {
      client_id: clientId,
      package_id: packageId,
      organization_id: orgId,
      total_amount: paidAmount,
      sessions_remaining,
      sessions_by_treatment,
      expiry_date: expiryDate,
      payment_status: sessions_remaining > 0 ? 'active' : 'completed',
      purchase_date: purchaseDate,
      ...(productSnapshot.length > 0 ? { product_snapshot: productSnapshot } : {}),
      created_at: now,
      created_at_ts: serverNow,
      source: 'client_portal_renewal',
      renewal_request_id: renewalRequestId,
      payment_provider: payment.provider,
      payment_id: payment.payment_id,
    });

    tx.update(requestRef, {
      status: 'paid',
      paid_at: serverNow,
      payment: {
        provider: payment.provider,
        payment_id: payment.payment_id,
        amount: payment.amount,
        currency: (payment.currency || (req.currency as string) || '').toUpperCase(),
      },
      new_purchase_id: purchaseRef.id,
      updated_at: serverNow,
    });

    if (clientSnap.exists) {
      tx.update(clientRef, { has_membership: true, updated_at: serverNow });
    }

    return { alreadyDone: false, purchaseId: purchaseRef.id };
  });
}

export async function markRenewalRequestIfPending(
  orgId: string,
  renewalRequestId: string,
  status: 'payment_failed' | 'cancelled',
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const ref = db.collection('organizations').doc(orgId).collection('renewalRequests').doc(renewalRequestId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.status !== 'pending_payment') return false;
    tx.update(ref, { status, ...extra, updated_at: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
}
