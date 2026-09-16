import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID, randomInt } from 'crypto';
import { consumeRateLimit } from './rateLimit';
import { sendSms, SmsProvider } from './lib/smsProviders';
import { loadSecret } from './lib/integrationSecrets';
import {
  AppLanguage, DEFAULT_LANGUAGE, Translator,
  defineStrings, getOrgLanguage, htmlDirAttrs, isAppLanguage, makeT, orgLanguageFromData,
} from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const WAIVER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

const STRINGS = defineStrings({
  en: {
    default_title: 'Waiver',
    kind_waiver: 'waiver',
    kind_intake: 'intake form',
    kind_agreement: 'agreement',
    // "please {{action}} your {{kind}}"
    action_sign: 'sign',
    action_fill: 'fill out',
    // sentence-initial form for the OTP SMS
    action_sign_cap: 'Sign',
    action_fill_cap: 'Fill out',
    // "…sent you a <title> to {{introAction}} before your appointment"
    intro_action_sign: 'sign',
    intro_action_fill: 'fill out',
    greeting_fallback: 'there',
    org_fallback: 'your salon',
    email_subject: 'Please {{action}} your {{kind}} for {{org}}',
    email_hi: 'Hi {{name}},',
    email_intro: '{{org}} has sent you a <strong>{{title}}</strong> to {{introAction}} before your appointment.',
    email_button_form: 'Open form',
    email_button_waiver: 'Open waiver',
    email_copy_link: 'Or copy this link:',
    email_unique: 'This link is unique to you — please do not share it.',
    sms_otp: 'Hi {{name}}, your verification code for {{org}} is: {{code}}\n\n{{actionCap}} your {{kind}} here: {{url}}\n\nCode expires in 10 minutes.',
    sms_plain: 'Hi {{name}}, please {{action}} your {{kind}} for {{org}} here: {{url}}',
  },
  he: {
    default_title: 'כתב ויתור',
    kind_waiver: 'כתב הוויתור',
    kind_intake: 'טופס הקליטה',
    kind_agreement: 'ההסכם',
    action_sign: 'לחתום על',
    action_fill: 'למלא את',
    action_sign_cap: 'לחתימה על',
    action_fill_cap: 'למילוי',
    intro_action_sign: 'לחתום עליו',
    intro_action_fill: 'למלא אותו',
    greeting_fallback: 'לקוח/ה יקר/ה',
    org_fallback: 'הסלון שלך',
    email_subject: 'נא {{action}} {{kind}} עבור {{org}}',
    email_hi: 'שלום {{name}},',
    email_intro: '{{org}} שלח לך <strong>{{title}}</strong>. יש {{introAction}} לפני התור שלך.',
    email_button_form: 'פתיחת הטופס',
    email_button_waiver: 'פתיחת כתב הוויתור',
    email_copy_link: 'או להעתיק את הקישור הזה:',
    email_unique: 'הקישור הזה אישי עבורך — נא לא לשתף אותו.',
    sms_otp: 'שלום {{name}}, קוד האימות שלך עבור {{org}} הוא: {{code}}\n\n{{actionCap}} {{kind}} כאן: {{url}}\n\nהקוד תקף ל-10 דקות.',
    sms_plain: 'שלום {{name}}, נא {{action}} {{kind}} עבור {{org}} כאן: {{url}}',
  },
});

