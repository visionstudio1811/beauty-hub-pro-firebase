#!/usr/bin/env node
/**
 * Builds a sales-demo tenant inside the existing empty "Beauty Hub Pro" org.
 *
 *   gcloud auth application-default login   # one-time
 *   node functions/scripts/build-demo-account.js
 *
 * Idempotent: re-runnable. Wipes only data this script seeds; leaves untouched
 * everything we don't recognize. The Auth user's password is reset to the
 * constant below every run, so you can always rescue access.
 *
 * After running, log in at https://app.beautyhubpro.com/auth with:
 *   email:    demo@beautyhubpro.com
 *   password: BeautyDemo2026!
 */

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'beauty-hub-pro-app' });

const db = admin.firestore();
const auth = admin.auth();

const ORG_ID = 'zJ6CTBzTCSOSxEVfu7R6'; // existing empty "Beauty Hub Pro" org
const ORG_NAME = 'Aurora Beauty Lounge';
const ADMIN_EMAIL = 'demo@beautyhubpro.com';
const ADMIN_PASSWORD = 'BeautyDemo2026!';
const ADMIN_NAME = 'Demo Admin';

const TZ = 'America/New_York';
const NOW = new Date();

// ── helpers ───────────────────────────────────────────────────────────────

function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysFromNow(delta) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + delta);
  return d;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function svcTs() {
  return admin.firestore.FieldValue.serverTimestamp();
}
async function clearSubcollection(orgId, name) {
  const snap = await db.collection('organizations').doc(orgId).collection(name).get();
  if (snap.empty) return 0;
  const chunks = [];
  let batch = db.batch();
  let n = 0;
  snap.forEach((d) => {
    batch.delete(d.ref);
    n++;
    if (n % 400 === 0) {
      chunks.push(batch.commit());
      batch = db.batch();
    }
  });
  chunks.push(batch.commit());
  await Promise.all(chunks);
  return snap.size;
}

// ── catalog data ──────────────────────────────────────────────────────────

const TREATMENTS = [
  { name: 'Signature Facial',           duration: 60,  price: 145, category: 'Facials',     buffer: 15 },
  { name: 'Hydrafacial',                 duration: 75,  price: 185, category: 'Facials',     buffer: 15 },
  { name: 'Microneedling',               duration: 90,  price: 295, category: 'Treatments',  buffer: 30 },
  { name: 'Chemical Peel',               duration: 45,  price: 165, category: 'Treatments',  buffer: 15 },
  { name: 'Lymphatic Drainage Massage',  duration: 60,  price: 135, category: 'Body',        buffer: 15 },
  { name: 'Brazilian Wax',               duration: 30,  price: 75,  category: 'Body',        buffer: 10 },
  { name: 'Lash Lift & Tint',            duration: 60,  price: 105, category: 'Lashes',      buffer: 10 },
  { name: 'Brow Lamination',             duration: 45,  price: 95,  category: 'Brows',       buffer: 10 },
];

const PACKAGES = [
  { name: 'Glow Series — Hydrafacial × 4', sessions: 4, price: 680, treatmentIdx: [1] },
  { name: 'Microneedling × 3 Bundle',      sessions: 3, price: 795, treatmentIdx: [2] },
  { name: 'Monthly Maintenance',           sessions: 6, price: 720, treatmentIdx: [0] },
  { name: 'Bridal Glow Package',           sessions: 4, price: 540, treatmentIdx: [0, 1] },
];

const STAFF_PROFILES = [
  { email: 'sophia@aurorabeauty.demo', fullName: 'Sophia Reyes',  role: 'beautician' },
  { email: 'amelia@aurorabeauty.demo', fullName: 'Amelia Chen',   role: 'beautician' },
  { email: 'olivia@aurorabeauty.demo', fullName: 'Olivia Banks',  role: 'beautician' },
];

