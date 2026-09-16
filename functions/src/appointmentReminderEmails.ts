import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  loadOrgEmailContext,
  getAutomation,
  sendOrgEmail,
  alreadySent,
  orgEmailLanguage,
} from './lib/orgEmail';
import { resolveProvider, sendSms, ensureOptOutSuffix } from './lib/smsProviders';
import { consumeRateLimit } from './rateLimit';
import { reconfirmFooter } from './lib/appointmentConfirm';
import { buildAppointmentButtons } from './lib/appointmentEmailButtons';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, localeFor, makeT } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Client-facing copy, sent in the org's language (organizations/{orgId}.language).
// The SMS body is org-editable (cfg.sms_body); only the default is localised here.
const STRINGS = defineStrings({
  en: {
    subject: 'Reminder: Your appointment is coming up',
    defaultSmsBody: 'Reminder: [NAME], you have [TREATMENT] on [DATE] at [TIME].',
    fallbackName: 'there',
    fallbackTreatment: 'your appointment',
    optOutSuffix: 'Reply STOP to unsubscribe.',
  },
  he: {
    subject: 'תזכורת: התור שלך מתקרב',
    defaultSmsBody: 'תזכורת: [NAME], יש לך [TREATMENT] בתאריך [DATE] בשעה [TIME].',
    // Fills the [NAME] slot inside org-authored 'שלום [NAME], …' copy, so it must
    // read as a name-like noun rather than a greeting.
    fallbackName: 'לקוח/ה יקר/ה',
    fallbackTreatment: 'התור שלך',
    optOutSuffix: 'להסרה השיבו STOP.',
  },
});

/**
 * Carrier opt-out footer in the org's language. English goes through the shared
 * ensureOptOutSuffix(); Hebrew appends a Hebrew instruction that keeps the
 * literal STOP keyword, because carriers (and quoWebhook's STOP_WORDS) only
 * recognise the English keyword for opt-out.
 */
function withOptOutSuffix(body: string, lang: AppLanguage): string {
  if (lang === DEFAULT_LANGUAGE) return ensureOptOutSuffix(body);
  if (/\bSTOP\b/i.test(body)) return body;
  return `${body.replace(/\s+$/, '')} ${makeT(STRINGS, lang)('optOutSuffix')}`;
}

/** Replace [TOKEN] placeholders in a reminder SMS body. */
function renderTokens(template: string, vars: Record<string, string>): string {
  return template.replace(/\[([A-Z_]+)\]/g, (m, key) => (vars[key] !== undefined ? vars[key] : m));
}

/**
 * Formats an "HH:mm" 24-hour string as a friendly wall-clock time in the org's
 * language: English is 12-hour ("14:00" → "2:00 PM", "00:15" → "12:15 AM"),
 * Hebrew keeps the 24-hour convention ("14:00" → "14:00").
 */
