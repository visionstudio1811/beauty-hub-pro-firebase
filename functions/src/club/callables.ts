import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { consumeRateLimit } from '../rateLimit';
import { defineStrings, makeT, getCallerLanguage, getOrgLanguage, Translator } from '../lib/i18n';
import { portalUrlForOrg } from '../lib/portalUrl';
import { assertPaymentsEnabled, loadPaymentSecrets } from '../payments/settings';
import { stripeClient, stripeErrorMessage } from '../payments/stripe';
import { applyCreditEntry, round2, setClientMembershipCache, CLUB_CREDIT_EXPIRY_MS } from './ledger';
import { ensureStripePriceForPlan, modeFromKey, planCurrency, planUnitAmount } from './plans';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_ID_LENGTH = 128;
const CHECKOUT_REUSE_MS = 60 * 60 * 1000;
const MAX_ADJUSTMENT = 10_000;
const STAFF_CANCEL_ROLES: ReadonlyArray<string> = ['admin', 'staff'];

// Portal-facing copy follows the ORG language (ClientPortal renders error.message verbatim);
// admin-facing copy follows the caller's own language.
const STRINGS = defineStrings({
  en: {
    err_field_required: '{{field}} is required',
    err_portal_not_linked: 'Client portal access has not been linked',
    err_org_not_found: 'Business not found',
    err_client_not_found: 'Client not found',
    err_client_not_active: 'This client card is not active',
    err_plan_not_found: 'This membership plan is no longer available',
    err_plan_invalid: 'This membership plan cannot be purchased online',
    err_payments_disabled: 'Online payments are not available for this business',
    err_stripe_only: 'Club membership is not available online for this business yet',
    err_already_member: 'You already have an active club membership',
    err_checkout_failed: 'We could not start the payment. Please try again or contact the front desk.',
    err_membership_not_found: 'Membership not found',
    err_membership_forbidden: 'You do not have permission to manage this membership',
    err_cancel_failed: 'We could not cancel the membership right now. Please try again or contact the front desk.',
    err_no_membership: 'No club membership was found for your account',
    err_billing_portal_unavailable: 'Billing management is not available online right now. Please contact the spa.',
    err_user_not_found: 'User not found',
    err_admin_required: 'Admin role required',
    err_org_mismatch: 'Organization mismatch',
    err_invalid_amount: 'Amount must be a non-zero number up to 10,000',
    err_invalid_reason: 'Reason must be between 3 and 300 characters',
    err_insufficient_credit: 'The client does not have enough club credit for this adjustment',
  },
  he: {
    err_field_required: 'השדה {{field}} הוא שדה חובה',
    err_portal_not_linked: 'הגישה לפורטל הלקוחות עדיין לא קושרה לכרטיס לקוח',
    err_org_not_found: 'העסק לא נמצא',
    err_client_not_found: 'הלקוח לא נמצא',
    err_client_not_active: 'כרטיס הלקוח הזה אינו פעיל',
    err_plan_not_found: 'מסלול המנוי הזה כבר אינו זמין',
    err_plan_invalid: 'לא ניתן לרכוש את מסלול המנוי הזה באופן מקוון',
    err_payments_disabled: 'תשלום מקוון אינו זמין בעסק זה',
    err_stripe_only: 'מנוי המועדון עדיין אינו זמין לרכישה מקוונת בעסק זה',
    err_already_member: 'כבר יש לך מנוי מועדון פעיל',
    err_checkout_failed: 'לא הצלחנו להתחיל את התשלום. נסו שוב או פנו לקבלה.',
    err_membership_not_found: 'המנוי לא נמצא',
    err_membership_forbidden: 'אין לך הרשאה לנהל את המנוי הזה',
    err_cancel_failed: 'לא הצלחנו לבטל את המנוי כרגע. נסו שוב או פנו לקבלה.',
    err_no_membership: 'לא נמצא מנוי מועדון בחשבון שלך',
    err_billing_portal_unavailable: 'ניהול החיוב אינו זמין כרגע באופן מקוון. אנא פנו לספא.',
    err_user_not_found: 'המשתמש לא נמצא',
    err_admin_required: 'נדרשת הרשאת מנהל',
    err_org_mismatch: 'אי-התאמה בין הארגונים',
    err_invalid_amount: 'הסכום חייב להיות מספר שונה מאפס, עד 10,000',
    err_invalid_reason: 'הסיבה חייבת להכיל בין 3 ל-300 תווים',
    err_insufficient_credit: 'ללקוח אין מספיק קרדיט מועדון עבור ההתאמה הזו',
  },
});

