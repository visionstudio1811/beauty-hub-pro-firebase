import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyQuoSignature, quoIntegrationRef, QuoIntegrationData } from './lib/quo';
import { loadQuoWebhookSecrets, loadWebhookSecrets } from './lib/integrationSecrets';
import { normalizePhoneE164, resolveProvider, sendSms } from './lib/smsProviders';
import { consumeRateLimit } from './rateLimit';
import {
  findNearestUpcomingAppointment,
  confirmAppointment,
  requestCancellation,
  requestReschedule,
  alertStaff,
  getOrgTimezone,
  todayInTimezone,
  describeAppointment,
} from './lib/appointmentConfirm';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/* ------------------------------------------------------------------ */
/* Quo webhook payload shapes (subset we consume)                      */
/* ------------------------------------------------------------------ */
interface QuoEvent {
  type?: string;
  data?: {
    resource?: {
      id?: string;
      callId?: string;
      direction?: string;
      text?: string;
      status?: string;
      duration?: number;
      createdAt?: string;
      answeredAt?: string;
      completedAt?: string;
      hasVoicemail?: boolean;
      recordings?: { id?: string; url?: string }[];
      dialogue?: { userId?: string | null; identifier?: string | null; content?: string }[];
      summary?: string[] | null;
      nextSteps?: string[] | null;
    };
    context?: {
      senderIdentifier?: string;
      recipientIdentifiers?: string[];
      participants?: { workspace?: string[]; external?: string[] };
    };
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Best-effort client lookup by phone for a single org. Single-field equality → auto-indexed. */
async function findClientIdByPhone(orgId: string, phone: string | undefined | null): Promise<string | null> {
  if (!phone) return null;
  const clients = db.collection('organizations').doc(orgId).collection('clients');
  const norm = normalizePhoneE164(phone);
  if (norm) {
    const snap = await clients.where('phone', '==', norm).limit(1).get();
    if (!snap.empty) return snap.docs[0].id;
  }
  if (phone !== norm) {
    const snap = await clients.where('phone', '==', phone).limit(1).get();
    if (!snap.empty) return snap.docs[0].id;
  }
  return null;
}

const commsRef = (orgId: string) =>
  db.collection('organizations').doc(orgId).collection('clientCommunications');

/** Create one SMS row, deduped on the Quo message id. Returns true if newly written. */
async function writeMessageRow(orgId: string, ev: QuoEvent, direction: 'inbound' | 'outbound'): Promise<boolean> {
  const resource = ev.data?.resource ?? {};
  const context = ev.data?.context ?? {};
  const messageId = resource.id;
  if (!messageId) return false;

  // Idempotency: skip if we've already stored this message.
  const existing = await commsRef(orgId).where('quo_message_id', '==', messageId).limit(1).get();
  if (!existing.empty) return false;

  const counterparty =
    direction === 'inbound' ? context.senderIdentifier : (context.recipientIdentifiers ?? [])[0];
  const clientId = await findClientIdByPhone(orgId, counterparty);

  await commsRef(orgId).add({
    client_id: clientId,
    type: 'sms',
    direction,
    message: resource.text ?? '',
    status: resource.status ?? (direction === 'inbound' ? 'received' : 'delivered'),
    from: context.senderIdentifier ?? null,
    to: context.recipientIdentifiers ?? null,
    source: 'quo',
    quo_message_id: messageId,
    sent_at: resource.createdAt ?? new Date().toISOString(),
    sent_at_ts: admin.firestore.FieldValue.serverTimestamp(),
  });
  return true;
}

const STOP_WORDS = /^(STOP|STOPALL|UNSUBSCRIBE|QUIT|END|CANCELALL|OPTOUT|OPT-OUT)$/;
const CONFIRM_WORDS = /^(1|YES|Y|CONFIRM|CONFIRMED|OK|OKAY)$/;
const CANCEL_WORDS = /^(2|CANCEL|NO|N)$/;
const RESCHEDULE_WORDS = /^(3|RESCHEDULE|CHANGE|MOVE)$/;

/** Send a one-shot acknowledgement SMS back to the client (best-effort). */
async function ackSms(orgId: string, to: string, body: string): Promise<void> {
  try {
    await consumeRateLimit(orgId, 'appointmentReplyAck', 1000);
    const provider = await resolveProvider(orgId);
    await sendSms(orgId, to, body, provider);
  } catch (err) {
    console.error('Quo ack SMS failed:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Interpret an inbound SMS as an appointment action. STOP opts the client out;
 * 1/2/3 (or keywords) confirm / request-cancel / request-reschedule the client's
 * nearest upcoming appointment. Never throws — a parse failure must not 500 the
 * webhook (which would trigger a Quo retry storm).
 */
async function interpretReply(orgId: string, ev: QuoEvent): Promise<void> {
  try {
    const sender = ev.data?.context?.senderIdentifier;
    const raw = (ev.data?.resource?.text ?? '').trim();
    if (!sender || !raw) return;
    const normalized = raw.toUpperCase().replace(/[.!,?]/g, '').trim();

    // Opt-out takes precedence (carrier already auto-replies to STOP).
    if (STOP_WORDS.test(normalized)) {
      const clientId = await findClientIdByPhone(orgId, sender);
      if (clientId) {
        await db.collection('organizations').doc(orgId).collection('clients').doc(clientId).set(
          { sms_opt_out: true, sms_opt_out_at: new Date().toISOString() },
          { merge: true },
        );
      }
      return;
    }

    let intent: 'confirm' | 'cancel' | 'reschedule' | null = null;
    if (CONFIRM_WORDS.test(normalized)) intent = 'confirm';
    else if (CANCEL_WORDS.test(normalized)) intent = 'cancel';
    else if (RESCHEDULE_WORDS.test(normalized)) intent = 'reschedule';
    if (!intent) return; // free-text message — already logged, nothing to action

    const clientId = await findClientIdByPhone(orgId, sender);
    if (!clientId) return;

    const tz = await getOrgTimezone(orgId);
    const appt = await findNearestUpcomingAppointment(orgId, clientId, todayInTimezone(tz));
    if (!appt) {
      await ackSms(orgId, sender, "We couldn't find an upcoming appointment to update. Please call us and we'll help.");
      return;
    }

    const when = describeAppointment(appt.data, tz);
    if (intent === 'confirm') {
      await confirmAppointment(orgId, appt.id, 'sms');
      await ackSms(orgId, sender, `Thank you! Your appointment${when ? ` on ${when}` : ''} is confirmed ✅`);
    } else if (intent === 'cancel') {
      await requestCancellation(orgId, appt.id, 'sms');
      await alertStaff(orgId, appt.id, 'cancellation', String(appt.data.client_name || ''));
      await ackSms(orgId, sender, `We've passed your cancellation request${when ? ` for ${when}` : ''} to our team, who will follow up shortly.`);
    } else {
      await requestReschedule(orgId, appt.id, 'sms');
      await alertStaff(orgId, appt.id, 'reschedule', String(appt.data.client_name || ''));
      await ackSms(orgId, sender, `We've passed your reschedule request${when ? ` for ${when}` : ''} to our team, who will reach out to find a new time.`);
    }
  } catch (err) {
    console.error('Quo interpretReply error:', err instanceof Error ? err.message : String(err));
  }
}

/** Create or update a call row keyed by call_id. */
async function upsertCallRow(
  orgId: string,
  callId: string,
  counterparty: string | undefined,
  patch: Record<string, unknown>,
) {
  const snap = await commsRef(orgId).where('call_id', '==', callId).limit(1).get();
  if (!snap.empty) {
    await snap.docs[0].ref.set(patch, { merge: true });
    return;
  }
  const clientId = await findClientIdByPhone(orgId, counterparty);
  await commsRef(orgId).add({
    client_id: clientId,
    type: 'call',
    source: 'quo',
    call_id: callId,
    status: 'completed',
    sent_at: new Date().toISOString(),
    sent_at_ts: admin.firestore.FieldValue.serverTimestamp(),
    ...patch,
  });
}

function mapCallDirection(d?: string): 'inbound' | 'outbound' {
  return d === 'outgoing' ? 'outbound' : 'inbound';
}

async function handleEvent(orgId: string, ev: QuoEvent): Promise<void> {
  const type = ev.type ?? '';
  const resource = ev.data?.resource ?? {};
  const external = ev.data?.context?.participants?.external ?? [];
  const counterparty = external[0];

  switch (type) {
    case 'message.received': {
      const isNew = await writeMessageRow(orgId, ev, 'inbound');
      if (isNew) await interpretReply(orgId, ev);
      return;
    }
    case 'message.delivered':
      await writeMessageRow(orgId, ev, 'outbound');
      return;

    case 'call.completed': {
      const callId = resource.id;
      if (!callId) return;
      const direction = mapCallDirection(resource.direction);
      const dur = typeof resource.duration === 'number' ? resource.duration : null;
      const label = `${direction === 'inbound' ? 'Incoming' : 'Outgoing'} call${
        dur != null ? ` · ${dur}s` : ''
      }${resource.status ? ` (${resource.status})` : ''}`;
      return upsertCallRow(orgId, callId, counterparty, {
        direction,
        message: label,
        status: resource.status ?? 'completed',
        duration: dur,
        has_voicemail: resource.hasVoicemail ?? false,
        started_at: resource.answeredAt ?? resource.createdAt ?? null,
        completed_at: resource.completedAt ?? null,
        sent_at: resource.createdAt ?? new Date().toISOString(),
      });
    }

    case 'call.recording.completed': {
      const callId = resource.id;
      if (!callId) return;
      const url = (resource.recordings ?? []).map((r) => r.url).filter(Boolean)[0] ?? null;
      return upsertCallRow(orgId, callId, counterparty, { recording_url: url });
    }

    case 'call.transcript.completed': {
      const callId = resource.callId;
      if (!callId) return;
      const transcript = (resource.dialogue ?? [])
        .map((d) => `${d.userId ? 'Staff' : d.identifier || 'Client'}: ${d.content ?? ''}`)
        .join('\n');
      return upsertCallRow(orgId, callId, counterparty, { transcript });
    }

    case 'call.summary.completed': {
      const callId = resource.callId;
      if (!callId) return;
      return upsertCallRow(orgId, callId, counterparty, {
        summary: (resource.summary ?? []).join(' '),
        next_steps: (resource.nextSteps ?? []).join('; '),
      });
    }

    default:
      // Unknown / unsubscribed event — acknowledge without writing.
      return;
  }
}

/* ------------------------------------------------------------------ */
/* Receiver                                                            */
/* ------------------------------------------------------------------ */
export const quoWebhook = onRequest(async (req, res) => {
  // Server-to-server; no browser/CORS.
  if (req.method === 'OPTIONS') {
    res.status(405).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Tenant scoping is mandatory and explicit — never auto-discover the org.
    const orgId =
      (typeof req.query?.org === 'string' && req.query.org) ||
      (typeof req.query?.organizationId === 'string' && req.query.organizationId) ||
      '';
    if (!orgId) {
      res.status(400).json({ error: 'Missing ?org=ORGID in webhook URL.' });
      return;
    }

    const snap = await quoIntegrationRef(orgId).get();
    if (!snap.exists || !snap.data()?.is_enabled) {
      res.status(404).json({ error: 'Quo integration not found or disabled for this organization.' });
      return;
    }
    const data = snap.data() as QuoIntegrationData;

    // Webhook token + signing secrets now live in the write-only secret subdoc
    // (legacy top-level fields are the fallback for un-migrated orgs).
    const { webhook_token } = await loadQuoWebhookSecrets(orgId, data);

    // Optional secondary guard: a per-org token baked into the registered URL.
    if (webhook_token && req.query?.t !== webhook_token) {
      res.status(401).json({ error: 'Invalid webhook token' });
      return;
    }

    const secrets = await loadWebhookSecrets(orgId, data);
    if (secrets.length === 0) {
      res.status(403).json({ error: 'Webhook secret not configured for this organization.' });
      return;
    }

    // Svix-style signature over the exact raw bytes Quo sent. Each registered
    // endpoint has its own signing secret, so accept a match against any of them.
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const webhookId = (req.headers['webhook-id'] as string) || '';
    const webhookTimestamp = (req.headers['webhook-timestamp'] as string) || '';
    const signatureHeader = (req.headers['webhook-signature'] as string) || '';

    const valid = secrets.some((secret) =>
      verifyQuoSignature({ webhookId, webhookTimestamp, rawBody, signatureHeader, secret }),
    );
    if (!valid) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const ev = (req.body ?? {}) as QuoEvent;
    await handleEvent(orgId, ev);

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Quo webhook error:', error?.message);
    // 5xx so Quo retries transient failures.
    res.status(500).json({ error: 'Internal server error' });
  }
});
