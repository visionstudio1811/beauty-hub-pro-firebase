import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from '../rateLimit';
import { defineStrings, makeT, getCallerLanguage, getOrgLanguage, Translator } from '../lib/i18n';
import { portalUrlForOrg } from '../lib/portalUrl';
import {
  assertPaymentsEnabled,
  isPaymentProvider,
  loadPaymentConfig,
  loadPaymentSecrets,
  writePaymentSecret,
  PaymentProvider,
  PaymentSecrets,
} from './settings';
import { createStripeCheckout, stripeErrorMessage, testStripeConnection } from './stripe';
import { createSquarePaymentLink, listSquareLocations, squareErrorMessage } from './square';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_SECRET_LENGTH = 512;
const MAX_ID_LENGTH = 128;

const ADMIN_STRINGS = defineStrings({
  en: {
    user_not_found: 'User not found',
    admin_required: 'Admin role required',
    org_mismatch: 'Organization mismatch',
    unknown_provider: 'Unknown provider',
    secret_required: 'secret object required',
    no_fields: 'No secret fields provided',
    secret_too_long: 'Secret value is too long',
    provider_not_configured: 'Choose a payment provider and save the settings first',
    missing_secret_key: 'Stripe secret key is not saved yet',
    missing_access_token: 'Square access token is not saved yet',
    missing_location: 'Square location ID is not saved yet',
    location_not_found: 'Location {{id}} was not found on this Square account. Available: {{available}}',
    no_locations: 'No locations were returned for this Square account',
  },
  he: {
    user_not_found: 'המשתמש לא נמצא',
    admin_required: 'נדרשת הרשאת מנהל',
    org_mismatch: 'אי-התאמה בין הארגונים',
    unknown_provider: 'ספק לא מוכר',
    secret_required: 'נדרש אובייקט secret',
    no_fields: 'לא סופקו שדות סודיים',
    secret_too_long: 'הערך הסודי ארוך מדי',
    provider_not_configured: 'יש לבחור ספק תשלומים ולשמור את ההגדרות תחילה',
    missing_secret_key: 'מפתח ה-Secret של Stripe עדיין לא נשמר',
    missing_access_token: 'ה-Access Token של Square עדיין לא נשמר',
    missing_location: 'מזהה המיקום (Location ID) של Square עדיין לא נשמר',
    location_not_found: 'המיקום {{id}} לא נמצא בחשבון Square זה. מיקומים זמינים: {{available}}',
    no_locations: 'לא הוחזרו מיקומים עבור חשבון Square זה',
  },
});

// Portal-facing copy: ClientPortal renders error.message verbatim, so these follow the ORG language.
const PORTAL_STRINGS = defineStrings({
  en: {
    err_field_required: '{{field}} is required',
    err_portal_not_linked: 'Client portal access has not been linked',
    err_org_not_found: 'Business not found',
    err_client_not_found: 'Client not found',
    err_client_not_active: 'This client card is not active',
    err_purchase_not_found: 'Package purchase not found',
    err_purchase_not_owned: 'Purchase does not belong to this client',
    err_package_not_found: 'This package is no longer available',
    err_package_not_active: 'This package is no longer available',
    err_package_no_price: 'This package cannot be purchased online',
    err_payments_disabled: 'Online payments are not available for this business',
    err_checkout_failed: 'We could not start the payment. Please try again or contact the front desk.',
    checkout_product_name: 'Package renewal: {{package}}',
  },
  he: {
    err_field_required: 'השדה {{field}} הוא שדה חובה',
    err_portal_not_linked: 'הגישה לפורטל הלקוחות עדיין לא קושרה לכרטיס לקוח',
    err_org_not_found: 'העסק לא נמצא',
    err_client_not_found: 'הלקוח לא נמצא',
    err_client_not_active: 'כרטיס הלקוח הזה אינו פעיל',
    err_purchase_not_found: 'רכישת החבילה לא נמצאה',
    err_purchase_not_owned: 'הרכישה אינה שייכת ללקוח זה',
    err_package_not_found: 'החבילה הזו כבר אינה זמינה',
    err_package_not_active: 'החבילה הזו כבר אינה זמינה',
    err_package_no_price: 'לא ניתן לרכוש את החבילה הזו באופן מקוון',
    err_payments_disabled: 'תשלום מקוון אינו זמין בעסק זה',
    err_checkout_failed: 'לא הצלחנו להתחיל את התשלום. נסו שוב או פנו לקבלה.',
    checkout_product_name: 'חידוש חבילה: {{package}}',
  },
});

