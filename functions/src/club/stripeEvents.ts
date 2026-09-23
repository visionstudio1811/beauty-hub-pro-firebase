import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { defineStrings, getOrgLanguage, makeT } from '../lib/i18n';
import { stripeClient } from '../payments/stripe';
import { applyCreditEntry, round2, setClientMembershipCache, ClubMembershipStatus, CLUB_CREDIT_EXPIRY_MS } from './ledger';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const STRINGS = defineStrings({
  en: {
    credit_full: 'Monthly club credit — {{plan}}',
    credit_partial: 'Partial club credit — {{plan}}',
  },
  he: {
    credit_full: 'זיכוי מועדון חודשי — {{plan}}',
    credit_partial: 'זיכוי מועדון חלקי — {{plan}}',
  },
});

type MembershipStatus = 'incomplete' | ClubMembershipStatus;
type Metadata = Record<string, string>;
type EventResult = Record<string, unknown>;

interface MembershipDoc {
  ref: admin.firestore.DocumentReference;
  data: admin.firestore.DocumentData;
}

function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id;
  return null;
}

function readNumber(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object') return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readMetadata(v: unknown): Metadata {
  if (!v || typeof v !== 'object') return {};
  const out: Metadata = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

function tsFromSeconds(sec: number | null | undefined): admin.firestore.Timestamp | null {
  return typeof sec === 'number' && Number.isFinite(sec) && sec > 0 ? admin.firestore.Timestamp.fromMillis(sec * 1000) : null;
}

function membershipsRef(orgId: string) {
  return db.collection('organizations').doc(orgId).collection('memberships');
}

function isClubMetadata(meta: Metadata): boolean {
  return meta.kind === 'club_membership';
}

async function findMembership(orgId: string, subscriptionId: string | null, meta: Metadata): Promise<MembershipDoc | null> {
  if (subscriptionId) {
    const snap = await membershipsRef(orgId).where('stripe_subscription_id', '==', subscriptionId).limit(1).get();
    if (!snap.empty) return { ref: snap.docs[0].ref, data: snap.docs[0].data() };
  }
  const membershipId = meta.membershipId?.trim();
  if (isClubMetadata(meta) && membershipId && (!meta.organizationId || meta.organizationId === orgId)) {
    const snap = await membershipsRef(orgId).doc(membershipId).get();
    if (snap.exists) return { ref: snap.ref, data: snap.data()! };
  }
  return null;
}

function notClubOr(meta: Metadata, result: EventResult): EventResult | null {
  return isClubMetadata(meta) ? result : null;
}

function mapSubscriptionStatus(status: string): MembershipStatus | null {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    case 'incomplete':
      return 'incomplete';
    default:
      return null;
  }
}

// API versions before 2025-03 kept the period on the subscription; newer ones keep it per item.
function subscriptionPeriod(sub: Stripe.Subscription): { start: number | null; end: number | null } {
  let start = readNumber(sub, 'current_period_start');
  let end = readNumber(sub, 'current_period_end');
  for (const item of sub.items?.data ?? []) {
    const s = readNumber(item, 'current_period_start');
    const e = readNumber(item, 'current_period_end');
    if (s !== null && start === null) start = s;
    else if (s !== null && start !== null) start = Math.min(start, s);
    if (e !== null && end === null) end = e;
    else if (e !== null && end !== null) end = Math.max(end, e);
  }
  return { start, end };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = idOf(invoice.parent?.subscription_details?.subscription);
  if (fromParent) return fromParent;
  const legacy = idOf((invoice as unknown as Record<string, unknown>).subscription);
  if (legacy) return legacy;
  for (const line of invoice.lines?.data ?? []) {
    const fromLine = idOf(line.subscription) ?? idOf(line.parent?.subscription_item_details?.subscription);
    if (fromLine) return fromLine;
  }
  return null;
}

