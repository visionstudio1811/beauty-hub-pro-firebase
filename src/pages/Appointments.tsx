
import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import AppointmentModal, { Appointment } from '../components/AppointmentModal';
import AppointmentFilters from '../components/AppointmentFilters';
import AppointmentSection from '../components/dashboard/AppointmentSection';
import AppointmentsHeader from '../components/appointments/AppointmentsHeader';
import AppointmentsStats from '../components/appointments/AppointmentsStats';
import { BookingRequestsPanel } from '@/components/appointments/BookingRequestsPanel';
import { AppointmentCalendarGrid } from '@/components/calendar/AppointmentCalendarGrid';
import { useAppointmentStatus } from '../hooks/useAppointmentStatus';
import { useSupabaseAppointments, SupabaseAppointment } from '@/hooks/useSupabaseAppointments';
import { useSupabaseStaff } from '@/hooks/useSupabaseStaff';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { useAppointmentsData } from '@/hooks/useAppointmentsData';
import { useAuth } from '@/contexts/AuthContext';
import { decrementSessionForAppointment } from '@/lib/sessionDecrement';

const Appointments = () => {
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [newAppointmentSeed, setNewAppointmentSeed] = useState<{
    date?: Date;
    time?: string;
    staffId?: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'calendar'>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { profile } = useAuth();
  const { getStatusColor, getStatusBadge } = useAppointmentStatus();
  const { appointments, updateAppointment, deleteAppointment, loading } = useSupabaseAppointments();
  const { staff: staffList } = useSupabaseStaff();
  const { treatments: treatmentList } = useSupabaseTreatments();

  // Use the custom hook for data management
  const {
    dateFilter,
    staffFilter,
    statusFilter,
    searchQuery,
    treatmentFilter,
    filterViewMode,
    setDateFilter,
    setStaffFilter,
    setStatusFilter,
    setSearchQuery,
    setTreatmentFilter,
    setFilterViewMode,
    transformedAppointments,
    filteredAppointments,
    staff,
    treatments,
    statistics,
    handleClearFilters
  } = useAppointmentsData({ appointments, selectedDate });

  // Use useCallback for event handlers to prevent unnecessary re-renders
  const handleAppointmentClick = useCallback((appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsModalOpen(true);
  }, []);

  // Calendar handles its own date navigation, so we deliberately bypass the
  // Time Period (day/week/month) filter for it — otherwise navigating inside
  // the calendar would hide events that fall outside the parent's filter
  // window. Apply only the non-date filters (staff/status/treatment/search)
  // so dropdowns still work.
  const calendarAppointments: SupabaseAppointment[] = useMemo(() => {
    return appointments.filter((a) => {
      if (staffFilter !== 'all' && a.staff_name !== staffFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (treatmentFilter !== 'all' && a.treatment_name !== treatmentFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const blob = [a.client_name, a.treatment_name, a.staff_name, a.client_phone, a.client_email, a.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [appointments, staffFilter, statusFilter, treatmentFilter, searchQuery]);

  const handleCalendarEventClick = useCallback(
    (raw: SupabaseAppointment) => {
      const transformed = transformedAppointments.find((t) => t.id === raw.id);
      if (transformed) handleAppointmentClick(transformed);
    },
    [transformedAppointments, handleAppointmentClick],
  );

  const handleCalendarSlotClick = useCallback((start: Date, staffId?: string) => {
    const hh = String(start.getHours()).padStart(2, '0');
    const mm = String(start.getMinutes()).padStart(2, '0');
    setNewAppointmentSeed({ date: start, time: `${hh}:${mm}`, staffId });
    setIsNewAppointmentModalOpen(true);
  }, []);

  const handleStatusChange = useCallback((appointmentId: string, newStatus: Appointment['status'], notes?: string) => {
    const statusMap: Record<Appointment['status'], typeof appointments[0]['status']> = {
      'scheduled': 'scheduled',
      'confirmed': 'confirmed',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'cancelled': 'cancelled',
      'no-show': 'no-show'
    };

    updateAppointment(appointmentId, {
      status: statusMap[newStatus],
      notes: notes ? notes : undefined
    });

    // Decrement package session when an appointment is marked complete
    if (newStatus === 'completed' && profile?.organizationId) {
      const appt = appointments.find(a => a.id === appointmentId);
      if (appt?.session_used && appt.purchase_id) {
        decrementSessionForAppointment(
          profile.organizationId,
          appt.purchase_id,
          appt.treatment_id ?? null,
          appt.client_id ?? null,
        ).catch(err => console.error('Failed to decrement session:', err));
      }
    }
  }, [updateAppointment, appointments, profile]);

  const handleDeleteAppointment = useCallback((appointmentId: string) => {
    deleteAppointment(appointmentId);
  }, [deleteAppointment]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setSelectedAppointment(null);
  }, []);

  const handleNewAppointmentModalClose = useCallback(() => {
    setIsNewAppointmentModalOpen(false);
    setNewAppointmentSeed(null);
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div className="space-y-6 max-w-full">
        <AppointmentsHeader 
          onNewAppointmentClick={() => setIsNewAppointmentModalOpen(true)}
          loading={loading}
        />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <AppointmentsHeader 
        onNewAppointmentClick={() => setIsNewAppointmentModalOpen(true)}
        loading={loading}
      />

      {/* Summary Stats */}
      <AppointmentsStats 
        totalAppointments={statistics.totalAppointments}
        confirmedAppointments={statistics.confirmedAppointments}
        scheduledAppointments={statistics.scheduledAppointments}
        completedAppointments={statistics.completedAppointments}
      />

      <BookingRequestsPanel />

      {/* Filters */}
      <AppointmentFilters 
        dateFilter={dateFilter}
        staffFilter={staffFilter}
        statusFilter={statusFilter}
        searchQuery={searchQuery}
        treatmentFilter={treatmentFilter}
        viewMode={filterViewMode}
        layoutMode={viewMode}
        onDateFilterChange={setDateFilter}
        onStaffFilterChange={setStaffFilter}
        onStatusFilterChange={setStatusFilter}
        onSearchQueryChange={setSearchQuery}
        onTreatmentFilterChange={setTreatmentFilter}
        onViewModeChange={setFilterViewMode}
        onLayoutModeChange={setViewMode}
        onClearFilters={handleClearFilters}
        staff={staff}
        treatments={treatments}
      />

      {/* Appointments Section */}
      {viewMode === 'calendar' ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 w-full p-3 sm:p-4 lg:p-6">
          <AppointmentCalendarGrid
            appointments={calendarAppointments}
            staff={staffList}
            treatments={treatmentList}
            defaultView="week"
            defaultDate={selectedDate}
            showResources
            height={720}
            onSelectEvent={handleCalendarEventClick}
            onSlotSelect={handleCalendarSlotClick}
          />
        </div>
      ) : (
        <AppointmentSection
          appointments={filteredAppointments}
          viewMode={viewMode}
          selectedDate={selectedDate}
          onViewModeChange={setViewMode}
          onDateSelect={setSelectedDate}
          onAppointmentClick={handleAppointmentClick}
          getStatusColor={getStatusColor}
          getStatusBadge={getStatusBadge}
        />
      )}

      {/* Appointment Modal */}
      <AppointmentModal
        appointment={selectedAppointment}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onStatusChange={handleStatusChange}
        onDelete={handleDeleteAppointment}
      />

      {/* New Appointment Modal */}
      <AppointmentFormModal
        isOpen={isNewAppointmentModalOpen}
        onClose={handleNewAppointmentModalClose}
        initialDate={newAppointmentSeed?.date}
        initialTime={newAppointmentSeed?.time}
        initialStaffId={newAppointmentSeed?.staffId}
      />
    </div>
  );
};

export default Appointments;
