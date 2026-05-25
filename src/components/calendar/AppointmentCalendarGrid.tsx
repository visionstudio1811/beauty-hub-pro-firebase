import React, { useMemo, useState, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, View, SlotInfo } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
import type { SupabaseAppointment } from '@/hooks/useSupabaseAppointments';
import type { Treatment } from '@/hooks/useSupabaseTreatments';
import type { Staff } from '@/hooks/useSupabaseStaff';

import 'react-big-calendar/lib/css/react-big-calendar.css';
import '@/styles/calendar.css';

const locales = { 'en-US': enUS };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Hex fallbacks mirroring the tailwind classes in src/hooks/useAppointmentStatus.tsx
const STATUS_HEX: Record<string, string> = {
  scheduled: '#6E83FB',
  confirmed: '#10B981',
  'in-progress': '#F59E0B',
  completed: '#3B82F6',
  'no-show': '#F97316',
  cancelled: '#94A3B8',
};

function contrastText(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#1f2937';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#1f2937' : '#ffffff';
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId?: string;
  color: string;
  source: SupabaseAppointment;
}

interface Props {
  appointments: SupabaseAppointment[];
  staff: Staff[];
  treatments: Treatment[];
  defaultView?: View;
  defaultDate?: Date;
  showResources?: boolean;
  /** Pixel height for the calendar container (CSS height). */
  height?: number;
  onSelectEvent?: (appt: SupabaseAppointment) => void;
  onSlotSelect?: (start: Date, staffId?: string) => void;
}

function buildEventDate(dateStr: string, timeStr: string): Date {
  // appointment_date is YYYY-MM-DD, appointment_time is HH:MM or HH:MM:SS
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

export const AppointmentCalendarGrid: React.FC<Props> = ({
  appointments,
  staff,
  treatments,
  defaultView = 'week',
  defaultDate,
  showResources = true,
  height = 700,
  onSelectEvent,
  onSlotSelect,
}) => {
  const [view, setView] = useState<View>(defaultView);
  const [date, setDate] = useState<Date>(defaultDate ?? new Date());

  const treatmentColorById = useMemo(() => {
    const m = new Map<string, string>();
    treatments.forEach((t) => {
      if (t.id && t.color) m.set(t.id, t.color);
    });
    return m;
  }, [treatments]);

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff]);

  const events: CalendarEvent[] = useMemo(() => {
    return appointments
      .filter((a) => a.appointment_date && a.appointment_time)
      .map((a) => {
        const start = buildEventDate(a.appointment_date, a.appointment_time);
        const end = new Date(start.getTime() + (a.duration || 60) * 60 * 1000);
        const color =
          (a.treatment_id && treatmentColorById.get(a.treatment_id)) ||
          STATUS_HEX[a.status] ||
          STATUS_HEX.scheduled;
        return {
          id: a.id,
          title: `${a.client_name} — ${a.treatment_name}`,
          start,
          end,
          resourceId: a.staff_id || undefined,
          color,
          source: a,
        };
      });
  }, [appointments, treatmentColorById]);

  // Resource columns: only meaningful on day/week with multiple active staff.
  const useResources = showResources && activeStaff.length > 1 && (view === 'day' || view === 'week');
  const resources = useMemo(
    () => (useResources ? activeStaff.map((s) => ({ resourceId: s.id, resourceTitle: s.name })) : undefined),
    [activeStaff, useResources],
  );

  const eventPropGetter = useCallback((event: CalendarEvent) => {
    const bg = event.color;
    const fg = contrastText(bg);
    return {
      style: {
        backgroundColor: bg,
        color: fg,
        border: '0',
        borderLeft: `3px solid ${bg}`,
        borderRadius: '4px',
        opacity: event.source.status === 'cancelled' ? 0.55 : 1,
        textDecoration: event.source.status === 'cancelled' ? 'line-through' : 'none',
      },
    };
  }, []);

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      onSelectEvent?.(event.source);
    },
    [onSelectEvent],
  );

  const handleSelectSlot = useCallback(
    (slot: SlotInfo) => {
      const resourceId = typeof (slot as any).resourceId === 'string' ? (slot as any).resourceId : undefined;
      onSlotSelect?.(slot.start, resourceId);
    },
    [onSlotSelect],
  );

  // Bound time grid to a reasonable salon day. Falls back if business hours
  // context isn't populated. Using fixed bounds keeps the grid scannable.
  const dayMin = useMemo(() => {
    const d = new Date(date);
    d.setHours(7, 0, 0, 0);
    return d;
  }, [date]);
  const dayMax = useMemo(() => {
    const d = new Date(date);
    d.setHours(21, 0, 0, 0);
    return d;
  }, [date]);

  return (
    <div className="rbc-shadcn-wrap" style={{ height }}>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        titleAccessor="title"
        resourceIdAccessor="resourceId"
        resourceTitleAccessor="resourceTitle"
        resources={resources}
        views={['day', 'week', 'month']}
        view={view}
        date={date}
        onView={setView}
        onNavigate={setDate}
        step={15}
        timeslots={2}
        min={dayMin}
        max={dayMax}
        selectable
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent}
        eventPropGetter={eventPropGetter}
        popup
        showMultiDayTimes
        dayLayoutAlgorithm="no-overlap"
        style={{ height: '100%' }}
      />
    </div>
  );
};

export default AppointmentCalendarGrid;
