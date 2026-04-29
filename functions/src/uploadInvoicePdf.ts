import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_PDF_BYTES = 5 * 1024 * 1024;

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

    if (!organizationId || !invoiceId || !pdfBase64) {
      throw new HttpsError('invalid-argument', 'organizationId, invoiceId, pdfBase64 required');
    }

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
    const userData = userDoc.data()!;
    if (userData.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Organization mismatch');
    }
    if (userData.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin role required');
    }

    const invoiceRef = db
      .collection('organizations').doc(organizationId)
      .collection('invoices').doc(invoiceId);
    const invoiceSnap = await invoiceRef.get();
    if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Invoice not found');
    const invoice = invoiceSnap.data()!;
    if (invoice.pdf_url) {
      return { url: invoice.pdf_url, path: invoice.pdf_storage_path, reused: true };
    }

    const buffer = Buffer.from(pdfBase64, 'base64');
    if (buffer.length > MAX_PDF_BYTES) throw new HttpsError('invalid-argument', 'PDF too large');

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
