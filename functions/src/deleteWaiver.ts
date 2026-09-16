import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, getOrgLanguage, isAppLanguage, makeT } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Surfaced to staff via err.message in ClientWaiversTab, so these follow the
// caller's language (user preference → org default → en). Pure auth/argument
// errors from a malformed client stay English.
const STRINGS = defineStrings({
  en: {
    err_user_not_found: 'User not found',
    err_org_mismatch: 'Organization mismatch',
    err_admin_required: 'Admin access required',
    err_waiver_not_found: 'Waiver not found',
  },
  he: {
    err_user_not_found: 'המשתמש לא נמצא',
    err_org_mismatch: 'אי-התאמה בין הארגונים',
    err_admin_required: 'נדרשת הרשאת מנהל',
    err_waiver_not_found: 'הטופס לא נמצא',
  },
});


/**
 * Caller (staff) language from the already-loaded users/{uid} doc: their own
 * preference → their OWN org's default → en. Uses userData.organizationId (the
 * verified identity), never the caller-supplied organizationId, so no other
 * tenant's org doc is read before the membership check, and users/{uid} is
 * read exactly once per invocation.
 */
async function callerLanguage(userData: FirebaseFirestore.DocumentData | undefined): Promise<AppLanguage> {
  if (isAppLanguage(userData?.language)) return userData!.language as AppLanguage;
  const ownOrg = userData?.organizationId;
  return typeof ownOrg === 'string' && ownOrg ? getOrgLanguage(ownOrg) : DEFAULT_LANGUAGE;
}

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

  // Single users/{uid} read; the language derives from it (user preference →
  // caller's own org default → en) before any caller-supplied org is touched.
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const userData = userDoc.data();
  const t = makeT(STRINGS, await callerLanguage(userData));
  if (!userDoc.exists || !userData) {
    throw new HttpsError('permission-denied', t('err_user_not_found'));
  }
  if (userData.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', t('err_org_mismatch'));
  }
  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', t('err_admin_required'));
  }

  await consumeRateLimit(organizationId, 'deleteWaiver', 100);

  const waiverRef = db
    .collection('organizations')
    .doc(organizationId)
    .collection('clientWaivers')
    .doc(waiverId);

  const snap = await waiverRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', t('err_waiver_not_found'));
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
