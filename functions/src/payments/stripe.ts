import Stripe from 'stripe';

export function stripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
}

export interface CreateStripeCheckoutInput {
  secretKey: string;
  amountMinor: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  metadata: Record<string, string>;
  clientReferenceId: string;
  idempotencyKey?: string;
}

export async function createStripeCheckout(input: CreateStripeCheckoutInput): Promise<{ id: string; url: string }> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer');
  }
  const stripe = stripeClient(input.secretKey);
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountMinor,
            product_data: { name: input.productName.slice(0, 250) },
          },
          quantity: 1,
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.clientReferenceId,
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      metadata: input.metadata,
    },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return { id: session.id, url: session.url };
}

export function verifyStripeEvent(rawBody: Buffer, signatureHeader: string, webhookSecret: string): Stripe.Event {
  return Stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
}

export interface StripeConnectionDetails {
  livemode: boolean;
  available: Array<{ amount: number; currency: string }>;
}

export async function testStripeConnection(secretKey: string): Promise<StripeConnectionDetails> {
  const balance = await stripeClient(secretKey).balance.retrieve();
  return {
    livemode: balance.livemode,
    available: (balance.available ?? []).map((b) => ({ amount: b.amount, currency: b.currency.toUpperCase() })),
  };
}

export function stripeErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Stripe request failed';
}
