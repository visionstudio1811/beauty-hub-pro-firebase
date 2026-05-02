import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { OAUTH_SECRETS, revokeRefreshToken } from './driveOAuth';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

interface DisconnectDriveBackupRequest {
  organizationId: string;
}

export const disconnectDriveBackup = onCall(
  { secrets: OAUTH_SECRETS, region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

    const { organizationId } = (request.data ?? {}) as DisconnectDriveBackupRequest;
    if (!organizationId) {
      throw new HttpsError('invalid-argument', 'organizationId is required');
    }

    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
    const userData = userDoc.data()!;
    if (userData.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Organization mismatch');
    }
    if (userData.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const ref = db
      .collection('organizations').doc(organizationId)
      .collection('marketingIntegrations').doc('googleDrive');
    const snap = await ref.get();
    const refreshToken = snap.data()?.configuration?.refresh_token as string | undefined;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    await ref.set(
      {
        is_enabled: false,
        status: 'disconnected',
        configuration: admin.firestore.FieldValue.delete(),
        updated_at: new Date().toISOString(),
        updated_at_ts: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true };
  }
);
