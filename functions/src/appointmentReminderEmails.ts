import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  loadOrgEmailContext,
  getAutomation,
  sendOrgEmail,
  alreadySent,
} from './lib/orgEmail';
import { resolveProvider, sendSms, ensureOptOutSuffix } from './lib/smsProviders';
import { consumeRateLimit } from './rateLimit';
import { RECONFIRM_FOOTER } from './lib/appointmentConfirm';
import { buildAppointmentButtons } from './lib/appointmentEmailButtons';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/** Replace [TOKEN] placeholders in a reminder SMS body. */
function renderTokens(template: string, vars: Record<string, string>): string {
  return template.replace(/\[([A-Z_]+)\]/g, (m, key) => (vars[key] !== undefined ? vars[key] : m));
}

/**
 * Formats an "HH:mm" 24-hour string as a friendly 12-hour time, e.g.
 * "14:00" → "2:00 PM", "09:30" → "9:30 AM", "00:15" → "12:15 AM".
 */
function formatTime12h(hhmm: string): string {
  const parts = hhmm.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] ?? '00';
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.padStart(2, '0')} ${period}`;
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

        // Pretty date like "Friday, March 15, 2026" in org tz
        let prettyDate = targetDate;
        try {
          const dateObj = new Date(`${targetDate}T12:00:00Z`);
          prettyDate = dateObj.toLocaleDateString('en-US', {
            timeZone: orgTz,
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });
        } catch (_) {
          // fall back to raw YYYY-MM-DD
        }

        const prettyTime = formatTime12h(apptTime);

        const subject = 'Reminder: Your appointment is coming up';

        try {
          await sendOrgEmail({
            ctx,
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
            // Confirm + Cancel buttons signed with the org's Resend key.
            appendHtml: buildAppointmentButtons(orgId, appointmentId, ctx.apiKey),
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
              NAME: clientName || 'there',
              DATE: prettyDate,
              TIME: prettyTime,
              TREATMENT: appt.treatment_name ? String(appt.treatment_name) : 'your appointment',
              STAFF: appt.staff_name ? String(appt.staff_name) : '',
              ORG: String(orgData.name || ''),
            };
            const template = cfg.sms_body || 'Reminder: [NAME], you have [TREATMENT] on [DATE] at [TIME].';
            const body = ensureOptOutSuffix(`${renderTokens(template, smsVars)}\n\n${RECONFIRM_FOOTER}`);

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
