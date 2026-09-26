import type { CSSProperties } from 'react';
import { normalizeHexColor, readableTextOn } from '@/lib/loginBranding';

// The system palette from index.css (near-black primary, cream on black,
// beige surfaces). Used when the org hasn't set a brand accent in
// Settings → Login Branding. Tints are fixed beiges rather than derived,
// since mixing black with white would give plain grays.
const SYSTEM_THEME = {
  '--bk-accent': '#1a1a1a',
  '--bk-accent-fg': '#f6f2ed',
  '--bk-accent-ink': '#1a1a1a',
  '--bk-accent-soft': '#f1ebe3',
  '--bk-accent-muted': '#e3d6c5',
} as CSSProperties;

// Warm cream (--background) that brand tints blend toward, so they stay
// in the system's palette instead of going cold on pure white.
const CREAM = '#fbf8f4';

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Blends `hex` toward `target` by `amount` (0 = hex, 1 = target). Both must be #rrggbb. */
export const mixHex = (hex: string, target: string, amount: number) => {
  const from = toRgb(hex);
  const to = toRgb(target);
  return `#${from
    .map((c, i) => Math.round(c + (to[i] - c) * amount).toString(16).padStart(2, '0'))
    .join('')}`;
};

/**
 * CSS variables the booking page styles its accents with, derived from the
 * org's brand color:
 *   --bk-accent       solid fills (selected day/time, primary button)
 *   --bk-accent-fg    text on a solid fill (near-black or cream, whichever reads)
 *   --bk-accent-ink   accent-colored text on white; darkened for light brands
 *   --bk-accent-soft  tinted surfaces (bookable days, summary box)
 *   --bk-accent-muted hover / border tint
 */
export function bookingThemeStyle(accentInput: string | null | undefined): CSSProperties {
  const accent = normalizeHexColor(accentInput);
  if (!accent) return SYSTEM_THEME;
  const fg = readableTextOn(accent);
  return {
    '--bk-accent': accent,
    '--bk-accent-fg': fg === '#ffffff' ? '#f6f2ed' : fg,
    '--bk-accent-ink': fg === '#1a1a1a' ? mixHex(accent, '#000000', 0.55) : accent,
    '--bk-accent-soft': mixHex(accent, CREAM, 0.86),
    '--bk-accent-muted': mixHex(accent, CREAM, 0.72),
  } as CSSProperties;
}

// ---- calendar-day helpers ----
// Slots are keyed by the business's wall-clock day ("YYYY-MM-DD"). These are
// labels for a day, not instants, so they're built at local noon and
// formatted without a timezone shift (safeFormatters converts to the business
// timezone, which can move a bare day by one for visitors elsewhere).

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseIsoDay = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1, 12);

export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1, 12);

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());

const safeIntl = (locale: string, options: Intl.DateTimeFormatOptions, date: Date) => {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return date.toDateString();
  }
};

/** "Monday, September 28" */
export const formatLongDay = (iso: string, locale: string) =>
  safeIntl(locale, { weekday: 'long', month: 'long', day: 'numeric' }, parseIsoDay(iso));

/** "Mon, Sep 28" */
export const formatShortDay = (iso: string, locale: string) =>
  safeIntl(locale, { weekday: 'short', month: 'short', day: 'numeric' }, parseIsoDay(iso));

/** "September 2026" */
export const formatMonthYear = (month: Date, locale: string) =>
  safeIntl(locale, { month: 'long', year: 'numeric' }, month);

/** "HH:MM" → "10:30 AM" (en-US) / "10:30" (he-IL). */
export const formatSlotTime = (hhmm: string, locale: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  return safeIntl(locale, { hour: 'numeric', minute: '2-digit' }, new Date(2000, 0, 1, h, m));
};

/** "10:30 AM – 11:30 AM" for a slot and treatment duration. */
export const formatSlotRange = (hhmm: string, durationMin: number, locale: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const end = new Date(2000, 0, 1, h, m + (Number.isFinite(durationMin) ? durationMin : 0));
  const endHHMM = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${formatSlotTime(hhmm, locale)} – ${formatSlotTime(endHHMM, locale)}`;
};

export const formatPrice = (amount: number, currency: string, locale: string) => {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return String(amount);
  }
};

/** Friendly name for an IANA zone ("Mountain Daylight Time"), or the zone id if Intl can't name it. */
export const timeZoneLabel = (timeZone: string, locale: string) => {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'long' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
  } catch {
    return timeZone;
  }
};
