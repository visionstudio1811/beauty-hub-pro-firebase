import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  loadOrgEmailContext,
  getAutomation,
  sendOrgEmail,
  alreadySent,
  localHour,
  todayInTimezone,
  addDaysISO,
} from './lib/orgEmail';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Hourly scheduled function that sends each org's "birthday" templated email
 * to clients whose birthday matches the configured offset.
 *
 * Activated per-org via `marketingIntegrations/resend.email_automations.birthday.is_active`.
 * `days_offset` shifts the send window:
 *   -3 = send 3 days before birthday (today is 3 days before bday → bday = today + 3)
 *    0 = send on birthday
 *   +1 = send 1 day after birthday
 *
 * Target birthday MM-DD = `addDaysISO(today, -days_offset)` (MM-DD portion).
 *
 * Runs hourly so each org's "9am local" can be honored regardless of timezone.
 * Skips orgs whose local hour is not 9.
 */
export const birthdayEmails = onSchedule(
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

      // Only fire at 9am local time for this org
      if (localHour(orgTz) !== 9) continue;

      const ctx = await loadOrgEmailContext(orgId);
      if (!ctx) continue;

      const cfg = getAutomation(ctx, 'birthday');
      if (!cfg.is_active) continue;

      const daysOffset = cfg.days_offset ?? 0;
      const todayStr = todayInTimezone(orgTz);
      const targetDate = addDaysISO(todayStr, -daysOffset);
      // YYYY-MM-DD → MM-DD
      const targetMonthDay = targetDate.slice(5);

      // Active clients only — clients use snake_case
      const clientsSnap = await db
        .collection('organizations')
        .doc(orgId)
        .collection('clients')
        .where('deleted_at', '==', null)
        .get();

      for (const clientDoc of clientsSnap.docs) {
        const client = clientDoc.data();
        const clientId = clientDoc.id;

        if (!client.email) continue;
        if (!client.date_of_birth) continue;

        // date_of_birth is YYYY-MM-DD; compare MM-DD only
        const dobStr = String(client.date_of_birth);
        if (dobStr.length < 10) continue;
        const dobMonthDay = dobStr.slice(5, 10);
        if (dobMonthDay !== targetMonthDay) continue;

        const refId = `${clientId}_${todayStr}`;
        if (await alreadySent(orgId, 'birthday', 'birthday', refId)) continue;

        const firstName = (client.name || '').split(' ')[0] || 'there';
        const subject = `Happy Birthday, ${firstName}! 🎉`;

        // Pretty birthday like "March 15" in the org's timezone
        let birthdayDate = dobMonthDay;
        try {
          const bdayDateObj = new Date(`2000-${dobMonthDay}T12:00:00Z`);
          birthdayDate = bdayDateObj.toLocaleDateString('en-US', {
            timeZone: orgTz,
            month: 'long',
            day: 'numeric',
          });
        } catch (_) {
          // fall back to raw MM-DD
        }

        try {
          await sendOrgEmail({
            ctx,
            to: client.email,
            subject,
            templateType: 'birthday',
            variables: {
              client_name: client.name || firstName,
              birthday_date: birthdayDate,
            },
            clientId,
            automationKey: 'birthday',
            refType: 'birthday',
            refId,
          });
        } catch (err) {
          console.error(
            `Failed to send birthday email for client ${clientId} in org ${orgId}:`,
            err,
          );
          // Continue with other clients
        }
      }
    }
  },
);
