import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { loadOrgEmailContext, sendOrgEmail, orgEmailLanguage, type AutomationConfig } from '../lib/orgEmail';
import { resolveProvider, sendSms, ensureOptOutSuffix } from '../lib/smsProviders';
import { consumeRateLimit } from '../rateLimit';
import { portalUrlForOrg } from '../lib/portalUrl';
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  defineStrings,
  localeFor,
  makeT,
  orgLanguageFromData,
} from '../lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const DEFAULT_THRESHOLD = 2;
const EMAIL_DAILY_LIMIT = 300;
const SMS_DAILY_LIMIT = 300;

// Client-facing copy in the org's language. `package_fallback` fills the
// {{package_name}} template slot; `package_inline_fallback` reads naturally
// inside the sentence ("in your current plan" / "בחבילה הנוכחית").
const STRINGS = defineStrings({
  en: {
    greeting_fallback: 'there',
    package_fallback: 'your package',
    package_inline_fallback: 'current',
    subject_one: 'Only 1 treatment left — time to renew',
    subject_other: 'Only {{n}} treatments left — time to renew',
    message_one: 'You have 1 treatment left in your {{package}} plan. Renew now to keep enjoying your benefits.',
    message_other: 'You have {{n}} treatments left in your {{package}} plan. Renew now to keep enjoying your benefits.',
    sms_one: 'You have 1 treatment left in your {{package}} plan. Renew here: {{url}}',
    sms_other: 'You have {{n}} treatments left in your {{package}} plan. Renew here: {{url}}',
    opt_out: 'Reply STOP to unsubscribe.',
  },
  he: {
    greeting_fallback: 'לקוח/ה יקר/ה',
    package_fallback: 'החבילה שלך',
    package_inline_fallback: 'הנוכחית',
    subject_one: 'נותר לך טיפול אחד בלבד — זה הזמן לחדש',
    subject_other: 'נותרו לך {{n}} טיפולים בלבד — זה הזמן לחדש',
    message_one: 'נותר לך טיפול אחד בחבילה {{package}}. כדאי לחדש עכשיו כדי להמשיך ליהנות מההטבות.',
    message_other: 'נותרו לך {{n}} טיפולים בחבילה {{package}}. כדאי לחדש עכשיו כדי להמשיך ליהנות מההטבות.',
    sms_one: 'נותר לך טיפול אחד בחבילה {{package}}. לחידוש: {{url}}',
    sms_other: 'נותרו לך {{n}} טיפולים בחבילה {{package}}. לחידוש: {{url}}',
    opt_out: 'להסרה השיבו STOP.',
  },
});

function asCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function resolveThreshold(value: unknown): number {
  const n = asCount(value);
  return n !== null && n >= 1 ? Math.floor(n) : DEFAULT_THRESHOLD;
}

async function loadLowSessionsConfig(orgId: string): Promise<AutomationConfig> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('marketingIntegrations')
    .doc('resend')
    .get();
  const automations = (snap.data()?.email_automations ?? {}) as Record<string, AutomationConfig | undefined>;
  return automations.low_sessions ?? {};
}

