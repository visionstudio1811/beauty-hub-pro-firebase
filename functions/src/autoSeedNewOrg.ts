import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { seedOrgDefaultsInternal } from './seedOrgDefaultTemplates';
import { orgLanguageFromData } from './lib/i18n';

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
 *
 * Language: the app's org-creation flow (OrganizationSetup → addDoc) does not
 * write `language`; admins set it later from Settings → Business Info. So this
 * trigger almost always seeds in English, and `reseedOrgOnLanguageChange`
 * below is what swaps the untouched defaults for the org-language variants
 * once `language` is set. Orgs created by scripts with `language` already on
 * the doc are seeded in that language right away.
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
      // Seed in the org's language (organizations/{orgId}.language, default
      // 'en'). We already hold the created doc, so pass it through instead of
      // re-reading.
      const lang = orgLanguageFromData(data);
      const result = await seedOrgDefaultsInternal(orgId, { lang });
      await snap.ref.update({
        seeded_at: admin.firestore.FieldValue.serverTimestamp(),
        seeded_lang: lang,
        seeded_summary: {
          waiver_templates_created: result.templates.created.length,
          automations_created: result.automations.created.length,
          email_templates_created: result.emailTemplates.created.length,
        },
      });
      console.log('autoSeedNewOrg: success', {
        orgId,
        orgName: result.orgName,
        lang,
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

/**
 * Fires when `organizations/{orgId}.language` changes (Settings → Business
 * Info). Re-runs the seeder in the new language with `replacePristine`, so:
 *   - anything missing is created in the new language;
 *   - email templates, waiver/intake/agreement templates and automations
 *     that are still the untouched system default for the previous language
 *     are swapped in place for the new-language master (same doc id);
 *   - anything an admin has edited is left alone (skipped as 'customized').
 * Existing docs are never force-overwritten here (that stays behind the
 * explicit `overwriteExisting` flag of the seedOrgDefaultTemplates callable).
 *
 * Every other org-doc update returns immediately, including the stamps this
 * file writes (seeded_at, language_seeded_at, …), so it never loops.
 *
 * The "Load default forms & automations" button in Settings → Business Info
 * (src/components/BusinessInfoEditor.tsx) calls the `seedOrgDefaultTemplates`
 * callable with the same `{ lang, replacePristine: true }` arguments. It is the
 * manual fallback for when this trigger did not run (org created before the
 * trigger was deployed, seeding failed — see `seeded_error`) and both paths
 * are idempotent; the UI holds the button back for a short cooldown right
 * after a language change so it does not race this trigger.
 *
 * NOTE: must be exported from functions/src/index.ts to deploy:
 *   export { autoSeedNewOrg, reseedOrgOnLanguageChange } from './autoSeedNewOrg';
 */
export const reseedOrgOnLanguageChange = onDocumentUpdated(
  { document: 'organizations/{orgId}' },
  async (event) => {
    const orgId = event.params.orgId;
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};

    const prevLang = orgLanguageFromData(before);
    const nextLang = orgLanguageFromData(after);
    if (prevLang === nextLang) return;

    if (!after.name) {
      console.warn('reseedOrgOnLanguageChange: org has no name, skipping', { orgId, nextLang });
      return;
    }

    try {
      const result = await seedOrgDefaultsInternal(orgId, { lang: nextLang, replacePristine: true });
      await event.data!.after.ref.update({
        language_seeded_at: admin.firestore.FieldValue.serverTimestamp(),
        language_seeded: nextLang,
      });
      console.log('reseedOrgOnLanguageChange: success', {
        orgId,
        from: prevLang,
        to: nextLang,
        templatesCreated: result.templates.created.length,
        templatesReplaced: result.templates.replaced.length,
        automationsCreated: result.automations.created.length,
        automationsReplaced: result.automations.replaced.length,
        emailTemplatesCreated: result.emailTemplates.created.length,
        emailTemplatesReplaced: result.emailTemplates.overwritten.length,
        skippedCustomized: result.summary.skippedCustomized,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('reseedOrgOnLanguageChange: failed', { orgId, nextLang, error: msg });
      try {
        await db.collection('organizations').doc(orgId).update({
          seeded_error: msg.slice(0, 500),
          seeded_error_at: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch {
        // ignore — doc may be gone
      }
    }
  },
);
