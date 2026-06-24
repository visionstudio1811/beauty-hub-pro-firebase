import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { writeSecret, IntegrationProvider } from './lib/integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/** Secret fields the client may set per provider. Anything else is rejected. */
const ALLOWED_SECRET_KEYS: Record<IntegrationProvider, string[]> = {
  twilio: ['accountSid', 'authToken'],
  infobip: ['apiKey'],
  quo: ['apiKey'],
  resend: ['apiKey'],
};

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

  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
  const u = userDoc.data()!;
  if (u.role !== 'admin') throw new HttpsError('permission-denied', 'Admin role required');
  if (!organizationId || u.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (!provider || !(provider in ALLOWED_SECRET_KEYS)) {
    throw new HttpsError('invalid-argument', 'Unknown provider');
  }
  if (!secret || typeof secret !== 'object') {
    throw new HttpsError('invalid-argument', 'secret object required');
  }

  await consumeRateLimit(organizationId, 'saveIntegrationSecret', 100);

  const fields: Record<string, string> = {};
  for (const k of ALLOWED_SECRET_KEYS[provider]) {
    const v = secret[k];
    if (typeof v === 'string' && v.trim()) fields[k] = v.trim();
  }
  if (Object.keys(fields).length === 0) {
    throw new HttpsError('invalid-argument', 'No secret fields provided');
  }

  await writeSecret(organizationId, provider, fields);
  // Reset status so the admin re-tests the new key.
  await db.collection('organizations').doc(organizationId)
    .collection('marketingIntegrations').doc(provider)
    .set({ status: 'disconnected' }, { merge: true });

  const src = fields.apiKey ?? fields.authToken ?? Object.values(fields)[0] ?? '';
  return { success: true, secret_last4: src.slice(-4) };
});