// The stamp is claimed in a transaction before anything is sent, so a retried
// or concurrent event for the same purchase can never deliver twice.
async function claimNudge(orgId: string, purchaseId: string): Promise<boolean> {
  const ref = db.collection('organizations').doc(orgId).collection('purchases').doc(purchaseId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.low_sessions_notified_at) return false;
    tx.update(ref, { low_sessions_notified_at: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
}

// Carriers only recognise the English STOP keyword, so the Hebrew footer keeps it.
function withOptOutSuffix(body: string, lang: AppLanguage): string {
  if (lang === DEFAULT_LANGUAGE) return ensureOptOutSuffix(body);
  if (/\bSTOP\b/i.test(body)) return body;
  return `${body.replace(/\s+$/, '')} ${makeT(STRINGS, lang)('opt_out')}`;
}

function formatExpiry(value: unknown, lang: AppLanguage, timeZone: string): string {
  let date: Date | null = null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date = new Date(`${value}T12:00:00Z`);
  } else if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    date = (value as { toDate: () => Date }).toDate();
  }
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(localeFor(lang), {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Fires when an active purchase's `sessions_remaining` crosses from above the
 * org's `email_automations.low_sessions.sessions_threshold` (default 2) down to
 * 1..threshold. Sends the org's `package_renewal` email plus a short SMS (when an
 * SMS provider is enabled and the client hasn't opted out), each with a link to
 * renew from the client portal. Reaching 0 is left to the expiry flow.
 */
export const lowSessionsRenewalNudge = onDocumentUpdated(
  {
    document: 'organizations/{orgId}/purchases/{purchaseId}',
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const { orgId, purchaseId } = event.params as { orgId: string; purchaseId: string };
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data();
    if (!after) return;

    try {
      if (after.payment_status !== 'active') return;
      if (after.low_sessions_notified_at) return;

      const remaining = asCount(after.sessions_remaining);
      if (remaining === null || remaining <= 0) return;
      const previous = asCount(before.sessions_remaining);
      if (previous === remaining) return;

      const cfg = await loadLowSessionsConfig(orgId);
      if (cfg.is_active === false) return;
      const threshold = resolveThreshold(cfg.sessions_threshold);
      if (remaining > threshold) return;
      if (previous !== null && previous <= threshold) return;

      const clientId = typeof after.client_id === 'string' ? after.client_id : '';
      if (!clientId) return;

      if (!(await claimNudge(orgId, purchaseId))) return;

      const orgRef = db.collection('organizations').doc(orgId);
      const packageId = typeof after.package_id === 'string' ? after.package_id : '';
      const [orgSnap, clientSnap, pkgSnap, ctx] = await Promise.all([
        orgRef.get(),
        orgRef.collection('clients').doc(clientId).get(),
        packageId ? orgRef.collection('packages').doc(packageId).get() : Promise.resolve(null),
        loadOrgEmailContext(orgId),
      ]);
      if (!orgSnap.exists || !clientSnap.exists) return;
      const orgData = orgSnap.data() ?? {};
      const client = clientSnap.data() ?? {};
      if (client.deleted_at || client.deletedAt) return;

      const lang = ctx ? orgEmailLanguage(ctx) : orgLanguageFromData(orgData);
      const t = makeT(STRINGS, lang);
      const timezone = (orgData.timezone as string) || 'America/New_York';

      const packageName = String(pkgSnap?.data()?.name || after.package_name || '').trim();
      const inlinePackage = packageName || t('package_inline_fallback');
      const ctaUrl = `${portalUrlForOrg(orgData)}?renew=1`;
      const firstName = String(client.name || '').trim().split(' ')[0] || t('greeting_fallback');
      const subject = remaining === 1 ? t('subject_one') : t('subject_other', { n: remaining });
      const message =
        remaining === 1
          ? t('message_one', { package: inlinePackage })
          : t('message_other', { n: remaining, package: inlinePackage });

      const clientEmail = typeof client.email === 'string' ? client.email.trim() : '';
      if (ctx && clientEmail) {
        try {
          await consumeRateLimit(orgId, 'lowSessionsEmail', EMAIL_DAILY_LIMIT, timezone, lang);
          await sendOrgEmail({
            ctx,
            lang,
            to: clientEmail,
            subject,
            templateType: 'package_renewal',
            variables: {
              client_name: firstName,
              package_name: packageName || t('package_fallback'),
              sessions_remaining: String(remaining),
              expiry_date: formatExpiry(after.expiry_date, lang, timezone),
              renewal_discount: '',
              cta_url: ctaUrl,
              message,
            },
            clientId,
            automationKey: 'low_sessions',
            refType: 'purchase',
            refId: purchaseId,
          });
        } catch (err) {
          console.error(`lowSessionsRenewalNudge: email failed for org ${orgId} purchase ${purchaseId}:`, err);
        }
      }

      const phone = typeof client.phone === 'string' ? client.phone.trim() : '';
      if (phone && client.sms_opt_out !== true) {
        const provider = await resolveProvider(orgId).catch(() => null);
        if (provider) {
          try {
            const orgName = String(orgData.name || ctx?.fromName || '').trim();
            const text =
              remaining === 1
                ? t('sms_one', { package: inlinePackage, url: ctaUrl })
                : t('sms_other', { n: remaining, package: inlinePackage, url: ctaUrl });
            const body = withOptOutSuffix(orgName ? `${orgName}: ${text}` : text, lang);

            await consumeRateLimit(orgId, 'lowSessionsSms', SMS_DAILY_LIMIT, timezone, lang);
            await sendSms(orgId, phone, body, provider);

            await orgRef.collection('clientCommunications').add({
              clientId,
              type: 'sms',
              direction: 'outbound',
              status: 'delivered',
              message: body,
              to: phone,
              sentBy: 'system:lowSessionsRenewalNudge',
              automationKey: 'low_sessions_sms',
              refType: 'purchase',
              refId: purchaseId,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (err) {
            console.error(`lowSessionsRenewalNudge: SMS failed for org ${orgId} purchase ${purchaseId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`lowSessionsRenewalNudge failed for org ${orgId} purchase ${purchaseId}:`, err);
    }
  },
);
