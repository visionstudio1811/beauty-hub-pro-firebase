import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { loadOrgEmailContext, getAutomation, sendOrgEmail, alreadySent, orgEmailLanguage } from './lib/orgEmail';
import { defineStrings, makeT, localeFor, AppLanguage } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const STRINGS = defineStrings({
  en: {
    org_fallback: 'us',
    subject: 'Welcome to {{org}}!',
  },
  he: {
    org_fallback: 'העסק שלנו',
    subject: 'ברוכים הבאים ל{{org}}!',
  },
});

/** Returns a Date for a Firestore Timestamp / Date / ISO string / millis. Null on bad input. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDate(value: unknown, timeZone: string, lang: AppLanguage): string {
  const d = toDate(value);
  if (!d) return '';
  return d.toLocaleDateString(localeFor(lang), { timeZone });
}

/**
 * Fires when a new purchase is created and sends a welcome/thank-you email
 * to the client if the org has the welcome automation enabled.
 */
export const welcomeEmailOnPurchase = onDocumentCreated(
  {
    document: 'organizations/{orgId}/purchases/{purchaseId}',
    secrets: ['RESEND_API_KEY'],
    region: 'us-central1',
    memory: '256MiB',
  },
  async (event) => {
    const purchase = event.data?.data();
    if (!purchase) return;

    const { orgId, purchaseId } = event.params as { orgId: string; purchaseId: string };

    try {
      const ctx = await loadOrgEmailContext(orgId);
      if (!ctx) return;

      const automation = getAutomation(ctx, 'welcome');
      if (!automation.is_active) return;

      const clientId = (purchase.client_id as string) ?? '';
      if (!clientId) return;

      const clientSnap = await db
        .collection('organizations').doc(orgId)
        .collection('clients').doc(clientId)
        .get();
      if (!clientSnap.exists) return;
      const client = clientSnap.data() ?? {};

      if (automation.vip_only === true && client.has_membership !== true) return;

      if (await alreadySent(orgId, 'welcome', 'purchase', purchaseId)) return;

      const clientEmail = (client.email as string) ?? '';
      if (!clientEmail) return;

      const clientName = (client.name as string) ?? '';

      let packageName = '';
      const packageId = (purchase.package_id as string) ?? '';
      if (packageId) {
        const pkgSnap = await db
          .collection('organizations').doc(orgId)
          .collection('packages').doc(packageId)
          .get();
        if (pkgSnap.exists) {
          packageName = (pkgSnap.data()?.name as string) ?? '';
        }
      }

      const lang = orgEmailLanguage(ctx);
      const t = makeT(STRINGS, lang);
      const timeZone = (ctx.orgData.timezone as string) || 'America/New_York';
      const orgName = (ctx.orgData.name as string) || ctx.fromName || t('org_fallback');

      const purchaseDateRaw = purchase.created_at ?? purchase.purchase_date;
      const purchaseDate = formatDate(purchaseDateRaw, timeZone, lang) || new Date().toLocaleDateString(localeFor(lang), { timeZone });
      const expiryDate = formatDate(purchase.expiry_date, timeZone, lang);

      const subject = t('subject', { org: orgName });

      await sendOrgEmail({
        ctx,
        to: clientEmail,
        subject,
        templateType: 'welcome',
        variables: {
          client_name: clientName,
          package_name: packageName,
          purchase_date: purchaseDate,
          expiry_date: expiryDate,
          sessions_remaining: String(purchase.sessions_remaining ?? ''),
        },
        clientId,
        automationKey: 'welcome',
        refType: 'purchase',
        refId: purchaseId,
        lang,
      });
    } catch (err) {
      // Don't rethrow — bad data shouldn't trigger infinite retries.
      console.error(`welcomeEmailOnPurchase failed for org ${orgId} purchase ${purchaseId}:`, err);
    }
  }
);
