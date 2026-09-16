import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from '../rateLimit';
import {
  DEFAULT_LANGUAGE,
  defineStrings,
  getOrgLanguage,
  isAppLanguage,
  makeT,
  orgLanguageFromData,
  type AppLanguage,
} from '../lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Fallback display names returned to the public booking page / stored on the
// booking request, plus every HttpsError message a visitor can see. These are
// PUBLIC callables, so errors are produced in the visitor's language:
// request.data.lang when valid, else the link's org language, else 'en'.
// English wording is byte-identical to the previous hard-coded messages.
const STRINGS = defineStrings({
  en: {
    treatmentFallback: 'Treatment',
    staffFallback: 'Staff',
    errInvalidToken: 'Invalid token format',
    errLinkNotFound: 'Link not found',
    errLinkInactive: 'Link is no longer active',
    errLinkExpired: 'Link has expired',
    errMissingFields: 'Missing required fields',
    errInvalidDateTime: 'Invalid date or time format',
    errNameRequired: 'Name required',
    errContactRequired: 'Provide an email or phone number',
    errInvalidEmail: 'Invalid email address',
    errInvalidPhone: 'Invalid phone number',
    errTreatmentRequired: 'Treatment is required for this link',
    errTreatmentNotFound: 'Treatment not found',
    errTreatmentInactive: 'Treatment is inactive',
  },
  he: {
    treatmentFallback: 'טיפול',
    staffFallback: 'איש/אשת צוות',
    errInvalidToken: 'פורמט אסימון לא תקין',
    errLinkNotFound: 'הקישור לא נמצא',
    errLinkInactive: 'הקישור אינו פעיל עוד',
    errLinkExpired: 'תוקף הקישור פג',
    errMissingFields: 'חסרים שדות חובה',
    errInvalidDateTime: 'פורמט תאריך או שעה לא תקין',
    errNameRequired: 'יש להזין שם',
    errContactRequired: 'יש לספק כתובת אימייל או מספר טלפון',
    errInvalidEmail: 'כתובת אימייל לא תקינה',
    errInvalidPhone: 'מספר טלפון לא תקין',
    errTreatmentRequired: 'יש לבחור טיפול עבור קישור זה',
    errTreatmentNotFound: 'הטיפול לא נמצא',
    errTreatmentInactive: 'הטיפול אינו פעיל',
  },
});

/** Language for errors thrown before the org is known: request.data.lang ?? 'en'. */
const requestLanguage = (lang: unknown): AppLanguage | null => (isAppLanguage(lang) ? lang : null);

interface ResolveRequest {
  token: string;
  lang?: string;                 // Visitor's active UI language ('en' | 'he')
}

interface SubmitRequest {
  token: string;
  treatmentId?: string;          // Required when the link isn't pre-scoped to a treatment
  staffId?: string;              // Optional; ignored if the link pre-scopes staff
  date: string;                  // YYYY-MM-DD
  time: string;                  // HH:MM
  client: {
    name: string;
    email?: string;
    phone?: string;
  };
  notes?: string;
  lang?: string;                 // Visitor's active UI language ('en' | 'he')
}

// The org isn't known until the token resolves, so these errors use the
// visitor's requested language (falling back to 'en').
const requireActiveToken = async (token: string, lang: AppLanguage = DEFAULT_LANGUAGE) => {
  const tr = makeT(STRINGS, lang);
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    throw new HttpsError('invalid-argument', tr('errInvalidToken'));
  }
  const tokenSnap = await db.collection('schedulerLinkTokens').doc(token).get();
  if (!tokenSnap.exists) throw new HttpsError('not-found', tr('errLinkNotFound'));
  const data = tokenSnap.data() ?? {};
  if (data.is_active === false) throw new HttpsError('failed-precondition', tr('errLinkInactive'));
  const expiresAt = data.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    throw new HttpsError('failed-precondition', tr('errLinkExpired'));
  }
  return data;
};

/**
 * Unauthenticated. Given a token, returns enough information for the public
 * booking page to render: sanitized org branding, available treatments, and
 * staff list. Treatment/staff are scoped to the token if the admin pre-selected
 * them at link creation time.
 */
