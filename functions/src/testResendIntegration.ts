import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { consumeRateLimit } from './rateLimit';
import { loadSecret } from './lib/integrationSecrets';
import { defineStrings, makeT, getCallerLanguage, htmlDirAttrs } from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Staff-facing copy: HttpsError messages surfaced by the integrations UI, plus
// the test email sent to the caller's own inbox. Follows the caller's language
// (users/{uid}.language, then their own org's default; never a caller-supplied orgId). The `unauthenticated` error is
// thrown before any Firestore read and stays English.
const STRINGS = defineStrings({
  en: {
    user_not_found: 'User not found',
    org_mismatch: 'Organization mismatch',
    staff_or_admin_required: 'Staff or admin access required',
    not_configured: 'Resend integration not configured or disabled.',
    api_key_missing: 'API key is missing.',
    from_email_missing: 'From email is missing.',
    test_subject: 'Resend Integration Test',
    test_body: 'Your Resend integration for <strong>{{fromName}}</strong> is working correctly.',
    resend_error: 'Resend error: {{msg}}',
  },
  he: {
    user_not_found: 'המשתמש לא נמצא',
    org_mismatch: 'אי-התאמה בין הארגונים',
    staff_or_admin_required: 'נדרשת הרשאת צוות או מנהל',
    not_configured: 'אינטגרציית Resend לא הוגדרה או שהיא מושבתת.',
    api_key_missing: 'מפתח ה-API חסר.',
    from_email_missing: 'כתובת האימייל של השולח חסרה.',
    test_subject: 'בדיקת אינטגרציית Resend',
    test_body: 'אינטגרציית Resend עבור <strong>{{fromName}}</strong> פועלת כשורה.',
    resend_error: 'שגיאת Resend: {{msg}}',
  },
});

export const testResendIntegration = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const uid = request.auth.uid;
  const { organizationId } = request.data as { organizationId?: string };
  const lang = await getCallerLanguage(uid);
  const t = makeT(STRINGS, lang);

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', t('user_not_found'));

  const userData = userDoc.data()!;
  const orgId = organizationId || userData.organizationId;

  if (!orgId || userData.organizationId !== orgId) {
    throw new HttpsError('permission-denied', t('org_mismatch'));
  }
  if (!['admin', 'staff'].includes(userData.role)) {
    throw new HttpsError('permission-denied', t('staff_or_admin_required'));
  }

  await consumeRateLimit(orgId, 'resendTest', 50);

  const snap = await db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc('resend')
    .get();

  if (!snap.exists || !snap.data()?.is_enabled) {
    throw new HttpsError('not-found', t('not_configured'));
  }

  const cfg = snap.data()!.configuration as { fromEmail?: string; fromName?: string };
  // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
  const { apiKey } = await loadSecret(orgId, 'resend', snap.data());

  if (!apiKey) throw new HttpsError('invalid-argument', t('api_key_missing'));
  if (!cfg.fromEmail) throw new HttpsError('invalid-argument', t('from_email_missing'));

  const resend = new Resend(apiKey);
  const fromName = cfg.fromName || 'Beauty Hub Pro';
  const { dir, align } = htmlDirAttrs(lang);

  const result = await resend.emails.send({
    from: `${fromName} <${cfg.fromEmail}>`,
    to: [userData.email],
    subject: t('test_subject'),
    html: `<p dir="${dir}" style="text-align:${align}">${t('test_body', { fromName })}</p>`,
  });

  if (result.error) {
    const msg = (result.error as any)?.message || JSON.stringify(result.error);
    // Update status to disconnected with error
    await snap.ref.update({ status: 'disconnected', error_message: msg, updated_at: new Date().toISOString() });
    throw new HttpsError('internal', t('resend_error', { msg }));
  }

  await snap.ref.update({ status: 'connected', error_message: admin.firestore.FieldValue.delete(), updated_at: new Date().toISOString() });

  return { success: true };
});
