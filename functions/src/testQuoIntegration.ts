import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { loadSecret } from './lib/integrationSecrets';
import { defineStrings, makeT, getCallerLanguage, getOrgLanguage } from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

interface QuoNumber {
  id?: string;
  number?: string;
}

// Staff-facing copy. Thrown HttpsError messages follow the caller's language
// (users/{uid}.language, then their own org's default; never a caller-supplied
// orgId). The `error_message` persisted on the integration doc follows the ORG
// language instead, so stored status text never depends on who ran the test.
// The `unauthenticated` error is thrown before any Firestore read and stays English.
const STRINGS = defineStrings({
  en: {
    user_not_found: 'User not found',
    org_mismatch: 'Organization mismatch',
    staff_or_admin_required: 'Staff or admin access required',
    not_configured: 'Quo integration not configured or disabled.',
    api_key_missing: 'API key is missing.',
    from_number_missing: 'From number is missing.',
    request_failed: 'Quo request failed: {{msg}}',
    quo_error: 'Quo error ({{status}}): {{body}}',
    number_not_owned: 'The number {{number}} is not a Quo number on this workspace. Use one of: {{list}}.',
    none_found: '(none found)',
  },
  he: {
    user_not_found: 'המשתמש לא נמצא',
    org_mismatch: 'אי-התאמה בין הארגונים',
    staff_or_admin_required: 'נדרשת הרשאת צוות או מנהל',
    not_configured: 'אינטגרציית Quo לא הוגדרה או שהיא מושבתת.',
    api_key_missing: 'מפתח ה-API חסר.',
    from_number_missing: 'מספר השולח חסר.',
    request_failed: 'הבקשה ל-Quo נכשלה: {{msg}}',
    quo_error: 'שגיאת Quo ({{status}}): {{body}}',
    number_not_owned: 'המספר {{number}} אינו מספר Quo בסביבת העבודה הזו. יש להשתמש באחד מהמספרים: {{list}}.',
    none_found: '(לא נמצאו מספרים)',
  },
});

/**
 * Validate an org's Quo integration by listing the workspace phone numbers.
 * This confirms the API key is valid AND that the configured `fromNumber`
 * actually belongs to the workspace — the most common misconfiguration that
 * would otherwise only surface as a 4xx on the first real send.
 */
export const testQuoIntegration = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const uid = request.auth.uid;
  const { organizationId } = request.data as { organizationId?: string };
  const t = makeT(STRINGS, await getCallerLanguage(uid));

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

  await consumeRateLimit(orgId, 'quoTest', 50);

  // Org language for text persisted on the integration doc (membership verified above).
  const tOrg = makeT(STRINGS, await getOrgLanguage(orgId));

  const snap = await db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc('quo')
    .get();

  if (!snap.exists || !snap.data()?.is_enabled) {
    throw new HttpsError('not-found', t('not_configured'));
  }

  const cfg = snap.data()!.configuration as { fromNumber?: string };
  // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
  const { apiKey } = await loadSecret(orgId, 'quo', snap.data());
  if (!apiKey) throw new HttpsError('invalid-argument', t('api_key_missing'));
  if (!cfg.fromNumber) throw new HttpsError('invalid-argument', t('from_number_missing'));

  let res: Response;
  try {
    res = await fetch('https://api.quo.com/v1/phone-numbers', {
      headers: { Authorization: apiKey },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await snap.ref.update({ status: 'disconnected', error_message: msg, updated_at: new Date().toISOString() });
    throw new HttpsError('internal', t('request_failed', { msg }));
  }

  if (!res.ok) {
    const vars = { status: res.status, body: await res.text() };
    await snap.ref.update({ status: 'disconnected', error_message: tOrg('quo_error', vars), updated_at: new Date().toISOString() });
    throw new HttpsError('internal', t('quo_error', vars));
  }

  const json = (await res.json()) as { data?: QuoNumber[] };
  const numbers = json.data ?? [];
  const owns = numbers.some((n) => n.number === cfg.fromNumber);

  if (!owns) {
    const list = numbers.map((n) => n.number).filter(Boolean).join(', ');
    await snap.ref.update({
      status: 'disconnected',
      error_message: tOrg('number_not_owned', { number: cfg.fromNumber, list: list || tOrg('none_found') }),
      updated_at: new Date().toISOString(),
    });
    throw new HttpsError('failed-precondition', t('number_not_owned', { number: cfg.fromNumber, list: list || t('none_found') }));
  }

  await snap.ref.update({
    status: 'connected',
    error_message: admin.firestore.FieldValue.delete(),
    last_tested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return { success: true };
});