export const resolveSchedulerLink = onCall(async (request) => {
  const { token, lang: requestedLang } = (request.data ?? {}) as ResolveRequest;
  const preOrgLang = requestLanguage(requestedLang) ?? DEFAULT_LANGUAGE;
  const tokenData = await requireActiveToken(token, preOrgLang);
  const orgId = tokenData.organization_id as string;
  const scopedTreatmentId = tokenData.treatment_id as string | null;
  const scopedStaffId = tokenData.staff_id as string | null;

  // Org branding (limited fields)
  const orgSnap = await db.collection('organizations').doc(orgId).get();
  const orgData = orgSnap.data() ?? {};
  const businessInfoSnap = await db.collection('organizations').doc(orgId).collection('config').doc('businessInfo').get();
  const businessInfo = businessInfoSnap.data() ?? {};

  // Org language — returned to the page (so it can render in Hebrew/RTL).
  // Fallback display names below follow the visitor's requested language
  // first, then the org language.
  const lang = orgLanguageFromData(orgData);
  const tr = makeT(STRINGS, requestLanguage(requestedLang) ?? lang);

  // Treatments
  let treatmentsList: Array<{ id: string; name: string; duration: number; price?: number; staff_ids?: string[] }> = [];
  if (scopedTreatmentId) {
    const tSnap = await db.collection('organizations').doc(orgId).collection('treatments').doc(scopedTreatmentId).get();
    if (tSnap.exists && tSnap.data()?.is_active !== false) {
      const t = tSnap.data() ?? {};
      treatmentsList = [{
        id: tSnap.id,
        name: t.name ?? tr('treatmentFallback'),
        duration: typeof t.duration === 'number' ? t.duration : 60,
        price: typeof t.price === 'number' ? t.price : undefined,
        staff_ids: Array.isArray(t.staff_ids) ? t.staff_ids : undefined,
      }];
    }
  } else {
    const tSnap = await db
      .collection('organizations')
      .doc(orgId)
      .collection('treatments')
      .where('is_active', '==', true)
      .get();
    treatmentsList = tSnap.docs.map(d => {
      const t = d.data();
      return {
        id: d.id,
        name: t.name ?? tr('treatmentFallback'),
        duration: typeof t.duration === 'number' ? t.duration : 60,
        price: typeof t.price === 'number' ? t.price : undefined,
        staff_ids: Array.isArray(t.staff_ids) ? t.staff_ids : undefined,
      };
    });
  }

  // Staff (used when treatment doesn't pre-scope staff and the visitor needs to pick)
  let staffList: Array<{ id: string; name: string }> = [];
  if (scopedStaffId) {
    const sSnap = await db.collection('users').doc(scopedStaffId).get();
    if (sSnap.exists) {
      staffList = [{
        id: sSnap.id,
        name: sSnap.data()?.fullName ?? sSnap.data()?.email ?? tr('staffFallback'),
      }];
    }
  } else {
    const usersSnap = await db
      .collection('users')
      .where('organizationId', '==', orgId)
      .where('isActive', '==', true)
      .get();
    staffList = usersSnap.docs
      .filter(d => ['staff', 'admin', 'beautician'].includes(d.data()?.role))
      .map(d => ({
        id: d.id,
        name: d.data()?.fullName ?? d.data()?.email ?? tr('staffFallback'),
      }));
  }

  return {
    organization: {
      id: orgId,
      name: orgData.name ?? 'Beauty Hub Pro',
      logo_url: orgData.logo_url ?? null,
      timezone: orgData.timezone ?? 'UTC',
      // Org display language ('en' | 'he'); PublicBookingPage reads it from
      // organization.language ?? business_info.language.
      language: lang,
    },
    business_info: {
      name: businessInfo.name ?? orgData.name ?? null,
      address: businessInfo.address ?? null,
      phone: businessInfo.phone ?? null,
      slot_interval_minutes: typeof businessInfo.slot_interval_minutes === 'number'
        ? businessInfo.slot_interval_minutes
        : null,
      language: lang,
    },
    scoped_treatment_id: scopedTreatmentId,
    scoped_staff_id: scopedStaffId,
    treatments: treatmentsList,
    staff: staffList,
  };
});

const HHMM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s\-()]{5,30}$/;

/**
 * Unauthenticated. Records a public booking request gated by a scheduler-link
 * token. Writes a `bookingRequests` doc with source='public_link' that staff
 * approve via the existing BookingRequestsPanel flow.
 */