const CLIENT_NAMES = [
  'Emma Thompson','Olivia Martinez','Ava Nguyen','Isabella Cooper','Sophia Patel',
  'Mia Rodriguez','Charlotte Singh','Amelia Davis','Harper Wilson','Evelyn Brown',
  'Abigail Lee','Emily Garcia','Elizabeth Kim','Sofia Hernandez','Avery Anderson',
  'Ella Robinson','Scarlett Walker','Grace Hall','Chloe Allen','Victoria Young',
  'Riley King','Aria Wright','Lily Lopez','Hannah Hill','Layla Green',
  'Zoe Adams','Penelope Nelson','Stella Carter','Aurora Mitchell','Savannah Perez',
];

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding demo into org ${ORG_ID}...\n`);

  // 1. Org doc
  await db.collection('organizations').doc(ORG_ID).set({
    name: ORG_NAME,
    isActive: true,
    timezone: TZ,
    phone: '+1 754-232-6590',
    address: '123 Brickell Ave, Miami, FL 33131',
    email: 'hello@aurorabeauty.demo',
    description: 'Premium beauty and wellness studio — Beauty Hub Pro demo tenant',
    updatedAt: svcTs(),
  }, { merge: true });
  console.log(`✓ org renamed to "${ORG_NAME}"`);

  // 2. Admin Auth user + Firestore profile
  let adminUid;
  try {
    const u = await auth.getUserByEmail(ADMIN_EMAIL);
    adminUid = u.uid;
    await auth.updateUser(adminUid, { password: ADMIN_PASSWORD, displayName: ADMIN_NAME, emailVerified: true });
    console.log(`✓ admin Auth user updated (${adminUid})`);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    const u = await auth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: ADMIN_NAME,
      emailVerified: true,
    });
    adminUid = u.uid;
    console.log(`✓ admin Auth user created (${adminUid})`);
  }
  await db.collection('users').doc(adminUid).set({
    uid: adminUid,
    email: ADMIN_EMAIL,
    fullName: ADMIN_NAME,
    role: 'admin',
    organizationId: ORG_ID,
    isActive: true,
    createdAt: svcTs(),
  }, { merge: true });

  // 3. Staff Auth users + Firestore profiles
  const staffUids = [];
  for (const p of STAFF_PROFILES) {
    let uid;
    try {
      const u = await auth.getUserByEmail(p.email);
      uid = u.uid;
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
      const u = await auth.createUser({
        email: p.email,
        password: ADMIN_PASSWORD,
        displayName: p.fullName,
        emailVerified: true,
      });
      uid = u.uid;
    }
    await db.collection('users').doc(uid).set({
      uid,
      email: p.email,
      fullName: p.fullName,
      role: p.role,
      organizationId: ORG_ID,
      isActive: true,
      createdAt: svcTs(),
    }, { merge: true });
    staffUids.push({ uid, name: p.fullName });
  }
  console.log(`✓ ${staffUids.length} staff users seeded`);

  // 4. Wipe + re-seed scoped subcollections
  for (const sub of ['businessHours', 'schedulingConfig', 'treatments', 'packages', 'staff', 'clients', 'appointments', 'purchases']) {
    const n = await clearSubcollection(ORG_ID, sub);
    if (n) console.log(`  cleared ${n} old ${sub}`);
  }

  // 5. Business hours: Mon–Sat 9–7, Sun closed
  const bhCol = db.collection('organizations').doc(ORG_ID).collection('businessHours');
  for (let dow = 0; dow <= 6; dow++) {
    const open = dow !== 0;
    await bhCol.add({
      day_of_week: dow,
      is_open: open,
      open_time: open ? '09:00' : null,
      close_time: open ? '19:00' : null,
    });
  }
  console.log(`✓ business hours seeded`);

  // 6. Scheduling config: same hours, all staff
  const scCol = db.collection('organizations').doc(ORG_ID).collection('schedulingConfig');
  for (let dow = 1; dow <= 6; dow++) {
    await scCol.add({
      day_of_week: dow,
      start_time: '09:00',
      end_time: '19:00',
      staff_ids: staffUids.map((s) => s.uid),
      is_active: true,
    });
  }

  // 7. Staff records (legacy collection — paralleling user docs)
  const staffCol = db.collection('organizations').doc(ORG_ID).collection('staff');
  for (const s of staffUids) {
    await staffCol.doc(s.uid).set({
      name: s.name,
      email: STAFF_PROFILES.find((p) => p.fullName === s.name).email,
      is_active: true,
      created_at: svcTs(),
    });
  }

  // 8. Treatments
  const txCol = db.collection('organizations').doc(ORG_ID).collection('treatments');
  const treatmentIds = [];
  for (const t of TREATMENTS) {
    const ref = await txCol.add({
      name: t.name,
      duration: t.duration,
      price: t.price,
      category: t.category,
      description: `${t.name} — a signature service at Aurora.`,
      is_active: true,
      staff_ids: staffUids.map((s) => s.uid),
      buffer_before_minutes: 5,
      buffer_after_minutes: t.buffer,
      created_at: svcTs(),
    });
    treatmentIds.push({ id: ref.id, ...t });
  }
  console.log(`✓ ${treatmentIds.length} treatments seeded`);

  // 9. Packages
  const pkgCol = db.collection('organizations').doc(ORG_ID).collection('packages');
  const packageIds = [];
  for (const p of PACKAGES) {
    const ref = await pkgCol.add({
      name: p.name,
      price: p.price,
      total_sessions: p.sessions,
      treatments: p.treatmentIdx.map((i) => treatmentIds[i].id),
      description: `${p.name} — bundle savings for loyal clients.`,
      is_active: true,
      created_at: svcTs(),
    });
    packageIds.push({ id: ref.id, ...p, treatmentRefs: p.treatmentIdx.map((i) => treatmentIds[i]) });
  }
  console.log(`✓ ${packageIds.length} packages seeded`);

  // 10. Clients
  const clCol = db.collection('organizations').doc(ORG_ID).collection('clients');
  const clientIds = [];
  for (const fullName of CLIENT_NAMES) {
    const slug = fullName.toLowerCase().replace(/[^a-z]/g, '');
    const ref = await clCol.add({
      name: fullName,
      email: `${slug}@example.demo`,
      phone: `+1 305-${randInt(200, 999)}-${String(randInt(1000, 9999))}`,
      address: `${randInt(100, 9999)} Demo Blvd`,
      city: pick(['Miami', 'Coral Gables', 'Brickell', 'Wynwood', 'Aventura']),
      date_of_birth: `${randInt(1975, 2002)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
      gender: pick(['female', 'female', 'female', 'male', 'non_binary']),
      has_membership: Math.random() < 0.2,
      deleted_at: null,
      created_at: svcTs(),
      updated_at: svcTs(),
    });
    clientIds.push({ id: ref.id, name: fullName });
  }
  console.log(`✓ ${clientIds.length} clients seeded`);

  // 11. Purchases — 8 clients have active packages
  const puCol = db.collection('organizations').doc(ORG_ID).collection('purchases');
  const purchases = [];
  for (let i = 0; i < 8; i++) {
    const client = clientIds[i];
    const pkg = pick(packageIds);
    const usedSessions = randInt(0, Math.max(0, pkg.sessions - 1));
    const remaining = pkg.sessions - usedSessions;
    const purchaseDate = isoDay(daysFromNow(-randInt(10, 60)));
    const expiryDate = isoDay(daysFromNow(randInt(60, 180)));
    const ref = await puCol.add({
      client_id: client.id,
      client_name: client.name,
      package_id: pkg.id,
      package_name: pkg.name,
      total_amount: pkg.price,
      total_sessions: pkg.sessions,
      sessions_remaining: remaining,
      sessions_by_treatment: pkg.treatmentRefs.map((t) => ({
        treatment_id: t.id,
        total: pkg.sessions,
        remaining,
      })),
      payment_status: remaining > 0 ? 'active' : 'completed',
      purchase_date: purchaseDate,
      expiry_date: expiryDate,
      organization_id: ORG_ID,
      created_at: svcTs(),
    });
    purchases.push({ id: ref.id, clientId: client.id, treatmentRefs: pkg.treatmentRefs, remaining });
  }
  console.log(`✓ ${purchases.length} purchases seeded`);

  // 12. Appointments — 30 past (completed), 25 upcoming (scheduled)
  const apCol = db.collection('organizations').doc(ORG_ID).collection('appointments');
  let aptCount = 0;
  for (let i = 0; i < 30; i++) {
    const c = pick(clientIds);
    const t = pick(treatmentIds);
    const s = pick(staffUids);
    const d = daysFromNow(-randInt(1, 30));
    const hour = randInt(9, 17);
    await apCol.add({
      client_id: c.id,
      client_name: c.name,
      client_phone: '+13055551212',
      client_email: `${c.name.toLowerCase().replace(/[^a-z]/g, '')}@example.demo`,
      treatment_id: t.id,
      treatment_name: t.name,
      staff_id: s.uid,
      staff_name: s.name,
      appointment_date: isoDay(d),
      appointment_time: `${String(hour).padStart(2, '0')}:00`,
      duration: t.duration,
      status: 'completed',
      notes: '',
      organization_id: ORG_ID,
      price: t.price,
      addons: [],
      addons_total_price: 0,
      addons_total_duration: 0,
      buffer_before_minutes: 5,
      buffer_after_minutes: t.buffer,
      session_used: false,
      package_id: null,
      package_name: null,
      created_at: svcTs(),
      updated_at: svcTs(),
    });
    aptCount++;
  }
  for (let i = 0; i < 25; i++) {
    const c = pick(clientIds);
    const t = pick(treatmentIds);
    const s = pick(staffUids);
    const d = daysFromNow(randInt(1, 30));
    const hour = randInt(9, 17);
    await apCol.add({
      client_id: c.id,
      client_name: c.name,
      client_phone: '+13055551212',
      client_email: `${c.name.toLowerCase().replace(/[^a-z]/g, '')}@example.demo`,
      treatment_id: t.id,
      treatment_name: t.name,
      staff_id: s.uid,
      staff_name: s.name,
      appointment_date: isoDay(d),
      appointment_time: `${String(hour).padStart(2, '0')}:00`,
      duration: t.duration,
      status: Math.random() < 0.5 ? 'scheduled' : 'confirmed',
      notes: '',
      organization_id: ORG_ID,
      price: t.price,
      addons: [],
      addons_total_price: 0,
      addons_total_duration: 0,
      buffer_before_minutes: 5,
      buffer_after_minutes: t.buffer,
      session_used: false,
      package_id: null,
      package_name: null,
      created_at: svcTs(),
      updated_at: svcTs(),
    });
    aptCount++;
  }
  console.log(`✓ ${aptCount} appointments seeded`);

  // 13. Optional: business info (settings page tile)
  await db.collection('organizations').doc(ORG_ID).collection('config').doc('businessInfo').set({
    name: ORG_NAME,
    phone: '+1 754-232-6590',
    email: 'hello@aurorabeauty.demo',
    address: '123 Brickell Ave, Miami, FL 33131',
    currency: 'USD',
    invoice_prefix: 'AUR',
    invoice_payment_terms: 'Net 0 — payable on service',
    slot_interval_minutes: 30,
    timezone: TZ,
    created_at: svcTs(),
    updated_at: svcTs(),
  }, { merge: true });

  console.log('\n========================================');
  console.log('DEMO ACCOUNT READY');
  console.log('========================================');
  console.log(`Brand:    ${ORG_NAME}`);
  console.log(`Login at: https://app.beautyhubpro.com/auth`);
  console.log(`Email:    ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log(`Org ID:   ${ORG_ID}`);
  console.log('========================================');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
