import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { consumeRateLimit } from '../rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface CreateRequest {
  organizationId: string;
  treatmentId?: string | null;
  staffId?: string | null;
  label?: string;
  expiresAtIso?: string;            // ISO timestamp; default = +90 days
}

const DEFAULT_TTL_DAYS = 90;

const assertAdmin = async (uid: string, orgId: string): Promise<void> => {
  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.data();
  if (!userData) throw new HttpsError('permission-denied', 'User not found');
  if (userData.organizationId !== orgId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }
  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
};

const resolvePublicHostForOrg = async (orgId: string): Promise<string> => {
  // Prefer the org's white-label crm_domain; fall back to the central hub.
  const orgSnap = await db.collection('organizations').doc(orgId).get();
  const data = orgSnap.data() ?? {};
  const candidate =
    (typeof data.crm_domain === 'string' && data.crm_domain) ||
    (typeof data.custom_domain === 'string' && data.custom_domain) ||
    (typeof data.domain === 'string' && data.domain);
  if (candidate) return `https://${candidate}`;
  return 'https://beautyhubpro.com';
};

export const createSchedulerLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

  const data = request.data as CreateRequest;
  if (!data.organizationId) {
    throw new HttpsError('invalid-argument', 'organizationId is required');
  }

  await assertAdmin(request.auth.uid, data.organizationId);
  await consumeRateLimit(data.organizationId, 'createSchedulerLink', 50);

  // Validate treatment_id / staff_id belong to this org if provided
  if (data.treatmentId) {
    const tSnap = await db
      .collection('organizations')
      .doc(data.organizationId)
      .collection('treatments')
      .doc(data.treatmentId)
      .get();
    if (!tSnap.exists) throw new HttpsError('not-found', 'Treatment not found');
  }
  if (data.staffId) {
    const sSnap = await db.collection('users').doc(data.staffId).get();
    if (!sSnap.exists || sSnap.data()?.organizationId !== data.organizationId) {
      throw new HttpsError('not-found', 'Staff not found in this organization');
    }
  }

  const token = randomBytes(16).toString('hex');     // 32 hex chars
  const now = admin.firestore.Timestamp.now();
  const expiresAt = data.expiresAtIso
    ? admin.firestore.Timestamp.fromDate(new Date(data.expiresAtIso))
    : admin.firestore.Timestamp.fromMillis(now.toMillis() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Top-level public-lookup doc (visitor calls resolveSchedulerLink with the token)
  const publicDoc = {
    organization_id: data.organizationId,
    treatment_id: data.treatmentId ?? null,
    staff_id: data.staffId ?? null,
    is_active: true,
    expires_at: expiresAt,
    created_at: now,
  };

  // Per-org mirror — admin reads from the Scheduler Links settings UI
  const orgDoc = {
    token,
    treatment_id: data.treatmentId ?? null,
    staff_id: data.staffId ?? null,
    label: typeof data.label === 'string' && data.label.trim() ? data.label.trim().slice(0, 80) : null,
    is_active: true,
    expires_at: expiresAt,
    created_at: now,
    created_by_uid: request.auth.uid,
    revoked_at: null,
  };

  const batch = db.batch();
  batch.set(db.collection('schedulerLinkTokens').doc(token), publicDoc);
  batch.set(
    db
      .collection('organizations')
      .doc(data.organizationId)
      .collection('schedulerLinks')
      .doc(token),
    orgDoc,
  );
  await batch.commit();

  const host = await resolvePublicHostForOrg(data.organizationId);
  const url = `${host}/book/${token}`;

  return { token, url };
});

export const revokeSchedulerLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

  const { organizationId, token } = request.data as { organizationId: string; token: string };
  if (!organizationId || !token) {
    throw new HttpsError('invalid-argument', 'organizationId and token are required');
  }

  await assertAdmin(request.auth.uid, organizationId);

  const now = admin.firestore.Timestamp.now();
  const batch = db.batch();
  batch.update(db.collection('schedulerLinkTokens').doc(token), {
    is_active: false,
  });
  batch.update(
    db.collection('organizations').doc(organizationId).collection('schedulerLinks').doc(token),
    {
      is_active: false,
      revoked_at: now,
    },
  );
  await batch.commit();

  return { success: true };
});