export const submitPublicBookingRequest = onCall(async (request) => {
  const data = (request.data ?? {}) as SubmitRequest;
  // Validation runs before the token/org is known → visitor's language or 'en'.
  const requestedLang = requestLanguage(data?.lang);
  let tr = makeT(STRINGS, requestedLang ?? DEFAULT_LANGUAGE);
  if (!data?.token || !data?.date || !data?.time || !data?.client?.name) {
    throw new HttpsError('invalid-argument', tr('errMissingFields'));
  }
  if (!YMD.test(data.date) || !HHMM.test(data.time)) {
    throw new HttpsError('invalid-argument', tr('errInvalidDateTime'));
  }
  const client = {
    name: String(data.client.name).slice(0, 120).trim(),
    email: data.client.email ? String(data.client.email).trim() : '',
    phone: data.client.phone ? String(data.client.phone).trim() : '',
  };
  if (!client.name) throw new HttpsError('invalid-argument', tr('errNameRequired'));
  if (!client.email && !client.phone) {
    throw new HttpsError('invalid-argument', tr('errContactRequired'));
  }
  if (client.email && !EMAIL.test(client.email)) {
    throw new HttpsError('invalid-argument', tr('errInvalidEmail'));
  }
  if (client.phone && !PHONE.test(client.phone)) {
    throw new HttpsError('invalid-argument', tr('errInvalidPhone'));
  }

  const tokenData = await requireActiveToken(data.token, requestedLang ?? DEFAULT_LANGUAGE);
  const orgId = tokenData.organization_id as string;
  // Org is known now: visitor language → org language → 'en'. This is a new
  // (60s-cached) read introduced by the i18n pass — it is what lets the
  // treatment-name fallback snapshotted below match the org-language emails.
  const orgLang = await getOrgLanguage(orgId);
  const lang = requestedLang ?? orgLang;
  tr = makeT(STRINGS, lang);
  const treatmentId = (tokenData.treatment_id as string | null) ?? data.treatmentId;
  if (!treatmentId) throw new HttpsError('invalid-argument', tr('errTreatmentRequired'));
  // Token-scoped staff is admin-set and trusted. A visitor-supplied staffId is
  // attacker input — only honor it if the user actually belongs to this org and
  // holds an active staff role; otherwise drop it (treat as unassigned) rather
  // than persisting/booking against an arbitrary uid.
  const scopedStaffId = (tokenData.staff_id as string | null) ?? null;
  let staffId: string | null = scopedStaffId;
  if (!staffId && data.staffId) {
    const candidateSnap = await db.collection('users').doc(String(data.staffId)).get();
    const candidate = candidateSnap.data();
    if (
      candidateSnap.exists &&
      candidate?.organizationId === orgId &&
      candidate?.isActive !== false &&
      ['staff', 'admin', 'beautician'].includes(candidate?.role)
    ) {
      staffId = candidateSnap.id;
    }
  }

  await consumeRateLimit(orgId, 'publicBookingRequest', 100);

  // Load treatment for snapshot fields (name + duration + buffers)
  const tSnap = await db.collection('organizations').doc(orgId).collection('treatments').doc(treatmentId).get();
  if (!tSnap.exists) throw new HttpsError('not-found', tr('errTreatmentNotFound'));
  const t = tSnap.data() ?? {};
  if (t.is_active === false) throw new HttpsError('failed-precondition', tr('errTreatmentInactive'));
  // Snapshot name in the org's language — it's echoed in the ack/admin emails.
  const treatmentName = (t.name as string) ?? makeT(STRINGS, orgLang)('treatmentFallback');
  const duration = typeof t.duration === 'number' ? t.duration : 60;

  let staffName: string | null = null;
  if (staffId) {
    const sSnap = await db.collection('users').doc(staffId).get();
    if (sSnap.exists) {
      staffName = (sSnap.data()?.fullName as string) ?? (sSnap.data()?.email as string) ?? null;
    }
  }

  const requestRef = await db
    .collection('organizations')
    .doc(orgId)
    .collection('bookingRequests')
    .add({
      organization_id: orgId,
      client_id: null,                         // Public visitor — not a registered client yet
      client_name: client.name,
      client_email: client.email || null,
      client_phone: client.phone || null,
      purchase_id: null,
      package_id: null,
      treatment_id: treatmentId,
      treatment_name: treatmentName,
      duration,
      staff_id: staffId,
      staff_name: staffName,
      preferred_slot: staffId
        ? { date: data.date, time: data.time, staff_id: staffId }
        : { date: data.date, time: data.time },
      alternative_slots: [],
      notes: data.notes ? String(data.notes).slice(0, 500) : null,
      // Snapshot buffers for the overlap check during approval
      buffer_before_minutes: typeof t.buffer_before_minutes === 'number' ? t.buffer_before_minutes : 0,
      buffer_after_minutes: typeof t.buffer_after_minutes === 'number' ? t.buffer_after_minutes : 0,
      status: 'pending',
      source: 'public_link',
      source_token: data.token,
      // Language the visitor used on the booking page ('en' | 'he'), so a
      // visitor-facing ack can follow it instead of the org default. Same
      // convention as clientWaivers.language. Staff-side surfaces ignore it.
      language: lang,
      created_by_uid: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { bookingRequestId: requestRef.id };
});
