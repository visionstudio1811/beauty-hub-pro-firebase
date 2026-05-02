import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { verifyFolderAccess } from './lib/googleDrive';
import { OAUTH_SECRETS, getDriveClientForOrg } from './oauth/driveOAuth';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function requireAdminInOrg(uid: string, organizationId: string | undefined): Promise<string> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
  const u = userDoc.data()!;
  const orgId = organizationId || u.organizationId;
  if (!orgId || u.organizationId !== orgId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (u.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required');
  }
  return orgId as string;
}

export const testDriveBackup = onCall(
  { secrets: OAUTH_SECRETS, region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { organizationId } = (request.data ?? {}) as { organizationId?: string };
    const orgId = await requireAdminInOrg(request.auth.uid, organizationId);

    await consumeRateLimit(orgId, 'driveBackupTest', 50);

    const ref = db
      .collection('organizations').doc(orgId)
      .collection('marketingIntegrations').doc('googleDrive');

    const driveCtx = await getDriveClientForOrg(orgId);
    if (!driveCtx) {
      throw new HttpsError('failed-precondition', 'Google Drive is not connected for this org.');
    }
    const { drive, config } = driveCtx;
    if (!config.folder_id) {
      throw new HttpsError('failed-precondition', 'Drive folder is missing. Reconnect Google Drive.');
    }

    try {
      const meta = await verifyFolderAccess(drive, config.folder_id);
      if (!meta.canWrite) {
        await ref.update({
          status: 'error',
          error_message: 'Drive folder is read-only. Reconnect Google Drive.',
          updated_at: new Date().toISOString(),
        });
        throw new HttpsError('failed-precondition', 'Drive folder is read-only.');
      }
      await ref.update({
        status: 'connected',
        error_message: admin.firestore.FieldValue.delete(),
        last_tested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return { success: true, folderName: meta.name, userEmail: config.user_email ?? null };
    } catch (err: unknown) {
      if (err instanceof HttpsError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      await ref.update({
        status: 'error',
        error_message: msg,
        updated_at: new Date().toISOString(),
      });
      throw new HttpsError('internal', `Drive verification failed: ${msg}`);
    }
  }
);
