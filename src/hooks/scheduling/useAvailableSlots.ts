import { useMemo } from 'react';
import { generateSlots, generateMergedSlots } from '@/lib/scheduling/availability';
import type {
  BusinessHoursDay,
  ExistingAppointment,
  SchedulingConfigForScheduling,
  StaffForScheduling,
  TimeSlot,
  TreatmentForScheduling,
} from '@/lib/scheduling/types';
import { useMultipleStaffAvailability } from './useStaffAvailability';
import type { DayHours } from '@/hooks/useSupabaseBusinessHours';
import type { SchedulingConfig } from '@/hooks/useSupabaseSchedulingConfig';

// DayHours uses Mon-first ordering by array index (per useSupabaseBusinessHours dayNames).
const dayHoursToBusinessHoursDay = (hours: DayHours[] | undefined): BusinessHoursDay[] => {
  if (!hours || hours.length === 0) return [];
  return hours.map((h, idx) => ({
    day_of_week: idx, // 0=Monday (matches Mon-first convention)
    is_open: h.enabled,
    open_time: h.enabled ? h.openTime : null,
    close_time: h.enabled ? h.closeTime : null,
  }));
};

interface UseAvailableSlotsInput {
  date: string | null;                    // YYYY-MM-DD; null = disabled
  treatment: TreatmentForScheduling | null;
  staffList: StaffForScheduling[];        // Already filtered to active staff
  existingAppointments: ExistingAppointment[];
  businessHours: DayHours[] | undefined;
  schedulingConfigs?: SchedulingConfig[]; // Legacy org-wide narrowers (optional)
  slotIntervalMinutes?: number;           // Org-wide slot step override (e.g. 30 or 60)
}

const schedulingConfigToScheduling = (
  configs: SchedulingConfig[] | undefined,
): SchedulingConfigForScheduling[] => {
  if (!configs) return [];
  return configs.map(c => ({
    day_of_week: c.day_of_week,
    start_time: c.start_time,
    end_time: c.end_time,
    staff_ids: c.staff_ids,
    is_active: c.is_active,
  }));
};

interface UseAvailableSlotsResult {
  slots: TimeSlot[];
  byTime: Map<string, string[]>;   // time → staff_ids
  loading: boolean;
}

/**
 * Compute available slots for a given date + treatment + staff list.
 * Pure compute on top of inputs you already have in memory + staff availability
 * fetched per-staff via React Query.
 */
export const useAvailableSlots = (input: UseAvailableSlotsInput): UseAvailableSlotsResult => {
  const { date, treatment, staffList, existingAppointments, businessHours, schedulingConfigs, slotIntervalMinutes } = input;

  const candidateStaffIds = useMemo(() => {
    if (!treatment) return [];
    const allowed = treatment.staff_ids && treatment.staff_ids.length > 0
      ? new Set(treatment.staff_ids)
      : null;
    return staffList
      .filter(s => {
        if (allowed && !allowed.has(s.id)) return false;
        if (s.treatment_ids && s.treatment_ids.length > 0 && !s.treatment_ids.includes(treatment.id)) {
          return false;
        }
        return true;
      })
      .map(s => s.id);
  }, [treatment, staffList]);

  const availabilityQuery = useMultipleStaffAvailability(candidateStaffIds);

  const result = useMemo<UseAvailableSlotsResult>(() => {
    if (!date || !treatment || candidateStaffIds.length === 0) {
      return { slots: [], byTime: new Map(), loading: false };
    }
    if (availabilityQuery.isLoading) {
      return { slots: [], byTime: new Map(), loading: true };
    }

    const availabilityMap = availabilityQuery.data ?? new Map();
    const enrichedStaff: StaffForScheduling[] = staffList
      .filter(s => candidateStaffIds.includes(s.id))
      .map(s => ({ ...s, availability: availabilityMap.get(s.id) ?? [] }));

    const sharedInput = {
      date,
      treatment,
      staffList: enrichedStaff,
      existingAppointments,
      businessHours: dayHoursToBusinessHoursDay(businessHours),
      schedulingConfigs: schedulingConfigToScheduling(schedulingConfigs),
      slotIntervalMinutes,
      nowIso: new Date().toISOString(),
    };
    const slots = generateSlots(sharedInput);
    const merged = generateMergedSlots(sharedInput);

    const byTime = new Map(merged.map(m => [m.time, m.available_staff_ids]));
    return { slots, byTime, loading: false };
  }, [date, treatment, staffList, candidateStaffIds, existingAppointments, businessHours, schedulingConfigs, slotIntervalMinutes, availabilityQuery.isLoading, availabilityQuery.data]);

  return result;
};
