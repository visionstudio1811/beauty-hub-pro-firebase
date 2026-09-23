import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from '../rateLimit';
import {
  AutomationDoc,
  formatDateForDisplay,
  formatTimeForDisplay,
  getActiveEmailAutomation,
  isValidEmail,
  renderAndSend,
  renderAutomationContent,
  resolveEmailContext,
} from '../scheduling/bookingEmailSend';
import { ensureOptOutSuffix, resolveProvider, sendSms, SmsProvider } from '../lib/smsProviders';
import { portalUrlForOrg } from '../lib/portalUrl';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, makeT, orgLanguageFromData } from '../lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const TRIGGER = 'appointment_completed';
const TEMPLATE_KEY = 'appointment_completed';
const SEND_KIND = 'system:appointmentCompleted:feedback_invite';
const SMS_DAILY_LIMIT = 300;

// Client-facing copy in the org's language. The email subject/body are the
// org-authored automation; only the SMS default and merge-tag fallbacks live here.
const STRINGS = defineStrings({
  en: {
    fallbackName: 'there',
    fallbackTreatment: 'your visit',
    smsInvite: 'Hi [NAME], thank you for visiting [ORG]! How was your [TREATMENT]? Share your feedback here: [FEEDBACK_URL]',
    optOutSuffix: 'Reply STOP to unsubscribe.',
  },
  he: {
    // Fills the [NAME] slot inside 'שלום [NAME], …' copy, so it must read as a name-like noun.
    fallbackName: 'לקוח/ה יקר/ה',
    fallbackTreatment: 'הביקור שלך',
    smsInvite: 'שלום [NAME], תודה שביקרת ב-[ORG]! איך היה [TREATMENT]? נשמח למשוב קצר כאן: [FEEDBACK_URL]',
    optOutSuffix: 'להסרה השיבו STOP.',
  },
});

interface AppointmentDoc {
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  treatment_name?: string;
  staff_name?: string;
  appointment_date?: string;
  appointment_time?: string;
  status?: string;
  sms_opt_out?: boolean;
  feedback_invite_sent_at?: unknown;
}

function withOptOutSuffix(body: string, lang: AppLanguage): string {
  if (lang === DEFAULT_LANGUAGE) return ensureOptOutSuffix(body);
  if (/\bSTOP\b/i.test(body)) return body;
  return `${body.replace(/\s+$/, '')} ${makeT(STRINGS, lang)('optOutSuffix')}`;
}

async function getActiveSmsAutomation(orgId: string): Promise<AutomationDoc | null> {
  const snap = await db
    .collection('organizations').doc(orgId)
    .collection('marketingAutomations')
    .where('trigger', '==', TRIGGER)
    .where('is_active', '==', true)
    .get();
  for (const doc of snap.docs) {
    const data = doc.data() as AutomationDoc;
    if (data.message_type === 'sms') return data;
  }
  return null;
}

