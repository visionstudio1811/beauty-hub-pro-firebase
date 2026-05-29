// Pure slot-availability algorithm. Zero React, zero Firestore imports.
// Used by:
//   - src/hooks/scheduling/useAvailableSlots.ts (staff CRM)
//   - functions/src/lib/scheduling/availability.ts (DUPLICATE — keep in sync)
//
// If you change this file, update the functions/ duplicate. We duplicate
// instead of import because functions/ has its own tsconfig + build.

import type {
  BusinessHoursDay,
  DayWindow,
  ExistingAppointment,
  GenerateSlotsInput,
  MergedTimeSlot,
  SchedulingConfigForScheduling,
  StaffAvailabilityDoc,
  StaffForScheduling,
  TimeSlot,
  TimeWindow,
} from './types';
import { jsDayToMonFirst } from './types';

// -------- time-of-day helpers (minute math; no Date objects, no TZ pitfalls) --------

const HHMM_RE = /^(\d{2}):(\d{2})$/;

export const parseTime = (hhmm: string): number => {
  const m = HHMM_RE.exec(hhmm);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
};

export const formatTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const intersect = (a: [number, number], b: [number, number]): [number, number] | null => {
  const start = Math.max(a[0], b[0]);
  const end = Math.min(a[1], b[1]);
  return start < end ? [start, end] : null;
};

// -------- per-staff working window resolution --------

type WeeklyResolution =
  | { kind: 'absent' }                          // No doc for this dow — inherit upper layer
  | { kind: 'off' }                             // Doc says inactive — explicit day off
  | { kind: 'window'; window: TimeWindow };

const findWeekly = (
  availability: StaffAvailabilityDoc[] | undefined,
  dow: number,
): WeeklyResolution => {
  if (!availability) return { kind: 'absent' };
  for (const a of availability) {
    if (a.type !== 'weekly') continue;
    if (a.day_of_week !== dow) continue;
    if (!a.is_active) return { kind: 'off' };
    return { kind: 'window', window: { start_time: a.start_time, end_time: a.end_time } };
  }
  return { kind: 'absent' };
};

const findOverride = (
  availability: StaffAvailabilityDoc[] | undefined,
  date: string,
): { window: TimeWindow | null; explicitOff: boolean } => {
  if (!availability) return { window: null, explicitOff: false };
  for (const a of availability) {
    if (a.type !== 'override') continue;
    if (a.date !== date) continue;
    if (!a.is_active) return { window: null, explicitOff: true };
    if (a.start_time && a.end_time) {
      return { window: { start_time: a.start_time, end_time: a.end_time }, explicitOff: false };
    }
    return { window: null, explicitOff: true }; // active=true but no times = invalid; treat as off
  }
  return { window: null, explicitOff: false };
};

const businessHoursFor = (
  businessHours: BusinessHoursDay[],
  dow: number,
): TimeWindow | null => {
  const bh = businessHours.find(b => b.day_of_week === dow);
  if (!bh || !bh.is_open || !bh.open_time || !bh.close_time) return null;
  return { start_time: bh.open_time, end_time: bh.close_time };
};

const treatmentWindowFor = (
  windows: DayWindow[] | undefined,
  dow: number,
): TimeWindow | null | 'unrestricted' => {
  if (!windows || windows.length === 0) return 'unrestricted';
  const match = windows.find(w => w.day_of_week === dow);
  if (!match) return null;            // Treatment defines availability but not this day = closed
  if (!match.is_active) return null;
  return { start_time: match.start_time, end_time: match.end_time };
};

const tryWindow = (w: TimeWindow): [number, number] | null => {
  const s = parseTime(w.start_time);
  const e = parseTime(w.end_time);
  if (isNaN(s) || isNaN(e) || e <= s) return null;
  return [s, e];
};

/**
 * Returns the effective working window for a staff on a date, using a layered
 * cascade. Each layer **narrows** the previous one (intersection), never expands.
 *
 *   1. Business hours              = outer bound. If closed → no slots.
 *   2. Scheduling config (Legacy)  = narrows for that day + staff if a config matches.
 *   3. Staff weekly schedule       = narrows if a weekly doc exists. Missing day → inherit.
 *                                    Inactive weekly day → explicit off (no slots).
 *   4. Staff date override         = replaces the window for that exact date. Inactive → off.
 *   5. Treatment availability      = final narrow (Phase 2).
 *
 * Returns null when any layer closes the day or the intersections collapse.
 */
