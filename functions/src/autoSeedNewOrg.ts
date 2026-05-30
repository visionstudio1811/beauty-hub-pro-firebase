import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { seedOrgDefaultsInternal } from './seedOrgDefaultTemplates';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Fires when a new org is created. Runs seedOrgDefaultsInternal so every new
 * white-label client lands with waiver/intake/agreement templates,
 * marketing automations (incl. the booking-related ones), and branded email
 * templates already wired up — no manual seed call required.
 *
 * Defensive:
 *   - Skips silently when the org has been seeded before (seeded_at present).
 *   - Catches errors and stamps seeded_error onto the org doc instead of
 *     crashing — the create flow itself never fails because of seeding.
 */
export const autoSeedNewOrg = onDocumentCreated(
  { document: 'organizations/{orgId}' },
  async (event) => {
    const orgId = event.params.orgId;
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() ?? {};

    if (data.seeded_at) {
      // Re-fire (rare — usually after a delete + recreate). Idempotent function
      // already skips existing entries; we just skip here for clarity.
      console.log('autoSeedNewOrg: already seeded, skipping', { orgId });
      return;
    }

    // Brand-new orgs may briefly have an empty `name` field if the creator
    // wrote name on a later update. Bail with a clear log so the admin can
    // re-trigger from the UI once name is populated.
    if (!data.name) {
      console.warn('autoSeedNewOrg: org has no name yet, skipping', { orgId });
      return;
    }

    try {
      const result = await seedOrgDefaultsInternal(orgId);
      await snap.ref.update({
        seeded_at: admin.firestore.FieldValue.serverTimestamp(),
        seeded_summary: {
          waiver_templates_created: result.templates.created.length,
          automations_created: result.automations.created.length,
          email_templates_created: result.emailTemplates.created.length,
        },
      });
      console.log('autoSeedNewOrg: success', {
        orgId,
        orgName: result.orgName,
        templates: result.templates.created.length,
        automations: result.automations.created.length,
        emailTemplates: result.emailTemplates.created.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('autoSeedNewOrg: failed', { orgId, error: msg });
      // Stamp the error so admins can see why seeding didn't run and decide
      // whether to retry manually. Don't throw — the org create itself must
      // succeed regardless.
      try {
        await db.collection('organizations').doc(orgId).update({
          seeded_error: msg.slice(0, 500),
          seeded_error_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch {
        // Doc may have been deleted between the failure and our update — ignore.
      }
    }
  },
);
