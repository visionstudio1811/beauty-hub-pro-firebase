import { onRequest, Request } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { consumeRateLimit } from '../rateLimit';
import { loadPaymentConfig, loadPaymentSecrets, PaymentProvider } from './settings';
import { verifyStripeEvent } from './stripe';
import { verifySquareSignature } from './square';
import { fulfillRenewal, markRenewalRequestIfPending } from './fulfillRenewal';
import { handleClubStripeEvent } from '../club/stripeEvents';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WEBHOOK_FULFILL_DAILY_LIMIT = 1000;

function orgIdFromQuery(req: Request): string | null {
  const raw = req.query?.org ?? req.query?.organizationId;
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v && v.length <= 128 && !v.includes('/') ? v : null;
}

function eventRef(orgId: string, eventId: string) {
  return db
    .collection('organizations')
    .doc(orgId)
    .collection('paymentEvents')
    .doc(eventId.replace(/[/]/g, '_').slice(0, 1500));
}

async function claimEvent(orgId: string, provider: PaymentProvider, eventId: string, type: string): Promise<boolean> {
  const ref = eventRef(orgId, eventId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    const now = Date.now();
    tx.set(ref, {
      provider,
      event_id: eventId,
      type,
      status: 'processing',
      received_at: admin.firestore.Timestamp.fromMillis(now),
      expiresAt: admin.firestore.Timestamp.fromMillis(now + EVENT_TTL_MS),
    });
    return true;
  });
}

async function finishEvent(orgId: string, eventId: string, result: Record<string, unknown>): Promise<void> {
  await eventRef(orgId, eventId).set({ status: 'processed', result }, { merge: true });
}

// Releasing the claim on failure lets the provider's retry re-run fulfillment; fulfillRenewal
// is idempotent on the request's `paid` status so a double delivery can never double-credit.
async function releaseEvent(orgId: string, eventId: string): Promise<void> {
  try {
    await eventRef(orgId, eventId).delete();
  } catch (err) {
    console.error('paymentEvents release failed:', err instanceof Error ? err.message : String(err));
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stripeRenewalRequestId(session: Stripe.Checkout.Session): string | null {
  const fromRef = session.client_reference_id;
  if (typeof fromRef === 'string' && fromRef.trim()) return fromRef.trim();
  const fromMeta = session.metadata?.renewalRequestId;
  return typeof fromMeta === 'string' && fromMeta.trim() ? fromMeta.trim() : null;
}

async function handleStripeEvent(orgId: string, event: Stripe.Event, secretKey: string): Promise<Record<string, unknown>> {
  const club = await handleClubStripeEvent(orgId, event, secretKey);
  if (club) return club;

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== 'paid') return { handled: false, reason: `payment_status=${session.payment_status}` };
      const renewalRequestId = stripeRenewalRequestId(session);
      if (!renewalRequestId) return { handled: false, reason: 'no_renewal_request_id' };
      if (session.metadata?.organizationId && session.metadata.organizationId !== orgId) {
        return { handled: false, reason: 'org_mismatch' };
      }
      await consumeRateLimit(orgId, 'paymentWebhookFulfill', WEBHOOK_FULFILL_DAILY_LIMIT);
      const paymentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? session.id;
      const result = await fulfillRenewal(orgId, renewalRequestId, {
        provider: 'stripe',
        payment_id: paymentId,
        amount: session.amount_total ?? 0,
        currency: (session.currency ?? '').toUpperCase(),
      });
      return { handled: true, renewalRequestId, ...result };
    }
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const renewalRequestId = stripeRenewalRequestId(session);
      if (!renewalRequestId) return { handled: false, reason: 'no_renewal_request_id' };
      const changed = await markRenewalRequestIfPending(orgId, renewalRequestId, 'payment_failed', {
        failure_reason: 'async_payment_failed',
      });
      return { handled: true, renewalRequestId, changed };
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const renewalRequestId = stripeRenewalRequestId(session);
      if (!renewalRequestId) return { handled: false, reason: 'no_renewal_request_id' };
      const changed = await markRenewalRequestIfPending(orgId, renewalRequestId, 'cancelled', {
        failure_reason: 'checkout_expired',
      });
      return { handled: true, renewalRequestId, changed };
    }
    default:
      return { handled: false, reason: 'ignored_event_type' };
  }
}

