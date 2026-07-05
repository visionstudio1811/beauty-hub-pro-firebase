import { describe, it, expect } from 'vitest';
import { safeFormatters } from '@/lib/safeDateFormatter';

/**
 * safeFormatters is what the whole UI renders dates through. The load-bearing
 * guarantee is: on invalid input it returns '' (so callers can render a '—'
 * placeholder) and it NEVER produces "Invalid Date". On valid input it must
 * produce a human-readable string containing the expected year / month.
 *
 * Assertions check stable substrings (year number, month name) rather than an
 * exact formatted string, because the numeric formatters (shortDate/dayMonth)
 * go through toLocaleDateString and the long formatters go through a
 * timezone-aware path (America/New_York) — both can vary by the runner's
 * locale, so pinning an exact string would make the test brittle, not safer.
 */
describe('safeFormatters', () => {
  // Noon UTC keeps the calendar day identical in America/New_York (the app's
  // default business timezone), so the day/month/year never shift across the
  // formatter's timezone conversion.
  const validDate = new Date('2026-07-05T12:00:00.000Z');

  describe('valid input', () => {
    it('shortDate includes the year', () => {
      const out = safeFormatters.shortDate(validDate);
      expect(out).toContain('2026');
      expect(out).not.toMatch(/invalid/i);
      expect(out).not.toContain('NaN');
    });

    it('longDate includes the full month name and year', () => {
      const out = safeFormatters.longDate(validDate);
      expect(out).toContain('July');
      expect(out).toContain('2026');
    });

    it('monthYear includes the full month name and year', () => {
      const out = safeFormatters.monthYear(validDate);
      expect(out).toContain('July');
      expect(out).toContain('2026');
    });

    it('dayMonth includes the day number and is non-empty', () => {
      const out = safeFormatters.dayMonth(validDate);
      expect(out).toContain('5');
      expect(out.length).toBeGreaterThan(0);
    });

    it('accepts a Firestore Timestamp shape', () => {
      const ts = { toDate: () => validDate, seconds: Math.floor(validDate.getTime() / 1000) };
      expect(safeFormatters.shortDate(ts)).toContain('2026');
    });
  });

  describe('invalid input returns empty string', () => {
    it('returns "" for null', () => {
      expect(safeFormatters.shortDate(null)).toBe('');
      expect(safeFormatters.longDate(null)).toBe('');
      expect(safeFormatters.monthYear(null)).toBe('');
      expect(safeFormatters.dayMonth(null)).toBe('');
    });

    it('returns "" for undefined', () => {
      expect(safeFormatters.shortDate(undefined)).toBe('');
    });

    it('returns "" for an unparseable string', () => {
      expect(safeFormatters.shortDate('garbage')).toBe('');
    });
  });
});
