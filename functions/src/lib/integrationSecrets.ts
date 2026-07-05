import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export type IntegrationProvider = 'twilio' | 'infobip' | 'quo' | 'resend' | 'googleDrive';

/** Which `configuration.*` fields are secret per provider (used for read fallback + migration). */
export const SECRET_KEYS: Record<IntegrationProvider, string[]> = {
  twilio: ['accountSid', 'authToken'],
  infobip: ['apiKey'],
  quo: ['apiKey'], // quo webhook_* secrets handled separately
  resend: ['apiKey'],
  googleDrive: ['refresh_token'], // long-lived OAuth token — never on the client-readable parent doc
};

function mainRef(orgId: string, provider: IntegrationProvider) {
  return db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc(provider);
}

/** Server-only secret subdoc — Firestore rules deny all client read/write here. */
function secretRef(orgId: string, provider: IntegrationProvider) {
  return mainRef(orgId, provider).collection('secret').doc('value');
}

/**
 * Reads the write-only secret subdoc. If it doesn't exist yet (un-migrated org),
 * falls back to the legacy `configuration.<secret>` fields on the main doc so the
 * code is safe to deploy before the migration runs. Returns a flat string map.
 */
export async function loadSecret(
  orgId: string,
  provider: IntegrationProvider,
  mainData?: admin.firestore.DocumentData | null,
): Promise<Record<string, string>> {
  const secSnap = await secretRef(orgId, provider).get();
  if (secSnap.exists) return (secSnap.data() ?? {}) as Record<string, string>;

  const data = mainData ?? (await mainRef(orgId, provider).get()).data() ?? {};
  const cfg = (data.configuration ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of SECRET_KEYS[provider]) {
    if (typeof cfg[k] === 'string' && cfg[k]) out[k] = cfg[k] as string;
  }
  return out;
}

interface QuoWebhookSecrets {
  webhook_secret?: string;
  webhook_secrets?: Record<string, string>;
  webhook_token?: string;
}

/** Quo webhook secrets — secret subdoc first, then legacy top-level fields on the main doc. */
export async function loadQuoWebhookSecrets(
  orgId: string,
  mainData?: admin.firestore.DocumentData | null,
): Promise<QuoWebhookSecrets> {
  const secSnap = await secretRef(orgId, 'quo').get();
  if (secSnap.exists) {
    const d = secSnap.data() ?? {};
    if (d.webhook_secret || d.webhook_secrets || d.webhook_token) {
      return {
        webhook_secret: d.webhook_secret,
        webhook_secrets: d.webhook_secrets,
        webhook_token: d.webhook_token,
      };
    }
  }
  const data = mainData ?? (await mainRef(orgId, 'quo').get()).data() ?? {};
  return {
    webhook_secret: data.webhook_secret,
    webhook_secrets: data.webhook_secrets,
    webhook_token: data.webhook_token,
  };
}

/** All Quo webhook signing secrets as a deduped list (for trying each on verification). */
export async function loadWebhookSecrets(
  orgId: string,
  mainData?: admin.firestore.DocumentData | null,
): Promise<string[]> {
  const { webhook_secret, webhook_secrets } = await loadQuoWebhookSecrets(orgId, mainData);
  const out = new Set<string>();
  if (webhook_secrets) for (const v of Object.values(webhook_secrets)) if (v) out.add(v);
  if (webhook_secret) out.add(webhook_secret);
  return [...out];
}

function last4(s: string): string {
  return s.length <= 4 ? s : s.slice(-4);
}

/**
 * Admin-SDK write of secret fields into the server-only subdoc, plus a
 * `has_secret` / `secret_last4` hint on the main doc for the UI. Merges so a
 * partial update (e.g. only authToken) keeps other secret fields.
 */
export async function writeSecret(
  orgId: string,
  provider: IntegrationProvider,
  fields: Record<string, unknown>,
  opts: { last4Source?: string } = {},
): Promise<void> {
  await secretRef(orgId, provider).set(fields, { merge: true });
  const src =
    opts.last4Source ??
    (typeof fields.apiKey === 'string' ? fields.apiKey : undefined) ??
    (typeof fields.authToken === 'string' ? fields.authToken : undefined) ??
    '';
  await mainRef(orgId, provider).set(
    {
      has_secret: true,
      ...(src ? { secret_last4: last4(src) } : {}),
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
}

/** Delete the webhook secrets from the subdoc (used by unregisterQuoWebhooks). */
export async function deleteQuoWebhookSecrets(orgId: string): Promise<void> {
  await secretRef(orgId, 'quo').set(
    {
      webhook_secret: admin.firestore.FieldValue.delete(),
      webhook_secrets: admin.firestore.FieldValue.delete(),
      webhook_token: admin.firestore.FieldValue.delete(),
    },
    { merge: true },
  );
}

export { mainRef as integrationMainRef, secretRef as integrationSecretRef };
