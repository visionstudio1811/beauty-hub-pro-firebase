// Pure scheduling types — shared by the slot-availability utility, hooks, and
// (duplicated) by the getAvailableSlots Cloud Function. No React, no Firestore.
//
// Day-of-week convention: 0=Monday..6=Sunday (matches the existing
// businessHours and schedulingConfig data in this codebase). JS Date.getDay()
// is Sunday=0, so call `jsDayToMonFirst(date.getDay())` at the boundary.

export interface TimeWindow {
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
}

export interface DayWindow extends TimeWindow {
  day_of_week: number;   // 0=Mon..6=Sun
  is_active: boolean;
}

export interface StaffAvailabilityWeekly extends DayWindow {
  type: 'weekly';
}

export interface StaffAvailabilityOverride extends Partial<TimeWindow> {
  type: 'override';
  date: string;       // YYYY-MM-DD
  is_active: boolean; // false = day off; true with start/end = override hours
}

export type StaffAvailabilityDoc = StaffAvailabilityWeekly | StaffAvailabilityOverride;

export interface TreatmentForScheduling {
  id: string;
  duration: number;                  // Minutes
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  advance_min_hours?: number;
  advance_max_days?: number;
  staff_ids?: string[];              // Empty/missing = any active staff
  availability?: DayWindow[];        // Per-day windows; missing day = inherit
}

export interface StaffForScheduling {
  id: string;
  name: string;
  treatment_ids?: string[];          // Empty/missing = no restriction
  default_buffer_minutes?: number;
  availability?: StaffAvailabilityDoc[];
}

export interface ExistingAppointment {
  staff_id?: string;
  appointment_date: string;          // YYYY-MM-DD
  appointment_time: string;          // "HH:MM"
  duration: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  status: string;                    // 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show'
}

export interface BusinessHoursDay {
  day_of_week: number;               // 0=Mon..6=Sun
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
}

// Legacy org-wide narrower kept active as a fallback when staff schedules
// aren't configured. Day + optional staff scope.
export interface SchedulingConfigForScheduling {
  day_of_week: number;               // 0=Mon..6=Sun
  start_time: string;                // "HH:MM"
  end_time: string;                  // "HH:MM"
  staff_ids?: string[];              // Empty/missing = applies to all staff
  is_active: boolean;
}

export interface GenerateSlotsInput {
  date: string;                      // YYYY-MM-DD — the date to generate slots for
  treatment: TreatmentForScheduling;
  staffList: StaffForScheduling[];   // Candidate staff (already filtered to active)
  existingAppointments: ExistingAppointment[];
  businessHours: BusinessHoursDay[];
  schedulingConfigs?: SchedulingConfigForScheduling[];  // Optional legacy narrowers
  slotIntervalMinutes?: number;      // Org-wide slot step override (e.g. 30 or 60)
  nowIso: string;                    // Current ISO timestamp (for advance-window check)
}

export interface TimeSlot {
  time: string;                      // "HH:MM"
  staff_id: string;
  staff_name: string;
}

export interface MergedTimeSlot {
  time: string;                      // "HH:MM"
  available_staff_ids: string[];
}

// Helper: convert JS Date.getDay() (Sun=0) to our Mon=0 convention.
export const jsDayToMonFirst = (jsDay: number): number => (jsDay + 6) % 7;
