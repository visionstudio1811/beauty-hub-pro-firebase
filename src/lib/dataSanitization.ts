/**
 * Comprehensive data sanitization utility to prevent malformed patterns
 * from appearing in the UI, specifically targeting "/049" and similar issues
 */

const MALFORMED_PATTERNS = [
  '/0',      // Common pattern like "/049"
  '/04',     // Specific pattern
  '/049',    // Exact problematic pattern
  '/049/049/049', // Add this if you see this exact pattern
  'Invalid', // Invalid date text
  'NaN',     // Not a number
  'undefined', // Undefined as string
  'null'     // Null as string
];

/**
 * Detects if a value contains malformed patterns
 */
export const containsMalformedPattern = (value: any): boolean => {
  if (!value) return false;
  
  const stringValue = String(value);
  // Catch repeated '/049' patterns like '/049/049/049'
  if (/^(\/049)+$/.test(stringValue)) return true;
  return MALFORMED_PATTERNS.some(pattern => stringValue.includes(pattern)) ||
         stringValue.length === 0 ||
         /^\d+$/.test(stringValue); // Only numbers (suspicious)
};

/**
 * Sanitizes a string value, replacing malformed patterns with fallback
 */
export const sanitizeString = (value: any, fallback: string = 'Unknown'): string => {
  if (!value || typeof value !== 'string') {
    console.warn('🚨 sanitizeString: Invalid input, using fallback:', value);
    return fallback;
  }
  
  if (containsMalformedPattern(value)) {
    console.warn('🚨 sanitizeString: Malformed pattern detected, using fallback:', value);
    return fallback;
  }
  
  return value;
};

/**
 * Sanitizes a date string, ensuring it's valid before use
 */
export const sanitizeDateString = (dateValue: any, fallback?: string): string => {
  if (!dateValue) {
    const safeFallback = fallback || new Date().toISOString().split('T')[0];
    console.warn('🚨 sanitizeDateString: Empty date, using fallback:', safeFallback);
    return safeFallback;
  }
  
  const stringValue = String(dateValue);
  
  if (containsMalformedPattern(stringValue)) {
    const safeFallback = fallback || new Date().toISOString().split('T')[0];
    console.warn('🚨 sanitizeDateString: Malformed date pattern detected:', stringValue, 'using fallback:', safeFallback);
    return safeFallback;
  }
  
  // Additional validation: try to parse the date
  try {
    const parsed = new Date(stringValue);
    if (isNaN(parsed.getTime())) {
      const safeFallback = fallback || new Date().toISOString().split('T')[0];
      console.warn('🚨 sanitizeDateString: Invalid date format:', stringValue, 'using fallback:', safeFallback);
      return safeFallback;
    }
  } catch (error) {
    const safeFallback = fallback || new Date().toISOString().split('T')[0];
    console.warn('🚨 sanitizeDateString: Date parsing error:', error, 'using fallback:', safeFallback);
    return safeFallback;
  }
  
  return stringValue;
};

/**
 * Sanitizes an array of strings, removing malformed entries
 */
export const sanitizeStringArray = (array: any[], fallbackItem: string = 'Unknown'): string[] => {
  if (!Array.isArray(array)) {
    console.warn('🚨 sanitizeStringArray: Not an array, returning empty array:', array);
    return [fallbackItem];
  }
  
  const sanitized = array
    .filter(item => item != null)
    .map(item => sanitizeString(item, fallbackItem))
    .filter(item => item !== fallbackItem); // Remove fallback items to avoid "Unknown" in dropdowns

  // If all items were filtered out, return a single fallback
  return sanitized.length > 0 ? sanitized : [fallbackItem];
};

/**
 * Global DOM scanner to detect and replace malformed patterns in real-time
 */
export const scanAndSanitizeDOM = (): void => {
  const elements = document.querySelectorAll('*');
  let foundMalformed = false;
  
  elements.forEach(element => {
    if (element.textContent) {
      const originalText = element.textContent;
      let sanitizedText = originalText;
      
      MALFORMED_PATTERNS.forEach(pattern => {
        if (sanitizedText.includes(pattern)) {
          foundMalformed = true;
          console.error('🚨 DOM SCANNER: Found malformed pattern in element:', pattern, element);
          sanitizedText = sanitizedText.replace(new RegExp(pattern, 'g'), 'Invalid');
        }
      });
      
      if (foundMalformed && element.textContent !== sanitizedText) {
        console.log('🔧 DOM SCANNER: Sanitized element text from:', originalText, 'to:', sanitizedText);
        element.textContent = sanitizedText;
      }
    }
  });
  
  if (foundMalformed) {
    console.log('🔍 DOM SCANNER: Completed scan, found and fixed malformed patterns');
  }
};
