import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { consumeRateLimit } from './rateLimit';
import { resolveProvider, sendSms, ensureOptOutSuffix, SmsProvider } from './lib/smsProviders';
import { RECONFIRM_FOOTER } from './lib/appointmentConfirm';
import { buildAppointmentButtons, injectBeforeBodyEnd } from './lib/appointmentEmailButtons';
import { loadSecret } from './lib/integrationSecrets';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface AppointmentDoc {
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  treatment_name?: string;
  staff_name?: string;
  appointment_date?: string; // YYYY-MM-DD
  appointment_time?: string; // HH:MM
  duration?: number;
  status?: string;
  acuity_appointment_id?: string;
  organization_id?: string;
  sms_opt_out?: boolean;
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

/** HTML-escapes a value so untrusted text can't inject markup into an email. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

// `message` is trusted, pre-rendered HTML (the Layer-1 automation body); every
// other template variable is plain text/URL and must be HTML-escaped so an
// attacker-controlled appointment field (e.g. a visitor name from a public
// booking) can't inject markup into the confirmation email.
const RAW_HTML_TEMPLATE_KEYS = new Set(['message']);

/** Replace {{var}} placeholders inside the branded email template HTML. */
function renderTemplate(html: string, variables: Record<string, string>): string {
  const resolved = processConditionals(html, variables);
  return resolved.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const v = variables[key];
    if (v === undefined) return match;
    return RAW_HTML_TEMPLATE_KEYS.has(key) ? v : escapeHtml(v);
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

    // Acuity-synced appointments already get their own confirmation (email + SMS)
    // from Acuity — skip both to avoid double-sends. Locally created appts proceed.
    if (appt.acuity_appointment_id) {
      console.log('appointmentScheduledNotification: skipping Acuity-synced appointment', {
        orgId,
        apptId: event.params.apptId,
      });
      return;
    }

    const hasValidEmail =
      !!appt.client_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appt.client_email);

    // Find matching active automations for this org, split by channel.
    const automationsSnap = await db
      .collection('organizations')
      .doc(orgId)
      .collection('marketingAutomations')
      .where('trigger', '==', 'appointment_scheduled')
      .where('is_active', '==', true)
      .get();

    const emailAutomations: Array<{ id: string; data: AutomationDoc }> = [];
    const smsAutomations: Array<{ id: string; data: AutomationDoc }> = [];
    automationsSnap.forEach((doc) => {
      const data = doc.data() as AutomationDoc;
      if (data.message_type === 'email' || data.message_type === 'both') {
        emailAutomations.push({ id: doc.id, data });
      }
      if (data.message_type === 'sms' || data.message_type === 'both') {
        smsAutomations.push({ id: doc.id, data });
      }
    });

    if (emailAutomations.length === 0 && smsAutomations.length === 0) return;

    // Load org once — needed for timezone + display vars (both email and SMS).
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    const orgData = orgDoc.data() || {};
    const tz = String(orgData.timezone || 'America/New_York');

    const vars: Record<string, string> = {
      NAME: String(appt.client_name || (appt.client_email ? appt.client_email.split('@')[0] : 'there')),
      TREATMENT: String(appt.treatment_name || 'your appointment'),
      DATE: formatDateForDisplay(String(appt.appointment_date || ''), tz),
      TIME: formatTimeForDisplay(String(appt.appointment_time || '')),
      STAFF: String(appt.staff_name || ''),
      ORG: String(orgData.name || ''),
    };

    /* ----------------------------------------------------------------- EMAIL */
    if (hasValidEmail && emailAutomations.length > 0) {
      const integrationSnap = await db
        .collection('organizations')
        .doc(orgId)
        .collection('marketingIntegrations')
        .where('provider', '==', 'resend')
        .where('is_enabled', '==', true)
        .limit(1)
        .get();

      const integrationData = integrationSnap.empty ? null : integrationSnap.docs[0].data();
      const config = (integrationData?.configuration ?? {}) as ResendIntegrationConfig;
      const fromEmail = config.fromEmail;
      // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
      const apiKey = integrationData ? (await loadSecret(orgId, 'resend', integrationData)).apiKey : undefined;

      if (!integrationData || !apiKey || !fromEmail) {
        console.warn('appointmentScheduledNotification: Resend not fully configured; skipping email', { orgId });
      } else {
        const fromName = config.fromName || String(orgData.name || 'Beauty Hub Pro');
        if (!vars.ORG) vars.ORG = fromName;

        const emailTemplates = (integrationData.email_templates ?? {}) as Record<
          string,
          { html?: string; settings?: Record<string, unknown> } | undefined
        >;
        const pickFirstWithHtml = (keys: string[]) =>
          keys.map((k) => emailTemplates[k]).find((t) => typeof t?.html === 'string' && t!.html!.length > 0);
        const TRANSACTIONAL_OUTCOME_KEYS = new Set([
          'booking_request_received',
          'booking_request_admin_alert',
          'booking_request_declined',
        ]);
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
          Object.entries(emailTemplates).find(
            ([k, t]) => !TRANSACTIONAL_OUTCOME_KEYS.has(k) && typeof t?.html === 'string' && t!.html!.length > 0,
          )?.[1];
        const templateHtml = template?.html || DEFAULT_TEMPLATE_HTML;
        const templateSettings = (template?.settings ?? {}) as Record<string, string>;
        const headerImageUrl = String(integrationData.email_header_image_url ?? '');

        // Confirm + Cancel buttons signed with the org's Resend key.
        const buttons = buildAppointmentButtons(orgId, event.params.apptId, apiKey);
        const resend = new Resend(apiKey);

        for (const { id, data } of emailAutomations) {
          try {
            await consumeRateLimit(orgId, 'appointmentScheduledEmail', 500);

            const subject = renderAutomationContent(String(data.subject || 'Your appointment is confirmed'), vars);
            // Body renders into the wrapper as raw {{message}} HTML, so escape the
            // substituted token VALUES (e.g. an attacker-controlled visitor name)
            // first. The subject is a plain-text email header and stays unescaped.
            const bodyVars = Object.fromEntries(
              Object.entries(vars).map(([k, v]) => [k, escapeHtml(String(v ?? ''))]),
            );
            const renderedBody = renderAutomationContent(String(data.content || ''), bodyVars);

            const templateVariables: Record<string, string> = {
              ...Object.fromEntries(Object.entries(templateSettings).map(([k, v]) => [k, String(v ?? '')])),
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
              treatment: vars.TREATMENT,
              time: vars.TIME,
              staff: vars.STAFF,
            };

            const html = injectBeforeBodyEnd(renderTemplate(templateHtml, templateVariables), buttons);

            const result = await resend.emails.send({
              from: `${fromName} <${fromEmail}>`,
              to: [appt.client_email as string],
              subject,
              html,
            });

            if (result.error) {
              throw new Error((result.error as { message?: string }).message || JSON.stringify(result.error));
            }

            await Promise.all([
              db.collection('organizations').doc(orgId).collection('marketingAutomations').doc(id).update({
                last_triggered_at: admin.firestore.FieldValue.serverTimestamp(),
              }),
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
          } catch (err) {
            console.error('appointmentScheduledNotification: email send failed', {
              orgId,
              apptId: event.params.apptId,
              automationId: id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    /* ------------------------------------------------------------------- SMS */
    if (smsAutomations.length > 0) {
      await sendConfirmationSms(orgId, event.params.apptId, appt, smsAutomations, vars);
    }
  },
);

/**
 * Sends an appointment-confirmation SMS for each active sms/both automation,
 * appending the "Reply 1/2/3" footer + STOP suffix. Respects opt-out and the
 * per-org daily cap; skips silently when no SMS provider is enabled.
 */
async function sendConfirmationSms(
  orgId: string,
  apptId: string,
  appt: AppointmentDoc,
  smsAutomations: Array<{ id: string; data: AutomationDoc }>,
  vars: Record<string, string>,
): Promise<void> {
  // Resolve phone + opt-out (denormalized first, then the client doc).
  let phone = appt.client_phone ? String(appt.client_phone) : '';
  let optedOut = appt.sms_opt_out === true;
  if ((!phone || appt.sms_opt_out === undefined) && appt.client_id) {
    try {
      const clientSnap = await db
        .collection('organizations').doc(orgId).collection('clients').doc(String(appt.client_id)).get();
      if (clientSnap.exists) {
        const c = clientSnap.data() ?? {};
        if (!phone && c.phone) phone = String(c.phone);
        if (c.sms_opt_out === true) optedOut = true;
      }
    } catch (err) {
      console.error('appointmentScheduledNotification: client load for SMS failed', {
        orgId,
        apptId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (!phone || optedOut) return;

  let provider: SmsProvider;
  try {
    provider = await resolveProvider(orgId);
  } catch {
    return; // no SMS provider enabled — email-only org
  }

  for (const { id, data } of smsAutomations) {
    try {
      const base = renderAutomationContent(String(data.content || 'Your appointment is confirmed.'), vars);
      const body = ensureOptOutSuffix(`${base}\n\n${RECONFIRM_FOOTER}`);
      await consumeRateLimit(orgId, 'appointmentConfirmSms', 500);
      await sendSms(orgId, phone, body, provider);
      await Promise.all([
        db.collection('organizations').doc(orgId).collection('marketingAutomations').doc(id).update({
          last_triggered_at: admin.firestore.FieldValue.serverTimestamp(),
        }),
        db.collection('organizations').doc(orgId).collection('clientCommunications').add({
          clientId: appt.client_id || null,
          type: 'sms',
          direction: 'outbound',
          status: 'delivered',
          message: body,
          to: phone,
          sentBy: 'system:appointmentScheduledNotification',
          automationId: id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      ]);
    } catch (err) {
      console.error('appointmentScheduledNotification: SMS send failed', {
        orgId,
        apptId,
        automationId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
