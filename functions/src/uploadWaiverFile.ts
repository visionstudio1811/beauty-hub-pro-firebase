import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { defineStrings, makeT, normalizeLanguage, type AppLanguage } from './lib/i18n';

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

const STRINGS = defineStrings({
  en: {
    invalidToken: 'Invalid token',
    alreadySubmitted: 'Form already submitted',
    linkExpired: 'Link expired',
    uploadLimit: 'Upload limit reached for this form',
    pdfTypeRequired: 'PDF content type required',
    pdfTooLarge: 'PDF too large',
    unsupportedImage: 'Unsupported image type',
    imageTooLarge: 'Image too large',
    tokenRequired: 'token required',
    argsRequired: 'fileBase64, contentType, kind required',
  },
  he: {
    invalidToken: 'קישור לא תקין',
    alreadySubmitted: 'הטופס כבר נשלח',
    linkExpired: 'תוקף הקישור פג',
    uploadLimit: 'הגעתם למגבלת ההעלאות לטופס זה',
    pdfTypeRequired: 'נדרש קובץ מסוג PDF',
    pdfTooLarge: 'קובץ ה-PDF גדול מדי',
    unsupportedImage: 'סוג התמונה אינו נתמך',
    imageTooLarge: 'התמונה גדולה מדי',
    tokenRequired: 'נדרש קישור תקין (token)',
    argsRequired: 'נדרשים fileBase64, contentType ו-kind',
  },
});

interface UploadWaiverFileRequest {
  token: string;
  /** Optional UI language of the public form; error messages are returned in it. */
  lang?: AppLanguage;
  fileBase64: string;
  contentType: string;
  kind: 'pdf' | 'photo';
  filename?: string;
}

type T = ReturnType<typeof makeT<keyof typeof STRINGS.en>>;

async function validateToken(token: string, t: T): Promise<void> {
  if (!token) throw new HttpsError('invalid-argument', t('tokenRequired'));
  const snap = await db.collection('waiverTokens').doc(token).get();
  if (!snap.exists) throw new HttpsError('not-found', t('invalidToken'));
  const data = snap.data()!;
  if (data.status !== 'pending') throw new HttpsError('failed-precondition', t('alreadySubmitted'));
  const expiresAt = data.expiresAt;
  if (expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError('failed-precondition', t('linkExpired'));
  }
}

/**
 * Atomically claims one upload slot of the given kind against the token,
 * rejecting once the per-token cap is reached. Increments a counter field on
 * the waiverTokens/{token} doc so the public callable can't be abused to push
 * unbounded files through a single valid token.
 */
async function reserveUploadSlot(token: string, kind: 'pdf' | 'photo', t: T): Promise<void> {
  const ref = db.collection('waiverTokens').doc(token);
  const field = kind === 'pdf' ? 'pdf_upload_count' : 'photo_upload_count';
  const cap = kind === 'pdf' ? MAX_PDF_UPLOADS_PER_TOKEN : MAX_PHOTO_UPLOADS_PER_TOKEN;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', t('invalidToken'));
    const current = (snap.data()?.[field] as number) ?? 0;
    if (current >= cap) {
      throw new HttpsError('failed-precondition', t('uploadLimit'));
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
    const { token, fileBase64, contentType, kind, filename, lang } = request.data as UploadWaiverFileRequest;
    const t = makeT(STRINGS, normalizeLanguage(lang));

    if (!fileBase64 || !contentType || !kind) {
      throw new HttpsError('invalid-argument', t('argsRequired'));
    }

    await validateToken(token, t);

    const buffer = Buffer.from(fileBase64, 'base64');

    let path: string;
    if (kind === 'pdf') {
      if (contentType !== 'application/pdf') throw new HttpsError('invalid-argument', t('pdfTypeRequired'));
      if (buffer.length > MAX_PDF_BYTES) throw new HttpsError('invalid-argument', t('pdfTooLarge'));
      path = `waivers/${token}.pdf`;
    } else {
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new HttpsError('invalid-argument', t('unsupportedImage'));
      if (buffer.length > MAX_IMAGE_BYTES) throw new HttpsError('invalid-argument', t('imageTooLarge'));
      const safeName = (filename ?? 'photo').replace(/[^a-zA-Z0-9._-]/g, '_');
      path = `waivers/${token}/photos/${Date.now()}-${safeName}`;
    }

    // Claim a per-token upload slot only after MIME/size checks pass, so a
    // rejected oversize/bad-type request doesn't burn the cap. Throws
    // failed-precondition once the token's PDF/photo budget is exhausted.
    await reserveUploadSlot(token, kind, t);

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
