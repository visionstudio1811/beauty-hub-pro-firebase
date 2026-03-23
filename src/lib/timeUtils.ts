import { format, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

// Business timezone configuration
export const BUSINESS_TIMEZONE = 'America/Denver';

/**
 * Aggressive pattern detection for malformed date strings
 */
const detectMalformedPattern = (value: string): boolean => {
  if (!value || typeof value !== 'string') return true;
  
  // Check for common malformed patterns
  const malformedPatterns = [
    '/0',      // Common pattern like "/049"
    '/04',     // Specific pattern
    '/049',    // Exact problematic pattern
    'Invalid', // Invalid date text
    'NaN',     // Not a number
    'undefined', // Undefined as string
    'null'     // Null as string
  ];
  
  return malformedPatterns.some(pattern => value.includes(pattern)) || 
         value.length === 0 || 
         /^\d+$/.test(value); // Only numbers (suspicious)
};

/**
 * Safe fallback date formatter that never fails
 */
const safeFallbackFormat = (date: Date, formatString: string): string => {
  try {
    // Try basic format first
    const basicResult = format(date, formatString);
    if (detectMalformedPattern(basicResult)) {
      throw new Error('Basic format returned malformed result');
    }
    return basicResult;
  } catch (error) {
    console.warn('⚠️ Safe fallback format failed, using toLocaleDateString:', error);
    
    // Ultimate fallback - use native JS
    if (formatString.includes('yyyy')) {
      return date.toLocaleDateString();
    } else if (formatString.includes('MMM')) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleDateString();
    }
  }
};

/**
 * Formats time from HH:MM:SS to HH:MM format
 * @param timeString - Time string in HH:MM:SS or HH:MM format
 * @returns Formatted time string in HH:MM format
 */
export const formatTimeDisplay = (timeString: string | null | undefined): string => {
  if (!timeString) return '';
  
  // If already in HH:MM format, return as is
  if (timeString.length === 5 && timeString.includes(':')) {
    return timeString;
  }
  
  // If in HH:MM:SS format, extract HH:MM
  if (timeString.length === 8 && timeString.includes(':')) {
    return timeString.substring(0, 5);
  }
  
  // Handle edge cases
  const parts = timeString.split(':');
  if (parts.length >= 2) {
    const hours = parts[0].padStart(2, '0');
    const minutes = parts[1].padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  
  return timeString;
};

/**
 * Converts 24-hour time to 12-hour format with AM/PM
 * @param timeString - Time string in HH:MM or HH:MM:SS format
 * @returns Formatted time string in 12-hour format
 */
export const formatTime12Hour = (timeString: string | null | undefined): string => {
  const time24 = formatTimeDisplay(timeString);
  if (!time24) return '';
  
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  
  return `${hour12}:${minutes} ${ampm}`;
};

/**
 * Validates if a date is within reasonable bounds (2020-2030)
 * @param date - Date to validate
 * @returns true if date is valid and within bounds
 */
export const isValidDateRange = (date: Date): boolean => {
  if (!date || isNaN(date.getTime())) {
    return false;
  }
  
  const year = date.getFullYear();
  return year >= 2020 && year <= 2030;
};

/**
 * Enhanced date validation with aggressive error checking
 */
export const validateDate = (date: Date | string | null | undefined): Date | null => {
  if (!date) {
    console.warn('🚨 validateDate received null/undefined:', date);
    return null;
  }
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      console.warn('🚨 Invalid date detected in validateDate:', date);
      return null;
    }
    
    // Additional validation for reasonable date ranges
    const year = dateObj.getFullYear();
    if (year < 1900 || year > 2100) {
      console.warn('🚨 Date out of reasonable range:', date, 'year:', year);
      return null;
    }
    
    console.log('✅ Date validation successful:', dateObj);
    return dateObj;
  } catch (error) {
    console.error('❌ Date validation error:', error, 'for date:', date);
    return null;
  }
};

/**
 * Gets the current date and time in business timezone
 * @returns Date object representing now in business timezone
 */
export const getBusinessNow = (): Date => {
  try {
    return toZonedTime(new Date(), BUSINESS_TIMEZONE);
  } catch (error) {
    console.error('❌ Error getting business now:', error);
    return new Date(); // Fallback to local time
  }
};

/**
 * Gets today's date in business timezone as YYYY-MM-DD string
 * @returns Today's date string in business timezone
 */
