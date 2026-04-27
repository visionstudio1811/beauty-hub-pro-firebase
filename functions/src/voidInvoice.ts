import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface VoidInvoiceRequest {
  organizationId: string;
  invoiceId: string;
}

// Flips an issued invoice to voided. Invoice numbers are never reused —
// voiding is the accepted path to "cancel" a bad invoice while preserving
// the audit trail. Once voided, cannot be un-voided.
export const voidInvoice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const { organizationId, invoiceId } = request.data as VoidInvoiceRequest;
  if (!organizationId || !invoiceId) {
    throw new HttpsError('invalid-argument', 'organizationId and invoiceId are required');
  }

  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('permission-denied', 'User not found');
  }
  const userData = userDoc.data()!;
  if (userData.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  await consumeRateLimit(organizationId, 'voidInvoice', 50);

  const invoiceRef = db
    .collection('organizations')
    .doc(organizationId)
    .collection('invoices')
    .doc(invoiceId);

  const snap = await invoiceRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Invoice not found');
  }
  const invoice = snap.data()!;

  if (invoice.status === 'void') {
    throw new HttpsError('failed-precondition', 'Invoice is already voided');
  }

  const voidedAt = admin.firestore.Timestamp.now();
  await invoiceRef.update({
    status: 'void',
    voided_at: voidedAt,
    voided_by: request.auth.uid,
  });

  const updated = await invoiceRef.get();
  return { invoice: { id: invoiceRef.id, ...updated.data() } };
});
