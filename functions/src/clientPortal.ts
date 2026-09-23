import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from './rateLimit';
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  getActiveEmailAutomation,
  isValidEmail,
  renderAndSend,
  resolveEmailContext,
} from './scheduling/bookingEmailSend';
import {
  defineStrings,
  makeT,
  normalizeLanguage,
  getOrgLanguage,
  orgLanguageFromData,
  Translator,
} from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// User-facing copy shown in portal / staff toasts, sent to clients, or persisted
// as display names. The portal (ClientPortal.tsx) and the staff
// BookingRequestsPanel render `error.message` verbatim, so the precondition and
// permission HttpsErrors below are end-user copy and follow the org language.
// Argument-shape errors (invalid slot format, missing ids, bad action) are
// localized the same way. The `unauthenticated` error is the one exception: it
// is thrown before any Firestore read (so an anonymous caller can never trigger
// an org-doc lookup with an arbitrary orgId) and therefore stays English, the
// same convention every staff callable in this codebase follows.
const STRINGS = defineStrings({
  en: {
    visitor_fallback: 'there',
    treatment_fallback: 'your appointment',
    // Persisted display names (bookingRequests.treatment_name / appointments.staff_name)
    staff_fallback: 'Staff',
    treatment_name_fallback: 'Treatment',
    // Portal-facing errors
    err_portal_not_linked: 'Client portal access has not been linked',
    err_verified_contact_required: 'A verified email or phone number is required. Sign in with Google or verify your phone number, then try linking again.',
    err_ambiguous_match: 'Multiple client records share this contact information, so we cannot link your account automatically. Please contact the spa front desk to have your account linked.',
    err_no_matching_client: 'No matching client card was found for this spa',
    err_client_not_active: 'This client card is not active',
    err_client_not_found: 'Client not found',
    err_purchase_not_found: 'Package purchase not found',
    err_purchase_not_owned: 'Purchase does not belong to this client',
    err_package_not_active: 'Package is not active',
    err_package_expired: 'Package is expired',
    err_no_sessions_for_treatment: 'No remaining sessions for this treatment',
    err_no_sessions: 'No remaining package sessions',
    err_treatment_not_found: 'Treatment not found',
    err_treatment_not_in_package: 'Treatment is not included in this package',
    err_slot_invalid: 'Invalid requested slot',
    err_slot_in_past: 'Requested slot must be in the future',
    err_slot_unavailable: 'Requested slot is no longer available',
    err_one_addon_only: 'Package sessions are limited to one add-on',
    err_addon_not_found: 'Add-on {{addon}} not found',
    err_addon_unavailable: 'Add-on {{addon}} is no longer available',
    // Staff-facing errors (BookingRequestsPanel)
    err_user_profile_not_found: 'User profile not found',
    err_staff_access_required: 'Staff access required',
    err_booking_not_found: 'Booking request not found',
    err_booking_already_reviewed: 'Booking request has already been reviewed',
    err_package_no_longer_active: 'Package is no longer active',
    err_assign_staff_first: 'Assign a staff member before approving the request',
    // Argument-shape errors
    err_date_format: 'Date must be YYYY-MM-DD',
    err_time_format: 'Time must be HH:mm',
    err_field_required: '{{field}} is required',
    err_action_invalid: 'action must be approve or reject',
    // Renewal requests
    err_package_not_found: 'Package not found',
    err_renewal_pending_exists: 'A renewal request for this package is already open',
    err_renewal_not_found: 'Renewal request not found',
    err_renewal_already_reviewed: 'Renewal request has already been handled',
    err_renewal_action_invalid: 'action must be contacted or dismissed',
  },
  he: {
    visitor_fallback: 'לקוח/ה יקר/ה',
    treatment_fallback: 'התור שלך',
    staff_fallback: 'איש צוות',
    treatment_name_fallback: 'טיפול',
    err_portal_not_linked: 'הגישה לפורטל הלקוחות עדיין לא קושרה לכרטיס לקוח',
    err_verified_contact_required: 'נדרש אימייל או מספר טלפון מאומתים. יש להתחבר עם Google או לאמת את מספר הטלפון, ואז לנסות לקשר שוב.',
    err_ambiguous_match: 'כמה כרטיסי לקוח משתמשים באותם פרטי קשר, ולכן לא ניתן לקשר את החשבון אוטומטית. נא לפנות לקבלה כדי שיקשרו את החשבון.',
    err_no_matching_client: 'לא נמצא כרטיס לקוח תואם בעסק זה',
    err_client_not_active: 'כרטיס הלקוח הזה אינו פעיל',
    err_client_not_found: 'הלקוח לא נמצא',
    err_purchase_not_found: 'רכישת החבילה לא נמצאה',
    err_purchase_not_owned: 'הרכישה אינה שייכת ללקוח זה',
    err_package_not_active: 'החבילה אינה פעילה',
    err_package_expired: 'תוקף החבילה פג',
    err_no_sessions_for_treatment: 'לא נותרו טיפולים מסוג זה בחבילה',
    err_no_sessions: 'לא נותרו טיפולים בחבילה',
    err_treatment_not_found: 'הטיפול לא נמצא',
    err_treatment_not_in_package: 'הטיפול אינו כלול בחבילה זו',
    err_slot_invalid: 'מועד התור המבוקש אינו תקין',
    err_slot_in_past: 'מועד התור המבוקש חייב להיות בעתיד',
    err_slot_unavailable: 'מועד התור המבוקש כבר אינו פנוי',
    err_one_addon_only: 'בטיפול מחבילה ניתן להוסיף תוספת אחת בלבד',
    err_addon_not_found: 'התוספת {{addon}} לא נמצאה',
    err_addon_unavailable: 'התוספת {{addon}} כבר אינה זמינה',
    err_user_profile_not_found: 'פרופיל המשתמש לא נמצא',
    err_staff_access_required: 'נדרשת הרשאת צוות',
    err_booking_not_found: 'בקשת התור לא נמצאה',
    err_booking_already_reviewed: 'בקשת התור כבר טופלה',
    err_package_no_longer_active: 'החבילה כבר אינה פעילה',
    err_assign_staff_first: 'יש לשבץ איש צוות לפני אישור הבקשה',
    err_date_format: 'התאריך חייב להיות בפורמט YYYY-MM-DD',
    err_time_format: 'השעה חייבת להיות בפורמט HH:mm',
    err_field_required: 'השדה {{field}} הוא שדה חובה',
    err_action_invalid: 'הפעולה חייבת להיות approve או reject',
    err_package_not_found: 'החבילה לא נמצאה',
    err_renewal_pending_exists: 'כבר קיימת בקשת חידוש פתוחה לחבילה זו',
    err_renewal_not_found: 'בקשת החידוש לא נמצאה',
    err_renewal_already_reviewed: 'בקשת החידוש כבר טופלה',
    err_renewal_action_invalid: 'הפעולה חייבת להיות contacted או dismissed',
  },
});

