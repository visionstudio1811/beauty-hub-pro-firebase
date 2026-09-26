import React, { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, MapPin, Phone, Sparkles, Tag, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLongDay, formatPrice, formatSlotRange } from './bookingFormat';

export interface PublicTreatment {
  id: string;
  name: string;
  duration: number;
  price?: number;
  staff_ids?: string[];
  description?: string | null;
  image_url?: string | null;
  category?: string | null;
  color?: string | null;
}

// ---------- small shared pieces ----------

const Chip: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground/80">
    <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
    {children}
  </span>
);

export const TreatmentMeta: React.FC<{ treatment: PublicTreatment; currency: string; locale: string }> = ({
  treatment,
  currency,
  locale,
}) => {
  const { t } = useTranslation('portal');
  return (
    <div className="flex flex-wrap gap-2">
      <Chip icon={Clock}>{t('publicBooking.durationMin', { count: treatment.duration })}</Chip>
      {typeof treatment.price === 'number' && treatment.price > 0 && (
        <Chip icon={Tag}>
          <span className="ltr-inline">{formatPrice(treatment.price, currency, locale)}</span>
        </Chip>
      )}
    </div>
  );
};

/** Image, or a soft tinted band when the treatment has no photo. */
const TreatmentImage: React.FC<{ treatment: PublicTreatment; className?: string; placeholderClassName?: string }> = ({
  treatment,
  className,
  placeholderClassName,
}) => {
  const [failed, setFailed] = useState(false);
  if (treatment.image_url && !failed) {
    return (
      <img
        src={treatment.image_url}
        alt={treatment.name}
        onError={() => setFailed(true)}
        className={cn('w-full object-cover bg-muted', className)}
      />
    );
  }
  // Always the page theme (beige, or the brand tint). Treatment calendar
  // colors are a staff-side scheduling aid and don't belong on the client page.
  return (
    <div
      aria-hidden
      className={cn('w-full flex items-center justify-center', placeholderClassName)}
      style={{ background: 'linear-gradient(135deg, var(--bk-accent-muted), var(--bk-accent-soft))' }}
    >
      <Sparkles className="h-8 w-8 text-[color:var(--bk-accent-ink)] opacity-60" />
    </div>
  );
};

/** Description clamped to a few lines with a Read more toggle when it overflows. */
const ExpandableText: React.FC<{ text: string; lines?: number }> = ({ text, lines = 4 }) => {
  const { t } = useTranslation('portal');
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, expanded]);

  return (
    <div>
      <p
        ref={ref}
        className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line break-words"
        style={
          expanded
            ? undefined
            : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
        }
      >
        {text}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-sm font-medium text-[color:var(--bk-accent-ink)] hover:underline"
        >
          {expanded ? t('publicBooking.showLess') : t('publicBooking.readMore')}
        </button>
      )}
    </div>
  );
};