// Claims the invite inside a transaction so a retried event (whose snapshot
// predates the stamp) cannot send twice.
async function claimInvite(orgId: string, apptId: string): Promise<boolean> {
  const ref = db.collection('organizations').doc(orgId).collection('appointments').doc(apptId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.feedback_invite_sent_at) return false;
    tx.update(ref, { feedback_invite_sent_at: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
}

async function sendInviteEmail(
  orgId: string,
  apptId: string,
  appt: AppointmentDoc,
  automation: AutomationDoc,
  vars: Record<string, string>,
): Promise<void> {
  const ctx = await resolveEmailContext(orgId, TEMPLATE_KEY);
  if (!ctx) {
    console.warn('appointmentCompletedAutomation: Resend not configured; skipping email', { orgId, apptId });
    return;
  }
  const emailVars: Record<string, string> = { ...vars, ORG: vars.ORG || String(ctx.orgData.name || ctx.fromName) };
  await renderAndSend({
    orgId,
    toEmail: appt.client_email as string,
    toName: emailVars.NAME,
    automation,
    ctx,
    vars: emailVars,
    sendKind: SEND_KIND,
    clientId: appt.client_id ?? null,
  });
  console.log('appointmentCompletedAutomation: feedback invite email sent', { orgId, apptId });
}

async function sendInviteSms(
  orgId: string,
  apptId: string,
  appt: AppointmentDoc,
  automation: AutomationDoc,
  vars: Record<string, string>,
  lang: AppLanguage,
): Promise<void> {
  const phone = String(appt.client_phone || '').trim();
  let optedOut = appt.sms_opt_out === true;
  if (appt.sms_opt_out === undefined && appt.client_id) {
    const clientSnap = await db
      .collection('organizations').doc(orgId).collection('clients').doc(String(appt.client_id)).get();
    if (clientSnap.data()?.sms_opt_out === true) optedOut = true;
  }
  if (!phone || optedOut) return;

  let provider: SmsProvider;
  try {
    provider = await resolveProvider(orgId);
  } catch {
    return;
  }

  const t = makeT(STRINGS, lang);
  // An SMS-only automation's content is the message the admin wrote for this
  // channel; for 'both' the content is the email body, so the short default is used.
  const custom = automation.message_type === 'sms' ? String(automation.content || '').trim() : '';
  let body = renderAutomationContent(custom || t('smsInvite'), vars);
  if (!body.includes(vars.FEEDBACK_URL)) body = `${body}\n${vars.FEEDBACK_URL}`;
  body = withOptOutSuffix(body, lang);

  await consumeRateLimit(orgId, 'feedbackInviteSms', SMS_DAILY_LIMIT);
  await sendSms(orgId, phone, body, provider);

  await db.collection('organizations').doc(orgId).collection('clientCommunications').add({
    clientId: appt.client_id ?? null,
    type: 'sms',
    direction: 'outbound',
    status: 'delivered',
    message: body,
    to: phone,
    sentBy: SEND_KIND,
    refType: 'appointment',
    refId: apptId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('appointmentCompletedAutomation: feedback invite SMS sent', { orgId, apptId });
}

/**
 * Fires when an appointment transitions to 'completed' and the org has an active
 * 'appointment_completed' automation. Sends the automation as a feedback invite
 * (email and/or SMS) that deep-links to the client portal feedback form.
 */
export const appointmentCompletedAutomation = onDocumentUpdated(
  {
    document: 'organizations/{orgId}/appointments/{apptId}',
    secrets: ['RESEND_API_KEY'],
  },
  async (event) => {
    const orgId = event.params.orgId;
    const apptId = event.params.apptId;
    const before = event.data?.before.data() as AppointmentDoc | undefined;
    const after = event.data?.after.data() as AppointmentDoc | undefined;
    if (!before || !after) return;
    if (before.status === 'completed' || after.status !== 'completed') return;
    if (!after.client_id || after.feedback_invite_sent_at) return;

    try {
      const hasEmail = isValidEmail(after.client_email);
      const hasPhone = Boolean(String(after.client_phone || '').trim());
      if (!hasEmail && !hasPhone) return;

      const emailAutomation = await getActiveEmailAutomation(orgId, TRIGGER);
      const automation = emailAutomation ?? (await getActiveSmsAutomation(orgId));
      if (!automation) return;

      const wantsEmail = hasEmail && emailAutomation !== null;
      const wantsSms = hasPhone && (automation.message_type === 'sms' || automation.message_type === 'both');
      if (!wantsEmail && !wantsSms) return;

      if (!(await claimInvite(orgId, apptId))) return;

      const orgData = (await db.collection('organizations').doc(orgId).get()).data() ?? {};
      const lang = orgLanguageFromData(orgData);
      const t = makeT(STRINGS, lang);
      const tz = String(orgData.timezone || 'America/New_York');
      const portalUrl = portalUrlForOrg(orgData);

      const vars: Record<string, string> = {
        NAME: String(after.client_name || t('fallbackName')),
        TREATMENT: String(after.treatment_name || t('fallbackTreatment')),
        DATE: formatDateForDisplay(String(after.appointment_date || ''), tz, lang),
        TIME: formatTimeForDisplay(String(after.appointment_time || ''), lang),
        STAFF: String(after.staff_name || ''),
        ORG: String(orgData.name || ''),
        PORTAL_URL: portalUrl,
        FEEDBACK_URL: `${portalUrl}?feedback=1`,
      };

      if (wantsEmail && emailAutomation) {
        try {
          await sendInviteEmail(orgId, apptId, after, emailAutomation, vars);
        } catch (err) {
          console.error('appointmentCompletedAutomation: email failed', {
            orgId, apptId, error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (wantsSms) {
        try {
          await sendInviteSms(orgId, apptId, after, automation, vars, lang);
        } catch (err) {
          console.error('appointmentCompletedAutomation: SMS failed', {
            orgId, apptId, error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      console.error('appointmentCompletedAutomation: failed', {
        orgId, apptId, error: err instanceof Error ? err.message : String(err),
      });
    }
  },
);
