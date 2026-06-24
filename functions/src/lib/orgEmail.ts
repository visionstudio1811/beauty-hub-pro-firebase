import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { loadSecret } from './integrationSecrets';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export type AutomationKey =
  | 'welcome'
  | 'birthday'
  | 'inactive'
  | 'package_renewal'
  | 'appointment_reminder'
  | 'appointment_reminder_sms';

export interface AutomationConfig {
  is_active?: boolean;
  vip_only?: boolean;
  days_offset?: number;
  days_threshold?: number;
  days_before_expiry?: number;
  hours_before?: number;
  /** Reminder SMS: send a text alongside the reminder email. */
  sms_enabled?: boolean;
  /** Reminder SMS body (supports [NAME]/[DATE]/[TIME]/… tokens). */
  sms_body?: string;
}

export interface OrgEmailContext {
  orgId: string;
  orgData: admin.firestore.DocumentData;
  fromName: string;
  fromEmail: string;
  apiKey: string;
  emailTemplates: Record<string, { html?: string; settings?: Record<string, unknown> }>;
  headerImageUrl: string;
  automations: Partial<Record<AutomationKey, AutomationConfig>>;
  resend: Resend;
}

/**
 * Loads everything needed to send a templated email for an org.
 * Returns null if Resend isn't configured + enabled — callers should skip silently.
 */
export async function loadOrgEmailContext(orgId: string): Promise<OrgEmailContext | null> {
  const [orgSnap, integrationDoc] = await Promise.all([
    db.collection('organizations').doc(orgId).get(),
    db.collection('organizations').doc(orgId).collection('marketingIntegrations').doc('resend').get(),
  ]);

  if (!orgSnap.exists) return null;
  if (!integrationDoc.exists) return null;

  const integration = integrationDoc.data() ?? {};
  if (integration.is_enabled === false) return null;

  const config = (integration.configuration ?? {}) as {
    fromName?: string;
    fromEmail?: string;
  };
  // Secret apiKey now lives in the write-only secret subdoc (legacy
  // configuration.apiKey is the fallback for un-migrated orgs). No env fallback
  // here — this context requires a per-org Resend key, as before.
  const { apiKey } = await loadSecret(orgId, 'resend', integration);
  if (!apiKey) return null;

  const orgData = orgSnap.data() ?? {};

  return {
    orgId,
    orgData,
    fromName: config.fromName || orgData.name || 'Beauty Hub Pro',
    fromEmail: config.fromEmail || 'info@beautyhubpro.com',
    apiKey,
    emailTemplates: (integration.email_templates ?? {}) as OrgEmailContext['emailTemplates'],
    headerImageUrl: (integration.email_header_image_url as string | undefined) ?? '',
    automations: (integration.email_automations ?? {}) as OrgEmailContext['automations'],
    resend: new Resend(apiKey),
  };
}