export const getBusinessToday = (): string => {
  try {
    const businessNow = getBusinessNow();
    return format(businessNow, 'yyyy-MM-dd');
  } catch (error) {
    console.error('❌ Error getting business today:', error);
    return format(new Date(), 'yyyy-MM-dd'); // Fallback to local date
  }
};

/**
 * Converts a date to business timezone
 * @param date - Date to convert
 * @returns Date in business timezone
 */
export const toBusinessTime = (date: Date | string): Date => {
  try {
    const validDate = validateDate(date);
    if (!validDate) {
      console.warn('🚨 Invalid date for business time conversion:', date);
      return new Date(); // Fallback to current date
    }
    return toZonedTime(validDate, BUSINESS_TIMEZONE);
  } catch (error) {
    console.error('❌ Error converting to business time:', error, 'for date:', date);
    return new Date(); // Fallback to current date
  }
};

/**
 * ENHANCED: Aggressively safe date formatting with multiple fallback layers
 */
export const formatInBusinessTime = (date: Date | string, formatString: string): string => {
  console.log('🔄 formatInBusinessTime called with:', { date, formatString });
  
  // Layer 1: Input validation
  const validDate = validateDate(date);
  if (!validDate) {
    console.warn('🚨 Invalid date input, returning safe fallback');
    return 'Invalid Date';
  }

  // Layer 2: Try formatInTimeZone with aggressive error detection
  try {
    const result = formatInTimeZone(validDate, BUSINESS_TIMEZONE, formatString);
    console.log('🧪 formatInTimeZone raw result:', { result, type: typeof result, length: result?.length });
    
    // AGGRESSIVE PATTERN DETECTION
    if (detectMalformedPattern(result)) {
      console.error('🚨 MALFORMED PATTERN DETECTED in formatInTimeZone result:', result);
      throw new Error(`Malformed pattern detected: ${result}`);
    }
    
    console.log('✅ formatInTimeZone successful and validated:', result);
    return result;
  } catch (timezoneError) {
    console.warn('⚠️ formatInTimeZone failed or returned malformed result:', timezoneError);
  }

  // Layer 3: Try toZonedTime + format
  try {
    const businessDate = toZonedTime(validDate, BUSINESS_TIMEZONE);
    const result = format(businessDate, formatString);
    
    if (detectMalformedPattern(result)) {
      console.error('🚨 MALFORMED PATTERN DETECTED in toZonedTime+format result:', result);
      throw new Error(`Malformed pattern in fallback 1: ${result}`);
    }
    
    console.log('✅ Fallback 1 successful (toZonedTime + format):', result);
    return result;
  } catch (fallback1Error) {
    console.warn('⚠️ Fallback 1 failed:', fallback1Error);
  }

  // Layer 4: Safe fallback formatter
  try {
    const result = safeFallbackFormat(validDate, formatString);
    
    if (detectMalformedPattern(result)) {
      console.error('🚨 MALFORMED PATTERN DETECTED in safe fallback:', result);
      throw new Error(`Malformed pattern in safe fallback: ${result}`);
    }
    
    console.log('✅ Safe fallback successful:', result);
    return result;
  } catch (fallbackError) {
    console.error('❌ All formatting attempts failed:', fallbackError);
  }

  // Layer 5: Ultimate emergency fallback
  const emergencyResult = validDate.toDateString();
  console.log('🆘 Using emergency fallback:', emergencyResult);
  return emergencyResult;
};

/**
 * Checks if a date is today in business timezone
 * @param date - Date to check (string or Date)
 * @returns true if the date is today in business timezone
 */
export const isBusinessToday = (date: Date | string): boolean => {
  try {
    const validDate = validateDate(date);
    if (!validDate) return false;
    
    const businessToday = getBusinessToday();
    const dateString = formatInBusinessTime(validDate, 'yyyy-MM-dd');
    return dateString === businessToday;
  } catch (error) {
    console.error('❌ Error checking if business today:', error);
    return false;
  }
};

/**
 * Creates a date string in business timezone from a local date
 * @param localDate - Local date
 * @returns Date string in business timezone (YYYY-MM-DD)
 */
export const toBusinessDateString = (localDate: Date): string => {
  try {
    return formatInBusinessTime(localDate, 'yyyy-MM-dd');
  } catch (error) {
    console.error('❌ Error converting to business date string:', error);
    return format(localDate, 'yyyy-MM-dd'); // Fallback to local formatting
  }
};
