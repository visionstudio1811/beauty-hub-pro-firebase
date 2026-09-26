import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMonthYear, isoDay, parseIsoDay } from './bookingFormat';

// getDay() order (Sun-first), keys into common:days.*
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

interface BookingMonthCalendarProps {
  /** First day of the month on screen. */
  month: Date;
  onMonthChange: (month: Date) => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  selectedDate: string | null;
  onSelect: (isoDate: string) => void;
  /** True when the day has at least one bookable slot. */
  isAvailable: (isoDate: string) => boolean;
  loading: boolean;
  locale: string;
}

/**
 * Month grid for the public booking page. Bookable days sit on a soft accent
 * tint; everything else is disabled. Accent colors come from the --bk-accent*
 * variables set on the page root (see bookingThemeStyle).
 */
export const BookingMonthCalendar: React.FC<BookingMonthCalendarProps> = ({
  month,
  onMonthChange,
  canGoPrev,
  canGoNext,
  selectedDate,
  onSelect,
  isAvailable,
  loading,
  locale,
}) => {
  const { t } = useTranslation('portal');
  const todayIso = isoDay(new Date());

  const cells = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const leading = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const out: (string | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= daysInMonth; day++) out.push(isoDay(new Date(year, m, day, 12)));
    return out;
  }, [month]);

  const fullDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(
        parseIsoDay(iso),
      );
    } catch {
      return iso;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold text-base truncate">{formatMonthYear(month, locale)}</p>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" aria-hidden />}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}
            disabled={!canGoPrev}
            aria-label={t('publicBooking.prevMonth')}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-[color:var(--bk-accent-ink)] hover:bg-[color:var(--bk-accent-soft)] disabled:text-muted-foreground/40 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}
            disabled={!canGoNext}
            aria-label={t('publicBooking.nextMonth')}
            className="h-9 w-9 inline-flex items-center justify-center rounded-full text-[color:var(--bk-accent-ink)] hover:bg-[color:var(--bk-accent-soft)] disabled:text-muted-foreground/40 disabled:hover:bg-transparent transition-colors"
          >
            <ChevronRight className="h-5 w-5 rtl:rotate-180" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1" aria-hidden>
        {WEEKDAY_KEYS.map((key) => (
          <div key={key} className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground py-1">
            {t(`common:days.${key}`)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1.5" role="group" aria-label={formatMonthYear(month, locale)}>
        {cells.map((iso, idx) => {
          if (!iso) return <div key={`blank-${idx}`} />;
          const available = !loading && isAvailable(iso);
          const selected = iso === selectedDate;
          const isToday = iso === todayIso;
          return (
            <div key={iso} className="flex justify-center">
              <button
                type="button"
                disabled={!available}
                onClick={() => onSelect(iso)}
                aria-pressed={selected}
                aria-label={`${fullDate(iso)}${available ? '' : ` (${t('publicBooking.unavailable')})`}`}
                className={cn(
                  'relative h-10 w-10 sm:h-11 sm:w-11 rounded-full text-sm tabular-nums transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bk-accent)] focus-visible:ring-offset-2',
                  selected
                    ? 'bg-[color:var(--bk-accent)] text-[color:var(--bk-accent-fg)] font-semibold shadow-sm'
                    : available
                      ? 'bg-[color:var(--bk-accent-soft)] text-[color:var(--bk-accent-ink)] font-semibold hover:bg-[color:var(--bk-accent-muted)]'
                      : 'text-muted-foreground/45 cursor-default',
                )}
              >
                {parseIsoDay(iso).getDate()}
                {isToday && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full',
                      selected ? 'bg-[color:var(--bk-accent-fg)]' : 'bg-current',
                    )}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
