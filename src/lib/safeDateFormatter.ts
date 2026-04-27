import { format } from 'date-fns';
import { formatInBusinessTime, validateDate } from './timeUtils';

type DateInput = Date | string | number | null | undefined | { toDate?: () => Date; seconds?: number };

/**
 * Safe date formatter. Accepts Date, ISO string, Firestore Timestamp, or null.
 * Returns '' for null/invalid input (callers can provide their own placeholder
 * downstream instead of a jarring "Date Error" string).
 */
export const safeDateFormat = (
  date: DateInput,
  options?: Intl.DateTimeFormatOptions,
): string => {
  const validDate = validateDate(date);
  if (!validDate) return '';

  try {
    if (options?.weekday || options?.month === 'long') {
      const formatString = buildFormatString(options);
      const result = formatInBusinessTime(validDate, formatString);
      if (result) return result;
    }
    return validDate.toLocaleDateString('en-US', options);
  } catch {
    try {
      return format(validDate, 'MMM d, yyyy');
    } catch {
      return '';
    }
  }
};

const buildFormatString = (options?: Intl.DateTimeFormatOptions): string => {
  if (!options) return 'MMM d, yyyy';
  let formatString = '';
  if (options.weekday === 'long') formatString += 'EEEE, ';
  if (options.weekday === 'short') formatString += 'EEE, ';
  if (options.month === 'long') formatString += 'MMMM ';
  if (options.month === 'short') formatString += 'MMM ';
  if (options.month === 'numeric') formatString += 'M/';
  if (options.day === 'numeric') formatString += 'd, ';
  if (options.year === 'numeric') formatString += 'yyyy';
  return formatString || 'MMM d, yyyy';
};

export const safeToLocaleDateString = (
  date: DateInput,
  _locales?: string | string[],
  options?: Intl.DateTimeFormatOptions,
): string => safeDateFormat(date, options);

export const safeFormatters = {
  shortDate: (date: DateInput) =>
    safeDateFormat(date, { month: 'short', day: 'numeric', year: 'numeric' }),
  longDate: (date: DateInput) =>
    safeDateFormat(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  monthYear: (date: DateInput) =>
    safeDateFormat(date, { year: 'numeric', month: 'long' }),
  dayMonth: (date: DateInput) =>
    safeDateFormat(date, { month: 'short', day: 'numeric' }),
};
