import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { MergedTimeSlot } from '@/components/scheduling/TimeGrid';
import { formatSlotTime } from './bookingFormat';

type DayPart = 'morning' | 'afternoon' | 'evening';

const dayPartOf = (hhmm: string): DayPart => {
  const h = parseInt(hhmm.slice(0, 2), 10);
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
};

interface BookingTimeSlotsProps {
  slots: MergedTimeSlot[];
  selectedTime: string | null;
  onSelect: (time: string) => void;
  locale: string;
}

/** Time buttons for one day, grouped into morning / afternoon / evening. */
export const BookingTimeSlots: React.FC<BookingTimeSlotsProps> = ({ slots, selectedTime, onSelect, locale }) => {
  const { t } = useTranslation('scheduling');

  const groups = useMemo(() => {
    const byPart: Record<DayPart, MergedTimeSlot[]> = { morning: [], afternoon: [], evening: [] };
    for (const slot of slots) byPart[dayPartOf(slot.time)].push(slot);
    return (['morning', 'afternoon', 'evening'] as const)
      .map((part) => ({ part, items: byPart[part] }))
      .filter((g) => g.items.length > 0);
  }, [slots]);

  return (
    <div className="space-y-4">
      {groups.map(({ part, items }) => (
        <div key={part}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
            {t(`timeGrid.${part}`)}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2 gap-2">
            {items.map((slot) => {
              const selected = slot.time === selectedTime;
              return (
                <button
                  key={slot.time}
                  type="button"
                  onClick={() => onSelect(slot.time)}
                  aria-pressed={selected}
                  dir="ltr"
                  className={cn(
                    'h-11 rounded-lg border text-sm font-medium tabular-nums transition-colors whitespace-nowrap px-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bk-accent)] focus-visible:ring-offset-2',
                    selected
                      ? 'border-[color:var(--bk-accent)] bg-[color:var(--bk-accent)] text-[color:var(--bk-accent-fg)] shadow-sm'
                      : 'border-[color:var(--bk-accent-muted)] bg-background text-[color:var(--bk-accent-ink)] hover:border-[color:var(--bk-accent)] hover:bg-[color:var(--bk-accent-soft)]',
                  )}
                >
                  {formatSlotTime(slot.time, locale)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
