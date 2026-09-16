import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { writeSecret, IntegrationProvider } from './lib/integrationSecrets';
import { defineStrings, makeT, getCallerLanguage } from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/**
 * Secret fields the client may set per provider. Anything else is rejected.
 * Intentionally omits `googleDrive`: its refresh token is issued by the OAuth
 * callback (Admin SDK) and must never be settable from the browser, so a request
 * with provider='googleDrive' falls through to the "Unknown provider" rejection.
 */
const ALLOWED_SECRET_KEYS: Partial<Record<IntegrationProvider, string[]>> = {
  twilio: ['accountSid', 'authToken'],
  infobip: ['apiKey'],
  quo: ['apiKey'],
  resend: ['apiKey'],
};

// Admin-facing HttpsError copy (surfaced as toasts in the integrations UI).
// Follows the caller's language (users/{uid}.language, then their own org's default; never a caller-supplied orgId).
// The `unauthenticated` error is thrown before any Firestore read and stays English.
const STRINGS = defineStrings({
  en: {
    user_not_found: 'User not found',
    admin_required: 'Admin role required',
    org_mismatch: 'Organization mismatch',
    unknown_provider: 'Unknown provider',
    secret_required: 'secret object required',
    no_fields: 'No secret fields provided',
  },
  he: {
    user_not_found: 'המשתמש לא נמצא',
    admin_required: 'נדרשת הרשאת מנהל',
    org_mismatch: 'אי-התאמה בין הארגונים',
    unknown_provider: 'ספק לא מוכר',
    secret_required: 'נדרש אובייקט secret',
    no_fields: 'לא סופקו שדות סודיים',
  },
});

/**
 * Admin-only callable that saves an integration's API secret(s) into the
 * write-only secret subdoc (Admin SDK). The browser can never read these back.
 * Stamps has_secret / secret_last4 / status on the parent doc for the UI.
 */
export const saveIntegrationSecret = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const { organizationId, provider, secret } = request.data as {
    organizationId?: string;
    provider?: IntegrationProvider;
    secret?: Record<string, unknown>;
  };
  const t = makeT(STRINGS, await getCallerLanguage(request.auth.uid));

  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', t('user_not_found'));
  const u = userDoc.data()!;
  if (u.role !== 'admin') throw new HttpsError('permission-denied', t('admin_required'));
  if (!organizationId || u.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', t('org_mismatch'));
  }
  if (!provider || !(provider in ALLOWED_SECRET_KEYS)) {
    throw new HttpsError('invalid-argument', t('unknown_provider'));
  }
  if (!secret || typeof secret !== 'object') {
    throw new HttpsError('invalid-argument', t('secret_required'));
  }

  await consumeRateLimit(organizationId, 'saveIntegrationSecret', 100);

  const allowedKeys = ALLOWED_SECRET_KEYS[provider];
  if (!allowedKeys) {
    throw new HttpsError('invalid-argument', t('unknown_provider'));
  }

  const fields: Record<string, string> = {};
  for (const k of allowedKeys) {
    const v = secret[k];
    if (typeof v === 'string' && v.trim()) fields[k] = v.trim();
  }
  if (Object.keys(fields).length === 0) {
    throw new HttpsError('invalid-argument', t('no_fields'));
  }

  await writeSecret(organizationId, provider, fields);
  // Reset status so the admin re-tests the new key.
  await db.collection('organizations').doc(organizationId)
    .collection('marketingIntegrations').doc(provider)
    .set({ status: 'disconnected' }, { merge: true });

  const src = fields.apiKey ?? fields.authToken ?? Object.values(fields)[0] ?? '';
  return { success: true, secret_last4: src.slice(-4) };
});
