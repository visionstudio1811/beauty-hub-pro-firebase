import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface WebhookPayload {
  id: string;
  action: string;
  appointmentTypeID?: string;
  calendarID?: string;
  datetime?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  type?: string;
  duration?: string;
  notes?: string;
  date?: string;
  time?: string;
}

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
// is present; otherwise we fall back to the id/action dedupe below.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;
// How long a processed-webhook marker lives before it may be pruned. A replay
// beyond this window is effectively harmless because the underlying appointment
// state is already reconciled, but keep it comfortably longer than the timestamp
// window so short-TTL replays are always caught.
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

/**
 * Best-effort replay guard. If Acuity provides a signed timestamp, reject
 * anything outside a ±5 minute window. Otherwise, atomically record the
 * webhook's id/action marker and reject if it was already processed within the
 * dedupe TTL. Never throws — a failure here must not 500 the webhook (which
 * would trigger an Acuity retry). Returns true when the request may proceed.
 */
async function passesReplayCheck(
  organizationId: string,
  payload: WebhookPayload,
  signedTimestamp: number | null,
): Promise<boolean> {
  // Timestamp-based check (only when Acuity actually signs a timestamp).
  if (signedTimestamp != null) {
    if (Math.abs(Date.now() - signedTimestamp) > REPLAY_WINDOW_MS) return false;
  }

  // Short-TTL dedupe keyed by the appointment id + action. Sanitize the id so it
  // is safe as a Firestore document id (no '/').
  const safeId = String(payload.id).replace(/[/]/g, '_');
  const markerId = `${safeId}_${payload.action}`;
  const markerRef = db
    .collection('organizations')
    .doc(organizationId)
    .collection('processedWebhooks')
    .doc(markerId);

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(markerRef);
      const now = Date.now();
      if (snap.exists) {
        const processedAt = (snap.data()?.processedAtMs as number | undefined) ?? 0;
        if (now - processedAt < DEDUPE_TTL_MS) return false; // replay within TTL
      }
      tx.set(markerRef, {
        acuity_id: payload.id,
        action: payload.action,
        processedAtMs: now,
        // Firestore TTL policy can be attached to expiresAt to auto-prune.
        expiresAt: admin.firestore.Timestamp.fromMillis(now + DEDUPE_TTL_MS),
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

async function handleAppointmentWebhook(payload: WebhookPayload, organizationId: string) {
  const email = payload.email || null;
  const phone = payload.phone || null;

  if (payload.action === 'appointment.canceled') {
    const snap = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('appointments')
      .where('acuity_appointment_id', '==', payload.id)
      .get();

    for (const d of snap.docs) {
      await d.ref.update({ status: 'cancelled', last_synced_at: new Date().toISOString(), sync_status: 'synced' });
    }

    // Log only non-PII metadata
    await db.collection('organizations').doc(organizationId).collection('acuitySyncLogs').add({
      sync_type: 'webhook',
      entity_type: 'appointment',
      acuity_id: payload.id,
      action: 'cancel',
      status: 'success',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }

  if (['appointment.scheduled', 'appointment.rescheduled', 'appointment.updated'].includes(payload.action)) {
    const clientsRef = db.collection('organizations').doc(organizationId).collection('clients');

    let existingClientSnap: admin.firestore.QuerySnapshot | null = null;
    if (email) existingClientSnap = await clientsRef.where('email', '==', email).limit(1).get();
    if ((!existingClientSnap || existingClientSnap.empty) && phone) {
      existingClientSnap = await clientsRef.where('phone', '==', phone).limit(1).get();
    }

    const clientPayload = {
      name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
      email,
      phone: phone || '',
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    let clientId: string | null = null;
    if (existingClientSnap && !existingClientSnap.empty) {
      clientId = existingClientSnap.docs[0].id;
      await clientsRef.doc(clientId).update(clientPayload);
    } else if (clientPayload.name && (email || phone)) {
      const newClient = await clientsRef.add({
        ...clientPayload,
        deleted_at: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      clientId = newClient.id;
    }

    const apptRef = db.collection('organizations').doc(organizationId).collection('appointments');
    const apptSnap = await apptRef.where('acuity_appointment_id', '==', payload.id).limit(1).get();

    const appointmentData = {
      client_id: clientId,
      client_name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
      client_email: payload.email,
      client_phone: payload.phone,
      appointment_date: payload.date,
      appointment_time: payload.time,
      duration: parseInt(payload.duration || '60'),
      treatment_name: payload.type || 'Acuity Appointment',
      staff_name: 'Acuity Staff',
      notes: payload.notes,
      acuity_appointment_id: payload.id,
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      organization_id: organizationId,
      status: 'scheduled',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!apptSnap.empty) {
      await apptSnap.docs[0].ref.update(appointmentData);
    } else {
      await apptRef.add({ ...appointmentData, created_at: admin.firestore.FieldValue.serverTimestamp() });
    }

    // Log only non-PII metadata
    await db.collection('organizations').doc(organizationId).collection('acuitySyncLogs').add({
      sync_type: 'webhook',
      entity_type: 'appointment',
      acuity_id: payload.id,
      action: apptSnap.empty ? 'create' : 'update',
      status: 'success',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { success: true };
}

export const acuityWebhook = onRequest(
  { secrets: ['ACUITY_API_KEY'] },
  async (req, res) => {
    // Acuity posts server-to-server — no browser, no CORS needed.
    if (req.method === 'OPTIONS') {
      res.status(405).send('');
      return;
    }

    try {
      // Reject non-POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const signature = req.headers['x-acuity-signature'] as string | undefined;

      // Signature header is mandatory — reject immediately if missing
      if (!signature) {
        res.status(401).json({ error: 'Missing webhook signature' });
        return;
      }

      const contentType = req.headers['content-type'] || '';
      // Acuity signs the raw wire bytes (form-encoded by default). Express
      // already parsed req.body into an object; JSON.stringify-ing it back
      // produces different bytes than what Acuity actually signed, so the
      // HMAC never matches. Use req.rawBody (preserved by Cloud Functions v2)
      // so the signature input matches the source bytes.
      const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';

      let payload: WebhookPayload;
      if (contentType.includes('application/json')) {
        payload = req.body as WebhookPayload;
      } else {
        const params = new URLSearchParams(rawBody);
        payload = {
          id: params.get('id') || params.get('appointmentID') || params.get('appointmentId') || '',
          action: params.get('action') || '',
          appointmentTypeID: params.get('appointmentTypeID') || undefined,
          calendarID: params.get('calendarID') || undefined,
          datetime: params.get('datetime') || undefined,
          firstName: params.get('firstName') || undefined,
          lastName: params.get('lastName') || undefined,
          email: params.get('email') || undefined,
          phone: params.get('phone') || undefined,
          type: params.get('type') || undefined,
          duration: params.get('duration') || undefined,
          notes: params.get('notes') || undefined,
          date: params.get('date') || undefined,
          time: params.get('time') || undefined,
        };
      }

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

      const configSnap = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('acuitySyncConfig')
        .limit(1)
        .get();

      if (configSnap.empty) {
        res.status(404).json({ error: 'No Acuity configuration found for this organization' });
        return;
      }

      const orgConfig = configSnap.docs[0].data() ?? {};
      if (orgConfig.sync_enabled !== true) {
        res.status(403).json({ error: 'Acuity sync is disabled for this organization' });
        return;
      }

      // Use dedicated webhook_secret only — do NOT fall back to the API key
      const webhookSecret = orgConfig.webhook_secret as string | undefined;
      if (!webhookSecret) {
        // No secret configured — reject to prevent unauthenticated processing
        res.status(403).json({ error: 'Webhook secret not configured for this organization' });
        return;
      }

      // Always validate signature using constant-time comparison
      const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      // Replay protection (runs only AFTER the signature is verified so an
      // attacker can't spend Firestore writes on unauthenticated requests).
      // Prefer a signed timestamp if Acuity provides one; otherwise dedupe on
      // the appointment id + action within a short TTL.
      const signedTimestamp = parseWebhookTimestamp(
        (req.headers['x-acuity-timestamp'] as string | undefined) ||
          (req.headers['x-acuity-request-timestamp'] as string | undefined),
      );
      const fresh = await passesReplayCheck(organizationId, payload, signedTimestamp);
      if (!fresh) {
        // 200 so Acuity does not retry a request we've intentionally dropped.
        res.status(200).json({ success: true, duplicate: true });
        return;
      }

      let result: { success: boolean };
      if (payload.action?.startsWith('appointment.')) {
        result = await handleAppointmentWebhook(payload, organizationId);
      } else {
        result = { success: true };
      }

      res.status(200).json(result);
    } catch (error: any) {
      // Do not expose internal error details
      console.error('Webhook processing error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);
