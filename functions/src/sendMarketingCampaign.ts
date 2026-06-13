import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { consumeRateLimit } from './rateLimit';
import { sendSms, resolveProvider, ensureOptOutSuffix, SmsProvider } from './lib/smsProviders';
import { computeUnsubToken } from './lib/unsubscribeToken';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

interface SendMarketingCampaignRequest {
  campaignId: string;
  organizationId: string;
  smsProvider?: SmsProvider;
  dryRun?: boolean;
}

export interface CampaignExecutionResult {
  success: boolean;
  dryRun?: boolean;
  total_recipients: number;
  sent?: number;
  failed?: number;
  sms_provider?: SmsProvider | null;
  sample_recipients?: { id: string; name?: string; email?: string; phone?: string }[];
}

interface Campaign {
  name: string;
  type: 'email' | 'sms' | 'both';
  subject: string | null;
  content: string;
  target_audience: 'all' | 'active' | 'inactive' | 'birthday' | 'expiring';
  status: string;
  sms_provider?: SmsProvider;
}

interface ClientRecord {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  has_membership?: boolean;
  is_active?: boolean;
  date_of_birth?: string;
  birthday?: string;
  deleted_at?: unknown;
  sms_opt_out?: boolean;
  email_opt_out?: boolean;
  last_visit?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function personalize(template: string, client: ClientRecord): string {
  const fullName = (client.name ?? '').trim();
  const firstName = fullName.split(/\s+/)[0] || 'there';
  return template
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{name\}/gi, fullName || firstName)
    .replace(/\[NAME\]/g, fullName || firstName)
    .replace(/\[FIRST_NAME\]/g, firstName);
}

function isBirthdayThisMonth(dob?: string): boolean {
  if (!dob) return false;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return false;
  return d.getUTCMonth() === new Date().getUTCMonth();
}

async function loadActivePurchasesByClient(orgId: string): Promise<Map<string, { hasActive: boolean; soonestExpiry: number | null }>> {
  const snap = await db.collection('organizations').doc(orgId)
    .collection('purchases')
    .where('payment_status', '==', 'active')
    .get();
  const out = new Map<string, { hasActive: boolean; soonestExpiry: number | null }>();
  for (const doc of snap.docs) {
    const p = doc.data();
    const clientId = p.client_id as string | undefined;
    if (!clientId) continue;
    const exp = p.expiry_date ? new Date(p.expiry_date).getTime() : null;
    const cur = out.get(clientId);
    if (!cur) {
      out.set(clientId, { hasActive: true, soonestExpiry: exp });
    } else if (exp !== null && (cur.soonestExpiry === null || exp < cur.soonestExpiry)) {
      out.set(clientId, { hasActive: true, soonestExpiry: exp });
    }
  }
  return out;
}

async function loadLastAppointmentByClient(orgId: string): Promise<Map<string, number>> {
  const snap = await db.collection('organizations').doc(orgId)
    .collection('appointments')
    .where('status', '==', 'completed')
    .get();
  const out = new Map<string, number>();
  for (const doc of snap.docs) {
    const a = doc.data();
    const clientId = a.client_id as string | undefined;
    if (!clientId || !a.appointment_date) continue;
    const ts = new Date(a.appointment_date).getTime();
    if (isNaN(ts)) continue;
    const cur = out.get(clientId);
    if (cur === undefined || ts > cur) out.set(clientId, ts);
  }
  return out;
}

async function resolveAudience(
  orgId: string,
  audience: Campaign['target_audience'],
): Promise<ClientRecord[]> {
  const clientsSnap = await db.collection('organizations').doc(orgId).collection('clients').get();
  const all: ClientRecord[] = clientsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ClientRecord, 'id'>) }))
    .filter((c) => !c.deleted_at);

  if (audience === 'all') return all;
  if (audience === 'birthday') {
    return all.filter((c) => isBirthdayThisMonth(c.date_of_birth ?? c.birthday));
  }

  const purchasesByClient = (audience === 'active' || audience === 'expiring')
    ? await loadActivePurchasesByClient(orgId) : null;

  if (audience === 'active') {
    return all.filter((c) => c.has_membership === true || purchasesByClient?.get(c.id)?.hasActive === true);
  }

  if (audience === 'expiring') {
    const horizon = Date.now() + 30 * 24 * 60 * 60 * 1000;
    return all.filter((c) => {
      const p = purchasesByClient?.get(c.id);
      return p?.hasActive === true && p.soonestExpiry !== null && p.soonestExpiry <= horizon;
    });
  }

  if (audience === 'inactive') {
    const lastByClient = await loadLastAppointmentByClient(orgId);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return all.filter((c) => {
      const last = lastByClient.get(c.id);
      return last === undefined || last < cutoff;
    });
  }

  return all;
}

