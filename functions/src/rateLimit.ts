import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { defineStrings, getOrgLanguage, makeT, type AppLanguage } from './lib/i18n';

const STRINGS = defineStrings({
  en: { limitReached: 'Daily {{action}} limit reached for this organization. Try again tomorrow.' },
  he: { limitReached: 'הארגון הגיע למכסה היומית של {{action}}. נסו שוב מחר.' },
});

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Compute the YYYYMMDD day key in the given IANA timezone. We use en-CA
 * because it formats as YYYY-MM-DD natively — easy to strip dashes from.
 * Falls back to UTC if the timezone is unknown to the runtime.
 */
function localDayKey(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}${m}${d}`;
  } catch {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
}

// In-memory tz cache so we don't re-read the org doc on every rate-limit hit
// inside a warm container. Cold starts re-fetch; cache invalidates implicitly
// when the instance dies. Acceptable staleness — orgs rarely change tz.
const orgTimezoneCache = new Map<string, string>();

async function getOrgTimezone(organizationId: string): Promise<string> {
  const cached = orgTimezoneCache.get(organizationId);
  if (cached) return cached;
  try {
    const snap = await db.collection('organizations').doc(organizationId).get();
    const tz = (snap.data()?.timezone as string | undefined) || 'UTC';
    orgTimezoneCache.set(organizationId, tz);
    return tz;
  } catch {
    return 'UTC';
  }
}

/**
 * Per-organization daily rate limiter. Consumes one unit of the named action.
 * Throws HttpsError('resource-exhausted') when the day's limit is exceeded.
 * Counter docs live under organizations/{orgId}/rateLimits/{action}_{YYYYMMDD}
 * and are only accessible via the Admin SDK (rules deny all client access).
 *
 * Day boundaries follow the organization's local timezone (loaded once per
 * warm instance) so a 5pm send doesn't operate against tomorrow's UTC budget.
 * Callers that already know the tz may pass it via `timezone` to skip the
 * org-doc lookup.
 */
export async function consumeRateLimit(
  organizationId: string,
  action: string,
  limit: number,
  timezone?: string,
  lang?: AppLanguage,
): Promise<void> {
  const tz = timezone || (await getOrgTimezone(organizationId));
  const resolvedLang = lang ?? (await getOrgLanguage(organizationId, db));
  const t = makeT(STRINGS, resolvedLang);
  const docId = `${action}_${localDayKey(tz)}`;
  const ref = db
    .collection('organizations')
    .doc(organizationId)
    .collection('rateLimits')
    .doc(docId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data()?.count as number) ?? 0) : 0;
    if (current >= limit) {
      throw new HttpsError('resource-exhausted', t('limitReached', { action }));
    }
    if (snap.exists) {
      tx.update(ref, {
        count: current + 1,
        lastAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(ref, {
        action,
        count: 1,
        limit,
        firstAt: FieldValue.serverTimestamp(),
        lastAt: FieldValue.serverTimestamp(),
      });
    }
  });
}
