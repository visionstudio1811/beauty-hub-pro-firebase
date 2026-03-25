import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Runs daily at 09:00 UTC. For every organisation that has Resend configured,
 * finds purchases expiring within 7 days and sends a reminder email to the
 * client. Also flips `has_membership` to false for any purchases that have
 * already expired or run out of sessions.
 */
export const packageExpiryNotifications = onSchedule(
  {
    schedule: 'every day 09:00',
    timeZone: 'UTC',
    secrets: ['RESEND_API_KEY'],
  },
  async () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // 7-day lookahead window
    const warningDate = new Date(today);
    warningDate.setDate(warningDate.getDate() + 7);
    const warningStr = warningDate.toISOString().split('T')[0];

    const orgsSnap = await db.collection('organizations').get();

    for (const orgDoc of orgsSnap.docs) {
      const orgId = orgDoc.id;
      const orgData = orgDoc.data();

      // ── 1. Expire overdue purchases & sync membership ─────────
      await expireOverduePurchases(orgId, todayStr);

      // ── 2. Find purchases expiring within 7 days ──────────────
      const purchasesSnap = await db
        .collection('organizations')
        .doc(orgId)
        .collection('purchases')
        .where('payment_status', '==', 'active')
        .get();

      const expiringPurchases = purchasesSnap.docs.filter((d) => {
        const data = d.data();
        if (!data.expiry_date) return false;
        // Expiry within window and not already past
        return data.expiry_date >= todayStr && data.expiry_date <= warningStr;
      });

      if (expiringPurchases.length === 0) continue;

      // ── 3. Try to get email config (Resend) ───────────────────
      const emailConfig = await getEmailConfig(orgId);
      if (!emailConfig) continue; // No email integration — skip org

      const resend = new Resend(emailConfig.apiKey);
      const fromName = emailConfig.fromName || orgData.name || 'Beauty Hub Pro';
      const fromEmail = emailConfig.fromEmail || 'info@beautyhubpro.com';

      // ── 4. Send notifications ─────────────────────────────────
      for (const purchaseDoc of expiringPurchases) {
        const purchase = purchaseDoc.data();

        // Skip if we already sent a notification for this purchase
        const alreadyNotified = await db
          .collection('organizations')
          .doc(orgId)
          .collection('clientCommunications')
          .where('purchaseId', '==', purchaseDoc.id)
          .where('type', '==', 'email')
          .where('subject', '==', 'Your package is expiring soon')
          .limit(1)
          .get();
        if (!alreadyNotified.empty) continue;

        // Fetch client
        const clientDoc = await db
          .collection('organizations')
          .doc(orgId)
          .collection('clients')
          .doc(purchase.client_id)
          .get();
        if (!clientDoc.exists) continue;
        const client = clientDoc.data()!;
        if (!client.email) continue;

        // Fetch package name
        let packageName = 'your package';
        if (purchase.package_id) {
          const pkgDoc = await db
            .collection('organizations')
            .doc(orgId)
            .collection('packages')
            .doc(purchase.package_id)
            .get();
          if (pkgDoc.exists) packageName = pkgDoc.data()!.name || packageName;
        }

        const daysLeft = Math.ceil(
          (new Date(purchase.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        const firstName = (client.name || '').split(' ')[0] || 'there';

        const subject = 'Your package is expiring soon';
        const html = buildExpiryEmailHtml({
          firstName,
          packageName,
          daysLeft,
          expiryDate: purchase.expiry_date,
          sessionsRemaining: purchase.sessions_remaining ?? 0,
          orgName: orgData.name || fromName,
        });

        try {
          const res = await resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: [client.email],
            subject,
            html,
          });

          // Log the communication
          await db
            .collection('organizations')
            .doc(orgId)
            .collection('clientCommunications')
            .add({
              clientId: purchase.client_id,
              purchaseId: purchaseDoc.id,
              type: 'email',
              status: res.error ? 'failed' : 'delivered',
              subject,
              to: client.email,
              messageId: res.data?.id ?? null,
              sentBy: 'system',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

          // Record in membership history
          await db
            .collection('organizations')
            .doc(orgId)
            .collection('clients')
            .doc(purchase.client_id)
            .collection('membershipHistory')
            .add({
              type: 'expiry_reminder',
              purchaseId: purchaseDoc.id,
              packageName,
              daysLeft,
              expiryDate: purchase.expiry_date,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (emailErr) {
          console.error(`Failed to send expiry email for purchase ${purchaseDoc.id}:`, emailErr);
        }
      }
    }
  },
);

// ── Helpers ──────────────────────────────────────────────────────

async function expireOverduePurchases(orgId: string, todayStr: string) {
  const activePurchasesSnap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('purchases')
    .where('payment_status', '==', 'active')
    .get();

  // Track which clients need a membership re-evaluation
  const affectedClientIds = new Set<string>();

  for (const purchaseDoc of activePurchasesSnap.docs) {
    const data = purchaseDoc.data();
    const expired =
      (data.expiry_date && data.expiry_date < todayStr) ||
      (data.sessions_remaining ?? 0) <= 0;

    if (expired) {
      await purchaseDoc.ref.update({
        payment_status: 'expired',
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Record in membership history
      await db
        .collection('organizations')
        .doc(orgId)
        .collection('clients')
        .doc(data.client_id)
        .collection('membershipHistory')
        .add({
          type: 'package_expired',
          purchaseId: purchaseDoc.id,
          reason:
            (data.sessions_remaining ?? 0) <= 0
              ? 'all_sessions_used'
              : 'expiry_date_passed',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      affectedClientIds.add(data.client_id);
    }
  }

  // Sync membership for affected clients
  for (const clientId of affectedClientIds) {
    const stillActive = await db
      .collection('organizations')
      .doc(orgId)
      .collection('purchases')
      .where('client_id', '==', clientId)
      .where('payment_status', '==', 'active')
      .limit(1)
      .get();

    await db
      .collection('organizations')
      .doc(orgId)
      .collection('clients')
      .doc(clientId)
      .update({
        has_membership: !stillActive.empty,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
  }
}

interface EmailConfig {
  apiKey: string;
  fromName?: string;
  fromEmail?: string;
}

async function getEmailConfig(orgId: string): Promise<EmailConfig | null> {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('marketingIntegrations')
    .where('provider', '==', 'resend')
    .where('is_enabled', '==', true)
    .limit(1)
    .get();
  if (snap.empty) return null;

  const cfg = snap.docs[0].data().configuration as EmailConfig;
  if (!cfg?.apiKey) return null;
  return cfg;
}

function buildExpiryEmailHtml(vars: {
  firstName: string;
  packageName: string;
  daysLeft: number;
  expiryDate: string;
  sessionsRemaining: number;
  orgName: string;
}): string {
  const formattedDate = new Date(vars.expiryDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
    <div style="background:#7c3aed;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">${escapeHtml(vars.orgName)}</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#27272a;">
        Hi ${escapeHtml(vars.firstName)},
      </p>
      <p style="margin:0 0 20px;font-size:15px;color:#27272a;">
        Just a heads-up — your <strong>${escapeHtml(vars.packageName)}</strong> package
        expires in <strong>${vars.daysLeft} day${vars.daysLeft === 1 ? '' : 's'}</strong>
        (${escapeHtml(formattedDate)}).
      </p>
      <div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:.5px;">Sessions remaining</p>
        <p style="margin:0;font-size:28px;font-weight:700;color:#7c3aed;">${vars.sessionsRemaining}</p>
      </div>
      <p style="margin:0 0 8px;font-size:15px;color:#27272a;">
        Book your remaining sessions before they expire — we'd love to see you!
      </p>
      <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;">
        ${escapeHtml(vars.orgName)}
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
