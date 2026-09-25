import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { consumeRateLimit } from './rateLimit';
import { defineStrings, getCallerLanguage, makeT, type Translator } from './lib/i18n';
import {
  AcuityApiError,
  type AcuityAppointment,
  type AcuityClient,
  type AcuityConfig,
  type AcuityCredentials,
  type AcuityMe,
  ClientIndex,
  MappingResolver,
  acuityRequest,
  acuitySlot,
  createAcuityConfig,
  crmVisitsByClientDay,
  findImportedAppointments,
  fullName,
  getAcuityConfig,
  importAcuityAppointment,
  importAcuityClient,
  isCanceled,
  lazyClientIndex,
  loadAcuityCredentials,
  loadAcuitySecrets,
  orgTimeZone,
  parseDuration,
  saveAcuityApiKey,
} from './lib/acuity';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const MAX_CLIENT_ROWS = 5000;
const MAX_APPOINTMENT_ROWS = 1000;
const CLIENT_BATCH = 100;
const APPOINTMENT_BATCH = 25;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Admin-facing errors, in the caller's language.
const STRINGS = defineStrings({
  en: {
    org_required: 'Organization ID is required',
    admin_required: 'Admin access required',
    unknown_action: 'Unknown action',
    not_connected: 'Connect your Acuity account first.',
    invalid_user_id: 'The Acuity User ID is a number. Find it in Acuity under Integrations → API.',
    invalid_api_key: "That doesn't look like an Acuity API key.",
    api_key_required: 'Enter your Acuity API key.',
    acuity_unauthorized: 'Acuity rejected these credentials. Check the User ID and API key.',
    acuity_not_found: 'Acuity could not find that record.',
    acuity_rate_limited: 'Acuity is limiting requests right now. Wait a minute and try again.',
    acuity_unavailable: 'Acuity returned an error ({{status}}). Try again shortly.',
    acuity_timeout: 'Acuity took too long to respond. Try again.',
    invalid_dates: 'Choose a valid date range.',
    batch_size: 'Send between 1 and {{max}} items at a time.',
    unexpected: 'Something went wrong while talking to Acuity.',
  },
  he: {
    org_required: 'נדרש מזהה ארגון',
    admin_required: 'נדרשת הרשאת מנהל',
    unknown_action: 'פעולה לא מוכרת',
    not_connected: 'חברו קודם את חשבון Acuity.',
    invalid_user_id: 'מזהה המשתמש ב-Acuity הוא מספר. הוא מופיע ב-Acuity תחת Integrations ← API.',
    invalid_api_key: 'זה לא נראה כמו מפתח API של Acuity.',
    api_key_required: 'הזינו את מפתח ה-API של Acuity.',
    acuity_unauthorized: 'Acuity דחתה את פרטי הגישה. בדקו את מזהה המשתמש ואת מפתח ה-API.',
    acuity_not_found: 'Acuity לא מצאה את הרשומה.',
    acuity_rate_limited: 'Acuity מגבילה כרגע את קצב הבקשות. המתינו דקה ונסו שוב.',
    acuity_unavailable: 'Acuity החזירה שגיאה ({{status}}). נסו שוב בעוד רגע.',
    acuity_timeout: 'Acuity לא הגיבה בזמן. נסו שוב.',
    invalid_dates: 'בחרו טווח תאריכים תקין.',
    batch_size: 'שלחו בין 1 ל-{{max}} פריטים בכל פעם.',
    unexpected: 'משהו השתבש בזמן התקשורת עם Acuity.',
  },
});

type T = Translator<keyof (typeof STRINGS)['en']>;

interface AcuityCalendar {
  id: number | string;
  name?: string;
}

interface AcuityAppointmentType {
  id: number | string;
  name?: string;
  active?: boolean | string;
}

type ItemStatus = 'created' | 'linked' | 'updated' | 'skipped' | 'error';

interface ImportSummary {
  created: number;
  linked: number;
  updated: number;
  skipped: number;
  errors: number;
}