// Staff-facing copy: HttpsError messages and the success/error `message` /
// `error` fields the CRM shows verbatim in toasts (ClientWaiversTab,
// SendAgreementDialog). Follows the CALLER's language (user preference → org
// default → en), unlike STRINGS above which follow the org language because the
// client receives that copy. Error codes and English wording are unchanged.
const STAFF_STRINGS = defineStrings({
  en: {
    err_user_not_found: 'User not found',
    err_org_mismatch: 'Organization mismatch',
    err_role_required: 'Reception, staff, or admin access required',
    err_client_not_found: 'Client not found',
    err_template_not_found: 'Template not found',
    err_purchase_not_found: 'Purchase not found',
    err_no_phone: 'Client has no phone number on file',
    err_no_email: 'Client has no email on file',
    msg_device_ready: 'Waiver ready — open the link on your device',
    msg_email_sent: 'Email sent successfully',
    msg_sms_sent: 'SMS sent via {{provider}}',
    err_email_not_configured: 'Email service not configured',
    err_email_failed: 'Failed to send email: {{detail}}',
    // SMS provider failures. lib/smsProviders (owned elsewhere) throws plain
    // English Errors with fixed shapes; describeSmsError() maps each onto one of
    // these keys. English strings are byte-identical to the originals.
    err_no_provider: 'No SMS provider configured. Enable Twilio, Infobip, or Quo in Marketing → Integrations.',
    err_provider_disabled: '{{provider}} integration not configured or disabled.',
    err_provider_credentials: '{{provider}} credentials incomplete.',
    err_provider_api: '{{provider}} error{{status}}: {{detail}}',
    err_invalid_phone: 'Invalid phone number: "{{phone}}"',
    err_sms_failed: 'SMS send failed',
    err_sms_failed_detail: 'SMS send failed: {{detail}}',
  },
  he: {
    err_user_not_found: 'המשתמש לא נמצא',
    err_org_mismatch: 'אי-התאמה בין הארגונים',
    err_role_required: 'נדרשת הרשאת קבלה, צוות או מנהל',
    err_client_not_found: 'הלקוח לא נמצא',
    err_template_not_found: 'התבנית לא נמצאה',
    err_purchase_not_found: 'הרכישה לא נמצאה',
    err_no_phone: 'ללקוח אין מספר טלפון בכרטיס',
    err_no_email: 'ללקוח אין כתובת אימייל בכרטיס',
    msg_device_ready: 'הטופס מוכן — פתחו את הקישור במכשיר',
    msg_email_sent: 'האימייל נשלח בהצלחה',
    msg_sms_sent: 'ה-SMS נשלח דרך {{provider}}',
    err_email_not_configured: 'שירות האימייל לא מוגדר',
    err_email_failed: 'שליחת האימייל נכשלה: {{detail}}',
    err_no_provider: 'לא הוגדר ספק SMS. יש להפעיל Twilio, Infobip או Quo בשיווק ← אינטגרציות.',
    err_provider_disabled: 'החיבור ל-{{provider}} לא מוגדר או מושבת.',
    err_provider_credentials: 'פרטי ההתחברות ל-{{provider}} חסרים.',
    err_provider_api: 'שגיאת {{provider}}{{status}}: {{detail}}',
    err_invalid_phone: 'מספר הטלפון אינו תקין: "{{phone}}"',
    err_sms_failed: 'שליחת ה-SMS נכשלה',
    err_sms_failed_detail: 'שליחת ה-SMS נכשלה: {{detail}}',
  },
});

type StaffT = Translator<keyof typeof STAFF_STRINGS.en>;

/**
 * Localise an error thrown by lib/smsProviders sendSms(). That module throws
 * plain English Errors, so we match its known message shapes here; unknown
 * shapes are wrapped in a translated "SMS send failed:" prefix with the
 * original detail preserved. The result goes into the `error` field that
 * SendAgreementDialog / ClientWaiversTab toast verbatim.
 */
function describeSmsError(err: unknown, ts: StaffT): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (!msg) return ts('err_sms_failed');
  if (msg.startsWith('No SMS provider configured')) return ts('err_no_provider');
  let m = /^(Twilio|Infobip|Quo) integration not configured or disabled\.$/.exec(msg);
  if (m) return ts('err_provider_disabled', { provider: m[1] });
  m = /^(Twilio|Infobip|Quo) credentials incomplete\.$/.exec(msg);
  if (m) return ts('err_provider_credentials', { provider: m[1] });
  m = /^(Twilio|Infobip|Quo) error( \(\d+\))?: ([\s\S]*)$/.exec(msg);
  if (m) return ts('err_provider_api', { provider: m[1], status: m[2] ?? '', detail: m[3] });
  m = /^Invalid phone number: "([\s\S]*)"$/.exec(msg);
  if (m) return ts('err_invalid_phone', { phone: m[1] });
  return ts('err_sms_failed_detail', { detail: msg });
}

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


function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

type SendMode = 'sms' | 'email' | 'device';

interface SendWaiverRequest {
  clientId: string;
  organizationId: string;
  templateId: string;
  siteUrl?: string;
  mode?: SendMode;
  smsProvider?: SmsProvider;
  requiresOtp?: boolean;
  purchaseId?: string;
}

interface PurchaseSnapshot {
  purchaseId: string;
  packageId: string;
  packageName: string;
  packagePrice: number;
  packageSessions: number;
  purchaseDate: string;
  expiryDate: string;
}

async function loadPurchaseSnapshot(
  orgId: string,
  purchaseId: string,
): Promise<PurchaseSnapshot | null> {
  const purchaseSnap = await db
    .collection('organizations').doc(orgId)
    .collection('purchases').doc(purchaseId)
    .get();
  if (!purchaseSnap.exists) return null;
  const purchase = purchaseSnap.data()!;

  let packageName = '';
  let packageSessions = 0;
  if (purchase.package_id) {
    const pkgSnap = await db
      .collection('organizations').doc(orgId)
      .collection('packages').doc(purchase.package_id)
      .get();
    if (pkgSnap.exists) {
      const pkg = pkgSnap.data()!;
      packageName = pkg.name ?? '';
      packageSessions = pkg.total_sessions ?? 0;
    }
  }

  return {
    purchaseId,
    packageId: purchase.package_id ?? '',
    packageName,
    packagePrice: purchase.total_amount ?? 0,
    packageSessions: purchase.sessions_remaining ?? packageSessions,
    purchaseDate: purchase.purchase_date ?? '',
    expiryDate: purchase.expiry_date ?? '',
  };
}

