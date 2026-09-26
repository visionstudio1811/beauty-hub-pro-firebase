import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { consumeRateLimit } from '../rateLimit';
import { defineStrings, makeT, getCallerLanguage, Translator } from '../lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Staff-facing HttpsError copy (rendered verbatim in the Scheduler Links
// settings UI toasts). Follows the caller's language (users/{uid}.language,
// then their own org's default; never a caller-supplied orgId). The `unauthenticated` error is thrown before any
// Firestore read and therefore stays English.
const STRINGS = defineStrings({
  en: {
    user_not_found: 'User not found',
    org_mismatch: 'Organization mismatch',
    admin_required: 'Admin access required',
    org_required: 'organizationId is required',
    treatment_not_found: 'Treatment not found',
    staff_not_found: 'Staff not found in this organization',
    org_token_required: 'organizationId and token are required',
    link_not_found: 'Link not found',
    active_must_revoke: 'Active links must be revoked before deletion.',
    invalid_expiry: 'Invalid expiration date',
  },
  he: {
    user_not_found: 'המשתמש לא נמצא',
    org_mismatch: 'אי-התאמה בין הארגונים',
    admin_required: 'נדרשת הרשאת מנהל',
    org_required: 'נדרש מזהה ארגון (organizationId)',
    treatment_not_found: 'הטיפול לא נמצא',
    staff_not_found: 'איש הצוות לא נמצא בארגון זה',
    org_token_required: 'נדרשים מזהה ארגון (organizationId) וטוקן',
    link_not_found: 'הקישור לא נמצא',
    active_must_revoke: 'יש לבטל קישורים פעילים לפני מחיקתם.',
    invalid_expiry: 'תאריך התפוגה אינו תקין',
  },
});

type T = Translator<keyof typeof STRINGS.en>;

interface CreateRequest {
  organizationId: string;
  treatmentId?: string | null;
  staffId?: string | null;
  label?: string;
  expiresAtIso?: string;            // ISO timestamp; default = +90 days
  neverExpires?: boolean;           // true = no expiration (expires_at: null)
}

interface UpdateRequest {
  organizationId: string;
  token: string;
  // Each field is optional; only the ones present are changed.
  treatmentId?: string | null;      // null = any treatment (visitor picks)
  label?: string | null;
  expiresAtIso?: string | null;     // null = never expires
  isActive?: boolean;
}

const TOKEN_FORMAT = /^[a-f0-9]{32}$/;

const DEFAULT_TTL_DAYS = 90;

const resolveT = async (uid: string): Promise<T> => {
  // Caller's own profile language, then their own org (from users/{uid}) — the
  // caller-supplied organizationId is deliberately NOT used here because it is
  // unverified until assertAdmin runs.
  const lang = await getCallerLanguage(uid);
  return makeT(STRINGS, lang);
};

