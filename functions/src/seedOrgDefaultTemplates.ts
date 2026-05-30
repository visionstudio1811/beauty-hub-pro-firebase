import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { getDefaultTemplateHtml, ELEGANT_DEFAULT_SETTINGS } from './lib/emailTemplates';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const ORG_NAME_TOKEN = /\{\{ORG_NAME\}\}/g;

function applyBrandToken(value: unknown, orgName: string): unknown {
  if (typeof value === 'string') {
    return value.replace(ORG_NAME_TOKEN, orgName);
  }
  if (Array.isArray(value)) {
    return value.map((item) => applyBrandToken(item, orgName));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = applyBrandToken(v, orgName);
    }
    return result;
  }
  return value;
}

// ---------- Booking email templates (Layer 2 HTML wrappers) ----------
// Three template keys map onto the new Cloud Function trigger emails. Each one
// uses the same shipped HTML the EmailTemplateDesigner generates as its default,
// so admins can later customize them via the designer if they want.
const BOOKING_EMAIL_TEMPLATE_DEFS: Array<{
  key: 'booking_request_received' | 'booking_request_admin_alert' | 'booking_request_declined';
  name: string;
  variables: string[];
}> = [
  {
    key: 'booking_request_received',
    name: 'Booking Request Received',
    variables: [
      'treatment', 'date', 'time', 'staff',
      'client_name', 'organization_name', 'organization_phone',
      'organization_address', 'organization_email', 'logo_url',
      'header_image_url', 'sender_name', 'cta_url',
    ],
  },
  {
    key: 'booking_request_admin_alert',
    name: 'Booking Request Alert (Admin)',
    variables: [
      'visitor_name', 'visitor_email', 'visitor_phone', 'visitor_notes',
      'treatment', 'date', 'time',
      'organization_name', 'organization_phone', 'logo_url',
      'header_image_url', 'sender_name', 'cta_url',
    ],
  },
  {
    key: 'booking_request_declined',
    name: 'Booking Declined',
    variables: [
      'treatment', 'date', 'time', 'reason',
      'client_name', 'organization_name', 'organization_phone', 'logo_url',
      'header_image_url', 'sender_name', 'cta_url',
    ],
  },
];

export interface SeedResult {
  orgName: string;
  templates: {
    created: Array<{ id: string; kind: string }>;
    overwritten: Array<{ id: string; kind: string }>;
    skipped: Array<{ kind: string; reason: string }>;
  };
  automations: {
    created: Array<{ id: string; trigger: string }>;
    skipped: Array<{ trigger: string; reason: string }>;
  };
  emailTemplates: {
    created: string[];
    skipped: Array<{ key: string; reason: string }>;
  };
}

/**
 * Internal seeder — does the work without auth checks. The callable CF wrapper
 * does auth/permission checks and then delegates here. Batch scripts can call
 * this directly using the Admin SDK.
 */
