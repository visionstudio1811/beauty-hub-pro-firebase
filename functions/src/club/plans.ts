import * as admin from 'firebase-admin';
import type Stripe from 'stripe';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export type StripeMode = 'test' | 'live';

export interface PlanStripeRefs {
  productId: string;
  priceId: string;
}

export function modeFromKey(secretKey: string): StripeMode {
  return /^(sk|rk)_live_/.test(secretKey) ? 'live' : 'test';
}

export function planUnitAmount(plan: admin.firestore.DocumentData): number | null {
  const price = Number(plan.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const unit = Math.round(price * 100);
  return unit > 0 ? unit : null;
}

export function planCurrency(plan: admin.firestore.DocumentData): string | null {
  const raw = typeof plan.currency === 'string' ? plan.currency.trim().toLowerCase() : '';
  return /^[a-z]{3}$/.test(raw) ? raw : null;
}

function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id;
  return null;
}

function storedRefs(
  plan: admin.firestore.DocumentData,
  mode: StripeMode,
): { product_id: string | null; price_id: string | null } {
  const stripe = plan.stripe && typeof plan.stripe === 'object' ? (plan.stripe as Record<string, unknown>) : {};
  const entry = stripe[mode] && typeof stripe[mode] === 'object' ? (stripe[mode] as Record<string, unknown>) : {};
  return {
    product_id: typeof entry.product_id === 'string' && entry.product_id ? entry.product_id : null,
    price_id: typeof entry.price_id === 'string' && entry.price_id ? entry.price_id : null,
  };
}

async function matchingPrice(
  stripe: Stripe,
  priceId: string,
  unitAmount: number,
  currency: string,
): Promise<Stripe.Price | null> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    const monthly = price.recurring?.interval === 'month' && (price.recurring.interval_count ?? 1) === 1;
    const matches =
      price.active && price.unit_amount === unitAmount && price.currency.toLowerCase() === currency && monthly;
    return matches ? price : null;
  } catch {
    return null;
  }
}

async function reusableProductId(stripe: Stripe, productId: string, name: string): Promise<string | null> {
  let product: Stripe.Product;
  try {
    product = await stripe.products.retrieve(productId);
  } catch {
    return null;
  }
  if (!product.active) return null;
  if (product.name !== name) {
    try {
      await stripe.products.update(product.id, { name });
    } catch (err) {
      console.warn(`club plan product rename failed for ${product.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
  return product.id;
}

export async function ensureStripePriceForPlan(
  stripe: Stripe,
  mode: StripeMode,
  orgId: string,
  planId: string,
  plan: admin.firestore.DocumentData,
): Promise<PlanStripeRefs> {
  const unitAmount = planUnitAmount(plan);
  const currency = planCurrency(plan);
  if (unitAmount === null || currency === null) {
    throw new Error(`Membership plan ${planId} has no valid price or currency`);
  }

  const stored = storedRefs(plan, mode);
  if (stored.price_id) {
    const price = await matchingPrice(stripe, stored.price_id, unitAmount, currency);
    if (price) return { productId: idOf(price.product) ?? stored.product_id ?? '', priceId: price.id };
  }

  const name =
    typeof plan.name === 'string' && plan.name.trim() ? plan.name.trim().slice(0, 250) : `Club membership ${planId}`;
  const metadata = { organizationId: orgId, planId, kind: 'club_membership' };

  let productId = stored.product_id ? await reusableProductId(stripe, stored.product_id, name) : null;
  if (!productId) {
    const description =
      typeof plan.description === 'string' && plan.description.trim() ? plan.description.trim().slice(0, 500) : '';
    const product = await stripe.products.create({ name, metadata, ...(description ? { description } : {}) });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency,
    recurring: { interval: 'month' },
    metadata,
  });

  await db
    .collection('organizations')
    .doc(orgId)
    .collection('membershipPlans')
    .doc(planId)
    .set({ stripe: { [mode]: { product_id: productId, price_id: price.id } } }, { merge: true });

  return { productId, priceId: price.id };
}
