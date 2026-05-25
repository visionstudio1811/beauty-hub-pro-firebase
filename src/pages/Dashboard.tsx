import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Calendar, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import AppointmentFilters from '../components/AppointmentFilters';
import DashboardStats from '../components/dashboard/DashboardStats';
import { AppointmentCalendarGrid } from '@/components/calendar/AppointmentCalendarGrid';
import { useIsAdmin } from '@/hooks/useIsAdmin';

import { useSupabaseAppointments, SupabaseAppointment } from '@/hooks/useSupabaseAppointments';
import { useSupabaseStaff } from '@/hooks/useSupabaseStaff';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { usePurchasesData } from '@/hooks/usePurchasesData';
import { useClients } from '@/hooks/useClients';
import { useIsMobile } from '@/hooks/use-mobile';
import { filterAppointments, getDateRangeText } from '@/utils/appointmentFilters';
import { formatTimeDisplay, getBusinessToday, getBusinessNow, isBusinessToday } from '@/lib/timeUtils';
import { useTimezone } from '@/hooks/useTimezone';
import { Appointment as UIAppointment } from '../components/AppointmentModal';

const Dashboard = () => {
  const tz = useTimezone();
  const isAdmin = useIsAdmin();
  const [isNewAppointmentModalOpen, setIsNewAppointmentModalOpen] = useState(false);

  // Use org timezone for initial date state
  const [selectedDate, setSelectedDate] = useState<Date>(getBusinessNow(tz));
  const [filterViewMode, setFilterViewMode] = useState<'day' | 'week' | 'month'>('day');

  // Filter states - use org timezone for initial date
  const [dateFilter, setDateFilter] = useState(getBusinessToday(tz));
  const [staffFilter, setStaffFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'calendar'>('list');
  
  const isMobile = useIsMobile();

  const { appointments, loading } = useSupabaseAppointments();
  const { staff: staffList } = useSupabaseStaff();
  const { treatments: treatmentList } = useSupabaseTreatments();
  const { rows: purchaseRows } = usePurchasesData();
  const { clients } = useClients();
  const [editAppointment, setEditAppointment] = useState<UIAppointment | null>(null);

  // Transform appointments to match FilterableAppointment interface for stats
  const transformedAppointments = useMemo(() => {
    if (!appointments || !Array.isArray(appointments)) {
      return [];
    }
    
    return appointments.map(apt => ({
      id: apt.id,
      date: apt.appointment_date,
      time: formatTimeDisplay(apt.appointment_time),
      client: apt.client_name || '',
      treatment: apt.treatment_name || '',
      staff: apt.staff_name || '',
      duration: apt.duration || 0,
      status: apt.status,
      phone: apt.client_phone || '',
      email: apt.client_email || '',
      notes: apt.notes || '',
      allergies: ''
    }));
  }, [appointments]);

  // Apply filtering logic based on view mode for stats
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

  // Mock data for filters
  const staff = useMemo(() => {
    if (!transformedAppointments || transformedAppointments.length === 0) {
      return [];
    }
    return [...new Set(transformedAppointments.map(apt => apt.staff).filter(Boolean))];
  }, [transformedAppointments]);
  
  const treatments = useMemo(() => {
    if (!transformedAppointments || transformedAppointments.length === 0) {
      return [];
    }
    return [...new Set(transformedAppointments.map(apt => apt.treatment).filter(Boolean))];
  }, [transformedAppointments]);

  const handleClearFilters = () => {
    setDateFilter(getBusinessToday());
    setStaffFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setTreatmentFilter('all');
  };

  // Handle date filter changes with proper business timezone sync
  const handleDateFilterChange = (date: string) => {
    setDateFilter(date);
    if (date) {
      setSelectedDate(new Date(date + 'T12:00:00')); // Use noon to avoid timezone issues
    }
  };

  const dateRangeText = getDateRangeText(filterViewMode, selectedDate);

  // Calendar widget: clicking an event opens the form modal in edit mode.
  const handleCalendarEventClick = useCallback((raw: SupabaseAppointment) => {
    setEditAppointment({
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
    });
    setIsNewAppointmentModalOpen(true);
  }, []);

  const handleCalendarSlotClick = useCallback(() => {
    setEditAppointment(null);
    setIsNewAppointmentModalOpen(true);
  }, []);

  // Calculate stats from filtered appointments using business timezone - ensure they're numbers
  const totalAppointments = Math.max(0, filteredAppointments?.length || 0);
  const todayAppointments = Math.max(0, (transformedAppointments || []).filter(apt =>
    isBusinessToday(apt.date, tz)
  ).length);
  const confirmedAppointments = Math.max(0, (filteredAppointments || []).filter(apt => apt.status === 'confirmed').length);
  const completedAppointments = Math.max(0, (filteredAppointments || []).filter(apt => apt.status === 'completed').length);

  const activeMembers = useMemo(
    () => clients.filter(c => c.has_membership).length,
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
    pendingReviews: confirmedAppointments,
    todayRevenue,
  };

  return (
    <div className="space-y-5 max-w-full">
      {/* Header */}
      <div className="flex flex-col space-y-3 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            {filterViewMode === 'day' ? "Here's what's happening today." : `Viewing ${filterViewMode} appointments for ${dateRangeText}`}
          </p>
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
            defaultDate={new Date()}
            showResources
            height={520}
            onSelectEvent={handleCalendarEventClick}
            onSlotSelect={handleCalendarSlotClick}
          />
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="w-full">
        {/* Appointments */}
        <div className="space-y-4 sm:space-y-6">
          {/* Filters */}
          <div className="w-full max-w-full overflow-hidden">
            <AppointmentFilters 
              dateFilter={dateFilter}
              staffFilter={staffFilter}
              statusFilter={statusFilter}
              searchQuery={searchQuery}
              treatmentFilter={treatmentFilter}
              viewMode={filterViewMode}
              layoutMode={viewMode}
              onDateFilterChange={handleDateFilterChange}
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
          </div>

          {/* Appointments Display */}
          <div className="w-full">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-semibold">
                  Appointments for {dateRangeText}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="text-gray-500">Loading appointments...</div>
                  </div>
                ) : filteredAppointments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No appointments found for the selected filters.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredAppointments.map((appointment) => (
                      <div 
                        key={appointment.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-4">
                            <div className="text-sm font-medium text-gray-900">
                              {appointment.time}
                            </div>
                            <div className="text-sm text-gray-600">
                              {appointment.client}
                            </div>
                            <div className="text-sm text-gray-600">
                              {appointment.treatment}
                            </div>
                            <div className="text-sm text-gray-500">
                              {appointment.staff}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                            appointment.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800' :
                            appointment.status === 'completed' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800' :
                            appointment.status === 'cancelled' ? 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800' :
                            'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800'
                          }`}>
                            {appointment.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* New Appointment Modal */}
      <AppointmentFormModal
        isOpen={isNewAppointmentModalOpen}
        onClose={() => {
          setIsNewAppointmentModalOpen(false);
          setEditAppointment(null);
        }}
        editAppointment={editAppointment}
      />
    </div>
  );
};

export default Dashboard;
