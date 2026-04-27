// Comprehensive seed for the Firebase Emulator Suite. Covers every collection
// the app reads so you can exercise the whole system locally without touching
// production data.
//
// Run: npm run seed:emulators (from functions/) OR npm run seed:emulators
// from the repo root. Idempotent on known IDs — safe to re-run after the
// first seed to top up missing data.
//
// Users you can sign in as:
//   admin@test.local       / Password123!   (role: admin)
//   staff@test.local       / Password123!   (role: staff)
//   reception@test.local   / Password123!   (role: reception)
//   beautician@test.local  / Password123!   (role: beautician)
//   rivaladmin@test.local  / Password123!   (different org — cross-tenant isolation test)

import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'beauty-hub-pro-app';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
}

const db = admin.firestore();
const auth = admin.auth();
const now = admin.firestore.FieldValue.serverTimestamp();
const ts = admin.firestore.Timestamp;

// ── Constants ───────────────────────────────────────────────

const ORG_ID = 'test-org';
const ORG_NAME = 'Test Salon';
const RIVAL_ORG_ID = 'rival-org';
const RIVAL_ORG_NAME = 'Rival Spa';

const ADMIN_PASSWORD = 'Password123!';

const USERS = [
  { uid: 'user-admin',      email: 'admin@test.local',      role: 'admin',      fullName: 'Test Admin',      orgId: ORG_ID,       organizationRole: 'owner' },
  { uid: 'user-staff',      email: 'staff@test.local',      role: 'staff',      fullName: 'Test Staff',      orgId: ORG_ID,       organizationRole: 'manager' },
  { uid: 'user-reception',  email: 'reception@test.local',  role: 'reception',  fullName: 'Test Reception',  orgId: ORG_ID,       organizationRole: 'front-desk' },
  { uid: 'user-beautician', email: 'beautician@test.local', role: 'beautician', fullName: 'Test Beautician', orgId: ORG_ID,       organizationRole: 'therapist' },
  { uid: 'user-rival-admin', email: 'rivaladmin@test.local', role: 'admin',     fullName: 'Rival Admin',     orgId: RIVAL_ORG_ID, organizationRole: 'owner' },
];

const TREATMENTS = [
  { id: 't-facial',    name: 'Signature Facial', price: 100, duration: 60, category: 'Face',  is_active: true  },
  { id: 't-massage',   name: 'Swedish Massage',  price: 150, duration: 60, category: 'Body',  is_active: true  },
  { id: 't-mani',      name: 'Gel Manicure',     price: 45,  duration: 45, category: 'Nails', is_active: true  },
  { id: 't-pedi',      name: 'Deluxe Pedicure',  price: 65,  duration: 60, category: 'Nails', is_active: true  },
  { id: 't-laser',     name: 'Laser Hair Removal', price: 200, duration: 45, category: 'Body', is_active: true },
  { id: 't-old',       name: 'Legacy Treatment', price: 50,  duration: 30, category: 'Face',  is_active: false },
];

const STAFF = [
  { id: 'staff-1', name: 'Alice Senior',    email: 'alice@test.local',    phone: '+15550010001', is_active: true },
  { id: 'staff-2', name: 'Bob Mid',         email: 'bob@test.local',      phone: '+15550010002', is_active: true },
  { id: 'staff-3', name: 'Charlie Junior',  email: 'charlie@test.local',  phone: '+15550010003', is_active: true },
];

const PACKAGES = [
  {
    id: 'pkg-relaxation',
    name: 'Relaxation Bundle',
    description: '8-session package combining facials and massages.',
    price: 950,
    total_sessions: 8,
    validity_months: 6,
    treatments: ['t-facial', 't-massage'],
    treatment_items: [
      { treatment_id: 't-facial',  quantity: 5 },
      { treatment_id: 't-massage', quantity: 3 },
    ],
    is_active: true,
  },
  {
    id: 'pkg-nails',
    name: 'Nail Care Combo',
    description: '6 mani + pedi sessions.',
    price: 500,
    total_sessions: 6,
    validity_months: 4,
    treatments: ['t-mani', 't-pedi'],
    treatment_items: [
      { treatment_id: 't-mani', quantity: 3 },
      { treatment_id: 't-pedi', quantity: 3 },
    ],
    is_active: true,
  },
  {
    id: 'pkg-laser',
    name: 'Laser Package',
    description: '5 laser hair removal sessions.',
    price: 900,
    total_sessions: 5,
    validity_months: 12,
    treatments: ['t-laser'],
    treatment_items: [{ treatment_id: 't-laser', quantity: 5 }],
    is_active: true,
  },
  {
    id: 'pkg-retired',
    name: 'Discontinued Wellness Pack',
    description: 'Retired — kept for historical data.',
    price: 300,
    total_sessions: 4,
    validity_months: 6,
    treatments: ['t-old'],
    treatment_items: [{ treatment_id: 't-old', quantity: 4 }],
    is_active: false,
  },
];