type T = Translator<keyof typeof STRINGS.en>;

function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_ID_LENGTH && !v.includes('/');
}

function requireId(value: unknown, field: string, t: T): string {
  if (!isSafeId(value)) throw new HttpsError('invalid-argument', t('err_field_required', { field }));
  return value.trim();
}

async function orgT(orgIdInput: unknown): Promise<T> {
  const lang = isSafeId(orgIdInput) ? await getOrgLanguage(orgIdInput.trim()) : 'en';
  return makeT(STRINGS, lang);
}

function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 254;
}

function tsToMillis(v: unknown): number | null {
  if (v instanceof admin.firestore.Timestamp) return v.toMillis();
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringField(data: admin.firestore.DocumentData | undefined, key: string): string {
  const v = data?.[key];
  return typeof v === 'string' ? v : '';
}

async function getPortalAccess(uid: string, orgId: string, t: T): Promise<{ client_id: string }> {
  const snap = await db.collection('clientPortalAccess').doc(uid).collection('organizations').doc(orgId).get();
  const clientId = snap.data()?.client_id;
  if (!snap.exists || typeof clientId !== 'string' || !clientId) {
    throw new HttpsError('permission-denied', t('err_portal_not_linked'));
  }
  return { client_id: clientId };
}

async function assertAdmin(uid: string, organizationId: unknown, t: T): Promise<string> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', t('err_user_not_found'));
  const u = userDoc.data()!;
  if (u.role !== 'admin') throw new HttpsError('permission-denied', t('err_admin_required'));
  if (!isSafeId(organizationId) || u.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', t('err_org_mismatch'));
  }
  return organizationId;
}

async function expireCheckoutSession(stripe: Stripe, sessionId: string): Promise<void> {
  try {
    await stripe.checkout.sessions.expire(sessionId);
  } catch (err) {
    console.warn(`club checkout session expire skipped for ${sessionId}:`, stripeErrorMessage(err));
  }
}

