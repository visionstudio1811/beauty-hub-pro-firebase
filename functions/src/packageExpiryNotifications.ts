import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  loadOrgEmailContext,
  getAutomation,
  sendOrgEmail,
  alreadySent,
  todayInTimezone,
  addDaysISO,
  localHour,
} from './lib/orgEmail';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Hourly schedule. For every organisation, when the local hour is 09:
 *   1) Expire overdue purchases & sync `client.has_membership` (untouched).
 *   2) Send a `package_renewal` reminder email using the org's user-designed
 *      template via the shared org-email helper, gated by the org's
 *      `email_automations.package_renewal` config.
 *
 * Backward-compat: if `email_automations.package_renewal` is missing or
 * `is_active` is undefined, the email is sent (orgs like Lumière who
 * already have Resend configured continue to receive reminders).
 */
export const packageExpiryNotifications = onSchedule(
  {
    schedule: 'every 1 hours',
    secrets: ['RESEND_API_KEY'],
  },
  async () => {
    const orgsSnap = await db.collection('organizations').get();

    for (const orgDoc of orgsSnap.docs) {
      const orgId = orgDoc.id;
      const orgData = orgDoc.data();
      const orgTz = orgData.timezone || 'America/New_York';

      // Only process this org at ~09:00 in their local timezone
      if (localHour(orgTz) !== 9) continue;

      const todayStr = todayInTimezone(orgTz);

      // ── 1. Expire overdue purchases & sync membership ─────────
      await expireOverduePurchases(orgId, todayStr);

      // ── 2. Load email context (Resend config + templates + automations)
      const ctx = await loadOrgEmailContext(orgId);
      if (!ctx) continue; // No email integration — skip org

      const cfg = getAutomation(ctx, 'package_renewal');
      // Default ON for back-compat: only skip if explicitly disabled.
      if (cfg.is_active === false) continue;

      const daysBefore = cfg.days_before_expiry ?? 7;
      const warningStr = addDaysISO(todayStr, daysBefore);

      // ── 3. Find purchases expiring within the warning window ──
      const purchasesSnap = await db
        .collection('organizations')
        .doc(orgId)
        .collection('purchases')
        .where('payment_status', '==', 'active')
        .get();

      const expiringPurchases = purchasesSnap.docs.filter((d) => {
        const data = d.data();
        if (!data.expiry_date) return false;
        return data.expiry_date >= todayStr && data.expiry_date <= warningStr;
      });

      if (expiringPurchases.length === 0) continue;

      // ── 4. Send notifications ─────────────────────────────────
      for (const purchaseDoc of expiringPurchases) {
        const purchase = purchaseDoc.data();

        // Idempotency — skip if we've already delivered a renewal email
        // for this purchase.
        if (await alreadySent(orgId, 'package_renewal', 'purchase', purchaseDoc.id)) {
          continue;
        }

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
          (new Date(purchase.expiry_date + 'T12:00:00Z').getTime() -
            new Date(todayStr + 'T12:00:00Z').getTime()) /
            (1000 * 60 * 60 * 24),
        );

        const firstName = (client.name || '').split(' ')[0] || 'there';
        const formattedExpiry = new Date(
          purchase.expiry_date + 'T12:00:00Z',
        ).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        const subject = 'Your package is expiring soon';

        try {
          await sendOrgEmail({
            ctx,
            to: client.email,
            subject,
            templateType: 'package_renewal',
            variables: {
              client_name: firstName,
              package_name: packageName,
              expiry_date: formattedExpiry,
              sessions_remaining: String(purchase.sessions_remaining ?? 0),
              renewal_discount: '',
            },
            clientId: purchase.client_id,
            automationKey: 'package_renewal',
            refType: 'purchase',
            refId: purchaseDoc.id,
          });

          // Audit entry on the client's membership history (separate from
          // clientCommunications, which sendOrgEmail already wrote).
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
          console.error(
            `Failed to send expiry email for purchase ${purchaseDoc.id}:`,
            emailErr,
          );
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
