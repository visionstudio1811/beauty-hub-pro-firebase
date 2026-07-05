import { describe, it, expect } from 'vitest';
import { validateDate } from '@/lib/timeUtils';

/**
 * validateDate is the single normalization point that every date in the app
 * flows through (safeFormatters, safeDateFormatter, the timezone helpers all
 * call it). It must accept the four shapes that dates arrive in from Firestore
 * and the UI — Firestore Timestamp, native Date, ISO string, numeric millis —
 * and return null (never throw, never "Invalid Date") for anything it can't
 * parse. These tests lock that contract.
 */
describe('validateDate', () => {
  it('accepts a native Date and returns it', () => {
    const d = new Date('2026-07-05T12:00:00.000Z');
    const result = validateDate(d);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(d.getTime());
  });

  it('accepts an ISO string', () => {
    const result = validateDate('2026-07-05T12:00:00.000Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2026-07-05T12:00:00.000Z');
  });

  it('accepts numeric epoch millis', () => {
    const millis = Date.UTC(2026, 6, 5, 12, 0, 0); // 2026-07-05T12:00:00Z
    const result = validateDate(millis);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(millis);
  });

  it('accepts a Firestore Timestamp (object with toDate())', () => {
    const target = new Date('2026-07-05T12:00:00.000Z');
    const timestamp = { toDate: () => target, seconds: Math.floor(target.getTime() / 1000) };
    const result = validateDate(timestamp);
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(target.getTime());
  });

  it('accepts a raw Firestore Timestamp shape (seconds, no toDate)', () => {
    const seconds = 1_780_000_000; // arbitrary in-range epoch seconds
    const result = validateDate({ seconds });
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBe(seconds * 1000);
  });

  it('returns null for null and undefined', () => {
    expect(validateDate(null)).toBeNull();
    expect(validateDate(undefined)).toBeNull();
  });

  it('returns null for an unparseable string (never "Invalid Date")', () => {
    expect(validateDate('not a date')).toBeNull();
    expect(validateDate('')).toBeNull();
  });

  it('returns null for out-of-range years (< 1900 or > 2100)', () => {
    // Guards against garbage millis / corrupt Firestore data rendering as
    // year 1600 or 9999 in the UI.
    expect(validateDate('1800-01-01T00:00:00.000Z')).toBeNull();
    expect(validateDate('2200-01-01T00:00:00.000Z')).toBeNull();
  });
});
