import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { consumeRateLimit } from './rateLimit';
import { requireQuoAdmin, quoFetch, findQuoPhoneNumberId } from './lib/quo';
import {
  loadQuoWebhookSecrets,
  integrationSecretRef,
  deleteQuoWebhookSecrets,
} from './lib/integrationSecrets';

if (!admin.apps.length) admin.initializeApp();

/**
 * Webhook endpoints we register with Quo. Each is a separate Quo webhook with
 * its own signing secret. `messages` + `calls` are essential; transcripts and
 * summaries are best-effort enrichment.
 */
const CHANNELS: { key: string; path: string; events: string[]; essential: boolean }[] = [
  { key: 'messages', path: '/webhooks/messages', events: ['message.received', 'message.delivered'], essential: true },
  { key: 'calls', path: '/webhooks/calls', events: ['call.completed', 'call.recording.completed'], essential: true },
  { key: 'transcripts', path: '/webhooks/call-transcripts', events: ['call.transcript.completed'], essential: false },
  { key: 'summaries', path: '/webhooks/call-summaries', events: ['call.summary.completed'], essential: false },
];

function receiverUrl(orgId: string, token: string): string {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'beauty-hub-pro-app';
  return `https://us-central1-${projectId}.cloudfunctions.net/quoWebhook?org=${encodeURIComponent(orgId)}&t=${encodeURIComponent(token)}`;
}

/** Quo returns a per-endpoint signing secret on create; field name varies, so probe candidates. */
function extractSecret(body: any): string | undefined {
  const c = body?.data ?? body ?? {};
  return c.secret || c.signingSecret || c.signing_secret || c.key || undefined;
}
function extractId(body: any): string | undefined {
  const c = body?.data ?? body ?? {};
  return c.id || c.webhookId || undefined;
}

export const registerQuoWebhooks = onCall(async (request) => {
  const { orgId, ref, data, cfg } = await requireQuoAdmin(request);
  await consumeRateLimit(orgId, 'quoWebhookRegister', 20);

  // Existing webhook secrets/token now live in the write-only secret subdoc.
  const existing = await loadQuoWebhookSecrets(orgId, data);
  const token = existing.webhook_token || crypto.randomUUID();
  const url = receiverUrl(orgId, token);

  // Scope the webhooks to the org's own Quo number. We must NEVER fall back to
  // workspace-wide ('*') scope: that would deliver every other tenant's
  // messages/calls on this workspace to this org's receiver. If the org's own
  // phone number id can't be resolved, fail the registration outright so the
  // webhooks are always scoped to the org's own resourceIds.
  let phoneNumberId: string | null = null;
  try {
    phoneNumberId = await findQuoPhoneNumberId(cfg.apiKey, cfg.fromNumber);
  } catch (err) {
    throw new HttpsError(
      'failed-precondition',
      `Could not resolve this organization's Quo phone number (${cfg.fromNumber}) to scope the webhooks: ${
        err instanceof Error ? err.message : String(err)
      }. Refusing to register workspace-wide webhooks. Verify the number is provisioned in Quo and the API key has access.`,
    );
  }
  if (!phoneNumberId) {
    throw new HttpsError(
      'failed-precondition',
      `This organization's Quo number (${cfg.fromNumber}) was not found in the Quo workspace, so webhooks cannot be scoped to it. Refusing to register workspace-wide webhooks. Provision the number in Quo, then retry.`,
    );
  }
  const resourceIds: string[] = [phoneNumberId];

  const webhookIds: Record<string, string> = { ...(data.webhook_ids ?? {}) };
  const webhookSecrets: Record<string, string> = { ...(existing.webhook_secrets ?? {}) };
  const warnings: string[] = [];

  for (const ch of CHANNELS) {
    try {
      const res = await quoFetch(cfg.apiKey, ch.path, {
        method: 'POST',
        body: JSON.stringify({
          events: ch.events,
          url,
          label: 'Beauty Hub Pro',
          resourceIds,
          status: 'enabled',
        }),
      });
      if (!res.ok) {
        const msg = `${ch.key}: Quo error (${res.status}): ${await res.text()}`;
        if (ch.essential) throw new HttpsError('internal', msg);
        warnings.push(msg);
        continue;
      }
      const body = await res.json().catch(() => ({}));
      const id = extractId(body);
      const secret = extractSecret(body);
      if (id) webhookIds[ch.key] = id;
      if (secret) webhookSecrets[ch.key] = secret;
      else warnings.push(`${ch.key}: no signing secret returned — inbound events from this webhook cannot be verified.`);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      const msg = `${ch.key}: ${err instanceof Error ? err.message : String(err)}`;
      if (ch.essential) throw new HttpsError('internal', msg);
      warnings.push(msg);
    }
  }

  if (Object.keys(webhookSecrets).length === 0) {
    throw new HttpsError(
      'internal',
      'Quo did not return any webhook signing secrets, so inbound events could not be secured. Check your Quo API permissions and try again.',
    );
  }

  // Split the write: non-secret webhook_ids + status stay on the client-readable
  // parent doc (the UI reads webhook_ids); the signing secrets + token go to the
  // server-only secret subdoc.
  await integrationSecretRef(orgId, 'quo').set(
    { webhook_secrets: webhookSecrets, webhook_token: token },
    { merge: true },
  );
  await ref.set(
    {
      webhook_ids: webhookIds,
      status: 'connected',
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );

  return { success: true, registered: Object.keys(webhookIds), warnings };
});

export const unregisterQuoWebhooks = onCall(async (request) => {
  const { orgId, ref, data, cfg } = await requireQuoAdmin(request);
  await consumeRateLimit(orgId, 'quoWebhookRegister', 20);

  const ids = Object.values(data.webhook_ids ?? {}).filter(Boolean) as string[];
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const res = await quoFetch(cfg.apiKey, `/webhooks/${id}`, { method: 'DELETE' });
      // 404 means it's already gone — treat as success.
      if (!res.ok && res.status !== 404) errors.push(`${id}: ${res.status} ${await res.text()}`);
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await deleteQuoWebhookSecrets(orgId);
  await ref.set(
    {
      webhook_ids: admin.firestore.FieldValue.delete(),
      // Legacy top-level fields (pre-migration) — harmless if already absent.
      webhook_secrets: admin.firestore.FieldValue.delete(),
      webhook_token: admin.firestore.FieldValue.delete(),
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );

  if (errors.length) return { success: true, warnings: errors };
  return { success: true };
});
