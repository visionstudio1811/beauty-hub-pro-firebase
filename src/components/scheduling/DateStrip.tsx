import React from 'react';
import { Loader2 } from 'lucide-react';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isoDay = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

interface DateStripProps {
  dates: Date[];                              // The N-day window (typically 14 days starting today)
  selectedDate: string | null;                // YYYY-MM-DD or null
  onSelect: (isoDate: string) => void;
  /** Returns true if the day has at least one available slot. */
  isDayEnabled: (isoDate: string) => boolean;
  loading?: boolean;                          // Show a "Loading times…" hint
}

export const DateStrip: React.FC<DateStripProps> = ({
  dates, selectedDate, onSelect, isDayEnabled, loading,
}) => (
  <>
    <div className="flex gap-2 overflow-x-auto pb-2 mt-1 -mx-1 px-1">
      {dates.map((d) => {
        const iso = isoDay(d);
        const enabled = !loading && isDayEnabled(iso);
        const isSelected = selectedDate === iso;
        return (
          <button
            key={iso}
            type="button"
            disabled={!enabled}
            onClick={() => onSelect(iso)}
            className={
              'shrink-0 w-16 rounded-md border p-2 text-center transition-colors ' +
              (isSelected
                ? 'border-purple-600 bg-purple-50 text-purple-700'
                : enabled
                ? 'border-input hover:bg-accent'
                : 'border-input opacity-40 cursor-not-allowed')
            }
          >
            <div className="text-[10px] uppercase text-muted-foreground">
              {DAY_SHORT[d.getDay()]}
            </div>
            <div className="text-base font-semibold">{d.getDate()}</div>
            <div className="text-[10px] text-muted-foreground">
              {d.toLocaleString(undefined, { month: 'short' })}
            </div>
          </button>
        );
      })}
    </div>
    {loading && (
      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading times…
      </p>
    )}
  </>
);

/** Build the N-day window starting today (00:00 local) — re-exported for callers. */
export const buildDateWindow = (lengthDays = 14): Date[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: lengthDays }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
};

export { isoDay };