export const resolveWorkingWindow = (
  staff: StaffForScheduling,
  date: string,
  dow: number,
  businessHours: BusinessHoursDay[],
  schedulingConfigs: SchedulingConfigForScheduling[] | undefined,
  treatmentWindows: DayWindow[] | undefined,
): [number, number] | null => {
  // 1. Business hours — the outer bound
  const bh = businessHoursFor(businessHours, dow);
  if (!bh) return null;
  let window = tryWindow(bh);
  if (!window) return null;

  // 2. Legacy scheduling config narrows (if applicable)
  if (schedulingConfigs && schedulingConfigs.length > 0) {
    const applicable = schedulingConfigs.find(c => {
      if (!c.is_active) return false;
      if (c.day_of_week !== dow) return false;
      if (c.staff_ids && c.staff_ids.length > 0 && !c.staff_ids.includes(staff.id)) return false;
      return true;
    });
    if (applicable) {
      const cwin = tryWindow({ start_time: applicable.start_time, end_time: applicable.end_time });
      if (cwin) {
        const next = intersect(window, cwin);
        if (!next) return null;
        window = next;
      }
    }
  }

  // 3. Staff weekly schedule
  const weekly = findWeekly(staff.availability, dow);
  if (weekly.kind === 'off') return null;
  if (weekly.kind === 'window') {
    const swin = tryWindow(weekly.window);
    if (!swin) return null;
    const next = intersect(window, swin);
    if (!next) return null;
    window = next;
  }
  // weekly.kind === 'absent' → inherit upper layer; no narrowing.

  // 4. Staff date override — replaces window (or closes the day)
  const override = findOverride(staff.availability, date);
  if (override.explicitOff) return null;
  if (override.window) {
    const owin = tryWindow(override.window);
    if (!owin) return null;
    // Overrides REPLACE rather than narrow — they're for accommodations / extended hours.
    window = owin;
  }

  // 5. Treatment availability narrows
  const tWin = treatmentWindowFor(treatmentWindows, dow);
  if (tWin === null) return null;
  if (tWin !== 'unrestricted') {
    const twin = tryWindow(tWin);
    if (!twin) return null;
    const next = intersect(window, twin);
    if (!next) return null;
    window = next;
  }

  return window;
};

// -------- existing-appointment overlap check (buffer-aware) --------

const TERMINAL_STATUSES = new Set(['cancelled', 'no-show']);

const overlapsExisting = (
  staffId: string,
  date: string,
  effectiveStart: number,
  effectiveEnd: number,
  existingAppointments: ExistingAppointment[],
): boolean => {
  for (const appt of existingAppointments) {
    if (appt.staff_id !== staffId) continue;
    if (appt.appointment_date !== date) continue;
    if (TERMINAL_STATUSES.has(appt.status)) continue;

    const aStart = parseTime(appt.appointment_time);
    if (isNaN(aStart)) continue;
    const before = appt.buffer_before_minutes ?? 0;
    const after = appt.buffer_after_minutes ?? 0;
    const aEffStart = aStart - before;
    const aEffEnd = aStart + appt.duration + after;

    if (effectiveStart < aEffEnd && effectiveEnd > aEffStart) return true;
  }
  return false;
};

// -------- advance-window check --------

const isWithinAdvanceWindow = (
  date: string,
  startMin: number,
  treatment: GenerateSlotsInput['treatment'],
  nowIso: string,
): boolean => {
  const advanceMinH = treatment.advance_min_hours ?? 0;
  const advanceMaxD = treatment.advance_max_days ?? 365;

  // Build slot start as local clock time on the date string.
  // Caller is expected to interpret consistently with its tz; we treat the
  // YYYY-MM-DD as wall-clock and compute the gap against nowIso (also wall-clock).
  const slotMs = Date.parse(`${date}T${formatTime(startMin)}:00`);
  const nowMs = Date.parse(nowIso);
  if (isNaN(slotMs) || isNaN(nowMs)) return true; // Fail open rather than block all slots

  const diffH = (slotMs - nowMs) / (60 * 60 * 1000);
  if (diffH < advanceMinH) return false;
  if (diffH / 24 > advanceMaxD) return false;
  return true;
};

// -------- main entry point --------

const dowFromIsoDate = (date: string): number => {
  // Treat YYYY-MM-DD as local; getDay() returns Sun=0.
  const d = new Date(`${date}T00:00:00`);
  return jsDayToMonFirst(d.getDay());
};

