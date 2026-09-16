import { DEFAULT_LANGUAGE, type AppLanguage } from '@/i18n';

/**
 * Tiny string-table helpers mirroring functions/src/lib/i18n.ts, so modules
 * duplicated between functions/ and src/ (e.g. the email template defaults)
 * can share the same source with only the import line changed.
 */

export type StringTable<K extends string = string> = Record<AppLanguage, Record<K, string>>;

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

/** `dir` attribute + text-align for HTML email bodies. */
export function htmlDirAttrs(lang: AppLanguage): { dir: 'rtl' | 'ltr'; align: 'right' | 'left' } {
  return lang === 'he' ? { dir: 'rtl', align: 'right' } : { dir: 'ltr', align: 'left' };
}
