import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { generateSlots, generateMergedSlots } from '../lib/scheduling/availability';
import type {
  BusinessHoursDay,
  ExistingAppointment,
  SchedulingConfigForScheduling,
  StaffAvailabilityDoc,
  StaffForScheduling,
  TreatmentForScheduling,
} from '../lib/scheduling/types';
import { consumeRateLimit } from '../rateLimit';
import {
  DEFAULT_LANGUAGE,
  defineStrings,
  getOrgLanguage,
  isAppLanguage,
  makeT,
  type AppLanguage,
} from '../lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Fallback staff display name shown in the portal / public slot picker when a
// user has neither fullName nor email, plus every HttpsError message a visitor
// can see. Language: request.data.lang when valid, else the org language, else
// 'en'. Errors thrown before the org is known use request.data.lang ?? 'en'.
// English wording is byte-identical to the previous hard-coded messages.
const STRINGS = defineStrings({
  en: {
    staffFallback: 'Staff',
    errMissingFields: 'Missing required fields',
    errDateFormat: 'Dates must be YYYY-MM-DD',
    errDateRange: 'Date range must be 1–{{max}} days',
    errLinkNotFound: 'Link not found',
    errLinkInactive: 'Link is no longer active',
    errLinkExpired: 'Link has expired',
    errTreatmentUnscoped: 'Treatment must be specified for unscoped links',
    errAuthRequired: 'Authentication required',
    errOrgTreatmentRequired: 'organizationId and treatmentId are required',
    errNotMember: 'Not a member of this organization',
    errTreatmentNotFound: 'Treatment not found',
    errTreatmentInactive: 'Treatment is inactive',
  },
  he: {
    staffFallback: 'איש/אשת צוות',
    errMissingFields: 'חסרים שדות חובה',
    errDateFormat: 'התאריכים חייבים להיות בפורמט YYYY-MM-DD',
    errDateRange: 'טווח התאריכים חייב להיות בין 1 ל-{{max}} ימים',
    errLinkNotFound: 'הקישור לא נמצא',
    errLinkInactive: 'הקישור אינו פעיל עוד',
    errLinkExpired: 'תוקף הקישור פג',
    errTreatmentUnscoped: 'יש לציין טיפול עבור קישורים שאינם מוגדרים לטיפול',
    errAuthRequired: 'נדרשת התחברות',
    errOrgTreatmentRequired: 'נדרשים organizationId ו-treatmentId',
    errNotMember: 'אינך חבר/ה בארגון זה',
    errTreatmentNotFound: 'הטיפול לא נמצא',
    errTreatmentInactive: 'הטיפול אינו פעיל',
  },
});

const requestLanguage = (lang: unknown): AppLanguage | null => (isAppLanguage(lang) ? lang : null);

interface GetAvailableSlotsRequest {
  organizationId?: string;
  treatmentId?: string;
  staffId?: string;
  fromDate: string;            // YYYY-MM-DD
  toDate: string;              // YYYY-MM-DD
  merge?: boolean;             // If true, returns one entry per time with all available staff
  // When present, bypasses auth and reads org/treatment/staff from the token.
  // Public booking page uses this; staff CRM uses the auth path.
  linkToken?: string;
  // Caller's active UI language ('en' | 'he'); used for visitor-facing errors.
  lang?: string;
}

// 42 = a full 6-week month grid, so the public booking calendar can load a
// whole month in one call (one rate-limit unit instead of three).
const MAX_DATE_RANGE_DAYS = 42;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const datesInRange = (from: string, to: string): string[] => {
  const dates: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(isoDate(cursor));
  }
  return dates;
};

/**
 * Returns available slots for a treatment over a date range.
 * Used by the client portal slot picker and the public scheduler links page.
 * Reads through the Admin SDK so portal/public callers don't need Firestore
 * read access to staff availability + appointments.
 */
