import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

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
  if (!organizationId || !fileBase64 || !contentType) {
    throw new HttpsError('invalid-argument', 'organizationId, fileBase64, and contentType are required.');
  }

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'Caller has no profile.');
  }
  const caller = callerSnap.data()!;
  if (caller.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch.');
  }
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required.');
  }

  const ext = ALLOWED_EXT[contentType];
  if (!ext) {
    throw new HttpsError('invalid-argument', `Unsupported image type: ${contentType}`);
  }

  // Strip any data-URI prefix.
  const base64 = fileBase64.includes(',') ? fileBase64.slice(fileBase64.indexOf(',') + 1) : fileBase64;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.byteLength === 0) {
    throw new HttpsError('invalid-argument', 'Empty file.');
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new HttpsError('invalid-argument', `Image must be under ${MAX_BYTES / 1024 / 1024}MB.`);
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
