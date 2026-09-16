import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineStrings, makeT, getCallerLanguage } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

const ALLOWED_EXT: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/gif':     'gif',
};

const MAX_BYTES = 5 * 1024 * 1024;

// Admin-facing HttpsError copy (surfaced as toasts by LogoManagement). Follows
// the caller's language (users/{uid}.language, then their own org's default; never a caller-supplied orgId). The
// `unauthenticated` error is thrown before any Firestore read and stays English.
const STRINGS = defineStrings({
  en: {
    args_required: 'organizationId, fileBase64, and contentType are required.',
    no_profile: 'Caller has no profile.',
    org_mismatch: 'Organization mismatch.',
    admin_required: 'Admin role required.',
    unsupported_type: 'Unsupported image type: {{contentType}}',
    empty_file: 'Empty file.',
    too_large: 'Image must be under {{mb}}MB.',
  },
  he: {
    args_required: 'נדרשים organizationId, fileBase64 ו-contentType.',
    no_profile: 'למשתמש המבצע אין פרופיל.',
    org_mismatch: 'אי-התאמה בין הארגונים.',
    admin_required: 'נדרשת הרשאת מנהל.',
    unsupported_type: 'סוג תמונה לא נתמך: {{contentType}}',
    empty_file: 'הקובץ ריק.',
    too_large: 'גודל התמונה חייב להיות פחות מ-{{mb}}MB.',
  },
});

/**
 * Admin-only org logo upload. The client sends the file as a base64 data URI
 * or raw base64 + contentType; we validate role + size + MIME server-side
 * and write to Storage via the Admin SDK (bypasses Storage rules), then
 * stamp `logo_url` on the org doc.
 *
 * This sidesteps the cross-service `firestore.get()` lookup that Storage
 * rules need to verify role — that lookup has been unreliable in practice.
 */
export const uploadOrgLogo = onCall({ memory: '512MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const { organizationId, fileBase64, contentType } = (request.data ?? {}) as {
    organizationId?: string;
    fileBase64?: string;
    contentType?: string;
  };
  const t = makeT(STRINGS, await getCallerLanguage(request.auth.uid));
  if (!organizationId || !fileBase64 || !contentType) {
    throw new HttpsError('invalid-argument', t('args_required'));
  }

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', t('no_profile'));
  }
  const caller = callerSnap.data()!;
  if (caller.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', t('org_mismatch'));
  }
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', t('admin_required'));
  }

  const ext = ALLOWED_EXT[contentType];
  if (!ext) {
    throw new HttpsError('invalid-argument', t('unsupported_type', { contentType }));
  }

  // Strip any data-URI prefix.
  const base64 = fileBase64.includes(',') ? fileBase64.slice(fileBase64.indexOf(',') + 1) : fileBase64;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength === 0) {
    throw new HttpsError('invalid-argument', t('empty_file'));
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new HttpsError('invalid-argument', t('too_large', { mb: MAX_BYTES / 1024 / 1024 }));
  }

  const path = `organizations/${organizationId}/logo/logo.${ext}`;
  const file = bucket.file(path);
  const downloadToken = (admin.firestore as unknown as { v4?: () => string }).v4
    ? (admin.firestore as unknown as { v4: () => string }).v4()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await file.save(buffer, {
    contentType,
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
    resumable: false,
  });

  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;

  await db.collection('organizations').doc(organizationId).update({
    logo_url: downloadUrl,
    updated_at: new Date().toISOString(),
  });

  return { url: downloadUrl, path };
});