export const getAvailableSlots = onCall(async (request) => {
  const data = (request.data ?? {}) as GetAvailableSlotsRequest;
  // Org isn't known yet → visitor's requested language or 'en'.
  const requestedLang = requestLanguage(data.lang);
  let t = makeT(STRINGS, requestedLang ?? DEFAULT_LANGUAGE);
  if (!data.fromDate || !data.toDate) {
    throw new HttpsError('invalid-argument', t('errMissingFields'));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(data.toDate)) {
    throw new HttpsError('invalid-argument', t('errDateFormat'));
  }

  const dates = datesInRange(data.fromDate, data.toDate);
  if (dates.length === 0 || dates.length > MAX_DATE_RANGE_DAYS) {
    throw new HttpsError('invalid-argument', t('errDateRange', { max: MAX_DATE_RANGE_DAYS }));
  }

  // Two paths:
  //   1. linkToken provided → public/unauthenticated path (token-gated).
  //   2. otherwise → authenticated path; caller must belong to the org or have portal access.
  let resolvedOrgId = '';
  let resolvedTreatmentId = '';
  let resolvedStaffId: string | undefined = data.staffId;
  // Public path only: whether the visitor is allowed to see/pick individual
  // staff. Off by default so an anonymous caller can't enumerate the org's
  // named roster or reconstruct each staff member's free/busy schedule.
  let isPublicPath = false;
  let allowStaffSelection = false;
  // Authenticated STAFF caller's own language preference (users/{uid}.language),
  // per the lib/i18n.ts contract for errors shown to signed-in staff. Stays null
  // for public visitors and portal clients, who get the org language instead.
  let staffCallerLang: AppLanguage | null = null;

  if (data.linkToken) {
    isPublicPath = true;
    const tokenSnap = await db.collection('schedulerLinkTokens').doc(data.linkToken).get();
    if (!tokenSnap.exists) throw new HttpsError('not-found', t('errLinkNotFound'));
    const tokenData = tokenSnap.data() ?? {};
    if (tokenData.is_active === false) throw new HttpsError('failed-precondition', t('errLinkInactive'));
    const expiresAt = tokenData.expires_at?.toDate?.();
    if (expiresAt && expiresAt < new Date()) {
      throw new HttpsError('failed-precondition', t('errLinkExpired'));
    }
    resolvedOrgId = tokenData.organization_id;
    // Token-scoped treatment/staff take precedence; otherwise accept from request.
    resolvedTreatmentId =
      tokenData.treatment_id || (typeof data.treatmentId === 'string' ? data.treatmentId : '');
    if (tokenData.staff_id) resolvedStaffId = tokenData.staff_id;
    if (!resolvedOrgId || !resolvedTreatmentId) {
      throw new HttpsError('invalid-argument', t('errTreatmentUnscoped'));
    }
    // A link pre-scoped to one staff already commits the visitor to that
    // staff, so exposing that single id is intentional. Otherwise the named
    // roster stays hidden unless the admin explicitly enabled staff selection.
    allowStaffSelection = tokenData.allow_staff_selection === true || Boolean(tokenData.staff_id);
  } else {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', t('errAuthRequired'));
    }
    // Read org + treatment from the request payload, then verify the caller
    // is allowed to query that org. Prior to this, both were initialized to
    // '' and the next check always threw — silently breaking the authenticated
    // slot picker for the staff CRM and the client portal.
    resolvedOrgId = data.organizationId ?? '';
    resolvedTreatmentId = data.treatmentId ?? '';
    if (!resolvedOrgId || !resolvedTreatmentId) {
      throw new HttpsError('invalid-argument', t('errOrgTreatmentRequired'));
    }

    const callerUid = request.auth.uid;
    const callerUserSnap = await db.collection('users').doc(callerUid).get();
    const callerOrgId = callerUserSnap.data()?.organizationId;
    if (callerOrgId === resolvedOrgId) {
      // Staff CRM caller — reuse the users/{uid} doc already loaded (same
      // resolution as getCallerLanguage, minus the second read).
      staffCallerLang = requestLanguage(callerUserSnap.data()?.language);
    } else {
      const portalSnap = await db
        .collection('clientPortalAccess')
        .doc(callerUid)
        .collection('organizations')
        .doc(resolvedOrgId)
        .get();
      if (!portalSnap.exists) {
        throw new HttpsError('permission-denied', t('errNotMember'));
      }
    }
  }

  // Soft per-org rate limit — reads only, no external cost, but prevents scraping.
  await consumeRateLimit(resolvedOrgId, 'getAvailableSlots', 1000);

  // Org is known now. Public visitors + portal clients: request lang → org
  // language (60s cached read) → 'en'. Staff CRM callers: request lang → their
  // users/{uid}.language → org language → 'en'. Used for the remaining errors
  // and fallback labels.
  t = makeT(STRINGS, requestedLang ?? staffCallerLang ?? (await getOrgLanguage(resolvedOrgId)));

  // Load treatment
  const treatmentSnap = await db
    .collection('organizations')
    .doc(resolvedOrgId)
    .collection('treatments')
    .doc(resolvedTreatmentId)
    .get();
  if (!treatmentSnap.exists) {
    throw new HttpsError('not-found', t('errTreatmentNotFound'));
  }
  const treatmentData = treatmentSnap.data() ?? {};
  if (!treatmentData.is_active) {
    throw new HttpsError('failed-precondition', t('errTreatmentInactive'));
  }
  const treatment: TreatmentForScheduling = {
    id: resolvedTreatmentId,
    duration: typeof treatmentData.duration === 'number' ? treatmentData.duration : 60,
    buffer_before_minutes: treatmentData.buffer_before_minutes,
    buffer_after_minutes: treatmentData.buffer_after_minutes,
    advance_min_hours: treatmentData.advance_min_hours,
    advance_max_days: treatmentData.advance_max_days,
    staff_ids: Array.isArray(treatmentData.staff_ids) ? treatmentData.staff_ids : undefined,
    availability: Array.isArray(treatmentData.availability) ? treatmentData.availability : undefined,
  };

  // Load business hours
  const bhSnap = await db
    .collection('organizations')
    .doc(resolvedOrgId)
    .collection('businessHours')
    .get();
  const businessHours: BusinessHoursDay[] = bhSnap.docs.map(d => {
    const docData = d.data();
    return {
      day_of_week: typeof docData.day_of_week === 'number' ? docData.day_of_week : 0,
      is_open: !!docData.is_open,
      open_time: typeof docData.open_time === 'string' ? docData.open_time : null,
      close_time: typeof docData.close_time === 'string' ? docData.close_time : null,
    };
  });

  // Load legacy scheduling configs (they narrow within business hours)
  const scSnap = await db
    .collection('organizations')
    .doc(resolvedOrgId)
    .collection('schedulingConfig')
    .get();
  const schedulingConfigs: SchedulingConfigForScheduling[] = scSnap.docs
    .map(d => {
      const docData = d.data();
      return {
        day_of_week: typeof docData.day_of_week === 'number' ? docData.day_of_week : -1,
        start_time: typeof docData.start_time === 'string' ? docData.start_time : '',
        end_time: typeof docData.end_time === 'string' ? docData.end_time : '',
        staff_ids: Array.isArray(docData.staff_ids) ? docData.staff_ids : undefined,
        is_active: docData.is_active !== false,
      };
    })
    .filter(c => c.day_of_week >= 0 && c.start_time && c.end_time);

  // Load org-wide slot interval (from config/businessInfo)
  const businessInfoSnap = await db
    .collection('organizations')
    .doc(resolvedOrgId)
    .collection('config')
    .doc('businessInfo')
    .get();
  const slotIntervalMinutes =
    typeof businessInfoSnap.data()?.slot_interval_minutes === 'number'
      ? (businessInfoSnap.data()?.slot_interval_minutes as number)
      : undefined;

  // Resolve candidate staff
  let candidateStaffIds: string[] = [];
  if (resolvedStaffId) {
    candidateStaffIds = [resolvedStaffId];
  } else if (treatment.staff_ids && treatment.staff_ids.length > 0) {
    candidateStaffIds = treatment.staff_ids;
  } else {
    // Fall back to all active staff users in the org
    const usersSnap = await db
      .collection('users')
      .where('organizationId', '==', resolvedOrgId)
      .where('isActive', '==', true)
      .get();
    candidateStaffIds = usersSnap.docs
      .filter(d => ['staff', 'admin', 'beautician'].includes(d.data()?.role))
      .map(d => d.id);
  }

  if (candidateStaffIds.length === 0) {
    return { slotsByDate: Object.fromEntries(dates.map(d => [d, []])) };
  }

  // Load staff names + availability for each candidate
  const staffList: StaffForScheduling[] = await Promise.all(
    candidateStaffIds.map(async (sid) => {
      const userDoc = await db.collection('users').doc(sid).get();
      const availSnap = await db
        .collection('organizations')
        .doc(resolvedOrgId)
        .collection('staffSchedules')
        .doc(sid)
        .collection('availability')
        .get();
      const availability: StaffAvailabilityDoc[] = [];
      availSnap.forEach(d => {
        const docData = d.data();
        if (docData.type === 'weekly' && typeof docData.day_of_week === 'number') {
          availability.push({
            type: 'weekly',
            day_of_week: docData.day_of_week,
            start_time: docData.start_time ?? '09:00',
            end_time: docData.end_time ?? '18:00',
            is_active: docData.is_active !== false,
          });
        } else if (docData.type === 'override' && typeof docData.date === 'string') {
          availability.push({
            type: 'override',
            date: docData.date,
            start_time: docData.start_time,
            end_time: docData.end_time,
            is_active: docData.is_active !== false,
          });
        }
      });
      return {
        id: sid,
        name: userDoc.data()?.fullName ?? userDoc.data()?.email ?? t('staffFallback'),
        availability,
      };
    })
  );

  // Load existing appointments across the date range for the candidate staff
  const apptSnap = await db
    .collection('organizations')
    .doc(resolvedOrgId)
    .collection('appointments')
    .where('appointment_date', '>=', data.fromDate)
    .where('appointment_date', '<=', data.toDate)
    .get();
  const existingAppointments: ExistingAppointment[] = apptSnap.docs
    .map(d => {
      const docData = d.data();
      return {
        staff_id: docData.staff_id,
        appointment_date: docData.appointment_date,
        appointment_time: docData.appointment_time,
        duration: typeof docData.duration === 'number' ? docData.duration : 60,
        buffer_before_minutes: docData.buffer_before_minutes,
        buffer_after_minutes: docData.buffer_after_minutes,
        status: docData.status ?? 'scheduled',
      };
    })
    .filter(a => candidateStaffIds.includes(a.staff_id ?? ''));

  // Compute per-date slots.
  //
  // The unauthenticated public path never returns the named per-staff roster
  // (generateSlots' { staff_id, staff_name } shape) — an anonymous caller could
  // otherwise enumerate every staff member and reconstruct their free/busy
  // schedule by flipping `merge: false`. Public callers always get merged
  // time-only slots, and the available_staff_ids are stripped unless the admin
  // explicitly enabled staff selection on the link. The authenticated/admin and
  // portal path is unchanged and still honors `merge`.
  const useMerged = isPublicPath ? true : Boolean(data.merge);
  const stripStaffIds = isPublicPath && !allowStaffSelection;

  const nowIso = new Date().toISOString();
  const slotsByDate: Record<string, unknown> = {};
  for (const date of dates) {
    const input = {
      date,
      treatment,
      staffList,
      existingAppointments,
      businessHours,
      schedulingConfigs,
      slotIntervalMinutes,
      nowIso,
    };
    if (useMerged) {
      const merged = generateMergedSlots(input);
      slotsByDate[date] = stripStaffIds
        ? merged.map((s) => ({ time: s.time, available_staff_ids: [] as string[] }))
        : merged;
    } else {
      slotsByDate[date] = generateSlots(input);
    }
  }

  return { slotsByDate };
});
