import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { loadSecret } from './integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const QUO_BASE_URL = 'https://api.quo.com/v1';

export interface QuoConfig {
  apiKey: string;
  fromNumber: string;
  userId?: string;
}

export interface QuoIntegrationData {
  configuration?: QuoConfig;
  is_enabled?: boolean;
  /** Legacy single signing secret. */
  webhook_secret?: string;
  /** Per-endpoint signing secrets (Quo issues one per registered webhook). */
  webhook_secrets?: Record<string, string>;
  webhook_token?: string;
  webhook_ids?: { messages?: string; calls?: string; transcripts?: string; summaries?: string };
  [k: string]: unknown;
}

/** All signing secrets we know about for an org, newest model first. */
export function collectWebhookSecrets(data: QuoIntegrationData): string[] {
  const secrets = new Set<string>();
  if (data.webhook_secrets) {
    for (const v of Object.values(data.webhook_secrets)) if (v) secrets.add(v);
  }
  if (data.webhook_secret) secrets.add(data.webhook_secret);
  return [...secrets];
}

export function quoIntegrationRef(orgId: string) {
  return db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc('quo');
}

/**
 * Authenticated Quo REST call. Quo uses the raw API key in the Authorization
 * header (no Bearer/Basic prefix). Throws on a non-2xx response.
 */
export async function quoFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(`${QUO_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return res;
}

/** Resolve the Quo phone number id (PN…) for a given E.164 number. */
export async function findQuoPhoneNumberId(apiKey: string, e164: string): Promise<string | null> {
  const res = await quoFetch(apiKey, '/phone-numbers');
  if (!res.ok) throw new Error(`Quo error (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data?: { id?: string; number?: string }[] };
  const match = (json.data ?? []).find((n) => n.number === e164);
  return match?.id ?? null;
}

/**
 * Verify a Quo (Svix-style) webhook signature.
 * Headers: webhook-id, webhook-timestamp, webhook-signature (space-separated
 * "v1,<base64>" entries). Signed content is `{id}.{timestamp}.{rawBody}`,
 * HMAC-SHA256 with the base64-decoded secret (after stripping `whsec_`),
 * encoded base64. Comparison is constant-time.
 */
export function verifyQuoSignature(opts: {
  webhookId: string;
  webhookTimestamp: string;
  rawBody: string;
  signatureHeader: string;
  secret: string;
}): boolean {
  try {
    const { webhookId, webhookTimestamp, rawBody, signatureHeader, secret } = opts;
    if (!webhookId || !webhookTimestamp || !signatureHeader || !secret) return false;

    const secretBase64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
    const secretBytes = Buffer.from(secretBase64, 'base64');

    const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
    const expectedBuf = Buffer.from(expected);

    // The header may carry multiple "v1,<sig>" entries separated by spaces.
    for (const part of signatureHeader.split(' ')) {
      const comma = part.indexOf(',');
      if (comma === -1) continue;
      const version = part.slice(0, comma);
      const sig = part.slice(comma + 1);
      if (version !== 'v1' || !sig) continue;
      const sigBuf = Buffer.from(sig);
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Shared auth gate for Quo admin callables. Validates the caller, matches the
 * org, requires admin/staff, and returns the loaded Quo integration.
 */
export async function requireQuoAdmin(
  request: CallableRequest,
): Promise<{ orgId: string; ref: admin.firestore.DocumentReference; data: QuoIntegrationData; cfg: QuoConfig }> {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const uid = request.auth.uid;
  const { organizationId } = request.data as { organizationId?: string };

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
  const userData = userDoc.data()!;
  const orgId = organizationId || userData.organizationId;

  if (!orgId || userData.organizationId !== orgId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (!['admin', 'staff'].includes(userData.role)) {
    throw new HttpsError('permission-denied', 'Staff or admin access required');
  }

  const ref = quoIntegrationRef(orgId);
  const snap = await ref.get();
  if (!snap.exists || !snap.data()?.is_enabled) {
    throw new HttpsError('not-found', 'Quo integration not configured or disabled.');
  }
  const data = snap.data() as QuoIntegrationData;
  // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
  const secret = await loadSecret(orgId, 'quo', data);
  const cfg = { ...(data.configuration ?? {}), ...secret } as QuoConfig;
  if (!cfg.apiKey || !cfg.fromNumber) {
    throw new HttpsError('failed-precondition', 'Quo credentials incomplete.');
  }

  return { orgId, ref, data, cfg };
}