type T = Translator<keyof typeof STRINGS.en>;

/**
 * Stored bookingRequests.staff_name sentinel for "no staff chosen yet". Kept as
 * a fixed, language-independent value so the stored data never depends on the
 * org language. It is internal bookkeeping: no UI renders staff_name today
 * (BookingRequestsPanel only echoes it back as `selectedStaffName`, and
 * approval below replaces the sentinel with the localized staff fallback).
 */
const PENDING_STAFF_NAME = 'Pending assignment';

/**
 * Resolve the org language for a callable. Must only be called AFTER the
 * `request.auth` check so an anonymous caller can never trigger an org-doc read
 * for an arbitrary orgId. Tolerates a missing/invalid org id (falls back to
 * English via getOrgLanguage's own error handling).
 */
async function resolveT(orgIdInput: unknown): Promise<T> {
  const orgId = typeof orgIdInput === 'string' ? orgIdInput.trim() : '';
  const lang = orgId ? await getOrgLanguage(orgId) : 'en';
  return makeT(STRINGS, lang);
}

/**
 * Thrown before any Firestore read, so there is no language source yet; stays
 * English by design (same convention as every staff callable). The portal and
 * staff panel only call these functions once signed in, so this is a defensive
 * message in practice.
 */
const UNAUTHENTICATED = () => new HttpsError('unauthenticated', 'Sign in is required');

type Slot = {
  date: string;
  time: string;
  staff_id?: string;
};

type PortalAccess = {
  organization_id: string;
  client_id: string;
  uid: string;
  matched_by: 'email' | 'phone';
};

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(phone: unknown): string | null {
  if (!phone) return null;
  const normalized = String(phone).replace(/[^\d+]/g, '');
  return normalized || null;
}

/**
 * Countries the portal phone selector offers. Mirror of `normalizePhoneE164`
 * in src/pages/ClientPortal.tsx — keep both in sync so a number the client
 * typed in the portal resolves to the same E.164 string as their client card.
 */
type PhoneCountry = 'IL' | 'US' | 'CA' | 'GB';

const DIAL_CODES: Record<PhoneCountry, string> = { IL: '972', US: '1', CA: '1', GB: '44' };

/**
 * Convert a stored client phone into E.164 for the given default country.
 *  - A leading '+' is honoured as-is (formatting stripped, no re-prefixing).
 *  - IL: local 05X XXXXXXX / 0X XXXXXXX (9–10 digits, leading 0) -> +972 + digits without the 0.
 *  - US/CA: 10 digits -> +1 + digits; 11 digits starting with 1 -> + digits.
 *  - Digits already starting with the country's dial code -> + digits.
 *  - Anything else -> + dial code + digits with any leading 0 stripped.
 * Comparison stays strict equality on the full E.164 string (no suffix matching).
 */
function toE164(phone: unknown, defaultCountry: PhoneCountry): string | null {
  const raw = normalizePhone(phone);
  if (!raw) return null;
  if (raw.startsWith('+')) {
    const d = raw.slice(1).replace(/\D/g, '');
    return d ? `+${d}` : null;
  }
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (defaultCountry === 'IL' && (digits.length === 9 || digits.length === 10) && digits.startsWith('0')) {
    return `+972${digits.slice(1)}`;
  }
  if (defaultCountry === 'US' || defaultCountry === 'CA') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  }

  const dial = DIAL_CODES[defaultCountry];
  if (digits.startsWith(dial) && digits.length > dial.length + 6) {
    return `+${digits}`;
  }
  return `+${dial}${digits.replace(/^0+/, '')}`;
}

/** Recognise the country from a stored phone that already carries a '+' country code. */
function detectPhoneCountry(phone: unknown): PhoneCountry | null {
  const raw = normalizePhone(phone);
  if (!raw || !raw.startsWith('+')) return null;
  const digits = raw.slice(1);
  if (digits.startsWith('972')) return 'IL';
  if (digits.startsWith('44')) return 'GB';
  if (digits.startsWith('1')) return 'US';
  return null;
}

/** Org phone country code wins; otherwise Hebrew orgs default to Israel, everyone else to the US. */
function defaultPhoneCountry(orgData: FirebaseFirestore.DocumentData | undefined): PhoneCountry {
  return detectPhoneCountry(orgData?.phone) ?? (orgLanguageFromData(orgData) === 'he' ? 'IL' : 'US');
}

function assertDate(value: unknown, t: T): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpsError('invalid-argument', t('err_date_format'));
  }
  return value;
}

function assertTime(value: unknown, t: T): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new HttpsError('invalid-argument', t('err_time_format'));
  }
  return value;
}

function assertString(value: unknown, field: string, t: T): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', t('err_field_required', { field }));
  }
  return value.trim();
}

function asSlot(value: unknown, field: string, t: T): Slot {
  const raw = value as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') {
    throw new HttpsError('invalid-argument', t('err_field_required', { field }));
  }
  const slot: Slot = {
    date: assertDate(raw.date, t),
    time: assertTime(raw.time, t),
  };
  if (typeof raw.staff_id === 'string' && raw.staff_id.trim() !== '') {
    slot.staff_id = raw.staff_id.trim();
  }
  return slot;
}

