import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// Per-token upload caps. The callable is public (no App Check), so a single
// valid token must not permit unbounded 15MB uploads. A completed waiver needs
// at most one rendered PDF plus a handful of ID/consent photos.
const MAX_PDF_UPLOADS_PER_TOKEN = 1;
const MAX_PHOTO_UPLOADS_PER_TOKEN = 10;

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

/**
 * Atomically claims one upload slot of the given kind against the token,
 * rejecting once the per-token cap is reached. Increments a counter field on
 * the waiverTokens/{token} doc so the public callable can't be abused to push
 * unbounded files through a single valid token.
 */
async function reserveUploadSlot(token: string, kind: 'pdf' | 'photo'): Promise<void> {
  const ref = db.collection('waiverTokens').doc(token);
  const field = kind === 'pdf' ? 'pdf_upload_count' : 'photo_upload_count';
  const cap = kind === 'pdf' ? MAX_PDF_UPLOADS_PER_TOKEN : MAX_PHOTO_UPLOADS_PER_TOKEN;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Invalid token');
    const current = (snap.data()?.[field] as number) ?? 0;
    if (current >= cap) {
      throw new HttpsError('failed-precondition', 'Upload limit reached for this form');
    }
    tx.update(ref, {
      [field]: current + 1,
      lastUploadAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
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

    // Claim a per-token upload slot only after MIME/size checks pass, so a
    // rejected oversize/bad-type request doesn't burn the cap. Throws
    // failed-precondition once the token's PDF/photo budget is exhausted.
    await reserveUploadSlot(token, kind);

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
