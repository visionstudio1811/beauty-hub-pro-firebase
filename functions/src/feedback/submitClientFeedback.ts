import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { consumeRateLimit } from '../rateLimit';
import { AppLanguage, defineStrings, getOrgLanguage, isAppLanguage, makeT, Translator } from '../lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 1000;
const ORG_DAILY_LIMIT = 500;
const CALLER_DAILY_LIMIT = 5;

// Portal-facing copy: ClientPortal renders error.message verbatim, so these follow the ORG language.
const STRINGS = defineStrings({
  en: {
    err_field_required: '{{field}} is required',
    err_field_invalid: '{{field}} is invalid',
    err_rating_invalid: 'Rating must be a whole number from 1 to 5',
    err_recommend_invalid: 'The recommendation score must be a whole number from 0 to 10',
    err_text_invalid: 'Answers must be text',
    err_text_too_long: 'Answers can be at most {{max}} characters long',
    err_portal_not_linked: 'Client portal access has not been linked',
    err_client_not_found: 'Client not found',
    err_client_not_active: 'This client card is not active',
    err_appointment_not_found: 'Appointment not found',
    err_appointment_not_owned: 'This appointment does not belong to your client card',
    err_treatment_not_found: 'Treatment not found',
    err_daily_limit: 'You have already sent the maximum number of feedback responses for today. Thank you!',
  },
  he: {
    err_field_required: 'השדה {{field}} הוא שדה חובה',
    err_field_invalid: 'השדה {{field}} אינו תקין',
    err_rating_invalid: 'הדירוג חייב להיות מספר שלם בין 1 ל-5',
    err_recommend_invalid: 'ציון ההמלצה חייב להיות מספר שלם בין 0 ל-10',
    err_text_invalid: 'התשובות חייבות להיות טקסט',
    err_text_too_long: 'אורך התשובות מוגבל ל-{{max}} תווים',
    err_portal_not_linked: 'הגישה לפורטל הלקוחות עדיין לא קושרה לכרטיס לקוח',
    err_client_not_found: 'הלקוח לא נמצא',
    err_client_not_active: 'כרטיס הלקוח הזה אינו פעיל',
    err_appointment_not_found: 'התור לא נמצא',
    err_appointment_not_owned: 'התור הזה אינו שייך לכרטיס הלקוח שלך',
    err_treatment_not_found: 'הטיפול לא נמצא',
    err_daily_limit: 'כבר שלחתם היום את מספר המשובים המרבי. תודה!',
  },
});

type T = Translator<keyof typeof STRINGS.en>;

interface SubmitFeedbackInput {
  organizationId?: unknown;
  rating?: unknown;
  recommend?: unknown;
  enjoyed?: unknown;
  improve?: unknown;
  treatmentId?: unknown;
  appointmentId?: unknown;
  anonymous?: unknown;
  language?: unknown;
}

function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_ID_LENGTH && !v.includes('/');
}

function requireId(value: unknown, field: string, t: T): string {
  if (!isSafeId(value)) throw new HttpsError('invalid-argument', t('err_field_required', { field }));
  return value.trim();
}

function optionalId(value: unknown, field: string, t: T): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isSafeId(value)) throw new HttpsError('invalid-argument', t('err_field_invalid', { field }));
  return value.trim();
}

function cappedText(value: unknown, t: T): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', t('err_text_invalid'));
  const trimmed = value.trim();
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new HttpsError('invalid-argument', t('err_text_too_long', { max: MAX_TEXT_LENGTH }));
  }
  return trimmed;
}

function parseRating(value: unknown, t: T): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new HttpsError('invalid-argument', t('err_rating_invalid'));
  }
  return value;
}

function parseRecommend(value: unknown, t: T): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) {
    throw new HttpsError('invalid-argument', t('err_recommend_invalid'));
  }
  return value;
}

function parseAnonymous(value: unknown, t: T): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', t('err_field_invalid', { field: 'anonymous' }));
  return value;
}

async function getPortalAccess(uid: string, orgId: string, t: T): Promise<{ client_id: string }> {
  const snap = await db.collection('clientPortalAccess').doc(uid).collection('organizations').doc(orgId).get();
  const clientId = snap.data()?.client_id;
  if (!snap.exists || typeof clientId !== 'string' || !clientId) {
    throw new HttpsError('permission-denied', t('err_portal_not_linked'));
  }
  return { client_id: clientId };
}

// The per-caller counter lives in the CF-only rateLimits collection; hashing the
// uid keeps even that doc id from being a raw account identifier.
const callerKey = (uid: string): string => createHash('sha256').update(uid).digest('hex').slice(0, 24);

