import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface DeleteWaiverRequest {
  organizationId: string;
  waiverId: string;
}

// Admin-only hard delete for clientWaivers (waiver / intake / agreement).
// Cleans up the Firestore record, the matching waiverTokens entry, and any
// PDFs/photos in Storage. Storage + waiverTokens deletes require Admin SDK
// since their security rules deny client-side deletes.
export const deleteWaiver = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const { organizationId, waiverId } = request.data as DeleteWaiverRequest;
  if (!organizationId || !waiverId) {
    throw new HttpsError('invalid-argument', 'organizationId and waiverId are required');
  }

  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('permission-denied', 'User not found');
  }
  const userData = userDoc.data()!;
  if (userData.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  await consumeRateLimit(organizationId, 'deleteWaiver', 100);

  const waiverRef = db
    .collection('organizations')
    .doc(organizationId)
    .collection('clientWaivers')
    .doc(waiverId);

  const snap = await waiverRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Waiver not found');
  }
  const waiver = snap.data()!;
  const token = typeof waiver.token === 'string' ? waiver.token : null;

  const bucket = admin.storage().bucket();

  if (token) {
    try {
      await bucket.file(`waivers/${token}.pdf`).delete({ ignoreNotFound: true });
    } catch (err) {
      console.error('Failed to delete waiver PDF', { token, err });
    }
    try {
      await bucket.deleteFiles({ prefix: `waivers/${token}/photos/` });
    } catch (err) {
      console.error('Failed to delete waiver photos', { token, err });
    }
    try {
      await db.collection('waiverTokens').doc(token).delete();
    } catch (err) {
      console.error('Failed to delete waiver token', { token, err });
    }
  }

  await waiverRef.delete();

  return { success: true };
});
