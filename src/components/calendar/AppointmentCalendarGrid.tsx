import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, View, SlotInfo } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  const [visibleStaffIds, setVisibleStaffIds] = useState<Set<string>>(new Set());

  const treatmentColorById = useMemo(() => {
    const m = new Map<string, string>();
    treatments.forEach((t) => {
      if (t.id && t.color) m.set(t.id, t.color);
    });
    return m;
  }, [treatments]);

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff]);

  // Initialize / re-sync the visible-staff selection whenever the active staff
  // list changes (org switch, new hire activated, etc). If the current
  // selection still makes sense, keep it; otherwise default to "all visible".
  useEffect(() => {
    const allActiveIds = activeStaff.map((s) => s.id);
    setVisibleStaffIds((prev) => {
      if (prev.size === 0) return new Set(allActiveIds);
      // Drop any stale IDs that are no longer active; if we'd be left with
      // nothing, fall back to all visible.
      const filtered = new Set(Array.from(prev).filter((id) => allActiveIds.includes(id)));
      return filtered.size === 0 ? new Set(allActiveIds) : filtered;
    });
  }, [activeStaff]);

  const allStaffSelected = visibleStaffIds.size === activeStaff.length && activeStaff.length > 0;

  const toggleStaffVisible = useCallback((id: string) => {
    setVisibleStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllStaff = useCallback(
    () => setVisibleStaffIds(new Set(activeStaff.map((s) => s.id))),
    [activeStaff],
  );
  const clearStaff = useCallback(() => setVisibleStaffIds(new Set()), []);

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

  // Apply the staff filter to both the events and the resource columns so a
  // hidden staff member disappears from the grid entirely (no empty column,
  // no orphan events on the right side).
  const visibleEvents = useMemo(() => {
    if (allStaffSelected) return events;
    return events.filter((e) => !e.resourceId || visibleStaffIds.has(e.resourceId));
  }, [events, visibleStaffIds, allStaffSelected]);

  const resources = useMemo(
    () =>
      useResources
        ? activeStaff
            .filter((s) => visibleStaffIds.has(s.id))
            .map((s) => ({ resourceId: s.id, resourceTitle: s.name }))
        : undefined,
    [activeStaff, useResources, visibleStaffIds],
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

  // Tiny inline marker for Acuity-synced events. Visible at any zoom level.
  const EventBlock = useCallback(({ event, title }: { event: CalendarEvent; title: string }) => {
    const synced = !!event.source.acuity_appointment_id;
    const syncStatus = event.source.sync_status;
    const failed = syncStatus === 'failed';
    return (
      <div className="flex items-center gap-1 min-w-0">
        {synced && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-300 shrink-0"
            title="Synced to Acuity"
          />
        )}
        {failed && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 shrink-0"
            title="Acuity sync failed"
          />
        )}
        <span className="truncate">{title}</span>
      </div>
    );
  }, []);

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

  const showStaffFilter = activeStaff.length > 1;

  return (
    <div className="rbc-shadcn-wrap flex flex-col" style={{ height }}>
      {showStaffFilter && (
        <div className="flex items-center justify-end pb-2 gap-2 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Users className="h-3.5 w-3.5 mr-2" />
                Staff
                <Badge variant="secondary" className="ml-2 px-1.5 text-xs font-normal">
                  {visibleStaffIds.size}/{activeStaff.length}
                </Badge>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">Show staff</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={selectAllStaff}
                    disabled={allStaffSelected}
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={clearStaff}
                    disabled={visibleStaffIds.size === 0}
                  >
                    None
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {activeStaff.map((s) => {
                  const checked = visibleStaffIds.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 cursor-pointer rounded px-1.5 py-1 hover:bg-accent transition-colors"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleStaffVisible(s.id)} />
                      <span className="text-sm truncate">{s.name}</span>
                    </label>
                  );
                })}
              </div>
              {visibleStaffIds.size === 0 && (
                <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                  Nothing selected — calendar is empty. Click All to restore.
                </p>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <Calendar
          localizer={localizer}
          events={visibleEvents}
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
        components={{ event: EventBlock }}
          popup
          showMultiDayTimes
          dayLayoutAlgorithm="no-overlap"
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
};

export default AppointmentCalendarGrid;
