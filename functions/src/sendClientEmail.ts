import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { consumeRateLimit } from './rateLimit';
import { loadSecret } from './lib/integrationSecrets';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, getOrgLanguage, isAppLanguage, localeFor, makeT, orgLanguageFromData } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Staff-facing copy: HttpsError messages + the success `message`, which the
// send-email dialog shows verbatim in toasts. Follows the CALLER's language
// (user preference → org default → en). The email body itself follows the org
// language (see `lang` below) because the client receives it. Error codes and
// English wording are unchanged; malformed-payload errors stay English.
const STRINGS = defineStrings({
  en: {
    msg_sent: 'Email sent successfully',
    err_invalid_recipient: 'Invalid recipient email address',
    err_subject_too_long: 'Subject too long (max 200 characters)',
    err_user_not_found: 'User not found',
    err_org_mismatch: 'Organization mismatch',
    err_role_required: 'Reception, staff, or admin access required to send emails',
    // Actionable staff copy rendered in the send-email toast (caller shows err.message).
    err_no_email_config: 'No email configuration found. Please configure Resend integration in Settings.',
    err_api_key_missing: 'Email API key not configured',
    // Prefix for a Resend API failure; {{detail}} is the vendor's own message.
    err_resend: 'Resend error: {{detail}}',
  },
  he: {
    msg_sent: 'האימייל נשלח בהצלחה',
    err_invalid_recipient: 'כתובת האימייל של הנמען אינה תקינה',
    err_subject_too_long: 'שורת הנושא ארוכה מדי (עד 200 תווים)',
    err_user_not_found: 'המשתמש לא נמצא',
    err_org_mismatch: 'אי-התאמה בין הארגונים',
    err_role_required: 'לשליחת אימיילים נדרשת הרשאת קבלה, צוות או מנהל',
    err_no_email_config: 'לא נמצאה הגדרת אימייל. יש להגדיר את חיבור Resend בהגדרות.',
    err_api_key_missing: 'מפתח ה-API של האימייל לא מוגדר',
    err_resend: 'שגיאת Resend: {{detail}}',
  },
});

// Fallback wrappers used only when the org has not designed an email template.
// Org-designed templates (email_templates.*) are used verbatim in any language.
const DEFAULT_TEMPLATE_HTML = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#1a1a1a">{{subject}}</h2>
  <p>Hi {{client_name}},</p>
  <div style="line-height:1.6">{{message}}</div>
  <br>
  <p style="color:#666;font-size:13px">— {{organization_name}}</p>
</body></html>`;

const DEFAULT_TEMPLATE_HTML_HE = `
<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head>
<body dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;direction:rtl;text-align:right">
  <h2 style="color:#1a1a1a">{{subject}}</h2>
  <p>שלום {{client_name}},</p>
  <div style="line-height:1.6">{{message}}</div>
  <br>
  <p style="color:#666;font-size:13px">— {{organization_name}}</p>
