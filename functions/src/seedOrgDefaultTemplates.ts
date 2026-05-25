import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

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

interface SeedRequest {
  organizationId: string;
  /** If true, overwrite existing same-kind templates. Default false (skip kinds already present). */
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

  const orgRef = db.collection('organizations').doc(data.organizationId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new HttpsError('not-found', 'Organization not found');
  }
  const orgName = orgSnap.data()?.name as string | undefined;
  if (!orgName) {
    throw new HttpsError(
      'failed-precondition',
      'Organization is missing a name; set organizations/{orgId}.name before seeding.',
    );
  }

  // ---------- waiver/intake/agreement templates ----------
  const templateMasters = await db.collection('defaultWaiverTemplates').get();
  if (templateMasters.empty) {
    throw new HttpsError(
      'failed-precondition',
      'No master templates found in defaultWaiverTemplates collection.',
    );
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
      organization_id: data.organizationId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at_ts: Date.now(),
      seeded_from: master.id,
    };

    if (existingKinds.has(kind)) {
      if (data.overwriteExisting) {
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
  // Keyed by `trigger` (e.g. 'appointment_scheduled'). Idempotent: skip any
  // trigger the org already has an automation for so re-running this function
  // never creates duplicates that would double-send.
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
    const ref = await automationCol.add({
      ...mData,
      organization_id: data.organizationId,
      created_by: 'system:seed',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      last_triggered_at: null,
      seeded_from: master.id,
    });
    automationsCreated.push({ id: ref.id, trigger });
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
    // Back-compat fields so older callers that expected `created`/`skipped`
    // at the top level still get something useful.
    created: templatesCreated,
    overwritten: templatesOverwritten,
    skipped: templatesSkipped,
  };
});
