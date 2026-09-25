import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import {
  AcuityApiError,
  type AcuityAppointment,
  MappingResolver,
  acuityRequest,
  getAcuityConfig,
  importAcuityAppointment,
  isCanceled,
  lazyClientIndex,
  loadAcuityAccess,
  orgTimeZone,
  webhookImportMode,
} from './lib/acuity';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * What Acuity actually posts (form-encoded): the event name plus ids. Client
 * and time details are NOT included — they're fetched from the API below.
 */
interface WebhookPayload {
  id: string;
  action: string;
}

const APPOINTMENT_EVENTS = new Set(['scheduled', 'rescheduled', 'canceled', 'changed']);

/** Constant-time comparison to prevent timing attacks */
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const computed = hmac.digest('base64');
    // Use timingSafeEqual to prevent timing attacks
    const sigBuf = Buffer.from(signature);
    const computedBuf = Buffer.from(computed);
    if (sigBuf.length !== computedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, computedBuf);
  } catch {
    return false;
  }
}

// Replay window for the timestamp-based check (±5 minutes). Acuity's default
// form-encoded payload has no signed timestamp, so this only applies when one
// is present; otherwise we fall back to the state-fingerprint dedupe below.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;
// How long a processed-webhook marker lives before it may be pruned.
const DEDUPE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Parse a webhook-provided unix timestamp (seconds or millis) into millis.
 * Returns null when absent/unparseable so callers can fall back to dedupe.
 */
function parseWebhookTimestamp(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Heuristic: 10-digit values are seconds, 13-digit are millis.
  return n < 1e12 ? n * 1000 : n;
}

/** Fingerprint of the appointment fields we sync, to recognise a repeat of an already-applied state. */
function appointmentFingerprint(appt: AcuityAppointment): string {
  const relevant = [
    appt.datetime,
    appt.duration,
    isCanceled(appt),
    appt.calendarID,
    appt.appointmentTypeID,
    appt.firstName,
    appt.lastName,
    appt.email,
    appt.phone,
    appt.notes,
  ];
  return crypto.createHash('sha256').update(JSON.stringify(relevant)).digest('hex').slice(0, 16);
}

/** One marker per appointment holding the last state we applied. */
function markerRef(organizationId: string, payload: WebhookPayload) {
  // Sanitize the id so it is safe as a Firestore document id (no '/').
  const safeId = String(payload.id).replace(/[/]/g, '_');
  return db
    .collection('organizations')
    .doc(organizationId)
    .collection('processedWebhooks')
    .doc(`appt_${safeId}`);
}

/**
 * Best-effort replay guard. If Acuity provides a signed timestamp, reject
 * anything outside a ±5 minute window. Otherwise, drop the event only when it
 * repeats the exact state last applied for this appointment within the TTL —
 * any real change (including a move back to an earlier time) goes through.
 * Never throws — a failure here must not 500 the webhook (which would trigger
 * an Acuity retry). Returns true when the request may proceed.
 */
async function passesReplayCheck(
  ref: admin.firestore.DocumentReference,
  payload: WebhookPayload,
  fingerprint: string,
  signedTimestamp: number | null,
): Promise<boolean> {
  // Timestamp-based check (only when Acuity actually signs a timestamp).
  if (signedTimestamp != null) {
    if (Math.abs(Date.now() - signedTimestamp) > REPLAY_WINDOW_MS) return false;
  }

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const last = snap.data();
      if (last?.fingerprint === fingerprint && now - Number(last?.processedAtMs ?? 0) < DEDUPE_TTL_MS) {
        return false; // same state replayed within the TTL
      }
      tx.set(ref, {
        acuity_id: payload.id,
        action: payload.action,
        fingerprint,
        processedAtMs: now,
        // Firestore TTL policy can be attached to expiresAt to auto-prune.
        expiresAt: Timestamp.fromMillis(now + DEDUPE_TTL_MS),
      });
      return true;
    });
  } catch (err) {
    // Non-fatal: if the dedupe transaction fails, fail open so a transient
    // Firestore error doesn't drop a legitimate webhook.
    console.error('Acuity replay-check error:', err instanceof Error ? err.message : String(err));
    return true;
  }
}

