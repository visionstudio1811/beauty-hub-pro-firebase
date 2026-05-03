import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  setPersistence,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  CalendarCheck,
  Clock,
  FileText,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Phone,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { LoginFloralCorner } from '@/components/auth/LoginFloralCorner';
import { Checkbox } from '@/components/ui/checkbox';
import { auth, db, functions } from '@/lib/firebase';
import { LOGIN_HERO_URL } from '@/lib/loginBranding';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PortalOrg = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  timezone?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

type PortalAccess = {
  organization_id: string;
  client_id: string;
  matched_by: 'email' | 'phone';
};

type ClientRecord = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

type SessionSlot = {
  treatment_id: string;
  remaining: number;
  total: number;
};

type PurchaseRecord = {
  id: string;
  package_id?: string;
  sessions_remaining?: number;
  sessions_by_treatment?: SessionSlot[];
  expiry_date?: string;
  payment_status?: string;
};

type PackageRecord = {
  id: string;
  name: string;
  description?: string;
  treatments?: string[];
  total_sessions?: number;
};

type TreatmentRecord = {
  id: string;
  name: string;
  duration?: number;
  price?: number;
};

type ProductAssignment = {
  id: string;
  product_id?: string;
  quantity?: number;
  assigned_price?: number;
  status?: string;
};

type ProductRecord = {
  id: string;
  name: string;
  description?: string;
  price?: number;
  image_url?: string;
};

type InvoiceRecord = {
  id: string;
  invoice_number?: string;
  total_cents?: number;
  currency?: string;
  issued_at?: unknown;
  pdf_url?: string | null;
  status?: string;
};

type AppointmentRecord = {
  id: string;
  appointment_date?: string;
  appointment_time?: string;
  treatment_name?: string;
  staff_name?: string;
  status?: string;
};

type BookingRequestRecord = {
  id: string;
  treatment_name?: string;
  status?: string;
  preferred_slot?: { date?: string; time?: string; staff_id?: string };
  approved_slot?: { date?: string; time?: string; staff_id?: string };
  staff_response?: string;
};

type PortalData = {
  client: ClientRecord | null;
  purchases: PurchaseRecord[];
  packages: Record<string, PackageRecord>;
  treatments: Record<string, TreatmentRecord>;
  products: ProductAssignment[];
  productCatalog: Record<string, ProductRecord>;
  invoices: InvoiceRecord[];
  appointments: AppointmentRecord[];
  bookingRequests: BookingRequestRecord[];
};

const emptyData: PortalData = {
  client: null,
  purchases: [],
  packages: {},
  treatments: {},
  products: [],
  productCatalog: {},
  invoices: [],
  appointments: [],
  bookingRequests: [],
};

function formatMoney(cents?: number, currency = 'USD') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format((cents ?? 0) / 100);
}

