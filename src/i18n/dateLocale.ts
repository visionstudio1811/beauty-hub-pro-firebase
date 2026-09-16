import { enUS, he } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import i18n from '@/i18n';

/** date-fns Locale for the active language. Pass as `{ locale: getDateFnsLocale() }` to format(). */
export function getDateFnsLocale(lang: string = i18n.language): Locale {
  return lang === 'he' ? he : enUS;
}