const PRODUCT_CATEGORIES = [
  { id: 'cat-skincare', name: 'Skincare',    sort_order: 1, is_active: true },
  { id: 'cat-haircare', name: 'Hair Care',   sort_order: 2, is_active: true },
];

const PRODUCTS = [
  { id: 'prod-serum',     name: 'Hydrating Serum',  price: 85, category: 'cat-skincare', stock_quantity: 20, image_url: '', is_active: true  },
  { id: 'prod-cleanser',  name: 'Gentle Cleanser',  price: 40, category: 'cat-skincare', stock_quantity: 35, image_url: '', is_active: true  },
  { id: 'prod-shampoo',   name: 'Repair Shampoo',   price: 30, category: 'cat-haircare', stock_quantity: 50, image_url: '', is_active: true  },
  { id: 'prod-conditioner', name: 'Repair Conditioner', price: 32, category: 'cat-haircare', stock_quantity: 45, image_url: '', is_active: true },
  { id: 'prod-discontinued', name: 'Old SKU',       price: 20, category: 'cat-skincare', stock_quantity: 0,  image_url: '', is_active: false },
];

const CLIENTS = [
  { id: 'client-jane',    name: 'Jane Tester',    email: 'jane@test.local',    phone: '+15559876543', city: 'Testville',  has_membership: true,  deleted_at: null, notes: 'VIP client' },
  { id: 'client-mary',    name: 'Mary Smith',     email: 'mary@test.local',    phone: '+15559876544', city: 'Springfield', has_membership: true,  deleted_at: null, notes: '' },
  { id: 'client-lee',     name: 'Lee Johnson',    email: '',                   phone: '+15559876545', city: 'Testville',  has_membership: false, deleted_at: null, notes: 'Prefers SMS' },
  { id: 'client-carol',   name: 'Carol White',    email: 'carol@test.local',   phone: '+15559876546', city: '',           has_membership: false, deleted_at: null, notes: '' },
  { id: 'client-deleted', name: 'Pat Removed',    email: 'pat@test.local',     phone: '+15559876547', city: 'Testville',  has_membership: false, deleted_at: ts.now(), notes: 'Soft-deleted for trash-tab test' },
];

function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function plusMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// ── Seed steps ──────────────────────────────────────────────