export const stripeWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const orgId = orgIdFromQuery(req);
  if (!orgId) {
    res.status(400).json({ error: 'Missing ?org=ORGID in webhook URL' });
    return;
  }

  let event: Stripe.Event;
  let stripeSecretKey = '';
  try {
    const [config, secrets] = await Promise.all([loadPaymentConfig(orgId), loadPaymentSecrets(orgId)]);
    if (!config || !secrets.stripe_webhook_secret || !secrets.stripe_secret_key) {
      res.status(403).json({ error: 'Stripe webhook is not configured for this organization' });
      return;
    }
    stripeSecretKey = secrets.stripe_secret_key;
    const signature = req.get('stripe-signature');
    if (!signature) {
      res.status(401).json({ error: 'Missing webhook signature' });
      return;
    }
    try {
      event = verifyStripeEvent(req.rawBody ?? Buffer.from(''), signature, secrets.stripe_webhook_secret);
    } catch {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
  } catch (err) {
    console.error('stripeWebhook setup error:', errorText(err));
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  let claimed = false;
  try {
    claimed = await claimEvent(orgId, 'stripe', event.id, event.type);
    if (!claimed) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    const result = await handleStripeEvent(orgId, event, stripeSecretKey);
    await finishEvent(orgId, event.id, result);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`stripeWebhook processing error (org ${orgId}, event ${event.id}):`, errorText(err));
    if (claimed) await releaseEvent(orgId, event.id);
    res.status(500).json({ error: 'Processing failed' });
  }
});

interface SquareWebhookBody {
  event_id?: string;
  type?: string;
  merchant_id?: string;
  data?: {
    type?: string;
    id?: string;
    object?: {
      payment?: {
        id?: string;
        status?: string;
        order_id?: string;
        amount_money?: { amount?: number | string; currency?: string };
      };
    };
  };
}

function parseSquareBody(req: Request, rawBody: string): SquareWebhookBody | null {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body as SquareWebhookBody;
  try {
    return JSON.parse(rawBody) as SquareWebhookBody;
  } catch {
    return null;
  }
}

async function findRenewalRequestByOrderId(orgId: string, orderId: string): Promise<string | null> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('renewalRequests')
    .where('checkout.order_id', '==', orderId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}

async function handleSquareEvent(orgId: string, body: SquareWebhookBody): Promise<Record<string, unknown>> {
  if (body.type !== 'payment.updated' && body.type !== 'payment.created') {
    return { handled: false, reason: 'ignored_event_type' };
  }
  const payment = body.data?.object?.payment;
  const orderId = typeof payment?.order_id === 'string' ? payment.order_id : '';
  if (!payment || !orderId) return { handled: false, reason: 'no_order_id' };

  const renewalRequestId = await findRenewalRequestByOrderId(orgId, orderId);
  if (!renewalRequestId) return { handled: false, reason: 'no_matching_renewal_request' };

  if (payment.status === 'COMPLETED') {
    await consumeRateLimit(orgId, 'paymentWebhookFulfill', WEBHOOK_FULFILL_DAILY_LIMIT);
    const result = await fulfillRenewal(orgId, renewalRequestId, {
      provider: 'square',
      payment_id: typeof payment.id === 'string' ? payment.id : orderId,
      amount: Math.round(Number(payment.amount_money?.amount ?? 0)),
      currency: (payment.amount_money?.currency ?? '').toUpperCase(),
    });
    return { handled: true, renewalRequestId, ...result };
  }
  if (payment.status === 'FAILED' || payment.status === 'CANCELED') {
    const changed = await markRenewalRequestIfPending(orgId, renewalRequestId, 'payment_failed', {
      failure_reason: `square_payment_${payment.status.toLowerCase()}`,
    });
    return { handled: true, renewalRequestId, changed };
  }
  return { handled: false, reason: `payment_status=${payment.status}` };
}

export const squareWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const orgId = orgIdFromQuery(req);
  if (!orgId) {
    res.status(400).json({ error: 'Missing ?org=ORGID in webhook URL' });
    return;
  }

  let body: SquareWebhookBody | null;
  try {
    const [config, secrets] = await Promise.all([loadPaymentConfig(orgId), loadPaymentSecrets(orgId)]);
    if (!config || !secrets.square_webhook_signature_key) {
      res.status(403).json({ error: 'Square webhook is not configured for this organization' });
      return;
    }
    const signature = req.get('x-square-hmacsha256-signature');
    if (!signature) {
      res.status(401).json({ error: 'Missing webhook signature' });
      return;
    }
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const notificationUrl = config.square.notification_url || `https://${req.get('host')}${req.originalUrl}`;
    const valid = verifySquareSignature({
      signatureKey: secrets.square_webhook_signature_key,
      notificationUrl,
      rawBody,
      signatureHeader: signature,
    });
    if (!valid) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    body = parseSquareBody(req, rawBody);
    if (!body || typeof body.event_id !== 'string' || !body.event_id) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }
  } catch (err) {
    console.error('squareWebhook setup error:', errorText(err));
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  const eventId = body.event_id as string;
  let claimed = false;
  try {
    claimed = await claimEvent(orgId, 'square', eventId, body.type ?? 'unknown');
    if (!claimed) {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    const result = await handleSquareEvent(orgId, body);
    await finishEvent(orgId, eventId, result);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`squareWebhook processing error (org ${orgId}, event ${eventId}):`, errorText(err));
    if (claimed) await releaseEvent(orgId, eventId);
    res.status(500).json({ error: 'Processing failed' });
  }
});
