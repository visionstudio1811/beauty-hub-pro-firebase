import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAppLanguage, type AppLanguage } from '@/i18n';
import { LANGUAGE_STORAGE_KEY, useLanguage } from '@/i18n/LanguageProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Clock, Globe, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { MergedTimeSlot } from '@/components/scheduling/TimeGrid';
import { BookingMonthCalendar } from '@/components/public-booking/BookingMonthCalendar';
import { BookingTimeSlots } from '@/components/public-booking/BookingTimeSlots';
import {
  BusinessContact,
  TreatmentMenu,
  TreatmentShowcase,
  type PublicTreatment,
} from '@/components/public-booking/TreatmentShowcase';
import {
  addMonths,
  bookingThemeStyle,
  formatLongDay,
  formatMonthYear,
  formatShortDay,
  formatSlotRange,
  formatSlotTime,
  isoDay,
  monthKey,
  monthsBetween,
  startOfMonth,
  timeZoneLabel,
} from '@/components/public-booking/bookingFormat';

// ----- types matching the resolveSchedulerLink CF response -----

interface PublicStaff {
  id: string;
  name: string;
}

interface ResolveResponse {
  organization: {
    id: string;
    name: string;
    logo_url: string | null;
    timezone: string;
    language?: string | null;
    accent?: string | null;
  };
  business_info: {
    name: string | null;
    address: string | null;
    phone: string | null;
    currency?: string | null;
    slot_interval_minutes: number | null;
    language?: string | null;
  };
  scoped_treatment_id: string | null;
  scoped_staff_id: string | null;
  treatments: PublicTreatment[];
  staff: PublicStaff[];
}

interface GetAvailableSlotsResponse {
  slotsByDate: Record<string, MergedTimeSlot[]>;
}

// Slots loaded so far for one treatment/staff combination, one month per call.
interface SlotState {
  key: string;
  byDate: Record<string, MergedTimeSlot[]>;
  loaded: Record<string, true>;
  loading: Record<string, true>;
  failed: Record<string, true>;
}

const emptySlotState = (key: string): SlotState => ({ key, byDate: {}, loaded: {}, loading: {}, failed: {} });

const without = (record: Record<string, true>, k: string) => {
  const next = { ...record };
  delete next[k];
  return next;
};

// How far ahead the calendar lets a visitor browse (months after the current one).
const MAX_MONTHS_AHEAD = 5;
// If the current month has no openings, jump ahead at most this many months
// to find the first bookable day before giving up.
const AUTO_ADVANCE_MONTHS = 2;

type Step = 'treatment' | 'time' | 'details';

// ----- page -----

const PublicBookingPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { t } = useTranslation('portal');
  const { language, setLanguage, locale } = useLanguage();
  // Explicit `?lang=` on the link wins over the org default (a salon can send a
  // Hebrew-speaking client an English-org link with ?lang=he, and vice versa).
  const rawLangParam = searchParams.get('lang');
  const langParam: AppLanguage | null = isAppLanguage(rawLangParam) ? rawLangParam : null;
  // Latest active language for the initial resolve call without re-running
  // that effect (and re-fetching the whole booking context) on every switch.
  const languageRef = useRef(language);
  languageRef.current = language;

  const [loadingContext, setLoadingContext] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<ResolveResponse | null>(null);
  // Language the current `ctx` was resolved with. The CF fills in fallback
  // display names ('Treatment' / 'Staff') in that language, so when the page
  // later switches (org default, ?lang=, or the switcher) we silently re-resolve
  // so those names match the UI. Null until the first resolve completes.
  const [ctxLanguage, setCtxLanguage] = useState<AppLanguage | null>(null);

  // The device-level language ('bh:language') as it was when this page opened.
  // LanguageProvider.setLanguage writes localStorage even with persist:false,
  // so following the org language here would otherwise overwrite the value
  // /auth and other pre-login screens use on this device. We snapshot it once
  // and put it back after every language change made on this page.
  const [storedLanguageAtMount] = useState<{ readable: boolean; value: string | null }>(() => {
    try {
      return { readable: true, value: localStorage.getItem(LANGUAGE_STORAGE_KEY) };
    } catch {
      return { readable: false, value: null };
    }
  });
  useEffect(() => {
    if (!storedLanguageAtMount.readable) return;
    try {
      if (storedLanguageAtMount.value === null) {
        localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      } else {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, storedLanguageAtMount.value);
      }
    } catch {
      /* private mode / blocked storage — nothing to restore */
    }
  }, [language, storedLanguageAtMount]);

  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');     // YYYY-MM-DD
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  // 'treatment' only applies while no treatment is chosen (see activeStep).
  const [step, setStep] = useState<Step>('time');

  // Month on screen in the calendar. Visitors can browse from the current
  // month up to MAX_MONTHS_AHEAD months out.
  const currentMonth = useMemo(() => startOfMonth(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState<Date>(currentMonth);
  const [slotState, setSlotState] = useState<SlotState>(() => emptySlotState(''));
  // Set when the auto-advance below found nothing within AUTO_ADVANCE_MONTHS.
  const [nothingSoon, setNothingSoon] = useState(false);

  const [client, setClient] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const stepCardRef = useRef<HTMLDivElement>(null);

  // Initial resolve. Sent in the language the page will most likely settle on:
  // an explicit ?lang= if present, else the visitor's current UI language (so a
  // resolve error renders in the language they are currently seeing).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingContext(true);
    setResolveError(null);
    const resolveLang: AppLanguage = langParam ?? languageRef.current;
    const fn = httpsCallable<{ token: string; lang: string }, ResolveResponse>(functions, 'resolveSchedulerLink');
    fn({ token, lang: resolveLang })
      .then(res => {
        if (cancelled) return;
        setCtx(res.data);
        setCtxLanguage(resolveLang);
        // Pre-fill treatment if the link is scoped
        if (res.data.scoped_treatment_id) {
          setSelectedTreatmentId(res.data.scoped_treatment_id);
        } else if (res.data.treatments.length === 1) {
          setSelectedTreatmentId(res.data.treatments[0].id);
        }
        // Pre-fill staff if scoped
        if (res.data.scoped_staff_id) {
          setSelectedStaffId(res.data.scoped_staff_id);
        }
      })
      .catch(err => {
        const msg =
          (err && typeof err === 'object' && 'message' in err && String((err as { message: unknown }).message)) ||
          '';
        // '' => render-time translated fallback (see publicBooking.linkLoadError)
        setResolveError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
    // langParam is read once at mount for the initial call; a later ?lang= change
    // is handled by the language effect + silent re-resolve below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Client-facing page: ?lang= wins, then the org default once resolved. Not
  // persisted to users/{uid}; the device-level value is restored above.
  const orgLanguage = ctx?.organization.language ?? ctx?.business_info.language ?? null;
  useEffect(() => {
    const candidate: AppLanguage | null =
      langParam ?? (!loadingContext && isAppLanguage(orgLanguage) ? orgLanguage : null);
    if (candidate && candidate !== languageRef.current) void setLanguage(candidate, { persist: false });
  }, [loadingContext, orgLanguage, langParam, setLanguage]);

  // Silent re-resolve when the active language no longer matches the one `ctx`
  // was fetched with, so CF-supplied fallback names render in the UI language.
  // Keeps loading state and the visitor's selections untouched; only `ctx` is
  // replaced. No-op in the common case (same language, or ?lang= matched).
  useEffect(() => {
    if (!token || !ctx || ctxLanguage === null || ctxLanguage === language) return;
    let cancelled = false;
    const refreshLang = language;
    const fn = httpsCallable<{ token: string; lang: string }, ResolveResponse>(functions, 'resolveSchedulerLink');
    fn({ token, lang: refreshLang })
      .then(res => {
        if (cancelled) return;
        setCtx(res.data);
        setCtxLanguage(refreshLang);
      })
      .catch(err => {
        // Keep the existing context; worst case a fallback label stays in the
        // previous language.
        console.warn('Failed to refresh booking context for language', refreshLang, err);
      });
    return () => {
      cancelled = true;
    };
  }, [token, ctx, ctxLanguage, language]);

  // Slots are cached per treatment/staff combination and loaded one calendar
  // month per call (getAvailableSlots accepts up to 42 days). Depends on
  // whether a context exists, not on its identity, so the language re-resolve
  // above doesn't refetch.
  const hasCtx = ctx !== null;
  const slotKey = selectedTreatmentId ? `${selectedTreatmentId}|${selectedStaffId}` : '';
  const slots = slotState.key === slotKey ? slotState : emptySlotState(slotKey);
  const visibleMonthKey = monthKey(visibleMonth);
  const monthStatus: 'idle' | 'loading' | 'loaded' | 'failed' = slots.loaded[visibleMonthKey]
    ? 'loaded'
    : slots.loading[visibleMonthKey]
      ? 'loading'
      : slots.failed[visibleMonthKey]
        ? 'failed'
        : 'idle';
  // Guards against a second identical request (e.g. StrictMode's double effect).
  const inflightRef = useRef(new Set<string>());

  useEffect(() => {
    if (!token || !slotKey || !hasCtx || monthStatus !== 'idle') return;
    const key = slotKey;
    const mk = visibleMonthKey;
    const requestId = `${key}:${mk}`;
    if (inflightRef.current.has(requestId)) return;
    inflightRef.current.add(requestId);

    const today = isoDay(new Date());
    const monthStart = isoDay(visibleMonth);
    const from = monthStart > today ? monthStart : today;
    const to = isoDay(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0, 12));
    setSlotState(prev => {
      const base = prev.key === key ? prev : emptySlotState(key);
      return { ...base, loading: { ...base.loading, [mk]: true }, failed: without(base.failed, mk) };
    });

    const fn = httpsCallable<
      {
        linkToken: string;
        treatmentId: string;
        staffId?: string;
        fromDate: string;
        toDate: string;
        merge: boolean;
        lang: string;
      },
      GetAvailableSlotsResponse
    >(functions, 'getAvailableSlots');
    fn({
      linkToken: token,
      treatmentId: selectedTreatmentId,
      staffId: selectedStaffId || undefined,
      fromDate: from,
      toDate: to,
      merge: true,
      lang: languageRef.current,
    })
      .then(res => {
        setSlotState(prev =>
          prev.key !== key
            ? prev
            : {
                ...prev,
                byDate: { ...prev.byDate, ...(res.data.slotsByDate ?? {}) },
                loaded: { ...prev.loaded, [mk]: true },
                loading: without(prev.loading, mk),
              },
        );
      })
      .catch(err => {
        console.error('Failed to load slots', err);
        setSlotState(prev =>
          prev.key !== key
            ? prev
            : { ...prev, loading: without(prev.loading, mk), failed: { ...prev.failed, [mk]: true } },
        );
      })
      .finally(() => {
        inflightRef.current.delete(requestId);
      });
  }, [token, slotKey, hasCtx, monthStatus, visibleMonthKey, visibleMonth, selectedTreatmentId, selectedStaffId]);

  const isDayAvailable = (iso: string) => (slots.byDate[iso]?.length ?? 0) > 0;
  const firstAvailableInVisibleMonth =
    Object.keys(slots.byDate)
      .filter(iso => iso.startsWith(`${visibleMonthKey}-`) && slots.byDate[iso].length > 0)
      .sort()[0] ?? null;

  // Once per treatment: open on the first bookable day so times show right
  // away, jumping ahead up to AUTO_ADVANCE_MONTHS when this month is full.
  // A manual month change or date pick ends it.
  const autoPickDoneRef = useRef('');
  useEffect(() => {
    if (!slotKey || autoPickDoneRef.current === slotKey || monthStatus !== 'loaded') return;
    if (firstAvailableInVisibleMonth) {
      autoPickDoneRef.current = slotKey;
      setSelectedDate(firstAvailableInVisibleMonth);
      return;
    }
    if (monthsBetween(currentMonth, visibleMonth) < AUTO_ADVANCE_MONTHS) {
      setVisibleMonth(addMonths(visibleMonth, 1));
      return;
    }
    autoPickDoneRef.current = slotKey;
    setNothingSoon(true);
    setVisibleMonth(currentMonth);
  }, [slotKey, monthStatus, firstAvailableInVisibleMonth, visibleMonth, currentMonth]);

  const scrollStepIntoView = () => {
    requestAnimationFrame(() => {
      const el = stepCardRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const chooseTreatment = (id: string) => {
    autoPickDoneRef.current = '';
    setNothingSoon(false);
    setSelectedTreatmentId(id);
    setSelectedDate('');
    setSelectedTime('');
    setVisibleMonth(currentMonth);
    setStep('time');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const backToTreatmentMenu = () => {
    setSelectedTreatmentId('');
    setSelectedDate('');
    setSelectedTime('');
    setStep('time');
  };

  const changeMonth = (month: Date) => {
    autoPickDoneRef.current = slotKey;
    setNothingSoon(false);
    setVisibleMonth(startOfMonth(month));
  };

  const pickDate = (iso: string) => {
    autoPickDoneRef.current = slotKey;
    setSelectedDate(iso);
    if (iso !== selectedDate) setSelectedTime('');
  };

  const goToDetails = () => {
    if (!selectedDate || !selectedTime) return;
    setStep('details');
    scrollStepIntoView();
  };

  const backToTime = () => {
    setStep('time');
    scrollStepIntoView();
  };

  const handleSubmit = async () => {
    if (!token || !selectedTreatmentId || !selectedDate || !selectedTime || !client.name) {
      toast({ title: t('publicBooking.missingDetailsTitle'), description: t('publicBooking.missingDetailsText'), variant: 'destructive' });
      return;
    }
    if (!client.email && !client.phone) {
      toast({ title: t('publicBooking.missingContactTitle'), description: t('publicBooking.missingContactText'), variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const fn = httpsCallable<
        {
          token: string;
          treatmentId?: string;
          staffId?: string;
          date: string;
          time: string;
          client: { name: string; email?: string; phone?: string };
          notes?: string;
          lang: string;
        },
        { bookingRequestId: string }
      >(functions, 'submitPublicBookingRequest');
      const res = await fn({
        token,
        lang: language,
        treatmentId: selectedTreatmentId,
        staffId: selectedStaffId || undefined,
        date: selectedDate,
        time: selectedTime,
        client: {
          name: client.name.trim(),
          email: client.email.trim() || undefined,
          phone: client.phone.trim() || undefined,
        },
        notes: client.notes.trim() || undefined,
      });
      setSubmittedId(res.data.bookingRequestId);
    } catch (err) {
      const msg =
        (err && typeof err === 'object' && 'message' in err && String((err as { message: unknown }).message)) ||
        t('publicBooking.submitFailedText');
      toast({ title: t('publicBooking.submitFailedTitle'), description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render ----

  if (!token) {
    return <CenteredMessage title={t('publicBooking.invalidLinkTitle')} description={t('publicBooking.invalidLinkText')} />;
  }
  if (loadingContext) {
    return (
      <CenteredMessage
        title={t('publicBooking.loadingTitle')}
        description={t('publicBooking.loadingText')}
        spinner
      />
    );
  }
  if (resolveError || !ctx) {
    return <CenteredMessage title={t('publicBooking.linkUnavailable')} description={resolveError || t('publicBooking.linkLoadError')} />;
  }
  if (ctx.treatments.length === 0) {
    return <CenteredMessage title={t('publicBooking.linkUnavailable')} description={t('publicBooking.noTreatments')} />;
  }

  const themeStyle = bookingThemeStyle(ctx.organization.accent);
  const businessName = ctx.business_info.name ?? ctx.organization.name;
  const currency = ctx.business_info.currency || 'USD';
  const address = typeof ctx.business_info.address === 'string' && ctx.business_info.address.trim()
    ? ctx.business_info.address.trim()
    : null;
  const phone = typeof ctx.business_info.phone === 'string' && ctx.business_info.phone.trim()
    ? ctx.business_info.phone.trim()
    : null;
  const selectedTreatment = ctx.treatments.find(item => item.id === selectedTreatmentId) ?? null;
  const canChangeTreatment = !ctx.scoped_treatment_id && ctx.treatments.length > 1;
  const scopedStaffName = ctx.scoped_staff_id
    ? ctx.staff.find(member => member.id === ctx.scoped_staff_id)?.name ?? null
    : null;
  const activeStep: Step = selectedTreatment ? step : 'treatment';
  const totalSteps = canChangeTreatment ? 3 : 2;
  // Steps: [choose treatment] → date & time → your details.
  const stepNumber =
    activeStep === 'treatment' ? 1 : (canChangeTreatment ? 1 : 0) + (activeStep === 'time' ? 1 : 2);
  const stepLabel = t('publicBooking.stepOf', { step: stepNumber, total: totalSteps });

  if (submittedId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10" style={themeStyle}>
        <div className="w-full max-w-md rounded-2xl border bg-card shadow-sm p-6 sm:p-8">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <BrandMark logoUrl={ctx.organization.logo_url} name={businessName} size="sm" />
            <span className="font-medium text-sm truncate">{businessName}</span>
          </div>
          <div className="text-center">
            <div className="mx-auto h-14 w-14 rounded-full bg-[color:var(--bk-accent-soft)] flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-[color:var(--bk-accent-ink)]" aria-hidden />
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold">{t('publicBooking.receivedTitle')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('publicBooking.receivedText', {
                firstName: client.name.trim().split(' ')[0],
                business: businessName,
                channel: client.email ? t('publicBooking.channels.email') : t('publicBooking.channels.phone'),
              })}
            </p>
          </div>
          {selectedTreatment && selectedDate && selectedTime && (
            <div className="mt-6 rounded-xl bg-muted/60 p-4 space-y-2 text-sm">
              <p className="font-display text-lg font-semibold">{selectedTreatment.name}</p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
                {formatLongDay(selectedDate, locale)}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                <span className="ltr-inline">{formatSlotRange(selectedTime, selectedTreatment.duration, locale)}</span>
              </p>
            </div>
          )}
          <BusinessContact address={address} phone={phone} className="mt-5" />
        </div>
      </div>
    );
  }

  // ---- step 2 (or 1): date & time ----
  const selectedInVisibleMonth = Boolean(selectedDate) && selectedDate.startsWith(`${visibleMonthKey}-`);
  const daySlots = selectedInVisibleMonth ? slots.byDate[selectedDate] ?? [] : [];

  const renderTimesPanel = () => {
    if (monthStatus === 'failed') {
      return (
        <PanelMessage icon={AlertCircle} text={t('publicBooking.slotsLoadError')}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSlotState(prev => (prev.key === slotKey ? { ...prev, failed: without(prev.failed, visibleMonthKey) } : prev))}
          >
            {t('publicBooking.retry')}
          </Button>
        </PanelMessage>
      );
    }
    if (selectedInVisibleMonth) {
      return (
        <div>
          <p className="font-semibold mb-4">{formatLongDay(selectedDate, locale)}</p>
          {daySlots.length > 0 ? (
            <BookingTimeSlots slots={daySlots} selectedTime={selectedTime || null} onSelect={setSelectedTime} locale={locale} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('scheduling:timeGrid.empty')}</p>
          )}
        </div>
      );
    }
    if (monthStatus !== 'loaded') {
      return <PanelMessage icon={Loader2} spin text={t('scheduling:dateStrip.loadingTimes')} />;
    }
    if (nothingSoon) {
      return <PanelMessage icon={CalendarDays} text={t('publicBooking.noOpeningsSoon', { business: businessName })} />;
    }
    if (!firstAvailableInVisibleMonth) {
      const canNext = monthsBetween(currentMonth, visibleMonth) < MAX_MONTHS_AHEAD;
      return (
        <PanelMessage icon={CalendarDays} text={t('publicBooking.noOpeningsMonth', { month: formatMonthYear(visibleMonth, locale) })}>
          {canNext && (
            <Button variant="outline" size="sm" onClick={() => changeMonth(addMonths(visibleMonth, 1))}>
              {t('publicBooking.checkNextMonth')}
            </Button>
          )}
        </PanelMessage>
      );
    }
    return <PanelMessage icon={CalendarDays} text={t('publicBooking.selectDatePrompt')} />;
  };

  const accentButton =
    'bg-[color:var(--bk-accent)] text-[color:var(--bk-accent-fg)] hover:bg-[color:var(--bk-accent)] hover:opacity-90 disabled:opacity-50';

  return (
    <div className="min-h-screen bg-background text-foreground" style={themeStyle}>
      <header className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-5 sm:pt-8 sm:pb-7 flex items-center gap-3 sm:gap-4">
        <BrandMark logoUrl={ctx.organization.logo_url} name={businessName} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold leading-tight truncate">{businessName}</h1>
          <p className="text-sm text-muted-foreground">{t('publicBooking.subtitle')}</p>
        </div>
        <div className="ms-auto shrink-0">
          <LanguageSwitcher variant="full" persist={false} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {activeStep === 'treatment' || !selectedTreatment ? (
          <TreatmentMenu
            treatments={ctx.treatments}
            currency={currency}
            locale={locale}
            onSelect={chooseTreatment}
            stepLabel={canChangeTreatment ? stepLabel : null}
          />
        ) : (
          <div className="grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
            <TreatmentShowcase
              treatment={selectedTreatment}
              currency={currency}
              locale={locale}
              selectedDate={selectedDate || null}
              selectedTime={selectedTime || null}
              staffName={scopedStaffName}
              address={address}
              phone={phone}
              onChangeTreatment={canChangeTreatment ? backToTreatmentMenu : undefined}
            />

            <div ref={stepCardRef} className="scroll-mt-4 space-y-6 min-w-0">
              {activeStep === 'time' ? (
                <section className="rounded-2xl border bg-card shadow-sm">
                  <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b">
                    <h2 className="text-lg font-semibold">{t('publicBooking.selectDateTime')}</h2>
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{stepLabel}</span>
                  </div>

                  {/* Calendar beside the times when the card is wide (md single-column page,
                      xl two-column page); stacked in the narrower lg column. */}
                  <div className="p-5 sm:p-6 md:flex md:gap-8 lg:block xl:flex">
                    <div className="md:w-[320px] md:shrink-0 lg:w-auto xl:w-[300px]">
                      <BookingMonthCalendar
                        month={visibleMonth}
                        onMonthChange={changeMonth}
                        canGoPrev={monthsBetween(currentMonth, visibleMonth) > 0}
                        canGoNext={monthsBetween(currentMonth, visibleMonth) < MAX_MONTHS_AHEAD}
                        selectedDate={selectedDate || null}
                        onSelect={pickDate}
                        isAvailable={isDayAvailable}
                        loading={monthStatus === 'loading' || monthStatus === 'idle'}
                        locale={locale}
                      />
                    </div>
                    <div className="mt-6 pt-6 border-t md:mt-0 md:pt-0 md:border-t-0 md:border-s md:ps-8 lg:mt-6 lg:pt-6 lg:border-t lg:border-s-0 lg:ps-0 xl:mt-0 xl:pt-0 xl:border-t-0 xl:border-s xl:ps-8 flex-1 min-w-0">
                      {renderTimesPanel()}
                    </div>
                  </div>

                  <p className="px-5 sm:px-6 pb-4 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {t('publicBooking.timesIn', { timezone: timeZoneLabel(ctx.organization.timezone, locale) })}
                  </p>

                  {/* Sticky on small screens so Continue stays reachable under a long list of times. */}
                  <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-b-2xl border-t bg-card/95 px-5 sm:px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/85">
                    <div className="min-w-0 flex-1 text-sm">
                      {selectedDate && selectedTime ? (
                        <p className="font-medium truncate">
                          {formatShortDay(selectedDate, locale)} · <span className="ltr-inline">{formatSlotTime(selectedTime, locale)}</span>
                        </p>
                      ) : (
                        <p className="text-muted-foreground truncate">{t('publicBooking.selectTimeToContinue')}</p>
                      )}
                    </div>
                    <Button onClick={goToDetails} disabled={!selectedDate || !selectedTime} className={cn('h-11 px-6 shrink-0', accentButton)}>
                      {t('publicBooking.continue')}
                    </Button>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl border bg-card shadow-sm">
                  <div className="flex items-center gap-2 px-5 sm:px-6 pt-5 pb-4 border-b">
                    <button
                      type="button"
                      onClick={backToTime}
                      aria-label={t('publicBooking.back')}
                      className="-ms-2 h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                    >
                      <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
                    </button>
                    <h2 className="text-lg font-semibold flex-1">{t('publicBooking.yourDetails')}</h2>
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{stepLabel}</span>
                  </div>

                  <form
                    className="p-5 sm:p-6 space-y-5"
                    onSubmit={e => {
                      e.preventDefault();
                      void handleSubmit();
                    }}
                  >
                    <div className="rounded-xl bg-[color:var(--bk-accent-soft)] p-4 flex items-start gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5 text-sm">
                        <p className="font-semibold text-[color:var(--bk-accent-ink)] break-words">{selectedTreatment.name}</p>
                        <p className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                          {formatLongDay(selectedDate, locale)}
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                          <span className="ltr-inline">{formatSlotRange(selectedTime, selectedTreatment.duration, locale)}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={backToTime}
                        className="text-sm font-medium text-[color:var(--bk-accent-ink)] hover:underline shrink-0"
                      >
                        {t('publicBooking.change')}
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="booking-name">{t('publicBooking.nameRequired')}</Label>
                      <Input
                        id="booking-name"
                        autoComplete="name"
                        value={client.name}
                        onChange={e => setClient({ ...client, name: e.target.value })}
                        placeholder={t('publicBooking.fullName')}
                        className="h-11"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="booking-email">{t('publicBooking.email')}</Label>
                        <Input
                          id="booking-email"
                          type="email"
                          autoComplete="email"
                          value={client.email}
                          onChange={e => setClient({ ...client, email: e.target.value })}
                          placeholder={t('publicBooking.emailPlaceholder')}
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="booking-phone">{t('publicBooking.phone')}</Label>
                        <Input
                          id="booking-phone"
                          type="tel"
                          autoComplete="tel"
                          value={client.phone}
                          onChange={e => setClient({ ...client, phone: e.target.value })}
                          placeholder={t('publicBooking.phonePlaceholder')}
                          className="h-11"
                        />
                      </div>
                    </div>
                    <p className="-mt-2 text-xs text-muted-foreground">{t('publicBooking.contactHint')}</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="booking-notes">{t('publicBooking.notesOptional')}</Label>
                      <Textarea
                        id="booking-notes"
                        value={client.notes}
                        onChange={e => setClient({ ...client, notes: e.target.value })}
                        placeholder={t('publicBooking.notesPlaceholder')}
                        rows={3}
                      />
                    </div>

                    <Button type="submit" disabled={submitting} className={cn('w-full h-12 text-base', accentButton)}>
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 me-2 animate-spin" /> {t('publicBooking.sending')}
                        </>
                      ) : (
                        t('publicBooking.requestBooking')
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      {t('publicBooking.confirmBy', {
                        channel:
                          client.email && client.phone
                            ? t('publicBooking.channels.emailOrPhone')
                            : client.email
                              ? t('publicBooking.channels.email')
                              : t('publicBooking.channels.phone'),
                      })}
                    </p>
                  </form>
                </section>
              )}

              <BusinessContact address={address} phone={phone} className="lg:hidden px-1" />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

/** Org logo, or its initial on the accent color. */
const BrandMark: React.FC<{ logoUrl: string | null; name: string; size?: 'sm' | 'md' }> = ({ logoUrl, name, size = 'md' }) => {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg text-sm' : 'h-12 w-12 sm:h-14 sm:w-14 rounded-xl text-lg';
  return logoUrl ? (
    <img src={logoUrl} alt={name} className={cn(box, 'object-contain bg-white border shrink-0')} />
  ) : (
    <div
      className={cn(
        box,
        'shrink-0 flex items-center justify-center font-semibold bg-[color:var(--bk-accent)] text-[color:var(--bk-accent-fg)]',
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
};

/** Centered icon + message used for the times panel's empty / loading / error states. */
const PanelMessage: React.FC<{
  icon: React.ElementType;
  text: string;
  spin?: boolean;
  children?: React.ReactNode;
}> = ({ icon: Icon, text, spin, children }) => (
  <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center gap-3 px-2 py-6">
    <div className="h-11 w-11 rounded-full bg-[color:var(--bk-accent-soft)] flex items-center justify-center">
      <Icon className={cn('h-5 w-5 text-[color:var(--bk-accent-ink)]', spin && 'animate-spin')} aria-hidden />
    </div>
    <p className="text-sm text-muted-foreground max-w-[260px]">{text}</p>
    {children}
  </div>
);

const CenteredMessage: React.FC<{
  title: string;
  description: string;
  spinner?: boolean;
}> = ({ title, description, spinner }) => (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <div className="max-w-md w-full rounded-2xl border bg-card shadow-sm py-10 px-6 text-center space-y-3">
      {spinner && <Loader2 className="h-8 w-8 animate-spin text-foreground/60 mx-auto" />}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  </div>
);

export default PublicBookingPage;
