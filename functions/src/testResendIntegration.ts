import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { consumeRateLimit } from './rateLimit';
import { loadSecret } from './lib/integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const testResendIntegration = onCall(async (request) => {
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

  await consumeRateLimit(orgId, 'resendTest', 50);

  const snap = await db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc('resend')
    .get();

  if (!snap.exists || !snap.data()?.is_enabled) {
    throw new HttpsError('not-found', 'Resend integration not configured or disabled.');
  }

  const cfg = snap.data()!.configuration as { fromEmail?: string; fromName?: string };
  // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
  const { apiKey } = await loadSecret(orgId, 'resend', snap.data());

  if (!apiKey) throw new HttpsError('invalid-argument', 'API key is missing.');
  if (!cfg.fromEmail) throw new HttpsError('invalid-argument', 'From email is missing.');

  const resend = new Resend(apiKey);
  const fromName = cfg.fromName || 'Beauty Hub Pro';

  const result = await resend.emails.send({
    from: `${fromName} <${cfg.fromEmail}>`,
    to: [userData.email],
    subject: 'Resend Integration Test',
    html: `<p>Your Resend integration for <strong>${fromName}</strong> is working correctly.</p>`,
  });

  if (result.error) {
    const msg = (result.error as any)?.message || JSON.stringify(result.error);
    // Update status to disconnected with error
    await snap.ref.update({ status: 'disconnected', error_message: msg, updated_at: new Date().toISOString() });
    throw new HttpsError('internal', `Resend error: ${msg}`);
  }

  await snap.ref.update({ status: 'connected', error_message: admin.firestore.FieldValue.delete(), updated_at: new Date().toISOString() });

  return { success: true };
});
