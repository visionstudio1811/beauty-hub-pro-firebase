import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { getDefaultTemplateHtml, getElegantDefaultSettings } from './lib/emailTemplates';
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  defineStrings,
  isAppLanguage,
  makeT,
  normalizeLanguage,
  orgLanguageFromData,
} from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Display names of the seeded Layer-2 email templates, as shown in the
// marketing template designer. Resolved against the org's language at seed
// time so a Hebrew org gets Hebrew names next to its Hebrew default HTML.
const STRINGS = defineStrings({
  en: {
    tpl_appointment_confirmation: 'Appointment Confirmation',
    tpl_appointment_reminder: 'Appointment Reminder',
    tpl_booking_request_received: 'Booking Request Received',
    tpl_booking_request_admin_alert: 'Booking Request Alert (Admin)',
    tpl_booking_request_declined: 'Booking Declined',
  },
  he: {
    tpl_appointment_confirmation: 'אישור תור',
    tpl_appointment_reminder: 'תזכורת לתור',
    tpl_booking_request_received: 'בקשת הזמנה התקבלה',
    tpl_booking_request_admin_alert: 'התראה על בקשת הזמנה (מנהל)',
    tpl_booking_request_declined: 'הזמנה נדחתה',
  },
});

const ORG_NAME_TOKEN = /\{\{ORG_NAME\}\}/g;

/** Marker written on every entry this seeder creates, so re-runs can tell a system default from an admin-authored one. */
const SEED_MARKER = 'system:seed';

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

// ---------- Language-keyed master docs ----------
// Master docs in `defaultWaiverTemplates` / `defaultMarketingAutomations` may
// carry a `language: 'en' | 'he'` field. Masters without one are English
// (every master written before i18n). For each kind/trigger the seeder picks
// the master authored in the org's language and falls back to the English one
// when no translation exists yet, so a Hebrew org never gets *nothing* just
// because a Hebrew master hasn't been added.

/** Language a master doc is authored in (`language`, legacy `lang`, else English). */
function masterLanguage(data: Record<string, unknown>): AppLanguage {
  return normalizeLanguage(data.language ?? data.lang);
}

type MasterDoc = admin.firestore.QueryDocumentSnapshot;

interface MasterPick {
  doc: MasterDoc;
  lang: AppLanguage;
}

/**
 * Groups masters by `groupKey` (kind / trigger) and picks one per group:
 * the org-language master if present, else the English one. A group with
 * neither (e.g. a Hebrew-only master for a brand-new kind) is not seeded —
 * English is the platform default and its absence is an authoring gap, so the
 * masters are reported as passed over rather than pushed into every org.
 * Returns the picks, every master that lost the pick (with its language — an
 * informational list surfaced as `mastersPassedOver`, never as an org-level
 * "skipped" row), and the full per-group candidate list (used by the pristine
 * check, which has to compare an org doc against *every* language variant of
 * its master).
 */
