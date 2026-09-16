import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n, { isAppLanguage, localeFor } from '@/i18n';
import { useLanguage } from '@/i18n/LanguageProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { DateStrip, buildDateWindow } from '@/components/scheduling/DateStrip';
import { TimeGrid, type MergedTimeSlot } from '@/components/scheduling/TimeGrid';
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
  language?: string | null;
  /** ISO currency code from the org's config/businessInfo (defaults to 'USD' server-side). */
  currency?: string | null;
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

type AddonRecord = {
  id: string;
  name: string;
  price: number;
  duration_minutes?: number | null;
  description?: string;
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
  addons: Record<string, AddonRecord>;
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
  addons: {},
  products: [],
  productCatalog: {},
  invoices: [],
  appointments: [],
  bookingRequests: [],
};

function formatMoney(cents?: number, currency = 'USD') {
  return new Intl.NumberFormat(localeFor(i18n.language), {
    style: 'currency',
    currency,
  }).format((cents ?? 0) / 100);
}

/** Whole-currency amounts (add-on / treatment prices are stored in dollars, not cents). */
function formatPrice(amount: number, currency = 'USD') {
  return new Intl.NumberFormat(localeFor(i18n.language), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value?: string) {
  if (!value) return i18n.t('portal:notScheduled');
  return new Date(`${value}T00:00:00`).toLocaleDateString(localeFor(i18n.language));
}

// Firestore status values stay as-is; map only for display.
const STATUS_KEY_OVERRIDES: Record<string, string> = { no_show: 'noShow', in_progress: 'inProgress' };
function statusLabel(status?: string) {
  if (!status) return '';
  const key = STATUS_KEY_OVERRIDES[status] ?? status;
  return i18n.t(`portal:status.${key}`, { defaultValue: status });
}

function statusVariant(status?: string) {
  if (status === 'approved' || status === 'confirmed' || status === 'completed') return 'default';
  if (status === 'pending' || status === 'scheduled') return 'secondary';
  return 'outline';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Countries offered by the phone sign-in selector. Keep in sync with
 * `toE164` in functions/src/clientPortal.ts — the server applies the same
 * rules when matching the OTP-verified phone against client cards.
 */
type PhoneCountry = 'IL' | 'US' | 'CA' | 'GB';

const PHONE_COUNTRIES: ReadonlyArray<{ code: PhoneCountry; dial: string; flag: string }> = [
  { code: 'IL', dial: '972', flag: '🇮🇱' },
  { code: 'US', dial: '1', flag: '🇺🇸' },
  { code: 'CA', dial: '1', flag: '🇨🇦' },
  { code: 'GB', dial: '44', flag: '🇬🇧' },
];

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

function dialCodeFor(country: PhoneCountry): string {
  return PHONE_COUNTRIES.find((c) => c.code === country)?.dial ?? '1';
}

/**
 * Convert what the user typed into E.164 for the selected country.
 *  - A leading '+' is honoured as-is (formatting stripped, no re-prefixing).
 *  - IL: local 05X XXXXXXX / 0X XXXXXXX (9–10 digits, leading 0) -> +972 + digits without the 0.
 *  - US/CA: 10 digits -> +1 + digits; 11 digits starting with 1 -> + digits.
 *  - Digits already starting with the country's dial code -> + digits.
 *  - Anything else -> + dial code + digits with any leading 0 stripped.
 */
function normalizePhoneE164(input: string, country: PhoneCountry): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  if (country === 'IL' && (digits.length === 9 || digits.length === 10) && digits.startsWith('0')) {
    return `+972${digits.slice(1)}`;
  }
  if (country === 'US' || country === 'CA') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  }

  const dial = dialCodeFor(country);
  if (digits.startsWith(dial) && digits.length > dial.length + 6) {
    return `+${digits}`;
  }
  return `+${dial}${digits.replace(/^0+/, '')}`;
}

/** Recognise the country from a stored phone that already carries a '+' country code. */
function detectPhoneCountry(phone: string | null | undefined): PhoneCountry | null {
  const trimmed = phone?.trim();
  if (!trimmed || !trimmed.startsWith('+')) return null;
  const digits = trimmed.slice(1).replace(/\D/g, '');
  if (digits.startsWith('972')) return 'IL';
  if (digits.startsWith('44')) return 'GB';
  if (digits.startsWith('1')) return 'US';
  return null;
}