export const sendWaiver = onCall(
  { secrets: ['RESEND_API_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

    const uid = request.auth.uid;
    const data = request.data as SendWaiverRequest;
    const { clientId, organizationId, templateId, siteUrl } = data;
    const mode: SendMode = data.mode ?? 'sms';
    const smsProvider: SmsProvider = data.smsProvider ?? 'twilio';
    const requiresOtp: boolean = data.requiresOtp ?? false;

    if (!clientId || !organizationId || !templateId)
      throw new HttpsError('invalid-argument', 'clientId, organizationId, and templateId are required');

    // Single users/{uid} read; the staff language derives from it (user
    // preference → caller's own org default → en) before any caller-supplied
    // org is touched.
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const ts = makeT(STAFF_STRINGS, await callerLanguage(userData));
    if (!userDoc.exists || !userData) throw new HttpsError('permission-denied', ts('err_user_not_found'));
    if (userData.organizationId !== organizationId)
      throw new HttpsError('permission-denied', ts('err_org_mismatch'));
    if (!['admin', 'staff', 'reception'].includes(userData.role))
      throw new HttpsError('permission-denied', ts('err_role_required'));

    await consumeRateLimit(organizationId, 'waiverSend', 200);

    const clientDoc = await db.collection('organizations').doc(organizationId).collection('clients').doc(clientId).get();
    if (!clientDoc.exists) throw new HttpsError('not-found', ts('err_client_not_found'));
    const client = clientDoc.data()!;

    // Shown verbatim in staff toasts (ClientWaiversTab / SendAgreementDialog).
    if (mode === 'sms' && !client.phone)
      throw new HttpsError('failed-precondition', ts('err_no_phone'));
    if (mode === 'email' && !client.email)
      throw new HttpsError('failed-precondition', ts('err_no_email'));

    const templateDoc = await db.collection('organizations').doc(organizationId).collection('waiverTemplates').doc(templateId).get();
    if (!templateDoc.exists) throw new HttpsError('not-found', ts('err_template_not_found'));

    // Org document is loaded once, after the client/template checks so early
    // failures skip it. It provides the org language (drives every piece of
    // CLIENT-facing copy below — SMS/email — and is stamped onto the waiver doc
    // in every mode, including 'device', because the public WaiverForm reads
    // `language` to render the signing page) and the org name. The purchase
    // snapshot lookup runs in parallel so this adds no latency.
    const [orgDoc, purchaseSnapshot] = await Promise.all([
      db.collection('organizations').doc(organizationId).get(),
      data.purchaseId ? loadPurchaseSnapshot(organizationId, data.purchaseId) : Promise.resolve(null),
    ]);
    const orgData = orgDoc.data() ?? {};
    const lang = orgLanguageFromData(orgData);
    const t = makeT(STRINGS, lang);

    const templateData = templateDoc.data() ?? {};
    const templateTitle = (templateData.title as string) ?? t('default_title');
    const templateKind = (templateData.kind as 'waiver' | 'intake' | 'agreement') ?? 'waiver';
    const kindLabel =
      templateKind === 'intake' ? t('kind_intake')
      : templateKind === 'agreement' ? t('kind_agreement')
      : t('kind_waiver');
    const kindAction = templateKind === 'intake' ? t('action_fill') : t('action_sign');
    const kindActionCap = templateKind === 'intake' ? t('action_fill_cap') : t('action_sign_cap');
    const introAction = templateKind === 'intake' ? t('intro_action_fill') : t('intro_action_sign');

    if (data.purchaseId && !purchaseSnapshot)
      throw new HttpsError('not-found', ts('err_purchase_not_found'));

    const token = randomUUID();

    const waiverRef = await db.collection('organizations').doc(organizationId).collection('clientWaivers').add({
      clientId, templateId,
      kind: templateKind,
      // Public WaiverForm reads this to render the signing page in the org's language.
      language: lang,
      clientName: client.name ?? '',
      clientEmail: client.email ?? '',
      clientPhone: client.phone ?? '',
      clientBirthday: client.birthday ?? client.dateOfBirth ?? '',
      clientAge: client.age ?? null,
      clientAddress: client.address ?? '',
      clientGender: client.gender ?? '',
      clientCity: client.city ?? '',
      clientReferralSource: client.referral_source ?? client.referralSource ?? '',
      ...(purchaseSnapshot ? {
        purchaseId: purchaseSnapshot.purchaseId,
        packageId: purchaseSnapshot.packageId,
        packageName: purchaseSnapshot.packageName,
        packagePrice: purchaseSnapshot.packagePrice,
        packageSessions: purchaseSnapshot.packageSessions,
        purchaseDate: purchaseSnapshot.purchaseDate,
        expiryDate: purchaseSnapshot.expiryDate,
      } : {}),
      status: 'pending',
      token,
      sentBy: uid,
      sentVia: mode === 'sms' ? smsProvider : mode,
      requiresOtp: mode === 'sms' && requiresOtp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('waiverTokens').doc(token).set({
      waiverId: waiverRef.id,
      organizationId,
      clientId,
      templateId,
      status: 'pending',
      requiresOtp: mode === 'sms' && requiresOtp,
      otpVerified: mode === 'sms' && requiresOtp ? false : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + WAIVER_TOKEN_TTL_MS),
    });

    const base = siteUrl || process.env.SITE_URL || 'https://beauty-hub-pro-app.web.app';
    const waiverUrl = `${base}/waiver/${token}`;
    const firstName = client.name?.split(' ')[0] || t('greeting_fallback');

    if (mode === 'device') {
      return { success: true, message: ts('msg_device_ready'), waiver_token: token, waiver_url: waiverUrl };
    }

    if (mode === 'email') {
      // Prefer per-org Resend config; fall back to global secret
      let resendKey: string | undefined;
      let fromEmail = 'noreply@beauty-hub-pro.com';
      let fromName = 'Beauty Hub Pro';

      const orgIntegrationSnap = await db
        .collection('organizations').doc(organizationId)
        .collection('marketingIntegrations').doc('resend')
        .get();

      if (orgIntegrationSnap.exists && orgIntegrationSnap.data()?.is_enabled) {
        const cfg = orgIntegrationSnap.data()!.configuration as { fromEmail?: string; fromName?: string };
        // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
        const secret = await loadSecret(organizationId, 'resend', orgIntegrationSnap.data());
        if (secret.apiKey) resendKey = secret.apiKey;
        if (cfg.fromEmail) fromEmail = cfg.fromEmail;
        if (cfg.fromName) fromName = cfg.fromName;
      }

      if (!resendKey) resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return { success: false, error: ts('err_email_not_configured'), waiver_token: token, waiver_url: waiverUrl };

      const orgName = (orgData.name as string) ?? fromName;
      const safeFirstName = escapeHtml(firstName);
      const safeOrgName = escapeHtml(orgName);
      const safeTitle = escapeHtml(templateTitle);
      const safeUrl = encodeURI(waiverUrl);
      const { dir, align } = htmlDirAttrs(lang);
      const buttonLabel = templateKind === 'intake' ? t('email_button_form') : t('email_button_waiver');

      const html =
        `<div dir="${dir}" style="text-align:${align}">` +
        `<p>${t('email_hi', { name: safeFirstName })}</p>` +
        `<p>${t('email_intro', { org: safeOrgName, title: safeTitle, introAction })}</p>` +
        `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">${buttonLabel}</a></p>` +
        `<p>${t('email_copy_link')}<br/><a href="${safeUrl}">${safeUrl}</a></p>` +
        `<p style="color:#6b7280;font-size:13px">${t('email_unique')}</p>` +
        `</div>`;

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [client.email],
          subject: t('email_subject', { action: kindAction, kind: kindLabel, org: orgName }),
          html,
        }),
      });
      if (!resendResponse.ok) return { success: false, error: ts('err_email_failed', { detail: await resendResponse.text() }), waiver_token: token, waiver_url: waiverUrl };
      return { success: true, message: ts('msg_email_sent'), waiver_token: token, waiver_url: waiverUrl };
    }

    // SMS mode — build message, optionally with OTP
    let otpCode: string | null = null;
    if (requiresOtp) {
      otpCode = randomInt(100000, 999999).toString();
      // Store OTP in a separate collection (admin-only read)
      await db.collection('otpCodes').doc(token).set({
        code: otpCode,
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
        attempts: 0,
        verified: false,
      });
    }

    const orgName = (orgData.name as string) ?? t('org_fallback');

    const messageBody = requiresOtp && otpCode
      ? t('sms_otp', { name: firstName, org: orgName, code: otpCode, actionCap: kindActionCap, kind: kindLabel, url: waiverUrl })
      : t('sms_plain', { name: firstName, action: kindAction, kind: kindLabel, org: orgName, url: waiverUrl });

    try {
      await sendSms(organizationId, client.phone, messageBody, smsProvider);
      return { success: true, message: ts('msg_sms_sent', { provider: smsProvider }), waiver_token: token, waiver_url: waiverUrl };
    } catch (err: unknown) {
      return { success: false, error: describeSmsError(err, ts), waiver_token: token, waiver_url: waiverUrl };
    }
  }
);
