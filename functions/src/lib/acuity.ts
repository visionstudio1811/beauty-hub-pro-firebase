import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/* ------------------------------------------------------------------ API client */

// End-to-end tests point the Functions emulator at a local mock Acuity server
// (ACUITY_API_BASE in functions/.env.local). Ignored outside the emulator.
const API_BASE =
  process.env.FUNCTIONS_EMULATOR === 'true' && process.env.ACUITY_API_BASE
    ? process.env.ACUITY_API_BASE
    : 'https://acuityscheduling.com/api/v1';
const REQUEST_TIMEOUT_MS = 25_000;

export interface AcuityCredentials {
  userId: string;
  apiKey: string;
}

export class AcuityApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'AcuityApiError';
  }
}

/** One Acuity REST call (HTTP Basic auth). Retries once when Acuity rate-limits (429). */
export async function acuityRequest<T>(
  creds: AcuityCredentials,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {},
): Promise<T> {
  const auth = Buffer.from(`${creds.userId}:${creds.apiKey}`).toString('base64');
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/${path}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      throw new AcuityApiError(res.status, `Acuity API error ${res.status}${text ? `: ${text}` : ''}`);
    }
    return (await res.json()) as T;
  }
}

/* ------------------------------------------------------------------ Acuity shapes */

export interface AcuityAppointment {
  id: number | string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  datetime?: string; // "2026-09-26T10:15:00-0600" — calendar-local time with offset
  duration?: string | number;
  type?: string;
  appointmentTypeID?: number | string | null;
  calendar?: string;
  calendarID?: number | string | null;
  price?: string;
  notes?: string;
  canceled?: boolean | string;
  noShow?: boolean | string;
  timezone?: string;
  labels?: Array<{ name?: string }> | null;
}

