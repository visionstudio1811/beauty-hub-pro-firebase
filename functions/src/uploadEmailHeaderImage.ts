import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineStrings, makeT, getCallerLanguage } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

const ALLOWED_EXT: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

const MAX_BYTES = 8 * 1024 * 1024;

// Admin-facing HttpsError copy (surfaced as toasts in the email settings UI).
// Follows the caller's language (users/{uid}.language, then their own org's default; never a caller-supplied orgId).
// The `unauthenticated` error is thrown before any Firestore read and stays English.
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

export const uploadEmailHeaderImage = onCall({ memory: '512MiB' }, async (request) => {
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
  if (!callerSnap.exists) throw new HttpsError('permission-denied', t('no_profile'));
  const caller = callerSnap.data()!;
  if (caller.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', t('org_mismatch'));
  }
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', t('admin_required'));
  }

  const ext = ALLOWED_EXT[contentType];
  if (!ext) throw new HttpsError('invalid-argument', t('unsupported_type', { contentType }));

  const base64 = fileBase64.includes(',') ? fileBase64.slice(fileBase64.indexOf(',') + 1) : fileBase64;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength === 0) throw new HttpsError('invalid-argument', t('empty_file'));
  if (buffer.byteLength > MAX_BYTES) {
    throw new HttpsError('invalid-argument', t('too_large', { mb: MAX_BYTES / 1024 / 1024 }));
  }

  const path = `organizations/${organizationId}/marketing/email_header.${ext}`;
  const file = bucket.file(path);
  const downloadToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await file.save(buffer, {
    contentType,
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
    resumable: false,
  });

  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;

  const integrationsSnap = await db
    .collection('organizations').doc(organizationId)
    .collection('marketingIntegrations')
    .where('provider', '==', 'resend')
    .limit(1)
    .get();
  if (!integrationsSnap.empty) {
    await integrationsSnap.docs[0].ref.update({
      email_header_image_url: downloadUrl,
      updated_at: new Date().toISOString(),
    });
  } else {
    await db
      .collection('organizations').doc(organizationId)
      .collection('marketingIntegrations').doc('resend')
      .set({
        organization_id: organizationId,
        provider: 'resend',
        is_enabled: false,
        email_header_image_url: downloadUrl,
        updated_at: new Date().toISOString(),
      }, { merge: true });
  }

  return { url: downloadUrl, path };
});
