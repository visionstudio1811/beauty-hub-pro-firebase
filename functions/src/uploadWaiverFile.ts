import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

interface UploadWaiverFileRequest {
  token: string;
  fileBase64: string;
  contentType: string;
  kind: 'pdf' | 'photo';
  filename?: string;
}

async function validateToken(token: string): Promise<void> {
  if (!token) throw new HttpsError('invalid-argument', 'token required');
  const snap = await db.collection('waiverTokens').doc(token).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Invalid token');
  const data = snap.data()!;
  if (data.status !== 'pending') throw new HttpsError('failed-precondition', 'Form already submitted');
  const expiresAt = data.expiresAt;
  if (expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError('failed-precondition', 'Link expired');
  }
}

export const uploadWaiverFile = onCall(
  { enforceAppCheck: false, memory: '512MiB' },
  async (request) => {
    const { token, fileBase64, contentType, kind, filename } = request.data as UploadWaiverFileRequest;

    if (!fileBase64 || !contentType || !kind) {
      throw new HttpsError('invalid-argument', 'fileBase64, contentType, kind required');
    }

    await validateToken(token);

    const buffer = Buffer.from(fileBase64, 'base64');

    let path: string;
    if (kind === 'pdf') {
      if (contentType !== 'application/pdf') throw new HttpsError('invalid-argument', 'PDF content type required');
      if (buffer.length > MAX_PDF_BYTES) throw new HttpsError('invalid-argument', 'PDF too large');
      path = `waivers/${token}.pdf`;
    } else {
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new HttpsError('invalid-argument', 'Unsupported image type');
      if (buffer.length > MAX_IMAGE_BYTES) throw new HttpsError('invalid-argument', 'Image too large');
      const safeName = (filename ?? 'photo').replace(/[^a-zA-Z0-9._-]/g, '_');
      path = `waivers/${token}/photos/${Date.now()}-${safeName}`;
    }

    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    const downloadToken = randomUUID();
    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: {
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;
    return { url, path };
  }
);
