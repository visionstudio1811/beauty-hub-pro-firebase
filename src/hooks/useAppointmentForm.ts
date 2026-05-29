
import { useState, useEffect, useMemo } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSupabaseBusinessHours } from '@/hooks/useSupabaseBusinessHours';
import { useSupabaseProfiles } from '@/hooks/useSupabaseProfiles';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { useSupabaseAddons } from '@/hooks/useSupabaseAddons';
import { useSupabaseAppointments } from '@/hooks/useSupabaseAppointments';
import { useSchedulingConfig } from '@/contexts/SchedulingConfigContext';
import { useSupabaseBusinessInfo } from '@/hooks/useSupabaseBusinessInfo';
import { useClients, Client } from '@/hooks/useClients';
import { useClientPackages, ClientPackage } from '@/hooks/useClientPackages';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { syncMembershipStatus } from '@/hooks/useMembershipSync';
import { useAvailableSlots } from '@/hooks/scheduling/useAvailableSlots';
import { checkCustomTimeConflict } from '@/lib/scheduling/availability';
import type { StaffForScheduling, TreatmentForScheduling } from '@/lib/scheduling/types';
import { format } from 'date-fns';


interface AppointmentFormData {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  time: string;
  treatmentId: string;
  staffId: string;
  notes: string;
  roomId: string;
  price: string;
  selectedAddonIds: string[];
}

interface TimeSlot {
  time: string;
  available: boolean;
  availableCount: number;
  maxCount: number;
  displayText: string;
  staff_id?: string;
}