function toHttpsError(err: unknown, t: T): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof AcuityApiError) {
    if (err.status === 401 || err.status === 403) return new HttpsError('failed-precondition', t('acuity_unauthorized'));
    if (err.status === 404) return new HttpsError('not-found', t('acuity_not_found'));
    if (err.status === 429) return new HttpsError('resource-exhausted', t('acuity_rate_limited'));
    return new HttpsError('unavailable', t('acuity_unavailable', { status: err.status }));
  }
  if (err instanceof Error && err.name === 'AbortError') return new HttpsError('deadline-exceeded', t('acuity_timeout'));
  console.error('acuitySync failed:', err instanceof Error ? err.message : String(err));
  return new HttpsError('internal', t('unexpected'));
}

function asArray<V>(value: unknown): V[] {
  return Array.isArray(value) ? (value as V[]) : [];
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function mapLimit<I, R>(items: I[], limit: number, fn: (item: I) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function summarize(results: Array<{ status: ItemStatus }>): ImportSummary {
  const summary: ImportSummary = { created: 0, linked: 0, updated: 0, skipped: 0, errors: 0 };
  for (const r of results) {
    if (r.status === 'error') summary.errors++;
    else summary[r.status]++;
  }
  return summary;
}

async function recordImport(
  config: AcuityConfig,
  orgId: string,
  uid: string,
  entity: 'client' | 'appointment',
  summary: ImportSummary,
) {
  const now = new Date().toISOString();
  await Promise.all([
    // Counts only — never client details.
    db.collection('organizations').doc(orgId).collection('acuitySyncLogs').add({
      sync_type: 'manual_import',
      entity_type: entity,
      ...summary,
      triggered_by: uid,
      createdAt: FieldValue.serverTimestamp(),
    }),
    config.ref.update({ last_import_at: now }),
  ]);
}

async function requireConnection(orgId: string, t: T): Promise<{ config: AcuityConfig; creds: AcuityCredentials }> {
  const config = await getAcuityConfig(orgId);
  const creds = config ? await loadAcuityCredentials(config) : null;
  if (!config || !creds) throw new HttpsError('failed-precondition', t('not_connected'));
  return { config, creds };
}

function accountOf(me: AcuityMe) {
  return { name: me.name ?? null, email: me.email ?? null, timezone: me.timezone ?? null };
}

async function storeAccount(config: AcuityConfig, me: AcuityMe, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  await config.ref.update({
    account_name: me.name ?? null,
    account_email: me.email ?? null,
    account_timezone: me.timezone ?? null,
    connected_at: now,
    updated_at: now,
    ...extra,
  });
}

/* ------------------------------------------------------------------ actions */

async function saveCredentials(orgId: string, data: Record<string, unknown>, t: T) {
  const userId = str(data.acuityUserId, 30);
  const apiKeyInput = str(data.apiKey, 200);
  if (!/^\d{1,20}$/.test(userId)) throw new HttpsError('invalid-argument', t('invalid_user_id'));
  if (apiKeyInput && !/^[A-Za-z0-9_-]{16,128}$/.test(apiKeyInput)) {
    throw new HttpsError('invalid-argument', t('invalid_api_key'));
  }
  await consumeRateLimit(orgId, 'acuityCredentials', 30);

  const existing = await getAcuityConfig(orgId);
  const apiKey = apiKeyInput || (existing ? (await loadAcuitySecrets(existing)).apiKey : null);
  if (!apiKey) throw new HttpsError('invalid-argument', t('api_key_required'));

  // Verify before writing anything, so a typo never replaces working
  // credentials and a failed first connect leaves no config doc behind.
  const me = await acuityRequest<AcuityMe>({ userId, apiKey }, 'me');
  const config = existing ?? (await createAcuityConfig(orgId));
  if (apiKeyInput) await saveAcuityApiKey(config, apiKeyInput);
  await storeAccount(config, me, { acuity_user_id: userId });
  return { success: true, account: accountOf(me), apiKeyLast4: apiKey.slice(-4) };
}

async function testConnection(orgId: string, t: T) {
  const { config, creds } = await requireConnection(orgId, t);
  await consumeRateLimit(orgId, 'acuityRead', 500);
  const me = await acuityRequest<AcuityMe>(creds, 'me');
  await storeAccount(config, me);
  return { success: true, account: accountOf(me) };
}

async function listMeta(orgId: string, t: T) {
  const { config, creds } = await requireConnection(orgId, t);
  await consumeRateLimit(orgId, 'acuityRead', 500);
  const [calendars, types, mapping] = await Promise.all([
    acuityRequest<unknown>(creds, 'calendars'),
    acuityRequest<unknown>(creds, 'appointment-types'),
    MappingResolver.load(orgId, config.data),
  ]);
  return {
    calendars: asArray<AcuityCalendar>(calendars).map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ''),
      staff: mapping.staffFor(c.id, c.name),
    })),
    appointmentTypes: asArray<AcuityAppointmentType>(types).map((a) => ({
      id: String(a.id),
      name: String(a.name ?? ''),
      active: a.active !== false && a.active !== 'false',
      treatment: mapping.treatmentFor(a.id, a.name),
    })),
    treatments: mapping.treatments,
    staff: mapping.staff,
  };
}

