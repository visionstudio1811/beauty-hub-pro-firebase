import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { OAUTH_SECRETS, revokeRefreshToken } from './driveOAuth';
import { loadSecret, integrationSecretRef } from '../lib/integrationSecrets';

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

    // Token now lives in the write-only secret subdoc (loadSecret falls back to
    // the legacy configuration.refresh_token for orgs connected before the split).
    const secret = await loadSecret(organizationId, 'googleDrive', snap.data() ?? null);
    const refreshToken =
      secret.refresh_token ?? (snap.data()?.configuration?.refresh_token as string | undefined);

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    // Clear the secret subdoc so no orphaned token survives a disconnect.
    await integrationSecretRef(organizationId, 'googleDrive')
      .set({ refresh_token: admin.firestore.FieldValue.delete() }, { merge: true })
      .catch(() => undefined);

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
