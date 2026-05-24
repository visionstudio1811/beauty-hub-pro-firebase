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

  const masters = await db.collection('defaultWaiverTemplates').get();
  if (masters.empty) {
    throw new HttpsError(
      'failed-precondition',
      'No master templates found in defaultWaiverTemplates collection.',
    );
  }

  const targetCol = orgRef.collection('waiverTemplates');
  const existing = await targetCol.get();
  const existingKinds = new Set<string>();
  const existingByKind = new Map<string, string>();
  existing.forEach((doc) => {
    const k = (doc.data().kind as string | undefined) ?? '';
    if (k) {
      existingKinds.add(k);
      existingByKind.set(k, doc.id);
    }
  });

  const created: Array<{ id: string; kind: string }> = [];
  const skipped: Array<{ kind: string; reason: string }> = [];
  const overwritten: Array<{ id: string; kind: string }> = [];

  for (const master of masters.docs) {
    const mData = master.data();
    const kind = mData.kind as string | undefined;
    if (!kind) {
      skipped.push({ kind: '(missing)', reason: 'master has no kind' });
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
        const id = existingByKind.get(kind)!;
        await targetCol.doc(id).set(payload, { merge: false });
        overwritten.push({ id, kind });
      } else {
        skipped.push({ kind, reason: 'already exists' });
      }
      continue;
    }

    const ref = await targetCol.add(payload);
    created.push({ id: ref.id, kind });
  }

  return { created, overwritten, skipped, orgName };
});