function pickMastersForLanguage(
  masters: MasterDoc[],
  groupKey: (data: Record<string, unknown>) => string | undefined,
  lang: AppLanguage,
): {
  picked: Map<string, MasterPick>;
  ungrouped: MasterDoc[];
  passedOver: Array<{ key: string; lang: AppLanguage }>;
  groups: Map<string, MasterPick[]>;
} {
  const groups = new Map<string, MasterPick[]>();
  const ungrouped: MasterDoc[] = [];
  for (const doc of masters) {
    const data = doc.data() as Record<string, unknown>;
    const key = groupKey(data);
    if (!key) {
      ungrouped.push(doc);
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push({ doc, lang: masterLanguage(data) });
    groups.set(key, list);
  }

  const picked = new Map<string, MasterPick>();
  const passedOver: Array<{ key: string; lang: AppLanguage }> = [];
  for (const [key, candidates] of groups) {
    const chosen =
      candidates.find((c) => c.lang === lang) ??
      candidates.find((c) => c.lang === DEFAULT_LANGUAGE);
    if (chosen) picked.set(key, chosen);
    for (const c of candidates) {
      if (c !== chosen) passedOver.push({ key, lang: c.lang });
    }
  }
  return { picked, ungrouped, passedOver, groups };
}

// ---------- Pristine detection for seeded Firestore docs ----------
// A waiver template / automation the seeder wrote is "pristine" when its
// content still deep-equals the master it was seeded from (after the brand
// token is applied). Only pristine docs are ever replaced on a language flip —
// anything an admin has touched is left exactly as it is.

/**
 * Fields the seeder (or the runtime) writes that are not part of the master's
 * content and must not influence the pristine comparison. Any `seeded_*` field
 * is ignored as well (see `isIgnoredForPristine`).
 */
const PRISTINE_IGNORED_FIELDS = new Set<string>([
  'id',
  'organization_id',
  'created_at',
  'updated_at',
  'updated_at_ts',
  // Automations: stamped by the seeder / bumped by the automation runtime.
  'created_by',
  'last_triggered_at',
  // The master's language tag. Legacy org docs were copied from masters that
  // had no `language` field, so tagging the English masters `language: 'en'`
  // (or adding `lang`) must not turn every legacy seeded doc into
  // "customized". The language is tracked separately (`masterLanguage` /
  // `seeded_lang`), not through the content comparison.
  'language',
  'lang',
]);

function isIgnoredForPristine(key: string): boolean {
  return PRISTINE_IGNORED_FIELDS.has(key) || key.startsWith('seeded_');
}

/**
 * Normalises a Firestore value for structural comparison: Timestamps become
 * millis, `undefined` becomes `null`, object keys are sorted and top-level
 * bookkeeping fields are dropped when `topLevel` is true.
 */
function normalizeForCompare(value: unknown, topLevel = false): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof admin.firestore.Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map((v) => normalizeForCompare(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (topLevel && isIgnoredForPristine(key)) continue;
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = normalizeForCompare(v);
    }
    return out;
  }
  return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    if (Array.isArray(b)) return false;
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => k in bo && deepEqual(ao[k], bo[k]));
  }
  return false;
}

/** True when an org doc's content equals the branded master, ignoring bookkeeping fields. */
function contentMatchesMaster(
  orgDocData: Record<string, unknown>,
  master: MasterDoc,
  orgName: string,
): boolean {
  const branded = applyBrandToken(master.data(), orgName) as Record<string, unknown>;
  return deepEqual(normalizeForCompare(orgDocData, true), normalizeForCompare(branded, true));
}

interface PristineMatch {
  /** Master doc the org doc still equals. */
  master: MasterDoc;
  /** Language of that master — i.e. the language the org doc is currently in. */
  lang: AppLanguage;
}

/**
 * Decides whether an existing org doc is still the untouched seeded default
 * for its kind/trigger. Cheap path first: when the doc carries a
 * `seeded_from_master` (or legacy `seeded_from`) stamp pointing at one of the
 * masters in `candidates`, compare only against that master. Legacy docs
 * without a stamp fall back to comparing against every language variant of
 * the master (English + the other language, when present).
 */
function findPristineMatch(
  orgDocData: Record<string, unknown>,
  candidates: MasterPick[],
  orgName: string,
): PristineMatch | null {
  const stampedMasterId =
    (typeof orgDocData.seeded_from_master === 'string' && orgDocData.seeded_from_master) ||
    (typeof orgDocData.seeded_from === 'string' && orgDocData.seeded_from) ||
    null;

  if (stampedMasterId) {
    const stamped = candidates.find((c) => c.doc.id === stampedMasterId);
    if (stamped) {
      if (!contentMatchesMaster(orgDocData, stamped.doc, orgName)) return null;
      const lang = isAppLanguage(orgDocData.seeded_lang) ? orgDocData.seeded_lang : stamped.lang;
      return { master: stamped.doc, lang };
    }
    // Stamp points at a master that no longer exists (or was re-keyed):
    // fall through to the structural comparison below.
  }

  for (const candidate of candidates) {
    if (contentMatchesMaster(orgDocData, candidate.doc, orgName)) {
      return { master: candidate.doc, lang: candidate.lang };
    }
  }
  return null;
}

