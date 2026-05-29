import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  organization: { id: string; name: string; logo_url: string | null; timezone: string };
  business_info: {
    name: string | null;
    address: string | null;
    phone: string | null;
    slot_interval_minutes: number | null;
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
  const { toast } = useToast();

  const [loadingContext, setLoadingContext] = useState(true);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<ResolveResponse | null>(null);

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

  // Initial resolve
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingContext(true);
    setResolveError(null);
    const fn = httpsCallable<{ token: string }, ResolveResponse>(functions, 'resolveSchedulerLink');
    fn({ token })
      .then(res => {
        if (cancelled) return;
        setCtx(res.data);
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
          'Link could not be loaded.';
        setResolveError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Fetch slots for the 14-day window whenever treatment changes
  useEffect(() => {
    if (!token || !selectedTreatmentId || !ctx) return;
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
  }, [token, selectedTreatmentId, selectedStaffId, ctx, dateStrip]);

  const slotsForSelectedDay = selectedDate ? slotsByDate[selectedDate] ?? [] : [];
  const dayHasSlots = (date: string) => (slotsByDate[date]?.length ?? 0) > 0;

  const handleSubmit = async () => {
    if (!token || !selectedTreatmentId || !selectedDate || !selectedTime || !client.name) {
      toast({ title: 'Missing details', description: 'Pick a time and enter your name.', variant: 'destructive' });
      return;
    }
    if (!client.email && !client.phone) {
      toast({ title: 'Missing contact', description: 'Email or phone required.', variant: 'destructive' });
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
        },
        { bookingRequestId: string }
      >(functions, 'submitPublicBookingRequest');
      const res = await fn({
        token,
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
        'Could not submit the request.';
      toast({ title: 'Submit failed', description: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render ----

  if (!token) {
    return <CenteredMessage title="Invalid link" description="No token in the URL." />;
  }
  if (loadingContext) {
    return (
      <CenteredMessage
        title="Loading…"
        description="One moment while we set up the booking page."
        spinner
      />
    );
  }
  if (resolveError || !ctx) {
    return <CenteredMessage title="Link unavailable" description={resolveError ?? 'Unknown error'} />;
  }
  if (submittedId) {
    return (
      <CenteredMessage
        title="Request received"
        description={`Thanks, ${client.name.split(' ')[0]}! ${ctx.business_info.name ?? ctx.organization.name} will confirm your booking by ${client.email ? 'email' : 'phone'} shortly.`}
        success
      />
    );
  }

  const selectedTreatment = ctx.treatments.find(t => t.id === selectedTreatmentId);
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
            <p className="text-sm text-muted-foreground">Book an appointment</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pick a time</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Treatment selector */}
            {showTreatmentPicker && (
              <div>
                <Label className="text-sm">Treatment</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {ctx.treatments.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedTreatmentId(t.id);
                        setSelectedDate('');
                        setSelectedTime('');
                      }}
                      className={
                        'rounded-md border p-3 text-left text-sm transition-colors ' +
                        (selectedTreatmentId === t.id
                          ? 'border-purple-600 bg-purple-50'
                          : 'border-input hover:bg-accent')
                      }
                    >
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.duration} min
                        {t.price ? ` · $${t.price}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!showTreatmentPicker && selectedTreatment && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedTreatment.name}</Badge>
                <span className="text-xs text-muted-foreground">{selectedTreatment.duration} min</span>
              </div>
            )}

            {/* Date strip */}
            {selectedTreatmentId && (
              <div>
                <Label className="text-sm flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" /> Pick a date
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
                  <Clock className="h-3.5 w-3.5" /> Pick a time
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
                <h3 className="font-medium text-sm">Your details</h3>
                <div>
                  <Label className="text-sm">Name *</Label>
                  <Input
                    value={client.name}
                    onChange={e => setClient({ ...client, name: e.target.value })}
                    placeholder="Full name"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Email</Label>
                    <Input
                      type="email"
                      value={client.email}
                      onChange={e => setClient({ ...client, email: e.target.value })}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Phone</Label>
                    <Input
                      type="tel"
                      value={client.phone}
                      onChange={e => setClient({ ...client, phone: e.target.value })}
                      placeholder="+1 555 123 4567"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Notes (optional)</Label>
                  <Textarea
                    value={client.notes}
                    onChange={e => setClient({ ...client, notes: e.target.value })}
                    placeholder="Anything we should know?"
                    rows={2}
                  />
                </div>
                <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending…
                    </>
                  ) : (
                    'Request booking'
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  We'll confirm your booking by {client.email && client.phone ? 'email or phone' : client.email ? 'email' : 'phone'}.
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