function formatTimeForDisplay(hhmm: string, lang: AppLanguage = DEFAULT_LANGUAGE): string {
  const parts = hhmm.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] ?? '00';
  if (Number.isNaN(h)) return hhmm;
  if (lang === DEFAULT_LANGUAGE) {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${m.padStart(2, '0')} ${period}`;
  }
  const minutes = parseInt(m, 10);
  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, h, Number.isNaN(minutes) ? 0 : minutes)));
  } catch {
    return hhmm;
  }
}

/**
 * Hourly scheduled function that sends appointment reminder emails.
 *
 * For each org with `email_automations.appointment_reminder.is_active === true`,
 * find appointments whose start time is exactly `hours_before` (default 24)
 * hours from now (rounded to the same hour bucket in the org's timezone),
 * and send the org's `appointment_reminder` template — once per appointment.
 *
 * No 9am gate — runs every hour for every org.
 */
export const appointmentReminderEmails = onSchedule(
  {
    schedule: 'every 1 hours',
    secrets: ['RESEND_API_KEY'],
    region: 'us-central1',
    memory: '256MiB',
  },
  async () => {
    const orgsSnap = await db.collection('organizations').get();

    for (const orgDoc of orgsSnap.docs) {
      const orgId = orgDoc.id;
      const orgData = orgDoc.data();
      const orgTz = orgData.timezone || 'America/New_York';

      const ctx = await loadOrgEmailContext(orgId);
      if (!ctx) continue;

      const cfg = getAutomation(ctx, 'appointment_reminder');
      if (!cfg.is_active) continue;

      // Org language drives subject, date/time formatting, buttons and SMS footer.
      const lang = orgEmailLanguage(ctx);
      const t = makeT(STRINGS, lang);

      const hoursBefore = cfg.hours_before ?? 24;
      const targetMs = Date.now() + hoursBefore * 3600 * 1000;
      const targetMoment = new Date(targetMs);

      // YYYY-MM-DD in org timezone (en-CA returns ISO format)
      const targetDate = targetMoment.toLocaleDateString('en-CA', {
        timeZone: orgTz,
      });
      // 0-23 hour in org timezone
      const targetHour = parseInt(
        targetMoment.toLocaleString('en-US', {
          timeZone: orgTz,
          hour: '2-digit',
          hour12: false,
        }),
        10,
      );

      // Appointments use snake_case fields
      const apptSnap = await db
        .collection('organizations')
        .doc(orgId)
        .collection('appointments')
        .where('appointment_date', '==', targetDate)
        .where('status', 'in', ['scheduled', 'confirmed'])
        .get();

      for (const apptDoc of apptSnap.docs) {
        const appointmentId = apptDoc.id;
        const appt = apptDoc.data();

        const apptTime = String(appt.appointment_time || '');
        const apptHour = parseInt(apptTime.split(':')[0], 10);
        if (Number.isNaN(apptHour) || apptHour !== targetHour) continue;

        if (
          await alreadySent(
            orgId,
            'appointment_reminder',
            'appointment',
            appointmentId,
          )
        ) {
          continue;
        }

        // Resolve client email — denormalized first, then fall back to client doc
        let toEmail: string | undefined = appt.client_email
          ? String(appt.client_email)
          : undefined;
        let clientName: string | undefined = appt.client_name
          ? String(appt.client_name)
          : undefined;

        if (!toEmail && appt.client_id) {
          try {
            const clientSnap = await db
              .collection('organizations')
              .doc(orgId)
              .collection('clients')
              .doc(String(appt.client_id))
              .get();
            if (clientSnap.exists) {
              const client = clientSnap.data() ?? {};
              if (!toEmail && client.email) toEmail = String(client.email);
              if (!clientName && client.name) clientName = String(client.name);
            }
          } catch (err) {
            console.error(
              `Failed to load client ${appt.client_id} for appointment ${appointmentId} in org ${orgId}:`,
              err,
            );
          }
        }

        if (!toEmail) continue;

        // Pretty date like "Friday, March 15, 2026" (or the Hebrew equivalent) in org tz
        let prettyDate = targetDate;
        try {
          const dateObj = new Date(`${targetDate}T12:00:00Z`);
          prettyDate = dateObj.toLocaleDateString(localeFor(lang), {
            timeZone: orgTz,
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });
        } catch (_) {
          // fall back to raw YYYY-MM-DD
        }

        const prettyTime = formatTimeForDisplay(apptTime, lang);

        const subject = t('subject');

        try {
          await sendOrgEmail({
            ctx,
            lang,
            to: toEmail,
            subject,
            templateType: 'appointment_reminder',
            variables: {
              client_name: clientName || '',
              appointment_date: prettyDate,
              appointment_time: prettyTime,
              service_name: appt.treatment_name ? String(appt.treatment_name) : '',
              staff_name: appt.staff_name ? String(appt.staff_name) : '',
              location: '',
            },
            clientId: appt.client_id ? String(appt.client_id) : undefined,
            automationKey: 'appointment_reminder',
            refType: 'appointment',
            refId: appointmentId,
            // Confirm + Cancel buttons signed with the org's Resend key, in the org's language.
            appendHtml: buildAppointmentButtons(orgId, appointmentId, ctx.apiKey, lang),
          });
        } catch (err) {
          console.error(
            `Failed to send appointment reminder for appointment ${appointmentId} in org ${orgId}:`,
            err,
          );
          // Continue with other appointments
        }

        // ----------------------------------------------------------- SMS reminder
        if (cfg.sms_enabled) {
          try {
            if (await alreadySent(orgId, 'appointment_reminder_sms', 'appointment', appointmentId)) {
              continue;
            }

            // Resolve phone + opt-out (denormalized first, then client doc).
            let phone = appt.client_phone ? String(appt.client_phone) : '';
            let optedOut = appt.sms_opt_out === true;
            if ((!phone || appt.sms_opt_out === undefined) && appt.client_id) {
              const clientSnap = await db
                .collection('organizations').doc(orgId).collection('clients').doc(String(appt.client_id)).get();
              if (clientSnap.exists) {
                const c = clientSnap.data() ?? {};
                if (!phone && c.phone) phone = String(c.phone);
                if (c.sms_opt_out === true) optedOut = true;
              }
            }
            if (!phone || optedOut) continue;

            const provider = await resolveProvider(orgId);
            const smsVars: Record<string, string> = {
              NAME: clientName || t('fallbackName'),
              DATE: prettyDate,
              TIME: prettyTime,
              TREATMENT: appt.treatment_name ? String(appt.treatment_name) : t('fallbackTreatment'),
              STAFF: appt.staff_name ? String(appt.staff_name) : '',
              ORG: String(orgData.name || ''),
            };
            const template = cfg.sms_body || t('defaultSmsBody');
            // "Reply 1/2/3" footer in the org's language; reply keywords stay numeric.
            const body = withOptOutSuffix(`${renderTokens(template, smsVars)}\n\n${reconfirmFooter(lang)}`, lang);

            await consumeRateLimit(orgId, 'appointmentReminderSms', 500);
            await sendSms(orgId, phone, body, provider);

            await db.collection('organizations').doc(orgId).collection('clientCommunications').add({
              clientId: appt.client_id ? String(appt.client_id) : null,
              type: 'sms',
              direction: 'outbound',
              status: 'delivered',
              message: body,
              to: phone,
              sentBy: 'system:appointmentReminderEmails',
              automationKey: 'appointment_reminder_sms',
              refType: 'appointment',
              refId: appointmentId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (err) {
            console.error(
              `Failed to send appointment reminder SMS for appointment ${appointmentId} in org ${orgId}:`,
              err,
            );
          }
        }
      }
    }
  },
);
