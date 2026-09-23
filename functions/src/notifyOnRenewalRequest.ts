import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import { loadOrgEmailContext, sendOrgEmail } from './lib/orgEmail';
import { defineStrings, getOrgLanguage, makeT } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const STRINGS = defineStrings({
  en: {
    subject_requested: 'Package renewal request: {{name}}',
    subject_paid: 'Online payment received: {{name}} renewed {{package}}',
    intro_requested: '{{name}} asked to renew their package from the client portal. Please contact them to complete the renewal.',
    intro_paid: '{{name}} paid online to renew their package. The new package was created automatically — issue the invoice from the client card.',
    client: 'Client',
    phone: 'Phone',
    email: 'Email',
    package: 'Package',
    sessions_left: 'Sessions left',
    expires: 'Expires',
    notes: 'Notes',
    amount: 'Amount paid',
    open_crm: 'Open renewal requests',
    admin_fallback: 'Admin',
    client_fallback: 'A client',
  },
  he: {
    subject_requested: 'בקשת חידוש חבילה: {{name}}',
    subject_paid: 'התקבל תשלום אונליין: {{name}} חידש/ה את {{package}}',
    intro_requested: '{{name}} ביקש/ה לחדש את החבילה דרך פורטל הלקוחות. נא ליצור קשר להשלמת החידוש.',
    intro_paid: '{{name}} שילם/ה אונליין לחידוש החבילה. החבילה החדשה נוצרה אוטומטית — יש להפיק חשבונית מכרטיס הלקוח.',
    client: 'לקוח/ה',
    phone: 'טלפון',
    email: 'אימייל',
    package: 'חבילה',
    sessions_left: 'טיפולים שנותרו',
    expires: 'תוקף',
    notes: 'הערות',
    amount: 'סכום ששולם',
    open_crm: 'לבקשות החידוש',
    admin_fallback: 'מנהל/ת',
    client_fallback: 'לקוח/ה',
  },
});

function adminUrlForOrg(org: admin.firestore.DocumentData): string {
  const host = typeof org.crm_domain === 'string' && org.crm_domain.trim()
    ? org.crm_domain.trim().toLowerCase()
    : 'app.beautyhubpro.com';
  return `https://${host}/admin/appointments`;
}

function formatAmount(minor: unknown, currency: unknown): string {
  const amount = Number(minor ?? 0) / 100;
  const code = typeof currency === 'string' && currency ? currency : 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

/**
 * Emails every active admin when a client opens a renewal request from the
 * portal, and again when an online renewal payment lands (status -> paid).
 */
export const notifyOnRenewalRequest = onDocumentWritten(
  {
    document: 'organizations/{orgId}/renewalRequests/{requestId}',
    secrets: ['RESEND_API_KEY'],
  },
  async (event) => {
    const orgId = event.params.orgId;
    const requestId = event.params.requestId;
    const after = event.data?.after;
    if (!after?.exists) return;
    const cur = after.data() ?? {};
    const prev = event.data?.before?.exists ? event.data.before.data() ?? {} : null;

    let kind: 'requested' | 'paid' | null = null;
    if (!prev && cur.status === 'pending') kind = 'requested';
    else if (cur.status === 'paid' && (!prev || prev.status !== 'paid')) kind = 'paid';
    if (!kind) return;

    const ctx = await loadOrgEmailContext(orgId);
    if (!ctx) {
      console.warn('notifyOnRenewalRequest: Resend not configured', { orgId, requestId });
      return;
    }

    const lang = await getOrgLanguage(orgId);
    const t = makeT(STRINGS, lang);

    const adminsSnap = await db
      .collection('users')
      .where('organizationId', '==', orgId)
      .where('role', '==', 'admin')
      .where('isActive', '==', true)
      .get();
    const admins = adminsSnap.docs
      .map((d) => ({ email: String(d.data()?.email ?? ''), name: String(d.data()?.fullName ?? '') }))
      .filter((u) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email));
    if (admins.length === 0) return;

    const name = String(cur.client_name || '').trim() || t('client_fallback');
    const pkg = String(cur.package_name || '');
    const subject = kind === 'requested'
      ? t('subject_requested', { name })
      : t('subject_paid', { name, package: pkg });
    const intro = kind === 'requested' ? t('intro_requested', { name }) : t('intro_paid', { name });

    const rows: Array<[string, string]> = [
      [t('client'), name],
      [t('phone'), String(cur.client_phone || '')],
      [t('email'), String(cur.client_email || '')],
      [t('package'), pkg],
      [t('sessions_left'), `${Number(cur.sessions_remaining_at_request ?? 0)} / ${Number(cur.total_sessions_at_request ?? 0)}`],
      [t('expires'), String(cur.expiry_date_at_request || '')],
    ];
    if (kind === 'paid') rows.push([t('amount'), formatAmount(cur.payment?.amount, cur.payment?.currency ?? cur.currency)]);
    if (cur.notes) rows.push([t('notes'), String(cur.notes)]);

    // Plain text: sendOrgEmail escapes `message` and turns newlines into <br>.
    const adminUrl = adminUrlForOrg(ctx.orgData);
    const message = [
      intro,
      '',
      ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
      '',
      `${t('open_crm')}: ${adminUrl}`,
    ].join('\n');

    for (const user of admins) {
      try {
        await consumeRateLimit(orgId, 'renewalRequestAdminAlert', 300);
      } catch (err) {
        console.warn('notifyOnRenewalRequest: rate-limited', { orgId, requestId, error: err instanceof Error ? err.message : String(err) });
        return;
      }
      try {
        await sendOrgEmail({
          ctx,
          to: user.email,
          subject,
          templateType: 'general',
          variables: { client_name: user.name || t('admin_fallback'), message, cta_url: adminUrl },
          refType: 'renewalRequest',
          refId: requestId,
          lang,
        });
      } catch (err) {
        console.error('notifyOnRenewalRequest: send failed', { orgId, requestId, to: user.email, error: err instanceof Error ? err.message : String(err) });
      }
    }
  },
);