// ---------- Booking email templates (Layer 2 HTML wrappers) ----------
// Three template keys map onto the new Cloud Function trigger emails. Each one
// uses the same shipped HTML the EmailTemplateDesigner generates as its default,
// so admins can later customize them via the designer if they want.
const BOOKING_EMAIL_TEMPLATE_DEFS: Array<{
  key:
    | 'appointment_confirmation'
    | 'appointment_reminder'
    | 'booking_request_received'
    | 'booking_request_admin_alert'
    | 'booking_request_declined';
  /** English display name — kept for reference; the seeded `name` is resolved via STRINGS[lang]. */
  name: string;
  nameKey: keyof (typeof STRINGS)['en'];
  variables: string[];
}> = [
  {
    key: 'appointment_confirmation',
    name: 'Appointment Confirmation',
    nameKey: 'tpl_appointment_confirmation',
    variables: [
      'treatment', 'date', 'time', 'staff',
      'client_name', 'organization_name', 'organization_phone',
      'organization_address', 'organization_email', 'logo_url',
      'header_image_url', 'sender_name', 'cta_url',
    ],
  },
  {
    key: 'appointment_reminder',
    name: 'Appointment Reminder',
    nameKey: 'tpl_appointment_reminder',
    variables: [
      'service_name', 'appointment_date', 'appointment_time',
      'staff_name', 'location', 'client_name',
      'organization_name', 'organization_phone', 'organization_address',
      'organization_email', 'logo_url', 'header_image_url',
      'sender_name', 'cta_url',
    ],
  },
  {
    key: 'booking_request_received',
    name: 'Booking Request Received',
    nameKey: 'tpl_booking_request_received',
    variables: [
      'treatment', 'date', 'time', 'staff',
      'client_name', 'organization_name', 'organization_phone',
      'organization_address', 'organization_email', 'logo_url',
      'header_image_url', 'sender_name', 'cta_url',
    ],
  },
  {
    key: 'booking_request_admin_alert',
    name: 'Booking Request Alert (Admin)',
    nameKey: 'tpl_booking_request_admin_alert',
    variables: [
      'visitor_name', 'visitor_email', 'visitor_phone', 'visitor_notes',
      'treatment', 'date', 'time',
      'organization_name', 'organization_phone', 'logo_url',
      'header_image_url', 'sender_name', 'cta_url',
    ],
  },
  {
    key: 'booking_request_declined',
    name: 'Booking Declined',
    nameKey: 'tpl_booking_request_declined',
    variables: [
      'treatment', 'date', 'time', 'reason',
      'client_name', 'organization_name', 'organization_phone', 'logo_url',
      'header_image_url', 'sender_name', 'cta_url',
    ],
  },
];

interface SeededEmailTemplate {
  name?: string;
  html?: string;
  variables?: string[];
  settings?: Record<string, unknown>;
  /** Present only on entries this seeder wrote. The designer's save keeps the field (it spreads the loaded entry). */
  seeded_by?: string;
  /** Language the entry was seeded in. */
  seeded_lang?: string;
}

/**
 * SHA-256 of the English default HTML the pre-i18n seeder wrote for each key
 * (every `getDefaultTemplateHtml(key)` revision that ever shipped). Entries
 * seeded before `seeded_by` / `seeded_lang` existed carry no stamp at all, so
 * this is the only way to recognise them as untouched system defaults (the
 * current English HTML differs — it now carries `dir` / `lang` attributes).
 * Recompute and append here whenever the English HTML changes without a
 * corresponding stamp bump.
 */
