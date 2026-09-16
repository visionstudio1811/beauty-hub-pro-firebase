import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { defineStrings, makeT, getCallerLanguage } from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_PDF_BYTES = 5 * 1024 * 1024;

// Admin-facing HttpsError copy (surfaced by the invoice dialog). Follows the
// caller's language (users/{uid}.language, then their own org's default; never a caller-supplied orgId). The
// `unauthenticated` error is thrown before any Firestore read and stays English.
const STRINGS = defineStrings({
  en: {
    args_required: 'organizationId, invoiceId, pdfBase64 required',
    user_not_found: 'User not found',
    org_mismatch: 'Organization mismatch',
    admin_required: 'Admin role required',
    invoice_not_found: 'Invoice not found',
    pdf_too_large: 'PDF too large',
  },
  he: {
    args_required: 'נדרשים organizationId, invoiceId ו-pdfBase64',
    user_not_found: 'המשתמש לא נמצא',
    org_mismatch: 'אי-התאמה בין הארגונים',
    admin_required: 'נדרשת הרשאת מנהל',
    invoice_not_found: 'החשבונית לא נמצאה',
    pdf_too_large: 'קובץ ה-PDF גדול מדי',
  },
});

interface UploadInvoicePdfRequest {
  organizationId: string;
  invoiceId: string;
  pdfBase64: string;
}

export const uploadInvoicePdf = onCall(
  { memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const uid = request.auth.uid;
    const { organizationId, invoiceId, pdfBase64 } = request.data as UploadInvoicePdfRequest;
    const t = makeT(STRINGS, await getCallerLanguage(uid));

    if (!organizationId || !invoiceId || !pdfBase64) {
      throw new HttpsError('invalid-argument', t('args_required'));
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new HttpsError('permission-denied', t('user_not_found'));
    const userData = userDoc.data()!;
    if (userData.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', t('org_mismatch'));
    }
    if (userData.role !== 'admin') {
      throw new HttpsError('permission-denied', t('admin_required'));
    }

    const invoiceRef = db
      .collection('organizations').doc(organizationId)
      .collection('invoices').doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) throw new HttpsError('not-found', t('invoice_not_found'));
    const invoice = invoiceSnap.data()!;
    if (invoice.pdf_url) {
      return { url: invoice.pdf_url, path: invoice.pdf_storage_path, reused: true };
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    if (buffer.length > MAX_PDF_BYTES) throw new HttpsError('invalid-argument', t('pdf_too_large'));

    const path = `invoices/${organizationId}/${invoiceId}.pdf`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    const downloadToken = randomUUID();
    await file.save(buffer, {
      contentType: 'application/pdf',
      resumable: false,
      metadata: {
        contentDisposition: `attachment; filename="${(invoice.invoice_number || invoiceId)}.pdf"`,
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;

    await invoiceRef.update({ pdf_url: url, pdf_storage_path: path });

    return { url, path, reused: false };
  }
);
