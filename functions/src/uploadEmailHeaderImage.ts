import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

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

export const uploadEmailHeaderImage = onCall({ memory: '512MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const { organizationId, fileBase64, contentType } = (request.data ?? {}) as {
    organizationId?: string;
    fileBase64?: string;
    contentType?: string;
  };
  if (!organizationId || !fileBase64 || !contentType) {
    throw new HttpsError('invalid-argument', 'organizationId, fileBase64, and contentType are required.');
  }

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists) throw new HttpsError('permission-denied', 'Caller has no profile.');
  const caller = callerSnap.data()!;
  if (caller.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch.');
  }
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required.');
  }

  const ext = ALLOWED_EXT[contentType];
  if (!ext) throw new HttpsError('invalid-argument', `Unsupported image type: ${contentType}`);

  const base64 = fileBase64.includes(',') ? fileBase64.slice(fileBase64.indexOf(',') + 1) : fileBase64;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength === 0) throw new HttpsError('invalid-argument', 'Empty file.');
  if (buffer.byteLength > MAX_BYTES) {
    throw new HttpsError('invalid-argument', `Image must be under ${MAX_BYTES / 1024 / 1024}MB.`);
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