export const createMembershipCheckout = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required');
  const t = await orgT(request.data?.organizationId);
  const orgId = requireId(request.data?.organizationId, 'organizationId', t);
  const planId = requireId(request.data?.planId, 'planId', t);

  const access = await getPortalAccess(request.auth.uid, orgId, t);
  const orgRef = db.collection('organizations').doc(orgId);
  const [orgSnap, planSnap, clientSnap] = await Promise.all([
    orgRef.get(),
    orgRef.collection('membershipPlans').doc(planId).get(),
    orgRef.collection('clients').doc(access.client_id).get(),
  ]);

  if (!orgSnap.exists) throw new HttpsError('not-found', t('err_org_not_found'));
  if (!planSnap.exists || planSnap.data()?.is_active !== true) {
    throw new HttpsError('failed-precondition', t('err_plan_not_found'));
  }
  const plan = planSnap.data()!;
  if (!clientSnap.exists) throw new HttpsError('not-found', t('err_client_not_found'));
  const client = clientSnap.data()!;
  if (client.deleted_at || client.deletedAt) throw new HttpsError('permission-denied', t('err_client_not_active'));

  const unitAmount = planUnitAmount(plan);
  const currency = planCurrency(plan);
  const monthlyCredit = Number(plan.monthly_credit);
  if (unitAmount === null || currency === null || !Number.isFinite(monthlyCredit) || monthlyCredit < 0) {
    throw new HttpsError('failed-precondition', t('err_plan_invalid'));
  }

  const { config, secrets } = await assertPaymentsEnabled(orgId, t('err_payments_disabled'));
  if (config.provider !== 'stripe' || !secrets.stripe_secret_key) {
    throw new HttpsError('failed-precondition', t('err_stripe_only'));
  }
  const secretKey = secrets.stripe_secret_key;
  const mode = modeFromKey(secretKey);
  const stripe = stripeClient(secretKey);
  const serverNow = admin.firestore.FieldValue.serverTimestamp();

  const existingSnap = await orgRef.collection('memberships').where('client_id', '==', access.client_id).get();
  const existing = existingSnap.docs.map((d) => ({ id: d.id, ref: d.ref, data: d.data() }));
  if (existing.some((m) => m.data.status === 'active' || m.data.status === 'past_due')) {
    throw new HttpsError('failed-precondition', t('err_already_member'));
  }
  const now = Date.now();
  for (const m of existing) {
    if (m.data.status !== 'incomplete') continue;
    const createdAt = tsToMillis(m.data.created_at);
    const url = stringField(m.data.checkout, 'url');
    const fresh = createdAt !== null && now - createdAt < CHECKOUT_REUSE_MS;
    if (fresh && url && m.data.plan_id === planId && m.data.stripe_mode === mode) {
      return { url, membershipId: m.id };
    }
    const sessionId = stringField(m.data.checkout, 'session_id');
    if (sessionId && m.data.stripe_mode === mode) await expireCheckoutSession(stripe, sessionId);
    await m.ref.set(
      { status: 'cancelled', cancelled_at: serverNow, cancel_reason: 'checkout_abandoned', updated_at: serverNow },
      { merge: true },
    );
  }

  await consumeRateLimit(orgId, 'createMembershipCheckout', 200);

  let priceId: string;
  try {
    ({ priceId } = await ensureStripePriceForPlan(stripe, mode, orgId, planId, plan));
  } catch (err) {
    console.error(`createMembershipCheckout price sync failed (org ${orgId}, plan ${planId}):`, stripeErrorMessage(err));
    throw new HttpsError('unavailable', t('err_checkout_failed'));
  }

  const membershipRef = orgRef.collection('memberships').doc();
  const planName = typeof plan.name === 'string' && plan.name.trim() ? plan.name.trim() : planId;
  await membershipRef.set({
    organization_id: orgId,
    client_id: access.client_id,
    client_name: stringField(client, 'name'),
    client_email: stringField(client, 'email'),
    plan_id: planId,
    plan_name: planName,
    price: unitAmount / 100,
    currency: currency.toUpperCase(),
    monthly_credit: round2(monthlyCredit),
    status: 'incomplete',
    provider: 'stripe',
    stripe_mode: mode,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_start: null,
    current_period_end: null,
    cancel_at_period_end: false,
    cancelled_at: null,
    credit_expires_at: null,
    started_at: null,
    checkout: null,
    created_by_uid: request.auth.uid,
    created_at: serverNow,
    updated_at: serverNow,
  });

  const portalBase = portalUrlForOrg(orgSnap.data());
  const membershipParam = encodeURIComponent(membershipRef.id);
  const metadata = {
    organizationId: orgId,
    membershipId: membershipRef.id,
    clientId: access.client_id,
    planId,
    kind: 'club_membership',
  };
  const customerEmail = isValidEmail(client.email) ? client.email.trim() : null;

  let sessionId: string;
  let sessionUrl: string;
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: membershipRef.id,
        ...(customerEmail ? { customer_email: customerEmail } : {}),
        metadata,
        subscription_data: { metadata },
        success_url: `${portalBase}?club=success&m=${membershipParam}`,
        cancel_url: `${portalBase}?club=cancel&m=${membershipParam}`,
      },
      { idempotencyKey: `club_checkout_${membershipRef.id}` },
    );
    if (!session.url) throw new Error('Stripe did not return a checkout URL');
    sessionId = session.id;
    sessionUrl = session.url;
  } catch (err) {
    console.error(`createMembershipCheckout stripe failed (org ${orgId}):`, stripeErrorMessage(err));
    await membershipRef.set(
      { status: 'cancelled', cancelled_at: serverNow, cancel_reason: 'checkout_creation_failed', updated_at: serverNow },
      { merge: true },
    );
    throw new HttpsError('unavailable', t('err_checkout_failed'));
  }

  await membershipRef.set({ checkout: { session_id: sessionId, url: sessionUrl }, updated_at: serverNow }, { merge: true });
  return { url: sessionUrl, membershipId: membershipRef.id };
});

