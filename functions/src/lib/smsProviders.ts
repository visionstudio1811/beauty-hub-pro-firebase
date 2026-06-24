import * as admin from 'firebase-admin';
import { loadSecret } from './integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export type SmsProvider = 'twilio' | 'infobip' | 'quo';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

interface InfobipConfig {
  apiKey: string;
  sender: string;
  baseUrl: string;
}

interface QuoConfig {
  apiKey: string;
  fromNumber: string;
  userId?: string;
}

async function loadIntegration(orgId: string, provider: SmsProvider) {
  const snap = await db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc(provider)
    .get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (!data.is_enabled) return null;
  // Merge the write-only secret subdoc (apiKey/authToken/accountSid) over the
  // public configuration. Falls back to legacy configuration.<secret> when the
  // secret subdoc doesn't exist yet (un-migrated org).
  const secret = await loadSecret(orgId, provider, data);
  const configuration = { ...(data.configuration ?? {}), ...secret };
  return configuration as TwilioConfig | InfobipConfig | QuoConfig;
}

export async function sendViaTwilio(
  orgId: string,
  to: string,
  body: string,
): Promise<void> {
  const cfg = (await loadIntegration(orgId, 'twilio')) as TwilioConfig | null;
  if (!cfg) throw new Error('Twilio integration not configured or disabled.');
  if (!cfg.accountSid || !cfg.authToken || !cfg.phoneNumber)
    throw new Error('Twilio credentials incomplete.');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`;
  const creds = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: cfg.phoneNumber, To: to, Body: body }).toString(),
  });
  if (!res.ok) throw new Error(`Twilio error: ${await res.text()}`);
}

export async function sendViaInfobip(
  orgId: string,
  to: string,
  body: string,
): Promise<void> {
  const cfg = (await loadIntegration(orgId, 'infobip')) as InfobipConfig | null;
  if (!cfg) throw new Error('Infobip integration not configured or disabled.');
  if (!cfg.apiKey || !cfg.sender) throw new Error('Infobip credentials incomplete.');
  const base = (cfg.baseUrl || 'https://api.infobip.com').replace(/\/$/, '');
  const res = await fetch(`${base}/sms/2/text/advanced`, {
    method: 'POST',
    headers: {
      Authorization: `App ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      messages: [{ from: cfg.sender, destinations: [{ to }], text: body }],
    }),
  });
  if (!res.ok) throw new Error(`Infobip error: ${await res.text()}`);
}

export async function sendViaQuo(
  orgId: string,
  to: string,
  body: string,
): Promise<void> {
  const cfg = (await loadIntegration(orgId, 'quo')) as QuoConfig | null;
  if (!cfg) throw new Error('Quo integration not configured or disabled.');
  if (!cfg.apiKey || !cfg.fromNumber) throw new Error('Quo credentials incomplete.');
  // Quo auth uses the raw API key — NOT a Bearer/Basic prefix.
  const res = await fetch('https://api.quo.com/v1/messages', {
    method: 'POST',
    headers: {
      Authorization: cfg.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: body,
      from: cfg.fromNumber,
      to: [to],
      ...(cfg.userId ? { userId: cfg.userId } : {}),
    }),
  });
  // Quo returns 202 Accepted on success; res.ok covers the 2xx range.
  if (!res.ok) throw new Error(`Quo error (${res.status}): ${await res.text()}`);
}

/**
 * Best-effort E.164 normalizer. Returns null when the input clearly cannot
 * be sent (empty, too short, too long).
 *
 * Defaults to US (+1) when no country code is present — change defaultCc if
 * Lumière ever sends to non-US numbers from a different default region.
 */
export function normalizePhoneE164(raw: string | undefined | null, defaultCc = '1'): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (defaultCc === '1') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export async function sendSms(
  orgId: string,
  to: string,
  body: string,
  provider: SmsProvider,
): Promise<void> {
  const normalized = normalizePhoneE164(to);
  if (!normalized) throw new Error(`Invalid phone number: "${to}"`);
  switch (provider) {
    case 'infobip': return sendViaInfobip(orgId, normalized, body);
    case 'quo':     return sendViaQuo(orgId, normalized, body);
    case 'twilio':
    default:        return sendViaTwilio(orgId, normalized, body);
  }
}

// Order matters: the first enabled provider in this list becomes the default
// when no `is_primary` flag is set. Infobip stays first to preserve historical
// behavior; Quo is opt-in (selected per-send or promoted via is_primary).
const PROVIDER_PRIORITY: SmsProvider[] = ['infobip', 'twilio', 'quo'];

/**
 * Pick a provider for an org when the caller hasn't specified one.
 * Among the enabled providers: an explicit `is_primary: true` wins; otherwise
 * the first enabled provider in PROVIDER_PRIORITY order is used.
 * Throws if none is enabled.
 */
export async function resolveProvider(orgId: string): Promise<SmsProvider> {
  const base = db.collection('organizations').doc(orgId).collection('marketingIntegrations');
  const snaps = await Promise.all(PROVIDER_PRIORITY.map((p) => base.doc(p).get()));

  const enabled = PROVIDER_PRIORITY
    .map((provider, i) => ({ provider, data: snaps[i].exists ? snaps[i].data() : undefined }))
    .filter((x) => x.data?.is_enabled === true);

  if (enabled.length === 0) {
    throw new Error('No SMS provider configured. Enable Twilio, Infobip, or Quo in Marketing → Integrations.');
  }

  const primary = enabled.find((x) => x.data?.is_primary === true);
  if (primary) return primary.provider;

  return enabled[0].provider;
}

const STOP_REGEX = /reply\s+stop|text\s+stop|stop\s+to\s+(unsubscribe|opt\s*out)/i;

/**
 * Append a TCR-compliant opt-out instruction to a marketing SMS body
 * unless one is already present. Caller controls whether this runs
 * (transactional waiver/OTP messages skip it).
 */
export function ensureOptOutSuffix(body: string): string {
  if (STOP_REGEX.test(body)) return body;
  const trimmed = body.replace(/\s+$/, '');
  return `${trimmed} Reply STOP to unsubscribe.`;
}
