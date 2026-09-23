import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export type PaymentProvider = 'stripe' | 'square';
export type PaymentMode = 'test' | 'live';
export type SquareEnvironment = 'sandbox' | 'production';

export interface PaymentConfig {
  provider: PaymentProvider | null;
  is_enabled: boolean;
  mode: PaymentMode;
  stripe: {
    publishable_key: string | null;
    has_secret_key: boolean;
    secret_key_last4: string | null;
    has_webhook_secret: boolean;
  };
  square: {
    location_id: string | null;
    environment: SquareEnvironment;
    notification_url: string | null;
    has_access_token: boolean;
    access_token_last4: string | null;
    has_webhook_signature_key: boolean;
  };
  updated_at: string;
}

export interface PaymentSecrets {
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  square_access_token?: string;
  square_webhook_signature_key?: string;
}

export const SECRET_FIELD_NAMES: ReadonlyArray<keyof PaymentSecrets> = [
  'stripe_secret_key',
  'stripe_webhook_secret',
  'square_access_token',
  'square_webhook_signature_key',
];

export function paymentConfigRef(orgId: string) {
  return db.collection('organizations').doc(orgId).collection('paymentSettings').doc('config');
}

export function paymentSecretRef(orgId: string) {
  return paymentConfigRef(orgId).collection('secret').doc('value');
}

function optString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function isPaymentProvider(v: unknown): v is PaymentProvider {
  return v === 'stripe' || v === 'square';
}

export function normalizePaymentConfig(data: admin.firestore.DocumentData | undefined): PaymentConfig {
  const d = data ?? {};
  const stripe = (d.stripe ?? {}) as Record<string, unknown>;
  const square = (d.square ?? {}) as Record<string, unknown>;
  return {
    provider: isPaymentProvider(d.provider) ? d.provider : null,
    is_enabled: d.is_enabled === true,
    mode: d.mode === 'live' ? 'live' : 'test',
    stripe: {
      publishable_key: optString(stripe.publishable_key),
      has_secret_key: stripe.has_secret_key === true,
      secret_key_last4: optString(stripe.secret_key_last4),
      has_webhook_secret: stripe.has_webhook_secret === true,
    },
    square: {
      location_id: optString(square.location_id),
      environment: square.environment === 'production' ? 'production' : 'sandbox',
      notification_url: optString(square.notification_url),
      has_access_token: square.has_access_token === true,
      access_token_last4: optString(square.access_token_last4),
      has_webhook_signature_key: square.has_webhook_signature_key === true,
    },
    updated_at: typeof d.updated_at === 'string' ? d.updated_at : '',
  };
}

export async function loadPaymentConfig(orgId: string): Promise<PaymentConfig | null> {
  const snap = await paymentConfigRef(orgId).get();
  if (!snap.exists) return null;
  return normalizePaymentConfig(snap.data());
}

export async function loadPaymentSecrets(orgId: string): Promise<PaymentSecrets> {
  const snap = await paymentSecretRef(orgId).get();
  if (!snap.exists) return {};
  const data = snap.data() ?? {};
  const out: PaymentSecrets = {};
  for (const k of SECRET_FIELD_NAMES) {
    const v = data[k];
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}

function last4(s: string): string {
  return s.length <= 4 ? s : s.slice(-4);
}

export async function writePaymentSecret(orgId: string, fields: PaymentSecrets): Promise<void> {
  const secretFields: Record<string, string> = {};
  for (const k of SECRET_FIELD_NAMES) {
    const v = fields[k];
    if (typeof v === 'string' && v) secretFields[k] = v;
  }
  if (Object.keys(secretFields).length === 0) return;

  await paymentSecretRef(orgId).set(secretFields, { merge: true });

  const stripeHints: Record<string, unknown> = {};
  const squareHints: Record<string, unknown> = {};
  if (secretFields.stripe_secret_key) {
    stripeHints.has_secret_key = true;
    stripeHints.secret_key_last4 = last4(secretFields.stripe_secret_key);
  }
  if (secretFields.stripe_webhook_secret) stripeHints.has_webhook_secret = true;
  if (secretFields.square_access_token) {
    squareHints.has_access_token = true;
    squareHints.access_token_last4 = last4(secretFields.square_access_token);
  }
  if (secretFields.square_webhook_signature_key) squareHints.has_webhook_signature_key = true;

  await paymentConfigRef(orgId).set(
    {
      ...(Object.keys(stripeHints).length ? { stripe: stripeHints } : {}),
      ...(Object.keys(squareHints).length ? { square: squareHints } : {}),
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function assertPaymentsEnabled(
  orgId: string,
  message = 'Online payments are not enabled for this organization',
): Promise<{ config: PaymentConfig; secrets: PaymentSecrets }> {
  const [config, secrets] = await Promise.all([loadPaymentConfig(orgId), loadPaymentSecrets(orgId)]);
  if (!config || !config.is_enabled || !config.provider) {
    throw new HttpsError('failed-precondition', message);
  }
  if (config.provider === 'stripe' && !secrets.stripe_secret_key) {
    throw new HttpsError('failed-precondition', message);
  }
  if (config.provider === 'square' && (!secrets.square_access_token || !config.square.location_id)) {
    throw new HttpsError('failed-precondition', message);
  }
  return { config, secrets };
}