export interface AcuityClient {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface AcuityMe {
  id?: number;
  name?: string;
  email?: string;
  timezone?: string;
}

/* ------------------------------------------------------------------ Config + credentials */

export interface AcuityConfig {
  ref: admin.firestore.DocumentReference;
  data: admin.firestore.DocumentData;
}

export type WebhookImportMode = 'off' | 'existing_clients' | 'all';

export function webhookImportMode(data: admin.firestore.DocumentData): WebhookImportMode {
  const mode = data.webhook_import_mode;
  return mode === 'off' || mode === 'all' ? mode : 'existing_clients';
}

const CONFIG_DOC_ID = 'main';

function configCollection(orgId: string) {
  return db.collection('organizations').doc(orgId).collection('acuitySyncConfig');
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  return e?.code === 6 || e?.code === 'already-exists' || /already exists/i.test(String(e?.message ?? ''));
}

/** The org's single acuitySyncConfig doc, or null when Acuity was never set up. */
export async function getAcuityConfig(orgId: string): Promise<AcuityConfig | null> {
  const snap = await configCollection(orgId).limit(1).get();
  if (snap.empty) return null;
  return { ref: snap.docs[0].ref, data: snap.docs[0].data() };
}

/** Creates the config doc under a fixed id, so two concurrent first connects can't create two. */
export async function createAcuityConfig(orgId: string): Promise<AcuityConfig> {
  const ref = configCollection(orgId).doc(CONFIG_DOC_ID);
  const now = new Date().toISOString();
  try {
    await ref.create({
      organization_id: orgId,
      sync_enabled: false,
      webhook_import_mode: 'existing_clients',
      created_at: now,
      updated_at: now,
      created_at_ts: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
  }
  return { ref, data: (await ref.get()).data() ?? {} };
}

/**
 * Secrets live in `acuitySyncConfig/{id}/secret/value`. No Firestore rule
 * matches that path, so only the Admin SDK can read or write it; the
 * admin-readable config doc keeps just `has_api_key` / `api_key_last4`.
 */
function secretRef(config: AcuityConfig) {
  return config.ref.collection('secret').doc('value');
}

export async function saveAcuityApiKey(config: AcuityConfig, apiKey: string): Promise<void> {
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.set(secretRef(config), { api_key: apiKey, updated_at: now }, { merge: true });
  batch.update(config.ref, {
    has_api_key: true,
    api_key_last4: apiKey.slice(-4),
    api_key_encrypted: FieldValue.delete(),
    webhook_secret: FieldValue.delete(),
    updated_at: now,
  });
  await batch.commit();
}

export interface AcuitySecrets {
  apiKey: string | null;
  /** Legacy extra webhook-signing secret. Acuity signs with the API key, so this is usually unset. */
  webhookSecret: string | null;
}

/**
 * The org's write-only secrets. The old settings screen kept the API key
 * (`api_key_encrypted`) and a webhook secret (in practice the same key) in
 * plaintext on the admin-readable config doc; this moves them into the secret
 * subdoc first. It runs in a transaction on fresh data, so a stale snapshot
 * can't overwrite a key saved a moment earlier.
 */
export async function loadAcuitySecrets(config: AcuityConfig): Promise<AcuitySecrets> {
  const secret = secretRef(config);
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return db.runTransaction(async (tx) => {
    const [cfgSnap, secSnap] = await tx.getAll(config.ref, secret);
    const cfg = cfgSnap.data() ?? {};
    const sec = secSnap.data() ?? {};
    let apiKey = text(sec.api_key) || null;
    let webhookSecret = text(sec.webhook_secret) || null;
    if (!('api_key_encrypted' in cfg) && !('webhook_secret' in cfg)) return { apiKey, webhookSecret };

    const legacyKey = text(cfg.api_key_encrypted);
    const legacyWebhookSecret = text(cfg.webhook_secret);
    if (legacyKey) apiKey = legacyKey; // the old screen's last save is the newest key
    if (legacyWebhookSecret && legacyWebhookSecret !== apiKey) webhookSecret = legacyWebhookSecret;
    const now = new Date().toISOString();
    const moved: Record<string, unknown> = { updated_at: now };
    if (apiKey) moved.api_key = apiKey;
    if (webhookSecret) moved.webhook_secret = webhookSecret;
    tx.set(secret, moved, { merge: true });
    tx.update(config.ref, {
      api_key_encrypted: FieldValue.delete(),
      webhook_secret: FieldValue.delete(),
      ...(apiKey ? { has_api_key: true, api_key_last4: apiKey.slice(-4) } : {}),
      updated_at: now,
    });
    return { apiKey, webhookSecret };
  });
}

/** The org's own Acuity credentials (never a shared/global account) plus every accepted webhook secret. */
export async function loadAcuityAccess(
  config: AcuityConfig,
): Promise<{ creds: AcuityCredentials | null; webhookSecrets: string[] }> {
  const userId = String(config.data.acuity_user_id ?? '').trim();
  const { apiKey, webhookSecret } = await loadAcuitySecrets(config);
  return {
    creds: userId && apiKey ? { userId, apiKey } : null,
    webhookSecrets: [apiKey, webhookSecret].filter((s): s is string => Boolean(s)),
  };
}

export async function loadAcuityCredentials(config: AcuityConfig): Promise<AcuityCredentials | null> {
  return (await loadAcuityAccess(config)).creds;
}

/* ------------------------------------------------------------------ Normalization */

const NON_WORD = new RegExp('[^\\p{L}\\p{N}]+', 'gu');

export function fullName(first: unknown, last: unknown): string {
  return `${String(first ?? '').trim()} ${String(last ?? '').trim()}`.trim();
}

export function emailKey(value: unknown): string | null {
  const s = String(value ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/**
 * Phones are stored in whatever format staff typed, so compare the last 9
 * digits: "+1 (801) 555-1234" and "8015551234" match, and so do "050-…" and
 * "+972 50-…". Never enough on its own to link (see ClientIndex.lookup).
 */
export function phoneKey(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/** Phone as stored on a CRM client: digits, keeping a leading +. */
export function cleanPhone(value: unknown): string | null {
  const s = String(value ?? '').trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return null;
  return s.startsWith('+') ? `+${digits}` : digits;
}

export function nameKey(value: unknown): string | null {
  const s = String(value ?? '').toLowerCase().replace(NON_WORD, ' ').trim();
  return s.length >= 3 ? s : null;
}

/** "Hydra Facial" and "HydraFacial" compare equal. */
function compactKey(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(NON_WORD, '');
}

export function isCanceled(appt: AcuityAppointment): boolean {
  return appt.canceled === true || appt.canceled === 'true';
}

/** Acuity marks a no-show as a cancellation with `noShow`; some accounts use a "No show" label instead. */
export function isNoShow(appt: AcuityAppointment): boolean {
  return (
    appt.noShow === true ||
    appt.noShow === 'true' ||
    (appt.labels ?? []).some((label) => /no[\s-]?show/i.test(String(label?.name ?? '')))
  );
}

/* ------------------------------------------------------------------ Date + time */

/** Acuity's "2026-07-02T10:15:00-0700" (offset without a colon) → epoch millis. */
export function parseAcuityDateTime(value: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|([+-])(\d{2}):?(\d{2}))$/.exec(
    String(value ?? '').trim(),
  );
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (m[7] === 'Z') return utc;
  const offsetMinutes = (+m[9] * 60 + +m[10]) * (m[8] === '+' ? 1 : -1);
  return utc - offsetMinutes * 60_000;
}

/** Wall-clock YYYY-MM-DD / HH:mm of an instant in `timeZone`. Throws RangeError for an unknown zone. */
export function wallClock(ms: number, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}

/** UTC offset of `timeZone` at an instant, in minutes (e.g. -360 for Denver in summer). */
function offsetMinutes(ms: number, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' } as Intl.DateTimeFormatOptions)
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/**
 * "2026-09-26" + "10:00" as wall-clock time in `timeZone` → "2026-09-26T10:00:00-06:00".
 * Sending the offset means Acuity books the right instant even when the
 * calendar's timezone differs from the org's.
 */
export function wallClockToIso(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offset = offsetMinutes(asUtc - offsetMinutes(asUtc, timeZone) * 60_000, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${date}T${pad(h)}:${pad(mi)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function parseDuration(value: unknown): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 && n <= 24 * 60 ? n : 60;
}

export interface AcuitySlot {
  date: string; // YYYY-MM-DD in the org timezone
  time: string; // HH:mm in the org timezone
  duration: number;
  endMs: number | null;
}

/** Where an Acuity appointment lands on the CRM calendar (the CRM stores org-local wall-clock strings). */
export function acuitySlot(appt: AcuityAppointment, orgTimeZone: string): AcuitySlot | null {
  const duration = parseDuration(appt.duration);
  const startMs = parseAcuityDateTime(appt.datetime);
  if (startMs != null) {
    for (const tz of [orgTimeZone, appt.timezone]) {
      if (!tz) continue;
      try {
        return { ...wallClock(startMs, tz), duration, endMs: startMs + duration * 60_000 };
      } catch {
        // Unknown zone — try the next one.
      }
    }
  }
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(appt.datetime ?? ''));
  if (!m) return null;
  return { date: m[1], time: m[2], duration, endMs: startMs == null ? null : startMs + duration * 60_000 };
}

/**
 * Status for a newly imported appointment. Past visits land as completed so
 * visit counts and "last visit" are right. Only used on create — an update
 * never moves an appointment to completed, because that transition fires the
 * feedback automation.
 */
function initialStatus(appt: AcuityAppointment, slot: AcuitySlot, now: number): string {
  if (isCanceled(appt)) return isNoShow(appt) ? 'no-show' : 'cancelled';
  if (slot.endMs != null && slot.endMs <= now) return isNoShow(appt) ? 'no-show' : 'completed';
  return 'scheduled';
}

function parseMoney(value: unknown): number | null {
  const n = parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ CRM client matching */

export interface CrmClientRef {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linked: boolean;
}

export interface ClientMatch {
  client: CrmClientRef;
  by: 'email' | 'phone';
}

export interface ClientLookup {
  match: ClientMatch | null;
  /** Several CRM clients fit equally well — never linked automatically. */
  ambiguous: boolean;
  /** A near miss worth showing the admin (same phone, or same name). Never used to link. */
  hint: { client: CrmClientRef; reason: 'phone' | 'name' } | null;
}

function clientsCol(orgId: string) {
  return db.collection('organizations').doc(orgId).collection('clients');
}

function appointmentsCol(orgId: string) {
  return db.collection('organizations').doc(orgId).collection('appointments');
}

/**
 * The org's active CRM clients indexed by email / phone / name. Loaded with one
 * projected read so matching stays case- and format-insensitive (stored
 * emails and phones are not normalized, so exact-match queries would miss).
 */
export class ClientIndex {
  private readonly byEmail = new Map<string, CrmClientRef[]>();
  private readonly byPhone = new Map<string, CrmClientRef[]>();
  private readonly byName = new Map<string, CrmClientRef[]>();

  static async load(orgId: string): Promise<ClientIndex> {
    const snap = await clientsCol(orgId)
      .select('name', 'email', 'phone', 'deleted_at', 'deletedAt', 'acuity_sync_enabled')
      .get();
    const index = new ClientIndex();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.deleted_at || d.deletedAt) continue;
      index.add({
        id: doc.id,
        name: String(d.name ?? ''),
        email: d.email ? String(d.email) : null,
        phone: d.phone ? String(d.phone) : null,
        linked: d.acuity_sync_enabled === true,
      });
    }
    return index;
  }

  add(client: CrmClientRef): void {
    const push = (map: Map<string, CrmClientRef[]>, key: string | null) => {
      if (!key) return;
      const list = map.get(key) ?? [];
      if (!list.some((c) => c.id === client.id)) list.push(client);
      map.set(key, list);
    };
    push(this.byEmail, emailKey(client.email));
    push(this.byPhone, phoneKey(client.phone));
    push(this.byName, nameKey(client.name));
  }

  /**
   * Email identifies a person. A phone number doesn't (households and front
   * desks share numbers), so a phone match also needs the same name and no
   * conflicting email. Anything ambiguous is left for the admin.
   */
  lookup(input: { email?: unknown; phone?: unknown; name?: unknown }): ClientLookup {
    const e = emailKey(input.email);
    if (e) {
      const byEmail = this.byEmail.get(e) ?? [];
      if (byEmail.length === 1) return { match: { client: byEmail[0], by: 'email' }, ambiguous: false, hint: null };
      if (byEmail.length > 1) return { match: null, ambiguous: true, hint: null };
    }
    const n = nameKey(input.name);
    const p = phoneKey(input.phone);
    const byPhone = p ? this.byPhone.get(p) ?? [] : [];
    const samePerson = byPhone.filter((c) => {
      const ce = emailKey(c.email);
      return Boolean(n) && nameKey(c.name) === n && (!e || !ce || ce === e);
    });
    if (samePerson.length === 1) return { match: { client: samePerson[0], by: 'phone' }, ambiguous: false, hint: null };
    if (samePerson.length > 1) return { match: null, ambiguous: true, hint: null };
    if (byPhone.length) return { match: null, ambiguous: false, hint: { client: byPhone[0], reason: 'phone' } };
    const byName = n ? this.byName.get(n) ?? [] : [];
    return { match: null, ambiguous: false, hint: byName.length ? { client: byName[0], reason: 'name' } : null };
  }
}

/** Loads the client index on first use only (a webhook for an already-linked visit never needs it). */
export function lazyClientIndex(orgId: string): () => Promise<ClientIndex> {
  let pending: Promise<ClientIndex> | null = null;
  return () => {
    if (!pending) pending = ClientIndex.load(orgId);
    return pending;
  };
}

/* ------------------------------------------------------------------ Service / staff mapping */

interface NamedDoc {
  id: string;
  name: string;
  active: boolean;
}

export interface ResolvedRef {
  id: string | null;
  name: string;
  via: 'mapping' | 'portal' | 'name' | 'none';
}

/** The client-portal push mapping is CRM id → Acuity id; invert it so imports can reuse it. */
function invertPortalMapping(map: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!map || typeof map !== 'object') return out;
  for (const [crmId, value] of Object.entries(map as Record<string, unknown>)) {
    const v = value as Record<string, unknown> | string | number | null;
    const acuityId =
      v && typeof v === 'object'
        ? v.appointmentTypeID ?? v.appointment_type_id ?? v.calendarID ?? v.calendar_id
        : v;
    if (acuityId != null && acuityId !== '' && !out.has(String(acuityId))) out.set(String(acuityId), crmId);
  }
  return out;
}

/**
 * Decides which CRM treatment / staff member an Acuity appointment type /
 * calendar becomes: the admin's explicit import mapping first, then the
 * client-portal mapping, then an exact (spacing/case-insensitive) name match.
 * Unmatched values keep the Acuity name with no CRM id.
 */
export class MappingResolver {
  private constructor(
    readonly treatments: NamedDoc[],
    readonly staff: NamedDoc[],
    private readonly typeMappings: Record<string, unknown>,
    private readonly calendarMappings: Record<string, unknown>,
    private readonly portalTypes: Map<string, string>,
    private readonly portalCalendars: Map<string, string>,
  ) {}

  static async load(orgId: string, config: admin.firestore.DocumentData): Promise<MappingResolver> {
    const org = db.collection('organizations').doc(orgId);
    const [treatments, staff] = await Promise.all([
      org.collection('treatments').select('name', 'is_active', 'deleted_at').get(),
      org.collection('staff').select('name', 'is_active', 'isActive', 'deleted_at').get(),
    ]);
    const named = (snap: admin.firestore.QuerySnapshot): NamedDoc[] =>
      snap.docs
        .filter((d) => !d.data().deleted_at)
        .map((d) => ({
          id: d.id,
          name: String(d.data().name ?? '').trim(),
          active: d.data().is_active !== false && d.data().isActive !== false,
        }))
        .filter((d) => d.name);
    const imports = (config.acuity_import_mappings ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const portal = (config.client_portal_acuity_mappings ?? {}) as Record<string, unknown>;
    return new MappingResolver(
      named(treatments),
      named(staff),
      imports.appointment_types ?? {},
      imports.calendars ?? {},
      invertPortalMapping(portal.treatments),
      invertPortalMapping(portal.staff_calendars),
    );
  }

  treatmentFor(appointmentTypeId: unknown, typeName: unknown): ResolvedRef {
    return resolve(this.treatments, appointmentTypeId, typeName, this.typeMappings, this.portalTypes);
  }

  staffFor(calendarId: unknown, calendarName: unknown): ResolvedRef {
    return resolve(this.staff, calendarId, calendarName, this.calendarMappings, this.portalCalendars);
  }
}

function resolve(
  docs: NamedDoc[],
  acuityId: unknown,
  acuityName: unknown,
  explicit: Record<string, unknown>,
  portal: Map<string, string>,
): ResolvedRef {
  const name = String(acuityName ?? '').trim();
  const key = acuityId == null || acuityId === '' ? null : String(acuityId);
  if (key && Object.prototype.hasOwnProperty.call(explicit, key)) {
    const target = explicit[key];
    if (!target) return { id: null, name, via: 'none' }; // admin chose "keep the Acuity name"
    const doc = docs.find((d) => d.id === target);
    if (doc) return { id: doc.id, name: doc.name, via: 'mapping' };
    // Mapped to a record that no longer exists — fall back to the automatic rules.
  }
  const portalId = key ? portal.get(key) : undefined;
  const portalDoc = portalId ? docs.find((d) => d.id === portalId) : undefined;
  if (portalDoc) return { id: portalDoc.id, name: portalDoc.name, via: 'portal' };
  const k = compactKey(name);
  if (k) {
    const matches = docs.filter((d) => compactKey(d.name) === k);
    const doc = matches.find((d) => d.active) ?? matches[0];
    if (doc) return { id: doc.id, name: doc.name, via: 'name' };
  }
  return { id: null, name, via: 'none' };
}

/* ------------------------------------------------------------------ Client import */

function acuityStamp(nowIso: string) {
  return {
    acuity_sync_enabled: true,
    acuity_linked_at: nowIso,
    last_synced_at: nowIso,
    sync_status: 'synced',
    updated_at: FieldValue.serverTimestamp(),
  };
}

export interface AcuityClientInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export type ClientSkipReason = 'missing_name' | 'missing_contact' | 'ambiguous_match';

export type ClientImportResult =
  | { status: 'created'; client: CrmClientRef }
  | { status: 'linked'; client: CrmClientRef; by: 'email' | 'phone' }
  | { status: 'skipped'; reason: ClientSkipReason };

/**
 * Brings one Acuity client into the CRM: links the matching CRM client (see
 * ClientIndex.lookup) or creates one. Linking only fills fields that are empty
 * in the CRM, so staff edits are never overwritten.
 */
export async function importAcuityClient(
  orgId: string,
  index: ClientIndex,
  input: AcuityClientInput,
  nowIso: string,
): Promise<ClientImportResult> {
  const name = fullName(input.firstName, input.lastName);
  const email = emailKey(input.email);
  const phone = cleanPhone(input.phone);
  const notes = String(input.notes ?? '').trim();
  if (!name) return { status: 'skipped', reason: 'missing_name' };
  if (!email && !phoneKey(phone)) return { status: 'skipped', reason: 'missing_contact' };

  const found = index.lookup({ email, phone, name });
  if (found.ambiguous) return { status: 'skipped', reason: 'ambiguous_match' };
  if (found.match) {
    const { client, by } = found.match;
    const ref = clientsCol(orgId).doc(client.id);
    const current = (await ref.get()).data() ?? {};
    const fill: Record<string, unknown> = {};
    // Email is what the client portal links accounts on, so it's never filled
    // in from a phone match — that could be a relative sharing the number.
    if (by === 'email' && !current.phone && phone) fill.phone = phone;
    if (!current.notes && notes) fill.notes = notes;
    await ref.update({ ...fill, ...acuityStamp(nowIso) });
    client.linked = true;
    return { status: 'linked', client, by };
  }

  // Deterministic id so two concurrent imports (e.g. back-to-back webhooks for
  // the same new client) can't create the client twice.
  const fingerprint = crypto.createHash('sha256').update(email ?? `phone:${phoneKey(phone)}`).digest('hex');
  const ref = clientsCol(orgId).doc(`acuity-${fingerprint.slice(0, 24)}`);
  const doc = {
    name,
    email,
    phone: phone ?? '',
    address: null,
    city: null,
    date_of_birth: null,
    referral_source: null,
    allergies: null,
    notes: notes || null,
    has_membership: false,
    organization_id: orgId,
    deleted_at: null,
    created_at: FieldValue.serverTimestamp(),
    source: 'acuity',
    ...acuityStamp(nowIso),
  };
  try {
    await ref.create(doc);
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    const existing = await ref.get();
    const d = existing.data() ?? {};
    if (!d.deleted_at && !d.deletedAt) {
      const client = { id: ref.id, name: String(d.name ?? name), email: d.email ?? email, phone: d.phone ?? phone, linked: true };
      index.add(client);
      return { status: 'linked', client, by: email ? 'email' : 'phone' };
    }
    // The earlier import was soft-deleted — start a fresh card.
    const fresh = clientsCol(orgId).doc();
    await fresh.set(doc);
    const client = { id: fresh.id, name, email, phone, linked: true };
    index.add(client);
    return { status: 'created', client };
  }
  const client = { id: ref.id, name, email, phone, linked: true };
  index.add(client);
  return { status: 'created', client };
}

/* ------------------------------------------------------------------ Appointment import */

export interface ImportContext {
  orgId: string;
  timeZone: string;
  clients: () => Promise<ClientIndex>;
  mapping: MappingResolver;
  now: number;
}

export interface AppointmentImportOptions {
  /** Create a CRM client when nobody matches the booking's email/phone. */
  createMissingClients: boolean;
  /** False = only refresh appointments that are already in the CRM. */
  allowCreate: boolean;
  /** Don't create CRM records for bookings that are already canceled. */
  skipCanceled: boolean;
  /** When the appointment was read from Acuity. An older read never overwrites a newer one. */
  fetchedAt: number;
}

export type AppointmentSkipReason =
  | 'invalid_datetime'
  | 'not_imported'
  | 'canceled'
  | 'client_not_in_crm'
  | 'missing_client_details'
  | 'ambiguous_client';

export type AppointmentImportResult =
  | { status: 'created' | 'updated' | 'linked'; appointmentId: string; clientId: string | null; clientCreated: boolean }
  | { status: 'skipped'; reason: AppointmentSkipReason };

/** What Acuity said at the last sync. A CRM edit survives until Acuity changes that same field. */
interface AcuitySeen {
  date: string;
  time: string;
  duration: number;
  canceled: boolean;
}

interface ResolvedClient {
  client: CrmClientRef;
  created: boolean;
  by: 'email' | 'phone' | 'created';
}

async function resolveClient(
  ctx: ImportContext,
  appt: AcuityAppointment,
  create: boolean,
  nowIso: string,
): Promise<ResolvedClient | { skip: AppointmentSkipReason }> {
  const index = await ctx.clients();
  const found = index.lookup({ email: appt.email, phone: appt.phone, name: fullName(appt.firstName, appt.lastName) });
  if (found.ambiguous) return { skip: 'ambiguous_client' };
  if (found.match) {
    if (!found.match.client.linked) {
      await clientsCol(ctx.orgId).doc(found.match.client.id).update(acuityStamp(nowIso));
      found.match.client.linked = true;
    }
    return { client: found.match.client, created: false, by: found.match.by };
  }
  if (!create) return { skip: 'client_not_in_crm' };
  const result = await importAcuityClient(
    ctx.orgId,
    index,
    { firstName: appt.firstName, lastName: appt.lastName, email: appt.email, phone: appt.phone },
    nowIso,
  );
  if (result.status === 'skipped') {
    return { skip: result.reason === 'ambiguous_match' ? 'ambiguous_client' : 'missing_client_details' };
  }
  return result.status === 'created'
    ? { client: result.client, created: true, by: 'created' }
    : { client: result.client, created: false, by: result.by };
}

function denormalizedClient(resolved: ResolvedClient, appt: AcuityAppointment) {
  const { client, by } = resolved;
  // A phone-only match may be a relative sharing the number, so its Acuity
  // contact details aren't copied onto the visit.
  const trusted = by !== 'phone';
  return {
    client_name: client.name || fullName(appt.firstName, appt.lastName),
    client_email: client.email || (trusted ? emailKey(appt.email) : null),
    client_phone: client.phone || (trusted ? cleanPhone(appt.phone) : null),
  };
}

/**
 * Changes for an appointment that is already in the CRM. Date, time, duration
 * and cancellation follow Acuity only when Acuity changed them since the last
 * sync, so CRM edits (add-on minutes, a CRM-side cancellation) survive
 * unrelated Acuity events. Treatment/staff follow Acuity until staff pick
 * something else. Never moves a visit to 'completed'.
 */
function mergeFromAcuity(
  cur: admin.firestore.DocumentData,
  appt: AcuityAppointment,
  seen: AcuitySeen,
  treatment: ResolvedRef,
  staff: ResolvedRef,
): Record<string, unknown> {
  const prev = cur.acuity_seen as AcuitySeen | undefined;
  const update: Record<string, unknown> = {};
  // No `prev`: the first sync of a visit that didn't come from an Acuity import
  // (adopted, or pushed from the client portal). Keep the CRM's values.
  if (prev) {
    if (seen.date !== prev.date || seen.time !== prev.time) {
      update.appointment_date = seen.date;
      update.appointment_time = seen.time;
    }
    if (seen.duration !== prev.duration) update.duration = seen.duration;
    if (seen.canceled !== prev.canceled) {
      if (seen.canceled) {
        // A visit the CRM already closed out stays completed / no-show.
        if (cur.status !== 'completed' && cur.status !== 'no-show') update.status = isNoShow(appt) ? 'no-show' : 'cancelled';
      } else if (cur.status === 'cancelled') {
        update.status = 'scheduled';
      }
    }
  }
  if (!cur.treatment_id || cur.treatment_id === cur.acuity_mapped_treatment_id) {
    Object.assign(update, {
      treatment_id: treatment.id,
      treatment_name: treatment.name || null,
      acuity_mapped_treatment_id: treatment.id,
    });
  }
  if (!cur.staff_id || cur.staff_id === cur.acuity_mapped_staff_id) {
    Object.assign(update, { staff_id: staff.id, staff_name: staff.name || null, acuity_mapped_staff_id: staff.id });
  }
  if (!cur.notes && appt.notes?.trim()) update.notes = appt.notes.trim();
  return update;
}

/** Reads either directly or inside a transaction. */
interface Reader {
  doc(ref: admin.firestore.DocumentReference): Promise<admin.firestore.DocumentSnapshot>;
  query(q: admin.firestore.Query): Promise<admin.firestore.QuerySnapshot>;
}

const directReader: Reader = { doc: (ref) => ref.get(), query: (q) => q.get() };

function txReader(tx: admin.firestore.Transaction): Reader {
  return { doc: (ref) => tx.get(ref), query: (q) => tx.get(q) };
}

async function findImported(
  read: Reader,
  fixedRef: admin.firestore.DocumentReference,
  acuityId: string,
): Promise<admin.firestore.DocumentSnapshot | null> {
  const fixed = await read.doc(fixedRef);
  if (fixed.exists) return fixed;
  // Adopted appointments keep their original doc id.
  const byField = await read.query(fixedRef.parent.where('acuity_appointment_id', '==', acuityId).limit(1));
  return byField.empty ? null : byField.docs[0];
}

/**
 * Creates or refreshes the CRM appointment for one Acuity appointment.
 * Imported docs use the id `acuity_{acuityId}` and always carry
 * `acuity_appointment_id`, which makes appointmentScheduledNotification skip
 * the client confirmation (Acuity already sent one). The write runs in a
 * transaction, so concurrent imports/webhooks can't duplicate an appointment,
 * double-adopt one, or let an older Acuity read overwrite a newer one.
 */
export async function importAcuityAppointment(
  ctx: ImportContext,
  appt: AcuityAppointment,
  opts: AppointmentImportOptions,
): Promise<AppointmentImportResult> {
  const col = appointmentsCol(ctx.orgId);
  const acuityId = String(appt.id);
  const safeId = acuityId.replace(/[^A-Za-z0-9_-]/g, '_');
  const slot = acuitySlot(appt, ctx.timeZone);
  if (!slot) return { status: 'skipped', reason: 'invalid_datetime' };

  const nowIso = new Date(ctx.now).toISOString();
  const canceled = isCanceled(appt);
  const treatment = ctx.mapping.treatmentFor(appt.appointmentTypeID, appt.type);
  const staff = ctx.mapping.staffFor(appt.calendarID, appt.calendar);
  const seen: AcuitySeen = { date: slot.date, time: slot.time, duration: slot.duration, canceled };
  const syncFields = {
    acuity_appointment_id: acuityId,
    acuity_calendar_id: appt.calendarID != null ? String(appt.calendarID) : null,
    acuity_appointment_type_id: appt.appointmentTypeID != null ? String(appt.appointmentTypeID) : null,
    acuity_seen: seen,
    acuity_fetched_at_ms: opts.fetchedAt,
    acuity_sync_enabled: true,
    sync_status: 'synced',
    sync_error: null,
    last_synced_at: nowIso,
    updated_at: FieldValue.serverTimestamp(),
  };
  const fixedRef = col.doc(`acuity_${safeId}`);
  const tombstoneRef = db.collection('organizations').doc(ctx.orgId).collection('acuityTombstones').doc(safeId);

  // Resolve (and maybe create) the client before the transaction. Client
  // creation is idempotent (fixed ids), so a transaction retry can't duplicate it.
  const peek = await findImported(directReader, fixedRef, acuityId);
  const mayCreate = !peek && opts.allowCreate && !(canceled && opts.skipCanceled);
  if (mayCreate) {
    const tomb = await tombstoneRef.get();
    if (tomb.exists && Number(tomb.data()?.fetched_at_ms ?? 0) > opts.fetchedAt) {
      return { status: 'skipped', reason: 'canceled' };
    }
  }
  let resolved: ResolvedClient | null = null;
  let clientSkip: AppointmentSkipReason | null = null;
  if (mayCreate || (peek && !peek.data()?.client_id)) {
    const r = await resolveClient(ctx, appt, opts.createMissingClients, nowIso);
    if ('skip' in r) clientSkip = r.skip;
    else resolved = r;
  }

  return db.runTransaction(async (tx): Promise<AppointmentImportResult> => {
    const existing = await findImported(txReader(tx), fixedRef, acuityId);

    if (existing) {
      const cur = existing.data() ?? {};
      const linkClient = !cur.client_id && resolved;
      const clientId: string | null = cur.client_id ?? (linkClient ? resolved!.client.id : null);
      // A newer Acuity read already landed (e.g. a webhook during a batch import).
      if (Number(cur.acuity_fetched_at_ms ?? 0) > opts.fetchedAt) {
        return { status: 'updated', appointmentId: existing.id, clientId, clientCreated: false };
      }
      const update: Record<string, unknown> = { ...syncFields, ...mergeFromAcuity(cur, appt, seen, treatment, staff) };
      if (linkClient) Object.assign(update, { client_id: resolved!.client.id, ...denormalizedClient(resolved!, appt) });
      tx.update(existing.ref, update);
      return { status: 'updated', appointmentId: existing.id, clientId, clientCreated: Boolean(linkClient && resolved!.created) };
    }

    if (canceled && opts.skipCanceled) {
      // Remember the cancellation, so a slower handler still holding an older
      // "scheduled" read of this booking can't create a ghost appointment.
      tx.set(tombstoneRef, { acuity_id: acuityId, fetched_at_ms: opts.fetchedAt }, { merge: true });
      return { status: 'skipped', reason: 'canceled' };
    }
    if (!opts.allowCreate) return { status: 'skipped', reason: 'not_imported' };
    const tomb = await tx.get(tombstoneRef);
    if (tomb.exists && Number(tomb.data()?.fetched_at_ms ?? 0) > opts.fetchedAt) {
      return { status: 'skipped', reason: 'canceled' };
    }
    if (!resolved) return { status: 'skipped', reason: clientSkip ?? 'not_imported' };

    // The visit may already be in the CRM without an Acuity id (booked in both
    // systems, or a portal booking whose push to Acuity hasn't written its id
    // back yet). Adopt it instead of creating a duplicate.
    const client = resolved.client;
    const sameDay = await tx.get(col.where('appointment_date', '==', slot.date));
    const twin = sameDay.docs.find((d) => {
      const x = d.data();
      return !x.acuity_appointment_id && x.client_id === client.id && x.appointment_time === slot.time && x.status !== 'cancelled';
    });
    if (twin) {
      const cur = twin.data();
      const update: Record<string, unknown> = { ...syncFields };
      if (!cur.treatment_id && treatment.id) {
        Object.assign(update, { treatment_id: treatment.id, treatment_name: treatment.name, acuity_mapped_treatment_id: treatment.id });
      }
      if (!cur.staff_id && staff.id) {
        Object.assign(update, { staff_id: staff.id, staff_name: staff.name, acuity_mapped_staff_id: staff.id });
      }
      tx.update(twin.ref, update);
      return { status: 'linked', appointmentId: twin.id, clientId: client.id, clientCreated: resolved.created };
    }

    tx.create(fixedRef, {
      client_id: client.id,
      ...denormalizedClient(resolved, appt),
      treatment_id: treatment.id,
      treatment_name: treatment.name || null,
      acuity_mapped_treatment_id: treatment.id,
      staff_id: staff.id,
      staff_name: staff.name || null,
      acuity_mapped_staff_id: staff.id,
      appointment_date: slot.date,
      appointment_time: slot.time,
      duration: slot.duration,
      status: initialStatus(appt, slot, ctx.now),
      notes: appt.notes?.trim() || null,
      price: parseMoney(appt.price),
      source: 'acuity',
      organization_id: ctx.orgId,
      created_at: FieldValue.serverTimestamp(),
      ...syncFields,
    });
    return { status: 'created', appointmentId: fixedRef.id, clientId: client.id, clientCreated: resolved.created };
  });
}

/** acuityId → CRM appointment for the ids that are already imported. */
export async function findImportedAppointments(
  orgId: string,
  acuityIds: string[],
): Promise<Map<string, { appointmentId: string; status: string }>> {
  const unique = [...new Set(acuityIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((ids) =>
      appointmentsCol(orgId).where('acuity_appointment_id', 'in', ids).select('acuity_appointment_id', 'status').get(),
    ),
  );
  const out = new Map<string, { appointmentId: string; status: string }>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      out.set(String(d.data().acuity_appointment_id), { appointmentId: d.id, status: String(d.data().status ?? '') });
    }
  }
  return out;
}

/**
 * CRM appointments that didn't come from Acuity, by "clientId|date", so the
 * import list can warn when a visit looks like it was booked in both systems.
 */
export async function crmVisitsByClientDay(
  orgId: string,
  minDate: string,
  maxDate: string,
): Promise<Map<string, Array<{ appointmentId: string; time: string }>>> {
  const snap = await appointmentsCol(orgId)
    .where('appointment_date', '>=', minDate)
    .where('appointment_date', '<=', maxDate)
    .select('client_id', 'appointment_date', 'appointment_time', 'acuity_appointment_id', 'status')
    .get();
  const out = new Map<string, Array<{ appointmentId: string; time: string }>>();
  for (const d of snap.docs) {
    const x = d.data();
    if (x.acuity_appointment_id || !x.client_id || x.status === 'cancelled') continue;
    const key = `${x.client_id}|${x.appointment_date}`;
    const list = out.get(key) ?? [];
    list.push({ appointmentId: d.id, time: String(x.appointment_time ?? '') });
    out.set(key, list);
  }
  return out;
}

export async function orgTimeZone(orgId: string): Promise<string> {
  const org = await db.collection('organizations').doc(orgId).get();
  return String(org.data()?.timezone || 'America/New_York');
}
