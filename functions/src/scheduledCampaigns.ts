import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { executeCampaign } from './sendMarketingCampaign';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/**
 * Sweeps every 15 minutes for campaigns where status === 'scheduled' and
 * scheduled_at <= now(), then runs them via the same executeCampaign path
 * the manual "Send Now" callable uses.
 *
 * Uses a collectionGroup query so it does not need per-org orchestration.
 *
 * Slippage tolerance: a campaign scheduled for 09:00 may fire between
 * 09:00 and 09:15. Document this for the admin who picks the time slot.
 */
export const runScheduledCampaigns = onSchedule(
  {
    schedule: 'every 15 minutes',
    secrets: ['RESEND_API_KEY'],
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const nowIso = new Date().toISOString();
    const snap = await db.collectionGroup('marketingCampaigns')
      .where('status', '==', 'scheduled')
      .where('scheduled_at', '<=', nowIso)
      .get();

    if (snap.empty) {
      console.log('[scheduledCampaigns] no due campaigns');
      return;
    }

    console.log(`[scheduledCampaigns] processing ${snap.size} due campaign(s)`);

    for (const doc of snap.docs) {
      const orgRef = doc.ref.parent.parent;
      if (!orgRef) continue;
      const orgId = orgRef.id;
      const campaignId = doc.id;
      const name = (doc.data().name as string | undefined) ?? campaignId;

      try {
        // executeCampaign reads the campaign, checks status, then transitions
        // 'scheduled' → 'sending' → 'completed' itself. Two sweeps racing the
        // same campaign: the second will see status='sending' and bail.
        const result = await executeCampaign(orgId, campaignId, { consumeQuota: true });
        console.log(`[scheduledCampaigns] ${orgId}/${name}: sent ${result.sent}/${result.total_recipients}, failed ${result.failed}`);
      } catch (err) {
        console.error(`[scheduledCampaigns] ${orgId}/${name} failed:`, err);
        await doc.ref.update({
          status: 'failed',
          last_error: err instanceof Error ? err.message : String(err),
          updated_at: new Date().toISOString(),
        }).catch(() => {});
      }
    }
  }
);
