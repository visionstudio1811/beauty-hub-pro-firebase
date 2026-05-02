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
 * Hourly scheduled function that sends each org's "inactive" templated email
 * to clients whose most recent completed appointment was exactly N days ago,
 * where N = `email_automations.inactive.days_threshold` (default 90).
 *
 * Activated per-org via `marketingIntegrations/resend.email_automations.inactive.is_active`.
 *
 * Runs hourly so each org's "9am local" can be honored regardless of timezone.
 * Skips orgs whose local hour is not 9.
 *
 * Field naming: appointments use snake_case (`appointment_date`, `client_id`,
 * `status`). `appointment_date` is a YYYY-MM-DD string.
 */
export const inactiveClientEmails = onSchedule(
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

      const cfg = getAutomation(ctx, 'inactive');
      if (!cfg.is_active) continue;

      const daysThreshold = cfg.days_threshold ?? 90;
      const today = todayInTimezone(orgTz);
      const cutoffDate = addDaysISO(today, -daysThreshold);

      // Completed appointments on the cutoff date
      const apptSnap = await db
        .collection('organizations')
        .doc(orgId)
        .collection('appointments')
        .where('status', '==', 'completed')
        .where('appointment_date', '==', cutoffDate)
        .get();

      // Track per-client dedupe within this run (a client may have multiple
      // completed appointments on the cutoff date — we only send one email).
      const handledClients = new Set<string>();

      for (const apptDoc of apptSnap.docs) {
        try {
          const appt = apptDoc.data();
          const clientId = appt.client_id;
          if (!clientId) continue;

          if (handledClients.has(clientId)) continue;
          handledClients.add(clientId);

          const refId = `${clientId}_${today}`;
          if (await alreadySent(orgId, 'inactive', 'inactive', refId)) continue;

          // Verify this is actually their LAST completed appointment.
          const moreRecentSnap = await db
            .collection('organizations')
            .doc(orgId)
            .collection('appointments')
            .where('client_id', '==', clientId)
            .where('status', '==', 'completed')
            .where('appointment_date', '>', cutoffDate)
            .limit(1)
            .get();
          if (!moreRecentSnap.empty) continue;

          const clientDoc = await db
            .collection('organizations')
            .doc(orgId)
            .collection('clients')
            .doc(clientId)
            .get();
          if (!clientDoc.exists) continue;

          const client = clientDoc.data() ?? {};
          if (client.deleted_at != null) continue;
          if (!client.email) continue;

          const firstName = (client.name || '').split(' ')[0] || 'there';

          let lastVisitDate = cutoffDate;
          try {
            lastVisitDate = new Date(`${cutoffDate}T12:00:00Z`).toLocaleDateString('en-US', {
              timeZone: orgTz,
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            });
          } catch (_) {
            // fall back to raw YYYY-MM-DD
          }

          const subject = `We miss you, ${firstName}!`;

          await sendOrgEmail({
            ctx,
            to: client.email,
            subject,
            templateType: 'inactive',
            variables: {
              client_name: client.name || firstName,
              last_visit_date: lastVisitDate,
              months_inactive: String(Math.round(daysThreshold / 30)),
              comeback_offer: '',
            },
            clientId,
            automationKey: 'inactive',
            refType: 'inactive',
            refId,
          });
        } catch (err) {
          console.error(
            `Failed to send inactive email for appointment ${apptDoc.id} in org ${orgId}:`,
            err,
          );
          // Continue with other appointments
        }
      }
    }
  },
);
