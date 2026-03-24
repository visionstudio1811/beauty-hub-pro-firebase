/**
 * Data sanitization utilities to catch malformed values that can appear
 * from legacy data imports or sync errors (e.g. "/049" date corruption).
 */

// Specific malformed patterns from known data corruption issues
const MALFORMED_DATE_PATTERNS = [
  /^(\/049)+$/,          // Repeated "/049" — corrupted date artifact
  /\/04\d/,              // Any "/04x" pattern
];

const SENTINEL_STRINGS = new Set(['Invalid', 'NaN', 'undefined', 'null']);

/**
 * Returns true only for values that are definitively malformed.
 * Does NOT flag numeric strings — "60", "150", "90210" are all valid.
 */
export const containsMalformedPattern = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return false;

  const str = String(value);

  if (SENTINEL_STRINGS.has(str)) return true;
  if (MALFORMED_DATE_PATTERNS.some(re => re.test(str))) return true;

  return false;
};

/**
 * Sanitizes a string value, replacing definitively malformed values with fallback.
 */
export const sanitizeString = (value: unknown, fallback = 'Unknown'): string => {
  if (value === null || value === undefined || typeof value !== 'string') return fallback;
  if (containsMalformedPattern(value)) return fallback;
  return value;
};

/**
 * Sanitizes a date string, ensuring it is parseable before use.
 */
export const sanitizeDateString = (dateValue: unknown, fallback?: string): string => {
  const safeFallback = fallback ?? new Date().toISOString().split('T')[0];

  if (!dateValue) return safeFallback;

  const str = String(dateValue);

  if (containsMalformedPattern(str)) return safeFallback;

  try {
    const parsed = new Date(str);
    if (isNaN(parsed.getTime())) return safeFallback;
  } catch {
    return safeFallback;
  }

  return str;
};

/**
 * Sanitizes an array of strings, removing malformed entries.
 */
export const sanitizeStringArray = (array: unknown[], fallbackItem = 'Unknown'): string[] => {
  if (!Array.isArray(array)) return [fallbackItem];

  const sanitized = array
    .filter(item => item != null)
    .map(item => sanitizeString(item, fallbackItem))
    .filter(item => item !== fallbackItem);

  return sanitized.length > 0 ? sanitized : [fallbackItem];
};

/**
 * DOM scanner — scans rendered text for known malformed patterns.
 * Only replaces text that definitively matches a malformed pattern.
 * Use sparingly; prefer fixing data at source.
 */
export const scanAndSanitizeDOM = (): void => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const original = node.nodeValue || '';
    if (MALFORMED_DATE_PATTERNS.some(re => re.test(original))) {
      node.nodeValue = original.replace(/\/04\d+/g, '');
    }
  }
};
