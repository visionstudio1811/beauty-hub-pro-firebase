import * as crypto from 'crypto';

/**
 * Stateless one-click-unsubscribe token. Keyed by the org's Resend API key so
 * no separate secret has to be provisioned and no per-recipient row has to be
 * written. The token proves the link was issued by us for this exact
 * (orgId, clientId) pair, preventing trivial enumeration-based opt-outs.
 *
 * If an org rotates its Resend key, previously issued links stop verifying and
 * the recipient falls back to the mailto/reply opt-out still present in the
 * email footer — an acceptable trade for not managing another secret.
 */
export function computeUnsubToken(secret: string, orgId: string, clientId: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orgId}:${clientId}`)
    .digest('base64url')
    .slice(0, 32);
}

export function verifyUnsubToken(
  secret: string,
  orgId: string,
  clientId: string,
  token: string,
): boolean {
  const expected = computeUnsubToken(secret, orgId, clientId);
  if (expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