async function logWebhook(organizationId: string, payload: WebhookPayload, action: string, status: string) {
  // Log only non-PII metadata
  await db.collection('organizations').doc(organizationId).collection('acuitySyncLogs').add({
    sync_type: 'webhook',
    entity_type: 'appointment',
    acuity_id: payload.id,
    event: payload.action,
    action,
    status,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const acuityWebhook = onRequest(async (req, res) => {
  // Acuity posts server-to-server — no browser, no CORS needed.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const signature = req.headers['x-acuity-signature'] as string | undefined;

    // Signature header is mandatory — reject immediately if missing
    if (!signature) {
      res.status(401).json({ error: 'Missing webhook signature' });
      return;
    }

    // Acuity signs the raw wire bytes (form-encoded by default). Express
    // already parsed req.body into an object; JSON.stringify-ing it back
    // produces different bytes than what Acuity actually signed, so the
    // HMAC never matches. Use req.rawBody (preserved by Cloud Functions v2)
    // so the signature input matches the source bytes.
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const contentType = req.headers['content-type'] || '';
    const fields: Record<string, unknown> = contentType.includes('application/json')
      ? ((req.body ?? {}) as Record<string, unknown>)
      : Object.fromEntries(new URLSearchParams(rawBody));
    const payload: WebhookPayload = {
      id: String(fields.id ?? fields.appointmentID ?? fields.appointmentId ?? ''),
      action: String(fields.action ?? ''),
    };

    // Validate payload has required fields
    if (!payload.id || !payload.action) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }

    // Required: ?org={orgId} in the URL. This used to fall back to
    // `collectionGroup('acuitySyncConfig').limit(1)` which would pick the
    // first org with sync enabled — letting any org's signature potentially
    // validate against another's secret. Webhook URL must be tenant-scoped.
    const organizationId =
      (typeof req.query?.org === 'string' && req.query.org) ||
      (typeof req.query?.organizationId === 'string' && req.query.organizationId) ||
      '';
    if (!organizationId) {
      res.status(400).json({
        error:
          'Missing ?org=ORGID in webhook URL. Configure the Acuity webhook URL to include the org id as a query parameter.',
      });
      return;
    }

    const config = await getAcuityConfig(organizationId);
    if (!config) {
      res.status(404).json({ error: 'No Acuity configuration found for this organization' });
      return;
    }
    if (config.data.sync_enabled !== true) {
      res.status(403).json({ error: 'Acuity sync is disabled for this organization' });
      return;
    }

    // Acuity signs webhooks with the account's API key, so the org's own
    // (write-only) key is the verification secret. A legacy `webhook_secret`
    // on the config doc is still accepted. There is never a global fallback.
    const { creds, webhookSecrets: secrets } = await loadAcuityAccess(config);
    if (secrets.length === 0) {
      // No secret configured — reject to prevent unauthenticated processing
      res.status(403).json({ error: 'Acuity credentials not configured for this organization' });
      return;
    }

    // Always validate signature using constant-time comparison
    if (!secrets.some((secret) => verifyWebhookSignature(rawBody, signature, secret))) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    // Static webhooks may post the bare event name ("scheduled"); the webhooks
    // API uses "appointment.scheduled". Accept both.
    const event = payload.action.replace(/^appointment\./, '');
    if (!APPOINTMENT_EVENTS.has(event) || !/^\d{1,20}$/.test(payload.id)) {
      res.status(200).json({ success: true, ignored: true });
      return;
    }
    if (!creds) {
      // Verified via the legacy secret, but without API credentials we can't read the booking.
      res.status(200).json({ success: true, skipped: 'no_credentials' });
      return;
    }

    let appt: AcuityAppointment;
    const fetchedAt = Date.now();
    try {
      appt = await acuityRequest<AcuityAppointment>(creds, `appointments/${payload.id}`);
    } catch (err) {
      if (err instanceof AcuityApiError && (err.status === 404 || err.status === 401 || err.status === 403)) {
        // Deleted booking or revoked key: a retry can't succeed, so don't ask Acuity for one.
        await logWebhook(organizationId, payload, 'fetch', `failed_${err.status}`);
        res.status(200).json({ success: false, skipped: `acuity_${err.status}` });
        return;
      }
      throw err; // 500 → Acuity retries later
    }

    // Replay protection (runs only AFTER the signature is verified so an
    // attacker can't spend Firestore writes on unauthenticated requests).
    // Prefer a signed timestamp if Acuity provides one; otherwise dedupe on
    // the appointment id + state fingerprint within a short TTL.
    const signedTimestamp = parseWebhookTimestamp(
      (req.headers['x-acuity-timestamp'] as string | undefined) ||
        (req.headers['x-acuity-request-timestamp'] as string | undefined),
    );
    const marker = markerRef(organizationId, payload);
    const fresh = await passesReplayCheck(marker, payload, appointmentFingerprint(appt), signedTimestamp);
    if (!fresh) {
      // 200 so Acuity does not retry a request we've intentionally dropped.
      res.status(200).json({ success: true, duplicate: true });
      return;
    }

    try {
      // Already-imported appointments always follow Acuity (reschedules and
      // cancellations). Only a *new booking* is imported, according to the
      // org's mode (never / existing CRM clients / all); a later event for a
      // booking that isn't in the CRM — skipped earlier, or deleted by staff —
      // doesn't create it.
      const mode = webhookImportMode(config.data);
      const [mapping, timeZone] = await Promise.all([
        MappingResolver.load(organizationId, config.data),
        orgTimeZone(organizationId),
      ]);
      const result = await importAcuityAppointment(
        { orgId: organizationId, timeZone, clients: lazyClientIndex(organizationId), mapping, now: Date.now() },
        appt,
        {
          allowCreate: mode !== 'off' && event === 'scheduled',
          createMissingClients: mode === 'all',
          skipCanceled: true,
          fetchedAt,
        },
      );
      if (result.status === 'skipped') {
        // Only applied states are deduped: a booking skipped by the import
        // mode must be re-evaluated if it arrives again (e.g. after the mode
        // changes or the client is added to the CRM).
        await marker.delete().catch(() => undefined);
      }
      await logWebhook(
        organizationId,
        payload,
        result.status === 'skipped' ? `skip_${result.reason}` : result.status,
        'success',
      );
      res.status(200).json({ success: true, status: result.status });
    } catch (err) {
      // Release the marker so Acuity's retry isn't dropped as a duplicate.
      await marker.delete().catch(() => undefined);
      throw err;
    }
  } catch (error) {
    // Do not expose internal error details
    console.error('Webhook processing error:', error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: 'Internal server error' });
  }
});
