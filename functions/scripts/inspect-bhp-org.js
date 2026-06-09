#!/usr/bin/env node
// One-shot: inspect the "Beauty Hub Pro" org — list users, sample data counts.
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'beauty-hub-pro-app' });
const db = admin.firestore();

const ORG_ID = 'zJ6CTBzTCSOSxEVfu7R6';

(async () => {
  const orgSnap = await db.collection('organizations').doc(ORG_ID).get();
  const org = orgSnap.data() || {};
  console.log(`Org: ${org.name} (${ORG_ID})`);
  console.log(`isActive: ${org.isActive ?? org.is_active}`);
  console.log(`crm_domain: ${org.crm_domain || '(none)'}`);
  console.log(`created_by: ${org.created_by || '(none)'}\n`);

  // Users in this org
  const usersSnap = await db.collection('users')
    .where('organizationId', '==', ORG_ID)
    .get();
  console.log(`Users (${usersSnap.size}):`);
  usersSnap.forEach((u) => {
    const d = u.data() || {};
    console.log(`  - ${d.email} | role: ${d.role} | active: ${d.isActive ?? d.is_active}`);
  });

  // Data counts
  const [clients, appts, treatments, packages, staff] = await Promise.all([
    db.collection('organizations').doc(ORG_ID).collection('clients').count().get(),
    db.collection('organizations').doc(ORG_ID).collection('appointments').count().get(),
    db.collection('organizations').doc(ORG_ID).collection('treatments').count().get(),
    db.collection('organizations').doc(ORG_ID).collection('packages').count().get(),
    db.collection('organizations').doc(ORG_ID).collection('staff').count().get(),
  ]);
  console.log(`\nData counts:`);
  console.log(`  clients:     ${clients.data().count}`);
  console.log(`  appointments:${appts.data().count}`);
  console.log(`  treatments:  ${treatments.data().count}`);
  console.log(`  packages:    ${packages.data().count}`);
  console.log(`  staff:       ${staff.data().count}`);
})().catch((e) => { console.error(e); process.exit(1); });