async function listClients(orgId: string, data: Record<string, unknown>, t: T) {
  const { creds } = await requireConnection(orgId, t);
  await consumeRateLimit(orgId, 'acuityRead', 500);
  const search = str(data.search, 100);
  const [rows, index] = await Promise.all([
    acuityRequest<unknown>(creds, search ? `clients?search=${encodeURIComponent(search)}` : 'clients'),
    ClientIndex.load(orgId),
  ]);
  const all = asArray<AcuityClient>(rows);
  const seen = new Map<string, number>();
  const clients = all
    .slice(0, MAX_CLIENT_ROWS)
    .map((c) => {
      const name = fullName(c.firstName, c.lastName);
      const { match, ambiguous, hint } = index.lookup({ email: c.email, phone: c.phone, name });
      const base = String(c.email || c.phone || name || 'client').trim().toLowerCase();
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return {
        key: n ? `${base}#${n}` : base,
        firstName: String(c.firstName ?? ''),
        lastName: String(c.lastName ?? ''),
        name,
        email: c.email ? String(c.email) : null,
        phone: c.phone ? String(c.phone) : null,
        notes: c.notes ? String(c.notes) : null,
        crm: match ? { id: match.client.id, name: match.client.name, by: match.by, linked: match.client.linked } : null,
        ambiguous,
        similar: hint ? { id: hint.client.id, name: hint.client.name, reason: hint.reason } : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { clients, total: all.length, truncated: all.length > MAX_CLIENT_ROWS };
}

async function listAppointments(orgId: string, data: Record<string, unknown>, t: T) {
  const minDate = str(data.minDate, 10);
  const maxDate = str(data.maxDate, 10);
  if (!ISO_DATE.test(minDate) || !ISO_DATE.test(maxDate) || minDate > maxDate) {
    throw new HttpsError('invalid-argument', t('invalid_dates'));
  }
  const { config, creds } = await requireConnection(orgId, t);
  await consumeRateLimit(orgId, 'acuityRead', 500);

  const params = new URLSearchParams({
    minDate,
    maxDate,
    max: String(MAX_APPOINTMENT_ROWS),
    direction: 'ASC',
    excludeForms: 'true',
  });
  const calendarId = str(data.calendarId, 20);
  if (/^\d+$/.test(calendarId)) params.set('calendarID', calendarId);
  const typeId = str(data.appointmentTypeId, 20);
  if (/^\d+$/.test(typeId)) params.set('appointmentTypeID', typeId);
  if (data.includeCanceled === true) params.set('showall', 'true');

  const [rows, index, mapping, timeZone, crmVisits] = await Promise.all([
    acuityRequest<unknown>(creds, `appointments?${params.toString()}`),
    ClientIndex.load(orgId),
    MappingResolver.load(orgId, config.data),
    orgTimeZone(orgId),
    crmVisitsByClientDay(orgId, minDate, maxDate),
  ]);
  const all = asArray<AcuityAppointment>(rows);
  const imported = await findImportedAppointments(orgId, all.map((a) => String(a.id)));
  const now = Date.now();

  return {
    appointments: all.map((a) => {
      const slot = acuitySlot(a, timeZone);
      const { match, ambiguous } = index.lookup({ email: a.email, phone: a.phone, name: fullName(a.firstName, a.lastName) });
      // A CRM visit for this client that day (booked in both systems?). Same time = will be adopted on import.
      const sameDay = match && slot ? crmVisits.get(`${match.client.id}|${slot.date}`) ?? [] : [];
      const twin = sameDay.find((v) => v.time === slot?.time) ?? sameDay[0] ?? null;
      return {
        id: String(a.id),
        date: slot?.date ?? null,
        time: slot?.time ?? null,
        duration: slot?.duration ?? parseDuration(a.duration),
        isPast: slot?.endMs != null && slot.endMs <= now,
        canceled: isCanceled(a),
        clientName: fullName(a.firstName, a.lastName),
        email: a.email || null,
        phone: a.phone || null,
        type: String(a.type ?? ''),
        appointmentTypeId: a.appointmentTypeID != null ? String(a.appointmentTypeID) : null,
        calendar: String(a.calendar ?? ''),
        calendarId: a.calendarID != null ? String(a.calendarID) : null,
        price: a.price ?? null,
        crmClient: match ? { id: match.client.id, name: match.client.name, by: match.by } : null,
        clientAmbiguous: ambiguous,
        crmSameDay: twin,
        treatment: mapping.treatmentFor(a.appointmentTypeID, a.type),
        staff: mapping.staffFor(a.calendarID, a.calendar),
        imported: imported.get(String(a.id)) ?? null,
      };
    }),
    truncated: all.length >= MAX_APPOINTMENT_ROWS,
    timeZone,
  };
}

async function importClients(orgId: string, uid: string, data: Record<string, unknown>, t: T) {
  const input = asArray<Record<string, unknown>>(data.clients);
  if (input.length === 0 || input.length > CLIENT_BATCH) {
    throw new HttpsError('invalid-argument', t('batch_size', { max: CLIENT_BATCH }));
  }
  const { config } = await requireConnection(orgId, t);
  await consumeRateLimit(orgId, 'acuityImport', 1000);

  const index = await ClientIndex.load(orgId);
  const nowIso = new Date().toISOString();
  const results: Array<{ key: string; status: ItemStatus; clientId?: string; clientName?: string; reason?: string }> = [];
  for (const raw of input) {
    const key = str(raw?.key, 300);
    try {
      const r = await importAcuityClient(
        orgId,
        index,
        {
          firstName: str(raw?.firstName, 100),
          lastName: str(raw?.lastName, 100),
          email: str(raw?.email, 254),
          phone: str(raw?.phone, 30),
          notes: str(raw?.notes, 2000),
        },
        nowIso,
      );
      results.push(
        r.status === 'skipped'
          ? { key, status: 'skipped', reason: r.reason }
          : { key, status: r.status, clientId: r.client.id, clientName: r.client.name },
      );
    } catch (err) {
      console.error('acuitySync import_clients item failed:', err instanceof Error ? err.message : String(err));
      results.push({ key, status: 'error' });
    }
  }
  const summary = summarize(results);
  await recordImport(config, orgId, uid, 'client', summary);
  return { results, summary };
}

async function importAppointments(orgId: string, uid: string, data: Record<string, unknown>, t: T) {
  const ids = [
    ...new Set(asArray<unknown>(data.appointmentIds).map((id) => String(id)).filter((id) => /^\d{1,20}$/.test(id))),
  ];
  if (ids.length === 0 || ids.length > APPOINTMENT_BATCH) {
    throw new HttpsError('invalid-argument', t('batch_size', { max: APPOINTMENT_BATCH }));
  }
  const { config, creds } = await requireConnection(orgId, t);
  await consumeRateLimit(orgId, 'acuityImport', 1000);

  // Re-read each appointment from Acuity so the import uses current data, not what the browser saw.
  const [fetched, mapping, timeZone] = await Promise.all([
    mapLimit(ids, 3, async (id) => {
      const fetchedAt = Date.now();
      try {
        return { id, fetchedAt, appt: await acuityRequest<AcuityAppointment>(creds, `appointments/${id}`), error: null as unknown };
      } catch (error) {
        return { id, fetchedAt, appt: null, error };
      }
    }),
    MappingResolver.load(orgId, config.data),
    orgTimeZone(orgId),
  ]);

  const isMissing = (error: unknown) => error instanceof AcuityApiError && error.status === 404;
  const hardError = fetched.find((f) => f.error && !isMissing(f.error))?.error;
  if (hardError && fetched.every((f) => !f.appt)) throw hardError; // e.g. revoked key — surface the real reason

  const ctx = { orgId, timeZone, clients: lazyClientIndex(orgId), mapping, now: Date.now() };
  const createMissingClients = data.createMissingClients !== false;
  const results: Array<{ id: string; status: ItemStatus; reason?: string | null; [k: string]: unknown }> = [];
  // Sequential on purpose: a second booking by the same new client must reuse the client created for the first.
  for (const { id, appt, error, fetchedAt } of fetched) {
    if (!appt) {
      if (!isMissing(error)) {
        console.error('acuitySync fetch failed:', id, error instanceof Error ? error.message : String(error));
      }
      results.push(isMissing(error) ? { id, status: 'skipped', reason: 'not_found_in_acuity' } : { id, status: 'error' });
      continue;
    }
    try {
      const opts = { createMissingClients, allowCreate: true, skipCanceled: false, fetchedAt };
      results.push({ id, ...(await importAcuityAppointment(ctx, appt, opts)) });
    } catch (err) {
      console.error('acuitySync import_appointments item failed:', id, err instanceof Error ? err.message : String(err));
      results.push({ id, status: 'error' });
    }
  }
  const summary = summarize(results);
  await recordImport(config, orgId, uid, 'appointment', summary);
  return { results, summary };
}

/**
 * Admin-only Acuity bridge for Settings → Acuity: connect the org's own Acuity
 * account, browse its clients and appointments, and import only the ones the
 * admin selects.
 */
export const acuitySync = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }
  const uid = request.auth.uid;
  const t = makeT(STRINGS, await getCallerLanguage(uid));
  const data = (request.data ?? {}) as Record<string, unknown>;
  const orgId = typeof data.organizationId === 'string' ? data.organizationId : '';
  if (!orgId) throw new HttpsError('invalid-argument', t('org_required'));

  const user = (await db.collection('users').doc(uid).get()).data();
  if (!user || user.role !== 'admin' || user.organizationId !== orgId) {
    throw new HttpsError('permission-denied', t('admin_required'));
  }

  try {
    switch (data.action) {
      case 'save_credentials':
        return await saveCredentials(orgId, data, t);
      case 'test_connection':
        return await testConnection(orgId, t);
      case 'list_meta':
        return await listMeta(orgId, t);
      case 'list_clients':
        return await listClients(orgId, data, t);
      case 'list_appointments':
        return await listAppointments(orgId, data, t);
      case 'import_clients':
        return await importClients(orgId, uid, data, t);
      case 'import_appointments':
        return await importAppointments(orgId, uid, data, t);
      default:
        throw new HttpsError('invalid-argument', t('unknown_action'));
    }
  } catch (err) {
    throw toHttpsError(err, t);
  }
});
