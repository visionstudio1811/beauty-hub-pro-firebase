import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/**
 * i18n bootstrap.
 *
 * Every JSON file under src/locales/{lang}/ becomes a namespace named after the
 * file (src/locales/en/clients.json -> namespace "clients"). Components call
 *   const { t } = useTranslation('clients');
 * and refer to keys inside that file. The "common" namespace is the default and
 * holds shared actions/labels (Save, Cancel, Loading...).
 *
 * Adding a new namespace: create src/locales/en/<name>.json AND
 * src/locales/he/<name>.json with identical key sets. Nothing else to register.
 */

export const SUPPORTED_LANGUAGES = ['en', 'he'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'en';
export const RTL_LANGUAGES: readonly AppLanguage[] = ['he'];

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  he: 'עברית',
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function isRtl(lang: string): boolean {
  return (RTL_LANGUAGES as readonly string[]).includes(lang);
}

/** BCP-47 locale for Intl / date-fns / toLocaleString calls. */
export function localeFor(lang: string): string {
  return lang === 'he' ? 'he-IL' : 'en-US';
}

const modules = import.meta.glob('../locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const match = path.match(/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!match) continue;
  const [, lang, ns] = match;
  resources[lang] ??= {};
  resources[lang][ns] = mod.default;
}

const namespaces = Array.from(
  new Set(Object.values(resources).flatMap((byNs) => Object.keys(byNs))),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: namespaces,
  defaultNS: 'common',
  fallbackNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

/** Apply <html lang/dir> for the given language. Safe to call repeatedly. */
export function applyDocumentLanguage(lang: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (meta && i18n.isInitialized) meta.setAttribute('content', i18n.t('common:app.description', { lng: lang }));
  // PWA manifest: the installed-app name/description follow the language.
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) {
    const href = lang === 'he' ? '/manifest.he.webmanifest' : '/manifest.webmanifest';
    if (manifest.getAttribute('href') !== href) manifest.setAttribute('href', href);
  }
}

applyDocumentLanguage(DEFAULT_LANGUAGE);

export default i18n;
