
import { format } from 'date-fns';
import { formatInBusinessTime, validateDate } from './timeUtils';
import { containsMalformedPattern } from './dataSanitization';

/**
 * Global safe date formatter that never returns malformed patterns
 * This replaces all direct toLocaleDateString() calls
 */
export const safeDateFormat = (
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string => {
  console.log('🛡️ safeDateFormat called with:', { date, options });
  
  // Validate input
  const validDate = validateDate(date);
  if (!validDate) {
    console.warn('🚨 safeDateFormat: Invalid date input, using fallback');
    return 'Invalid Date';
  }
  
  try {
    // Try business time formatting first
    if (options?.weekday || options?.month === 'long') {
      const formatString = buildFormatString(options);
      const result = formatInBusinessTime(validDate, formatString);
      
      if (!containsMalformedPattern(result)) {
        return result;
      }
    }
    
    // Try native toLocaleDateString with validation
    const nativeResult = validDate.toLocaleDateString('en-US', options);
    console.log('🧪 Native toLocaleDateString result:', nativeResult);
    
    if (containsMalformedPattern(nativeResult)) {
      console.error('🚨 MALFORMED PATTERN detected in toLocaleDateString:', nativeResult);
      throw new Error(`Malformed pattern: ${nativeResult}`);
    }
    
    return nativeResult;
  } catch (error) {
    console.warn('⚠️ safeDateFormat: All formatting failed, using emergency fallback:', error);
    
    // Emergency fallback using date-fns format
    try {
      const emergencyResult = format(validDate, 'MMM d, yyyy');
      if (containsMalformedPattern(emergencyResult)) {
        return 'Date Error';
      }
      return emergencyResult;
    } catch (formatError) {
      console.error('❌ Emergency fallback failed:', formatError);
      return 'Date Error';
    }
  }
};

/**
 * Build format string from Intl.DateTimeFormatOptions
 */
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

/**
 * Safe wrapper for toLocaleDateString that always returns clean results
 */
export const safeToLocaleDateString = (
  date: Date | string | null | undefined,
  locales?: string | string[],
  options?: Intl.DateTimeFormatOptions
): string => {
  return safeDateFormat(date, options);
};

/**
 * Specific safe formatters for common use cases
 */
export const safeFormatters = {
  shortDate: (date: Date | string | null | undefined) => 
    safeDateFormat(date, { month: 'short', day: 'numeric', year: 'numeric' }),
  
  longDate: (date: Date | string | null | undefined) => 
    safeDateFormat(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  
  monthYear: (date: Date | string | null | undefined) => 
    safeDateFormat(date, { year: 'numeric', month: 'long' }),
  
  dayMonth: (date: Date | string | null | undefined) => 
    safeDateFormat(date, { month: 'short', day: 'numeric' })
};

/**
 * Global override to prevent any accidental use of toLocaleDateString
 * This creates a safer environment where malformed patterns cannot occur
 */
if (typeof window !== 'undefined') {
  // Store original method
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  
  // Override with safe version
  Date.prototype.toLocaleDateString = function(locales?: string | string[], options?: Intl.DateTimeFormatOptions) {
    console.log('🔒 Intercepted toLocaleDateString call, using safe formatter');
    return safeToLocaleDateString(this, locales, options);
  };
  
  console.log('🛡️ Global toLocaleDateString override installed');
}