function invoiceSubscriptionMetadata(invoice: Stripe.Invoice): Metadata {
  const fromParent = readMetadata(invoice.parent?.subscription_details?.metadata);
  if (Object.keys(fromParent).length) return fromParent;
  const legacyDetails = (invoice as unknown as { subscription_details?: { metadata?: unknown } }).subscription_details;
  const legacy = readMetadata(legacyDetails?.metadata);
  if (Object.keys(legacy).length) return legacy;
  for (const line of invoice.lines?.data ?? []) {
    const fromLine = readMetadata(line.metadata);
    if (isClubMetadata(fromLine)) return fromLine;
  }
  return {};
}

function invoicePeriod(invoice: Stripe.Invoice): { start: number | null; end: number | null } {
  let start: number | null = null;
  let end: number | null = null;
  for (const line of invoice.lines?.data ?? []) {
    const s = readNumber(line.period, 'start');
    const e = readNumber(line.period, 'end');
    if (s !== null) start = start === null ? s : Math.min(start, s);
    if (e !== null) end = end === null ? e : Math.max(end, e);
  }
  return { start, end };
}

function isStale(membership: MembershipDoc, eventCreated: number): boolean {
  const last = membership.data.stripe_last_event_at;
  return typeof last === 'number' && eventCreated < last;
}

function hadStarted(data: admin.firestore.DocumentData): boolean {
  return Boolean(data.started_at) || data.status === 'active' || data.status === 'past_due';
}

async function syncFromSubscription(
  orgId: string,
  membership: MembershipDoc,
  sub: Stripe.Subscription,
  eventCreated: number,
): Promise<MembershipStatus | null> {
  // Stripe does not guarantee delivery order; an older subscription snapshot must never overwrite a newer one.
  if (isStale(membership, eventCreated)) return null;

  const mapped = mapSubscriptionStatus(sub.status);
  const period = subscriptionPeriod(sub);
  const serverNow = admin.firestore.FieldValue.serverTimestamp();
  const update: admin.firestore.DocumentData = {
    stripe_subscription_id: sub.id,
    stripe_customer_id: idOf(sub.customer) ?? membership.data.stripe_customer_id ?? null,
    cancel_at_period_end: sub.cancel_at_period_end === true,
    current_period_start: tsFromSeconds(period.start) ?? membership.data.current_period_start ?? null,
    current_period_end: tsFromSeconds(period.end) ?? membership.data.current_period_end ?? null,
    stripe_last_event_at: eventCreated,
    updated_at: serverNow,
  };
  if (mapped) update.status = mapped;
  if (mapped === 'active' && !membership.data.started_at) update.started_at = tsFromSeconds(sub.start_date) ?? serverNow;
  if (mapped === 'cancelled') {
    if (!membership.data.cancelled_at) update.cancelled_at = tsFromSeconds(sub.ended_at ?? sub.canceled_at) ?? serverNow;
    if (!membership.data.credit_expires_at && hadStarted(membership.data)) {
      update.credit_expires_at = admin.firestore.Timestamp.fromMillis(Date.now() + CLUB_CREDIT_EXPIRY_MS);
      update.credit_expired = false;
    }
  }
  await membership.ref.set(update, { merge: true });

  const clientId = typeof membership.data.client_id === 'string' ? membership.data.client_id : '';
  if (clientId && mapped && mapped !== 'incomplete') {
    await setClientMembershipCache(orgId, clientId, membership.ref.id, mapped, membership.data.currency);
  }
  return mapped;
}

