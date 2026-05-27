import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import AppointmentModal, { Appointment as UIAppointment } from '../components/AppointmentModal';
import DashboardStats from '../components/dashboard/DashboardStats';
import { AppointmentCalendarGrid } from '@/components/calendar/AppointmentCalendarGrid';

import { useSupabaseAppointments, SupabaseAppointment } from '@/hooks/useSupabaseAppointments';
import { useSupabaseStaff } from '@/hooks/useSupabaseStaff';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { usePurchasesData } from '@/hooks/usePurchasesData';
import { useClients } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import { decrementSessionForAppointment } from '@/lib/sessionDecrement';
import { formatTimeDisplay, getBusinessToday, getBusinessNow, isBusinessToday } from '@/lib/timeUtils';
import { useTimezone } from '@/hooks/useTimezone';

const toUiAppointment = (raw: SupabaseAppointment): UIAppointment => ({
  id: raw.id,
  time: formatTimeDisplay(raw.appointment_time),
  date: raw.appointment_date,
  client: raw.client_name,
  treatment: raw.treatment_name,
  staff: raw.staff_name,
  duration: raw.duration,
  status: raw.status,
  phone: raw.client_phone,
  email: raw.client_email,
  notes: raw.notes || '',
  allergies: '',
  addons: raw.addons,
  addons_total_price: raw.addons_total_price,
  addons_total_duration: raw.addons_total_duration,
  acuity_appointment_id: raw.acuity_appointment_id ?? null,
  sync_status: raw.sync_status,
});

const Dashboard = () => {
  const tz = useTimezone();
  const { profile } = useAuth();
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<UIAppointment | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const { appointments, updateAppointment, deleteAppointment } = useSupabaseAppointments();
  const { staff: staffList } = useSupabaseStaff();
  const { treatments: treatmentList } = useSupabaseTreatments();
  const { rows: purchaseRows } = usePurchasesData();
  const { clients } = useClients();

  // Click an event on the calendar → open the rich Appointment Details modal
  // (status, confirm, no-show, delete) — same UX as the Appointments page.
  const handleCalendarEventClick = useCallback((raw: SupabaseAppointment) => {
    setSelectedAppointment(toUiAppointment(raw));
    setIsViewModalOpen(true);
  }, []);

  const handleCalendarSlotClick = useCallback(() => {
    setIsNewAppointmentModalOpen(true);
  }, []);

  const handleStatusChange = useCallback(
    (appointmentId: string, newStatus: UIAppointment['status'], notes?: string) => {
      updateAppointment(appointmentId, {
        status: newStatus,
        notes: notes ? notes : undefined,
      });

      if (newStatus === 'completed' && profile?.organizationId) {
        const appt = appointments.find((a) => a.id === appointmentId);
        if (appt?.session_used && appt.purchase_id) {
          decrementSessionForAppointment(
            profile.organizationId,
            appt.purchase_id,
            appt.treatment_id ?? null,
            appt.client_id ?? null,
          ).catch((err) => console.error('Failed to decrement session:', err));
        }
      }
    },
    [updateAppointment, appointments, profile],
  );

  const handleDeleteAppointment = useCallback(
    (appointmentId: string) => {
      deleteAppointment(appointmentId);
    },
    [deleteAppointment],
  );

  const handleViewModalClose = useCallback(() => {
    setIsViewModalOpen(false);
    setSelectedAppointment(null);
  }, []);

  // Stats — all date-scoped to "today" so the dashboard is an at-a-glance
  // view, not a filter panel (use the Appointments page for filtering).
  const todayAppointments = useMemo(
    () => appointments.filter((a) => isBusinessToday(a.appointment_date, tz)).length,
    [appointments, tz],
  );
  const confirmedToday = useMemo(
    () =>
      appointments.filter(
        (a) => isBusinessToday(a.appointment_date, tz) && a.status === 'confirmed',
      ).length,
    [appointments, tz],
  );
  const activeMembers = useMemo(
    () => clients.filter((c) => c.has_membership).length,
    [clients],
  );
  const todayKey = getBusinessToday(tz);
  const todayRevenue = useMemo(
    () => purchaseRows.filter((r) => r.date === todayKey).reduce((sum, r) => sum + r.amount, 0),
    [purchaseRows, todayKey],
  );

  const statsData = {
    appointments: todayAppointments,
    newClients: 0,
    activePackages: activeMembers,
    pendingReviews: confirmedToday,
    todayRevenue,
  };

  return (
    <div className="space-y-5 max-w-full">
      {/* Header */}
      <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Here's what's happening today.</p>
        </div>
        <div className="flex-shrink-0 w-full sm:w-auto">
          <Button
            onClick={() => setIsNewAppointmentModalOpen(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4 flex-shrink-0" />
            <span className="truncate">New Appointment</span>
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <DashboardStats stats={statsData} />

      {/* Today's calendar widget */}
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Today's Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <AppointmentCalendarGrid
            appointments={appointments}
            staff={staffList}
            treatments={treatmentList}
            defaultView="day"
            defaultDate={getBusinessNow(tz)}
            showResources
            height={520}
            onSelectEvent={handleCalendarEventClick}
            onSlotSelect={handleCalendarSlotClick}
          />
        </CardContent>
      </Card>

      {/* Appointment Details Modal — opened from the calendar widget */}
      <AppointmentModal
        appointment={selectedAppointment}
        isOpen={isViewModalOpen}
        onClose={handleViewModalClose}
        onStatusChange={handleStatusChange}
        onDelete={handleDeleteAppointment}
      />

      {/* New Appointment Modal — opened from "+ New Appointment" + empty slots */}
      <AppointmentFormModal
        isOpen={isNewAppointmentModalOpen}
        onClose={() => setIsNewAppointmentModalOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
