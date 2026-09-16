import * as admin from 'firebase-admin';
import { todayInTimezone } from './orgEmail';
import { AppLanguage, DEFAULT_LANGUAGE, defineStrings, localeFor, makeT } from './i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const STRINGS = defineStrings({
  en: {
    reconfirmFooter: 'Reply 1 to confirm, 2 to cancel, 3 to reschedule.',
    dateAtTime: '{{date}} at {{time}}',
  },
  he: {
    reconfirmFooter: 'השיבו 1 לאישור, 2 לביטול, 3 לשינוי מועד.',
    dateAtTime: '{{date}} בשעה {{time}}',
  },
});

/**
 * Footer appended to confirmation/reminder SMS so clients know how to respond.
 * English constant kept for backward compatibility — prefer `reconfirmFooter(lang)`.
 */
export const RECONFIRM_FOOTER = STRINGS.en.reconfirmFooter;

/** Language-aware "Reply 1/2/3" SMS footer. Reply keywords stay numeric in every language. */
export function reconfirmFooter(lang: AppLanguage = DEFAULT_LANGUAGE): string {
  return makeT(STRINGS, lang)('reconfirmFooter');
}

export type ConfirmVia = 'sms' | 'email' | 'staff';

export interface UpcomingAppointment {
  id: string;
  data: admin.firestore.DocumentData;
  /** True when the client has another upcoming appointment on a different date. */
  ambiguous: boolean;
}

function apptsRef(orgId: string) {
  return db.collection('organizations').doc(orgId).collection('appointments');
}

/** Org timezone (IANA), defaulting to America/New_York. */
export async function getOrgTimezone(orgId: string): Promise<string> {
  try {
    const snap = await db.collection('organizations').doc(orgId).get();
    return String(snap.data()?.timezone || 'America/New_York');
  } catch {
    return 'America/New_York';
  }
}

export { todayInTimezone };

/**
 * Soonest upcoming appointment for a client (status scheduled/confirmed, date >=
 * today in org tz). Returns null when none. `ambiguous` flags when a second
 * upcoming appointment exists on a different date — used only to tune ack copy.
 */
export async function findNearestUpcomingAppointment(
  orgId: string,
  clientId: string,
  today: string,
): Promise<UpcomingAppointment | null> {
  const snap = await apptsRef(orgId)
    .where('client_id', '==', clientId)
    .where('status', 'in', ['scheduled', 'confirmed'])
    .where('appointment_date', '>=', today)
    .orderBy('appointment_date')
    .orderBy('appointment_time')
    .limit(2)
    .get();

  if (snap.empty) return null;
  const first = snap.docs[0];
  const ambiguous =
    snap.size > 1 && snap.docs[1].data().appointment_date !== first.data().appointment_date;
  return { id: first.id, data: first.data(), ambiguous };
}

/** Set status=confirmed + audit fields. Idempotent. */
export async function confirmAppointment(orgId: string, apptId: string, via: ConfirmVia): Promise<void> {
  await apptsRef(orgId).doc(apptId).set(
    {
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_via: via,
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
}

/** Flag a cancellation request WITHOUT changing status (staff decide). */
export async function requestCancellation(orgId: string, apptId: string, via: ConfirmVia): Promise<void> {
  await apptsRef(orgId).doc(apptId).set(
    {
      cancellation_requested: true,
      cancellation_requested_at: new Date().toISOString(),
      cancellation_requested_via: via,
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
}

/** Flag a reschedule request WITHOUT changing status. */
export async function requestReschedule(orgId: string, apptId: string, via: ConfirmVia): Promise<void> {
  await apptsRef(orgId).doc(apptId).set(
    {
      reschedule_requested: true,
      reschedule_requested_at: new Date().toISOString(),
      reschedule_requested_via: via,
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );
}

/** Write a resolvable staff worklist entry for a cancel/reschedule request. */
export async function alertStaff(
  orgId: string,
  apptId: string,
  kind: 'cancellation' | 'reschedule',
  clientName: string,
): Promise<void> {
  await db.collection('organizations').doc(orgId).collection('appointmentAlerts').add({
    appointment_id: apptId,
    kind,
    client_name: clientName || '',
    resolved: false,
    created_at: new Date().toISOString(),
    created_at_ts: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Formats a wall-clock "HH:MM" string in the language's conventional style
 * ("2:30 PM" for English, "14:30" for Hebrew). Timezone-agnostic.
 */
export function formatWallClockTime(timeStr: string, lang: AppLanguage = DEFAULT_LANGUAGE): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h)) return timeStr;
  const minutes = Number.isNaN(m) ? 0 : m;
  if (lang === DEFAULT_LANGUAGE) {
    // Hand-rolled so English stays a plain U+0020 before AM/PM regardless of the
    // runtime ICU build (ICU 72+ emits U+202F, which would push an otherwise
    // GSM-7 SMS into UCS-2 segments). Mirrors the sibling formatTimeForDisplay().
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
  }
  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, h, minutes)));
  } catch {
    return timeStr;
  }
}

/**
 * "Fri, Mar 15 at 2:30 PM" style label from an appointment doc, for ack copy.
 * `lang` (optional, defaults to English) localises the date and the "at" joiner.
 */
export function describeAppointment(
  data: admin.firestore.DocumentData,
  tz: string,
  lang: AppLanguage = DEFAULT_LANGUAGE,
): string {
  const t = makeT(STRINGS, lang);
  const dateStr = String(data.appointment_date || '');
  const timeStr = String(data.appointment_time || '');
  let datePart = dateStr;
  try {
    datePart = new Date(`${dateStr}T12:00:00`).toLocaleDateString(localeFor(lang), {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    /* keep raw */
  }
  const timePart = formatWallClockTime(timeStr, lang);
  return timePart ? t('dateAtTime', { date: datePart, time: timePart }) : datePart;
}
