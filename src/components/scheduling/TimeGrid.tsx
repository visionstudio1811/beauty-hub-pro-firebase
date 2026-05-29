import React, { useMemo } from 'react';

export interface MergedTimeSlot {
  time: string;                     // "HH:MM"
  available_staff_ids: string[];
}

interface TimeGridProps {
  slots: MergedTimeSlot[];
  selectedTime: string | null;
  onSelect: (time: string) => void;
  emptyText?: string;
}

const groupByTimeOfDay = (slots: MergedTimeSlot[]) => {
  const groups: { label: string; items: MergedTimeSlot[] }[] = [
    { label: 'Morning', items: [] },
    { label: 'Afternoon', items: [] },
    { label: 'Evening', items: [] },
  ];
  for (const s of slots) {
    const h = parseInt(s.time.slice(0, 2), 10);
    if (h < 12) groups[0].items.push(s);
    else if (h < 17) groups[1].items.push(s);
    else groups[2].items.push(s);
  }
  return groups.filter((g) => g.items.length > 0);
};

export const TimeGrid: React.FC<TimeGridProps> = ({ slots, selectedTime, onSelect, emptyText }) => {
  const groups = useMemo(() => groupByTimeOfDay(slots), [slots]);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground mt-2">
        {emptyText ?? 'No times available on this day. Pick another date.'}
      </p>
    );
  }

  return (
    <div className="space-y-3 mt-1">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-xs text-muted-foreground mb-1">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.items.map((s) => (
              <button
                key={s.time}
                type="button"
                onClick={() => onSelect(s.time)}
                className={
                  'rounded-md border px-3 py-1.5 text-sm transition-colors ' +
                  (selectedTime === s.time
                    ? 'border-purple-600 bg-purple-50 text-purple-700'
                    : 'border-input hover:bg-accent')
                }
              >
                {s.time}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
