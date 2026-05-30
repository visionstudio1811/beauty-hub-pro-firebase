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

/**
 * Resolves Handlebars-style {{#if X}}body{{else}}other{{/if}} blocks. Iterates
 * innermost-first so arbitrary nesting depth works.
 */
function processConditionals(html: string, variables: Record<string, string>): string {
  let current = html;
  for (let i = 0; i < 50; i++) {
    const next = current.replace(
      /\{\{#if\s+(\w+)\}\}((?:(?!\{\{#if|\{\{\/if\}\})[\s\S])*?)(?:\{\{else\}\}((?:(?!\{\{#if|\{\{\/if\}\})[\s\S])*?))?\{\{\/if\}\}/g,
      (_match, varName: string, ifBody: string, elseBody?: string) => {
        const value = variables[varName];
        const truthy = typeof value === 'string' && value.length > 0;
        return truthy ? ifBody : (elseBody ?? '');
      },
    );
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Replace {{var}} placeholders inside the branded email template HTML. */
function renderTemplate(html: string, variables: Record<string, string>): string {
  const resolved = processConditionals(html, variables);
  return resolved.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const v = variables[key];
    return v !== undefined ? v : match;
  });
}

/** Fallback HTML wrapper for orgs that haven't configured email templates yet. */
const DEFAULT_TEMPLATE_HTML = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#1a1a1a">{{subject}}</h2>
  <p>Hi {{client_name}},</p>
  <div style="line-height:1.6">{{message}}</div>
  <br>
  <p style="color:#666;font-size:13px">— {{organization_name}}</p>
</body></html>`;

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

    const integrationData = integrationSnap.docs[0].data();
    const config = (integrationData.configuration ?? {}) as ResendIntegrationConfig;
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

    // Pull the org's branded email templates from the Resend integration doc.
    // Prefer the dedicated 'appointment_confirmation' template; then fall back
    // through the other common transactional designs, then ANY designed
    // template the org has, so brand colors / logos still carry over even if
    // the admin didn't design an appointment-specific one. The built-in plain
    // stub is only reached when no designed template exists at all.
    const emailTemplates = (integrationData.email_templates ?? {}) as Record<
      string,
      { html?: string; settings?: Record<string, unknown> } | undefined
    >;
    const pickFirstWithHtml = (keys: string[]) =>
      keys
        .map((k) => emailTemplates[k])
        .find((t) => typeof t?.html === 'string' && t!.html!.length > 0);
    const template =
      pickFirstWithHtml([
        'appointment_confirmation',
        'appointment_reminder',
        'general',
        'default',
        'welcome',
        'package_renewal',
        'birthday',
        'inactive',
      ]) ||
      Object.values(emailTemplates).find(
        (t) => typeof t?.html === 'string' && t!.html!.length > 0,
      );
    const templateHtml = template?.html || DEFAULT_TEMPLATE_HTML;
    const templateSettings = (template?.settings ?? {}) as Record<string, string>;
    const headerImageUrl = String(integrationData.email_header_image_url ?? '');

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

        // Build {{var}} substitutions for the branded template. Match the
        // sendClientEmail variable set so designs work consistently across
        // both code paths.
        const templateVariables: Record<string, string> = {
          ...Object.fromEntries(
            Object.entries(templateSettings).map(([k, v]) => [k, String(v ?? '')]),
          ),
          subject,
          message: renderedBody.replace(/\n/g, '<br>'),
          client_name: vars.NAME,
          organization_name: vars.ORG,
          organization_phone: String(orgData.phone || ''),
          organization_address: String(orgData.address || ''),
          organization_email: String(orgData.email || fromEmail || ''),
          logo_url: String(orgData.logo_url || ''),
          header_image_url: headerImageUrl,
          sender_name: fromName,
          from_email: fromEmail,
          cta_url: '',
          date: vars.DATE,
          datetime: `${vars.DATE} ${vars.TIME}`,
          // Appointment-specific tokens so templates can reference them directly.
          treatment: vars.TREATMENT,
          time: vars.TIME,
          staff: vars.STAFF,
        };

        const html = renderTemplate(templateHtml, templateVariables);

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
