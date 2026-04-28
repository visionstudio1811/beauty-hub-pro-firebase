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
    if (!appointments || !Array.isArray(appointments) || appointments.length === 0) {
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

    return transformed;
  }, [appointments]);

  // Memoize filtered appointments
  const filteredAppointments = useMemo(() => {
    if (!transformedAppointments || transformedAppointments.length === 0) {
      return [];
    }

    return filterAppointments(transformedAppointments, {
      dateFilter,
      staffFilter,
      statusFilter,
      searchQuery,
      treatmentFilter,
      viewMode: filterViewMode,
      selectedDate
    });
  }, [transformedAppointments, dateFilter, staffFilter, statusFilter, searchQuery, treatmentFilter, filterViewMode, selectedDate]);

  // Memoize dropdown data with sanitization
  const staff = useMemo(() => {
    if (!transformedAppointments || transformedAppointments.length === 0) {
      return [];
    }
    const rawStaffList = transformedAppointments.map(apt => apt.staff).filter(Boolean);
    const sanitizedStaffList = sanitizeStringArray(rawStaffList, 'Unknown Staff');
    return [...new Set(sanitizedStaffList)];
  }, [transformedAppointments]);
  
  const treatments = useMemo(() => {
    if (!transformedAppointments || transformedAppointments.length === 0) {
      return [];
    }
    const rawTreatmentList = transformedAppointments.map(apt => apt.treatment).filter(Boolean);
    const sanitizedTreatmentList = sanitizeStringArray(rawTreatmentList, 'Unknown Treatment');
    return [...new Set(sanitizedTreatmentList)];
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
    return stats;
  }, [filteredAppointments]);

  // Enhanced clear filters with sanitization check
  const handleClearFilters = useCallback(() => {
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
    setDateFilter(sanitizeString(value, ''));
  }, []);

  const setSanitizedStaffFilter = useCallback((value: string) => {
    setStaffFilter(sanitizeString(value, 'all'));
  }, []);

  const setSanitizedStatusFilter = useCallback((value: string) => {
    setStatusFilter(sanitizeString(value, 'all'));
  }, []);

  const setSanitizedSearchQuery = useCallback((value: string) => {
    setSearchQuery(sanitizeString(value, ''));
  }, []);

  const setSanitizedTreatmentFilter = useCallback((value: string) => {
    setTreatmentFilter(sanitizeString(value, 'all'));
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
