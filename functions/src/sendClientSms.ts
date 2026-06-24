import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { resolveProvider, sendSms, ensureOptOutSuffix } from './lib/smsProviders';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

interface SmsRequest {
  to?: string;
  message?: string;
  clientId?: string;
  organizationId?: string;
  /** When true, append the "Reply STOP to unsubscribe" footer (marketing). */
  marketing?: boolean;
}

/**
 * Staff/reception one-off SMS to a client, mirroring sendClientEmail. Resolves
 * the org's SMS provider, respects the client's sms_opt_out flag, applies the
 * per-org daily cap, and logs to clientCommunications so it appears in history.
 */
export const sendClientSms = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const uid = request.auth.uid;
  const { to, message, clientId, organizationId, marketing } = request.data as SmsRequest;

  if (!to || !message || !organizationId) {
    throw new HttpsError('invalid-argument', 'Missing required fields: to, message, organizationId');
  }
  if (message.length > 1600) {
    throw new HttpsError('invalid-argument', 'Message too long (max 1600 characters)');
  }

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
  const userData = userDoc.data()!;
  if (userData.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (!['admin', 'staff', 'reception'].includes(userData.role)) {
    throw new HttpsError('permission-denied', 'Reception, staff, or admin access required to send SMS');
  }

  await consumeRateLimit(organizationId, 'clientQuickSms', 500);

  // Respect opt-out.
  if (clientId) {
    const clientDoc = await db
      .collection('organizations').doc(organizationId).collection('clients').doc(clientId).get();
    if (clientDoc.exists && clientDoc.data()?.sms_opt_out === true) {
      throw new HttpsError('failed-precondition', 'This client has opted out of SMS.');
    }
  }

  let provider;
  try {
    provider = await resolveProvider(organizationId);
  } catch (err) {
    throw new HttpsError('failed-precondition', err instanceof Error ? err.message : 'No SMS provider configured.');
  }

  const body = marketing ? ensureOptOutSuffix(message) : message;

  try {
    await sendSms(organizationId, to, body, provider);
  } catch (err) {
    throw new HttpsError('internal', err instanceof Error ? err.message : 'SMS send failed');
  }

  await db.collection('organizations').doc(organizationId).collection('clientCommunications').add({
    client_id: clientId || null,
    type: 'sms',
    direction: 'outbound',
    status: 'delivered',
    message: body,
    to,
    sentBy: uid,
    source: provider,
    sent_at: new Date().toISOString(),
    sent_at_ts: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, provider };
});