const LEGACY_DEFAULT_HTML_SHA256: Record<(typeof BOOKING_EMAIL_TEMPLATE_DEFS)[number]['key'], readonly string[]> = {
  appointment_confirmation: ['29732662f179eff02b0fbc17f580b591c4de568df168acbb728114e9da8b8f8b'],
  appointment_reminder: ['e529c3aceff1ef42fe9cd77e1ed7ab19bfbd9dfa9cc09c5b3b5a50c4e9f226ca'],
  booking_request_received: ['fa0742d50397761cf4cb19765cffb280112d12c9c35dfcabf28a69527d0103dc'],
  booking_request_admin_alert: ['b1b13b028f93a5c1196dd75646db53d6599e5b1ee80090b0b071e28996b051c7'],
  booking_request_declined: ['1fb5a4e34231a40b9791881d8d4df9f390df727fe778c6c4191c8272b01c43e5'],
};

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Language an email template entry is still the untouched system default in,
 * or `null` when somebody has touched the HTML in the designer (or authored
 * the entry by hand). Two shapes count as pristine:
 *   - an entry this seeder stamped (`seeded_by` + `seeded_lang`) whose HTML is
 *     still exactly the default for that language;
 *   - a legacy, unstamped entry whose HTML hashes to one of the pre-i18n
 *     English defaults (see `LEGACY_DEFAULT_HTML_SHA256`) — always English.
 * Only such entries are ever replaced automatically.
 */
function pristineEmailTemplateLang(
  key: (typeof BOOKING_EMAIL_TEMPLATE_DEFS)[number]['key'],
  entry: SeededEmailTemplate | undefined,
): AppLanguage | null {
  if (!entry || typeof entry.html !== 'string') return null;
  if (entry.seeded_by === SEED_MARKER) {
    if (!isAppLanguage(entry.seeded_lang)) return null;
    return entry.html === getDefaultTemplateHtml(key, entry.seeded_lang) ? entry.seeded_lang : null;
  }
  if (entry.seeded_by === undefined && LEGACY_DEFAULT_HTML_SHA256[key].includes(sha256(entry.html))) {
    return DEFAULT_LANGUAGE;
  }
  return null;
}

function settingsEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown>): boolean {
  if (!a) return false;
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => String(a[k] ?? '') === String(b[k] ?? ''));
}

/** Skip reason used when an existing doc differs from every master it could have been seeded from. */
export const SKIP_REASON_CUSTOMIZED = 'customized';
/** Skip reason used when a doc of that kind/trigger already exists (and nothing asked for a replacement). */
export const SKIP_REASON_EXISTS = 'already exists';

export interface SeedResult {
  orgName: string;
  /** Language the defaults were seeded in. */
  lang: AppLanguage;
  templates: {
    created: Array<{ id: string; kind: string }>;
    /** Existing docs force-overwritten via `overwriteExisting`. */
    overwritten: Array<{ id: string; kind: string }>;
    /** Pristine seeded docs swapped to the target language via `replacePristine`. */
    replaced: Array<{ id: string; kind: string; fromLang: AppLanguage }>;
    /** Org-level docs left alone (already exists / customized) plus masters with no `kind`. */
    skipped: Array<{ kind: string; reason: string }>;
    /**
     * Master docs that lost the language pick for their kind (e.g. the Hebrew
     * master of an English org). Informational only — not org docs, not
     * counted in `summary`.
     */
    mastersPassedOver: Array<{ kind: string; lang: AppLanguage }>;
  };
  automations: {
    created: Array<{ id: string; trigger: string }>;
    /** Pristine seeded docs swapped to the target language via `replacePristine`. */
    replaced: Array<{ id: string; trigger: string; fromLang: AppLanguage }>;
    /** Org-level docs left alone (already exists / customized) plus masters with no `trigger`. */
    skipped: Array<{ trigger: string; reason: string }>;
    /** See `templates.mastersPassedOver`. */
    mastersPassedOver: Array<{ trigger: string; lang: AppLanguage }>;
  };
  emailTemplates: {
    created: string[];
    /** Pristine system defaults replaced with the org-language variant (see `pristineEmailTemplateLang`). */
    overwritten: string[];
    skipped: Array<{ key: string; reason: string }>;
  };
  /** Totals across templates + automations + email templates, for a one-line UI summary. */
  summary: {
    created: number;
    replaced: number;
    /** Existing docs left alone because an admin edited them. */
    skippedCustomized: number;
    /** Existing docs left alone for any other reason (already exists, no integration, ...). */
    skippedOther: number;
  };
}