async function getStaffUser(uid: string, orgId: string, t: T) {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', t('err_user_profile_not_found'));
  }

  const user = userSnap.data()!;
  if (user.organizationId !== orgId || !['admin', 'staff', 'reception'].includes(user.role)) {
    throw new HttpsError('permission-denied', t('err_staff_access_required'));
  }

  return user;
}

async function getPortalAccess(uid: string, orgId: string, t: T): Promise<PortalAccess> {
  const accessSnap = await db
    .collection('clientPortalAccess')
    .doc(uid)
    .collection('organizations')
    .doc(orgId)
    .get();

  if (!accessSnap.exists) {
    throw new HttpsError('permission-denied', t('err_portal_not_linked'));
  }

  return accessSnap.data() as PortalAccess;
}

async function getAcuityConfig(orgId: string) {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('acuitySyncConfig')
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

async function assertPurchaseCanBook(
  orgRef: admin.firestore.DocumentReference,
  purchaseId: string,
  clientId: string,
  treatmentId: string,
  t: T,
) {
  const purchaseSnap = await orgRef.collection('purchases').doc(purchaseId).get();
  if (!purchaseSnap.exists) {
    throw new HttpsError('not-found', t('err_purchase_not_found'));
  }

  const purchase = purchaseSnap.data()!;
  const today = new Date().toISOString().slice(0, 10);

  if (purchase.client_id !== clientId) {
    throw new HttpsError('permission-denied', t('err_purchase_not_owned'));
  }
  if (purchase.payment_status !== 'active') {
    throw new HttpsError('failed-precondition', t('err_package_not_active'));
  }
  if (purchase.expiry_date && purchase.expiry_date < today) {
    throw new HttpsError('failed-precondition', t('err_package_expired'));
  }

  const slots = Array.isArray(purchase.sessions_by_treatment)
    ? purchase.sessions_by_treatment as Array<{ treatment_id?: string; remaining?: number }>
    : [];

  if (slots.length > 0) {
    const slot = slots.find((s) => s.treatment_id === treatmentId);
    if (!slot || Number(slot.remaining ?? 0) <= 0) {
      throw new HttpsError('failed-precondition', t('err_no_sessions_for_treatment'));
    }
  } else if (Number(purchase.sessions_remaining ?? 0) <= 0) {
    throw new HttpsError('failed-precondition', t('err_no_sessions'));
  }

  return purchase;
}

async function assertTreatmentCanBook(
  orgRef: admin.firestore.DocumentReference,
  purchase: admin.firestore.DocumentData,
  treatmentId: string,
  t: T,
) {
  const treatmentSnap = await orgRef.collection('treatments').doc(treatmentId).get();
  if (!treatmentSnap.exists) {
    throw new HttpsError('not-found', t('err_treatment_not_found'));
  }

  const pkgSnap = purchase.package_id
    ? await orgRef.collection('packages').doc(purchase.package_id).get()
    : null;
  const pkg = pkgSnap?.exists ? pkgSnap.data()! : {};
  const allowedTreatments = Array.isArray(pkg.treatments) ? pkg.treatments as string[] : [];

  if (allowedTreatments.length > 0 && !allowedTreatments.includes(treatmentId)) {
    throw new HttpsError('failed-precondition', t('err_treatment_not_in_package'));
  }

  return treatmentSnap.data()!;
}

async function assertSlotAvailable(
  orgRef: admin.firestore.DocumentReference,
  slot: Slot,
  duration: number,
  t: T,
) {
  const start = new Date(`${slot.date}T${slot.time}:00`);
  if (Number.isNaN(start.getTime())) {
    throw new HttpsError('invalid-argument', t('err_slot_invalid'));
  }
  if (start.getTime() <= Date.now()) {
    throw new HttpsError('failed-precondition', t('err_slot_in_past'));
  }

  // Conflict check is skipped when no staff is requested — staff selection
  // happens at approval time, and the assigning admin verifies availability then.
  if (!slot.staff_id) return;

  const end = new Date(start.getTime() + duration * 60000);
  const apptSnap = await orgRef
    .collection('appointments')
    .where('appointment_date', '==', slot.date)
    .where('staff_id', '==', slot.staff_id)
    .get();

  const conflicts = apptSnap.docs.filter((doc) => {
    const appt = doc.data();
    if (['cancelled', 'no-show'].includes(appt.status)) return false;
    const apptStart = new Date(`${appt.appointment_date}T${appt.appointment_time}:00`);
    const apptEnd = new Date(apptStart.getTime() + Number(appt.duration ?? 60) * 60000);
    return start < apptEnd && end > apptStart;
  });

  if (conflicts.length > 0) {
    throw new HttpsError('failed-precondition', t('err_slot_unavailable'));
  }
}

async function createAcuityAppointment(
  orgId: string,
  appointmentId: string,
  appointment: admin.firestore.DocumentData,
) {
  const config = await getAcuityConfig(orgId);
  if (!config?.data.sync_enabled) {
    return { status: 'skipped', reason: 'Acuity sync is disabled' };
  }

  const acuityUserId = process.env.ACUITY_API_USER_ID;
  const acuityApiKey = process.env.ACUITY_API_KEY;
  if (!acuityUserId || !acuityApiKey) {
    return { status: 'failed', reason: 'Acuity API credentials are not configured' };
  }

  const mappings = config.data.client_portal_acuity_mappings ?? {};
  const treatmentMapping = mappings.treatments?.[appointment.treatment_id] ?? {};
  const calendarId = mappings.staff_calendars?.[appointment.staff_id];
  const appointmentTypeId = treatmentMapping.appointmentTypeID ?? treatmentMapping.appointment_type_id;

  if (!appointmentTypeId || !calendarId) {
    return { status: 'failed', reason: 'Missing Acuity treatment or staff calendar mapping' };
  }

  const credentials = Buffer.from(`${acuityUserId}:${acuityApiKey}`).toString('base64');
  const response = await fetch('https://acuityscheduling.com/api/v1/appointments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appointmentTypeID: appointmentTypeId,
      calendarID: calendarId,
      datetime: `${appointment.appointment_date}T${appointment.appointment_time}:00`,
      firstName: String(appointment.client_name ?? '').split(' ')[0] || appointment.client_name,
      lastName: String(appointment.client_name ?? '').split(' ').slice(1).join(' '),
      email: appointment.client_email,
      phone: appointment.client_phone,
      notes: appointment.notes,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { status: 'failed', reason: `Acuity API error: ${response.status} ${errorText}` };
  }

  const created = await response.json() as { id?: number | string };
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('appointments')
    .doc(appointmentId)
    .update({
      acuity_appointment_id: created.id ? String(created.id) : null,
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { status: 'synced', acuityAppointmentId: created.id ? String(created.id) : null };
}

export const getClientPortalOrg = onCall({ enforceAppCheck: false }, async (request) => {
  const rawSlug = typeof request.data?.slug === 'string' ? request.data.slug.trim().toLowerCase() : '';
  const rawHost = typeof request.data?.host === 'string' ? request.data.host.trim().toLowerCase() : '';
  const host = rawHost.split(':')[0];

  if (!rawSlug && !host) {
    throw new HttpsError('invalid-argument', 'slug or host is required');
  }

  const orgs = db.collection('organizations');
  const queries: Array<Promise<admin.firestore.QuerySnapshot>> = [];
  const slugCandidates = new Set<string>();

  if (rawSlug) slugCandidates.add(rawSlug);

  if (host && !['localhost', '127.0.0.1'].includes(host)) {
    queries.push(orgs.where('crm_domain', '==', host).where('isActive', '==', true).limit(1).get());
    queries.push(orgs.where('custom_domain', '==', host).where('isActive', '==', true).limit(1).get());
    queries.push(orgs.where('domain', '==', host).where('isActive', '==', true).limit(1).get());
    queries.push(orgs.where('portal_domains', 'array-contains', host).where('isActive', '==', true).limit(1).get());

    const withoutCrm = host.startsWith('crm.') ? host.slice(4) : host;
    const labels = withoutCrm.split('.').filter(Boolean);
    if (labels[0]) slugCandidates.add(labels[0].replace(/[^a-z0-9-]/g, ''));
    if (labels.length > 1) slugCandidates.add(labels.slice(0, -1).join('-').replace(/[^a-z0-9-]/g, '-'));
    slugCandidates.add(withoutCrm.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
  }

  for (const slug of Array.from(slugCandidates).filter(Boolean)) {
    queries.push(orgs.where('slug', '==', slug).where('isActive', '==', true).limit(1).get());
  }

  const snaps = await Promise.all(queries);
  const snap = snaps.find((candidate) => !candidate.empty);

  if (!snap || snap.empty) {
    throw new HttpsError('not-found', 'Client portal not found');
  }

  const org = snap.docs[0].data();
  // Portal users can't read config/businessInfo or paymentSettings under the rules,
  // so surface the invoice currency and the online-payments toggle here.
  const [businessInfoSnap, paymentSnap] = await Promise.all([
    snap.docs[0].ref.collection('config').doc('businessInfo').get(),
    snap.docs[0].ref.collection('paymentSettings').doc('config').get(),
  ]);
  const businessCurrency = businessInfoSnap.data()?.currency;
  const payment = paymentSnap.data() ?? {};
  const paymentProvider = payment.provider === 'stripe' || payment.provider === 'square' ? payment.provider : null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const branding = org.login_branding && typeof org.login_branding === 'object'
    ? (org.login_branding as Record<string, unknown>)
    : null;
  return {
    organization: {
      id: snap.docs[0].id,
      name: org.name ?? '',
      slug: org.slug ?? rawSlug,
      logo_url: org.logo_url ?? org.logoUrl ?? null,
      timezone: org.timezone ?? 'UTC',
      phone: org.phone ?? null,
      email: org.email ?? null,
      address: org.address ?? null,
      // Portal renders in the org's language (admins set it in Settings).
      language: normalizeLanguage(org.language),
      currency: typeof businessCurrency === 'string' && businessCurrency.trim() ? businessCurrency.trim() : 'USD',
      login_branding: branding
        ? {
            hero_url: str(branding.hero_url),
            title: str(branding.title),
            subtitle: str(branding.subtitle),
            accent: str(branding.accent),
          }
        : null,
      payments: {
        enabled: payment.is_enabled === true && paymentProvider !== null,
        provider: paymentProvider,
      },
    },
  };
});

export const linkClientPortalAccount = onCall(async (request) => {
  if (!request.auth) throw UNAUTHENTICATED();
  const t = await resolveT(request.data?.organizationId);

  const orgId = assertString(request.data?.organizationId, 'organizationId', t);

  // Only ever match a client card against a VERIFIED identity. A caller can put
  // any string in their profile email, but Firebase sets email_verified=true only
  // for Google sign-in or a confirmed email/password address, and populates
  // token.phone_number only after a successful phone OTP. Trusting an unverified
  // email here would let anyone claim another client's card by knowing their email.
  const emailVerified = request.auth.token.email_verified === true;
  const authEmail = emailVerified ? normalizeEmail(request.auth.token.email) : null;
  const authPhone = normalizePhone(request.auth.token.phone_number);

  if (!authEmail && !authPhone) {
    throw new HttpsError('failed-precondition', t('err_verified_contact_required'));
  }

  const orgRef = db.collection('organizations').doc(orgId);
  const clientsRef = orgRef.collection('clients');

  // A single household often shares one phone/email across several client cards
  // (mother/daughter, spouses). Matching a verified identity to an arbitrary card
  // would let a portal user read another client's appointments, purchases, and
  // invoices. So we fetch a bounded set of candidates, keep only ACTIVE cards, and
  // only auto-link when exactly one active card matches. More than one -> refuse.
  const isActiveClient = (client: admin.firestore.DocumentData): boolean =>
    !client.deleted_at && !client.deletedAt;

  const ambiguousMatchError = new HttpsError('failed-precondition', t('err_ambiguous_match'));

  let clientDoc: admin.firestore.QueryDocumentSnapshot | null = null;
  let matchedBy: 'email' | 'phone' | null = null;

  if (authEmail) {
    const emailSnap = await clientsRef.where('email', '==', authEmail).limit(10).get();
    const activeMatches = emailSnap.docs.filter((docSnap) => isActiveClient(docSnap.data()));
    if (activeMatches.length > 1) {
      throw ambiguousMatchError;
    }
    if (activeMatches.length === 1) {
      clientDoc = activeMatches[0];
      matchedBy = 'email';
    }
  }

  if (!clientDoc && authPhone) {
    const phoneSnap = await clientsRef.where('phone', '==', authPhone).limit(10).get();
    const activeMatches = phoneSnap.docs.filter((docSnap) => isActiveClient(docSnap.data()));
    if (activeMatches.length > 1) {
      throw ambiguousMatchError;
    }
    if (activeMatches.length === 1) {
      clientDoc = activeMatches[0];
      matchedBy = 'phone';
    }
  }

  if (!clientDoc) {
    // Client cards often store phones in local format ('050-123-4567', '(754) 232-6590')
    // while the OTP-verified token phone is E.164, so the indexed equality query
    // above misses them. Normalise stored phones for the org's country before
    // comparing — still strict equality on the full E.164 string, never suffix
    // matching. The org read only happens on this fallback path, and only when
    // the caller actually signed in by phone.
    const phoneCountry = authPhone ? defaultPhoneCountry((await orgRef.get()).data()) : null;
    const matchesAuthPhone = (storedPhone: unknown): boolean =>
      Boolean(authPhone && phoneCountry) && toE164(storedPhone, phoneCountry!) === authPhone;

    const fallbackSnap = await clientsRef.limit(500).get();
    const activeMatches = fallbackSnap.docs.filter((docSnap) => {
      const client = docSnap.data();
      if (!isActiveClient(client)) {
        return false;
      }
      return (authEmail && normalizeEmail(client.email) === authEmail)
        || matchesAuthPhone(client.phone);
    });

    if (activeMatches.length > 1) {
      throw ambiguousMatchError;
    }
    if (activeMatches.length === 1) {
      clientDoc = activeMatches[0];
      const client = clientDoc.data();
      matchedBy = authEmail && normalizeEmail(client.email) === authEmail ? 'email' : 'phone';
    }
  }

  if (!clientDoc || !matchedBy) {
    throw new HttpsError('permission-denied', t('err_no_matching_client'));
  }

  const client = clientDoc.data();
  if (client.deleted_at || client.deletedAt) {
    throw new HttpsError('permission-denied', t('err_client_not_active'));
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection('clientPortalAccess')
    .doc(request.auth.uid)
    .collection('organizations')
    .doc(orgId)
    .set({
      uid: request.auth.uid,
      organization_id: orgId,
      client_id: clientDoc.id,
      matched_by: matchedBy,
      email: authEmail,
      phone: authPhone,
      created_at: now,
      updated_at: now,
    }, { merge: true });

  await clientDoc.ref.set({ portal_linked_at: now }, { merge: true });

  return {
    access: {
      organization_id: orgId,
      client_id: clientDoc.id,
      matched_by: matchedBy,
    },
  };
});

export const createClientBookingRequest = onCall(async (request) => {
  if (!request.auth) throw UNAUTHENTICATED();
  const t = await resolveT(request.data?.organizationId);

  const orgId = assertString(request.data?.organizationId, 'organizationId', t);
  const purchaseId = assertString(request.data?.purchaseId, 'purchaseId', t);
  const treatmentId = assertString(request.data?.treatmentId, 'treatmentId', t);
  const preferredSlot = asSlot(request.data?.preferredSlot, 'preferredSlot', t);
  const alternativeSlots = Array.isArray(request.data?.alternativeSlots)
    ? request.data.alternativeSlots.slice(0, 3).map((slot: unknown) => asSlot(slot, 'alternativeSlot', t))
    : [];
  const notes = typeof request.data?.notes === 'string'
    ? request.data.notes.trim().slice(0, 1000)
    : '';
  const addonIdsInput = Array.isArray(request.data?.addons)
    ? request.data.addons
        .slice(0, 10)
        .map((a: unknown) => assertString((a as { addon_id?: unknown })?.addon_id, 'addon_id', t))
    : [];

  const access = await getPortalAccess(request.auth.uid, orgId, t);
  const orgRef = db.collection('organizations').doc(orgId);
  const [clientSnap, purchase] = await Promise.all([
    orgRef.collection('clients').doc(access.client_id).get(),
    assertPurchaseCanBook(orgRef, purchaseId, access.client_id, treatmentId, t),
  ]);

  if (!clientSnap.exists) {
    throw new HttpsError('not-found', t('err_client_not_found'));
  }

  // Package sessions are limited to one add-on (treatment is free; add-on is paid).
  if (purchase && addonIdsInput.length > 1) {
    throw new HttpsError('failed-precondition', t('err_one_addon_only'));
  }

  const treatment = await assertTreatmentCanBook(orgRef, purchase, treatmentId, t);

  // Validate add-ons exist and are active; snapshot price + duration server-side.
  const addonSnapshots: Array<{
    addon_id: string;
    name: string;
    price: number;
    duration_minutes: number;
  }> = [];
  if (addonIdsInput.length > 0) {
    const addonDocs = await Promise.all(
      addonIdsInput.map((id: string) => orgRef.collection('addons').doc(id).get()),
    );
    addonDocs.forEach((snap, idx) => {
      if (!snap.exists) {
        throw new HttpsError('not-found', t('err_addon_not_found', { addon: addonIdsInput[idx] }));
      }
      const a = snap.data()!;
      if (a.is_active === false) {
        throw new HttpsError('failed-precondition', t('err_addon_unavailable', { addon: a.name ?? snap.id }));
      }
      addonSnapshots.push({
        addon_id: snap.id,
        name: String(a.name ?? 'Add-on'),
        price: Number(a.price ?? 0),
        duration_minutes: Number(a.duration_minutes ?? 0),
      });
    });
  }

  const addonsTotalDuration = addonSnapshots.reduce((sum, a) => sum + a.duration_minutes, 0);
  const addonsTotalPrice = addonSnapshots.reduce((sum, a) => sum + a.price, 0);
  const totalDuration = Number(treatment.duration ?? 60) + addonsTotalDuration;

  await assertSlotAvailable(orgRef, preferredSlot, totalDuration, t);
  // Fixed, language-independent sentinel (see PENDING_STAFF_NAME).
  let staffName: string = PENDING_STAFF_NAME;
  if (preferredSlot.staff_id) {
    const staffSnap = await orgRef.collection('staff').doc(preferredSlot.staff_id).get();
    if (staffSnap.exists) {
      staffName = String(staffSnap.data()?.name ?? staffSnap.data()?.fullName ?? t('staff_fallback'));
    }
  }

  const client = clientSnap.data()!;
  const requestRef = await orgRef.collection('bookingRequests').add({
    organization_id: orgId,
    client_id: access.client_id,
    client_name: client.name ?? '',
    client_email: client.email ?? '',
    client_phone: client.phone ?? '',
    purchase_id: purchaseId,
    package_id: purchase.package_id ?? null,
    treatment_id: treatmentId,
    treatment_name: treatment.name ?? t('treatment_name_fallback'),
    duration: totalDuration,
    staff_name: staffName,
    preferred_slot: preferredSlot,
    alternative_slots: alternativeSlots,
    notes,
    addons: addonSnapshots,
    addons_total_price: addonsTotalPrice,
    addons_total_duration: addonsTotalDuration,
    status: 'pending',
    source: 'client_portal',
    created_by_uid: request.auth.uid,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { bookingRequestId: requestRef.id };
});

const OPEN_RENEWAL_STATUSES = ['pending', 'pending_payment', 'paid'];

export const requestPackageRenewal = onCall(async (request) => {
  if (!request.auth) throw UNAUTHENTICATED();
  const t = await resolveT(request.data?.organizationId);

  const orgId = assertString(request.data?.organizationId, 'organizationId', t);
  const purchaseId = assertString(request.data?.purchaseId, 'purchaseId', t);
  const notes = typeof request.data?.notes === 'string'
    ? request.data.notes.trim().slice(0, 1000)
    : '';

  const access = await getPortalAccess(request.auth.uid, orgId, t);
  const orgRef = db.collection('organizations').doc(orgId);
  const [clientSnap, purchaseSnap, businessInfoSnap] = await Promise.all([
    orgRef.collection('clients').doc(access.client_id).get(),
    orgRef.collection('purchases').doc(purchaseId).get(),
    orgRef.collection('config').doc('businessInfo').get(),
  ]);

  if (!clientSnap.exists) {
    throw new HttpsError('not-found', t('err_client_not_found'));
  }
  if (!purchaseSnap.exists) {
    throw new HttpsError('not-found', t('err_purchase_not_found'));
  }
  const purchase = purchaseSnap.data()!;
  if (purchase.client_id !== access.client_id) {
    throw new HttpsError('permission-denied', t('err_purchase_not_owned'));
  }

  const pkgSnap = purchase.package_id
    ? await orgRef.collection('packages').doc(purchase.package_id).get()
    : null;
  const pkg = pkgSnap?.exists ? pkgSnap.data()! : null;

  const existing = await orgRef.collection('renewalRequests')
    .where('purchase_id', '==', purchaseId)
    .get();
  if (existing.docs.some((d) => OPEN_RENEWAL_STATUSES.includes(String(d.data().status)))) {
    throw new HttpsError('failed-precondition', t('err_renewal_pending_exists'));
  }

  await consumeRateLimit(orgId, 'requestPackageRenewal', 200);

  const slots = Array.isArray(purchase.sessions_by_treatment)
    ? purchase.sessions_by_treatment as Array<{ total?: number }>
    : [];
  const slotTotal = slots.reduce((sum, s) => sum + Number(s.total ?? 0), 0);
  const currency = businessInfoSnap.data()?.currency;
  const client = clientSnap.data()!;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const requestRef = await orgRef.collection('renewalRequests').add({
    organization_id: orgId,
    client_id: access.client_id,
    client_name: client.name ?? '',
    client_email: client.email ?? '',
    client_phone: client.phone ?? '',
    purchase_id: purchaseId,
    package_id: purchase.package_id ?? null,
    package_name: pkg?.name ?? '',
    package_price: Number(pkg?.price ?? purchase.total_amount ?? 0),
    currency: typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD',
    sessions_remaining_at_request: Number(purchase.sessions_remaining ?? 0),
    total_sessions_at_request: Number(pkg?.total_sessions ?? slotTotal ?? 0),
    expiry_date_at_request: purchase.expiry_date ?? null,
    notes,
    status: 'pending',
    source: 'client_portal',
    payment_provider: null,
    created_by_uid: request.auth.uid,
    created_at: now,
    updated_at: now,
  });

  return { renewalRequestId: requestRef.id };
});

export const updateRenewalRequestStatus = onCall(async (request) => {
  if (!request.auth) throw UNAUTHENTICATED();
  const t = await resolveT(request.data?.organizationId);

  const orgId = assertString(request.data?.organizationId, 'organizationId', t);
  const renewalRequestId = assertString(request.data?.renewalRequestId, 'renewalRequestId', t);
  const action = request.data?.action;
  if (action !== 'contacted' && action !== 'dismissed') {
    throw new HttpsError('invalid-argument', t('err_renewal_action_invalid'));
  }

  const user = await getStaffUser(request.auth.uid, orgId, t);
  const requestRef = db.collection('organizations').doc(orgId).collection('renewalRequests').doc(renewalRequestId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const reviewer = {
    reviewed_by: request.auth.uid,
    reviewed_by_name: String(user.fullName ?? user.name ?? ''),
    reviewed_at: now,
    updated_at: now,
  };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', t('err_renewal_not_found'));
    }
    const data = snap.data()!;
    if (data.status === 'paid') {
      // A paid renewal already created the new package; staff only mark it handled.
      if (data.reviewed_at) {
        throw new HttpsError('failed-precondition', t('err_renewal_already_reviewed'));
      }
      tx.update(requestRef, reviewer);
      return;
    }
    if (data.status !== 'pending') {
      throw new HttpsError('failed-precondition', t('err_renewal_already_reviewed'));
    }
    tx.update(requestRef, { status: action, ...reviewer });
  });

  return { success: true };
});

export const updateClientBookingRequest = onCall(
  { secrets: ['ACUITY_API_USER_ID', 'ACUITY_API_KEY'] },
  async (request) => {
    if (!request.auth) throw UNAUTHENTICATED();
    const t = await resolveT(request.data?.organizationId);

    const orgId = assertString(request.data?.organizationId, 'organizationId', t);
    const requestId = assertString(request.data?.bookingRequestId, 'bookingRequestId', t);
    const action = assertString(request.data?.action, 'action', t);
    if (!['approve', 'reject'].includes(action)) {
      throw new HttpsError('invalid-argument', t('err_action_invalid'));
    }

    const staff = await getStaffUser(request.auth.uid, orgId, t);
    const orgRef = db.collection('organizations').doc(orgId);
    const requestRef = orgRef.collection('bookingRequests').doc(requestId);

    if (action === 'reject') {
      // Load the booking pre-update so we can email the visitor with the
      // original slot + treatment in the body.
      const bookingSnap = await requestRef.get();
      const bookingPre = bookingSnap.exists ? bookingSnap.data() : null;

      const staffResponse = typeof request.data?.staffResponse === 'string'
        ? request.data.staffResponse.trim().slice(0, 1000)
        : '';

      await requestRef.update({
        status: 'rejected',
        staff_response: staffResponse,
        reviewed_by: request.auth.uid,
        reviewed_by_name: staff.fullName ?? staff.email ?? '',
        reviewed_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Fire a rejection email for public-link bookings using the same template
      // pipeline as the other transactional emails. Non-blocking — a failed
      // email never fails the rejection. We only send for public_link source
      // because client_portal users don't expect a rejection email on this path
      // (they see the status flip in the portal UI).
      if (bookingPre && bookingPre.source === 'public_link') {
        try {
          await sendBookingRejectionEmail(orgId, requestId, bookingPre, staffResponse);
        } catch (err) {
          console.error('updateClientBookingRequest: rejection email failed', {
            orgId, requestId, error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return { status: 'rejected' };
    }

    const appointmentRef = orgRef.collection('appointments').doc();

    // Pre-fetch the treatment doc once so we can snapshot buffer_before / after
    // onto the new appointment. Done outside the transaction since the treatment
    // is independent of the purchase/booking-request consistency window.
    const bookingPreSnap = await requestRef.get();
    const treatmentIdForBuffer = bookingPreSnap.data()?.treatment_id as string | undefined;
    let pretxBufferBefore = 0;
    let pretxBufferAfter = 0;
    if (treatmentIdForBuffer) {
      const tSnap = await orgRef.collection('treatments').doc(treatmentIdForBuffer).get();
      const treatmentDoc = tSnap.data() ?? {};
      if (typeof treatmentDoc.buffer_before_minutes === 'number') pretxBufferBefore = treatmentDoc.buffer_before_minutes;
      if (typeof treatmentDoc.buffer_after_minutes === 'number') pretxBufferAfter = treatmentDoc.buffer_after_minutes;
    }

    // Re-check availability at approval time. Two pending requests for the same
    // staff + slot could otherwise both be approved into a double-booking. This
    // query can't live inside the transaction below (Firestore transactions
    // can't run collection queries), so we check immediately before it — the
    // same approach createClientBookingRequest uses at submission time.
    const preSelectedSlot = asSlot(
      request.data?.selectedSlot ?? bookingPreSnap.data()?.preferred_slot,
      'selectedSlot',
      t,
    );
    if (preSelectedSlot.staff_id) {
      await assertSlotAvailable(orgRef, preSelectedSlot, Number(bookingPreSnap.data()?.duration ?? 60), t);
    }

    const appointmentPayload = await db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      if (!requestSnap.exists) {
        throw new HttpsError('not-found', t('err_booking_not_found'));
      }

      const booking = requestSnap.data()!;
      if (booking.status !== 'pending') {
        throw new HttpsError('failed-precondition', t('err_booking_already_reviewed'));
      }

      const purchaseRef = orgRef.collection('purchases').doc(booking.purchase_id);
      const purchaseSnap = await tx.get(purchaseRef);
      if (!purchaseSnap.exists) {
        throw new HttpsError('not-found', t('err_purchase_not_found'));
      }

      const purchase = purchaseSnap.data()!;
      if (purchase.client_id !== booking.client_id || purchase.payment_status !== 'active') {
        throw new HttpsError('failed-precondition', t('err_package_no_longer_active'));
      }

      const slots = Array.isArray(purchase.sessions_by_treatment)
        ? purchase.sessions_by_treatment.map((slot: Record<string, unknown>) => ({ ...slot }))
        : [];
      const purchaseUpdates: Record<string, unknown> = {
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (slots.length > 0) {
        const slot = slots.find((item) => item.treatment_id === booking.treatment_id);
        const remaining = Number(slot?.remaining ?? 0);
        if (!slot || remaining <= 0) {
          throw new HttpsError('failed-precondition', t('err_no_sessions_for_treatment'));
        }
        slot.remaining = remaining - 1;
        const totalRemaining = slots.reduce((sum, item) => sum + Number(item.remaining ?? 0), 0);
        purchaseUpdates.sessions_by_treatment = slots;
        purchaseUpdates.sessions_remaining = totalRemaining;
        if (totalRemaining === 0) purchaseUpdates.payment_status = 'completed';
      } else {
        const remaining = Number(purchase.sessions_remaining ?? 0);
        if (remaining <= 0) {
          throw new HttpsError('failed-precondition', t('err_no_sessions'));
        }
        const nextRemaining = remaining - 1;
        purchaseUpdates.sessions_remaining = nextRemaining;
        if (nextRemaining === 0) purchaseUpdates.payment_status = 'completed';
      }

      const selectedSlot = asSlot(request.data?.selectedSlot ?? booking.preferred_slot, 'selectedSlot', t);
      if (!selectedSlot.staff_id) {
        throw new HttpsError('invalid-argument', t('err_assign_staff_first'));
      }
      const selectedStaffName = typeof request.data?.selectedStaffName === 'string' && request.data.selectedStaffName.trim()
        ? request.data.selectedStaffName.trim()
        : booking.staff_name && booking.staff_name !== PENDING_STAFF_NAME
          ? booking.staff_name
          : t('staff_fallback');
      const bookingAddons = Array.isArray(booking.addons) ? booking.addons : [];
      const bookingAddonsTotalPrice = Number(booking.addons_total_price ?? 0);
      const bookingAddonsTotalDuration = Number(booking.addons_total_duration ?? 0);
      // Snapshot buffers — prefer the bookingRequest's saved value (public-link
      // bookings store it at submission time); fall back to the pre-fetched
      // treatment doc otherwise (client_portal bookings).
      const bufferBefore = typeof booking.buffer_before_minutes === 'number'
        ? booking.buffer_before_minutes
        : pretxBufferBefore;
      const bufferAfter = typeof booking.buffer_after_minutes === 'number'
        ? booking.buffer_after_minutes
        : pretxBufferAfter;

      const appointment = {
        organization_id: orgId,
        client_id: booking.client_id,
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        appointment_date: selectedSlot.date,
        appointment_time: selectedSlot.time,
        staff_id: selectedSlot.staff_id,
        staff_name: selectedStaffName,
        treatment_id: booking.treatment_id,
        treatment_name: booking.treatment_name,
        duration: Number(booking.duration ?? 60),
        status: 'scheduled',
        notes: booking.notes ?? '',
        package_id: booking.package_id ?? null,
        purchase_id: booking.purchase_id,
        session_used: true,
        addons: bookingAddons,
        addons_total_price: bookingAddonsTotalPrice,
        addons_total_duration: bookingAddonsTotalDuration,
        price: bookingAddonsTotalPrice,
        booking_request_id: requestId,
        acuity_sync_enabled: false,
        sync_status: 'pending',
        buffer_before_minutes: bufferBefore,
        buffer_after_minutes: bufferAfter,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      tx.set(appointmentRef, appointment);
      tx.update(purchaseRef, purchaseUpdates);
      tx.update(requestRef, {
        status: 'approved',
        appointment_id: appointmentRef.id,
        approved_slot: selectedSlot,
        reviewed_by: request.auth!.uid,
        reviewed_by_name: staff.fullName ?? staff.email ?? '',
        reviewed_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return appointment;
    });

    const acuityResult = await createAcuityAppointment(orgId, appointmentRef.id, appointmentPayload);
    if (acuityResult.status !== 'synced') {
      await appointmentRef.update({
        sync_status: acuityResult.status,
        sync_error: acuityResult.reason ?? null,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // Mirror the sync outcome onto the bookingRequest doc so the staff-facing
    // panel can render it without an extra appointment fetch.
    await requestRef.update({
      acuity_sync_status: acuityResult.status,
      acuity_sync_error: acuityResult.reason ?? null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { status: 'approved', appointmentId: appointmentRef.id, acuity: acuityResult };
  },
);

/**
 * Sends a "Booking declined" email to the visitor using the same Resend +
 * email_templates pipeline as the other transactional emails. The salon admin
 * customizes the body in Marketing → Automations under the
 * `booking_request_rejected` trigger; the branded HTML wrapper comes from the
 * `booking_request_declined` template key (with the same general/default
 * fallback chain).
 */
async function sendBookingRejectionEmail(
  orgId: string,
  requestId: string,
  booking: FirebaseFirestore.DocumentData,
  staffResponse: string,
): Promise<void> {
  const toEmail = booking.client_email as string | null;
  if (!isValidEmail(toEmail)) return;

  const automation = await getActiveEmailAutomation(orgId, 'booking_request_rejected');
  if (!automation) return;

  const ctx = await resolveEmailContext(orgId, 'booking_request_declined');
  if (!ctx) return;

  const lang = orgLanguageFromData(ctx.orgData);
  const t = makeT(STRINGS, lang);
  const tz = String(ctx.orgData.timezone || 'America/New_York');
  const dateStr = String(booking.preferred_slot?.date || '');
  const timeStr = String(booking.preferred_slot?.time || '');
  const visitorName = String(booking.client_name || '').trim() || t('visitor_fallback');

  const vars: Record<string, string> = {
    NAME: visitorName,
    TREATMENT: String(booking.treatment_name || t('treatment_fallback')),
    // Shared booking-email helpers so Hebrew date/time output matches every other booking email.
    DATE: formatDateForDisplay(dateStr, tz, lang),
    TIME: formatTimeForDisplay(timeStr, lang),
    STAFF: String(booking.staff_name || ''),
    ORG: String(ctx.orgData.name || ctx.fromName),
    REASON: staffResponse,                    // [REASON] in the automation body
    STAFF_RESPONSE: staffResponse,            // alias for backward compat
  };

  await renderAndSend({
    orgId,
    toEmail,
    toName: visitorName,
    automation,
    ctx,
    vars,
    sendKind: 'system:publicBookingRequest:rejection',
    bookingRequestId: requestId,
    clientId: (booking.client_id as string | null) ?? null,
  });
}