export const cancelClubMembership = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required');
  const uid = request.auth.uid;
  let t = await orgT(request.data?.organizationId);
  const orgId = requireId(request.data?.organizationId, 'organizationId', t);
  const membershipId = requireId(request.data?.membershipId, 'membershipId', t);

  const orgRef = db.collection('organizations').doc(orgId);
  const membershipRef = orgRef.collection('memberships').doc(membershipId);
  const [accessSnap, userSnap, membershipSnap] = await Promise.all([
    db.collection('clientPortalAccess').doc(uid).collection('organizations').doc(orgId).get(),
    db.collection('users').doc(uid).get(),
    membershipRef.get(),
  ]);
  if (!membershipSnap.exists) throw new HttpsError('not-found', t('err_membership_not_found'));
  const membership = membershipSnap.data()!;

  const portalClientId = accessSnap.exists ? stringField(accessSnap.data(), 'client_id') : '';
  const isOwner = Boolean(portalClientId) && membership.client_id === portalClientId;
  const user = userSnap.exists ? userSnap.data()! : null;
  const isStaff = Boolean(user) && user!.organizationId === orgId && STAFF_CANCEL_ROLES.includes(String(user!.role));
  if (!isOwner && !isStaff) throw new HttpsError('permission-denied', t('err_membership_forbidden'));
  if (!isOwner) t = makeT(STRINGS, await getCallerLanguage(uid, orgId));

  if (membership.status === 'cancelled') {
    return { success: true, status: 'cancelled', cancel_at_period_end: membership.cancel_at_period_end === true };
  }

  await consumeRateLimit(orgId, 'cancelClubMembership', 200);

  const serverNow = admin.firestore.FieldValue.serverTimestamp();
  const subscriptionId = stringField(membership, 'stripe_subscription_id');
  const secrets = await loadPaymentSecrets(orgId);
  const secretKey = secrets.stripe_secret_key ?? '';
  const keyMatchesMembership = Boolean(secretKey) && modeFromKey(secretKey) === membership.stripe_mode;
  const stripe = keyMatchesMembership ? stripeClient(secretKey) : null;

  if (membership.status === 'incomplete') {
    if (subscriptionId && stripe) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
      } catch (err) {
        console.error(`cancelClubMembership incomplete cancel failed (org ${orgId}, ${membershipId}):`, stripeErrorMessage(err));
        throw new HttpsError('unavailable', t('err_cancel_failed'));
      }
    }
    const sessionId = stringField(membership.checkout, 'session_id');
    if (sessionId && stripe) await expireCheckoutSession(stripe, sessionId);
    await membershipRef.set(
      {
        status: 'cancelled',
        cancel_at_period_end: false,
        cancelled_at: serverNow,
        cancel_reason: 'cancelled_before_activation',
        cancel_requested_by: uid,
        updated_at: serverNow,
      },
      { merge: true },
    );
    return { success: true, status: 'cancelled', cancel_at_period_end: false };
  }

  if (subscriptionId && stripe) {
    try {
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    } catch (err) {
      console.error(`cancelClubMembership update failed (org ${orgId}, ${membershipId}):`, stripeErrorMessage(err));
      throw new HttpsError('unavailable', t('err_cancel_failed'));
    }
    await membershipRef.set(
      { cancel_at_period_end: true, cancel_requested_at: serverNow, cancel_requested_by: uid, updated_at: serverNow },
      { merge: true },
    );
    return { success: true, status: membership.status, cancel_at_period_end: true };
  }

  // A live subscription we cannot reach (key removed) must not be hidden behind a local cancel.
  if (subscriptionId && !keyMatchesMembership && secretKey === '') {
    throw new HttpsError('failed-precondition', t('err_cancel_failed'));
  }

  // No reachable Stripe subscription (never linked, or the org switched test/live keys): end it locally.
  await membershipRef.set(
    {
      status: 'cancelled',
      cancel_at_period_end: true,
      cancelled_at: serverNow,
      credit_expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + CLUB_CREDIT_EXPIRY_MS),
      credit_expired: false,
      cancel_reason: subscriptionId ? 'stripe_mode_mismatch' : 'no_stripe_subscription',
      cancel_requested_by: uid,
      updated_at: serverNow,
    },
    { merge: true },
  );
  const clientId = stringField(membership, 'client_id');
  if (clientId) await setClientMembershipCache(orgId, clientId, membershipId, 'cancelled', stringField(membership, 'currency'));
  return { success: true, status: 'cancelled', cancel_at_period_end: true };
});