/** Org phone country code wins; otherwise Hebrew orgs default to Israel, everyone else to the US. */
function defaultPhoneCountry(org: PortalOrg | null | undefined): PhoneCountry {
  return detectPhoneCountry(org?.phone) ?? (org?.language === 'he' ? 'IL' : 'US');
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
  phoneCountry,
  setPhoneCountry,
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
  phoneCountry: PhoneCountry;
  setPhoneCountry: (value: PhoneCountry) => void;
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
  const { t } = useTranslation('portal');
  const addressLine = org.address?.trim();
  const phoneDisplay = org.phone?.trim();

  // Never assume +1 for the org's own phone: a stored '+…' number is used as-is
  // (formatting stripped); a local number is normalised for the org's country.
  const contactHref = org.email?.trim()
    ? `mailto:${org.email.trim()}`
    : phoneDisplay
      ? `tel:${normalizePhoneE164(phoneDisplay, defaultPhoneCountry(org))}`
      : null;

  const selectedCountry = PHONE_COUNTRIES.find((c) => c.code === phoneCountry) ?? PHONE_COUNTRIES[1];

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
          className="relative flex min-h-[42vh] flex-1 flex-col justify-between bg-neutral-900 bg-cover bg-center px-8 py-10 text-white lg:min-h-0 lg:w-1/2 lg:rounded-s-2xl lg:py-12"
          style={heroStyle}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/20 lg:rounded-s-2xl" aria-hidden />
          <div className="relative z-10 flex flex-col gap-6">
            {org.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="h-14 w-auto max-w-[200px] object-contain object-left rtl:object-right drop-shadow-lg" />
            ) : (
              <h1 className="font-display text-4xl font-semibold tracking-tight drop-shadow-md">{org.name}</h1>
            )}
            {org.logo_url && (
              <p className="font-sans text-xs font-medium uppercase tracking-[0.35em] text-white/90">{org.name}</p>
            )}
          </div>

          <div className="relative z-10 mt-8 max-w-md space-y-4 lg:mt-0">
            <p className="font-sans text-xs font-medium uppercase tracking-[0.35em] text-white/80">{t('signIn.eyebrow')}</p>
            <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{t('signIn.welcomeBack')}</h2>
            <p className="font-sans text-sm leading-relaxed text-white/85">
              {t('signIn.heroText')}
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
                <span className="ltr-inline">{phoneDisplay}</span>
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <div className="relative flex flex-1 flex-col justify-center bg-[#f7f4f0] px-6 py-10 sm:px-10 lg:w-1/2 lg:rounded-e-2xl lg:px-12 lg:py-14">
          <LoginFloralCorner className="absolute end-0 top-0 h-56 w-56 -translate-y-2 translate-x-4 rtl:-translate-x-4 sm:h-64 sm:w-64" />

          <div className="relative z-10 mx-auto w-full max-w-md space-y-8">
            <div className="flex justify-end">
              <LanguageSwitcher variant="full" persist={false} />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-3xl font-semibold text-foreground">{t('signIn.title')}</h2>
              <p className="font-sans text-sm text-muted-foreground">
                {t('signIn.subtitle')}
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
                {t('signIn.continueWithGoogle')}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full border-t border-border/70" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#f7f4f0] px-3 font-medium uppercase tracking-wide text-muted-foreground">{t('signIn.or')}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="client-phone" className="text-foreground">
                    {t('signIn.phoneLabel')}
                  </Label>
                  {/* Phone entry is always LTR (country prefix + digits), so this row is pinned to dir="ltr". */}
                  <div className="flex min-w-0 gap-2" dir="ltr">
                    <Select value={phoneCountry} onValueChange={(value) => setPhoneCountry(value as PhoneCountry)}>
                      <SelectTrigger
                        aria-label={t('signIn.countryLabel')}
                        className="h-12 w-[6.75rem] shrink-0 gap-1 rounded-lg border-border/80 bg-white px-3 text-sm shadow-sm"
                      >
                        <SelectValue>
                          <span className="flex items-center gap-1.5">
                            <span aria-hidden>{selectedCountry.flag}</span>
                            <span className="font-medium tabular-nums">+{selectedCountry.dial}</span>
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {PHONE_COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            <span className="flex items-center gap-2">
                              <span aria-hidden>{country.flag}</span>
                              <span>{t(`signIn.countries.${country.code}`)}</span>
                              <span className="ltr-inline tabular-nums text-muted-foreground">+{country.dial}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id="client-phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder={t(`signIn.phoneExamples.${phoneCountry}`)}
                      className="h-12 min-w-0 flex-1 rounded-lg border-border/80 bg-white text-base shadow-sm"
                      autoComplete="tel-national"
                      inputMode="tel"
                      dir="ltr"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 font-sans text-sm text-foreground">
                  <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                  {t('signIn.rememberMe')}
                </label>

                <Button
                  type="button"
                  className="h-12 w-full rounded-lg bg-foreground text-base font-medium text-background hover:bg-foreground/90"
                  onClick={() => void onSendOtp()}
                  disabled={sendingOtp}
                >
                  {sendingOtp ? (
                    <>
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      {t('signIn.sending')}
                    </>
                  ) : (
                    t('signIn.sendCode')
                  )}
                </Button>

                {confirmation && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="client-otp">{t('signIn.codeLabel')}</Label>
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
                        {t('signIn.verify')}
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
                  {t('signIn.trouble')}
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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation('portal');
  const { setLanguage } = useLanguage();
  const [org, setOrg] = useState<PortalOrg | null>(null);
  const [access, setAccess] = useState<PortalAccess | null>(null);
  const [data, setData] = useState<PortalData>(emptyData);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [linking, setLinking] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>('US');
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
    addonIds: [] as string[],
  });
  // Slot picker state
  const [slotsByDate, setSlotsByDate] = useState<Record<string, MergedTimeSlot[]>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const dateWindow = useMemo(() => buildDateWindow(14), []);

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
        toast({ title: i18n.t('portal:toasts.portalNotFound'), description: i18n.t('portal:toasts.portalNotFoundText'), variant: 'destructive' });
      } finally {
        setLoadingOrg(false);
      }
    };

    loadOrg();
  }, [orgSlug, toast]);

  // Client-facing page, never persisted to users/{uid}. An explicit ?lang= on the
  // link (e.g. a Hebrew org sending an English-speaking client a link) wins over
  // the org default language; without it the org default applies. The on-page
  // LanguageSwitcher still overrides both for the current visit.
  const langParam = searchParams.get('lang');
  const orgLanguage = org?.language ?? null;
  useEffect(() => {
    if (loadingOrg) return;
    const candidate = isAppLanguage(langParam) ? langParam : isAppLanguage(orgLanguage) ? orgLanguage : null;
    if (candidate) void setLanguage(candidate, { persist: false });
  }, [loadingOrg, orgLanguage, langParam, setLanguage]);

  // Phone sign-in defaults to the org's country (from its stored phone, else 'IL' for Hebrew orgs).
  useEffect(() => {
    if (org) setPhoneCountry(defaultPhoneCountry(org));
  }, [org]);

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
          title: i18n.t('portal:toasts.noMatchTitle'),
          description: getErrorMessage(error, i18n.t('portal:toasts.noMatchText')),
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
        const [purchasesSnap, productsSnap, invoicesSnap, appointmentsSnap, requestsSnap, addonsSnap] = await Promise.all([
          getDocs(query(collection(orgRef, 'purchases'), where('client_id', '==', access.client_id), where('payment_status', '==', 'active'))),
          getDocs(query(collection(orgRef, 'productAssignments'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'invoices'), where('client_id', '==', access.client_id), where('status', '==', 'issued'))),
          getDocs(query(collection(orgRef, 'appointments'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'bookingRequests'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'addons'), where('is_active', '==', true))),
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

        const addons = Object.fromEntries(
          addonsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as AddonRecord] as const),
        );

        setData({
          client: clientSnap.exists() ? { id: clientSnap.id, ...clientSnap.data() } as ClientRecord : null,
          purchases,
          packages,
          treatments,
          addons,
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
        toast({ title: i18n.t('portal:toasts.loadFailedTitle'), description: i18n.t('portal:toasts.loadFailedText'), variant: 'destructive' });
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
    const e164 = normalizePhoneE164(phone, phoneCountry);
    if (!E164_PATTERN.test(e164)) {
      toast({ title: t('toasts.invalidPhoneTitle'), description: t('toasts.invalidPhoneText'), variant: 'destructive' });
      return;
    }
    setSendingOtp(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, 'client-portal-recaptcha', { size: 'invisible' });
      }
      const result = await signInWithPhoneNumber(auth, e164, recaptchaRef.current);
      setConfirmation(result);
      toast({ title: t('toasts.codeSentTitle'), description: t('toasts.codeSentText') });
    } catch (error) {
      console.error(error);
      toast({ title: t('toasts.codeFailedTitle'), description: t('toasts.codeFailedText'), variant: 'destructive' });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!confirmation || !otp.trim()) return;
    await confirmation.confirm(otp.trim());
  };

  // Fetch available slots for the 14-day window whenever the chosen treatment
  // (or org) changes. Uses the same getAvailableSlots CF as the public page,
  // taking the authenticated path since portal users are signed in.
  useEffect(() => {
    if (!org?.id || !requestForm.treatmentId) {
      setSlotsByDate({});
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    const fn = httpsCallable<
      {
        organizationId: string;
        treatmentId: string;
        fromDate: string;
        toDate: string;
        merge: boolean;
      },
      { slotsByDate: Record<string, MergedTimeSlot[]> }
    >(functions, 'getAvailableSlots');
    const isoDay = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    fn({
      organizationId: org.id,
      treatmentId: requestForm.treatmentId,
      fromDate: isoDay(dateWindow[0]),
      toDate: isoDay(dateWindow[dateWindow.length - 1]),
      merge: true,
    })
      .then((res) => {
        if (!cancelled) setSlotsByDate(res.data.slotsByDate ?? {});
      })
      .catch((err) => {
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
  }, [org?.id, requestForm.treatmentId, dateWindow]);

  const handleCreateRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!org?.id || !requestForm.purchaseId || !requestForm.treatmentId || !requestForm.date || !requestForm.time) {
      toast({ title: t('toasts.missingDetailsTitle'), description: t('toasts.missingDetailsText'), variant: 'destructive' });
      return;
    }

    if (requestForm.addonIds.length > 1) {
      toast({
        title: t('toasts.tooManyAddonsTitle'),
        description: t('toasts.tooManyAddonsText'),
        variant: 'destructive',
      });
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
        addons: requestForm.addonIds.map((id) => ({ addon_id: id })),
      });

      toast({ title: t('toasts.requestSentTitle'), description: t('toasts.requestSentText') });
      setRequestForm({ purchaseId: '', treatmentId: '', date: '', time: '', altDate: '', altTime: '', notes: '', addonIds: [] });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast({ title: t('toasts.requestFailedTitle'), description: getErrorMessage(error, t('toasts.requestFailedText')), variant: 'destructive' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (loadingOrg) {
    return <PortalShell org={org}><LoadingState label={t('loading.portal')} /></PortalShell>;
  }

  if (!org) {
    return <PortalShell org={null}><EmptyState title={t('notFound.title')} text={t('notFound.text')} /></PortalShell>;
  }

  if (!user) {
    return (
      <ClientPortalSignInLayout
        org={org}
        phone={phone}
        setPhone={setPhone}
        phoneCountry={phoneCountry}
        setPhoneCountry={setPhoneCountry}
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
    return <PortalShell org={org}><LoadingState label={t('loading.opening')} /></PortalShell>;
  }

  if (!access) {
    return (
      <PortalShell org={org}>
        <EmptyState
          title={t('noMatch.title')}
          text={t('noMatch.text')}
        />
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => signOut(auth)}>{t('noMatch.tryAnother')}</Button>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell org={org}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{t('header.welcome')}</p>
          <h2 className="text-2xl font-semibold">{data.client?.name || t('header.clientFallback')}</h2>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">
              <LogOut className="me-2 h-4 w-4" />
              {t('header.signOut')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('header.logoutTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('header.logoutDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => signOut(auth)}>{t('header.logoutConfirm')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">{t('tabs.plan')}</TabsTrigger>
          <TabsTrigger value="book">{t('tabs.book')}</TabsTrigger>
          <TabsTrigger value="history">{t('tabs.visits')}</TabsTrigger>
          <TabsTrigger value="billing">{t('tabs.billing')}</TabsTrigger>
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
                      {pkg?.name || t('plan.packageFallback')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{pkg?.description || t('plan.activePackage')}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span>{t('plan.sessionsRemaining')}</span>
                      <Badge>{purchase.sessions_remaining ?? 0}</Badge>
                    </div>
                    {purchase.expiry_date && (
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('plan.expires')}</span>
                        <span>{formatDate(purchase.expiry_date)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {data.purchases.length === 0 && <EmptyState title={t('plan.emptyTitle')} text={t('plan.emptyText')} />}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                {t('products.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {data.products.map((assignment) => {
                const product = assignment.product_id ? data.productCatalog[assignment.product_id] : null;
                return (
                  <div key={assignment.id} className="rounded-md border p-3">
                    <div className="font-medium">{product?.name || t('products.fallback')}</div>
                    <div className="text-sm text-muted-foreground">{t('products.quantity', { count: assignment.quantity ?? 1 })}</div>
                  </div>
                );
              })}
              {data.products.length === 0 && <p className="text-sm text-muted-foreground">{t('products.empty')}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="book">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                {t('book.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateRequest} className="grid gap-4 md:grid-cols-2">
                <Field label={t('book.package')}>
                  <Select
                    value={requestForm.purchaseId}
                    onValueChange={(value) => setRequestForm((prev) => ({ ...prev, purchaseId: value, treatmentId: '' }))}
                  >
                    <SelectTrigger><SelectValue placeholder={t('book.choosePackage')} /></SelectTrigger>
                    <SelectContent>
                      {data.purchases.map((purchase) => (
                        <SelectItem key={purchase.id} value={purchase.id}>
                          {purchase.package_id ? data.packages[purchase.package_id]?.name : t('plan.packageFallback')} {t('book.sessionsLeft', { count: purchase.sessions_remaining ?? 0 })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('book.treatment')}>
                  <Select
                    value={requestForm.treatmentId}
                    onValueChange={(value) => setRequestForm((prev) => ({ ...prev, treatmentId: value }))}
                  >
                    <SelectTrigger><SelectValue placeholder={t('book.chooseTreatment')} /></SelectTrigger>
                    <SelectContent>
                      {availableTreatments.map((treatment) => (
                        <SelectItem key={treatment.id} value={treatment.id}>
                          {treatment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {Object.values(data.addons).length > 0 && (
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <Label>{t('book.addons')}</Label>
                      <span className="text-xs text-muted-foreground">{t('book.addonsHint')}</span>
                    </div>
                    <div className="space-y-1 border rounded-md p-2 max-h-44 overflow-y-auto">
                      {Object.values(data.addons).map((addon) => {
                        const isSelected = requestForm.addonIds.includes(addon.id);
                        const capReached = requestForm.addonIds.length >= 1;
                        const disabled = capReached && !isSelected;
                        return (
                          <label
                            key={addon.id}
                            className={`flex items-center justify-between gap-2 rounded p-1.5 text-sm ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-accent'}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={disabled}
                                onChange={() => {
                                  setRequestForm((prev) => ({
                                    ...prev,
                                    addonIds: isSelected
                                      ? prev.addonIds.filter((id) => id !== addon.id)
                                      : [...prev.addonIds, addon.id],
                                  }));
                                }}
                                className="h-4 w-4 rounded border-input"
                              />
                              <span className="truncate">{addon.name}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                              <span className="ltr-inline">+{formatPrice(addon.price, org.currency || 'USD')}</span>
                              {addon.duration_minutes && addon.duration_minutes > 0 && (
                                <span>· {t('book.addonDuration', { minutes: addon.duration_minutes })}</span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Preferred slot — date strip + time grid (replaces HTML date/time inputs) */}
                <div className="md:col-span-2 space-y-3">
                  <Label className="text-sm">{t('book.pickDate')}</Label>
                  {!requestForm.treatmentId ? (
                    <p className="text-sm text-muted-foreground">{t('book.chooseTreatmentFirst')}</p>
                  ) : (
                    <DateStrip
                      dates={dateWindow}
                      selectedDate={requestForm.date || null}
                      onSelect={(iso) => setRequestForm((prev) => ({ ...prev, date: iso, time: '' }))}
                      isDayEnabled={(iso) => (slotsByDate[iso]?.length ?? 0) > 0}
                      loading={loadingSlots}
                    />
                  )}
                  {requestForm.date && (
                    <>
                      <Label className="text-sm">{t('book.pickTime')}</Label>
                      <TimeGrid
                        slots={slotsByDate[requestForm.date] ?? []}
                        selectedTime={requestForm.time || null}
                        onSelect={(t) => setRequestForm((prev) => ({ ...prev, time: t }))}
                      />
                    </>
                  )}
                </div>

                {/* Backup slot — optional, toggled in */}
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={showBackup}
                      onCheckedChange={(v) => {
                        setShowBackup(v);
                        if (!v) {
                          setRequestForm((prev) => ({ ...prev, altDate: '', altTime: '' }));
                        }
                      }}
                      aria-label={t('book.backupAria')}
                    />
                    <Label className="text-sm m-0">{t('book.backupLabel')}</Label>
                  </div>
                  {showBackup && requestForm.treatmentId && (
                    <>
                      <DateStrip
                        dates={dateWindow}
                        selectedDate={requestForm.altDate || null}
                        onSelect={(iso) => setRequestForm((prev) => ({ ...prev, altDate: iso, altTime: '' }))}
                        isDayEnabled={(iso) => (slotsByDate[iso]?.length ?? 0) > 0}
                        loading={loadingSlots}
                      />
                      {requestForm.altDate && (
                        <TimeGrid
                          slots={slotsByDate[requestForm.altDate] ?? []}
                          selectedTime={requestForm.altTime || null}
                          onSelect={(t) => setRequestForm((prev) => ({ ...prev, altTime: t }))}
                        />
                      )}
                    </>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="request-notes">{t('book.notes')}</Label>
                  <Textarea id="request-notes" value={requestForm.notes} onChange={(event) => setRequestForm((prev) => ({ ...prev, notes: event.target.value }))} />
                </div>
                <Button className="md:col-span-2" disabled={submittingRequest}>
                  {submittingRequest && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t('book.sendRequest')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-3">
            {data.bookingRequests.map((request) => (
              <Card key={request.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{request.treatment_name || t('requests.fallback')}</div>
                    <div className="text-sm text-muted-foreground">
                      {t('requests.dateAt', { date: formatDate(request.preferred_slot?.date), time: request.preferred_slot?.time ?? '' })}
                    </div>
                    {request.staff_response && <div className="text-sm text-muted-foreground">{request.staff_response}</div>}
                  </div>
                  <Badge variant={statusVariant(request.status)}>{statusLabel(request.status)}</Badge>
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
                    <div className="font-medium">{appointment.treatment_name || t('visits.fallback')}</div>
                    <div className="text-sm text-muted-foreground">
                      {t('requests.dateAt', { date: formatDate(appointment.appointment_date), time: appointment.appointment_time ?? '' })}
                    </div>
                  </div>
                  <Badge variant={statusVariant(appointment.status)}>{statusLabel(appointment.status)}</Badge>
                </CardContent>
              </Card>
            ))}
            {data.appointments.length === 0 && <EmptyState title={t('visits.emptyTitle')} text={t('visits.emptyText')} />}
          </div>
        </TabsContent>

        <TabsContent value="billing">
          <div className="grid gap-3">
            {data.invoices.map((invoice) => (
              <Card key={invoice.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium ltr-inline">{invoice.invoice_number || t('billing.fallback')}</div>
                    <div className="text-sm text-muted-foreground">{formatMoney(invoice.total_cents, invoice.currency)}</div>
                  </div>
                  {invoice.pdf_url ? (
                    <Button asChild variant="outline">
                      <a href={invoice.pdf_url} target="_blank" rel="noreferrer">
                        <FileText className="me-2 h-4 w-4" />
                        {t('billing.pdf')}
                      </a>
                    </Button>
                  ) : (
                    <Badge variant="secondary">{t('billing.issued')}</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
            {data.invoices.length === 0 && <EmptyState title={t('billing.emptyTitle')} text={t('billing.emptyText')} />}
          </div>
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
}

function PortalShell({ org, children }: { org: PortalOrg | null; children: React.ReactNode }) {
  const { t } = useTranslation('portal');
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            {org?.logo_url ? <img src={org.logo_url} alt="" className="h-10 w-10 rounded-md object-cover" /> : <CalendarCheck className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{org?.name || t('shell.title')}</h1>
            <p className="truncate text-sm text-muted-foreground">{org?.address || t('shell.subtitle')}</p>
          </div>
          <div className="ms-auto shrink-0">
            <LanguageSwitcher variant="full" persist={false} />
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
