
import { useState, useEffect } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSupabaseBusinessHours } from '@/hooks/useSupabaseBusinessHours';
import { useSupabaseProfiles } from '@/hooks/useSupabaseProfiles';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { useSupabaseAppointments } from '@/hooks/useSupabaseAppointments';
import { useSchedulingConfig } from '@/contexts/SchedulingConfigContext';
import { useClients, Client } from '@/hooks/useClients';
import { useClientPackages, ClientPackage } from '@/hooks/useClientPackages';
import { useAuth } from '@/contexts/AuthContext';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { syncMembershipStatus } from '@/hooks/useMembershipSync';


interface AppointmentFormData {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  time: string;
  treatmentId: string;
  staffId: string;
  notes: string;
  roomId: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
  availableCount: number;
  maxCount: number;
  displayText: string;
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
    roomId: ''
  });
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<ClientPackage | null>(null);
  const [isBeautician, setIsBeautician] = useState(false);

  const { user, profile } = useAuth();
  const { validateUserRole } = useSecurityValidation();
  const { treatments, loading: treatmentsLoading } = useSupabaseTreatments();
  const { addAppointment, appointments } = useSupabaseAppointments();
  const { businessHours, loading: businessHoursLoading } = useSupabaseBusinessHours();
  const { schedulingConfigs, loading: schedulingConfigLoading } = useSchedulingConfig();
  const { getStaffProfiles, getBeauticianProfiles, loading: staffLoading } = useSupabaseProfiles();
  const { clients } = useClients();
  const { packages: clientPackages, loading: packagesLoading, refreshPackages } = useClientPackages(selectedClient?.id);
  
  // Calculate selected date string
  const selectedDateString = selectedDate.toISOString().split('T')[0];

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

  // Get applicable scheduling configuration for selected date and staff
  const getApplicableSchedulingConfig = () => {
    if (!formData.staffId || schedulingConfigLoading || schedulingConfigs.length === 0) {
      return null;
    }

    const dayOfWeek = selectedDate.getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const applicableConfig = schedulingConfigs.find(config =>
      config.is_active &&
      config.day_of_week === adjustedDayOfWeek &&
      (!config.staff_ids ||
       config.staff_ids.length === 0 ||
       config.staff_ids.includes(formData.staffId))
    );

    return applicableConfig || null;
  };

  // Enhanced availability check with proper concurrent appointment counting including Acuity
  const getTimeSlotAvailability = (time: string, staffId: string, duration: number, maxConcurrent: number) => {
    const appointmentStart = new Date(`${selectedDateString}T${time}`);
    const appointmentEnd = new Date(appointmentStart.getTime() + duration * 60000);

    // Get all local appointments for the selected date and staff (excluding cancelled/no-show)
    const dayAppointments = appointments.filter(apt => 
      apt.appointment_date === selectedDateString && 
      apt.staff_id === staffId && 
      apt.status !== 'cancelled' && 
      apt.status !== 'no-show'
    );

    let overlappingCount = 0;
    
    // Count local appointments that overlap with the requested time slot
    for (const existing of dayAppointments) {
      const existingStart = new Date(`${existing.appointment_date}T${existing.appointment_time}`);
      const existingEnd = new Date(existingStart.getTime() + existing.duration * 60000);

      // Check if the time slots overlap
      if (appointmentStart < existingEnd && appointmentEnd > existingStart) {
        overlappingCount++;
      }
    }


    const availableCount = Math.max(0, maxConcurrent - overlappingCount);

    return {
      available: availableCount > 0,
      availableCount,
      overlappingCount
    };
  };

  // Generate available time slots with enhanced visual feedback
  const generateAvailableTimeSlots = (): TimeSlot[] => {
    if (!formData.staffId || !selectedTreatment || businessHoursLoading || schedulingConfigLoading) {
      return [];
    }

    const dayOfWeek = selectedDate.getDay();
    const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const schedulingConfig = getApplicableSchedulingConfig();
    
    const dayHours = schedulingConfig 
      ? { 
          enabled: true, 
          openTime: schedulingConfig.start_time, 
          closeTime: schedulingConfig.end_time 
        }
      : businessHours.find((_, index) => index === adjustedDayOfWeek);
    
    if (!dayHours || !dayHours.enabled) {
      return [];
    }

    const slots: TimeSlot[] = [];
    const startTime = dayHours.openTime;
    const endTime = dayHours.closeTime;
    const treatmentDuration = selectedTreatment.duration;
    
    const timeInterval = schedulingConfig
      ? schedulingConfig.time_interval_minutes
      : treatmentDuration;

    const maxConcurrent = schedulingConfig
      ? schedulingConfig.max_concurrent_appointments
      : 1;

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    let currentHour = startHour;
    let currentMinute = startMinute;

    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
      const timeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      
      const availabilityInfo = getTimeSlotAvailability(timeString, formData.staffId, treatmentDuration, maxConcurrent);
      
      // Create display text with availability info
      let displayText = timeString;
      if (maxConcurrent > 1) {
        displayText += ` (${availabilityInfo.availableCount}/${maxConcurrent} available)`;
      }
      if (!availabilityInfo.available) {
        displayText += ' - FULL';
      }
      
      slots.push({
        time: timeString,
        available: availabilityInfo.available,
        availableCount: availabilityInfo.availableCount,
        maxCount: maxConcurrent,
        displayText
      });

      currentMinute += timeInterval;
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60);
        currentMinute = currentMinute % 60;
      }
    }

    // Filter slots that would end before business hours close
    const validSlots = slots.filter(slot => {
      const [slotHour, slotMinute] = slot.time.split(':').map(Number);
      const slotEndMinute = slotMinute + treatmentDuration;
      const slotEndHour = slotHour + Math.floor(slotEndMinute / 60);
      const finalEndMinute = slotEndMinute % 60;
      
      return slotEndHour < endHour || (slotEndHour === endHour && finalEndMinute <= endMinute);
    });

    return validSlots;
  };

  // Validate appointment booking before submission
  const validateAppointmentBooking = (): string | null => {
    if (!selectedTreatment || !formData.staffId || !formData.time) {
      return "Please select treatment, staff, and time slot";
    }

    const schedulingConfig = getApplicableSchedulingConfig();
    const maxConcurrent = schedulingConfig 
      ? schedulingConfig.max_concurrent_appointments 
      : 1;

    const availabilityInfo = getTimeSlotAvailability(
      formData.time, 
      formData.staffId, 
      selectedTreatment.duration, 
      maxConcurrent
    );

    if (!availabilityInfo.available) {
      return `This time slot is fully booked (${maxConcurrent}/${maxConcurrent} appointments)`;
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

  const availableTimeSlots = generateAvailableTimeSlots();

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
    availableTimeSlots,
    staffProfiles,
    clientPackages,
    treatments,
    addAppointment,
    decrementPurchaseSession,
    refreshPackages,
    getNextAvailableRoomId,
    validateAppointmentBooking,
      loading: {
        treatments: treatmentsLoading,
        staff: staffLoading,
        packages: packagesLoading,
        businessHours: businessHoursLoading,
        schedulingConfig: schedulingConfigLoading
      },
    selectedDateString
  };
};
