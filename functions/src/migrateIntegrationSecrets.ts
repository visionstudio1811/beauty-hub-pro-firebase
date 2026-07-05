import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { SECRET_KEYS, writeSecret, IntegrationProvider } from './lib/integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PROVIDERS: IntegrationProvider[] = ['twilio', 'infobip', 'quo', 'resend', 'googleDrive'];

/**
 * Platform operators allowed to drive the cross-tenant `migrateAllOrgsSecrets`
 * sweep. This is NOT the per-tenant `admin` role — an org admin must never be
 * able to trigger work across every organization. Preferred gate is the
 * `platformAdmin` custom auth claim; this allowlist is the fallback for
 * environments with no claim provisioning. Add operator UIDs here as needed.
 */
const PLATFORM_OPERATOR_UIDS: string[] = [];

function isPlatformOperator(request: { auth?: { uid: string; token?: Record<string, unknown> } }): boolean {
  if (!request.auth) return false;
  if (request.auth.token?.platformAdmin === true) return true;
  return PLATFORM_OPERATOR_UIDS.includes(request.auth.uid);
}

/**
 * Core idempotent migration for ONE org: copies any legacy secret fields still
 * in the client-readable `configuration` (+ Quo top-level webhook_*) into the
 * write-only secret subdoc, then DELETES them from the readable parent doc.
 * Returns a per-provider result. Re-running is a no-op.
 */
export async function migrateOrgSecretsInternal(orgId: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  for (const provider of PROVIDERS) {
    const mref = db.collection('organizations').doc(orgId)
      .collection('marketingIntegrations').doc(provider);
    const snap = await mref.get();
    if (!snap.exists) { result[provider] = 'absent'; continue; }
    const data = snap.data()!;
    const cfg = (data.configuration ?? {}) as Record<string, unknown>;

    const secretFields: Record<string, unknown> = {};
    const deletions: Record<string, admin.firestore.FieldValue> = {};

    for (const k of SECRET_KEYS[provider]) {
      if (typeof cfg[k] === 'string' && cfg[k]) {
        secretFields[k] = cfg[k];
        deletions[`configuration.${k}`] = admin.firestore.FieldValue.delete();
      }
    }
    // Quo top-level webhook secrets → secret subdoc.
    if (provider === 'quo') {
      for (const k of ['webhook_secret', 'webhook_secrets', 'webhook_token']) {
        if (data[k] != null) {
          secretFields[k] = data[k];
          deletions[k] = admin.firestore.FieldValue.delete();
        }
      }
    }

    if (Object.keys(secretFields).length === 0) { result[provider] = 'nothing-to-migrate'; continue; }

    const src =
      (typeof secretFields.apiKey === 'string' ? secretFields.apiKey : undefined) ??
      (typeof secretFields.authToken === 'string' ? secretFields.authToken : undefined) ??
      '';
    await writeSecret(orgId, provider, secretFields, { last4Source: src });
    await mref.update(deletions);
    result[provider] = 'migrated';
  }

  await db.collection('organizations').doc(orgId)
    .set({ integration_secrets_migrated_at: new Date().toISOString() }, { merge: true });

  return result;
}

/** Admin-only, per-org migration (also auto-invoked by the Integrations page). */
export const migrateIntegrationSecrets = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  const { organizationId } = request.data as { organizationId?: string };

  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
  const u = userDoc.data()!;
  if (u.role !== 'admin') throw new HttpsError('permission-denied', 'Admin role required');
  if (!organizationId || u.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }

  const result = await migrateOrgSecretsInternal(organizationId);
  return { success: true, result };
});

/**
 * Platform-ops sweep: migrates EVERY org's integration secrets in one shot, so
 * no tenant is left with a key exposed in its readable doc waiting for an admin
 * to visit the Integrations page. Idempotent and non-exposing (it only MOVES
 * secrets into the write-only store + strips the readable copy; it never returns
 * a secret value).
 *
 * Restricted to PLATFORM OPERATORS only (custom `platformAdmin` claim or the
 * operator UID allowlist) — a per-tenant `admin` must never be able to drive a
 * platform-wide sweep across every organization. Rate limit is unconditional:
 * if the caller has no organizationId we use a synthetic '_platform' key so the
 * sweep can never run uncapped.
 */
export const migrateAllOrgsSecrets = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

  if (!isPlatformOperator(request)) {
    throw new HttpsError('permission-denied', 'Platform operator access required');
  }

  // Unconditional rate limit — never let the cross-tenant sweep run uncapped.
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const rateLimitKey = (userDoc.exists && userDoc.data()?.organizationId) || '_platform';
  await consumeRateLimit(rateLimitKey, 'migrateAllOrgsSecrets', 10);

  const deadline = Date.now() + 480_000; // leave headroom before the 540s timeout
  const orgsSnap = await db.collection('organizations').select().get();
  const summary = { totalOrgs: orgsSnap.size, processed: 0, migratedOrgs: [] as string[], errors: [] as string[], done: true };

  for (const orgDoc of orgsSnap.docs) {
    if (Date.now() > deadline) { summary.done = false; break; }
    try {
      const res = await migrateOrgSecretsInternal(orgDoc.id);
      summary.processed++;
      if (Object.values(res).includes('migrated')) summary.migratedOrgs.push(orgDoc.id);
    } catch (err) {
      if (summary.errors.length < 20) summary.errors.push(`${orgDoc.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: true, ...summary };
});