async function handleCheckoutCompleted(
  orgId: string,
  session: Stripe.Checkout.Session,
  eventCreated: number,
  secretKey: string,
): Promise<EventResult | null> {
  const meta = readMetadata(session.metadata);
  if (session.mode !== 'subscription' || !isClubMetadata(meta)) return null;
  if (meta.organizationId && meta.organizationId !== orgId) return { handled: false, reason: 'org_mismatch' };

  const membershipId = (session.client_reference_id ?? meta.membershipId ?? '').trim();
  if (!membershipId) return { handled: false, reason: 'no_membership_id' };
  const ref = membershipsRef(orgId).doc(membershipId);
  const snap = await ref.get();
  if (!snap.exists) return { handled: false, reason: 'membership_not_found' };

  const customerId = idOf(session.customer);
  const subscriptionId = idOf(session.subscription);
  const link: admin.firestore.DocumentData = { updated_at: admin.firestore.FieldValue.serverTimestamp() };
  if (customerId) link.stripe_customer_id = customerId;
  if (subscriptionId) link.stripe_subscription_id = subscriptionId;
  await ref.set(link, { merge: true });
  if (!subscriptionId) return { handled: true, membershipId, status: snap.data()?.status, reason: 'no_subscription_on_session' };

  const sub = await stripeClient(secretKey).subscriptions.retrieve(subscriptionId);
  const status = await syncFromSubscription(orgId, { ref, data: { ...snap.data()!, ...link } }, sub, eventCreated);
  return { handled: true, membershipId, status: status ?? snap.data()?.status };
}

async function handleInvoicePaid(orgId: string, invoice: Stripe.Invoice): Promise<EventResult | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const meta = invoiceSubscriptionMetadata(invoice);
  if (!subscriptionId && !isClubMetadata(meta)) return null;
  const membership = await findMembership(orgId, subscriptionId, meta);
  if (!membership) return notClubOr(meta, { handled: false, reason: 'membership_not_found' });

  const data = membership.data;
  const clientId = typeof data.client_id === 'string' ? data.client_id : '';
  if (!clientId) return { handled: false, reason: 'membership_without_client' };

  const planId = typeof data.plan_id === 'string' ? data.plan_id : '';
  const planSnap = planId
    ? await db.collection('organizations').doc(orgId).collection('membershipPlans').doc(planId).get()
    : null;
  const plan = planSnap?.exists ? planSnap.data() : undefined;
  const monthlyCredit = round2(Number(plan?.monthly_credit ?? data.monthly_credit ?? 0));
  const priceMinor = Math.round(Number(data.price) * 100);
  const amountPaid = Number(invoice.amount_paid ?? 0);
  let credit = 0;
  if (monthlyCredit > 0 && amountPaid > 0) {
    credit = priceMinor > 0 && amountPaid < priceMinor ? round2((monthlyCredit * amountPaid) / priceMinor) : monthlyCredit;
  }
  const currency = String(invoice.currency || data.currency || 'USD').toUpperCase();
  const planName = String(data.plan_name || plan?.name || planId);

  let ledger: { applied: boolean; balance_after: number | null } = { applied: false, balance_after: null };
  if (credit > 0) {
    const t = makeT(STRINGS, await getOrgLanguage(orgId));
    ledger = await applyCreditEntry(orgId, {
      entryId: `stripe_invoice_${invoice.id}`,
      client_id: clientId,
      membership_id: membership.ref.id,
      type: 'credit_add',
      amount: credit,
      currency,
      description: t(credit < monthlyCredit ? 'credit_partial' : 'credit_full', { plan: planName }),
      ref_type: 'stripe_invoice',
      ref_id: invoice.id,
      created_by: 'system',
    });
  }

  const period = invoicePeriod(invoice);
  const serverNow = admin.firestore.FieldValue.serverTimestamp();
  const update: admin.firestore.DocumentData = {
    stripe_subscription_id: subscriptionId ?? data.stripe_subscription_id ?? null,
    stripe_customer_id: idOf(invoice.customer) ?? data.stripe_customer_id ?? null,
    current_period_start: tsFromSeconds(period.start) ?? data.current_period_start ?? null,
    current_period_end: tsFromSeconds(period.end) ?? data.current_period_end ?? null,
    last_paid_invoice_id: invoice.id,
    updated_at: serverNow,
  };
  // A paid invoice credits the client but never resurrects a membership Stripe already ended.
  const activate = data.status !== 'cancelled';
  if (activate) {
    update.status = 'active';
    if (!data.started_at) update.started_at = tsFromSeconds(period.start) ?? serverNow;
  }
  await membership.ref.set(update, { merge: true });
  if (activate) await setClientMembershipCache(orgId, clientId, membership.ref.id, 'active', currency);

  return { handled: true, membershipId: membership.ref.id, credit, ...ledger };
}