type AdminT = Translator<keyof typeof ADMIN_STRINGS.en>;
type PortalT = Translator<keyof typeof PORTAL_STRINGS.en>;

const SECRET_INPUT_KEYS: Record<PaymentProvider, Record<string, keyof PaymentSecrets>> = {
  stripe: { secret_key: 'stripe_secret_key', webhook_secret: 'stripe_webhook_secret' },
  square: { access_token: 'square_access_token', webhook_signature_key: 'square_webhook_signature_key' },
};

function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_ID_LENGTH && !v.includes('/');
}

async function assertAdmin(uid: string, organizationId: unknown, t: AdminT): Promise<string> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', t('user_not_found'));
  const u = userDoc.data()!;
  if (u.role !== 'admin') throw new HttpsError('permission-denied', t('admin_required'));
  if (!isSafeId(organizationId) || u.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', t('org_mismatch'));
  }
  return organizationId;
}

export const savePaymentSecret = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const { organizationId, provider, secret } = request.data as {
    organizationId?: string;
    provider?: string;
    secret?: Record<string, unknown>;
  };
  const t = makeT(ADMIN_STRINGS, await getCallerLanguage(request.auth.uid));
  const orgId = await assertAdmin(request.auth.uid, organizationId, t);

  if (!isPaymentProvider(provider)) throw new HttpsError('invalid-argument', t('unknown_provider'));
  if (!secret || typeof secret !== 'object' || Array.isArray(secret)) {
    throw new HttpsError('invalid-argument', t('secret_required'));
  }

  await consumeRateLimit(orgId, 'savePaymentSecret', 100);

  const fields: PaymentSecrets = {};
  for (const [inputKey, storedKey] of Object.entries(SECRET_INPUT_KEYS[provider])) {
    const v = secret[inputKey];
    if (typeof v !== 'string' || !v.trim()) continue;
    if (v.trim().length > MAX_SECRET_LENGTH) throw new HttpsError('invalid-argument', t('secret_too_long'));
    fields[storedKey] = v.trim();
  }
  if (Object.keys(fields).length === 0) throw new HttpsError('invalid-argument', t('no_fields'));

  await writePaymentSecret(orgId, fields);
  return { success: true };
});

