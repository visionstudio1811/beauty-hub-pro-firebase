import * as admin from 'firebase-admin';

/**
 * Minimal i18n for Cloud Functions (emails, SMS, notifications).
 *
 * Usage inside a function file — keep each file's strings next to the code:
 *
 *   const STRINGS = defineStrings({
 *     en: { subject: 'Your appointment on {{date}}', hello: 'Hi {{name}},' },
 *     he: { subject: 'התור שלך בתאריך {{date}}', hello: 'שלום {{name}},' },
 *   });
 *   const lang = await getOrgLanguage(orgId);
 *   const t = makeT(STRINGS, lang);
 *   t('subject', { date: '...' });
 *
 * Language comes from organizations/{orgId}.language (set by an admin in Settings).
 * Anything unrecognised falls back to 'en'.
 */

export const SUPPORTED_LANGUAGES = ['en', 'he'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(value: unknown): AppLanguage {
  return isAppLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function isRtl(lang: AppLanguage): boolean {
  return lang === 'he';
}

/** `dir` attribute + text-align for HTML email bodies. */
export function htmlDirAttrs(lang: AppLanguage): { dir: 'rtl' | 'ltr'; align: 'right' | 'left' } {
  return isRtl(lang) ? { dir: 'rtl', align: 'right' } : { dir: 'ltr', align: 'left' };
}

/** BCP-47 locale for Intl.DateTimeFormat / toLocaleString. */
export function localeFor(lang: AppLanguage): string {
  return lang === 'he' ? 'he-IL' : 'en-US';
}

const orgLangCache = new Map<string, { lang: AppLanguage; at: number }>();
const ORG_LANG_TTL_MS = 60_000;

/** Read organizations/{orgId}.language with a 60s in-memory cache. */
export async function getOrgLanguage(
  orgId: string,
  dbOverride?: admin.firestore.Firestore,
): Promise<AppLanguage> {
  const cached = orgLangCache.get(orgId);
  if (cached && Date.now() - cached.at < ORG_LANG_TTL_MS) return cached.lang;
  const db = dbOverride ?? admin.firestore();
  try {
    const snap = await db.collection('organizations').doc(orgId).get();
    const lang = normalizeLanguage(snap.data()?.language);
    orgLangCache.set(orgId, { lang, at: Date.now() });
    return lang;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Language for messages shown to a signed-in STAFF caller: users/{uid}.language
 * (their own preference) first, then the org default, then 'en'. Use this for
 * HttpsError messages thrown from admin/staff callables; use getOrgLanguage for
 * anything sent to clients.
 */
export async function getCallerLanguage(
  uid: string | undefined,
  orgId?: string | null,
  dbOverride?: admin.firestore.Firestore,
): Promise<AppLanguage> {
  const db = dbOverride ?? admin.firestore();
  if (uid) {
    try {
      const u = await db.collection('users').doc(uid).get();
      const lang = u.data()?.language;
      if (isAppLanguage(lang)) return lang;
      if (!orgId && typeof u.data()?.organizationId === 'string') orgId = u.data()!.organizationId as string;
    } catch {
      /* fall through */
    }
  }
  return orgId ? getOrgLanguage(orgId, db) : DEFAULT_LANGUAGE;
}

/** Convenience when you already hold the org document data. */
export function orgLanguageFromData(data: FirebaseFirestore.DocumentData | undefined): AppLanguage {
  return normalizeLanguage(data?.language);
}

export type StringTable<K extends string = string> = Record<AppLanguage, Record<K, string>>;

/** Identity helper that gives you key inference + a compile-time check that en/he have the same keys. */
export function defineStrings<K extends string>(table: {
  en: Record<K, string>;
  he: Record<K, string>;
}): StringTable<K> {
  return table;
}

export type Translator<K extends string> = (
  key: K,
  vars?: Record<string, string | number | null | undefined>,
) => string;

export function interpolate(
  template: string,
  vars?: Record<string, string | number | null | undefined>,
): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

export function makeT<K extends string>(table: StringTable<K>, lang: AppLanguage): Translator<K> {
  const primary = table[lang] ?? table[DEFAULT_LANGUAGE];
  const fallback = table[DEFAULT_LANGUAGE];
  return (key, vars) => interpolate(primary[key] ?? fallback[key] ?? key, vars);
}

/** Format a Date in the org's language, in the given IANA timezone. */
export function formatDateTime(
  date: Date,
  lang: AppLanguage,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' },
): string {
  return new Intl.DateTimeFormat(localeFor(lang), { timeZone, ...opts }).format(date);
}
