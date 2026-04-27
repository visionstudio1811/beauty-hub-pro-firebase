import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function todayKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Per-organization daily rate limiter. Consumes one unit of the named action.
 * Throws HttpsError('resource-exhausted') when the day's limit is exceeded.
 * Counter docs live under organizations/{orgId}/rateLimits/{action}_{YYYYMMDD}
 * and are only accessible via the Admin SDK (rules deny all client access).
 */
export async function consumeRateLimit(
  organizationId: string,
  action: string,
  limit: number,
): Promise<void> {
  const docId = `${action}_${todayKey()}`;
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('rateLimits')
    .doc(docId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data()?.count as number) ?? 0) : 0;
    if (current >= limit) {
      throw new HttpsError(
        'resource-exhausted',
        `Daily ${action} limit reached for this organization. Try again tomorrow.`,
      );
    }
    if (snap.exists) {
      tx.update(ref, {
        count: current + 1,
        lastAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(ref, {
        action,
        count: 1,
        limit,
        firstAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}