export const BusinessContact: React.FC<{ address: string | null; phone: string | null; className?: string }> = ({
  address,
  phone,
  className,
}) => {
  if (!address && !phone) return null;
  return (
    <div className={cn('space-y-2 text-sm', className)}>
      {address && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>{address}</span>
        </a>
      )}
      {phone && (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, '')}`}
          className="flex items-center gap-2.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <span className="ltr-inline">{phone}</span>
        </a>
      )}
    </div>
  );
};

// ---------- left column: the chosen treatment ----------

interface TreatmentShowcaseProps {
  treatment: PublicTreatment;
  currency: string;
  locale: string;
  selectedDate: string | null;
  selectedTime: string | null;
  staffName: string | null;
  address: string | null;
  phone: string | null;
  /** Present when the link offers several treatments. */
  onChangeTreatment?: () => void;
}

export const TreatmentShowcase: React.FC<TreatmentShowcaseProps> = ({
  treatment,
  currency,
  locale,
  selectedDate,
  selectedTime,
  staffName,
  address,
  phone,
  onChangeTreatment,
}) => {
  const { t } = useTranslation('portal');
  const hasImage = Boolean(treatment.image_url);

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <TreatmentImage
        treatment={treatment}
        className="aspect-[16/9] lg:aspect-[4/3]"
        placeholderClassName="h-24 lg:h-28"
      />
      <div className="p-5 sm:p-6 space-y-5">
        <div className="space-y-3">
          <div>
            {treatment.category && (
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                {treatment.category}
              </p>
            )}
            <h2 className="font-display text-3xl font-semibold leading-tight break-words">{treatment.name}</h2>
          </div>
          <TreatmentMeta treatment={treatment} currency={currency} locale={locale} />
          {onChangeTreatment && (
            <button
              type="button"
              onClick={onChangeTreatment}
              className="text-sm font-medium text-[color:var(--bk-accent-ink)] hover:underline"
            >
              {t('publicBooking.changeTreatment')}
            </button>
          )}
        </div>

        {treatment.description && <ExpandableText text={treatment.description} lines={hasImage ? 4 : 6} />}

        {/* Live summary: desktop only (on mobile the booking card right below shows it). */}
        <div className="hidden lg:block border-t pt-5 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('publicBooking.yourAppointment')}
          </p>
          <div className="flex items-center gap-2.5 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            {selectedDate ? (
              <span className="font-medium">{formatLongDay(selectedDate, locale)}</span>
            ) : (
              <span className="text-muted-foreground">{t('publicBooking.chooseDate')}</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            {selectedTime ? (
              <span className="font-medium ltr-inline">{formatSlotRange(selectedTime, treatment.duration, locale)}</span>
            ) : (
              <span className="text-muted-foreground">{t('publicBooking.chooseTime')}</span>
            )}
          </div>
          {staffName && (
            <div className="flex items-center gap-2.5 text-sm">
              <UserRound className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
              <span>{t('publicBooking.withStaff', { name: staffName })}</span>
            </div>
          )}
        </div>

        {(address || phone) && (
          <BusinessContact address={address} phone={phone} className="hidden lg:block border-t pt-5" />
        )}
      </div>
    </div>
  );
};

// ---------- treatment menu (links that offer several treatments) ----------

interface TreatmentMenuProps {
  treatments: PublicTreatment[];
  currency: string;
  locale: string;
  onSelect: (id: string) => void;
  stepLabel: string | null;
}

export const TreatmentMenu: React.FC<TreatmentMenuProps> = ({ treatments, currency, locale, onSelect, stepLabel }) => {
  const { t } = useTranslation('portal');
  // Placeholders only make sense when some treatments have photos; otherwise
  // a grid of identical tinted blocks is just noise.
  const anyImages = treatments.some((item) => item.image_url);

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-semibold leading-tight">{t('publicBooking.chooseTreatment')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('publicBooking.chooseTreatmentText')}</p>
        </div>
        {stepLabel && <span className="text-xs font-medium text-muted-foreground whitespace-nowrap pb-1">{stepLabel}</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {treatments.map((treatment) => (
          <button
            key={treatment.id}
            type="button"
            onClick={() => onSelect(treatment.id)}
            className="group flex flex-col rounded-2xl border bg-card text-start shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-[color:var(--bk-accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bk-accent)] focus-visible:ring-offset-2"
          >
            {anyImages && (
              <div className="overflow-hidden">
                <TreatmentImage
                  treatment={treatment}
                  className="aspect-[16/10] transition-transform duration-300 group-hover:scale-[1.03]"
                  placeholderClassName="aspect-[16/10]"
                />
              </div>
            )}
            <div className="p-4 sm:p-5 flex flex-col gap-3 flex-1">
              <div>
                {treatment.category && (
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">
                    {treatment.category}
                  </p>
                )}
                <p className="font-display text-xl font-semibold leading-snug break-words">{treatment.name}</p>
              </div>
              {treatment.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 break-words">{treatment.description}</p>
              )}
              <div className="mt-auto">
                <TreatmentMeta treatment={treatment} currency={currency} locale={locale} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
