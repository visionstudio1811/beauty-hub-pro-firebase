import { format, parseISO } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * Default timezone used when no organization timezone is available yet
 * (e.g. before auth loads). Each org stores its own IANA timezone.
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * @deprecated Use the timezone from the organization context instead.
 * Kept for backward compatibility during migration.
 */
export const BUSINESS_TIMEZONE = DEFAULT_TIMEZONE;

// ── Pure helpers (no org dependency) ──────────────────────────────

/**
 * Formats time from HH:MM:SS to HH:MM format.
 */
export const formatTimeDisplay = (timeString: string | null | undefined): string => {
  if (!timeString) return '';
  if (timeString.length === 5 && timeString.includes(':')) return timeString;
  if (timeString.length === 8 && timeString.includes(':')) return timeString.substring(0, 5);
  const parts = timeString.split(':');
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
  return timeString;
};

/**
 * Converts 24-hour time to 12-hour format with AM/PM.
 */
export const formatTime12Hour = (timeString: string | null | undefined): string => {
  const time24 = formatTimeDisplay(timeString);
  if (!time24) return '';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
};

/**
 * Validates if a date falls within reasonable bounds.
 */
export const isValidDateRange = (date: Date): boolean => {
  if (!date || isNaN(date.getTime())) return false;
  const year = date.getFullYear();
  return year >= 2020 && year <= 2030;
};

/**
 * Parses and validates a Date, ISO string, or Firestore Timestamp.
 * Returns null if invalid.
 */
export const validateDate = (date: Date | string | number | null | undefined | { toDate?: () => Date; seconds?: number }): Date | null => {
  if (date == null) return null;
  try {
    let dateObj: Date;
    if (date instanceof Date) {
      dateObj = date;
    } else if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else if (typeof date === 'number') {
      dateObj = new Date(date);
    } else if (typeof (date as any).toDate === 'function') {
      // Firestore Timestamp
      dateObj = (date as any).toDate();
    } else if (typeof (date as any).seconds === 'number') {
      // Raw Firestore Timestamp shape without toDate
      dateObj = new Date((date as any).seconds * 1000);
    } else {
      return null;
    }
    if (isNaN(dateObj.getTime())) return null;
    const year = dateObj.getFullYear();
    if (year < 1900 || year > 2100) return null;
    return dateObj;
  } catch {
    return null;
  }
};

// ── Timezone-aware functions ──────────────────────────────────────
// Every function that previously used the hard-coded BUSINESS_TIMEZONE
// now accepts an explicit `tz` parameter so the caller can pass the
// organization's timezone.

/**
 * Returns current Date in the given timezone.
 */
export const getBusinessNow = (tz: string = DEFAULT_TIMEZONE): Date => {
  try {
    return toZonedTime(new Date(), tz);
  } catch {
    return new Date();
  }
};

/**
 * Returns today's date as YYYY-MM-DD in the given timezone.
 */
export const getBusinessToday = (tz: string = DEFAULT_TIMEZONE): string => {
  try {
    return format(getBusinessNow(tz), 'yyyy-MM-dd');
  } catch {
    return format(new Date(), 'yyyy-MM-dd');
  }
};

/**
 * Converts a date to the given timezone.
 */
export const toBusinessTime = (date: Date | string, tz: string = DEFAULT_TIMEZONE): Date => {
  const valid = validateDate(date);
  if (!valid) return new Date();
  try {
    return toZonedTime(valid, tz);
  } catch {
    return new Date();
  }
};

/**
 * Formats a date in the given timezone using date-fns format tokens.
 * Falls back through multiple layers so it never throws.
 */
export const formatInBusinessTime = (
  date: Date | string,
  formatString: string,
  tz: string = DEFAULT_TIMEZONE,
): string => {
  const valid = validateDate(date);
  if (!valid) return '';

  // Layer 1 — formatInTimeZone (ideal)
  try {
    const result = formatInTimeZone(valid, tz, formatString);
    if (result && !isMalformed(result)) return result;
  } catch { /* fall through */ }

  // Layer 2 — toZonedTime + format
  try {
    const zoned = toZonedTime(valid, tz);
    const result = format(zoned, formatString);
    if (result && !isMalformed(result)) return result;
  } catch { /* fall through */ }

  // Layer 3 — native fallback
  return valid.toDateString();
};

/**
 * Returns true if the given date is "today" in the given timezone.
 */
export const isBusinessToday = (date: Date | string, tz: string = DEFAULT_TIMEZONE): boolean => {
  const valid = validateDate(date);
  if (!valid) return false;
  return formatInBusinessTime(valid, 'yyyy-MM-dd', tz) === getBusinessToday(tz);
};

/**
 * Returns YYYY-MM-DD string for a date in the given timezone.
 */
export const toBusinessDateString = (localDate: Date, tz: string = DEFAULT_TIMEZONE): string => {
  try {
    return formatInBusinessTime(localDate, 'yyyy-MM-dd', tz);
  } catch {
    return format(localDate, 'yyyy-MM-dd');
  }
};

// ── Internal ──────────────────────────────────────────────────────

function isMalformed(value: string): boolean {
  if (!value) return true;
  const bad = ['/0', '/04', '/049', 'Invalid', 'NaN', 'undefined', 'null'];
  return bad.some((p) => value.includes(p));
}
