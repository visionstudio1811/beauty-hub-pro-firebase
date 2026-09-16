// Usage (from functions/, after `npm run build`):
//   node src/scripts/switchOrgLanguage.cjs <orgId> <en|he> [--apply] [--force]
// Sets organizations/{orgId}.language and re-seeds default forms/automations/email
// templates in that language. Without --apply it is a dry run. Pristine (never
// edited) defaults are replaced; customized ones are skipped unless --force.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'beauty-hub-pro-app' });
const [orgId, lang] = process.argv.slice(2);
const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');
if (!orgId || !['en', 'he'].includes(lang)) { console.error('usage: switchOrgLanguage.cjs <orgId> <en|he> [--apply] [--force]'); process.exit(1); }
(async () => {
  const { seedOrgDefaultsInternal } = require('../../lib/seedOrgDefaultTemplates.js');
  const db = admin.firestore();
  const org = await db.collection('organizations').doc(orgId).get();
  if (!org.exists) throw new Error('org not found');
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${org.data().name} → language=${lang} (current: ${org.data().language ?? '-'})`);
  if (!apply) return;
  await org.ref.update({ language: lang, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  const result = await seedOrgDefaultsInternal(orgId, { lang, replacePristine: true, overwriteExisting: force });
  console.log(JSON.stringify(result, null, 1).slice(0, 4000));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