async function seedUsers() {
  for (const u of USERS) {
    try {
      await auth.getUser(u.uid);
      await auth.updateUser(u.uid, {
        email: u.email,
        password: ADMIN_PASSWORD,
        emailVerified: true,
        displayName: u.fullName,
      });
    } catch {
      await auth.createUser({
        uid: u.uid,
        email: u.email,
        password: ADMIN_PASSWORD,
        emailVerified: true,
        displayName: u.fullName,
      });
    }

    await db.collection('users').doc(u.uid).set(
      {
        uid: u.uid,
        email: u.email,
        fullName: u.fullName,
        phone: '',
        role: u.role,
        organizationId: u.orgId,
        organizationRole: u.organizationRole,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }
}

async function seedOrgs() {
  await db.collection('organizations').doc(ORG_ID).set(
    {
      name: ORG_NAME,
      slug: 'test-salon',
      logoUrl: '',
      timezone: 'America/New_York',
      created_by: 'user-admin',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await db.collection('organizations').doc(RIVAL_ORG_ID).set(
    {
      name: RIVAL_ORG_NAME,
      slug: 'rival-spa',
      logoUrl: '',
      timezone: 'America/Los_Angeles',
      created_by: 'user-rival-admin',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // Primary org business info & config
  const pRef = db.collection('organizations').doc(ORG_ID);

  await pRef.collection('config').doc('businessInfo').set(
    {
      name: ORG_NAME,
      address: '123 Main St, Testville, NY 10001',
      phone: '+1 (555) 123-4567',
      email: 'hello@testsalon.local',
      website: 'https://testsalon.local',
      tax_id: 'EIN 12-3456789',
      tax_rate: 8.5,
      currency: 'USD',
      invoice_prefix: 'INV',
      invoice_payment_terms: 'Payment due within 30 days.',
      invoice_notes: 'Thank you for your business!',
      created_at: now,
      updated_at: now,
    },
    { merge: true },
  );

  // Business hours: Sun closed, Mon–Fri 9–18, Sat 10–16
  const hours = [
    { day_of_week: 0, open_time: '',      close_time: '',      is_open: false },
    { day_of_week: 1, open_time: '09:00', close_time: '18:00', is_open: true  },
    { day_of_week: 2, open_time: '09:00', close_time: '18:00', is_open: true  },
    { day_of_week: 3, open_time: '09:00', close_time: '18:00', is_open: true  },
    { day_of_week: 4, open_time: '09:00', close_time: '18:00', is_open: true  },
    { day_of_week: 5, open_time: '09:00', close_time: '18:00', is_open: true  },
    { day_of_week: 6, open_time: '10:00', close_time: '16:00', is_open: true  },
  ];
  for (const h of hours) {
    await pRef.collection('businessHours').doc(String(h.day_of_week)).set(h, { merge: true });
  }

  // Scheduling: 30-min slots Mon–Sat
  for (let dow = 1; dow <= 6; dow++) {
    await pRef.collection('schedulingConfig').doc(`sc-${dow}`).set(
      {
        day_of_week: dow,
        start_time: dow === 6 ? '10:00' : '09:00',
        end_time: dow === 6 ? '16:00' : '18:00',
        slot_duration: 30,
        is_active: true,
      },
      { merge: true },
    );
  }

  // Dropdown data
  const dd = [
    { category: 'cities',          value: 'Testville',    sort_order: 1, is_active: true },
    { category: 'cities',          value: 'Springfield',  sort_order: 2, is_active: true },
    { category: 'cities',          value: 'Rivertown',    sort_order: 3, is_active: true },
    { category: 'referralSources', value: 'Google',       sort_order: 1, is_active: true },
    { category: 'referralSources', value: 'Instagram',    sort_order: 2, is_active: true },
    { category: 'referralSources', value: 'Friend',       sort_order: 3, is_active: true },
  ];
  for (let i = 0; i < dd.length; i++) {
    await pRef.collection('dropdownData').doc(`dd-${i + 1}`).set(
      { ...dd[i], created_at: now },
      { merge: true },
    );
  }
}

async function seedTreatments() {
  const col = db.collection('organizations').doc(ORG_ID).collection('treatments');
  for (const t of TREATMENTS) {
    await col.doc(t.id).set(
      {
        name: t.name,
        price: t.price,
        duration: t.duration,
        category: t.category,
        is_active: t.is_active,
        created_at: now,
      },
      { merge: true },
    );
  }
}

async function seedStaff() {
  const col = db.collection('organizations').doc(ORG_ID).collection('staff');
  for (const s of STAFF) {
    await col.doc(s.id).set(
      {
        name: s.name,
        email: s.email,
        phone: s.phone,
        specialties: [],
        is_active: s.is_active,
        created_at: now,
      },
      { merge: true },
    );
  }
}

async function seedPackages() {
  const col = db.collection('organizations').doc(ORG_ID).collection('packages');
  for (const p of PACKAGES) {
    await col.doc(p.id).set(
      {
        name: p.name,
        description: p.description,
        price: p.price,
        total_sessions: p.total_sessions,
        validity_months: p.validity_months,
        treatments: p.treatments,
        treatment_items: p.treatment_items,
        is_active: p.is_active,
        is_custom: false,
        created_at: now,
        updated_at: now,
      },
      { merge: true },
    );
  }
}

async function seedProducts() {
  const pRef = db.collection('organizations').doc(ORG_ID);
  for (const c of PRODUCT_CATEGORIES) {
    await pRef.collection('productCategories').doc(c.id).set(
      { name: c.name, sort_order: c.sort_order, is_active: c.is_active, created_at: now },
      { merge: true },
    );
  }
  for (const p of PRODUCTS) {
    await pRef.collection('products').doc(p.id).set(
      {
        name: p.name,
        price: p.price,
        category: p.category,
        stock_quantity: p.stock_quantity,
        image_url: p.image_url,
        is_active: p.is_active,
        created_at: now,
      },
      { merge: true },
    );
  }
}

async function seedClients() {
  const col = db.collection('organizations').doc(ORG_ID).collection('clients');
  for (const c of CLIENTS) {
    await col.doc(c.id).set(
      {
        name: c.name,
        email: c.email,
        phone: c.phone,
        address: '',
        city: c.city,
        has_membership: c.has_membership,
        notes: c.notes,
        deleted_at: c.deleted_at,
        referral_source: 'Google',
        created_at: now,
        updated_at: now,
      },
      { merge: true },
    );
  }

  // A second client under the rival org — used to verify cross-tenant isolation.
  await db
    .collection('organizations')
    .doc(RIVAL_ORG_ID)
    .collection('clients')
    .doc('rival-client-1')
    .set(
      {
        name: 'Rival Client',
        email: 'rival@test.local',
        phone: '+15551110001',
        address: '',
        has_membership: false,
        deleted_at: null,
        created_at: now,
        updated_at: now,
      },
      { merge: true },
    );
}

async function seedPurchases() {
  const col = db.collection('organizations').doc(ORG_ID).collection('purchases');
  const purchases = [
    {
      id: 'purchase-jane-relax',
      client_id: 'client-jane',
      package_id: 'pkg-relaxation',
      total_amount: 950,
      sessions_remaining: 8,
      payment_status: 'active',
      purchase_date: todayStr(-7),
      expiry_date: plusMonths(6),
      sessions_by_treatment: [
        { treatment_id: 't-facial',  total: 5, remaining: 5 },
        { treatment_id: 't-massage', total: 3, remaining: 3 },
      ],
    },
    {
      id: 'purchase-mary-nails',
      client_id: 'client-mary',
      package_id: 'pkg-nails',
      total_amount: 500,
      sessions_remaining: 4,
      payment_status: 'active',
      purchase_date: todayStr(-20),
      expiry_date: plusMonths(3),
      sessions_by_treatment: [
        { treatment_id: 't-mani', total: 3, remaining: 2 },
        { treatment_id: 't-pedi', total: 3, remaining: 2 },
      ],
    },
    {
      id: 'purchase-mary-laser',
      client_id: 'client-mary',
      package_id: 'pkg-laser',
      total_amount: 900,
      sessions_remaining: 0,
      payment_status: 'completed',
      purchase_date: todayStr(-120),
      expiry_date: plusMonths(-1),
      sessions_by_treatment: [{ treatment_id: 't-laser', total: 5, remaining: 0 }],
    },
    {
      id: 'purchase-carol-relax',
      client_id: 'client-carol',
      package_id: 'pkg-relaxation',
      total_amount: 850,
      sessions_remaining: 6,
      payment_status: 'active',
      purchase_date: todayStr(-3),
      expiry_date: plusMonths(6),
      sessions_by_treatment: [
        { treatment_id: 't-facial',  total: 5, remaining: 4 },
        { treatment_id: 't-massage', total: 3, remaining: 2 },
      ],
    },
    {
      id: 'purchase-lee-expired',
      client_id: 'client-lee',
      package_id: 'pkg-retired',
      total_amount: 300,
      sessions_remaining: 2,
      payment_status: 'active',
      purchase_date: todayStr(-400),
      expiry_date: todayStr(-30), // expired
      sessions_by_treatment: [{ treatment_id: 't-old', total: 4, remaining: 2 }],
    },
  ];
  for (const p of purchases) {
    await col.doc(p.id).set(
      {
        ...p,
        organization_id: ORG_ID,
        created_at: p.purchase_date,
        created_at_ts: now,
      },
      { merge: true },
    );
  }
}

async function seedAppointments() {
  const col = db.collection('organizations').doc(ORG_ID).collection('appointments');
  const apps = [
    { id: 'app-1', client_id: 'client-jane',  staff_id: 'staff-1', treatment_id: 't-facial',  date: todayStr(2),   time: '10:00', status: 'scheduled' },
    { id: 'app-2', client_id: 'client-jane',  staff_id: 'staff-2', treatment_id: 't-massage', date: todayStr(-7),  time: '14:00', status: 'completed' },
    { id: 'app-3', client_id: 'client-mary',  staff_id: 'staff-1', treatment_id: 't-mani',    date: todayStr(-3),  time: '11:30', status: 'completed' },
    { id: 'app-4', client_id: 'client-mary',  staff_id: 'staff-3', treatment_id: 't-pedi',    date: todayStr(-5),  time: '15:00', status: 'completed' },
    { id: 'app-5', client_id: 'client-carol', staff_id: 'staff-2', treatment_id: 't-facial',  date: todayStr(4),   time: '09:30', status: 'confirmed' },
    { id: 'app-6', client_id: 'client-lee',   staff_id: 'staff-1', treatment_id: 't-massage', date: todayStr(-12), time: '16:00', status: 'no-show' },
    { id: 'app-7', client_id: 'client-jane',  staff_id: 'staff-3', treatment_id: 't-laser',   date: todayStr(7),   time: '13:00', status: 'scheduled' },
    { id: 'app-8', client_id: 'client-carol', staff_id: 'staff-2', treatment_id: 't-massage', date: todayStr(-2),  time: '10:30', status: 'cancelled' },
  ];

  const treatmentMap = Object.fromEntries(TREATMENTS.map((t) => [t.id, t]));
  const clientMap = Object.fromEntries(CLIENTS.map((c) => [c.id, c]));
  const staffMap = Object.fromEntries(STAFF.map((s) => [s.id, s]));

  for (const a of apps) {
    const treatment = treatmentMap[a.treatment_id];
    const client = clientMap[a.client_id];
    const staff = staffMap[a.staff_id];
    await col.doc(a.id).set(
      {
        client_id: a.client_id,
        client_name: client?.name ?? '',
        client_email: client?.email ?? '',
        client_phone: client?.phone ?? '',
        staff_id: a.staff_id,
        staff_name: staff?.name ?? '',
        treatment_id: a.treatment_id,
        treatment_name: treatment?.name ?? '',
        appointment_date: a.date,
        appointment_time: a.time,
        duration: treatment?.duration ?? 60,
        status: a.status,
        notes: '',
        package_id: null,
        created_at: now,
        updated_at: now,
      },
      { merge: true },
    );
  }
}

async function seedProductAssignments() {
  const col = db.collection('organizations').doc(ORG_ID).collection('productAssignments');
  await col.doc('pa-1').set(
    {
      product_id: 'prod-serum',
      client_id: 'client-jane',
      assigned_price: 85,
      quantity: 1,
      status: 'delivered',
      assigned_at: todayStr(-3),
      notes: 'Gift with package',
      created_at: now,
    },
    { merge: true },
  );
  await col.doc('pa-2').set(
    {
      product_id: 'prod-shampoo',
      client_id: 'client-mary',
      assigned_price: 30,
      quantity: 2,
      status: 'pending',
      assigned_at: todayStr(-1),
      notes: '',
      created_at: now,
    },
    { merge: true },
  );
}

async function seedWaivers() {
  const pRef = db.collection('organizations').doc(ORG_ID);

  // Template — waiver
  await pRef.collection('waiverTemplates').doc('tmpl-waiver').set(
    {
      title: 'Standard Treatment Consent',
      kind: 'waiver',
      content: {
        blocks: [
          { id: 'b1', type: 'text', value: 'Please read and sign to consent to treatment.' },
          { id: 'b2', type: 'yes_no', label: 'I have disclosed all relevant medical history.', required: true },
          { id: 'b3', type: 'signature', label: 'Signature', required: true },
        ],
      },
      created_at: now,
    },
    { merge: true },
  );

  // Template — intake
  await pRef.collection('waiverTemplates').doc('tmpl-intake').set(
    {
      title: 'New Client Intake',
      kind: 'intake',
      content: {
        blocks: [
          { id: 'b1', type: 'text', value: 'Please fill out before your first appointment.' },
          { id: 'b2', type: 'short_answer', label: 'Allergies / medications', required: false },
          { id: 'b3', type: 'phone', label: 'Emergency contact phone', required: true },
        ],
      },
      created_at: now,
    },
    { merge: true },
  );

  // A pending waiver + matching token (so you can visit the public form)
  const pendingToken = 'seed-pending-waiver-token-0001';
  await pRef.collection('clientWaivers').doc('waiver-pending').set(
    {
      clientId: 'client-jane',
      templateId: 'tmpl-waiver',
      kind: 'waiver',
      clientName: 'Jane Tester',
      clientEmail: 'jane@test.local',
      clientPhone: '+15559876543',
      status: 'pending',
      token: pendingToken,
      sentBy: 'user-admin',
      sentVia: 'device',
      createdAt: now,
    },
    { merge: true },
  );

  await db.collection('waiverTokens').doc(pendingToken).set(
    {
      waiverId: 'waiver-pending',
      organizationId: ORG_ID,
      clientId: 'client-jane',
      templateId: 'tmpl-waiver',
      status: 'pending',
      createdAt: now,
      expiresAt: ts.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    { merge: true },
  );

  // A signed waiver (historical)
  await pRef.collection('clientWaivers').doc('waiver-signed').set(
    {
      clientId: 'client-mary',
      templateId: 'tmpl-waiver',
      kind: 'waiver',
      clientName: 'Mary Smith',
      clientEmail: 'mary@test.local',
      clientPhone: '+15559876544',
      status: 'signed',
      token: randomUUID(),
      signer_name: 'Mary Smith',
      signer_email: 'mary@test.local',
      signer_phone: '+15559876544',
      signed_at: now,
      pdf_url: '',
      answers: { b2: true },
      createdAt: now,
    },
    { merge: true },
  );
}

async function seedInvoices() {
  const pRef = db.collection('organizations').doc(ORG_ID);
  const biz = {
    name: 'Test Salon',
    address: '123 Main St, Testville, NY 10001',
    phone: '+1 (555) 123-4567',
    email: 'hello@testsalon.local',
    website: 'https://testsalon.local',
    logo_url: '',
    tax_id: 'EIN 12-3456789',
    payment_terms: 'Payment due within 30 days.',
    notes: 'Thank you for your business!',
    timezone: 'America/New_York',
  };
  const TAX_RATE = 8.5;
  const CURRENCY = 'USD';

  function lineTotals(priceUsd: number) {
    const unit = Math.round(priceUsd * 100);
    const subtotal = unit; // quantity = 1
    const tax = Math.round((subtotal * TAX_RATE) / 100);
    return { unit, subtotal, tax, total: subtotal + tax };
  }

  const invoices = [
    {
      id: 'inv-seed-1',
      number: 1,
      purchase_id: 'purchase-jane-relax',
      client_id: 'client-jane',
      client: { name: 'Jane Tester', email: 'jane@test.local', phone: '+15559876543', address: '' },
      line: {
        name: 'Relaxation Bundle',
        description: '8-session package combining facials and massages.',
        package_id: 'pkg-relaxation',
        treatments: [
          { treatment_id: 't-facial', name: 'Signature Facial', quantity: 5, unit_price_cents: 10000 },
          { treatment_id: 't-massage', name: 'Swedish Massage', quantity: 3, unit_price_cents: 15000 },
        ],
        price: 950,
      },
      status: 'issued' as const,
    },
    {
      id: 'inv-seed-2',
      number: 2,
      purchase_id: 'purchase-mary-nails',
      client_id: 'client-mary',
      client: { name: 'Mary Smith', email: 'mary@test.local', phone: '+15559876544', address: '' },
      line: {
        name: 'Nail Care Combo',
        description: '6 mani + pedi sessions.',
        package_id: 'pkg-nails',
        treatments: [
          { treatment_id: 't-mani', name: 'Gel Manicure', quantity: 3, unit_price_cents: 4500 },
          { treatment_id: 't-pedi', name: 'Deluxe Pedicure', quantity: 3, unit_price_cents: 6500 },
        ],
        price: 500,
      },
      status: 'issued' as const,
    },
    {
      id: 'inv-seed-3',
      number: 3,
      purchase_id: 'purchase-mary-laser',
      client_id: 'client-mary',
      client: { name: 'Mary Smith', email: 'mary@test.local', phone: '+15559876544', address: '' },
      line: {
        name: 'Laser Package',
        description: '5 laser hair removal sessions.',
        package_id: 'pkg-laser',
        treatments: [
          { treatment_id: 't-laser', name: 'Laser Hair Removal', quantity: 5, unit_price_cents: 20000 },
        ],
        price: 900,
      },
      status: 'void' as const,
    },
  ];

  for (const i of invoices) {
    const t = lineTotals(i.line.price);
    const issuedAt = ts.fromMillis(Date.now() - (4 - i.number) * 3 * 24 * 60 * 60 * 1000);

    await pRef.collection('invoices').doc(i.id).set(
      {
        invoice_number: `INV-${String(i.number).padStart(5, '0')}`,
        invoice_number_int: i.number,
        issued_at: issuedAt,
        purchase_id: i.purchase_id,
        client_id: i.client_id,
        client_snapshot: i.client,
        business_snapshot: biz,
        line_items: [
          {
            type: 'package',
            name: i.line.name,
            description: i.line.description,
            package_id: i.line.package_id,
            treatments: i.line.treatments,
            quantity: 1,
            unit_price_cents: t.unit,
            subtotal_cents: t.subtotal,
          },
        ],
        subtotal_cents: t.subtotal,
        tax_rate: TAX_RATE,
        tax_amount_cents: t.tax,
        total_cents: t.total,
        currency: CURRENCY,
        pdf_url: null,
        pdf_storage_path: null,
        status: i.status,
        voided_at: i.status === 'void' ? issuedAt : null,
        voided_by: i.status === 'void' ? 'user-admin' : null,
        created_at: issuedAt,
        created_by: 'user-admin',
      },
      { merge: true },
    );
  }

  // Counter should advance past the seeded invoices so the next real
  // createInvoice call produces INV-00004.
  await pRef.collection('config').doc('invoiceCounter').set(
    { next_number: invoices.length + 1, updated_at: now },
    { merge: true },
  );
}

async function seedMembershipHistory() {
  const col = db
    .collection('organizations')
    .doc(ORG_ID)
    .collection('clients')
    .doc('client-jane')
    .collection('membershipHistory');

  await col.doc('mh-1').set(
    {
      event_type: 'package_assigned',
      package_id: 'pkg-relaxation',
      package_name: 'Relaxation Bundle',
      amount: 950,
      notes: 'Initial purchase',
      recorded_by: 'user-admin',
      recorded_at: now,
    },
    { merge: true },
  );
}

// ── Entry ───────────────────────────────────────────────────

async function main() {
  console.log('Seeding emulators…');
  await seedUsers();
  console.log('  ✓ users (admin, staff, reception, beautician, rival admin)');
  await seedOrgs();
  console.log('  ✓ orgs (Test Salon + Rival Spa) + businessInfo + hours + schedulingConfig + dropdowns');
  await seedTreatments();
  console.log(`  ✓ treatments (${TREATMENTS.length})`);
  await seedStaff();
  console.log(`  ✓ staff (${STAFF.length})`);
  await seedPackages();
  console.log(`  ✓ packages (${PACKAGES.length})`);
  await seedProducts();
  console.log(`  ✓ products (${PRODUCTS.length}) + categories`);
  await seedClients();
  console.log(`  ✓ clients (${CLIENTS.length} + 1 rival-org client)`);
  await seedPurchases();
  console.log('  ✓ purchases (5 mixed states)');
  await seedAppointments();
  console.log('  ✓ appointments (8 mixed states)');
  await seedProductAssignments();
  console.log('  ✓ product assignments (2)');
  await seedWaivers();
  console.log('  ✓ waiver templates + pending + signed waiver');
  await seedInvoices();
  console.log('  ✓ invoices (2 issued, 1 voided) + counter at 4');
  await seedMembershipHistory();
  console.log('  ✓ membership history');

  console.log('\n─────────────────────────────────────────────');
  console.log('Sign-in credentials (all use password: ' + ADMIN_PASSWORD + ')');
  console.log('─────────────────────────────────────────────');
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(11)} → ${u.email}  (${u.orgId})`);
  }
  console.log('\nEmulator UI:   http://localhost:4000');
  console.log('Frontend URL:  http://localhost:8080  (after `npm run dev:emulators`)');
  console.log('\nPublic waiver link to test signing:');
  console.log('  http://localhost:8080/waiver/seed-pending-waiver-token-0001');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
