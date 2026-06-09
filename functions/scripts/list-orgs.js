#!/usr/bin/env node
// One-shot: list all organizations and flag anything that looks demo-ish.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'beauty-hub-pro-app' });
const db = admin.firestore();

(async () => {
  const snap = await db.collection('organizations').get();
  console.log(`Total orgs: ${snap.size}\n`);
  const rows = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    rows.push({
      id: d.id,
      name: x.name || '(unnamed)',
      crm_domain: x.crm_domain || '',
      is_active: x.isActive ?? x.is_active,
      created_at: x.createdAt?.toDate?.()?.toISOString?.() || x.created_at || '',
      created_by: x.created_by || '',
    });
  });
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  for (const r of rows) {
    const demoFlag = /demo|test|sample|sandbox|example/i.test(r.name) ? '  <-- looks demo' : '';
    console.log(`- ${r.name} (${r.id})${demoFlag}`);
    if (r.crm_domain) console.log(`    crm_domain: ${r.crm_domain}`);
    if (r.created_by) console.log(`    created_by: ${r.created_by}`);
    console.log('');
  }
})().catch((e) => { console.error(e); process.exit(1); });