async function loadResendConfig(orgId: string): Promise<{ apiKey: string; fromName: string; fromEmail: string } | null> {
  const snap = await db.collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc('resend').get();
  if (snap.exists && snap.data()?.is_enabled) {
    const cfg = snap.data()!.configuration as { apiKey?: string; fromName?: string; fromEmail?: string };
    if (cfg.apiKey) {
      return {
        apiKey: cfg.apiKey,
        fromName: cfg.fromName || 'Beauty Hub Pro',
        fromEmail: cfg.fromEmail || 'info@beautyhubpro.com',
      };
    }
  }
  const envKey = process.env.RESEND_API_KEY;
  if (envKey) {
    return { apiKey: envKey, fromName: 'Beauty Hub Pro', fromEmail: 'info@beautyhubpro.com' };
  }
  return null;
}

const CONCURRENCY = 8;

async function withConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function executeCampaign(
  organizationId: string,
  campaignId: string,
  opts: { dryRun?: boolean; smsProviderOverride?: SmsProvider; consumeQuota?: boolean } = {},
): Promise<CampaignExecutionResult> {
  const dryRun = opts.dryRun ?? false;
  const consumeQuota = opts.consumeQuota ?? true;

  if (consumeQuota && !dryRun) {
    await consumeRateLimit(organizationId, 'marketing_campaign_send', 20);
  }

  const campaignRef = db.collection('organizations').doc(organizationId)
    .collection('marketingCampaigns').doc(campaignId);

  // Atomically claim the campaign so concurrent executions (e.g. two cron
  // firings catching the same scheduled window, or an admin clicking "Send"
  // twice) cannot both pass the status check. The first txn flips the status
  // to 'sending'; any other waiting txn re-reads, sees 'sending' or
  // 'completed', and throws — no double-send. Dry runs skip the flip so the
  // preview doesn't lock the campaign out of a real send.
  let campaign: Campaign;
  if (dryRun) {
    const campaignSnap = await campaignRef.get();
    if (!campaignSnap.exists) throw new HttpsError('not-found', 'Campaign not found');
    campaign = campaignSnap.data() as Campaign;
  } else {
    campaign = await db.runTransaction(async (tx) => {
      const snap = await tx.get(campaignRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Campaign not found');
      const c = snap.data() as Campaign;
      if (c.status === 'sending')
        throw new HttpsError('failed-precondition', 'Campaign is already sending');
      if (c.status === 'completed')
        throw new HttpsError('failed-precondition', 'Campaign has already been sent');
      tx.update(campaignRef, {
        status: 'sending',
        started_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: new Date().toISOString(),
      });
      return c;
    });
  }

  const needsSms = campaign.type === 'sms' || campaign.type === 'both';
  const needsEmail = campaign.type === 'email' || campaign.type === 'both';

  let smsProvider: SmsProvider | null = null;
  if (needsSms) {
    smsProvider = opts.smsProviderOverride ?? campaign.sms_provider ?? (await resolveProvider(organizationId));
  }

  let resendCfg: Awaited<ReturnType<typeof loadResendConfig>> = null;
  if (needsEmail) {
    resendCfg = await loadResendConfig(organizationId);
    if (!resendCfg)
      throw new HttpsError('failed-precondition', 'Email provider not configured. Set up Resend in Marketing → Integrations or set RESEND_API_KEY.');
  }

  const recipients = await resolveAudience(organizationId, campaign.target_audience);

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      total_recipients: recipients.length,
      sms_provider: smsProvider,
      sample_recipients: recipients.slice(0, 5).map((c) => ({
        id: c.id, name: c.name, email: c.email, phone: c.phone,
      })),
    };
  }

    if (recipients.length === 0) {
      await campaignRef.update({
        status: 'completed',
        total_recipients: 0,
        sent_count: 0,
        delivered_count: 0,
        failed_count: 0,
        completed_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: new Date().toISOString(),
      });
      return { success: true, total_recipients: 0, sent: 0, failed: 0 };
    }

    // Status + started_at were stamped in the claim transaction above. Just
    // attach the audience size + provider here so the UI shows correct totals.
    await campaignRef.update({
      total_recipients: recipients.length,
      updated_at: new Date().toISOString(),
      ...(needsSms && smsProvider ? { sms_provider: smsProvider } : {}),
    });

    const resend = resendCfg ? new Resend(resendCfg.apiKey) : null;
    const orgSnapData = (await db.collection('organizations').doc(organizationId).get()).data() ?? {};
    const orgName = (orgSnapData.name as string) ?? '';
    // CAN-SPAM requires a valid physical postal address + a working opt-out in
    // every commercial email. Pull both from the org record so the footer below
    // can include them.
    const orgAddress = (orgSnapData.address as string) ?? '';
    const orgUnsubEmail = (orgSnapData.email as string) || resendCfg?.fromEmail || '';

    let sent = 0;
    let failed = 0;

    await withConcurrency(recipients, async (client) => {
      const recipientRef = db.collection('organizations').doc(organizationId)
        .collection('campaignRecipients').doc();

      const baseRecord = {
        campaign_id: campaignId,
        client_id: client.id,
        client_name: client.name ?? '',
        organization_id: organizationId,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      const errors: string[] = [];
      let smsStatus: 'sent' | 'failed' | 'skipped' | null = null;
      let emailStatus: 'sent' | 'failed' | 'skipped' | null = null;

      if (needsSms) {
        if (!client.phone) smsStatus = 'skipped';
        else if (client.sms_opt_out === true) smsStatus = 'skipped';
        else {
          try {
            const body = ensureOptOutSuffix(personalize(campaign.content, client));
            await sendSms(organizationId, client.phone, body, smsProvider!);
            smsStatus = 'sent';
          } catch (e) {
            smsStatus = 'failed';
            errors.push(`SMS: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      if (needsEmail && resend && resendCfg) {
        if (!client.email) emailStatus = 'skipped';
        else if (client.email_opt_out === true) emailStatus = 'skipped';
        else {
          try {
            const personalized = personalize(campaign.content, client);
            // CAN-SPAM compliant footer: sender identity, a working opt-out, and
            // the sender's physical postal address. The opt-out is a real
            // one-click unsubscribe URL (verified, sets email_opt_out) plus a
            // mailto fallback.
            const unsubToken = computeUnsubToken(resendCfg.apiKey, organizationId, client.id);
            const unsubUrl = `https://beautyhubpro.com/u?o=${encodeURIComponent(organizationId)}&c=${encodeURIComponent(client.id)}&t=${encodeURIComponent(unsubToken)}`;
            const unsubMailto = orgUnsubEmail
              ? `mailto:${orgUnsubEmail}?subject=Unsubscribe`
              : '';
            const footerLines = [
              `You're receiving this because you're a client of ${escapeHtml(orgName)}.`,
              `To stop receiving marketing emails, <a href="${unsubUrl}" style="color:#6b7280">unsubscribe here</a>${unsubMailto ? ' or reply with "unsubscribe"' : ''}.`,
              orgAddress ? escapeHtml(orgAddress) : '',
            ].filter(Boolean).join('<br>');
            const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333"><div style="line-height:1.6">${escapeHtml(personalized).replace(/\n/g, '<br>')}</div><br><p style="color:#9ca3af;font-size:12px">${footerLines}</p></body></html>`;
            // RFC 8058: List-Unsubscribe (URL + mailto) and one-click POST so
            // Gmail/Apple Mail surface a native unsubscribe button.
            const listUnsub = unsubMailto ? `<${unsubUrl}>, <${unsubMailto}>` : `<${unsubUrl}>`;
            const resp = await resend.emails.send({
              from: `${resendCfg.fromName} <${resendCfg.fromEmail}>`,
              to: [client.email],
              subject: campaign.subject || campaign.name,
              html,
              headers: {
                'List-Unsubscribe': listUnsub,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            });
            if (resp.error) {
              emailStatus = 'failed';
              const msg = (resp.error as { message?: string })?.message || JSON.stringify(resp.error);
              errors.push(`Email: ${msg}`);
            } else {
              emailStatus = 'sent';
            }
          } catch (e) {
            emailStatus = 'failed';
            errors.push(`Email: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      const everySkipped = (needsSms ? smsStatus === 'skipped' : true) && (needsEmail ? emailStatus === 'skipped' : true);
      const anyFailed = smsStatus === 'failed' || emailStatus === 'failed';
      const anySent = smsStatus === 'sent' || emailStatus === 'sent';

      const overall: 'sent' | 'failed' | 'skipped' = everySkipped ? 'skipped' : (anySent ? 'sent' : (anyFailed ? 'failed' : 'skipped'));

      if (overall === 'sent') sent++;
      else if (overall === 'failed') failed++;

      await recipientRef.set({
        ...baseRecord,
        status: overall,
        sms_status: smsStatus,
        email_status: emailStatus,
        errors: errors.length ? errors : null,
      });
    }, CONCURRENCY);

  await campaignRef.update({
    status: 'completed',
    sent_count: sent,
    delivered_count: sent,
    failed_count: failed,
    completed_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: new Date().toISOString(),
  });

  return { success: true, total_recipients: recipients.length, sent, failed };
}

export const sendMarketingCampaign = onCall(
  { secrets: ['RESEND_API_KEY'], timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

    const uid = request.auth.uid;
    const data = request.data as SendMarketingCampaignRequest;
    const { campaignId, organizationId, dryRun = false } = data;

    if (!campaignId || !organizationId)
      throw new HttpsError('invalid-argument', 'campaignId and organizationId are required');

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
    const userData = userDoc.data()!;
    if (userData.organizationId !== organizationId)
      throw new HttpsError('permission-denied', 'Organization mismatch');
    if (userData.role !== 'admin')
      throw new HttpsError('permission-denied', 'Admin role required');

    return executeCampaign(organizationId, campaignId, {
      dryRun,
      smsProviderOverride: data.smsProvider,
    });
  }
);