/** Reads a single automation config, returning empty object if missing. */
export function getAutomation(ctx: OrgEmailContext, key: AutomationKey): AutomationConfig {
  return ctx.automations?.[key] ?? {};
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Renders a Handlebars-lite template — supports {{var}}, {{#if x}}A{{/if}}, {{#if x}}A{{else}}B{{/if}}. */
export function renderTemplate(html: string, variables: Record<string, string>): string {
  let rendered = html;

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
    rendered = rendered.replace(regex, escapeHtml(String(value ?? '')));
  }

  rendered = rendered.replace(/\{\{[^}]*\}\}/g, '');
  return rendered;
}

const FALLBACK_TEMPLATE = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <h2 style="color:#1a1a1a">{{subject}}</h2>
  <p>Hi {{client_name}},</p>
  <div style="line-height:1.6">{{message}}</div>
  <br>
  <p style="color:#666;font-size:13px">— {{organization_name}}</p>
</body></html>`;

interface SendOrgEmailOptions {
  ctx: OrgEmailContext;
  to: string;
  subject: string;
  templateType: string;
  variables?: Record<string, string>;
  /** clientId for clientCommunications log */
  clientId?: string;
  /** Stored on the communication doc for cross-check / dedupe queries */
  automationKey?: AutomationKey;
  /** Optional foreign-key (purchaseId, appointmentId) attached to the log */
  refType?: string;
  refId?: string;
  /** Optional HTML injected just before </body> (e.g. appointment CTA buttons). */
  appendHtml?: string;
}

/**
 * Builds the full set of merge variables (org details + per-template settings + caller variables)
 * and sends via Resend. Logs the send to clientCommunications.
 */
export async function sendOrgEmail(opts: SendOrgEmailOptions): Promise<{ messageId: string | null; status: 'delivered' | 'failed'; error?: string }> {
  const { ctx, to, subject, templateType, variables = {}, clientId, automationKey, refType, refId, appendHtml } = opts;

  const template = ctx.emailTemplates[templateType] || ctx.emailTemplates['general'] || ctx.emailTemplates['default'];
  const templateHtml = template?.html || FALLBACK_TEMPLATE;
  const templateSettings = (template?.settings ?? {}) as Record<string, unknown>;

  const orgTimezone = ctx.orgData.timezone || 'America/New_York';

  const mergeVars: Record<string, string> = {
    ...Object.fromEntries(Object.entries(templateSettings).map(([k, v]) => [k, String(v ?? '')])),
    subject,
    client_name: variables.client_name || '',
    message: variables.message || '',
    organization_name: String(ctx.orgData.name || ctx.fromName),
    organization_phone: String(ctx.orgData.phone || ''),
    organization_address: String(ctx.orgData.address || ''),
    organization_email: String(ctx.orgData.email || ctx.fromEmail || ''),
    logo_url: String(ctx.orgData.logo_url || ''),
    header_image_url: ctx.headerImageUrl,
    sender_name: ctx.fromName,
    from_email: ctx.fromEmail,
    cta_url: '',
    date: new Date().toLocaleDateString('en-US', { timeZone: orgTimezone }),
    datetime: new Date().toLocaleString('en-US', { timeZone: orgTimezone }),
    ...Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, String(v ?? '')])),
  };

  let html = renderTemplate(templateHtml, mergeVars);
  if (appendHtml) {
    html = html.includes('</body>') ? html.replace('</body>', `${appendHtml}</body>`) : html + appendHtml;
  }

  const res = await ctx.resend.emails.send({
    from: `${ctx.fromName} <${ctx.fromEmail}>`,
    to: [to],
    subject,
    html,
  });

  const status: 'delivered' | 'failed' = res.error ? 'failed' : 'delivered';
  const errorMsg = res.error ? ((res.error as { message?: string }).message || JSON.stringify(res.error)) : undefined;

  const logDoc: Record<string, unknown> = {
    clientId: clientId ?? null,
    type: 'email',
    status,
    subject,
    to,
    messageId: res.data?.id ?? null,
    sentBy: 'system',
    automationKey: automationKey ?? null,
    templateType,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (errorMsg) logDoc.error = errorMsg;
  if (refType && refId) {
    logDoc.refType = refType;
    logDoc.refId = refId;
  }

  await db
    .collection('organizations')
    .doc(ctx.orgId)
    .collection('clientCommunications')
    .add(logDoc);

  return { messageId: res.data?.id ?? null, status, error: errorMsg };
}

/**
 * Returns true if a clientCommunications doc with the given automationKey + refId already exists.
 * Use to make automations idempotent across retries / re-runs.
 */
export async function alreadySent(orgId: string, automationKey: AutomationKey, refType: string, refId: string): Promise<boolean> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('clientCommunications')
    .where('automationKey', '==', automationKey)
    .where('refType', '==', refType)
    .where('refId', '==', refId)
    .where('status', '==', 'delivered')
    .limit(1)
    .get();
  return !snap.empty;
}

/** Returns the local hour (0-23) for an IANA timezone — used to gate "9am local" runs. */
export function localHour(tz: string): number {
  const formatted = new Date().toLocaleString('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  });
  return parseInt(formatted, 10);
}

/** Today as YYYY-MM-DD in the given IANA timezone (en-CA gives ISO format). */
export function todayInTimezone(tz: string): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

/** Adds N days to a YYYY-MM-DD string and returns the new YYYY-MM-DD. */
export function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}
