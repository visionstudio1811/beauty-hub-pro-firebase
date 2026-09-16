// Usage (from functions/): node uploadHebrewMasters.cjs <hebrewMasters.json> [--apply]
// Without --apply it only prints what it would create. Uses create(), so an
// existing doc with the same id is never overwritten.
const admin = require('firebase-admin');
const fs = require('fs');
admin.initializeApp({ projectId: 'beauty-hub-pro-app' });
const db = admin.firestore();
const apply = process.argv.includes('--apply');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  for (const [col, docs] of Object.entries(data)) {
    for (const doc of docs) {
      const { id, ...rest } = doc;
      if (!id || !id.endsWith('_he') || rest.language !== 'he') throw new Error(`refusing ${col}/${id}: must end with _he and have language 'he'`);
      delete rest.created_at; delete rest.updated_at; delete rest.organization_id;
      const payload = { ...rest, created_at: admin.firestore.FieldValue.serverTimestamp(), updated_at: admin.firestore.FieldValue.serverTimestamp() };
      const ref = db.collection(col).doc(id);
      const exists = (await ref.get()).exists;
      console.log(`${apply ? 'CREATE' : 'would create'} ${col}/${id} (${rest.kind ?? rest.trigger}) blocks=${Array.isArray(rest.content) ? rest.content.length : '-'} exists=${exists}`);
      if (apply && !exists) await ref.create(payload);
    }
  }
  console.log(apply ? 'done' : 'dry run only');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
