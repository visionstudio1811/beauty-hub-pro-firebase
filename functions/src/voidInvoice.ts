import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, getOrgLanguage, isAppLanguage, makeT } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Staff-facing HttpsError messages — InvoiceHistoryViewer shows err.message in
// a toast, so they follow the caller's language. Codes + English text unchanged.
const STRINGS = defineStrings({
  en: {
    err_user_not_found: 'User not found',
    err_org_mismatch: 'Organization mismatch',
    err_admin_required: 'Admin access required',
    err_invoice_not_found: 'Invoice not found',
    err_already_voided: 'Invoice is already voided',
  },
  he: {
    err_user_not_found: 'המשתמש לא נמצא',
    err_org_mismatch: 'אי-התאמה בין הארגונים',
    err_admin_required: 'נדרשת הרשאת מנהל',
    err_invoice_not_found: 'החשבונית לא נמצאה',
    err_already_voided: 'החשבונית כבר בוטלה',
  },
});


/**
 * Caller (staff) language from the already-loaded users/{uid} doc: their own
 * preference → their OWN org's default → en. Uses userData.organizationId (the
 * verified identity), never the caller-supplied organizationId, so no other
 * tenant's org doc is read before the membership check, and users/{uid} is
 * read exactly once per invocation.
 */
async function callerLanguage(userData: FirebaseFirestore.DocumentData | undefined): Promise<AppLanguage> {
  if (isAppLanguage(userData?.language)) return userData!.language as AppLanguage;
  const ownOrg = userData?.organizationId;
  return typeof ownOrg === 'string' && ownOrg ? getOrgLanguage(ownOrg) : DEFAULT_LANGUAGE;
}

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

  // Single users/{uid} read; the language derives from it (user preference →
  // caller's own org default → en) before any caller-supplied org is touched.
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const userData = userDoc.data();
  const t = makeT(STRINGS, await callerLanguage(userData));
  if (!userDoc.exists || !userData) {
    throw new HttpsError('permission-denied', t('err_user_not_found'));
  }
  if (userData.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', t('err_org_mismatch'));
  }
  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', t('err_admin_required'));
  }

  await consumeRateLimit(organizationId, 'voidInvoice', 50);

  const invoiceRef = db
    .collection('organizations')
    .doc(organizationId)
    .collection('invoices')
    .doc(invoiceId);

  const snap = await invoiceRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', t('err_invoice_not_found'));
  }
  const invoice = snap.data()!;

  if (invoice.status === 'void') {
    throw new HttpsError('failed-precondition', t('err_already_voided'));
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