export const testPaymentConnection = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const { organizationId, provider: providerInput } = request.data as { organizationId?: string; provider?: string };
  const t = makeT(ADMIN_STRINGS, await getCallerLanguage(request.auth.uid));
  const orgId = await assertAdmin(request.auth.uid, organizationId, t);

  await consumeRateLimit(orgId, 'testPaymentConnection', 50);

  const [config, secrets] = await Promise.all([loadPaymentConfig(orgId), loadPaymentSecrets(orgId)]);
  const provider = isPaymentProvider(providerInput) ? providerInput : config?.provider ?? null;
  if (!config || !provider) return { ok: false, error: t('provider_not_configured') };

  if (provider === 'stripe') {
    if (!secrets.stripe_secret_key) return { ok: false, error: t('missing_secret_key') };
    try {
      const details = await testStripeConnection(secrets.stripe_secret_key);
      return { ok: true, details: { provider, ...details } };
    } catch (err) {
      console.error('testPaymentConnection stripe failed:', stripeErrorMessage(err));
      return { ok: false, error: stripeErrorMessage(err) };
    }
  }

  if (!secrets.square_access_token) return { ok: false, error: t('missing_access_token') };
  if (!config.square.location_id) return { ok: false, error: t('missing_location') };
  try {
    const locations = await listSquareLocations(secrets.square_access_token, config.square.environment);
    if (locations.length === 0) return { ok: false, error: t('no_locations') };
    const match = locations.find((l) => l.id === config.square.location_id);
    if (!match) {
      return {
        ok: false,
        error: t('location_not_found', {
          id: config.square.location_id,
          available: locations.map((l) => `${l.id} (${l.name})`).join(', '),
        }),
      };
    }
    return {
      ok: true,
      details: {
        provider,
        environment: config.square.environment,
        location_id: match.id,
        location_name: match.name,
        location_status: match.status,
        currency: match.currency,
        country: match.country,
      },
    };
  } catch (err) {
    console.error('testPaymentConnection square failed:', squareErrorMessage(err));
    return { ok: false, error: squareErrorMessage(err) };
  }
});

async function resolvePortalT(orgIdInput: unknown): Promise<PortalT> {
  const lang = isSafeId(orgIdInput) ? await getOrgLanguage(orgIdInput.trim()) : 'en';
  return makeT(PORTAL_STRINGS, lang);
}

function requireId(value: unknown, field: string, t: PortalT): string {
  if (!isSafeId(value)) throw new HttpsError('invalid-argument', t('err_field_required', { field }));
  return value.trim();
}

async function getPortalAccess(uid: string, orgId: string, t: PortalT): Promise<{ client_id: string }> {
  const snap = await db.collection('clientPortalAccess').doc(uid).collection('organizations').doc(orgId).get();
  const clientId = snap.data()?.client_id;
  if (!snap.exists || typeof clientId !== 'string' || !clientId) {
    throw new HttpsError('permission-denied', t('err_portal_not_linked'));
  }
  return { client_id: clientId };
}

function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 254;
}

