import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { resolveProvider, sendSms, ensureOptOutSuffix } from './lib/smsProviders';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, getOrgLanguage, isAppLanguage, makeT, Translator } from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Only the carrier opt-out footer is generated here; the message body is staff-authored.
// This is CLIENT-facing copy, so it follows the org language (see withOptOutSuffix).
const STRINGS = defineStrings({
  en: { optOutSuffix: 'Reply STOP to unsubscribe.' },
  he: { optOutSuffix: 'להסרה השיבו STOP.' },
});

// Staff-facing HttpsError messages — the quick-SMS dialog shows err.message
// verbatim in a toast, so they follow the CALLER's language (user preference →
// org default → en). Codes + English wording unchanged; malformed-payload
// errors stay English. Errors thrown by lib/smsProviders are plain Errors with
// fixed English shapes; describeSmsError() below maps each shape onto one of
// the err_provider_* keys so Hebrew staff never see raw English. The English
// strings are byte-identical to the smsProviders originals.
const STAFF_STRINGS = defineStrings({
  en: {
    err_message_too_long: 'Message too long (max 1600 characters)',
    err_user_not_found: 'User not found',
    err_org_mismatch: 'Organization mismatch',
    err_role_required: 'Reception, staff, or admin access required to send SMS',
    err_opted_out: 'This client has opted out of SMS.',
    err_no_provider: 'No SMS provider configured. Enable Twilio, Infobip, or Quo in Marketing → Integrations.',
    err_provider_disabled: '{{provider}} integration not configured or disabled.',
    err_provider_credentials: '{{provider}} credentials incomplete.',
    err_provider_api: '{{provider}} error{{status}}: {{detail}}',
    err_invalid_phone: 'Invalid phone number: "{{phone}}"',
    err_send_failed: 'SMS send failed',
    err_send_failed_detail: 'SMS send failed: {{detail}}',
  },
  he: {
    err_message_too_long: 'ההודעה ארוכה מדי (עד 1600 תווים)',
    err_user_not_found: 'המשתמש לא נמצא',
    err_org_mismatch: 'אי-התאמה בין הארגונים',
    err_role_required: 'לשליחת SMS נדרשת הרשאת קבלה, צוות או מנהל',
    err_opted_out: 'לקוח זה ביקש להסיר את עצמו מקבלת SMS.',
    err_no_provider: 'לא הוגדר ספק SMS. יש להפעיל Twilio, Infobip או Quo בשיווק ← אינטגרציות.',
    err_provider_disabled: 'החיבור ל-{{provider}} לא מוגדר או מושבת.',
    err_provider_credentials: 'פרטי ההתחברות ל-{{provider}} חסרים.',
    err_provider_api: 'שגיאת {{provider}}{{status}}: {{detail}}',
    err_invalid_phone: 'מספר הטלפון אינו תקין: "{{phone}}"',
    err_send_failed: 'שליחת ה-SMS נכשלה',
    err_send_failed_detail: 'שליחת ה-SMS נכשלה: {{detail}}',
  },
});

type StaffT = Translator<keyof typeof STAFF_STRINGS.en>;

/**
 * Localise an error thrown by lib/smsProviders (resolveProvider / sendSms).
 * That module is owned elsewhere and throws plain English Errors, so we match
 * its known message shapes here. Unknown shapes are wrapped in a translated
 * "SMS send failed:" prefix with the original detail preserved.
 */
function describeSmsError(err: unknown, ts: StaffT): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!msg) return ts('err_send_failed');
  if (msg.startsWith('No SMS provider configured')) return ts('err_no_provider');
  let m = /^(Twilio|Infobip|Quo) integration not configured or disabled\.$/.exec(msg);
  if (m) return ts('err_provider_disabled', { provider: m[1] });
  m = /^(Twilio|Infobip|Quo) credentials incomplete\.$/.exec(msg);
  if (m) return ts('err_provider_credentials', { provider: m[1] });
  m = /^(Twilio|Infobip|Quo) error( \(\d+\))?: ([\s\S]*)$/.exec(msg);
  if (m) return ts('err_provider_api', { provider: m[1], status: m[2] ?? '', detail: m[3] });
  m = /^Invalid phone number: "([\s\S]*)"$/.exec(msg);
  if (m) return ts('err_invalid_phone', { phone: m[1] });
  return ts('err_send_failed_detail', { detail: msg });
}