export interface SeedOptions {
  /**
   * Overwrite existing same-kind waiver templates. Does not touch email
   * templates or automations (same as before i18n) — a pristine email
   * template is only ever swapped when its language differs from `lang`.
   */
  overwriteExisting?: boolean;
  /**
   * Language for the seeded defaults (waiver/intake/agreement masters,
   * automation masters and email template HTML). Defaults to the org's
   * `language` field (falls back to 'en'). Pass explicitly when the caller
   * already holds the org doc (e.g. the onCreate trigger) or wants to force
   * a specific language.
   */
  lang?: AppLanguage;
  /**
   * When true, an existing waiver template / automation that is still the
   * untouched seeded default (see `findPristineMatch`) and whose language
   * differs from `lang` is overwritten in place with the target-language
   * master — same doc id, `created_at` kept, `updated_at` bumped. Docs an
   * admin edited are skipped with reason `'customized'`. Default false.
   */
  replacePristine?: boolean;
}

/**
 * Internal seeder — does the work without auth checks. The callable CF wrapper
 * does auth/permission checks and then delegates here. Batch scripts can call
 * this directly using the Admin SDK.
 */
export async function seedOrgDefaultsInternal(
  organizationId: string,
  opts: SeedOptions = {},
): Promise<SeedResult> {
  const orgRef = db.collection('organizations').doc(organizationId);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    throw new Error(`Organization ${organizationId} not found`);
  }
  const orgData = orgSnap.data();
  const orgName = orgData?.name as string | undefined;
  if (!orgName) {
    throw new Error(
      `Organization ${organizationId} is missing a name; set organizations/${organizationId}.name before seeding.`,
    );
  }
  const lang: AppLanguage = opts.lang ?? orgLanguageFromData(orgData);
  const t = makeT(STRINGS, lang);
  const replacePristine = opts.replacePristine === true;

  // ---------- waiver/intake/agreement templates ----------
  const templateMasters = await db.collection('defaultWaiverTemplates').get();
  if (templateMasters.empty) {
    throw new Error('No master templates found in defaultWaiverTemplates collection.');
  }

  const templateCol = orgRef.collection('waiverTemplates');
  const existingTemplates = await templateCol.get();
  const existingKinds = new Set<string>();
  const existingTemplateByKind = new Map<string, string>();
  const existingTemplateDocsByKind = new Map<string, admin.firestore.QueryDocumentSnapshot[]>();
  existingTemplates.forEach((doc) => {
    const k = (doc.data().kind as string | undefined) ?? '';
    if (k) {
      existingKinds.add(k);
      existingTemplateByKind.set(k, doc.id);
      const list = existingTemplateDocsByKind.get(k) ?? [];
      list.push(doc);
      existingTemplateDocsByKind.set(k, list);
    }
  });

  const templatesCreated: Array<{ id: string; kind: string }> = [];
  const templatesSkipped: Array<{ kind: string; reason: string }> = [];
  const templatesOverwritten: Array<{ id: string; kind: string }> = [];
  const templatesReplaced: Array<{ id: string; kind: string; fromLang: AppLanguage }> = [];

  const templatePicks = pickMastersForLanguage(
    templateMasters.docs,
    (d) => d.kind as string | undefined,
    lang,
  );
  for (let i = 0; i < templatePicks.ungrouped.length; i++) {
    templatesSkipped.push({ kind: '(missing)', reason: 'master has no kind' });
  }
  // Masters in the other language are not org docs — report them separately so
  // `skipped` (and the summary built from it) keeps listing org-level docs only.
  const templateMastersPassedOver = templatePicks.passedOver.map(({ key, lang: masterLang }) => ({
    kind: key,
    lang: masterLang,
  }));

  for (const [kind, { doc: master, lang: masterLang }] of templatePicks.picked) {
    const branded = applyBrandToken(master.data(), orgName) as Record<string, unknown>;
    const payload = {
      ...branded,
      organization_id: organizationId,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at_ts: Date.now(),
      seeded_by: SEED_MARKER,
      seeded_from: master.id,
      seeded_from_master: master.id,
      seeded_lang: masterLang,
    };

    if (existingKinds.has(kind)) {
      if (opts.overwriteExisting) {
        const id = existingTemplateByKind.get(kind)!;
        await templateCol.doc(id).set(payload, { merge: false });
        templatesOverwritten.push({ id, kind });
        continue;
      }

      if (replacePristine) {
        const candidates = templatePicks.groups.get(kind) ?? [];
        for (const existingDoc of existingTemplateDocsByKind.get(kind) ?? []) {
          const existingData = existingDoc.data() as Record<string, unknown>;
          const pristine = findPristineMatch(existingData, candidates, orgName);
          if (!pristine) {
            templatesSkipped.push({ kind, reason: SKIP_REASON_CUSTOMIZED });
            continue;
          }
          if (pristine.lang === masterLang) {
            templatesSkipped.push({ kind, reason: SKIP_REASON_EXISTS });
            continue;
          }
          await existingDoc.ref.set(
            {
              ...payload,
              created_at: existingData.created_at ?? admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: false },
          );
          templatesReplaced.push({ id: existingDoc.id, kind, fromLang: pristine.lang });
        }
        continue;
      }

      templatesSkipped.push({ kind, reason: SKIP_REASON_EXISTS });
      continue;
    }

    const ref = await templateCol.add(payload);
    templatesCreated.push({ id: ref.id, kind });
  }

  // ---------- marketing automations ----------
  const automationMasters = await db.collection('defaultMarketingAutomations').get();
  const automationCol = orgRef.collection('marketingAutomations');
  const existingAutomations = await automationCol.get();
  const existingTriggers = new Set<string>();
  const existingAutomationDocsByTrigger = new Map<string, admin.firestore.QueryDocumentSnapshot[]>();
  existingAutomations.forEach((doc) => {
    const trg = (doc.data().trigger as string | undefined) ?? '';
    if (trg) {
      existingTriggers.add(trg);
      const list = existingAutomationDocsByTrigger.get(trg) ?? [];
      list.push(doc);
      existingAutomationDocsByTrigger.set(trg, list);
    }
  });

  const automationsCreated: Array<{ id: string; trigger: string }> = [];
  const automationsSkipped: Array<{ trigger: string; reason: string }> = [];
  const automationsReplaced: Array<{ id: string; trigger: string; fromLang: AppLanguage }> = [];

  const automationPicks = pickMastersForLanguage(
    automationMasters.docs,
    (d) => d.trigger as string | undefined,
    lang,
  );
  for (let i = 0; i < automationPicks.ungrouped.length; i++) {
    automationsSkipped.push({ trigger: '(missing)', reason: 'master has no trigger' });
  }
  const automationMastersPassedOver = automationPicks.passedOver.map(({ key, lang: masterLang }) => ({
    trigger: key,
    lang: masterLang,
  }));

  for (const [trigger, { doc: master, lang: masterLang }] of automationPicks.picked) {
    const branded = applyBrandToken(master.data(), orgName) as Record<string, unknown>;
    const payload = {
      ...branded,
      organization_id: organizationId,
      created_by: SEED_MARKER,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      last_triggered_at: null,
      seeded_by: SEED_MARKER,
      seeded_from: master.id,
      seeded_from_master: master.id,
      seeded_lang: masterLang,
    };

    if (existingTriggers.has(trigger)) {
      if (replacePristine) {
        const candidates = automationPicks.groups.get(trigger) ?? [];
        for (const existingDoc of existingAutomationDocsByTrigger.get(trigger) ?? []) {
          const existingData = existingDoc.data() as Record<string, unknown>;
          const pristine = findPristineMatch(existingData, candidates, orgName);
          if (!pristine) {
            automationsSkipped.push({ trigger, reason: SKIP_REASON_CUSTOMIZED });
            continue;
          }
          if (pristine.lang === masterLang) {
            automationsSkipped.push({ trigger, reason: SKIP_REASON_EXISTS });
            continue;
          }
          await existingDoc.ref.set(
            {
              ...payload,
              created_at: existingData.created_at ?? admin.firestore.FieldValue.serverTimestamp(),
              // Runtime bookkeeping is not content — keep what the automation runner wrote.
              last_triggered_at: existingData.last_triggered_at ?? null,
            },
            { merge: false },
          );
          automationsReplaced.push({ id: existingDoc.id, trigger, fromLang: pristine.lang });
        }
        continue;
      }

      automationsSkipped.push({ trigger, reason: SKIP_REASON_EXISTS });
      continue;
    }

    const ref = await automationCol.add(payload);
    automationsCreated.push({ id: ref.id, trigger });
  }

  // ---------- email templates (Layer 2 branded HTML wrappers) ----------
  // Only seeded into the org's Resend integration. Skipped silently if no
  // Resend integration exists (the booking emails will then fall back to the
  // bare-bones stub at send time, which is the same behavior as before).
  //
  // Existing entries are kept, with one exception: an entry that is still the
  // untouched system default (stamped by this seeder, or a legacy pre-i18n
  // default recognised by hash — see `pristineEmailTemplateLang`) gets
  // replaced when its language differs from the org language. Nothing else
  // (not even `overwriteExisting`) rewrites an existing email template.
  // Orgs are created without `language` and get it from Settings later, so
  // this is what lets a Hebrew org end up with Hebrew defaults.
  const emailTemplatesCreated: string[] = [];
  const emailTemplatesOverwritten: string[] = [];
  const emailTemplatesSkipped: Array<{ key: string; reason: string }> = [];

  const intSnap = await orgRef
    .collection('marketingIntegrations')
    .where('provider', '==', 'resend')
    .limit(1)
    .get();

  if (intSnap.empty) {
    for (const def of BOOKING_EMAIL_TEMPLATE_DEFS) {
      emailTemplatesSkipped.push({ key: def.key, reason: 'no Resend integration' });
    }
  } else {
    const intDoc = intSnap.docs[0];
    const intData = intDoc.data() ?? {};
    const existingEmailTemplates = (intData.email_templates ?? {}) as Record<string, SeededEmailTemplate | undefined>;

    // Inherit settings from appointment_reminder if the org has designed one,
    // so the new booking templates pick up their existing brand palette.
    // A pristine system-seeded reminder is not "designed" — use the localized
    // elegant defaults instead so the signature line follows the language.
    const apptTpl = existingEmailTemplates['appointment_reminder'];
    const inheritedSettings =
      apptTpl?.settings && pristineEmailTemplateLang('appointment_reminder', apptTpl) === null
        ? apptTpl.settings
        : getElegantDefaultSettings(lang);

    const updates: Record<string, unknown> = {};
    for (const def of BOOKING_EMAIL_TEMPLATE_DEFS) {
      const existing = existingEmailTemplates[def.key];
      let replacing = false;
      let settings: Record<string, unknown> = inheritedSettings;

      if (existing) {
        const existingLang = pristineEmailTemplateLang(def.key, existing);
        if (existingLang === null) {
          emailTemplatesSkipped.push({ key: def.key, reason: SKIP_REASON_CUSTOMIZED });
          continue;
        }
        if (existingLang === lang) {
          emailTemplatesSkipped.push({ key: def.key, reason: SKIP_REASON_EXISTS });
          continue;
        }
        replacing = true;
        // Keep a palette the admin customised; swap only the untouched
        // language-specific defaults (whose signature line is localized).
        settings = settingsEqual(existing.settings, getElegantDefaultSettings(existingLang))
          ? getElegantDefaultSettings(lang)
          : (existing.settings ?? inheritedSettings);
      }

      updates[`email_templates.${def.key}`] = {
        name: t(def.nameKey),
        html: getDefaultTemplateHtml(def.key, lang),
        variables: def.variables,
        settings,
        seeded_by: SEED_MARKER,
        seeded_lang: lang,
      };
      if (replacing) emailTemplatesOverwritten.push(def.key);
      else emailTemplatesCreated.push(def.key);
    }

    if (Object.keys(updates).length > 0) {
      await intDoc.ref.update(updates);
    }
  }

  const countCustomized = (rows: Array<{ reason: string }>) =>
    rows.filter((r) => r.reason === SKIP_REASON_CUSTOMIZED).length;

  const skippedCustomized =
    countCustomized(templatesSkipped) + countCustomized(automationsSkipped) + countCustomized(emailTemplatesSkipped);
  const skippedTotal = templatesSkipped.length + automationsSkipped.length + emailTemplatesSkipped.length;

  return {
    orgName,
    lang,
    templates: {
      created: templatesCreated,
      overwritten: templatesOverwritten,
      replaced: templatesReplaced,
      skipped: templatesSkipped,
      mastersPassedOver: templateMastersPassedOver,
    },
    automations: {
      created: automationsCreated,
      replaced: automationsReplaced,
      skipped: automationsSkipped,
      mastersPassedOver: automationMastersPassedOver,
    },
    emailTemplates: {
      created: emailTemplatesCreated,
      overwritten: emailTemplatesOverwritten,
      skipped: emailTemplatesSkipped,
    },
    summary: {
      created: templatesCreated.length + automationsCreated.length + emailTemplatesCreated.length,
      replaced:
        templatesReplaced.length +
        templatesOverwritten.length +
        automationsReplaced.length +
        emailTemplatesOverwritten.length,
      skippedCustomized,
      skippedOther: skippedTotal - skippedCustomized,
    },
  };
}