export const createRenewalCheckout = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required');
  const t = await resolvePortalT(request.data?.organizationId);

  const orgId = requireId(request.data?.organizationId, 'organizationId', t);
  const purchaseId = requireId(request.data?.purchaseId, 'purchaseId', t);

  const access = await getPortalAccess(request.auth.uid, orgId, t);
  const orgRef = db.collection('organizations').doc(orgId);
  const [orgSnap, purchaseSnap, clientSnap, businessInfoSnap] = await Promise.all([
    orgRef.get(),
    orgRef.collection('purchases').doc(purchaseId).get(),
    orgRef.collection('clients').doc(access.client_id).get(),
    orgRef.collection('config').doc('businessInfo').get(),
  ]);

  if (!orgSnap.exists) throw new HttpsError('not-found', t('err_org_not_found'));
  if (!purchaseSnap.exists) throw new HttpsError('not-found', t('err_purchase_not_found'));
  const purchase = purchaseSnap.data()!;
  if (purchase.client_id !== access.client_id) {
    throw new HttpsError('permission-denied', t('err_purchase_not_owned'));
  }
  if (!clientSnap.exists) throw new HttpsError('not-found', t('err_client_not_found'));
  const client = clientSnap.data()!;
  if (client.deleted_at || client.deletedAt) throw new HttpsError('permission-denied', t('err_client_not_active'));

  const packageId = typeof purchase.package_id === 'string' ? purchase.package_id : '';
  if (!packageId) throw new HttpsError('failed-precondition', t('err_package_not_found'));
  const packageSnap = await orgRef.collection('packages').doc(packageId).get();
  if (!packageSnap.exists) throw new HttpsError('failed-precondition', t('err_package_not_found'));
  const pkg = packageSnap.data()!;
  if (pkg.is_active === false) throw new HttpsError('failed-precondition', t('err_package_not_active'));

  const price = Number(pkg.price);
  const amountMinor = Math.round(price * 100);
  if (!Number.isFinite(price) || price <= 0 || !Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new HttpsError('failed-precondition', t('err_package_no_price'));
  }

  const rawCurrency = businessInfoSnap.data()?.currency;
  const currency = typeof rawCurrency === 'string' && /^[A-Za-z]{3}$/.test(rawCurrency.trim())
    ? rawCurrency.trim().toUpperCase()
    : 'USD';

  const { config, secrets } = await assertPaymentsEnabled(orgId, t('err_payments_disabled'));
  const provider = config.provider as PaymentProvider;
  await consumeRateLimit(orgId, 'createRenewalCheckout', 200);

  const packageName = typeof pkg.name === 'string' && pkg.name.trim() ? pkg.name.trim() : packageId;
  const serverNow = admin.firestore.FieldValue.serverTimestamp();
  const requestRef = orgRef.collection('renewalRequests').doc();
  await requestRef.set({
    organization_id: orgId,
    client_id: access.client_id,
    client_name: typeof client.name === 'string' ? client.name : '',
    client_email: typeof client.email === 'string' ? client.email : '',
    client_phone: typeof client.phone === 'string' ? client.phone : '',
    purchase_id: purchaseId,
    package_id: packageId,
    package_name: packageName,
    package_price: price,
    currency,
    sessions_remaining_at_request: Number(purchase.sessions_remaining ?? 0),
    total_sessions_at_request: Number(pkg.total_sessions ?? 0),
    expiry_date_at_request: typeof purchase.expiry_date === 'string' ? purchase.expiry_date : null,
    notes: '',
    status: 'pending_payment',
    source: 'client_portal',
    payment_provider: provider,
    created_by_uid: request.auth.uid,
    created_at: serverNow,
    updated_at: serverNow,
  });

  const portalBase = portalUrlForOrg(orgSnap.data());
  const successUrl = `${portalBase}?checkout=success&rr=${encodeURIComponent(requestRef.id)}`;
  const cancelUrl = `${portalBase}?checkout=cancel&rr=${encodeURIComponent(requestRef.id)}`;
  const productName = t('checkout_product_name', { package: packageName });
  const customerEmail = isValidEmail(client.email) ? client.email.trim() : null;

  let checkout: Record<string, string>;
  try {
    if (provider === 'stripe') {
      const session = await createStripeCheckout({
        secretKey: secrets.stripe_secret_key!,
        amountMinor,
        currency,
        productName,
        successUrl,
        cancelUrl,
        customerEmail,
        clientReferenceId: requestRef.id,
        idempotencyKey: requestRef.id,
        metadata: {
          organizationId: orgId,
          renewalRequestId: requestRef.id,
          clientId: access.client_id,
          purchaseId,
          packageId,
        },
      });
      checkout = { session_id: session.id, url: session.url };
    } else {
      const link = await createSquarePaymentLink({
        accessToken: secrets.square_access_token!,
        environment: config.square.environment,
        locationId: config.square.location_id!,
        amountMinor,
        currency,
        productName,
        redirectUrl: successUrl,
        buyerEmail: customerEmail,
        referenceId: requestRef.id,
        idempotencyKey: requestRef.id,
      });
      checkout = { payment_link_id: link.id, order_id: link.order_id, url: link.url };
    }
  } catch (err) {
    const reason = provider === 'stripe' ? stripeErrorMessage(err) : squareErrorMessage(err);
    console.error(`createRenewalCheckout ${provider} failed for org ${orgId}:`, reason);
    await requestRef.set(
      { status: 'payment_failed', failure_reason: 'checkout_creation_failed', updated_at: serverNow },
      { merge: true },
    );
    throw new HttpsError('unavailable', t('err_checkout_failed'));
  }

  await requestRef.set({ checkout, updated_at: serverNow }, { merge: true });
  return { url: checkout.url, renewalRequestId: requestRef.id };
});