const candidateStaff = (
  staffList: StaffForScheduling[],
  treatment: GenerateSlotsInput['treatment'],
): StaffForScheduling[] => {
  const allowedByTreatment = treatment.staff_ids && treatment.staff_ids.length > 0
    ? new Set(treatment.staff_ids)
    : null;
  return staffList.filter(s => {
    if (allowedByTreatment && !allowedByTreatment.has(s.id)) return false;
    if (s.treatment_ids && s.treatment_ids.length > 0 && !s.treatment_ids.includes(treatment.id)) {
      return false;
    }
    return true;
  });
};

const stepSizeForTreatment = (duration: number, intervalOverride?: number): number => {
  // If the org sets an explicit slot interval (e.g. 30 or 60 minutes), use it.
  // Otherwise fall back to a fine 15-min grid like Acuity, snapped to 5-min boundary.
  if (intervalOverride && intervalOverride > 0) {
    return Math.max(5, Math.round(intervalOverride / 5) * 5);
  }
  const raw = Math.min(duration, 15);
  return Math.max(5, Math.round(raw / 5) * 5);
};

export const generateSlots = (input: GenerateSlotsInput): TimeSlot[] => {
  const { date, treatment, staffList, existingAppointments, businessHours, schedulingConfigs, slotIntervalMinutes, nowIso } = input;

  const slots: TimeSlot[] = [];
  const dow = dowFromIsoDate(date);
  const step = stepSizeForTreatment(treatment.duration, slotIntervalMinutes);
  const bufBefore = treatment.buffer_before_minutes ?? 0;
  const bufAfter = treatment.buffer_after_minutes ?? 0;
  const candidates = candidateStaff(staffList, treatment);

  for (const staff of candidates) {
    const window = resolveWorkingWindow(staff, date, dow, businessHours, schedulingConfigs, treatment.availability);
    if (!window) continue;
    const [winStart, winEnd] = window;

    // Add staff's default buffer on top of treatment's per-appointment buffer
    const extraBuf = staff.default_buffer_minutes ?? 0;
    const totalAfter = bufAfter + extraBuf;

    for (let start = winStart; start + treatment.duration + totalAfter <= winEnd; start += step) {
      const effStart = start - bufBefore;
      const effEnd = start + treatment.duration + totalAfter;

      if (!isWithinAdvanceWindow(date, start, treatment, nowIso)) continue;
      if (overlapsExisting(staff.id, date, effStart, effEnd, existingAppointments)) continue;

      slots.push({ time: formatTime(start), staff_id: staff.id, staff_name: staff.name });
    }
  }

  // Sort by time then staff name for deterministic output
  slots.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.staff_name.localeCompare(b.staff_name)));
  return slots;
};

/**
 * Same input but merged: one entry per time, listing all available staff at that time.
 * Useful when the picker shows "first available."
 */
export const generateMergedSlots = (input: GenerateSlotsInput): MergedTimeSlot[] => {
  const raw = generateSlots(input);
  const byTime = new Map<string, string[]>();
  for (const s of raw) {
    const list = byTime.get(s.time) ?? [];
    list.push(s.staff_id);
    byTime.set(s.time, list);
  }
  return Array.from(byTime.entries())
    .map(([time, available_staff_ids]) => ({ time, available_staff_ids }))
    .sort((a, b) => (a.time < b.time ? -1 : 1));
};

/**
 * Light-weight conflict checker for the staff "Custom time" override path.
 * Returns the first conflicting appointment (if any) so the UI can show
 * "Overlaps Alice 14:00–15:00 — book anyway?".
 */
export interface CustomTimeConflict {
  staff_id: string;
  appointment_time: string;
  appointment_end: string;
  duration: number;
}

export const checkCustomTimeConflict = (params: {
  staffId: string;
  date: string;
  time: string;
  duration: number;
  existingAppointments: ExistingAppointment[];
}): CustomTimeConflict | null => {
  const { staffId, date, time, duration, existingAppointments } = params;
  const start = parseTime(time);
  if (isNaN(start)) return null;
  const end = start + duration;

  for (const appt of existingAppointments) {
    if (appt.staff_id !== staffId) continue;
    if (appt.appointment_date !== date) continue;
    if (TERMINAL_STATUSES.has(appt.status)) continue;
    const aStart = parseTime(appt.appointment_time);
    if (isNaN(aStart)) continue;
    const aEnd = aStart + appt.duration;
    if (start < aEnd && end > aStart) {
      return {
        staff_id: staffId,
        appointment_time: appt.appointment_time,
        appointment_end: formatTime(aEnd),
        duration: appt.duration,
      };
    }
  }
  return null;
};