interface SeedRequest {
  organizationId: string;
  /** If true, overwrite existing same-kind waiver templates. Default false. */
  overwriteExisting?: boolean;
  /** Language to seed in. Defaults to the org's `language` field (then 'en'). */
  lang?: AppLanguage;
  /** If true, swap untouched seeded defaults whose language differs from `lang`. Default false. */
  replacePristine?: boolean;
}

export const seedOrgDefaultTemplates = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }
  const data = request.data as SeedRequest;
  if (!data?.organizationId) {
    throw new HttpsError('invalid-argument', 'organizationId is required');
  }
  if (data.lang !== undefined && !isAppLanguage(data.lang)) {
    throw new HttpsError('invalid-argument', 'lang must be one of: en, he');
  }

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  const caller = callerDoc.data();
  if (!callerDoc.exists || caller?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  if (caller?.organizationId !== data.organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }

  try {
    const result = await seedOrgDefaultsInternal(data.organizationId, {
      overwriteExisting: data.overwriteExisting === true,
      lang: data.lang,
      replacePristine: data.replacePristine === true,
    });
    return {
      ...result,
      // Back-compat fields some older callers expect at the top level.
      created: result.templates.created,
      overwritten: result.templates.overwritten,
      skipped: result.templates.skipped,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Seed failed';
    if (message.includes('not found')) throw new HttpsError('not-found', message);
    if (message.includes('missing a name')) throw new HttpsError('failed-precondition', message);
    if (message.includes('No master templates')) throw new HttpsError('failed-precondition', message);
    throw new HttpsError('internal', message);
  }
});
