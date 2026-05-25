import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { consumeRateLimit } from './rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface AppointmentDoc {
  client_id?: string;
  client_name?: string;
  client_email?: string;
  treatment_name?: string;
  staff_name?: string;
  appointment_date?: string; // YYYY-MM-DD
  appointment_time?: string; // HH:MM
  duration?: number;
  status?: string;
  acuity_appointment_id?: string;
  organization_id?: string;
}

interface AutomationDoc {
  name?: string;
  trigger?: string;
  delay?: string;
  message_type?: 'email' | 'sms' | 'both';
  subject?: string;
  content?: string;
  is_active?: boolean;
}

interface ResendIntegrationConfig {
  apiKey?: string;
  fromName?: string;
  fromEmail?: string;
}

/** Format YYYY-MM-DD as "Jan 15, 2026" in the org's timezone for display. */
function formatDateForDisplay(dateStr: string, tz: string): string {
  if (!dateStr) return '';
  // Build a date at noon to dodge DST cliff.
  const d = new Date(`${dateStr}T12:00:00`);
  try {
    return d.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/** Format HH:MM as "2:30 PM" — timezone-agnostic since the time is a wall-clock. */
function formatTimeForDisplay(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Replace [TOKEN] placeholders in user-authored automation content. */
function renderAutomationContent(template: string, vars: Record<string, string>): string {
  if (!template) return '';
  return template.replace(/\[([A-Z_]+)\]/g, (match, key) => {
    const v = vars[key];
    return v !== undefined ? v : match;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Minimal branded HTML wrapper around the rendered plain-text content. */
function buildEmailHtml(subject: string, content: string, orgName: string): string {
  const bodyHtml = escapeHtml(content).replace(/\n/g, '<br>');
  const headerLine = escapeHtml(orgName || 'Beauty Hub Pro');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937;background:#ffffff">
  <div style="border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:20px">
    <p style="margin:0;font-weight:600;color:#111827">${headerLine}</p>
  </div>
  <h2 style="margin:0 0 16px;font-size:18px;color:#111827">${escapeHtml(subject)}</h2>
  <div style="line-height:1.65;font-size:15px">${bodyHtml}</div>
  <p style="color:#6b7280;font-size:12px;margin-top:28px">— ${headerLine}</p>
</body></html>`;
}

export const appointmentScheduledNotification = onDocumentCreated(
  {
    document: 'organizations/{orgId}/appointments/{apptId}',
    secrets: ['RESEND_API_KEY'],
  },
  async (event) => {
    const orgId = event.params.orgId;
    const snap = event.data;
    if (!snap) return;
    const appt = snap.data() as AppointmentDoc;

    // No client email = nothing to send.
    if (!appt.client_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appt.client_email)) {
      console.log('appointmentScheduledNotification: no valid client email, skipping', {
        orgId,
        apptId: event.params.apptId,
      });
      return;
    }

    // Acuity-synced appointments already get a confirmation from Acuity itself —
    // skip to avoid double-sends. Locally created appointments get the email.
    if (appt.acuity_appointment_id) {
      console.log('appointmentScheduledNotification: skipping Acuity-synced appointment', {
        orgId,
        apptId: event.params.apptId,
      });
      return;
    }

    // Find matching active email automations for this org.
    const automationsSnap = await db
      .collection('organizations')
      .doc(orgId)
      .collection('marketingAutomations')
      .where('trigger', '==', 'appointment_scheduled')
      .where('is_active', '==', true)
      .get();

    const emailAutomations: Array<{ id: string; data: AutomationDoc }> = [];
    automationsSnap.forEach((doc) => {
      const data = doc.data() as AutomationDoc;
      if (data.message_type === 'email' || data.message_type === 'both') {
        emailAutomations.push({ id: doc.id, data });
      }
    });

    if (emailAutomations.length === 0) return;

    // Load org + Resend integration once for all automations.
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    const orgData = orgDoc.data() || {};
    const tz = String(orgData.timezone || 'America/New_York');

    const integrationSnap = await db
      .collection('organizations')
      .doc(orgId)
      .collection('marketingIntegrations')
      .where('provider', '==', 'resend')
      .where('is_enabled', '==', true)
      .limit(1)
      .get();

    if (integrationSnap.empty) {
      console.warn('appointmentScheduledNotification: Resend not configured for org', { orgId });
      return;
    }

    const config = (integrationSnap.docs[0].data().configuration ?? {}) as ResendIntegrationConfig;
    if (!config.apiKey) {
      console.warn('appointmentScheduledNotification: Resend apiKey missing', { orgId });
      return;
    }
    const fromName = config.fromName || String(orgData.name || 'Beauty Hub Pro');
    const fromEmail = config.fromEmail;
    if (!fromEmail) {
      console.warn('appointmentScheduledNotification: Resend fromEmail missing', { orgId });
      return;
    }

    const vars: Record<string, string> = {
      NAME: String(appt.client_name || appt.client_email.split('@')[0]),
      TREATMENT: String(appt.treatment_name || 'your appointment'),
      DATE: formatDateForDisplay(String(appt.appointment_date || ''), tz),
      TIME: formatTimeForDisplay(String(appt.appointment_time || '')),
      STAFF: String(appt.staff_name || ''),
      ORG: String(orgData.name || fromName),
    };

    const resend = new Resend(config.apiKey);

    for (const { id, data } of emailAutomations) {
      try {
        await consumeRateLimit(orgId, 'appointmentScheduledEmail', 500);

        const subject = renderAutomationContent(String(data.subject || 'Your appointment is confirmed'), vars);
        const renderedBody = renderAutomationContent(String(data.content || ''), vars);
        const html = buildEmailHtml(subject, renderedBody, vars.ORG);

        const result = await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: [appt.client_email],
          subject,
          html,
        });

        if (result.error) {
          throw new Error(
            (result.error as { message?: string }).message || JSON.stringify(result.error),
          );
        }

        await Promise.all([
          // Mark when this automation last fired so admins can see it on the list.
          db.collection('organizations').doc(orgId).collection('marketingAutomations').doc(id).update({
            last_triggered_at: admin.firestore.FieldValue.serverTimestamp(),
          }),
          // Log the send to clientCommunications so it shows on the client's profile.
          db.collection('organizations').doc(orgId).collection('clientCommunications').add({
            clientId: appt.client_id || null,
            type: 'email',
            status: 'delivered',
            subject,
            to: appt.client_email,
            messageId: result.data?.id || null,
            sentBy: 'system:appointmentScheduledNotification',
            automationId: id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          }),
        ]);

        console.log('appointmentScheduledNotification: sent', {
          orgId,
          apptId: event.params.apptId,
          automationId: id,
          to: appt.client_email,
          messageId: result.data?.id,
        });
      } catch (err) {
        // Don't fail the whole trigger if one automation errors — keep going.
        console.error('appointmentScheduledNotification: send failed', {
          orgId,
          apptId: event.params.apptId,
          automationId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },
);
