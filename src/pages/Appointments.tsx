
import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import AppointmentModal, { Appointment } from '../components/AppointmentModal';
import AppointmentFilters from '../components/AppointmentFilters';
import AppointmentSection from '../components/dashboard/AppointmentSection';
import AppointmentsHeader from '../components/appointments/AppointmentsHeader';
import AppointmentsStats from '../components/appointments/AppointmentsStats';
import { BookingRequestsPanel } from '@/components/appointments/BookingRequestsPanel';
import { useAppointmentStatus } from '../hooks/useAppointmentStatus';
import { useSupabaseAppointments } from '@/hooks/useSupabaseAppointments';
import { useAppointmentsData } from '@/hooks/useAppointmentsData';

const Appointments = () => {
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { getStatusColor, getStatusBadge } = useAppointmentStatus();
  const { appointments, updateAppointment, deleteAppointment, loading } = useSupabaseAppointments();

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
  }, [updateAppointment]);

  const handleDeleteAppointment = useCallback((appointmentId: string) => {
    deleteAppointment(appointmentId);
  }, [deleteAppointment]);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setSelectedAppointment(null);
  }, []);

  const handleNewAppointmentModalClose = useCallback(() => {
    setIsNewAppointmentModalOpen(false);
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
      />
    </div>
  );
};

export default Appointments;
