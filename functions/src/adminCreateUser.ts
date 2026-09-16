import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, getOrgLanguage, isAppLanguage, makeT } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Staff-facing copy: HttpsError messages + the success `message`, which the
// user-management UI shows verbatim in toasts. Follows the CALLER's language
// (user preference → org default → en). Codes + English wording unchanged; the
// role-enum error can only fire from a malformed client and stays English.
const STRINGS = defineStrings({
  en: {
    err_missing_fields: 'Missing required fields',
    err_invalid_email: 'Invalid email address',
    err_admin_required: 'Admin access required',
    err_org_mismatch: 'Organization mismatch',
    msg_created: 'User created successfully',
    err_email_exists: 'A user with this email already exists',
    err_weak_password: 'Password is too weak — generate a new one and retry',
    err_create_failed: 'Failed to create user account',
  },
  he: {
    err_missing_fields: 'חסרים שדות חובה',
    err_invalid_email: 'כתובת האימייל אינה תקינה',
    err_admin_required: 'נדרשת הרשאת מנהל',
    err_org_mismatch: 'אי-התאמה בין הארגונים',
    msg_created: 'המשתמש נוצר בהצלחה',
    err_email_exists: 'כבר קיים משתמש עם כתובת האימייל הזו',
    err_weak_password: 'הסיסמה חלשה מדי — יש ליצור סיסמה חדשה ולנסות שוב',
    err_create_failed: 'יצירת חשבון המשתמש נכשלה',
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

interface CreateUserRequest {
  email: string;
  phone?: string;
  fullName: string;
  role: 'admin' | 'staff' | 'reception' | 'beautician';
  organizationId: string;
  organizationRole?: string;
  password?: string;
}

const VALID_ROLES = new Set(['admin', 'staff', 'reception', 'beautician']);

export const adminCreateUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const data = request.data as CreateUserRequest;

  // Caller lookup first: the language derives from it (user preference →
  // caller's own org default → en), so the caller-supplied organizationId is
  // never read before the admin/membership checks below.
  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  const callerData = callerDoc.data();
  const t = makeT(STRINGS, await callerLanguage(callerData));

  if (!data.email || !data.fullName || !data.role || !data.organizationId) {
    throw new HttpsError('invalid-argument', t('err_missing_fields'));
  }
  if (!VALID_ROLES.has(data.role)) {
    throw new HttpsError('invalid-argument', `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new HttpsError('invalid-argument', t('err_invalid_email'));
  }

  if (!callerDoc.exists || callerData?.role !== 'admin') {
    throw new HttpsError('permission-denied', t('err_admin_required'));
  }
  if (callerData?.organizationId !== data.organizationId) {
    throw new HttpsError('permission-denied', t('err_org_mismatch'));
  }

  const { email, phone, fullName, role, organizationId, organizationRole, password } = data;

  try {
    const securePassword = password || randomBytes(16).toString('hex');

    // Phone is stored in Firestore on the user doc only — we don't push it to
    // Firebase Auth's phoneNumber field because that requires E.164 format and
    // enforces uniqueness across the project. Local-format numbers
    // (e.g. "0524028264") would otherwise fail with auth/invalid-phone-number.
    const userRecord = await admin.auth().createUser({
      email,
      displayName: fullName,
      password: securePassword,
      emailVerified: true,
    });

    await db.collection('users').doc(userRecord.uid).set({
      email,
      phone: phone || '',
      fullName,
      role,
      organizationId,
      organizationRole: organizationRole || null,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, uid: userRecord.uid, message: t('msg_created') };
  } catch (error: any) {
    // Log the underlying error so future failures aren't opaque. The thrown
    // HttpsError stays generic to avoid leaking auth details to the client.
    console.error('adminCreateUser failed', {
      code: error?.code,
      message: error?.message,
      email,
    });
    const safeMessage = error.code === 'auth/email-already-exists'
      ? t('err_email_exists')
      : error.code === 'auth/invalid-email'
      ? t('err_invalid_email')
      : error.code === 'auth/weak-password'
      ? t('err_weak_password')
      : t('err_create_failed');
    throw new HttpsError('internal', safeMessage);
  }
});
