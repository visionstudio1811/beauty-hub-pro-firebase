import * as crypto from 'crypto';

export type ApptAction = 'confirm' | 'cancel';

/**
 * Stateless, action-bound appointment link token. Mirrors the unsubscribe-token
 * design: keyed by the org's Resend API key so no separate secret is needed, and
 * binds the action so a "confirm" token cannot be replayed as a "cancel".
 *
 * If an org rotates its Resend key, outstanding links stop verifying — the same
 * accepted trade-off as the unsubscribe links.
 */
export function computeApptToken(
  secret: string,
  orgId: string,
  apptId: string,
  action: ApptAction,
): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orgId}:${apptId}:${action}`)
    .digest('base64url')
    .slice(0, 32);
}

export function verifyApptToken(
  secret: string,
  orgId: string,
  apptId: string,
  action: ApptAction,
  token: string,
): boolean {
  const expected = computeApptToken(secret, orgId, apptId, action);
  if (expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