function formatDate(value?: string) {
  if (!value) return 'Not scheduled';
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function statusVariant(status?: string) {
  if (status === 'approved' || status === 'confirmed' || status === 'completed') return 'default';
  if (status === 'pending' || status === 'scheduled') return 'secondary';
  return 'outline';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Accepts E.164 or 10-digit US numbers (implies +1). */
function normalizePhoneE164(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    return trimmed.replace(/\s/g, '');
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return trimmed;
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function ClientPortalSignInLayout({
  org,
  phone,
  setPhone,
  otp,
  setOtp,
  confirmation,
  sendingOtp,
  rememberMe,
  setRememberMe,
  onGoogle,
  onSendOtp,
  onVerifyOtp,
}: {
  org: PortalOrg;
  phone: string;
  setPhone: (value: string) => void;
  otp: string;
  setOtp: (value: string) => void;
  confirmation: ConfirmationResult | null;
  sendingOtp: boolean;
  rememberMe: boolean;
  setRememberMe: (value: boolean) => void;
  onGoogle: () => void | Promise<void>;
  onSendOtp: () => void | Promise<void>;
  onVerifyOtp: () => void | Promise<void>;
}) {
  const addressLine = org.address?.trim();
  const phoneDisplay = org.phone?.trim();

  const contactHref = org.email?.trim()
    ? `mailto:${org.email.trim()}`
    : phoneDisplay
      ? (() => {
          const d = phoneDisplay.replace(/\D/g, '');
          if (d.length === 10) return `tel:+1${d}`;
          if (d.length === 11 && d.startsWith('1')) return `tel:+${d}`;
          return `tel:${phoneDisplay.replace(/\s/g, '')}`;
        })()
      : null;

  const heroStyle = {
    backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.28) 40%, rgba(0,0,0,0.55) 100%), url(${LOGIN_HERO_URL})`,
  } as const;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#e4dfd8] p-0 sm:p-6 md:p-8">
      <div
        className={cn(
          'flex w-full max-w-6xl flex-1 flex-col overflow-hidden bg-[#f7f4f0] shadow-2xl ring-1 ring-black/5',
          'sm:max-h-[min(920px,calc(100vh-3rem))] sm:flex-initial sm:rounded-2xl lg:flex-row lg:min-h-[580px]',
        )}
      >
        {/* Brand / hero */}
        <div
          className="relative flex min-h-[42vh] flex-1 flex-col justify-between bg-neutral-900 bg-cover bg-center px-8 py-10 text-white lg:min-h-0 lg:w-1/2 lg:rounded-l-2xl lg:py-12"
          style={heroStyle}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/20 lg:rounded-l-2xl" aria-hidden />
          <div className="relative z-10 flex flex-col gap-6">
            {org.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="h-14 w-auto max-w-[200px] object-contain object-left drop-shadow-lg" />
            ) : (
              <h1 className="font-display text-4xl font-semibold tracking-tight drop-shadow-md">{org.name}</h1>
            )}
            {org.logo_url && (
              <p className="font-sans text-xs font-medium uppercase tracking-[0.35em] text-white/90">{org.name}</p>
            )}
          </div>

          <div className="relative z-10 mt-8 max-w-md space-y-4 lg:mt-0">
            <p className="font-sans text-xs font-medium uppercase tracking-[0.35em] text-white/80">Client portal</p>
            <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Welcome back</h2>
            <p className="font-sans text-sm leading-relaxed text-white/85">
              Sign in to your account to view your appointments, manage your bookings, and more.
            </p>
          </div>

          <div className="relative z-10 mt-10 space-y-4 font-sans text-sm text-white/90 lg:mt-12">
            {addressLine && (
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/70" aria-hidden />
                <span className="leading-snug">{addressLine}</span>
              </div>
            )}
            {phoneDisplay && (
              <div className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-white/70" aria-hidden />
                <span>{phoneDisplay}</span>
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="relative flex flex-1 flex-col justify-center bg-[#f7f4f0] px-6 py-10 sm:px-10 lg:w-1/2 lg:rounded-r-2xl lg:px-12 lg:py-14">
          <LoginFloralCorner className="absolute right-0 top-0 h-56 w-56 -translate-y-2 translate-x-4 sm:h-64 sm:w-64" />

          <div className="relative z-10 mx-auto w-full max-w-md space-y-8">
            <div className="space-y-2">
              <h2 className="font-display text-3xl font-semibold text-foreground">Sign in</h2>
              <p className="font-sans text-sm text-muted-foreground">
                Use the same Google account or phone number your spa has on file.
              </p>
            </div>

            <div className="space-y-5 font-sans">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full gap-2 rounded-lg border-border/80 bg-white text-base shadow-sm"
                onClick={() => void onGoogle()}
              >
                <GoogleIcon />
                Continue with Google
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full border-t border-border/70" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#f7f4f0] px-3 font-medium uppercase tracking-wide text-muted-foreground">or</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client-phone" className="text-foreground">
                    Phone number
                  </Label>
                  <div className="relative flex min-w-0">
                    <div className="pointer-events-none absolute left-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5 text-sm text-muted-foreground">
                      <span aria-hidden>🇺🇸</span>
                      <span className="font-medium tabular-nums">+1</span>
                    </div>
                    <Input
                      id="client-phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="Enter your phone number"
                      className="h-12 rounded-lg border-border/80 bg-white pl-[4.25rem] text-base shadow-sm"
                      autoComplete="tel-national"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 font-sans text-sm text-foreground">
                  <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                  Remember me on this device
                </label>

                <Button
                  type="button"
                  className="h-12 w-full rounded-lg bg-foreground text-base font-medium text-background hover:bg-foreground/90"
                  onClick={() => void onSendOtp()}
                  disabled={sendingOtp}
                >
                  {sendingOtp ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    'Send verification code'
                  )}
                </Button>

                {confirmation && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="client-otp">Verification code</Label>
                    <div className="flex gap-2">
                      <Input
                        id="client-otp"
                        value={otp}
                        onChange={(event) => setOtp(event.target.value)}
                        inputMode="numeric"
                        className="h-12 rounded-lg border-border/80 bg-white text-base shadow-sm"
                        autoComplete="one-time-code"
                      />
                      <Button
                        type="button"
                        className="h-12 shrink-0 rounded-lg bg-foreground px-6 text-background hover:bg-foreground/90"
                        onClick={() => void onVerifyOtp()}
                      >
                        Verify
                      </Button>
                    </div>
                  </div>
                )}

                <div id="client-portal-recaptcha" />
              </div>
            </div>

            {contactHref && (
              <p className="text-center font-sans text-sm text-muted-foreground">
                <a href={contactHref} className="underline decoration-muted-foreground/50 underline-offset-4 hover:text-foreground">
                  Having trouble signing in? Contact us
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientPortal() {
  const { orgSlug = '' } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const [org, setOrg] = useState<PortalOrg | null>(null);
  const [access, setAccess] = useState<PortalAccess | null>(null);
  const [data, setData] = useState<PortalData>(emptyData);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [linking, setLinking] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [requestForm, setRequestForm] = useState({
    purchaseId: '',
    treatmentId: '',
    date: '',
    time: '',
    altDate: '',
    altTime: '',
    notes: '',
  });

  useEffect(() => {
    const loadOrg = async () => {
      setLoadingOrg(true);
      try {
        const getOrg = httpsCallable(functions, 'getClientPortalOrg');
        const result = await getOrg({
          slug: orgSlug || undefined,
          host: window.location.hostname,
        });
        setOrg((result.data as { organization: PortalOrg }).organization);
      } catch (error) {
        console.error(error);
        toast({ title: 'Portal not found', description: 'Check the spa link and try again.', variant: 'destructive' });
      } finally {
        setLoadingOrg(false);
      }
    };

    loadOrg();
  }, [orgSlug, toast]);

  useEffect(() => {
    const link = async () => {
      if (!user || !org?.id) return;
      setLinking(true);
      try {
        const linkAccount = httpsCallable(functions, 'linkClientPortalAccount');
        const result = await linkAccount({ organizationId: org.id });
        setAccess((result.data as { access: PortalAccess }).access);
      } catch (error) {
        console.error(error);
        setAccess(null);
        toast({
          title: 'No matching client card',
          description: getErrorMessage(error, 'Use the phone or email saved by the spa.'),
          variant: 'destructive',
        });
      } finally {
        setLinking(false);
      }
    };

    link();
  }, [user, org?.id, toast]);

  useEffect(() => {
    const loadData = async () => {
      if (!access?.organization_id || !access.client_id) return;
      setLoadingData(true);
      try {
        const orgRef = doc(db, 'organizations', access.organization_id);
        const clientSnap = await getDoc(doc(orgRef, 'clients', access.client_id));
        const [purchasesSnap, productsSnap, invoicesSnap, appointmentsSnap, requestsSnap] = await Promise.all([
          getDocs(query(collection(orgRef, 'purchases'), where('client_id', '==', access.client_id), where('payment_status', '==', 'active'))),
          getDocs(query(collection(orgRef, 'productAssignments'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'invoices'), where('client_id', '==', access.client_id), where('status', '==', 'issued'))),
          getDocs(query(collection(orgRef, 'appointments'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'bookingRequests'), where('client_id', '==', access.client_id))),
        ]);

        const purchases = purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseRecord));
        const packageIds = Array.from(new Set(purchases.map((p) => p.package_id).filter(Boolean) as string[]));
        const productAssignments = productsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductAssignment));
        const productIds = Array.from(new Set(productAssignments.map((p) => p.product_id).filter(Boolean) as string[]));

        const packageEntries = await Promise.all(
          packageIds.map(async (id) => {
            const snap = await getDoc(doc(orgRef, 'packages', id));
            return snap.exists() ? [id, { id, ...snap.data() } as PackageRecord] as const : null;
          }),
        );
        const packages = Object.fromEntries(packageEntries.filter(Boolean) as Array<readonly [string, PackageRecord]>);

        const treatmentIds = Array.from(new Set(Object.values(packages).flatMap((pkg) => pkg.treatments ?? [])));
        const treatmentEntries = await Promise.all(
          treatmentIds.map(async (id) => {
            const snap = await getDoc(doc(orgRef, 'treatments', id));
            return snap.exists() ? [id, { id, ...snap.data() } as TreatmentRecord] as const : null;
          }),
        );
        const treatments = Object.fromEntries(treatmentEntries.filter(Boolean) as Array<readonly [string, TreatmentRecord]>);

        const productEntries = await Promise.all(
          productIds.map(async (id) => {
            const snap = await getDoc(doc(orgRef, 'products', id));
            return snap.exists() ? [id, { id, ...snap.data() } as ProductRecord] as const : null;
          }),
        );
        const productCatalog = Object.fromEntries(productEntries.filter(Boolean) as Array<readonly [string, ProductRecord]>);

        setData({
          client: clientSnap.exists() ? { id: clientSnap.id, ...clientSnap.data() } as ClientRecord : null,
          purchases,
          packages,
          treatments,
          products: productAssignments,
          productCatalog,
          invoices: invoicesSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as InvoiceRecord))
            .sort((a, b) => String(b.invoice_number ?? '').localeCompare(String(a.invoice_number ?? ''))),
          appointments: appointmentsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as AppointmentRecord))
            .sort((a, b) => `${a.appointment_date ?? ''}${a.appointment_time ?? ''}`.localeCompare(`${b.appointment_date ?? ''}${b.appointment_time ?? ''}`)),
          bookingRequests: requestsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as BookingRequestRecord))
            .reverse(),
        });
      } catch (error) {
        console.error(error);
        toast({ title: 'Could not load portal', description: 'Please refresh and try again.', variant: 'destructive' });
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, [access?.organization_id, access?.client_id, refreshKey, toast]);

  const selectedPurchase = useMemo(
    () => data.purchases.find((purchase) => purchase.id === requestForm.purchaseId),
    [data.purchases, requestForm.purchaseId],
  );

  const availableTreatments = useMemo(() => {
    if (!selectedPurchase?.package_id) return [];
    const pkg = data.packages[selectedPurchase.package_id];
    if (!pkg) return [];
    const remainingSlots = selectedPurchase.sessions_by_treatment;
    if (remainingSlots?.length) {
      const allowed = new Set(remainingSlots.filter((slot) => slot.remaining > 0).map((slot) => slot.treatment_id));
      return (pkg.treatments ?? []).filter((id) => allowed.has(id)).map((id) => data.treatments[id]).filter(Boolean);
    }
    return (pkg.treatments ?? []).map((id) => data.treatments[id]).filter(Boolean);
  }, [data.packages, data.treatments, selectedPurchase]);

  const handleGoogleSignIn = async () => {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    await signInWithPopup(auth, new GoogleAuthProvider());
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    const e164 = normalizePhoneE164(phone);
    setSendingOtp(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, 'client-portal-recaptcha', { size: 'invisible' });
      }
      const result = await signInWithPhoneNumber(auth, e164, recaptchaRef.current);
      setConfirmation(result);
      toast({ title: 'Code sent', description: 'Enter the SMS code to continue.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Could not send code', description: 'Check the phone number format and try again.', variant: 'destructive' });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmation || !otp.trim()) return;
    await confirmation.confirm(otp.trim());
  };

  const handleCreateRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!org?.id || !requestForm.purchaseId || !requestForm.treatmentId || !requestForm.date || !requestForm.time) {
      toast({ title: 'Missing request details', description: 'Choose a package, treatment, date, and time.', variant: 'destructive' });
      return;
    }

    setSubmittingRequest(true);
    try {
      const createRequest = httpsCallable(functions, 'createClientBookingRequest');
      const alternativeSlots = requestForm.altDate && requestForm.altTime
        ? [{ date: requestForm.altDate, time: requestForm.altTime }]
        : [];

      await createRequest({
        organizationId: org.id,
        purchaseId: requestForm.purchaseId,
        treatmentId: requestForm.treatmentId,
        preferredSlot: { date: requestForm.date, time: requestForm.time },
        alternativeSlots,
        notes: requestForm.notes,
      });

      toast({ title: 'Request sent', description: 'The spa will confirm before it becomes an appointment.' });
      setRequestForm({ purchaseId: '', treatmentId: '', date: '', time: '', altDate: '', altTime: '', notes: '' });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast({ title: 'Request failed', description: getErrorMessage(error, 'Please try another slot.'), variant: 'destructive' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (loadingOrg) {
    return <PortalShell org={org}><LoadingState label="Loading portal..." /></PortalShell>;
  }

  if (!org) {
    return <PortalShell org={null}><EmptyState title="Portal not found" text="Use the link provided by your spa." /></PortalShell>;
  }

  if (!user) {
    return (
      <ClientPortalSignInLayout
        org={org}
        phone={phone}
        setPhone={setPhone}
        otp={otp}
        setOtp={setOtp}
        confirmation={confirmation}
        sendingOtp={sendingOtp}
        rememberMe={rememberMe}
        setRememberMe={setRememberMe}
        onGoogle={handleGoogleSignIn}
        onSendOtp={handleSendOtp}
        onVerifyOtp={handleVerifyOtp}
      />
    );
  }

  if (linking || loadingData) {
    return <PortalShell org={org}><LoadingState label="Opening your client portal..." /></PortalShell>;
  }

  if (!access) {
    return (
      <PortalShell org={org}>
        <EmptyState
          title="No matching client card"
          text="Sign in with the phone number or Google email saved on your client card."
        />
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => signOut(auth)}>Try another sign in</Button>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell org={org}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Welcome</p>
          <h2 className="text-2xl font-semibold">{data.client?.name || 'Client'}</h2>
        </div>
        <Button variant="outline" onClick={() => signOut(auth)}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Plan</TabsTrigger>
          <TabsTrigger value="book">Book</TabsTrigger>
          <TabsTrigger value="history">Visits</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {data.purchases.map((purchase) => {
              const pkg = purchase.package_id ? data.packages[purchase.package_id] : null;
              return (
                <Card key={purchase.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      {pkg?.name || 'Package'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{pkg?.description || 'Active package'}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span>Sessions remaining</span>
                      <Badge>{purchase.sessions_remaining ?? 0}</Badge>
                    </div>
                    {purchase.expiry_date && (
                      <div className="flex items-center justify-between text-sm">
                        <span>Expires</span>
                        <span>{formatDate(purchase.expiry_date)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {data.purchases.length === 0 && <EmptyState title="No active packages" text="Active spa packages will appear here." />}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                Products
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {data.products.map((assignment) => {
                const product = assignment.product_id ? data.productCatalog[assignment.product_id] : null;
                return (
                  <div key={assignment.id} className="rounded-md border p-3">
                    <div className="font-medium">{product?.name || 'Product'}</div>
                    <div className="text-sm text-muted-foreground">Quantity {assignment.quantity ?? 1}</div>
                  </div>
                );
              })}
              {data.products.length === 0 && <p className="text-sm text-muted-foreground">No assigned products yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="book">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Request a treatment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRequest} className="grid gap-4 md:grid-cols-2">
                <Field label="Package">
                  <Select
                    value={requestForm.purchaseId}
                    onValueChange={(value) => setRequestForm((prev) => ({ ...prev, purchaseId: value, treatmentId: '' }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose package" /></SelectTrigger>
                    <SelectContent>
                      {data.purchases.map((purchase) => (
                        <SelectItem key={purchase.id} value={purchase.id}>
                          {purchase.package_id ? data.packages[purchase.package_id]?.name : 'Package'} ({purchase.sessions_remaining ?? 0} left)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Treatment">
                  <Select
                    value={requestForm.treatmentId}
                    onValueChange={(value) => setRequestForm((prev) => ({ ...prev, treatmentId: value }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose treatment" /></SelectTrigger>
                    <SelectContent>
                      {availableTreatments.map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Preferred date">
                  <Input type="date" value={requestForm.date} onChange={(event) => setRequestForm((prev) => ({ ...prev, date: event.target.value }))} />
                </Field>
                <Field label="Preferred time">
                  <Input type="time" value={requestForm.time} onChange={(event) => setRequestForm((prev) => ({ ...prev, time: event.target.value }))} />
                </Field>
                <Field label="Backup date">
                  <Input type="date" value={requestForm.altDate} onChange={(event) => setRequestForm((prev) => ({ ...prev, altDate: event.target.value }))} />
                </Field>
                <Field label="Backup time">
                  <Input type="time" value={requestForm.altTime} onChange={(event) => setRequestForm((prev) => ({ ...prev, altTime: event.target.value }))} />
                </Field>
                <div className="md:col-span-2">
                  <Label htmlFor="request-notes">Notes</Label>
                  <Textarea id="request-notes" value={requestForm.notes} onChange={(event) => setRequestForm((prev) => ({ ...prev, notes: event.target.value }))} />
                </div>
                <Button className="md:col-span-2" disabled={submittingRequest}>
                  {submittingRequest && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send request
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-3">
            {data.bookingRequests.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{request.treatment_name || 'Treatment request'}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(request.preferred_slot?.date)} at {request.preferred_slot?.time}
                    </div>
                    {request.staff_response && <div className="text-sm text-muted-foreground">{request.staff_response}</div>}
                  </div>
                  <Badge variant={statusVariant(request.status)}>{request.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="grid gap-3">
            {data.appointments.map((appointment) => (
              <Card key={appointment.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{appointment.treatment_name || 'Treatment'}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(appointment.appointment_date)} at {appointment.appointment_time}
                    </div>
                  </div>
                  <Badge variant={statusVariant(appointment.status)}>{appointment.status}</Badge>
                </CardContent>
              </Card>
            ))}
            {data.appointments.length === 0 && <EmptyState title="No visits yet" text="Approved appointments will appear here." />}
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <div className="grid gap-3">
            {data.invoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{invoice.invoice_number || 'Invoice'}</div>
                    <div className="text-sm text-muted-foreground">{formatMoney(invoice.total_cents, invoice.currency)}</div>
                  </div>
                  {invoice.pdf_url ? (
                    <Button asChild variant="outline">
                      <a href={invoice.pdf_url} target="_blank" rel="noreferrer">
                        <FileText className="mr-2 h-4 w-4" />
                        PDF
                      </a>
                    </Button>
                  ) : (
                    <Badge variant="secondary">Issued</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
            {data.invoices.length === 0 && <EmptyState title="No invoices" text="Issued invoices for active purchases will appear here." />}
          </div>
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
}

function PortalShell({ org, children }: { org: PortalOrg | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            {org?.logo_url ? <img src={org.logo_url} alt="" className="h-10 w-10 rounded-md object-cover" /> : <CalendarCheck className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{org?.name || 'Client Portal'}</h1>
            <p className="truncate text-sm text-muted-foreground">{org?.address || 'Packages, visits, and requests'}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 p-8 text-center">
        <Clock className="h-8 w-8 text-muted-foreground" />
        <div className="font-medium">{title}</div>
        <div className="max-w-md text-sm text-muted-foreground">{text}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
