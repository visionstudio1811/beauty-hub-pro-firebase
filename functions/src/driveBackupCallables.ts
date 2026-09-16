import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { verifyFolderAccess } from './lib/googleDrive';
import { OAUTH_SECRETS, getDriveClientForOrg } from './oauth/driveOAuth';
import { defineStrings, makeT, getCallerLanguage, getOrgLanguage, Translator } from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Admin-facing copy. Thrown HttpsError messages follow the caller's language
// (users/{uid}.language, then their own org's default; never a caller-supplied
// orgId). The `error_message` persisted on the integration doc follows the ORG
// language instead, so stored status text never depends on who ran the test.
// The `unauthenticated` error is thrown before any Firestore read and stays English.
const STRINGS = defineStrings({
  en: {
    user_not_found: 'User not found',
    org_mismatch: 'Organization mismatch',
    admin_required: 'Admin role required',
    not_connected: 'Google Drive is not connected for this org.',
    folder_missing: 'Drive folder is missing. Reconnect Google Drive.',
    folder_readonly_reconnect: 'Drive folder is read-only. Reconnect Google Drive.',
    folder_readonly: 'Drive folder is read-only.',
    verification_failed: 'Drive verification failed: {{msg}}',
  },
  he: {
    user_not_found: 'המשתמש לא נמצא',
    org_mismatch: 'אי-התאמה בין הארגונים',
    admin_required: 'נדרשת הרשאת מנהל',
    not_connected: 'Google Drive אינו מחובר לארגון זה.',
    folder_missing: 'תיקיית ה-Drive חסרה. יש לחבר מחדש את Google Drive.',
    folder_readonly_reconnect: 'תיקיית ה-Drive היא לקריאה בלבד. יש לחבר מחדש את Google Drive.',
    folder_readonly: 'תיקיית ה-Drive היא לקריאה בלבד.',
    verification_failed: 'אימות ה-Drive נכשל: {{msg}}',
  },
});

type T = Translator<keyof typeof STRINGS.en>;

async function requireAdminInOrg(uid: string, organizationId: string | undefined, t: T): Promise<string> {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', t('user_not_found'));
  const u = userDoc.data()!;
  const orgId = organizationId || u.organizationId;
  if (!orgId || u.organizationId !== orgId) {
    throw new HttpsError('permission-denied', t('org_mismatch'));
  }
  if (u.role !== 'admin') {
    throw new HttpsError('permission-denied', t('admin_required'));
  }
  return orgId as string;
}

export const testDriveBackup = onCall(
  { secrets: OAUTH_SECRETS, region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { organizationId } = (request.data ?? {}) as { organizationId?: string };
    const t = makeT(STRINGS, await getCallerLanguage(request.auth.uid));
    const orgId = await requireAdminInOrg(request.auth.uid, organizationId, t);
    // Org language for text persisted on the integration doc (membership verified above).
    const tOrg = makeT(STRINGS, await getOrgLanguage(orgId));

    await consumeRateLimit(orgId, 'driveBackupTest', 50);

    const ref = db
      .collection('organizations').doc(orgId)
      .collection('marketingIntegrations').doc('googleDrive');

    const driveCtx = await getDriveClientForOrg(orgId);
    if (!driveCtx) {
      throw new HttpsError('failed-precondition', t('not_connected'));
    }
    const { drive, config } = driveCtx;
    if (!config.folder_id) {
      throw new HttpsError('failed-precondition', t('folder_missing'));
    }

    try {
      const meta = await verifyFolderAccess(drive, config.folder_id);
      if (!meta.canWrite) {
        await ref.update({
          status: 'error',
          error_message: tOrg('folder_readonly_reconnect'),
          updated_at: new Date().toISOString(),
        });
        throw new HttpsError('failed-precondition', t('folder_readonly'));
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
      throw new HttpsError('internal', t('verification_failed', { msg }));
    }
  }
);