async function handleInvoicePaymentFailed(orgId: string, invoice: Stripe.Invoice): Promise<EventResult | null> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  const meta = invoiceSubscriptionMetadata(invoice);
  if (!subscriptionId && !isClubMetadata(meta)) return null;
  const membership = await findMembership(orgId, subscriptionId, meta);
  if (!membership) return notClubOr(meta, { handled: false, reason: 'membership_not_found' });

  const status = membership.data.status;
  if (status !== 'active' && status !== 'past_due') {
    return { handled: true, membershipId: membership.ref.id, status, reason: 'status_unchanged' };
  }
  await membership.ref.set(
    { status: 'past_due', last_failed_invoice_id: invoice.id, updated_at: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
  const clientId = typeof membership.data.client_id === 'string' ? membership.data.client_id : '';
  if (clientId) await setClientMembershipCache(orgId, clientId, membership.ref.id, 'past_due', membership.data.currency);
  return { handled: true, membershipId: membership.ref.id, status: 'past_due' };
}

async function handleSubscriptionUpdated(
  orgId: string,
  sub: Stripe.Subscription,
  eventCreated: number,
): Promise<EventResult | null> {
  const meta = readMetadata(sub.metadata);
  const membership = await findMembership(orgId, sub.id, meta);
  if (!membership) return notClubOr(meta, { handled: false, reason: 'membership_not_found' });
  const status = await syncFromSubscription(orgId, membership, sub, eventCreated);
  return { handled: true, membershipId: membership.ref.id, status, stale: status === null };
}

async function handleSubscriptionDeleted(
  orgId: string,
  sub: Stripe.Subscription,
  eventCreated: number,
): Promise<EventResult | null> {
  const meta = readMetadata(sub.metadata);
  const membership = await findMembership(orgId, sub.id, meta);
  if (!membership) return notClubOr(meta, { handled: false, reason: 'membership_not_found' });
  if (isStale(membership, eventCreated)) return { handled: true, membershipId: membership.ref.id, stale: true };

  const data = membership.data;
  const period = subscriptionPeriod(sub);
  const serverNow = admin.firestore.FieldValue.serverTimestamp();
  const update: admin.firestore.DocumentData = {
    status: 'cancelled',
    cancel_at_period_end: sub.cancel_at_period_end === true,
    cancelled_at: data.cancelled_at ?? tsFromSeconds(sub.ended_at ?? sub.canceled_at) ?? serverNow,
    current_period_start: tsFromSeconds(period.start) ?? data.current_period_start ?? null,
    current_period_end: tsFromSeconds(period.end) ?? data.current_period_end ?? null,
    stripe_last_event_at: eventCreated,
    updated_at: serverNow,
  };
  if (!data.credit_expires_at && hadStarted(data)) {
    update.credit_expires_at = admin.firestore.Timestamp.fromMillis(Date.now() + CLUB_CREDIT_EXPIRY_MS);
    update.credit_expired = false;
  }
  await membership.ref.set(update, { merge: true });

  const clientId = typeof data.client_id === 'string' ? data.client_id : '';
  if (clientId) await setClientMembershipCache(orgId, clientId, membership.ref.id, 'cancelled', data.currency);
  return { handled: true, membershipId: membership.ref.id, status: 'cancelled' };
}

export async function handleClubStripeEvent(
  orgId: string,
  event: Stripe.Event,
  secretKey: string,
): Promise<Record<string, unknown> | null> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(orgId, event.data.object as Stripe.Checkout.Session, event.created, secretKey);
    case 'invoice.paid':
      return handleInvoicePaid(orgId, event.data.object as Stripe.Invoice);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(orgId, event.data.object as Stripe.Invoice);
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(orgId, event.data.object as Stripe.Subscription, event.created);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(orgId, event.data.object as Stripe.Subscription, event.created);
    default:
      return null;
  }
}
