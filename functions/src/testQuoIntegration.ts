import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { loadSecret } from './lib/integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

interface QuoNumber {
  id?: string;
  number?: string;
}

/**
 * Validate an org's Quo integration by listing the workspace phone numbers.
 * This confirms the API key is valid AND that the configured `fromNumber`
 * actually belongs to the workspace — the most common misconfiguration that
 * would otherwise only surface as a 4xx on the first real send.
 */
export const testQuoIntegration = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const uid = request.auth.uid;
  const { organizationId } = request.data as { organizationId?: string };

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');

  const userData = userDoc.data()!;
  const orgId = organizationId || userData.organizationId;

  if (!orgId || userData.organizationId !== orgId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (!['admin', 'staff'].includes(userData.role)) {
    throw new HttpsError('permission-denied', 'Staff or admin access required');
  }

  await consumeRateLimit(orgId, 'quoTest', 50);

  const snap = await db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc('quo')
    .get();

  if (!snap.exists || !snap.data()?.is_enabled) {
    throw new HttpsError('not-found', 'Quo integration not configured or disabled.');
  }

  const cfg = snap.data()!.configuration as { fromNumber?: string };
  // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
  const { apiKey } = await loadSecret(orgId, 'quo', snap.data());
  if (!apiKey) throw new HttpsError('invalid-argument', 'API key is missing.');
  if (!cfg.fromNumber) throw new HttpsError('invalid-argument', 'From number is missing.');

  let res: Response;
  try {
    res = await fetch('https://api.quo.com/v1/phone-numbers', {
      headers: { Authorization: apiKey },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await snap.ref.update({ status: 'disconnected', error_message: msg, updated_at: new Date().toISOString() });
    throw new HttpsError('internal', `Quo request failed: ${msg}`);
  }

  if (!res.ok) {
    const msg = `Quo error (${res.status}): ${await res.text()}`;
    await snap.ref.update({ status: 'disconnected', error_message: msg, updated_at: new Date().toISOString() });
    throw new HttpsError('internal', msg);
  }

  const json = (await res.json()) as { data?: QuoNumber[] };
  const numbers = json.data ?? [];
  const owns = numbers.some((n) => n.number === cfg.fromNumber);

  if (!owns) {
    const msg = `The number ${cfg.fromNumber} is not a Quo number on this workspace. Use one of: ${
      numbers.map((n) => n.number).filter(Boolean).join(', ') || '(none found)'
    }.`;
    await snap.ref.update({ status: 'disconnected', error_message: msg, updated_at: new Date().toISOString() });
    throw new HttpsError('failed-precondition', msg);
  }

  await snap.ref.update({
    status: 'connected',
    error_message: admin.firestore.FieldValue.delete(),
    last_tested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return { success: true };
});
