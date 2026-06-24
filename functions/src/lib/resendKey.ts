import * as admin from 'firebase-admin';
import { loadSecret } from './integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export interface ResendCredentials {
  apiKey: string;
  fromName: string;
  fromEmail: string;
  /** The raw main-doc data so callers can reuse email_templates/header image/automations. */
  raw: admin.firestore.DocumentData;
}

/**
 * Single Resend resolver used by every email path. Honors `is_enabled`, merges
 * the write-only secret apiKey (secret subdoc → legacy `configuration.apiKey`
 * fallback), then the global RESEND_API_KEY env secret. Returns null when no key
 * is resolvable. `fromName`/`fromEmail` come from the public configuration.
 */
export async function loadResendCredentials(orgId: string): Promise<ResendCredentials | null> {
  let data: admin.firestore.DocumentData = {};
  try {
    const snap = await db
      .collection('organizations').doc(orgId)
      .collection('marketingIntegrations').doc('resend')
      .get();
    data = snap.exists ? (snap.data() ?? {}) : {};
  } catch {
    data = {};
  }

  const enabled = data.is_enabled !== false;
  let apiKey: string | undefined;
  if (enabled) {
    const secret = await loadSecret(orgId, 'resend', data);
    apiKey = secret.apiKey;
  }
  apiKey = apiKey || process.env.RESEND_API_KEY || undefined;
  if (!apiKey) return null;

  const cfg = (data.configuration ?? {}) as { fromName?: string; fromEmail?: string };
  return {
    apiKey,
    fromName: cfg.fromName || 'Beauty Hub Pro',
    fromEmail: cfg.fromEmail || 'info@beautyhubpro.com',
    raw: data,
  };
}

/** Back-compat: just the Resend API key (org per-org → env fallback). */
export async function loadResendApiKey(orgId: string): Promise<string | null> {
  const creds = await loadResendCredentials(orgId);
  return creds?.apiKey || process.env.RESEND_API_KEY || null;
}
