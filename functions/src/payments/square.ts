import axios, { AxiosError } from 'axios';
import * as crypto from 'crypto';
import type { SquareEnvironment } from './settings';

const SQUARE_VERSION = '2025-01-23';
const REQUEST_TIMEOUT_MS = 15_000;

export function squareBaseUrl(environment: SquareEnvironment): string {
  return environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

function squareHeaders(accessToken: string) {
  return {
    'Square-Version': SQUARE_VERSION,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

interface SquareApiError {
  category?: string;
  code?: string;
  detail?: string;
  field?: string;
}

export function squareErrorMessage(err: unknown): string {
  const ax = err as AxiosError<{ errors?: SquareApiError[] }>;
  const errors = ax?.response?.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors
      .map((e) => [e.code, e.detail].filter(Boolean).join(': '))
      .filter(Boolean)
      .join('; ');
  }
  if (ax?.response?.status) return `Square API error (HTTP ${ax.response.status})`;
  return err instanceof Error ? err.message : 'Square request failed';
}

export interface SquareLocation {
  id: string;
  name: string;
  status: string;
  currency: string | null;
  country: string | null;
}

export async function listSquareLocations(
  accessToken: string,
  environment: SquareEnvironment,
): Promise<SquareLocation[]> {
  const res = await axios.get<{ locations?: Array<Record<string, unknown>> }>(
    `${squareBaseUrl(environment)}/v2/locations`,
    { headers: squareHeaders(accessToken), timeout: REQUEST_TIMEOUT_MS },
  );
  const locations = Array.isArray(res.data?.locations) ? res.data.locations : [];
  return locations.map((l) => ({
    id: String(l.id ?? ''),
    name: String(l.name ?? ''),
    status: String(l.status ?? ''),
    currency: typeof l.currency === 'string' ? l.currency : null,
    country: typeof l.country === 'string' ? l.country : null,
  }));
}

export interface CreateSquarePaymentLinkInput {
  accessToken: string;
  environment: SquareEnvironment;
  locationId: string;
  amountMinor: number;
  currency: string;
  productName: string;
  redirectUrl: string;
  buyerEmail?: string | null;
  referenceId: string;
  idempotencyKey: string;
}

export interface SquarePaymentLink {
  id: string;
  url: string;
  order_id: string;
}

export async function createSquarePaymentLink(input: CreateSquarePaymentLinkInput): Promise<SquarePaymentLink> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer');
  }
  const body = {
    idempotency_key: input.idempotencyKey,
    order: {
      location_id: input.locationId,
      reference_id: input.referenceId,
      line_items: [
        {
          name: input.productName.slice(0, 512),
          quantity: '1',
          base_price_money: { amount: input.amountMinor, currency: input.currency.toUpperCase() },
        },
      ],
    },
    checkout_options: { redirect_url: input.redirectUrl },
    ...(input.buyerEmail ? { pre_populated_data: { buyer_email: input.buyerEmail } } : {}),
  };

  const res = await axios.post<{ payment_link?: Record<string, unknown> }>(
    `${squareBaseUrl(input.environment)}/v2/online-checkout/payment-links`,
    body,
    { headers: squareHeaders(input.accessToken), timeout: REQUEST_TIMEOUT_MS },
  );
  const link = res.data?.payment_link;
  const id = typeof link?.id === 'string' ? link.id : '';
  const url = typeof link?.url === 'string' ? link.url : '';
  const orderId = typeof link?.order_id === 'string' ? link.order_id : '';
  if (!id || !url || !orderId) throw new Error('Square did not return a payment link');
  return { id, url, order_id: orderId };
}

export interface VerifySquareSignatureInput {
  signatureKey: string;
  notificationUrl: string;
  rawBody: string;
  signatureHeader: string | undefined;
}

// Square signs base64(HMAC-SHA256(signature_key, notification_url + raw_body)); the
// notification_url must be byte-identical to the URL configured in the Square dashboard.
export function verifySquareSignature(input: VerifySquareSignatureInput): boolean {
  if (!input.signatureHeader || !input.signatureKey) return false;
  try {
    const computed = crypto
      .createHmac('sha256', input.signatureKey)
      .update(input.notificationUrl + input.rawBody)
      .digest('base64');
    const a = Buffer.from(computed);
    const b = Buffer.from(input.signatureHeader.trim());
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