export const useAppointmentForm = (clientId?: string, clientName?: string) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [formData, setFormData] = useState<AppointmentFormData>({
    clientName: clientName || '',
    clientPhone: '',
    clientEmail: '',
    time: '',
    treatmentId: '',
    staffId: '',
    notes: '',
    roomId: '',
    price: '',
    selectedAddonIds: []
  });
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ClientPackage | null>(null);
  const [isBeautician, setIsBeautician] = useState(false);
  // Custom-time override: when true, the slot picker is bypassed and the staff
  // types a free-form time. Conflicts become advisory (warning, not block).
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState<string>('');

  const { user, profile } = useAuth();
  const { validateUserRole } = useSecurityValidation();
  const { treatments, loading: treatmentsLoading } = useSupabaseTreatments();
  const { addons, loading: addonsLoading } = useSupabaseAddons();
  const { addAppointment, appointments } = useSupabaseAppointments();
  const { businessHours, loading: businessHoursLoading } = useSupabaseBusinessHours();
  const { schedulingConfigs } = useSchedulingConfig();
  const { businessInfo } = useSupabaseBusinessInfo();
  const { getStaffProfiles, getBeauticianProfiles, loading: staffLoading } = useSupabaseProfiles();
  const { clients } = useClients();
  const { packages: clientPackages, loading: packagesLoading, refreshPackages } = useClientPackages(selectedClient?.id);
  
  // Calculate selected date string. Use date-fns format (local time) instead
  // of toISOString().split('T')[0] which UTC-shifts — for users east of UTC
  // in the evening, that would book slots for the next day.
  const selectedDateString = format(selectedDate, 'yyyy-MM-dd');

  // Pre-select client if clientId is provided
  useEffect(() => {
    if (clientId && clients.length > 0) {
      const client = clients.find(c => c.id === clientId);
      if (client) {
        setSelectedClient(client);
        setFormData(prev => ({
          ...prev,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email || ''
        }));
      }
    }
  }, [clientId, clients]);

  // Check if current user is beautician
  useEffect(() => {
    const checkRole = async () => {
      const isUserBeautician = await validateUserRole(['beautician']);
      setIsBeautician(isUserBeautician);
    };
    
    checkRole();
  }, [user, validateUserRole]);

  // Get staff profiles based on user role
  const staffProfiles = isBeautician ? getBeauticianProfiles() : getStaffProfiles();
  const selectedTreatment = treatments.find(t => t.id === formData.treatmentId);

  // Derived add-on selections and totals
  const selectedAddons = addons.filter(a => formData.selectedAddonIds.includes(a.id));
  const addonsTotalDuration = selectedAddons.reduce(
    (sum, a) => sum + (a.duration_minutes ?? 0),
    0,
  );
  const addonsTotalPrice = selectedAddons.reduce((sum, a) => sum + (a.price ?? 0), 0);
  const totalDuration = (selectedTreatment?.duration ?? 0) + addonsTotalDuration;

  // Filter treatments based on selected package. For per-treatment packages we
  // only allow treatments whose remaining slot is > 0; legacy single-pool packages
  // allow any listed treatment until the overall sessions_remaining hits 0.
  const availableTreatments = (() => {
    if (!selectedPackage) return treatments;
    const slots = selectedPackage.sessions_by_treatment;
    if (slots && slots.length > 0) {
      const allowed = new Set(slots.filter(s => s.remaining > 0).map(s => s.treatment_id));
      return treatments.filter(t => allowed.has(t.id));
    }
    return treatments.filter(t => selectedPackage.treatments.includes(t.id));
  })();

  // Map the selected treatment + staff profiles into the scheduling utility's shape.
  const treatmentForScheduling: TreatmentForScheduling | null = useMemo(() => {
    if (!selectedTreatment) return null;
    return {
      id: selectedTreatment.id,
      duration: totalDuration,
      buffer_before_minutes: selectedTreatment.buffer_before_minutes,
      buffer_after_minutes: selectedTreatment.buffer_after_minutes,
      advance_min_hours: selectedTreatment.advance_min_hours,
      advance_max_days: selectedTreatment.advance_max_days,
      staff_ids: selectedTreatment.staff_ids,
      availability: selectedTreatment.availability,
    };
  }, [selectedTreatment, totalDuration]);

  const staffForScheduling: StaffForScheduling[] = useMemo(() => {
    return staffProfiles.map(p => ({
      id: p.id,
      name: p.full_name || p.email || 'Staff',
      // Profile docs don't carry treatment_ids/default_buffer; those live on the
      // staff metadata. For now we pass undefined (no restriction).
    }));
  }, [staffProfiles]);

  const existingAppointmentsForScheduling = useMemo(() => {
    return appointments.map(apt => ({
      staff_id: apt.staff_id,
      appointment_date: apt.appointment_date,
      appointment_time: apt.appointment_time,
      duration: apt.duration,
      buffer_before_minutes: apt.buffer_before_minutes,
      buffer_after_minutes: apt.buffer_after_minutes,
      status: apt.status,
    }));
  }, [appointments]);

  // New unified slot generator. Returns slots across all candidate staff for
  // the selected date. When a specific staffId is picked, the caller filters.
  const availabilitySlots = useAvailableSlots({
    date: selectedTreatment && !useCustomTime ? selectedDateString : null,
    treatment: treatmentForScheduling,
    staffList: staffForScheduling,
    existingAppointments: existingAppointmentsForScheduling,
    businessHours,
    schedulingConfigs,
    slotIntervalMinutes: businessInfo?.slot_interval_minutes,
  });

  // Adapter: collapse multi-staff slots into the legacy TimeSlot[] shape so the
  // existing modal markup keeps working until Phase 1's UI changes land.
  // When a staff is selected, only that staff's slots are shown; otherwise we
  // show one row per time with the count of available staff.
  const availableTimeSlots: TimeSlot[] = useMemo(() => {
    if (!availabilitySlots.slots.length) return [];
    if (formData.staffId) {
      return availabilitySlots.slots
        .filter(s => s.staff_id === formData.staffId)
        .map(s => ({
          time: s.time,
          available: true,
          availableCount: 1,
          maxCount: 1,
          displayText: s.time,
          staff_id: s.staff_id,
        }));
    }
    // No staff picked — show one entry per time with how many staff are free
    return Array.from(availabilitySlots.byTime.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([time, staffIds]) => ({
        time,
        available: true,
        availableCount: staffIds.length,
        maxCount: staffIds.length,
        displayText: staffIds.length > 1 ? `${time} (${staffIds.length} staff free)` : time,
      }));
  }, [availabilitySlots.slots, availabilitySlots.byTime, formData.staffId]);

  // For the custom-time mode: returns a conflict descriptor if the typed time
  // overlaps an existing appointment for the chosen staff (advisory only).
  const customTimeConflict = useMemo(() => {
    if (!useCustomTime || !customTime || !formData.staffId || !selectedTreatment) return null;
    return checkCustomTimeConflict({
      staffId: formData.staffId,
      date: selectedDateString,
      time: customTime,
      duration: totalDuration,
      existingAppointments: existingAppointmentsForScheduling,
    });
  }, [useCustomTime, customTime, formData.staffId, selectedTreatment, selectedDateString, totalDuration, existingAppointmentsForScheduling]);

  // Validation: only blocks on missing required fields. Slot conflicts in
  // standard mode are already filtered out by the picker. Custom-time mode is
  // intentionally permissive — staff override is intentional (walk-ins / VIPs).
  const validateAppointmentBooking = (): string | null => {
    if (!selectedTreatment || !formData.staffId) {
      return 'Please select treatment and staff';
    }
    const effectiveTime = useCustomTime ? customTime : formData.time;
    if (!effectiveTime) {
      return useCustomTime ? 'Please enter a time' : 'Please select a time slot';
    }
    if (useCustomTime && !/^\d{2}:\d{2}$/.test(customTime)) {
      return 'Custom time must be in HH:MM format';
    }
    return null;
  };

  // Get next available room ID
  const getNextAvailableRoomId = (time: string): string => {
    if (!formData.staffId) return '';
    
    const appointmentsAtTime = appointments.filter(apt => 
      apt.appointment_date === selectedDateString && 
      apt.appointment_time === time &&
      apt.staff_id === formData.staffId && 
      apt.status !== 'cancelled' && 
      apt.status !== 'no-show'
    );
    
    const usedRoomIds = appointmentsAtTime.map(apt => apt.room_id).filter(Boolean) as string[];
    
    for (let i = 1; i <= 10; i++) {
      const roomId = `Room ${i}`;
      if (!usedRoomIds.includes(roomId)) {
        return roomId;
      }
    }
    
    return 'Room X';
  };

  /**
   * Decrements session counts on the purchase document when a booking consumes
   * one session. If the purchase has a per-treatment breakdown (sessions_by_treatment),
   * only the matching treatment's slot is decremented and sessions_remaining is
   * recomputed as the sum. Legacy purchases without the breakdown fall back to the
   * single shared counter. Marks the purchase 'completed' once all sessions are spent.
   */
  const decrementPurchaseSession = async (
    pkg: ClientPackage,
    treatmentId?: string | null,
  ): Promise<void> => {
    if (!profile?.organizationId) return;

    const updates: Record<string, unknown> = { updated_at: serverTimestamp() };
    let newTotal: number;

    if (pkg.sessions_by_treatment && pkg.sessions_by_treatment.length > 0 && treatmentId) {
      const slots = pkg.sessions_by_treatment.map(s => ({ ...s }));
      const slot = slots.find(s => s.treatment_id === treatmentId);
      if (slot && slot.remaining > 0) {
        slot.remaining = Math.max(0, slot.remaining - 1);
      }
      newTotal = slots.reduce((sum, s) => sum + s.remaining, 0);
      updates.sessions_by_treatment = slots;
      updates.sessions_remaining = newTotal;
    } else {
      newTotal = Math.max(0, pkg.sessions_remaining - 1);
      updates.sessions_remaining = newTotal;
    }

    if (newTotal === 0) {
      updates.payment_status = 'completed';
    }

    await updateDoc(
      doc(db, 'organizations', profile.organizationId, 'purchases', pkg.id),
      updates,
    );

    if (newTotal === 0 && selectedClient?.id) {
      await syncMembershipStatus(profile.organizationId, selectedClient.id);
    }
  };

  return {
    formData,
    setFormData,
    selectedDate,
    setSelectedDate,
    selectedClient,
    setSelectedClient,
    selectedPackage,
    setSelectedPackage,
    selectedTreatment,
    availableTreatments,
    availableAddons: addons,
    selectedAddons,
    addonsTotalDuration,
    addonsTotalPrice,
    totalDuration,
    availableTimeSlots,
    staffProfiles,
    clientPackages,
    treatments,
    addAppointment,
    decrementPurchaseSession,
    refreshPackages,
    getNextAvailableRoomId,
    validateAppointmentBooking,
    // Custom-time override (Phase 1)
    useCustomTime,
    setUseCustomTime,
    customTime,
    setCustomTime,
    customTimeConflict,
    loading: {
      treatments: treatmentsLoading,
      addons: addonsLoading,
      staff: staffLoading,
      packages: packagesLoading,
      businessHours: businessHoursLoading,
      slots: availabilitySlots.loading,
    },
    selectedDateString,
  };
};