</body></html>`;


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

interface EmailRequest {
  to: string;
  subject: string;
  message: string;
  clientId: string;
  organizationId: string;
  templateType?: string;
  variables?: Record<string, string>;
}

interface EmailConfig {
  fromName?: string;
  fromEmail?: string;
  apiKey?: string;
}

/** Escape HTML entities to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTemplate(html: string, variables: Record<string, string>): string {
  let rendered = html;

  // Resolve conditionals BEFORE simple variable substitution so a truthy
  // {{#if x}} block can still contain {{x}} placeholders that need rendering.
  // Handles {{#if x}}A{{else}}B{{/if}} first, then simple {{#if x}}A{{/if}}.
  rendered = rendered.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, varName, ifContent, elseContent) => (variables[varName] ? ifContent : elseContent)
  );
  rendered = rendered.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_m, varName, content) => (variables[varName] ? content : '')
  );

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    // Escape all variable values before injection to prevent HTML injection
    rendered = rendered.replace(regex, escapeHtml(String(value ?? '')));
  }

  // Remove any remaining unresolved placeholders
  rendered = rendered.replace(/\{\{[^}]*\}\}/g, '');

  return rendered;
}

export const sendClientEmail = onCall(
  { secrets: ['RESEND_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Unauthorized');
    }

    const uid = request.auth.uid;
    const data = request.data as EmailRequest;
    const { to, subject, message, clientId, organizationId, templateType = 'general', variables = {} } = data;

    // Input validation
    if (!to || !subject || !organizationId) {
      throw new HttpsError('invalid-argument', 'Missing required fields: to, subject, organizationId');
    }

    // Caller lookup first: the staff language derives from it (user preference
    // → caller's own org default → en), so the caller-supplied organizationId
    // is never read before the membership check below. Read-only otherwise.
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const t = makeT(STRINGS, await callerLanguage(userData));

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new HttpsError('invalid-argument', t('err_invalid_recipient'));
    }
    if (subject.length > 200) {
      throw new HttpsError('invalid-argument', t('err_subject_too_long'));
    }

    // Verify user belongs to organization AND has staff/admin role
    if (!userDoc.exists || !userData) {
      throw new HttpsError('permission-denied', t('err_user_not_found'));
    }
    if (userData.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', t('err_org_mismatch'));
    }
    if (!['admin', 'staff', 'reception'].includes(userData.role)) {
      throw new HttpsError('permission-denied', t('err_role_required'));
    }

    // Per-org daily cap: blocks runaway loops and Resend spend abuse.
    await consumeRateLimit(organizationId, 'clientEmail', 500);

    // Org doc: its language drives the CLIENT-facing email copy (default
    // template variant + date locale), since the client receives the email.
    const orgDoc = await db.collection('organizations').doc(organizationId).get();
    const orgData = orgDoc.data() || {};
    const lang = orgLanguageFromData(orgData);
    const locale = localeFor(lang);

    const configSnapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('marketingIntegrations')
      .where('provider', '==', 'resend')
      .where('is_enabled', '==', true)
      .limit(1)
      .get();

    if (configSnapshot.empty) {
      throw new HttpsError('not-found', t('err_no_email_config'));
    }

    const emailConfig = configSnapshot.docs[0].data();
    const config = emailConfig.configuration as EmailConfig;
    const fromName = config.fromName || 'Beauty Hub Pro';
    const fromEmail = config.fromEmail || 'info@beautyhubpro.com';
    // apiKey now lives in the write-only secret subdoc (legacy
    // configuration.apiKey is the fallback for un-migrated orgs).
    const { apiKey } = await loadSecret(organizationId, 'resend', emailConfig);

    if (!apiKey) {
      throw new HttpsError('internal', t('err_api_key_missing'));
    }

    let clientName = to.split('@')[0];
    if (clientId) {
      const clientDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('clients')
        .doc(clientId)
        .get();
      if (clientDoc.exists) {
        clientName = clientDoc.data()?.name || clientName;
      }
    }

    const emailTemplates = emailConfig.email_templates || {};
    const template = emailTemplates[templateType] || emailTemplates['general'] || emailTemplates['default'];
    const templateHtml = template?.html || (lang === 'he' ? DEFAULT_TEMPLATE_HTML_HE : DEFAULT_TEMPLATE_HTML);
    const templateSettings = (template?.settings ?? {}) as Record<string, string>;
    const headerImageUrl: string = (emailConfig.email_header_image_url as string | undefined) ?? '';

    // All values in templateVariables must be strings (enforced by type)
    const orgTimezone = orgData.timezone || 'America/New_York';
    const templateVariables: Record<string, string> = {
      // Per-template design tokens (primary_color, background_color, signature, etc.)
      // come first so call-site `variables` can still override if explicitly set.
      ...Object.fromEntries(
        Object.entries(templateSettings).map(([k, v]) => [k, String(v ?? '')])
      ),
      subject,
      message: message.replace(/\n/g, '<br>'),
      client_name: clientName,
      organization_name: String(orgData.name || fromName),
      organization_phone: String(orgData.phone || ''),
      organization_address: String(orgData.address || ''),
      organization_email: String(orgData.email || fromEmail || ''),
      logo_url: String(orgData.logo_url || ''),
      header_image_url: headerImageUrl,
      sender_name: fromName,
      from_email: fromEmail,
      cta_url: '',
      date: new Date().toLocaleDateString(locale, { timeZone: orgTimezone }),
      datetime: new Date().toLocaleString(locale, { timeZone: orgTimezone }),
      ...Object.fromEntries(
        Object.entries(variables).map(([k, v]) => [k, String(v ?? '')])
      ),
    };

    const emailHtml = renderTemplate(templateHtml, templateVariables);

    const resend = new Resend(apiKey);
    const emailResponse = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html: emailHtml,
    });

    if (emailResponse.error) {
      const resendMsg = (emailResponse.error as any)?.message || JSON.stringify(emailResponse.error);
      throw new HttpsError('internal', t('err_resend', { detail: resendMsg }));
    }

    await db
      .collection('organizations')
      .doc(organizationId)
      .collection('clientCommunications')
      .add({
        clientId,
        type: 'email',
        status: 'delivered',
        subject,
        to,
        messageId: emailResponse.data?.id,
        sentBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: true, messageId: emailResponse.data?.id, message: t('msg_sent') };
  }
);