async function consumeCallerLimit(orgId: string, uid: string, t: T): Promise<void> {
  try {
    await consumeRateLimit(orgId, `submitClientFeedback_${callerKey(uid)}`, CALLER_DAILY_LIMIT);
  } catch (err) {
    if (err instanceof HttpsError && err.code === 'resource-exhausted') {
      throw new HttpsError('resource-exhausted', t('err_daily_limit'));
    }
    throw err;
  }
}

async function loadTreatmentName(
  orgRef: FirebaseFirestore.DocumentReference,
  treatmentId: string,
  t: T,
): Promise<string | null> {
  const snap = await orgRef.collection('treatments').doc(treatmentId).get();
  if (!snap.exists) throw new HttpsError('not-found', t('err_treatment_not_found'));
  const name = snap.data()?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const submitClientFeedback = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required');
  const input = (request.data ?? {}) as SubmitFeedbackInput;

  const orgLang: AppLanguage = isSafeId(input.organizationId) ? await getOrgLanguage(input.organizationId.trim()) : 'en';
  const t = makeT(STRINGS, orgLang);

  const orgId = requireId(input.organizationId, 'organizationId', t);
  const rating = parseRating(input.rating, t);
  const recommend = parseRecommend(input.recommend, t);
  const enjoyed = cappedText(input.enjoyed, t);
  const improve = cappedText(input.improve, t);
  const treatmentIdInput = optionalId(input.treatmentId, 'treatmentId', t);
  const appointmentIdInput = optionalId(input.appointmentId, 'appointmentId', t);
  const anonymous = parseAnonymous(input.anonymous, t);
  const language: AppLanguage = isAppLanguage(input.language) ? input.language : orgLang;

  const uid = request.auth.uid;
  const access = await getPortalAccess(uid, orgId, t);

  await consumeCallerLimit(orgId, uid, t);
  await consumeRateLimit(orgId, 'submitClientFeedback', ORG_DAILY_LIMIT);

  const orgRef = db.collection('organizations').doc(orgId);
  const clientSnap = await orgRef.collection('clients').doc(access.client_id).get();
  if (!clientSnap.exists) throw new HttpsError('not-found', t('err_client_not_found'));
  const client = clientSnap.data()!;
  if (client.deleted_at || client.deletedAt) throw new HttpsError('permission-denied', t('err_client_not_active'));

  let clientName: string | null = null;
  let appointmentId: string | null = null;
  let treatmentId: string | null = treatmentIdInput;
  let treatmentName: string | null = null;

  if (!anonymous) {
    clientName = typeof client.name === 'string' && client.name.trim() ? client.name.trim() : null;

    if (appointmentIdInput) {
      const apptSnap = await orgRef.collection('appointments').doc(appointmentIdInput).get();
      if (!apptSnap.exists) throw new HttpsError('not-found', t('err_appointment_not_found'));
      const appt = apptSnap.data()!;
      if (appt.client_id !== access.client_id) {
        throw new HttpsError('permission-denied', t('err_appointment_not_owned'));
      }
      appointmentId = appointmentIdInput;
      const apptTreatmentId = typeof appt.treatment_id === 'string' && appt.treatment_id ? appt.treatment_id : null;
      if (!treatmentId) treatmentId = apptTreatmentId;
      if (treatmentId && treatmentId === apptTreatmentId && typeof appt.treatment_name === 'string' && appt.treatment_name.trim()) {
        treatmentName = appt.treatment_name.trim();
      }
    }
  }

  if (treatmentId && !treatmentName) {
    treatmentName = await loadTreatmentName(orgRef, treatmentId, t);
  }

  // Anonymous submissions are day-granular so timing can't re-identify the client.
  const now = new Date();
  const createdAt = anonymous ? startOfUtcDay(now) : now;

  await orgRef.collection('clientFeedback').add({
    organization_id: orgId,
    rating,
    recommend,
    enjoyed,
    improve,
    treatment_id: treatmentId,
    treatment_name: treatmentName,
    appointment_id: anonymous ? null : appointmentId,
    client_id: anonymous ? null : access.client_id,
    client_name: anonymous ? null : clientName,
    is_anonymous: anonymous,
    language,
    source: 'client_portal',
    created_at: admin.firestore.Timestamp.fromDate(createdAt),
    created_day: createdAt.toISOString().slice(0, 10),
  });

  console.log('submitClientFeedback: stored', { orgId, anonymous });
  return { success: true };
});