/**
 * Caller (staff) language from the already-loaded users/{uid} doc: their own
 * preference → their OWN org's default → en. Uses userData.organizationId (the
 * verified identity), never the caller-supplied organizationId, so no other
 * tenant's org doc is read before the membership check.
 */
async function callerLanguage(userData: FirebaseFirestore.DocumentData | undefined): Promise<AppLanguage> {
  if (isAppLanguage(userData?.language)) return userData!.language as AppLanguage;
  const ownOrg = userData?.organizationId;
  return typeof ownOrg === 'string' && ownOrg ? getOrgLanguage(ownOrg) : DEFAULT_LANGUAGE;
}

/**
 * Mirrors STOP_REGEX in lib/smsProviders (not exported; module owned elsewhere)
 * and additionally recognises the Hebrew footer, so both language branches use
 * the same "footer already present" test. A body that merely contains the word
 * "stop" (e.g. "stop by the salon") still gets a footer.
 */
const OPT_OUT_PRESENT_REGEX =
  /reply\s+stop|text\s+stop|stop\s+to\s+(unsubscribe|opt\s*out)|להסרה\s+השיבו\s+STOP/i;

/**
 * Carrier opt-out footer in the org's language. English goes through the shared
 * ensureOptOutSuffix(); Hebrew appends a Hebrew instruction that keeps the
 * literal STOP keyword, because carriers (and quoWebhook's STOP_WORDS) only
 * recognise the English keyword for opt-out.
 */
function withOptOutSuffix(body: string, lang: AppLanguage): string {
  if (lang === DEFAULT_LANGUAGE) return ensureOptOutSuffix(body);
  if (OPT_OUT_PRESENT_REGEX.test(body)) return body;
  return `${body.replace(/\s+$/, '')} ${makeT(STRINGS, lang)('optOutSuffix')}`;
}

interface SmsRequest {
  to?: string;
  message?: string;
  clientId?: string;
  organizationId?: string;
  /** When true, append the "Reply STOP to unsubscribe" footer (marketing). */
  marketing?: boolean;
}

/**
 * Staff/reception one-off SMS to a client, mirroring sendClientEmail. Resolves
 * the org's SMS provider, respects the client's sms_opt_out flag, applies the
 * per-org daily cap, and logs to clientCommunications so it appears in history.
 */
export const sendClientSms = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const uid = request.auth.uid;
  const { to, message, clientId, organizationId, marketing } = request.data as SmsRequest;

  if (!to || !message || !organizationId) {
    throw new HttpsError('invalid-argument', 'Missing required fields: to, message, organizationId');
  }

  // Caller lookup first; the staff language derives from it (user preference →
  // caller's own org default → en) so language resolution never reads a
  // caller-supplied org before the membership check below.
  const userDoc = await db.collection('users').doc(uid).get();
  const userData = userDoc.data();
  const ts = makeT(STAFF_STRINGS, await callerLanguage(userData));

  if (message.length > 1600) {
    throw new HttpsError('invalid-argument', ts('err_message_too_long'));
  }

  if (!userDoc.exists || !userData) throw new HttpsError('permission-denied', ts('err_user_not_found'));
  if (userData.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', ts('err_org_mismatch'));
  }
  if (!['admin', 'staff', 'reception'].includes(userData.role)) {
    throw new HttpsError('permission-denied', ts('err_role_required'));
  }

  await consumeRateLimit(organizationId, 'clientQuickSms', 500);

  // Respect opt-out.
  if (clientId) {
    const clientDoc = await db
      .collection('organizations').doc(organizationId).collection('clients').doc(clientId).get();
    if (clientDoc.exists && clientDoc.data()?.sms_opt_out === true) {
      throw new HttpsError('failed-precondition', ts('err_opted_out'));
    }
  }

  let provider;
  try {
    provider = await resolveProvider(organizationId);
  } catch (err) {
    throw new HttpsError('failed-precondition', describeSmsError(err, ts));
  }

  const body = marketing ? withOptOutSuffix(message, await getOrgLanguage(organizationId)) : message;

  try {
    await sendSms(organizationId, to, body, provider);
  } catch (err) {
    throw new HttpsError('internal', describeSmsError(err, ts));
  }

  await db.collection('organizations').doc(organizationId).collection('clientCommunications').add({
    client_id: clientId || null,
    type: 'sms',
    direction: 'outbound',
    status: 'delivered',
    message: body,
    to,
    sentBy: uid,
    source: provider,
    sent_at: new Date().toISOString(),
    sent_at_ts: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, provider };
});
