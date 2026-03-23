import { useState, useMemo, useCallback, useEffect } from 'react';
import { Appointment } from '../components/AppointmentModal';
import { formatTimeDisplay, formatInBusinessTime } from '@/lib/timeUtils';
import { filterAppointments } from '@/utils/appointmentFilters';
import { sanitizeString, sanitizeStringArray, scanAndSanitizeDOM, containsMalformedPattern } from '@/lib/dataSanitization';

interface UseAppointmentsDataProps {
  appointments: any[];
  selectedDate: Date;
}

interface AppointmentFilterState {
  dateFilter: string;
  staffFilter: string;
  statusFilter: string;
  searchQuery: string;
  treatmentFilter: string;
  filterViewMode: 'day' | 'week' | 'month';
}

export const useAppointmentsData = ({ appointments, selectedDate }: UseAppointmentsDataProps) => {
  console.log('🔄 useAppointmentsData called with:', { appointmentsCount: appointments?.length || 0, selectedDate });
  
  // Filter states with sanitized initialization
  const [dateFilter, setDateFilter] = useState('');
  const [staffFilter, setStaffFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState('all');
  const [filterViewMode, setFilterViewMode] = useState<'day' | 'week' | 'month'>('day');

  // Enhanced error detection and DOM scanning
  useEffect(() => {
    const detectAndFixErrors = () => {
      // Run DOM scan to catch any lingering malformed patterns
      scanAndSanitizeDOM();
      
      // Validate current filter states
      const filters = { dateFilter, staffFilter, statusFilter, searchQuery, treatmentFilter };
      let hasProblems = false;
      
      Object.entries(filters).forEach(([key, value]) => {
        if (containsMalformedPattern(value)) {
          console.error('🚨 MALFORMED FILTER DETECTED:', key, value);
          hasProblems = true;
        }
      });
      
      if (hasProblems) {
        console.log('🔄 Resetting filters due to malformed patterns');
        setDateFilter('');
        setStaffFilter('all');
        setStatusFilter('all');
        setSearchQuery('');
        setTreatmentFilter('all');
      }
    };

    // Run immediately and then periodically
    detectAndFixErrors();
    const interval = setInterval(detectAndFixErrors, 2000);
    
    return () => clearInterval(interval);
  }, [dateFilter, staffFilter, statusFilter, searchQuery, treatmentFilter]);

  // Memoize transformed appointments with comprehensive sanitization
  const transformedAppointments: Appointment[] = useMemo(() => {
    console.log('🔄 Transforming appointments with sanitization:', appointments?.length || 0);
    
    if (!appointments || !Array.isArray(appointments) || appointments.length === 0) {
      console.log('❌ No appointments to transform');
      return [];
    }
    
    const transformed = appointments.map(apt => {
      const transformedApt = {
        id: sanitizeString(apt.id, `temp-${Date.now()}`),
        time: sanitizeString(formatTimeDisplay(apt.appointment_time), '09:00'),
        date: sanitizeString(apt.appointment_date, new Date().toISOString().split('T')[0]),
        client: sanitizeString(apt.client_name, 'Unknown Client'),
        treatment: sanitizeString(apt.treatment_name, 'Unknown Treatment'),
        staff: sanitizeString(apt.staff_name, 'Unknown Staff'),
        duration: typeof apt.duration === 'number' ? apt.duration : 60,
        status: (apt.status as Appointment['status']) || 'scheduled',
        phone: sanitizeString(apt.client_phone, 'No Phone'),
        email: sanitizeString(apt.client_email, 'No Email'),
        notes: sanitizeString(apt.notes || '', ''),
        allergies: ''
      };
      
      // Log any transformations that required sanitization
      if (apt.client_name !== transformedApt.client || 
          apt.treatment_name !== transformedApt.treatment ||
          apt.staff_name !== transformedApt.staff) {
        console.warn('🧹 Sanitized appointment during transformation:', {
          id: transformedApt.id,
          original: { client: apt.client_name, treatment: apt.treatment_name, staff: apt.staff_name },
          sanitized: { client: transformedApt.client, treatment: transformedApt.treatment, staff: transformedApt.staff }
        });
      }
      
      return transformedApt;
    });
    
    console.log('✅ All appointments transformed and sanitized:', transformed.length);
    return transformed;
  }, [appointments]);

  // Memoize filtered appointments
  const filteredAppointments = useMemo(() => {
    console.log('🔄 Filtering appointments with current filters:', {
      dateFilter,
      staffFilter,
      statusFilter,
      searchQuery,
      treatmentFilter,
      filterViewMode,
      selectedDate
    });
    
    if (!transformedAppointments || transformedAppointments.length === 0) {
      console.log('❌ No transformed appointments to filter');
      return [];
    }
    
    const filtered = filterAppointments(transformedAppointments, {
      dateFilter,
      staffFilter,
      statusFilter,
      searchQuery,
      treatmentFilter,
      viewMode: filterViewMode,
      selectedDate
    });
    
    console.log('✅ Filtered appointments:', filtered.length);
    return filtered;
  }, [transformedAppointments, dateFilter, staffFilter, statusFilter, searchQuery, treatmentFilter, filterViewMode, selectedDate]);

  // Memoize dropdown data with sanitization
  const staff = useMemo(() => {
    if (!transformedAppointments || transformedAppointments.length === 0) {
      return [];
    }
    const rawStaffList = transformedAppointments.map(apt => apt.staff).filter(Boolean);
    const sanitizedStaffList = sanitizeStringArray(rawStaffList, 'Unknown Staff');
    const uniqueStaffList = [...new Set(sanitizedStaffList)];
    
    console.log('📋 Sanitized staff list:', uniqueStaffList);
    return uniqueStaffList;
  }, [transformedAppointments]);
  
  const treatments = useMemo(() => {
    if (!transformedAppointments || transformedAppointments.length === 0) {
      return [];
    }
    const rawTreatmentList = transformedAppointments.map(apt => apt.treatment).filter(Boolean);
    const sanitizedTreatmentList = sanitizeStringArray(rawTreatmentList, 'Unknown Treatment');
    const uniqueTreatmentList = [...new Set(sanitizedTreatmentList)];
    
    console.log('📋 Sanitized treatments list:', uniqueTreatmentList);
    return uniqueTreatmentList;
  }, [transformedAppointments]);

  // Calculate statistics with proper null safety and error handling
  const statistics = useMemo(() => {
    const safeAppointments = filteredAppointments || [];
    const stats = {
      totalAppointments: Math.max(0, safeAppointments.length),
      confirmedAppointments: Math.max(0, safeAppointments.filter(apt => apt.status === 'confirmed').length),
      scheduledAppointments: Math.max(0, safeAppointments.filter(apt => apt.status === 'scheduled').length),
      completedAppointments: Math.max(0, safeAppointments.filter(apt => apt.status === 'completed').length)
    };
    console.log('📊 Statistics calculated:', stats);
    return stats;
  }, [filteredAppointments]);

  // Enhanced clear filters with sanitization check
  const handleClearFilters = useCallback(() => {
    console.log('🧹 Clearing all filters with sanitization check');
    setDateFilter('');
    setStaffFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setTreatmentFilter('all');
    
    // Force a DOM scan after clearing filters
    setTimeout(() => {
      scanAndSanitizeDOM();
    }, 100);
  }, []);

  // Sanitized setters to prevent malformed values from being set
  const setSanitizedDateFilter = useCallback((value: string) => {
    const sanitized = sanitizeString(value, '');
    console.log('📅 Setting sanitized date filter:', value, '->', sanitized);
    setDateFilter(sanitized);
  }, []);

  const setSanitizedStaffFilter = useCallback((value: string) => {
    const sanitized = sanitizeString(value, 'all');
    console.log('👥 Setting sanitized staff filter:', value, '->', sanitized);
    setStaffFilter(sanitized);
  }, []);

  const setSanitizedStatusFilter = useCallback((value: string) => {
    const sanitized = sanitizeString(value, 'all');
    console.log('📊 Setting sanitized status filter:', value, '->', sanitized);
    setStatusFilter(sanitized);
  }, []);

  const setSanitizedSearchQuery = useCallback((value: string) => {
    const sanitized = sanitizeString(value, '');
    console.log('🔍 Setting sanitized search query:', value, '->', sanitized);
    setSearchQuery(sanitized);
  }, []);

  const setSanitizedTreatmentFilter = useCallback((value: string) => {
    const sanitized = sanitizeString(value, 'all');
    console.log('💊 Setting sanitized treatment filter:', value, '->', sanitized);
    setTreatmentFilter(sanitized);
  }, []);

  return {
    // Filter states
    dateFilter,
    staffFilter,
    statusFilter,
    searchQuery,
    treatmentFilter,
    filterViewMode,
    
    // Sanitized filter setters
    setDateFilter: setSanitizedDateFilter,
    setStaffFilter: setSanitizedStaffFilter,
    setStatusFilter: setSanitizedStatusFilter,
    setSearchQuery: setSanitizedSearchQuery,
    setTreatmentFilter: setSanitizedTreatmentFilter,
    setFilterViewMode,
    
    // Data
    transformedAppointments,
    filteredAppointments,
    staff,
    treatments,
    statistics,
    
    // Actions
    handleClearFilters
  };
};
