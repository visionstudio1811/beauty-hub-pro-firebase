import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAppLanguage, type AppLanguage } from '@/i18n';
import { LANGUAGE_STORAGE_KEY, useLanguage } from '@/i18n/LanguageProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DateStrip, buildDateWindow, isoDay } from '@/components/scheduling/DateStrip';
import { TimeGrid, type MergedTimeSlot } from '@/components/scheduling/TimeGrid';

// ----- types matching the resolveSchedulerLink CF response -----

interface PublicTreatment {
  id: string;
  name: string;
  duration: number;
  price?: number;
  staff_ids?: string[];
}

interface PublicStaff {
  id: string;
  name: string;
}

interface ResolveResponse {
  organization: { id: string; name: string; logo_url: string | null; timezone: string; language?: string | null };
  business_info: {
    name: string | null;
    address: string | null;
    phone: string | null;
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

  const [slotsByDate, setSlotsByDate] = useState<Record<string, MergedTimeSlot[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [client, setClient] = useState({ name: '', email: '', phone: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  // 14-day strip
  const dateStrip = useMemo(() => buildDateWindow(14), []);

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

  // Fetch slots for the 14-day window whenever treatment changes. Depends on
  // whether a context exists, not on its identity, so the language re-resolve
  // above doesn't trigger a second slot fetch.
  const hasCtx = ctx !== null;
  useEffect(() => {
    if (!token || !selectedTreatmentId || !hasCtx) return;
    let cancelled = false;
    setLoadingSlots(true);
    const from = isoDay(dateStrip[0]);
    const to = isoDay(dateStrip[dateStrip.length - 1]);
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
      lang: language,
    })
      .then(res => {
        if (cancelled) return;
        setSlotsByDate(res.data.slotsByDate ?? {});
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load slots', err);
        setSlotsByDate({});
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, selectedTreatmentId, selectedStaffId, hasCtx, dateStrip, language]);

  const slotsForSelectedDay = selectedDate ? slotsByDate[selectedDate] ?? [] : [];
  const dayHasSlots = (date: string) => (slotsByDate[date]?.length ?? 0) > 0;

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
  if (submittedId) {
    return (
      <CenteredMessage
        title={t('publicBooking.receivedTitle')}
        description={t('publicBooking.receivedText', {
          firstName: client.name.split(' ')[0],
          business: ctx.business_info.name ?? ctx.organization.name,
          channel: client.email ? t('publicBooking.channels.email') : t('publicBooking.channels.phone'),
        })}
        success
      />
    );
  }

  const selectedTreatment = ctx.treatments.find(item => item.id === selectedTreatmentId);
  const showTreatmentPicker = !ctx.scoped_treatment_id && ctx.treatments.length > 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white px-4 py-6 md:py-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {ctx.organization.logo_url ? (
            <img
              src={ctx.organization.logo_url}
              alt={ctx.organization.name}
              className="h-12 w-12 rounded-md object-contain bg-white border"
            />
          ) : (
            <div className="h-12 w-12 rounded-md bg-purple-600 flex items-center justify-center text-white font-bold text-lg">
              {(ctx.business_info.name ?? ctx.organization.name).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">
              {ctx.business_info.name ?? ctx.organization.name}
            </h1>
            <p className="text-sm text-muted-foreground">{t('publicBooking.subtitle')}</p>
          </div>
          <div className="ms-auto shrink-0">
            <LanguageSwitcher variant="full" persist={false} />
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('publicBooking.pickTime')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Treatment selector */}
            {showTreatmentPicker && (
              <div>
                <Label className="text-sm">{t('publicBooking.treatment')}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {ctx.treatments.map(treatment => (
                    <button
                      key={treatment.id}
                      type="button"
                      onClick={() => {
                        setSelectedTreatmentId(treatment.id);
                        setSelectedDate('');
                        setSelectedTime('');
                      }}
                      className={
                        'rounded-md border p-3 text-start text-sm transition-colors ' +
                        (selectedTreatmentId === treatment.id
                          ? 'border-purple-600 bg-purple-50'
                          : 'border-input hover:bg-accent')
                      }
                    >
                      <div className="font-medium">{treatment.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('publicBooking.durationMin', { count: treatment.duration })}
                        {treatment.price ? (
                          <span className="ltr-inline">
                            {` · ${new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(treatment.price)}`}
                          </span>
                        ) : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!showTreatmentPicker && selectedTreatment && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedTreatment.name}</Badge>
                <span className="text-xs text-muted-foreground">{t('publicBooking.durationMin', { count: selectedTreatment.duration })}</span>
              </div>
            )}

            {/* Date strip */}
            {selectedTreatmentId && (
              <div>
                <Label className="text-sm flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" /> {t('publicBooking.pickDate')}
                </Label>
                <DateStrip
                  dates={dateStrip}
                  selectedDate={selectedDate || null}
                  onSelect={(iso) => {
                    setSelectedDate(iso);
                    setSelectedTime('');
                  }}
                  isDayEnabled={dayHasSlots}
                  loading={loadingSlots}
                />
              </div>
            )}

            {/* Time grid */}
            {selectedDate && (
              <div>
                <Label className="text-sm flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" /> {t('publicBooking.pickTime')}
                </Label>
                <TimeGrid
                  slots={slotsForSelectedDay}
                  selectedTime={selectedTime || null}
                  onSelect={setSelectedTime}
                />
              </div>
            )}

            {/* Visitor form */}
            {selectedTime && (
              <div className="border-t pt-4 space-y-3">
                <h3 className="font-medium text-sm">{t('publicBooking.yourDetails')}</h3>
                <div>
                  <Label className="text-sm">{t('publicBooking.nameRequired')}</Label>
                  <Input
                    value={client.name}
                    onChange={e => setClient({ ...client, name: e.target.value })}
                    placeholder={t('publicBooking.fullName')}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">{t('publicBooking.email')}</Label>
                    <Input
                      type="email"
                      value={client.email}
                      onChange={e => setClient({ ...client, email: e.target.value })}
                      placeholder={t('publicBooking.emailPlaceholder')}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">{t('publicBooking.phone')}</Label>
                    <Input
                      type="tel"
                      value={client.phone}
                      onChange={e => setClient({ ...client, phone: e.target.value })}
                      placeholder={t('publicBooking.phonePlaceholder')}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm">{t('publicBooking.notesOptional')}</Label>
                  <Textarea
                    value={client.notes}
                    onChange={e => setClient({ ...client, notes: e.target.value })}
                    placeholder={t('publicBooking.notesPlaceholder')}
                    rows={2}
                  />
                </div>
                <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 me-1 animate-spin" /> {t('publicBooking.sending')}
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const CenteredMessage: React.FC<{
  title: string;
  description: string;
  spinner?: boolean;
  success?: boolean;
}> = ({ title, description, spinner, success }) => (
  <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-white px-4">
    <Card className="max-w-md w-full">
      <CardContent className="py-10 text-center space-y-3">
        {spinner ? (
          <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto" />
        ) : success ? (
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
        ) : null}
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  </div>
);

export default PublicBookingPage;