const assertAdmin = async (uid: string, orgId: string, t: T): Promise<void> => {
  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.data();
  if (!userData) throw new HttpsError('permission-denied', t('user_not_found'));
  if (userData.organizationId !== orgId) {
    throw new HttpsError('permission-denied', t('org_mismatch'));
  }
  if (userData.role !== 'admin') {
    throw new HttpsError('permission-denied', t('admin_required'));
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
  const t = await resolveT(request.auth.uid);
  if (!data.organizationId) {
    throw new HttpsError('invalid-argument', t('org_required'));
  }

  await assertAdmin(request.auth.uid, data.organizationId, t);
  await consumeRateLimit(data.organizationId, 'createSchedulerLink', 50);

  // Validate treatment_id / staff_id belong to this org if provided
  if (data.treatmentId) {
    const tSnap = await db
      .collection('organizations')
      .doc(data.organizationId)
      .collection('treatments')
      .doc(data.treatmentId)
      .get();
    if (!tSnap.exists) throw new HttpsError('not-found', t('treatment_not_found'));
  }
  if (data.staffId) {
    const sSnap = await db.collection('users').doc(data.staffId).get();
    if (!sSnap.exists || sSnap.data()?.organizationId !== data.organizationId) {
      throw new HttpsError('not-found', t('staff_not_found'));
    }
  }

  const token = randomBytes(16).toString('hex');     // 32 hex chars
  const now = admin.firestore.Timestamp.now();
  const expiresAt = data.neverExpires === true
    ? null
    : data.expiresAtIso
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

/**
 * Edits an existing link in place: treatment scope, label, expiration and
 * active state. The token (and so the URL) never changes, so links already
 * shared or embedded pick up the change immediately. Setting isActive back to
 * true re-enables a revoked link. Staff scope is left as created.
 */
export const updateSchedulerLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

  const data = (request.data ?? {}) as UpdateRequest;
  const t = await resolveT(request.auth.uid);
  if (!data.organizationId || typeof data.token !== 'string' || !TOKEN_FORMAT.test(data.token)) {
    throw new HttpsError('invalid-argument', t('org_token_required'));
  }

  await assertAdmin(request.auth.uid, data.organizationId, t);
  await consumeRateLimit(data.organizationId, 'updateSchedulerLink', 200);

  const linkRef = db
    .collection('organizations')
    .doc(data.organizationId)
    .collection('schedulerLinks')
    .doc(data.token);
  const publicRef = db.collection('schedulerLinkTokens').doc(data.token);
  const [linkSnap, publicSnap] = await Promise.all([linkRef.get(), publicRef.get()]);
  // Both halves must exist and the public token must belong to this org.
  if (!linkSnap.exists || !publicSnap.exists || publicSnap.data()?.organization_id !== data.organizationId) {
    throw new HttpsError('not-found', t('link_not_found'));
  }

  const now = admin.firestore.Timestamp.now();
  const mirrorUpdate: Record<string, unknown> = { updated_at: now };
  const publicUpdate: Record<string, unknown> = {};

  if ('treatmentId' in data) {
    const treatmentId = typeof data.treatmentId === 'string' && data.treatmentId ? data.treatmentId : null;
    if (treatmentId) {
      const tSnap = await db
        .collection('organizations')
        .doc(data.organizationId)
        .collection('treatments')
        .doc(treatmentId)
        .get();
      if (!tSnap.exists) throw new HttpsError('not-found', t('treatment_not_found'));
    }
    mirrorUpdate.treatment_id = treatmentId;
    publicUpdate.treatment_id = treatmentId;
  }

  if ('label' in data) {
    mirrorUpdate.label = typeof data.label === 'string' && data.label.trim() ? data.label.trim().slice(0, 80) : null;
  }

  if ('expiresAtIso' in data) {
    let expiresAt: admin.firestore.Timestamp | null = null;
    if (data.expiresAtIso !== null) {
      const parsed = new Date(String(data.expiresAtIso));
      if (Number.isNaN(parsed.getTime())) throw new HttpsError('invalid-argument', t('invalid_expiry'));
      expiresAt = admin.firestore.Timestamp.fromDate(parsed);
    }
    mirrorUpdate.expires_at = expiresAt;
    publicUpdate.expires_at = expiresAt;
  }

  if (typeof data.isActive === 'boolean') {
    mirrorUpdate.is_active = data.isActive;
    mirrorUpdate.revoked_at = data.isActive ? null : now;
    publicUpdate.is_active = data.isActive;
  }

  const batch = db.batch();
  batch.update(linkRef, mirrorUpdate);
  if (Object.keys(publicUpdate).length > 0) batch.update(publicRef, publicUpdate);
  await batch.commit();

  return { success: true };
});

export const revokeSchedulerLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

  const { organizationId, token } = request.data as { organizationId: string; token: string };
  const t = await resolveT(request.auth.uid);
  if (!organizationId || !token) {
    throw new HttpsError('invalid-argument', t('org_token_required'));
  }

  await assertAdmin(request.auth.uid, organizationId, t);

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

/**
 * Permanently removes a scheduler link. Both the top-level public-lookup doc
 * and the per-org admin mirror are deleted. To prevent admins from accidentally
 * killing a working URL, deletion is only allowed once the link is already
 * inactive — either revoked (is_active === false on the mirror) or expired
 * (expires_at < now). Active links must be revoked first.
 */
export const deleteSchedulerLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

  const { organizationId, token } = request.data as { organizationId: string; token: string };
  const t = await resolveT(request.auth.uid);
  if (!organizationId || !token) {
    throw new HttpsError('invalid-argument', t('org_token_required'));
  }

  await assertAdmin(request.auth.uid, organizationId, t);

  const linkRef = db
    .collection('organizations')
    .doc(organizationId)
    .collection('schedulerLinks')
    .doc(token);
  const linkSnap = await linkRef.get();
  if (!linkSnap.exists) {
    throw new HttpsError('not-found', t('link_not_found'));
  }

  const linkData = linkSnap.data() ?? {};
  const isActive = linkData.is_active !== false;
  const expiresAt = linkData.expires_at?.toDate?.();
  const isExpired = expiresAt && expiresAt < new Date();

  if (isActive && !isExpired) {
    throw new HttpsError(
      'failed-precondition',
      t('active_must_revoke'),
    );
  }

  const batch = db.batch();
  batch.delete(db.collection('schedulerLinkTokens').doc(token));
  batch.delete(linkRef);
  await batch.commit();

  return { success: true };
});
