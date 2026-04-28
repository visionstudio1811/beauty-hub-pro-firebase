import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { formatInBusinessTime, toBusinessTime, validateDate } from '@/lib/timeUtils';
import { safeDateFormat, safeToLocaleDateString } from '@/lib/safeDateFormatter';
import { sanitizeString } from '@/lib/dataSanitization';

export interface AppointmentFilterOptions {
  dateFilter: string;
  staffFilter: string;
  statusFilter: string;
  searchQuery: string;
  treatmentFilter: string;
  viewMode: 'day' | 'week' | 'month';
  selectedDate: Date;
}

export interface FilterableAppointment {
  id: string;
  date: string;
  client: string;
  treatment: string;
  staff: string;
  status: "scheduled" | "confirmed" | "in-progress" | "completed" | "cancelled" | "no-show";
  phone: string;
  email: string;
  time: string;
  duration: number;
  notes: string;
  allergies?: string;
}

export const filterAppointments = (
  appointments: FilterableAppointment[],
  filters: AppointmentFilterOptions
): FilterableAppointment[] => {
  return appointments.filter(appointment => {
    // Enhanced date filtering based on view mode using business timezone
    const appointmentDate = parseISO(appointment.date);
    let dateMatch = true;
    
    if (filters.viewMode === 'day') {
      // For day view, use selectedDate or dateFilter with exact day matching in business timezone
      const targetDate = filters.dateFilter 
        ? parseISO(filters.dateFilter) 
        : filters.selectedDate;
      
      // Convert both dates to business timezone for comparison
      const businessTargetDate = toBusinessTime(targetDate);
      const businessAppointmentDate = toBusinessTime(appointmentDate);
      
      const dayStart = startOfDay(businessTargetDate);
      const dayEnd = endOfDay(businessTargetDate);
      dateMatch = isWithinInterval(businessAppointmentDate, { start: dayStart, end: dayEnd });
    } else if (filters.viewMode === 'week') {
      // For week view, check if appointment is within the week of selectedDate in business timezone
      const businessSelectedDate = toBusinessTime(filters.selectedDate);
      const businessAppointmentDate = toBusinessTime(appointmentDate);
      
      const weekStart = startOfWeek(businessSelectedDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(businessSelectedDate, { weekStartsOn: 1 });
      dateMatch = isWithinInterval(businessAppointmentDate, { start: weekStart, end: weekEnd });
    } else if (filters.viewMode === 'month') {
      // For month view, check if appointment is within the month of selectedDate in business timezone
      const businessSelectedDate = toBusinessTime(filters.selectedDate);
      const businessAppointmentDate = toBusinessTime(appointmentDate);
      
      const monthStart = startOfMonth(businessSelectedDate);
      const monthEnd = endOfMonth(businessSelectedDate);
      dateMatch = isWithinInterval(businessAppointmentDate, { start: monthStart, end: monthEnd });
    }

    if (!dateMatch) return false;

    // Staff filter
    if (filters.staffFilter !== 'all' && appointment.staff !== filters.staffFilter) {
      return false;
    }

    // Status filter
    if (filters.statusFilter !== 'all' && appointment.status !== filters.statusFilter) {
      return false;
    }

    // Treatment filter
    if (filters.treatmentFilter !== 'all' && appointment.treatment !== filters.treatmentFilter) {
      return false;
    }

    // Enhanced search query filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      const searchableText = [
        appointment.client,
        appointment.treatment,
        appointment.staff,
        appointment.phone,
        appointment.email,
        appointment.time,
        appointment.notes || ''
      ].join(' ').toLowerCase();
      
      if (!searchableText.includes(query)) {
        return false;
      }
    }

    return true;
  });
};

/**
 * Safe date range text with aggressive error detection
 */
export const getDateRangeText = (viewMode: 'day' | 'week' | 'month', selectedDate: Date): string => {
  try {
    // Enhanced validation
    const validDate = validateDate(selectedDate);
    if (!validDate) {
      console.error('🚨 Invalid selected date for range text:', selectedDate);
      return 'Select a date';
    }

    // Convert selectedDate to business timezone for display
    const businessDate = toBusinessTime(validDate);
    
    let result = '';
    
    switch (viewMode) {
      case 'day':
        result = safeDateFormat(businessDate, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        break;
      case 'week':
        const weekStart = startOfWeek(businessDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(businessDate, { weekStartsOn: 1 });
        if (weekStart.getMonth() === weekEnd.getMonth()) {
          const startText = safeDateFormat(weekStart, { month: 'short', day: 'numeric' });
          const endText = safeDateFormat(weekEnd, { day: 'numeric', year: 'numeric' });
          result = `${startText} - ${endText}`;
        } else {
          const startText = safeDateFormat(weekStart, { month: 'short', day: 'numeric' });
          const endText = safeDateFormat(weekEnd, { month: 'short', day: 'numeric', year: 'numeric' });
          result = `${startText} - ${endText}`;
        }
        break;
      case 'month':
        result = safeDateFormat(businessDate, { year: 'numeric', month: 'long' });
        break;
      default:
        result = safeDateFormat(businessDate, { year: 'numeric', month: 'long', day: 'numeric' });
        break;
    }
    
    // Sanitize the result
    const sanitizedResult = sanitizeString(result, 'Date Error');
    
    if (sanitizedResult === 'Date Error') {
      console.error('🚨 MALFORMED DATE RANGE TEXT DETECTED:', result);
      // Emergency fallback using safe formatter
      return safeDateFormat(validDate, { year: 'numeric', month: 'long', day: 'numeric' });
    }
    
    return sanitizedResult;
  } catch (error) {
    console.error('❌ Critical error in getDateRangeText:', error);
    return safeDateFormat(selectedDate, { year: 'numeric', month: 'long', day: 'numeric' }) || 'Date Error';
  }
};

export const getDateRangeDescription = (viewMode: 'day' | 'week' | 'month', selectedDate: Date): string => {
  try {
    // Enhanced validation
    const validDate = validateDate(selectedDate);
    if (!validDate) {
      console.error('🚨 Invalid selected date for range description:', selectedDate);
      return 'Showing appointments for selected date';
    }

    // Get the safe date range text
    const dateRangeText = getDateRangeText(viewMode, validDate);
    
    // Sanitize the result
    const sanitizedDateRange = sanitizeString(dateRangeText, 'selected date');
    
    return `Showing appointments for ${sanitizedDateRange}`;
  } catch (error) {
    console.error('❌ Error in getDateRangeDescription:', error);
    const fallbackDate = safeDateFormat(selectedDate) || 'selected date';
    return `Showing appointments for ${fallbackDate}`;
  }
};

export const getAppointmentCountText = (count: number, viewMode: 'day' | 'week' | 'month'): string => {
  const period = viewMode === 'day' ? 'today' : `this ${viewMode}`;
  if (count === 0) {
    return `No appointments ${period}`;
  } else if (count === 1) {
    return `1 appointment ${period}`;
  } else {
    return `${count} appointments ${period}`;
  }
};