export async function seedOrgDefaultsInternal(
  organizationId: string,
  opts: { overwriteExisting?: boolean } = {},
): Promise<SeedResult> {
  const orgRef = db.collection('organizations').doc(organizationId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new Error(`Organization ${organizationId} not found`);
  }
  const orgName = orgSnap.data()?.name as string | undefined;
  if (!orgName) {
    throw new Error(
      `Organization ${organizationId} is missing a name; set organizations/${organizationId}.name before seeding.`,
    );
  }

  // ---------- waiver/intake/agreement templates ----------
  const templateMasters = await db.collection('defaultWaiverTemplates').get();
  if (templateMasters.empty) {
    throw new Error('No master templates found in defaultWaiverTemplates collection.');
  }

  const templateCol = orgRef.collection('waiverTemplates');
  const existingTemplates = await templateCol.get();
  const existingKinds = new Set<string>();
  const existingTemplateByKind = new Map<string, string>();
  existingTemplates.forEach((doc) => {
    const k = (doc.data().kind as string | undefined) ?? '';
    if (k) {
      existingKinds.add(k);
      existingTemplateByKind.set(k, doc.id);
    }
  });

  const templatesCreated: Array<{ id: string; kind: string }> = [];
  const templatesSkipped: Array<{ kind: string; reason: string }> = [];
  const templatesOverwritten: Array<{ id: string; kind: string }> = [];

  for (const master of templateMasters.docs) {
    const mData = master.data();
    const kind = mData.kind as string | undefined;
    if (!kind) {
      templatesSkipped.push({ kind: '(missing)', reason: 'master has no kind' });
      continue;
    }

    const branded = applyBrandToken(mData, orgName) as Record<string, unknown>;
    const payload = {
      ...branded,
      organization_id: organizationId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at_ts: Date.now(),
      seeded_from: master.id,
    };

    if (existingKinds.has(kind)) {
      if (opts.overwriteExisting) {
        const id = existingTemplateByKind.get(kind)!;
        await templateCol.doc(id).set(payload, { merge: false });
        templatesOverwritten.push({ id, kind });
      } else {
        templatesSkipped.push({ kind, reason: 'already exists' });
      }
      continue;
    }

    const ref = await templateCol.add(payload);
    templatesCreated.push({ id: ref.id, kind });
  }

  // ---------- marketing automations ----------
  const automationMasters = await db.collection('defaultMarketingAutomations').get();
  const automationCol = orgRef.collection('marketingAutomations');
  const existingAutomations = await automationCol.get();
  const existingTriggers = new Set<string>();
  existingAutomations.forEach((doc) => {
    const t = (doc.data().trigger as string | undefined) ?? '';
    if (t) existingTriggers.add(t);
  });

  const automationsCreated: Array<{ id: string; trigger: string }> = [];
  const automationsSkipped: Array<{ trigger: string; reason: string }> = [];

  for (const master of automationMasters.docs) {
    const mData = master.data() as Record<string, unknown>;
    const trigger = mData.trigger as string | undefined;
    if (!trigger) {
      automationsSkipped.push({ trigger: '(missing)', reason: 'master has no trigger' });
      continue;
    }
    if (existingTriggers.has(trigger)) {
      automationsSkipped.push({ trigger, reason: 'already exists' });
      continue;
    }
    const branded = applyBrandToken(mData, orgName) as Record<string, unknown>;
    const ref = await automationCol.add({
      ...branded,
      organization_id: organizationId,
      created_by: 'system:seed',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      last_triggered_at: null,
      seeded_from: master.id,
    });
    automationsCreated.push({ id: ref.id, trigger });
  }

  // ---------- email templates (Layer 2 branded HTML wrappers) ----------
  // Only seeded into the org's Resend integration. Skipped silently if no
  // Resend integration exists (the booking emails will then fall back to the
  // bare-bones stub at send time, which is the same behavior as before).
  const emailTemplatesCreated: string[] = [];
  const emailTemplatesSkipped: Array<{ key: string; reason: string }> = [];

  const intSnap = await orgRef
    .collection('marketingIntegrations')
    .where('provider', '==', 'resend')
    .limit(1)
    .get();

  if (intSnap.empty) {
    for (const def of BOOKING_EMAIL_TEMPLATE_DEFS) {
      emailTemplatesSkipped.push({ key: def.key, reason: 'no Resend integration' });
    }
  } else {
    const intDoc = intSnap.docs[0];
    const intData = intDoc.data() ?? {};
    const existingEmailTemplates = (intData.email_templates ?? {}) as Record<string, unknown>;

    // Inherit settings from appointment_reminder if the org has designed one,
    // so the new booking templates pick up their existing brand palette.
    const apptTpl = existingEmailTemplates['appointment_reminder'] as
      | { settings?: Record<string, string> } | undefined;
    const inheritedSettings = apptTpl?.settings ?? ELEGANT_DEFAULT_SETTINGS;

    const updates: Record<string, unknown> = {};
    for (const def of BOOKING_EMAIL_TEMPLATE_DEFS) {
      if (existingEmailTemplates[def.key]) {
        emailTemplatesSkipped.push({ key: def.key, reason: 'already exists' });
        continue;
      }
      updates[`email_templates.${def.key}`] = {
        name: def.name,
        html: getDefaultTemplateHtml(def.key),
        variables: def.variables,
        settings: inheritedSettings,
      };
      emailTemplatesCreated.push(def.key);
    }

    if (Object.keys(updates).length > 0) {
      await intDoc.ref.update(updates);
    }
  }

  return {
    orgName,
    templates: {
      created: templatesCreated,
      overwritten: templatesOverwritten,
      skipped: templatesSkipped,
    },
    automations: {
      created: automationsCreated,
      skipped: automationsSkipped,
    },
    emailTemplates: {
      created: emailTemplatesCreated,
      skipped: emailTemplatesSkipped,
    },
  };
}

interface SeedRequest {
  organizationId: string;
  /** If true, overwrite existing same-kind waiver templates. Default false. */
  overwriteExisting?: boolean;
}

export const seedOrgDefaultTemplates = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }
  const data = request.data as SeedRequest;
  if (!data?.organizationId) {
    throw new HttpsError('invalid-argument', 'organizationId is required');
  }

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  const caller = callerDoc.data();
  if (!callerDoc.exists || caller?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  if (caller?.organizationId !== data.organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }

  try {
    const result = await seedOrgDefaultsInternal(data.organizationId, {
      overwriteExisting: data.overwriteExisting,
    });
    return {
      ...result,
      // Back-compat fields some older callers expect at the top level.
      created: result.templates.created,
      overwritten: result.templates.overwritten,
      skipped: result.templates.skipped,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed';
    if (message.includes('not found')) throw new HttpsError('not-found', message);
    if (message.includes('missing a name')) throw new HttpsError('failed-precondition', message);
    if (message.includes('No master templates')) throw new HttpsError('failed-precondition', message);
    throw new HttpsError('internal', message);
  }
});
