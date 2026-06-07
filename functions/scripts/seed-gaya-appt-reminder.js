#!/usr/bin/env node
// One-shot: add `appointment_reminder` branded wrapper to Gaya's Resend
// integration so the hourly reminder Cloud Function stops falling back to the
// bare stub.
//
// Run with application-default creds:
//   gcloud auth application-default login   # one-time
//   node functions/scripts/seed-gaya-appt-reminder.js
//
// Pass a different orgId as the first arg to target another tenant.

const admin = require('firebase-admin');
const {
  getDefaultTemplateHtml,
  ELEGANT_DEFAULT_SETTINGS,
} = require('../lib/lib/emailTemplates');

admin.initializeApp({ projectId: 'beauty-hub-pro-app' });
const db = admin.firestore();

const ORG_NAME_QUERY = 'Gaya';
const TEMPLATE_KEY = 'appointment_reminder';
const TEMPLATE_NAME = 'Appointment Reminder';
const TEMPLATE_VARIABLES = [
  'service_name', 'appointment_date', 'appointment_time',
  'staff_name', 'location', 'client_name',
  'organization_name', 'organization_phone', 'organization_address',
  'organization_email', 'logo_url', 'header_image_url',
  'sender_name', 'cta_url',
];

async function resolveOrg() {
  const explicitId = process.argv[2];
  if (explicitId) {
    const ref = db.collection('organizations').doc(explicitId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Org ${explicitId} not found.`);
    return { id: explicitId, data: snap.data() };
  }
  const all = await db.collection('organizations').get();
  const matches = [];
  all.forEach((d) => {
    const name = (d.data().name || '').toString();
    if (name.toLowerCase().includes(ORG_NAME_QUERY.toLowerCase())) {
      matches.push({ id: d.id, data: d.data() });
    }
  });
  if (matches.length === 0) {
    throw new Error(`No org name contains "${ORG_NAME_QUERY}". Pass an explicit orgId.`);
  }
  if (matches.length > 1) {
    console.error('Multiple matches; re-run with an explicit orgId:');
    matches.forEach((m) => console.error(`  - ${m.id} : ${m.data.name}`));
    process.exit(1);
  }
  return matches[0];
}

async function main() {
  const org = await resolveOrg();
  console.log(`Org: ${org.data.name} (${org.id})`);

  const intSnap = await db
    .collection('organizations').doc(org.id)
    .collection('marketingIntegrations')
    .where('provider', '==', 'resend')
    .limit(1)
    .get();

  if (intSnap.empty) {
    throw new Error('No Resend integration found for this org. Configure Resend first.');
  }

  const intDoc = intSnap.docs[0];
  const intData = intDoc.data() || {};
  const existing = (intData.email_templates || {});

  // Inherit settings from a sibling template so brand colors carry over.
  const apptTpl =
    existing.appointment_confirmation ||
    existing.booking_request_received ||
    existing.appointment_reminder;
  const inheritedSettings = (apptTpl && apptTpl.settings) || ELEGANT_DEFAULT_SETTINGS;

  const html = getDefaultTemplateHtml(TEMPLATE_KEY);
  const update = {};
  update[`email_templates.${TEMPLATE_KEY}`] = {
    name: TEMPLATE_NAME,
    html,
    variables: TEMPLATE_VARIABLES,
    settings: inheritedSettings,
  };

  await intDoc.ref.update(update);

  const already = existing[TEMPLATE_KEY] ? 'overwritten' : 'created';
  console.log(`${TEMPLATE_KEY}: ${already} (${html.length} chars)`);
  console.log(`settings inherited from: ${
    existing.appointment_confirmation ? 'appointment_confirmation' :
    existing.booking_request_received ? 'booking_request_received' :
    existing.appointment_reminder ? 'appointment_reminder' :
    'ELEGANT_DEFAULT_SETTINGS'
  }`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