export const createClubBillingPortalSession = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required');
  const t = await orgT(request.data?.organizationId);
  const orgId = requireId(request.data?.organizationId, 'organizationId', t);

  const access = await getPortalAccess(request.auth.uid, orgId, t);
  const orgRef = db.collection('organizations').doc(orgId);
  const [orgSnap, membershipsSnap] = await Promise.all([
    orgRef.get(),
    orgRef.collection('memberships').where('client_id', '==', access.client_id).get(),
  ]);
  if (!orgSnap.exists) throw new HttpsError('not-found', t('err_org_not_found'));

  const rank = (status: unknown): number => (status === 'active' || status === 'past_due' ? 0 : 1);
  const candidates = membershipsSnap.docs
    .map((d) => d.data())
    .filter((m) => m.provider === 'stripe' && stringField(m, 'stripe_customer_id'))
    .sort((a, b) => rank(a.status) - rank(b.status) || (tsToMillis(b.updated_at) ?? 0) - (tsToMillis(a.updated_at) ?? 0));
  const membership = candidates[0];
  if (!membership) throw new HttpsError('failed-precondition', t('err_no_membership'));

  const secrets = await loadPaymentSecrets(orgId);
  const secretKey = secrets.stripe_secret_key ?? '';
  if (!secretKey || modeFromKey(secretKey) !== membership.stripe_mode) {
    throw new HttpsError('failed-precondition', t('err_billing_portal_unavailable'));
  }

  await consumeRateLimit(orgId, 'createClubBillingPortalSession', 200);

  try {
    const session = await stripeClient(secretKey).billingPortal.sessions.create({
      customer: stringField(membership, 'stripe_customer_id'),
      return_url: `${portalUrlForOrg(orgSnap.data())}?club=return`,
    });
    return { url: session.url };
  } catch (err) {
    console.error(`createClubBillingPortalSession failed (org ${orgId}):`, stripeErrorMessage(err));
    throw new HttpsError('failed-precondition', t('err_billing_portal_unavailable'));
  }
});

export const adjustClubCredit = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');
  const uid = request.auth.uid;
  const { organizationId, clientId, amount, reason } = (request.data ?? {}) as {
    organizationId?: unknown;
    clientId?: unknown;
    amount?: unknown;
    reason?: unknown;
  };
  const t = makeT(STRINGS, await getCallerLanguage(uid));
  const orgId = await assertAdmin(uid, organizationId, t);

  const resolvedClientId = requireId(clientId, 'clientId', t);
  const amt = typeof amount === 'number' ? round2(amount) : Number.NaN;
  if (!Number.isFinite(amt) || amt === 0 || Math.abs(amt) > MAX_ADJUSTMENT) {
    throw new HttpsError('invalid-argument', t('err_invalid_amount'));
  }
  const reasonText = typeof reason === 'string' ? reason.trim() : '';
  if (reasonText.length < 3 || reasonText.length > 300) {
    throw new HttpsError('invalid-argument', t('err_invalid_reason'));
  }

  const orgRef = db.collection('organizations').doc(orgId);
  const [clientSnap, businessInfoSnap] = await Promise.all([
    orgRef.collection('clients').doc(resolvedClientId).get(),
    orgRef.collection('config').doc('businessInfo').get(),
  ]);
  if (!clientSnap.exists) throw new HttpsError('not-found', t('err_client_not_found'));
  const client = clientSnap.data()!;
  if (client.deleted_at || client.deletedAt) throw new HttpsError('failed-precondition', t('err_client_not_active'));

  const pickCurrency = (v: unknown): string | null =>
    typeof v === 'string' && /^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : null;
  const currency = pickCurrency(client.club_credit_currency) ?? pickCurrency(businessInfoSnap.data()?.currency) ?? 'USD';

  await consumeRateLimit(orgId, 'adjustClubCredit', 200);

  const entryId = `adjust_${orgRef.collection('creditLedger').doc().id}`;
  try {
    const result = await applyCreditEntry(orgId, {
      entryId,
      client_id: resolvedClientId,
      membership_id: stringField(client, 'club_membership_id') || null,
      type: 'adjustment',
      amount: amt,
      currency,
      description: reasonText,
      ref_type: 'manual',
      ref_id: null,
      created_by: uid,
    });
    return { balance_after: result.balance_after };
  } catch (err) {
    if (err instanceof HttpsError && err.message === 'insufficient_credit') {
      throw new HttpsError('failed-precondition', t('err_insufficient_credit'));
    }
    throw err;
  }
});
