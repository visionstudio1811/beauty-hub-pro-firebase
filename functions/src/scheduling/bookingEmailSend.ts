// Shared email-sending helpers for public-booking notifications.
// Used by notifyOnPublicBookingRequest (visitor ack + admin alert) and by
// the rejection path in updateClientBookingRequest. Both reuse the org's
// existing Resend integration + email_templates pipeline so admins customize
// once and every transactional email picks up the same branded design.

import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { consumeRateLimit } from '../rateLimit';
import { loadSecret } from '../lib/integrationSecrets';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export interface AutomationDoc {
  trigger?: string;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (e: string | null | undefined): e is string =>
  typeof e === 'string' && EMAIL_RE.test(e);

/** YYYY-MM-DD → "Jan 15, 2026" in the org's timezone. */
export function formatDateForDisplay(dateStr: string, tz: string): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  try {
    return d.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/** HH:MM → "2:30 PM" (wall-clock, timezone-agnostic). */
export function formatTimeForDisplay(timeStr: string): string {
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

export function renderAutomationContent(template: string, vars: Record<string, string>): string {
  if (!template) return '';
  return template.replace(/\[([A-Z_]+)\]/g, (match, key) => {
    const v = vars[key];
    return v !== undefined ? v : match;
  });
}

/**
 * Resolves {{#if VAR}}body{{else}}other{{/if}} blocks against the variables
 * map. A variable counts as truthy when it's a non-empty string. Handles
 * arbitrary nesting depth by repeatedly substituting innermost blocks first
 * (the negative-lookahead ensures we only match leaf blocks per pass).
 */
function processConditionals(html: string, variables: Record<string, string>): string {
  let current = html;
  // Safety cap; in practice 4-5 iterations is plenty even for deep nesting.
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

// Template variables whose value is already trusted, pre-rendered HTML and must
// NOT be HTML-escaped. `message` is the Layer-1 automation body (with <br>s).
// Every other variable is plain text/URL data and gets escaped so that
// unauthenticated visitor fields (visitor_name/notes/etc.) can't inject markup.
const RAW_HTML_TEMPLATE_KEYS = new Set(['message']);

export function renderTemplate(html: string, variables: Record<string, string>): string {
  // First collapse conditionals so {{#if x}}..{{/if}} blocks resolve to either
  // their body or their else branch. Then do plain {{var}} substitution on the
  // remainder, HTML-escaping every value except the trusted-HTML allowlist.
  const resolved = processConditionals(html, variables);
  return resolved.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const v = variables[key];
    if (v === undefined) return match;
    return RAW_HTML_TEMPLATE_KEYS.has(key) ? v : escapeHtml(v);
  });
}

/** Bare-bones fallback wrapper when no Layer-2 email template is configured. */
export const DEFAULT_TEMPLATE_HTML = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#1a1a1a">{{subject}}</h2>
  <p>Hi {{client_name}},</p>
  <div style="line-height:1.6">{{message}}</div>
  <br>
  <p style="color:#666;font-size:13px">— {{organization_name}}</p>
</body></html>`;

export interface EmailContext {
  orgData: FirebaseFirestore.DocumentData;
  fromName: string;
  fromEmail: string;
  resend: Resend;
  templateHtml: string;
  templateSettings: Record<string, string>;
  headerImageUrl: string;
}

/**
 * Resolves the org's Resend integration + branded template wrapper for a given
 * template key. Returns null if anything's missing (no Resend, no API key,
 * no fromEmail). Caller should skip silently in that case.
 *
 * `templateKey` is the preferred email_templates key (e.g. 'booking_request_received');
 * fallback chain is templateKey → 'general' → 'default' → built-in stub.
 */
export async function resolveEmailContext(
  orgId: string,
  templateKey: string,
): Promise<EmailContext | null> {
  const orgDoc = await db.collection('organizations').doc(orgId).get();
  const orgData = orgDoc.data() || {};

  const integrationSnap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('marketingIntegrations')
    .where('provider', '==', 'resend')
    .where('is_enabled', '==', true)
    .limit(1)
    .get();
  if (integrationSnap.empty) return null;

  const integrationData = integrationSnap.docs[0].data();
  const config = (integrationData.configuration ?? {}) as ResendIntegrationConfig;
  // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
  const { apiKey } = await loadSecret(orgId, 'resend', integrationData);
  if (!apiKey) return null;
  const fromName = config.fromName || String(orgData.name || 'Beauty Hub Pro');
  const fromEmail = config.fromEmail;
  if (!fromEmail) return null;

  const emailTemplates = (integrationData.email_templates ?? {}) as Record<
    string,
    { html?: string; settings?: Record<string, unknown> } | undefined
  >;
  // Fallback chain: try the specific templateKey first, then the common
  // transactional designs, then ANY designed template the org has — so brand
  // colors / logos / header images carry over even when the admin hasn't
  // designed a template named to match the new triggers. The built-in plain
  // stub is only reached when no designed template exists at all.
  const pickFirstWithHtml = (keys: string[]) =>
    keys.map((k) => emailTemplates[k]).find((t) => typeof t?.html === 'string' && t!.html!.length > 0);
  // See appointmentScheduledNotification.ts for the same exclusion — these
  // wrappers carry their own outcome-specific copy and break when used as a
  // generic shell. Safe to skip in the any-template fallback even when the
  // caller's requested templateKey is itself a booking_request_* (that hits
  // the explicit lookup above first).
  const TRANSACTIONAL_OUTCOME_KEYS = new Set([
    'booking_request_received',
    'booking_request_admin_alert',
    'booking_request_declined',
  ]);
  const template =
    emailTemplates[templateKey] ||
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
      ([k, t]) =>
        !TRANSACTIONAL_OUTCOME_KEYS.has(k) &&
        typeof t?.html === 'string' &&
        t!.html!.length > 0,
    )?.[1];
  const templateHtml = template?.html || DEFAULT_TEMPLATE_HTML;
  const templateSettings = (template?.settings ?? {}) as Record<string, string>;
  const headerImageUrl = String(integrationData.email_header_image_url ?? '');

  return {
    orgData,
    fromName,
    fromEmail,
    resend: new Resend(apiKey),
    templateHtml,
    templateSettings,
    headerImageUrl,
  };
}

/** Looks up the first active email-capable automation matching a trigger string. */
export async function getActiveEmailAutomation(
  orgId: string,
  trigger: string,
): Promise<AutomationDoc | null> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('marketingAutomations')
    .where('trigger', '==', trigger)
    .where('is_active', '==', true)
    .get();
  for (const doc of snap.docs) {
    const data = doc.data() as AutomationDoc;
    if (data.message_type === 'email' || data.message_type === 'both') return data;
  }
  return null;
}

export interface RenderAndSendArgs {
  orgId: string;
  toEmail: string;
  toName: string;
  automation: AutomationDoc;
  ctx: EmailContext;
  vars: Record<string, string>;
  /** Used in clientCommunications.sentBy for audit and the rate-limit bucket. */
  sendKind: string;
  /** Optional booking-request id for audit linkage. */
  bookingRequestId?: string;
  /** Optional clientId so the email shows on the client's profile timeline. */
  clientId?: string | null;
  /** Per-day rate-limit budget for this email category. */
  rateLimit?: number;
}

/** Renders Layer-1 (automation body) inside Layer-2 (branded wrapper) and sends via Resend. */
export async function renderAndSend(args: RenderAndSendArgs): Promise<void> {
  const {
    orgId, toEmail, toName, automation, ctx, vars,
    sendKind, bookingRequestId, clientId, rateLimit = 500,
  } = args;

  await consumeRateLimit(orgId, sendKind, rateLimit);

  const subject = renderAutomationContent(String(automation.subject || ''), vars);
  // The rendered body is injected into the wrapper as raw {{message}} HTML, so
  // escape the substituted token VALUES first — otherwise unauthenticated
  // visitor fields ([VISITOR_NAME]/[VISITOR_NOTES]/...) could inject markup.
  // The subject above is a plain-text email header and stays unescaped.
  const bodyVars = Object.fromEntries(
    Object.entries(vars).map(([k, v]) => [k, escapeHtml(String(v ?? ''))]),
  );
  const renderedBody = renderAutomationContent(String(automation.content || ''), bodyVars);

  const templateVariables: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(ctx.templateSettings).map(([k, v]) => [k, String(v ?? '')]),
    ),
    subject,
    message: renderedBody.replace(/\n/g, '<br>'),
    client_name: toName,
    organization_name: String(ctx.orgData.name || ctx.fromName),
    organization_phone: String(ctx.orgData.phone || ''),
    organization_address: String(ctx.orgData.address || ''),
    organization_email: String(ctx.orgData.email || ctx.fromEmail),
    logo_url: String(ctx.orgData.logo_url || ''),
    header_image_url: ctx.headerImageUrl,
    sender_name: ctx.fromName,
    from_email: ctx.fromEmail,
    cta_url: '',
    date: vars.DATE,
    datetime: `${vars.DATE} ${vars.TIME}`,
    treatment: vars.TREATMENT,
    time: vars.TIME,
    staff: vars.STAFF,
    // Aliases — when this email falls back to the appointment_reminder /
    // appointment_confirmation wrapper (because the org hasn't designed a
    // dedicated booking_request_* template yet), these template variables
    // pick up the same values so the email still renders fully filled in.
    service_name: vars.TREATMENT,
    appointment_date: vars.DATE,
    appointment_time: vars.TIME,
    staff_name: vars.STAFF,
    location: String(ctx.orgData.address || ''),
    // Public-booking-specific variables — passed through to the Layer 2
    // templates so admin-alert and decline emails can render the visitor's
    // info and the staff response inside the branded HTML wrapper.
    visitor_name: vars.VISITOR_NAME ?? '',
    visitor_email: vars.VISITOR_EMAIL ?? '',
    visitor_phone: vars.VISITOR_PHONE ?? '',
    visitor_notes: vars.VISITOR_NOTES ?? '',
    reason: vars.REASON ?? vars.STAFF_RESPONSE ?? '',
  };

  const html = renderTemplate(ctx.templateHtml, templateVariables);

  const result = await ctx.resend.emails.send({
    from: `${ctx.fromName} <${ctx.fromEmail}>`,
    to: [toEmail],
    subject,
    html,
  });

  if (result.error) {
    throw new Error(
      (result.error as { message?: string }).message || JSON.stringify(result.error),
    );
  }

  await db.collection('organizations').doc(orgId).collection('clientCommunications').add({
    clientId: clientId ?? null,
    type: 'email',
    status: 'delivered',
    subject,
    to: toEmail,
    messageId: result.data?.id || null,
    sentBy: sendKind,
    refType: bookingRequestId ? 'bookingRequest' : null,
    refId: bookingRequestId ?? null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
