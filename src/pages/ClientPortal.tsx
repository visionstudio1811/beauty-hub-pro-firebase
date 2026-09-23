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
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  Crown,
  ExternalLink,
  FileText,
  Gift,
  Loader2,
  LogOut,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
} from 'lucide-react';
import { LoginFloralCorner } from '@/components/auth/LoginFloralCorner';
import { Checkbox } from '@/components/ui/checkbox';
import { auth, db, functions } from '@/lib/firebase';
import { LOGIN_HERO_URL } from '@/lib/loginBranding';
import { validateDate } from '@/lib/timeUtils';
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
  login_branding?: {
    hero_url: string | null;
    title: string | null;
    subtitle: string | null;
    accent: string | null;
  } | null;
  payments?: { enabled: boolean; provider: 'stripe' | 'square' | null } | null;
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
  club_credit_balance?: number;
  club_credit_currency?: string;
  club_membership_status?: string;
};

type SessionSlot = {
  treatment_id: string;
  remaining: number;
  total: number;
};

type PurchaseRecord = {
  id: string;
  client_id?: string;
  package_id?: string;
  sessions_remaining?: number;
  sessions_by_treatment?: SessionSlot[];
  purchase_date?: string;
  expiry_date?: string;
  payment_status?: string;
};

type PackageRecord = {
  id: string;
  name: string;
  description?: string;
  treatments?: string[];
  total_sessions?: number;
  benefits?: string[];
};

type RenewalRequestStatus =
  | 'pending'
  | 'contacted'
  | 'dismissed'
  | 'pending_payment'
  | 'paid'
  | 'payment_failed'
  | 'cancelled';

type RenewalRequestRecord = {
  id: string;
  purchase_id?: string;
  package_name?: string;
  status?: RenewalRequestStatus;
  created_at?: Parameters<typeof validateDate>[0];
  new_purchase_id?: string;
};

type TreatmentRecord = {
  id: string;
  name: string;
  duration?: number;
  price?: number;
  member_price?: number;
  is_active?: boolean;
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
  treatment_id?: string;
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

type FirestoreDateInput = Parameters<typeof validateDate>[0];

type MembershipPlanRecord = {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  monthly_credit?: number;
  benefits?: string[];
  is_active?: boolean;
};

type MembershipStatus = 'incomplete' | 'active' | 'past_due' | 'cancelled';

type MembershipRecord = {
  id: string;
  plan_id?: string;
  plan_name?: string;
  price?: number;
  currency?: string;
  monthly_credit?: number;
  status?: MembershipStatus;
  current_period_end?: FirestoreDateInput | null;
  cancel_at_period_end?: boolean;
  credit_expires_at?: FirestoreDateInput | null;
  started_at?: FirestoreDateInput | null;
};

type CreditLedgerEntry = {
  id: string;
  type?: 'credit_add' | 'credit_spend' | 'adjustment' | 'refund' | 'expiry';
  amount?: number;
  balance_after?: number;
  currency?: string;
  description?: string;
  created_at?: FirestoreDateInput;
};

type PortalOfferRecord = {
  id: string;
  title?: string;
  body?: string;
  image_url?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  audience?: 'all' | 'members' | 'low_sessions';
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

type PortalData = {
  client: ClientRecord | null;
  purchases: PurchaseRecord[];
  pastPurchases: PurchaseRecord[];
  packages: Record<string, PackageRecord>;
  treatments: Record<string, TreatmentRecord>;
  addons: Record<string, AddonRecord>;
  products: ProductAssignment[];
  productCatalog: Record<string, ProductRecord>;
  invoices: InvoiceRecord[];
  appointments: AppointmentRecord[];
  bookingRequests: BookingRequestRecord[];
  renewalRequests: RenewalRequestRecord[];
  membershipPlans: MembershipPlanRecord[];
  memberships: MembershipRecord[];
  creditLedger: CreditLedgerEntry[];
  offers: PortalOfferRecord[];
  memberPriceTreatments: TreatmentRecord[];
};

const emptyData: PortalData = {
  client: null,
  purchases: [],
  pastPurchases: [],
  packages: {},
  treatments: {},
  addons: {},
  products: [],
  productCatalog: {},
  invoices: [],
  appointments: [],
  bookingRequests: [],
  renewalRequests: [],
  membershipPlans: [],
  memberships: [],
  creditLedger: [],
  offers: [],
  memberPriceTreatments: [],
};

type FeedbackFormState = {
  rating: number;
  recommend: number | null;
  enjoyed: string;
  improve: string;
  appointmentId: string;
  anonymous: boolean;
};

const EMPTY_FEEDBACK: FeedbackFormState = {
  rating: 0,
  recommend: null,
  enjoyed: '',
  improve: '',
  appointmentId: '',
  anonymous: false,
};

type FeedbackPayload = {
  organizationId: string;
  rating: number;
  recommend: number | null;
  enjoyed: string;
  improve: string;
  treatmentId: string | null;
  appointmentId: string | null;
  anonymous: boolean;
};

const FEEDBACK_MAX_CHARS = 1000;
const STAR_SCALE = [1, 2, 3, 4, 5];
const RECOMMEND_SCALE = Array.from({ length: 11 }, (_, index) => index);
// Radix Select rejects empty-string item values, so "no specific visit" needs a sentinel.
const NO_VISIT = '__none__';
const NON_VISIT_STATUSES = new Set(['cancelled', 'no_show', 'rejected']);

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function appointmentSortKey(appointment: AppointmentRecord) {
  return `${appointment.appointment_date ?? ''}${appointment.appointment_time ?? ''}`;
}

const UPCOMING_APPOINTMENT_STATUSES = new Set(['scheduled', 'confirmed']);

// A request in one of these states hides the Renew button for its purchase.
const BLOCKING_RENEWAL_STATUSES = new Set<string>(['pending', 'pending_payment', 'paid']);

function renewalStateKey(status?: string): 'requested' | 'awaitingPayment' | 'renewed' | null {
  if (status === 'pending' || status === 'contacted') return 'requested';
  if (status === 'pending_payment') return 'awaitingPayment';
  if (status === 'paid') return 'renewed';
  return null;
}

function isRenewalEligible(purchase: PurchaseRecord, pkg: PackageRecord | null | undefined, isPast: boolean) {
  if (isPast) return true;
  if (purchase.expiry_date && purchase.expiry_date < isoDay(new Date())) return true;
  const total = pkg?.total_sessions ?? 0;
  const remaining = purchase.sessions_remaining ?? 0;
  if (total > 0 && remaining / total <= 0.2) return true;
  return remaining <= 2;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Inline style for the primary sign-in buttons when the org sets a login accent colour. */
function accentButtonStyle(accent?: string | null): React.CSSProperties | undefined {
  const hex = accent?.trim();
  if (!hex || !HEX_COLOR.test(hex)) return undefined;
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { backgroundColor: full, borderColor: full, color: luminance > 0.6 ? '#111111' : '#ffffff' };
}

function isHttpUrl(value?: string | null): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

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

/** Firestore Timestamp / Date / ISO → localized date, '' when missing or invalid. */
function formatTimestampDate(value: FirestoreDateInput | null | undefined) {
  const date = validateDate(value ?? null);
  return date ? date.toLocaleDateString(localeFor(i18n.language)) : '';
}

function formatSignedPrice(amount: number, currency: string) {
  return `${amount < 0 ? '−' : '+'}${formatPrice(Math.abs(amount), currency)}`;
}

function ledgerTypeLabel(type?: string) {
  if (!type) return '';
  return i18n.t(`portal:club.ledgerType.${type}`, { defaultValue: type });
}

function cleanBenefits(benefits?: unknown[]): string[] {
  return (benefits ?? []).filter((b): b is string => typeof b === 'string' && b.trim() !== '');
}

const MEMBERSHIP_PRIORITY: Record<MembershipStatus, number> = { active: 0, past_due: 1, cancelled: 2, incomplete: 3 };

/** The membership the portal talks about: a live one first, otherwise the most recently started. */
function pickCurrentMembership(memberships: MembershipRecord[]): MembershipRecord | null {
  const sorted = [...memberships].sort((a, b) => {
    const priorityA = MEMBERSHIP_PRIORITY[a.status ?? 'incomplete'] ?? 9;
    const priorityB = MEMBERSHIP_PRIORITY[b.status ?? 'incomplete'] ?? 9;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return (validateDate(b.started_at ?? null)?.getTime() ?? 0) - (validateDate(a.started_at ?? null)?.getTime() ?? 0);
  });
  return sorted[0] ?? null;
}

/** Only http(s), mailto:, tel: and same-origin paths are rendered as offer CTAs (never javascript:). */
function safeOfferHref(value?: string | null): { href: string; external: boolean } | null {
  const url = value?.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return { href: url, external: true };
  if (/^(mailto:|tel:)/i.test(url) || url.startsWith('/')) return { href: url, external: false };
  return null;
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

  const branding = org.login_branding ?? null;
  const heroUrl = isHttpUrl(branding?.hero_url) ? branding.hero_url.trim() : LOGIN_HERO_URL;
  const heroTitle = branding?.title?.trim() || t('signIn.welcomeBack');
  const heroSubtitle = branding?.subtitle?.trim() || t('signIn.heroText');
  const accentStyle = accentButtonStyle(branding?.accent);

  const heroStyle = {
    backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.28) 40%, rgba(0,0,0,0.55) 100%), url(${heroUrl})`,
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
            <h2 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{heroTitle}</h2>
            <p className="font-sans text-sm leading-relaxed text-white/85">
              {heroSubtitle}
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
                  className={cn(
                    'h-12 w-full rounded-lg bg-foreground text-base font-medium text-background hover:bg-foreground/90',
                    accentStyle && 'hover:opacity-90',
                  )}
                  style={accentStyle}
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
                        className={cn(
                          'h-12 shrink-0 rounded-lg bg-foreground px-6 text-background hover:bg-foreground/90',
                          accentStyle && 'hover:opacity-90',
                        )}
                        style={accentStyle}
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
  const [activeTab, setActiveTab] = useState('overview');
  const [renewTarget, setRenewTarget] = useState<{ purchase: PurchaseRecord; pkg: PackageRecord | null } | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [joinTarget, setJoinTarget] = useState<MembershipPlanRecord | null>(null);
  const [joining, setJoining] = useState(false);
  const [cancelMembershipOpen, setCancelMembershipOpen] = useState(false);
  const [cancellingMembership, setCancellingMembership] = useState(false);
  const [openingBillingPortal, setOpeningBillingPortal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState<FeedbackFormState>(EMPTY_FEEDBACK);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const packagesSectionRef = useRef<HTMLDivElement | null>(null);
  const urlParamsHandledRef = useRef(false);
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

  const orgName = org?.name ?? '';
  useEffect(() => {
    if (!orgName) return;
    const previousTitle = document.title;
    document.title = orgName;
    return () => {
      document.title = previousTitle;
    };
  }, [orgName]);

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
        const optional = <T,>(label: string, promise: Promise<T>) =>
          promise.catch((error: unknown) => {
            console.error(`Failed to load ${label}`, error);
            return null;
          });
        const [
          purchasesSnap,
          pastPurchasesSnap,
          productsSnap,
          invoicesSnap,
          appointmentsSnap,
          requestsSnap,
          addonsSnap,
          renewalsSnap,
          plansSnap,
          membershipsSnap,
          ledgerSnap,
          offersSnap,
          catalogSnap,
        ] = await Promise.all([
          getDocs(query(collection(orgRef, 'purchases'), where('client_id', '==', access.client_id), where('payment_status', '==', 'active'))),
          getDocs(query(collection(orgRef, 'purchases'), where('client_id', '==', access.client_id), where('payment_status', 'in', ['completed', 'expired']))),
          getDocs(query(collection(orgRef, 'productAssignments'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'invoices'), where('client_id', '==', access.client_id), where('status', '==', 'issued'))),
          getDocs(query(collection(orgRef, 'appointments'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'bookingRequests'), where('client_id', '==', access.client_id))),
          getDocs(query(collection(orgRef, 'addons'), where('is_active', '==', true))),
          // Renewal state is decorative; a rules/index hiccup here must not take down the whole portal.
          getDocs(query(collection(orgRef, 'renewalRequests'), where('client_id', '==', access.client_id))).catch((error) => {
            console.error('Failed to load renewal requests', error);
            return null;
          }),
          // Club, offers and the member price list are additive — same policy as renewals.
          optional('membership plans', getDocs(query(collection(orgRef, 'membershipPlans'), where('is_active', '==', true)))),
          optional('memberships', getDocs(query(collection(orgRef, 'memberships'), where('client_id', '==', access.client_id)))),
          optional('credit ledger', getDocs(query(collection(orgRef, 'creditLedger'), where('client_id', '==', access.client_id)))),
          optional('portal offers', getDocs(query(collection(orgRef, 'portalOffers'), where('is_active', '==', true)))),
          optional('treatment catalog', getDocs(query(collection(orgRef, 'treatments'), where('is_active', '==', true)))),
        ]);

        const purchases = purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseRecord));
        const pastPurchases = pastPurchasesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as PurchaseRecord))
          .sort((a, b) => `${b.purchase_date ?? ''}${b.expiry_date ?? ''}`.localeCompare(`${a.purchase_date ?? ''}${a.expiry_date ?? ''}`));
        const packageIds = Array.from(new Set([...purchases, ...pastPurchases].map((p) => p.package_id).filter(Boolean) as string[]));
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

        const renewalRequests = (renewalsSnap?.docs ?? [])
          .map((d) => ({ id: d.id, ...d.data() } as RenewalRequestRecord))
          .sort((a, b) => (validateDate(b.created_at)?.getTime() ?? 0) - (validateDate(a.created_at)?.getTime() ?? 0));

        const membershipPlans = (plansSnap?.docs ?? [])
          .map((d) => ({ id: d.id, ...d.data() } as MembershipPlanRecord))
          .filter((plan) => plan.is_active !== false)
          .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
        const memberships = (membershipsSnap?.docs ?? []).map((d) => ({ id: d.id, ...d.data() } as MembershipRecord));
        const creditLedger = (ledgerSnap?.docs ?? [])
          .map((d) => ({ id: d.id, ...d.data() } as CreditLedgerEntry))
          .sort((a, b) => (validateDate(b.created_at)?.getTime() ?? 0) - (validateDate(a.created_at)?.getTime() ?? 0));
        const offers = (offersSnap?.docs ?? []).map((d) => ({ id: d.id, ...d.data() } as PortalOfferRecord));
        const memberPriceTreatments = (catalogSnap?.docs ?? [])
          .map((d) => ({ id: d.id, ...d.data() } as TreatmentRecord))
          .filter((treatment) => typeof treatment.member_price === 'number' && treatment.member_price >= 0)
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

        setData({
          client: clientSnap.exists() ? { id: clientSnap.id, ...clientSnap.data() } as ClientRecord : null,
          purchases,
          pastPurchases,
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
          renewalRequests,
          membershipPlans,
          memberships,
          creditLedger,
          offers,
          memberPriceTreatments,
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

  const upcomingAppointments = useMemo(() => {
    const today = isoDay(new Date());
    return data.appointments
      .filter((a) => UPCOMING_APPOINTMENT_STATUSES.has(a.status ?? '') && (a.appointment_date ?? '') >= today)
      .sort((a, b) => appointmentSortKey(a).localeCompare(appointmentSortKey(b)));
  }, [data.appointments]);

  const pastAppointments = useMemo(() => {
    const upcomingIds = new Set(upcomingAppointments.map((a) => a.id));
    return data.appointments
      .filter((a) => !upcomingIds.has(a.id))
      .sort((a, b) => appointmentSortKey(b).localeCompare(appointmentSortKey(a)));
  }, [data.appointments, upcomingAppointments]);

  const nextAppointment = upcomingAppointments[0] ?? null;

  // Latest displayable renewal request per purchase (requests arrive sorted by created_at desc).
  const renewalByPurchase = useMemo(() => {
    const map = new Map<string, RenewalRequestRecord>();
    for (const request of data.renewalRequests) {
      if (!request.purchase_id || map.has(request.purchase_id)) continue;
      if (!renewalStateKey(request.status)) continue;
      map.set(request.purchase_id, request);
    }
    return map;
  }, [data.renewalRequests]);

  const renewalBlocked = (purchaseId: string) =>
    data.renewalRequests.some((r) => r.purchase_id === purchaseId && BLOCKING_RENEWAL_STATUSES.has(r.status ?? ''));

  const clubEnabled = Boolean(org?.payments?.enabled && org?.payments?.provider === 'stripe');
  const clubAvailable = clubEnabled && data.membershipPlans.length > 0;
  const currentMembership = useMemo(() => pickCurrentMembership(data.memberships), [data.memberships]);
  const membershipStatus = currentMembership?.status ?? null;
  const isMember = membershipStatus === 'active' || membershipStatus === 'past_due';
  const showClubTab = data.membershipPlans.length > 0 || (currentMembership !== null && membershipStatus !== 'incomplete');
  const orgCurrency = org?.currency || 'USD';
  const clubCurrency = data.client?.club_credit_currency || currentMembership?.currency || orgCurrency;
  const clubCreditBalance = data.client?.club_credit_balance ?? 0;
  const currentPlanId = currentMembership?.plan_id ?? null;
  const currentPlan = currentPlanId ? data.membershipPlans.find((plan) => plan.id === currentPlanId) ?? null : null;
  const currentPlanBenefits = cleanBenefits(currentPlan?.benefits);

  const visibleOffers = useMemo(() => {
    const today = isoDay(new Date());
    const member = data.client?.club_membership_status === 'active';
    const lowSessions = data.purchases.some((purchase) => (purchase.sessions_remaining ?? 0) <= 2);
    return data.offers
      .filter((offer) => offer.is_active !== false)
      .filter((offer) => !offer.starts_at || offer.starts_at <= today)
      .filter((offer) => !offer.ends_at || offer.ends_at >= today)
      .filter((offer) => {
        if (offer.audience === 'members') return member;
        if (offer.audience === 'low_sessions') return lowSessions;
        return true;
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [data.offers, data.purchases, data.client?.club_membership_status]);

  const feedbackVisits = useMemo(
    () => pastAppointments.filter((appointment) => !NON_VISIT_STATUSES.has(appointment.status ?? '')).slice(0, 20),
    [pastAppointments],
  );
  const selectedFeedbackVisit = feedbackVisits.find((visit) => visit.id === feedbackForm.appointmentId) ?? null;

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

  const handleConfirmRenew = async () => {
    if (!org?.id || !renewTarget) return;
    setRenewing(true);
    try {
      if (org.payments?.enabled) {
        const createCheckout = httpsCallable<
          { organizationId: string; purchaseId: string },
          { url: string; renewalRequestId: string }
        >(functions, 'createRenewalCheckout');
        const result = await createCheckout({ organizationId: org.id, purchaseId: renewTarget.purchase.id });
        window.location.assign(result.data.url);
        return;
      }
      const requestRenewal = httpsCallable<
        { organizationId: string; purchaseId: string; notes?: string },
        { renewalRequestId: string }
      >(functions, 'requestPackageRenewal');
      await requestRenewal({ organizationId: org.id, purchaseId: renewTarget.purchase.id });
      toast({ title: t('renew.requestSentTitle'), description: t('renew.requestSentText') });
      setRenewTarget(null);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast({ title: t('renew.failedTitle'), description: getErrorMessage(error, t('renew.failedText')), variant: 'destructive' });
    } finally {
      setRenewing(false);
    }
  };

  const handleConfirmJoin = async () => {
    if (!org?.id || !joinTarget) return;
    setJoining(true);
    try {
      const createCheckout = httpsCallable<
        { organizationId: string; planId: string },
        { url: string; membershipId: string }
      >(functions, 'createMembershipCheckout');
      const result = await createCheckout({ organizationId: org.id, planId: joinTarget.id });
      window.location.assign(result.data.url);
    } catch (error) {
      console.error(error);
      toast({ title: t('club.joinFailedTitle'), description: getErrorMessage(error, t('club.joinFailedText')), variant: 'destructive' });
    } finally {
      setJoining(false);
    }
  };

  const handleManageBilling = async () => {
    if (!org?.id) return;
    setOpeningBillingPortal(true);
    try {
      const createSession = httpsCallable<{ organizationId: string }, { url: string }>(functions, 'createClubBillingPortalSession');
      const result = await createSession({ organizationId: org.id });
      window.location.assign(result.data.url);
    } catch (error) {
      console.error(error);
      toast({ title: t('club.billingFailedTitle'), description: getErrorMessage(error, t('club.billingFailedText')), variant: 'destructive' });
    } finally {
      setOpeningBillingPortal(false);
    }
  };

  const handleConfirmCancelMembership = async () => {
    if (!org?.id || !currentMembership) return;
    setCancellingMembership(true);
    try {
      const cancelMembership = httpsCallable<
        { organizationId: string; membershipId: string },
        { success: boolean; cancel_at_period_end: boolean }
      >(functions, 'cancelClubMembership');
      await cancelMembership({ organizationId: org.id, membershipId: currentMembership.id });
      toast({ title: t('club.cancelledTitle'), description: t('club.cancelledToastText') });
      setCancelMembershipOpen(false);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast({ title: t('club.cancelFailedTitle'), description: getErrorMessage(error, t('club.cancelFailedText')), variant: 'destructive' });
    } finally {
      setCancellingMembership(false);
    }
  };

  const handleSubmitFeedback = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!org?.id) return;
    if (feedbackForm.rating < 1 || feedbackForm.rating > 5) {
      toast({ title: t('feedback.ratingRequiredTitle'), description: t('feedback.ratingRequiredText'), variant: 'destructive' });
      return;
    }
    setSubmittingFeedback(true);
    try {
      const submitFeedback = httpsCallable<FeedbackPayload, { success: boolean }>(functions, 'submitClientFeedback');
      // Anonymous feedback never carries the visit: the appointment alone would identify her.
      const visit = feedbackForm.anonymous ? null : selectedFeedbackVisit;
      await submitFeedback({
        organizationId: org.id,
        rating: feedbackForm.rating,
        recommend: feedbackForm.recommend,
        enjoyed: feedbackForm.enjoyed.trim().slice(0, FEEDBACK_MAX_CHARS),
        improve: feedbackForm.improve.trim().slice(0, FEEDBACK_MAX_CHARS),
        treatmentId: visit?.treatment_id ?? null,
        appointmentId: visit?.id ?? null,
        anonymous: feedbackForm.anonymous,
      });
      setFeedbackSent(true);
      setFeedbackForm(EMPTY_FEEDBACK);
    } catch (error) {
      console.error(error);
      toast({ title: t('feedback.failedTitle'), description: getErrorMessage(error, t('feedback.failedText')), variant: 'destructive' });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Deep links: ?renew=1 focuses the packages area; ?checkout=success|cancel&rr=<id> is the
  // hosted-checkout return; ?club=success|cancel|return&m=<id> is the club checkout / billing
  // portal return; ?feedback=1 opens the feedback tab. Handled once the portal is rendered, then
  // stripped so a reload does not re-toast. The `lang` param (and anything else) is left untouched.
  const portalReady = Boolean(user && access && !linking && !loadingData);
  useEffect(() => {
    if (!portalReady || urlParamsHandledRef.current) return;
    urlParamsHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const handledKeys = ['renew', 'checkout', 'rr', 'club', 'm', 'feedback'];
    if (!handledKeys.some((key) => params.has(key))) return;
    const renew = params.get('renew');
    const checkout = params.get('checkout');
    const club = params.get('club');
    const feedback = params.get('feedback');

    if (checkout === 'success') {
      toast({ title: t('renew.checkoutSuccessTitle'), description: t('renew.checkoutSuccessText') });
      setRefreshKey((value) => value + 1);
    } else if (checkout === 'cancel') {
      toast({ title: t('renew.checkoutCancelTitle'), description: t('renew.checkoutCancelText') });
    }
    if (club === 'success') {
      toast({ title: t('club.welcomeTitle'), description: t('club.welcomeText') });
      setActiveTab('club');
      setRefreshKey((value) => value + 1);
    } else if (club === 'cancel') {
      toast({ title: t('club.checkoutCancelTitle'), description: t('club.checkoutCancelText') });
      setActiveTab('club');
    } else if (club === 'return') {
      setActiveTab('club');
      setRefreshKey((value) => value + 1);
    }
    if (feedback === '1') {
      setActiveTab('feedback');
    }
    if (renew === '1') {
      setActiveTab('overview');
      window.requestAnimationFrame(() => {
        const section = packagesSectionRef.current;
        if (!section) return;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        section.focus({ preventScroll: true });
      });
    }

    handledKeys.forEach((key) => params.delete(key));
    const search = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
    );
  }, [portalReady, toast, t]);

  // The Club trigger is conditional; never leave the tab strip with nothing selected.
  useEffect(() => {
    if (portalReady && activeTab === 'club' && !showClubTab) setActiveTab('overview');
  }, [portalReady, activeTab, showClubTab]);

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

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" />
            {t('nextAppointment.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nextAppointment ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-lg font-semibold">
                  {t('requests.dateAt', { date: formatDate(nextAppointment.appointment_date), time: nextAppointment.appointment_time ?? '' })}
                </div>
                <div className="text-sm text-muted-foreground">
                  {nextAppointment.treatment_name || t('visits.fallback')}
                  {nextAppointment.staff_name && <span> · {t('nextAppointment.with', { staff: nextAppointment.staff_name })}</span>}
                </div>
              </div>
              <Badge variant={statusVariant(nextAppointment.status)} className="self-start sm:self-auto">
                {statusLabel(nextAppointment.status)}
              </Badge>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{t('nextAppointment.empty')}</p>
              <Button onClick={() => setActiveTab('book')}>
                <Sparkles className="me-2 h-4 w-4" />
                {t('nextAppointment.bookNow')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap">
          <TabsTrigger value="overview" className="flex-1">{t('tabs.plan')}</TabsTrigger>
          <TabsTrigger value="book" className="flex-1">{t('tabs.book')}</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">{t('tabs.visits')}</TabsTrigger>
          <TabsTrigger value="billing" className="flex-1">{t('tabs.billing')}</TabsTrigger>
          {showClubTab && <TabsTrigger value="club" className="flex-1">{t('tabs.club')}</TabsTrigger>}
          <TabsTrigger value="feedback" className="flex-1">{t('tabs.feedback')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {visibleOffers.length > 0 && (
            <section className="space-y-3" aria-labelledby="portal-offers-heading">
              <h3 id="portal-offers-heading" className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                <Gift className="h-4 w-4" />
                {t('offers.title')}
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {visibleOffers.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} />
                ))}
              </div>
            </section>
          )}

          <div ref={packagesSectionRef} tabIndex={-1} className="grid gap-4 outline-none md:grid-cols-2">
            {data.purchases.map((purchase) => {
              const pkg = purchase.package_id ? data.packages[purchase.package_id] ?? null : null;
              const total = pkg?.total_sessions ?? 0;
              const remaining = purchase.sessions_remaining ?? 0;
              const used = Math.max(0, total - remaining);
              const benefits = (pkg?.benefits ?? []).filter((b): b is string => typeof b === 'string' && b.trim() !== '');
              const slots = purchase.sessions_by_treatment ?? [];
              const includedTreatments = pkg?.treatments ?? [];
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
                    {benefits.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('plan.whatsIncluded')}</p>
                        <ul className="list-disc space-y-0.5 ps-5 text-sm">
                          {benefits.map((benefit, index) => (
                            <li key={`${index}-${benefit}`}>{benefit}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {total > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <Badge>{t('plan.sessionsLeftOf', { remaining, total })}</Badge>
                        <span className="text-xs text-muted-foreground">{t('plan.sessionsUsed', { count: used })}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('plan.sessionsRemaining')}</span>
                        <Badge>{remaining}</Badge>
                      </div>
                    )}
                    {slots.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('plan.treatmentsIncluded')}</p>
                        <ul className="space-y-1 text-sm">
                          {slots.map((slot) => (
                            <li key={slot.treatment_id} className="flex items-center justify-between gap-2">
                              <span className="min-w-0 truncate">{data.treatments[slot.treatment_id]?.name ?? slot.treatment_id}</span>
                              <span className="shrink-0 text-muted-foreground">
                                {t('plan.slotRemaining', { remaining: slot.remaining ?? 0, total: slot.total ?? 0 })}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : includedTreatments.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('plan.treatmentsIncluded')}</p>
                        <ul className="list-disc space-y-0.5 ps-5 text-sm">
                          {includedTreatments.map((id) => (
                            <li key={id}>{data.treatments[id]?.name ?? id}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {purchase.expiry_date && (
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('plan.expires')}</span>
                        <span>{formatDate(purchase.expiry_date)}</span>
                      </div>
                    )}
                    <RenewalControls
                      request={renewalByPurchase.get(purchase.id) ?? null}
                      showButton={isRenewalEligible(purchase, pkg, false) && !renewalBlocked(purchase.id)}
                      onRenew={() => setRenewTarget({ purchase, pkg })}
                    />
                  </CardContent>
                </Card>
              );
            })}
            {data.purchases.length === 0 && <EmptyState title={t('plan.emptyTitle')} text={t('plan.emptyText')} />}
          </div>

          {data.pastPurchases.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  {t('pastPackages.title')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {data.pastPurchases.map((purchase) => {
                  const pkg = purchase.package_id ? data.packages[purchase.package_id] ?? null : null;
                  return (
                    <div key={purchase.id} className="space-y-2 rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 font-medium">{pkg?.name || t('plan.packageFallback')}</div>
                        <Badge variant={statusVariant(purchase.payment_status)} className="shrink-0">
                          {statusLabel(purchase.payment_status)}
                        </Badge>
                      </div>
                      <div className="space-y-0.5 text-sm text-muted-foreground">
                        {purchase.purchase_date && <div>{t('pastPackages.purchased', { date: formatDate(purchase.purchase_date) })}</div>}
                        {purchase.expiry_date && <div>{t('pastPackages.validUntil', { date: formatDate(purchase.expiry_date) })}</div>}
                      </div>
                      <RenewalControls
                        request={renewalByPurchase.get(purchase.id) ?? null}
                        showButton={!renewalBlocked(purchase.id)}
                        onRenew={() => setRenewTarget({ purchase, pkg })}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

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

        <TabsContent value="history" className="space-y-6">
          {data.appointments.length === 0 ? (
            <EmptyState title={t('visits.emptyTitle')} text={t('visits.emptyText')} />
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('visits.upcoming')}</h3>
                <div className="grid gap-3">
                  {upcomingAppointments.map((appointment) => (
                    <AppointmentRow key={appointment.id} appointment={appointment} />
                  ))}
                  {upcomingAppointments.length === 0 && <p className="text-sm text-muted-foreground">{t('visits.noUpcoming')}</p>}
                </div>
              </section>
              <section className="space-y-3">
                <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{t('visits.past')}</h3>
                <div className="grid gap-3">
                  {pastAppointments.map((appointment) => (
                    <AppointmentRow key={appointment.id} appointment={appointment} />
                  ))}
                  {pastAppointments.length === 0 && <p className="text-sm text-muted-foreground">{t('visits.noPast')}</p>}
                </div>
              </section>
            </>
          )}
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

        {showClubTab && (
          <TabsContent value="club" className="space-y-4">
            {isMember && currentMembership ? (
              <>
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Crown className="h-5 w-5" />
                      {t('club.title')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('club.availableCredit')}</p>
                      <p className="text-3xl font-semibold">
                        <span className="ltr-inline">{formatPrice(clubCreditBalance, clubCurrency)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{currentMembership.plan_name || currentPlan?.name || t('club.plan')}</span>
                      <Badge variant={membershipStatus === 'past_due' ? 'destructive' : 'default'}>
                        {t(`club.status.${currentMembership.status ?? 'active'}`)}
                      </Badge>
                    </div>
                    {membershipStatus === 'past_due' && (
                      <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          <div>
                            <div className="font-medium">{t('club.pastDueTitle')}</div>
                            <div className="text-muted-foreground">{t('club.pastDueText')}</div>
                          </div>
                        </div>
                        <Button size="sm" className="shrink-0" onClick={() => void handleManageBilling()} disabled={openingBillingPortal}>
                          {openingBillingPortal && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                          {t('club.manageBilling')}
                        </Button>
                      </div>
                    )}
                    {currentMembership.current_period_end && (
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span>{currentMembership.cancel_at_period_end ? t('club.endsOn') : t('club.nextBilling')}</span>
                        <span>{formatTimestampDate(currentMembership.current_period_end) || '—'}</span>
                      </div>
                    )}
                    {currentMembership.cancel_at_period_end && (
                      <p className="text-sm text-muted-foreground">{t('club.cancelsAtPeriodEnd')}</p>
                    )}
                    {currentPlanBenefits.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('club.benefits')}</p>
                        <ul className="list-disc space-y-0.5 ps-5 text-sm">
                          {currentPlanBenefits.map((benefit, index) => (
                            <li key={`${index}-${benefit}`}>{benefit}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button variant="outline" onClick={() => void handleManageBilling()} disabled={openingBillingPortal}>
                        {openingBillingPortal ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <CreditCard className="me-2 h-4 w-4" />}
                        {t('club.manageBilling')}
                      </Button>
                      {!currentMembership.cancel_at_period_end && (
                        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setCancelMembershipOpen(true)}>
                          {t('club.cancel')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <MemberPriceList treatments={data.memberPriceTreatments} currency={orgCurrency} />
                <CreditHistory entries={data.creditLedger} currency={clubCurrency} />
              </>
            ) : (
              <>
                {membershipStatus === 'cancelled' && currentMembership && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Crown className="h-5 w-5" />
                        {t('club.cancelledHeadline')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{currentMembership.plan_name || t('club.plan')}</span>
                        <Badge variant="outline">{t('club.status.cancelled')}</Badge>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('club.remainingCredit')}</p>
                        <p className="text-2xl font-semibold">
                          <span className="ltr-inline">{formatPrice(clubCreditBalance, clubCurrency)}</span>
                        </p>
                        {clubCreditBalance > 0 && formatTimestampDate(currentMembership.credit_expires_at) && (
                          <p className="text-sm text-muted-foreground">
                            {t('club.useCreditBy', { date: formatTimestampDate(currentMembership.credit_expires_at) })}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {clubAvailable ? (
                  <section className="space-y-3">
                    <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      {membershipStatus === 'cancelled' ? t('club.rejoin') : t('club.choosePlan')}
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {data.membershipPlans.map((plan) => (
                        <PlanCard key={plan.id} plan={plan} currency={orgCurrency} onJoin={() => setJoinTarget(plan)} />
                      ))}
                    </div>
                  </section>
                ) : (
                  <Card>
                    <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                      <Crown className="h-5 w-5 shrink-0" />
                      {t('club.unavailableText')}
                    </CardContent>
                  </Card>
                )}
                {membershipStatus === 'cancelled' && data.creditLedger.length > 0 && (
                  <CreditHistory entries={data.creditLedger} currency={clubCurrency} />
                )}
              </>
            )}
          </TabsContent>
        )}

        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {t('feedback.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {feedbackSent ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-primary" />
                  <div className="text-lg font-semibold">{t('feedback.thanksTitle')}</div>
                  <p className="max-w-md text-sm text-muted-foreground">{t('feedback.thanksText')}</p>
                  <Button variant="outline" onClick={() => setFeedbackSent(false)}>{t('feedback.sendAnother')}</Button>
                </div>
              ) : (
                <form onSubmit={handleSubmitFeedback} className="space-y-6">
                  <p className="text-sm text-muted-foreground">{t('feedback.intro')}</p>

                  <div className="space-y-2">
                    <Label>{t('feedback.rating')}</Label>
                    <div className="flex gap-1" role="radiogroup" aria-label={t('feedback.rating')}>
                      {STAR_SCALE.map((value) => {
                        const filled = value <= feedbackForm.rating;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={feedbackForm.rating === value}
                            aria-label={t('feedback.starAria', { stars: value })}
                            onClick={() => setFeedbackForm((prev) => ({ ...prev, rating: value }))}
                            className={cn(
                              'rounded-md p-1 transition-colors hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              filled ? 'text-amber-500' : 'text-muted-foreground/40',
                            )}
                          >
                            <Star className={cn('h-8 w-8', filled && 'fill-current')} />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('feedback.recommend')}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {RECOMMEND_SCALE.map((value) => {
                        const selected = feedbackForm.recommend === value;
                        return (
                          <Button
                            key={value}
                            type="button"
                            size="sm"
                            variant={selected ? 'default' : 'outline'}
                            aria-pressed={selected}
                            className="h-9 w-9 p-0 tabular-nums"
                            onClick={() => setFeedbackForm((prev) => ({ ...prev, recommend: prev.recommend === value ? null : value }))}
                          >
                            {value}
                          </Button>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t('feedback.notLikely')}</span>
                      <span>{t('feedback.veryLikely')}</span>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="feedback-enjoyed">{t('feedback.enjoyed')}</Label>
                      <Textarea
                        id="feedback-enjoyed"
                        rows={4}
                        maxLength={FEEDBACK_MAX_CHARS}
                        value={feedbackForm.enjoyed}
                        onChange={(event) => setFeedbackForm((prev) => ({ ...prev, enjoyed: event.target.value.slice(0, FEEDBACK_MAX_CHARS) }))}
                      />
                      <p className="text-end text-xs tabular-nums text-muted-foreground">
                        {t('feedback.charCount', { current: feedbackForm.enjoyed.length, max: FEEDBACK_MAX_CHARS })}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="feedback-improve">{t('feedback.improve')}</Label>
                      <Textarea
                        id="feedback-improve"
                        rows={4}
                        maxLength={FEEDBACK_MAX_CHARS}
                        value={feedbackForm.improve}
                        onChange={(event) => setFeedbackForm((prev) => ({ ...prev, improve: event.target.value.slice(0, FEEDBACK_MAX_CHARS) }))}
                      />
                      <p className="text-end text-xs tabular-nums text-muted-foreground">
                        {t('feedback.charCount', { current: feedbackForm.improve.length, max: FEEDBACK_MAX_CHARS })}
                      </p>
                    </div>
                  </div>

                  {!feedbackForm.anonymous && feedbackVisits.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t('feedback.visit')}</Label>
                      <Select
                        value={feedbackForm.appointmentId || NO_VISIT}
                        onValueChange={(value) => setFeedbackForm((prev) => ({ ...prev, appointmentId: value === NO_VISIT ? '' : value }))}
                      >
                        <SelectTrigger><SelectValue placeholder={t('feedback.anyVisit')} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_VISIT}>{t('feedback.anyVisit')}</SelectItem>
                          {feedbackVisits.map((visit) => (
                            <SelectItem key={visit.id} value={visit.id}>
                              {visit.treatment_name || t('visits.fallback')} · {formatDate(visit.appointment_date)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-start gap-3 rounded-md border p-3">
                    <Switch
                      id="feedback-anonymous"
                      checked={feedbackForm.anonymous}
                      onCheckedChange={(checked) =>
                        setFeedbackForm((prev) => ({ ...prev, anonymous: checked, appointmentId: checked ? '' : prev.appointmentId }))
                      }
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="feedback-anonymous" className="cursor-pointer">{t('feedback.anonymous')}</Label>
                      <p className="text-xs text-muted-foreground">{t('feedback.anonymousHint')}</p>
                    </div>
                  </div>

                  <Button type="submit" disabled={submittingFeedback}>
                    {submittingFeedback && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                    {t('feedback.submit')}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={renewTarget !== null} onOpenChange={(open) => { if (!open && !renewing) setRenewTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('renew.confirmTitle', { package: renewTarget?.pkg?.name || t('plan.packageFallback') })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {org.payments?.enabled ? t('renew.confirmCheckout') : t('renew.confirmRequest')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renewing}>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={renewing}
              onClick={(event) => {
                // Keep the dialog open while the callable runs; it closes itself on success.
                event.preventDefault();
                void handleConfirmRenew();
              }}
            >
              {renewing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {org.payments?.enabled ? t('renew.continueToPayment') : t('renew.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={joinTarget !== null} onOpenChange={(open) => { if (!open && !joining) setJoinTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('club.joinConfirmTitle', { plan: joinTarget?.name || t('club.plan') })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('club.joinConfirmText', { price: formatPrice(joinTarget?.price ?? 0, joinTarget?.currency || orgCurrency) })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={joining}>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={joining}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmJoin();
              }}
            >
              {joining && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('club.continueToPayment')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelMembershipOpen} onOpenChange={(open) => { if (!cancellingMembership) setCancelMembershipOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('club.cancelConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('club.cancelConfirmText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancellingMembership}>{t('club.keep')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancellingMembership}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmCancelMembership();
              }}
            >
              {cancellingMembership && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('club.cancelConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PortalShell>
  );
}

function OfferCard({ offer }: { offer: PortalOfferRecord }) {
  const { t } = useTranslation('portal');
  const link = safeOfferHref(offer.cta_url);
  const image = isHttpUrl(offer.image_url) ? offer.image_url.trim() : null;
  return (
    <Card className="overflow-hidden">
      {image && <img src={image} alt="" loading="lazy" className="h-40 w-full object-cover" />}
      <CardContent className="space-y-2 p-4">
        {offer.title && <div className="font-medium">{offer.title}</div>}
        {offer.body && <p className="whitespace-pre-line text-sm text-muted-foreground">{offer.body}</p>}
        {link && (
          <Button asChild size="sm" variant="outline">
            <a href={link.href} target={link.external ? '_blank' : undefined} rel={link.external ? 'noopener noreferrer' : undefined}>
              {offer.cta_label?.trim() || t('offers.learnMore')}
              {link.external && <ExternalLink className="ms-2 h-3.5 w-3.5" />}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function PlanCard({ plan, currency, onJoin }: { plan: MembershipPlanRecord; currency: string; onJoin: () => void }) {
  const { t } = useTranslation('portal');
  const planCurrency = plan.currency || currency;
  const benefits = cleanBenefits(plan.benefits);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Crown className="h-5 w-5" />
          {plan.name || t('club.plan')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold ltr-inline">{formatPrice(plan.price ?? 0, planCurrency)}</span>
          <span className="text-sm text-muted-foreground">{t('club.perMonth')}</span>
        </div>
        {(plan.monthly_credit ?? 0) > 0 && (
          <p className="text-sm font-medium">{t('club.monthlyCredit', { credit: formatPrice(plan.monthly_credit ?? 0, planCurrency) })}</p>
        )}
        {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
        {benefits.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('club.benefits')}</p>
            <ul className="list-disc space-y-0.5 ps-5 text-sm">
              {benefits.map((benefit, index) => (
                <li key={`${index}-${benefit}`}>{benefit}</li>
              ))}
            </ul>
          </div>
        )}
        <Button type="button" className="w-full" onClick={onJoin}>
          {t('club.join')}
        </Button>
      </CardContent>
    </Card>
  );
}

function MemberPriceList({ treatments, currency }: { treatments: TreatmentRecord[]; currency: string }) {
  const { t } = useTranslation('portal');
  if (treatments.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          {t('club.memberPrices')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {treatments.map((treatment) => {
            const memberPrice = treatment.member_price ?? 0;
            const regular = typeof treatment.price === 'number' && treatment.price > memberPrice ? treatment.price : null;
            return (
              <li key={treatment.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{treatment.name}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  {regular !== null && (
                    <span className="text-muted-foreground line-through ltr-inline">{formatPrice(regular, currency)}</span>
                  )}
                  <span className="font-semibold ltr-inline">{formatPrice(memberPrice, currency)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function CreditHistory({ entries, currency }: { entries: CreditLedgerEntry[]; currency: string }) {
  const { t } = useTranslation('portal');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t('club.history')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('club.historyEmpty')}</p>
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => {
              const amount = entry.amount ?? 0;
              const entryCurrency = entry.currency || currency;
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{entry.description || ledgerTypeLabel(entry.type)}</div>
                    <div className="text-xs text-muted-foreground">{formatTimestampDate(entry.created_at) || '—'}</div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div className={cn('font-semibold ltr-inline', amount < 0 && 'text-muted-foreground')}>
                      {formatSignedPrice(amount, entryCurrency)}
                    </div>
                    {typeof entry.balance_after === 'number' && (
                      <div className="text-xs text-muted-foreground">
                        {t('club.balanceAfter', { balance: formatPrice(entry.balance_after, entryCurrency) })}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AppointmentRow({ appointment }: { appointment: AppointmentRecord }) {
  const { t } = useTranslation('portal');
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="font-medium">{appointment.treatment_name || t('visits.fallback')}</div>
          <div className="text-sm text-muted-foreground">
            {t('requests.dateAt', { date: formatDate(appointment.appointment_date), time: appointment.appointment_time ?? '' })}
            {appointment.staff_name && <span> · {t('nextAppointment.with', { staff: appointment.staff_name })}</span>}
          </div>
        </div>
        <Badge variant={statusVariant(appointment.status)} className="shrink-0">{statusLabel(appointment.status)}</Badge>
      </CardContent>
    </Card>
  );
}

function RenewalControls({
  request,
  showButton,
  onRenew,
}: {
  request: RenewalRequestRecord | null;
  showButton: boolean;
  onRenew: () => void;
}) {
  const { t } = useTranslation('portal');
  const stateKey = renewalStateKey(request?.status);
  if (!stateKey && !showButton) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      {stateKey && <Badge variant="secondary">{t(`renew.state.${stateKey}`)}</Badge>}
      {showButton && (
        <Button type="button" size="sm" variant="outline" className="ms-auto" onClick={onRenew}>
          <RefreshCw className="me-2 h-4 w-4" />
          {t('renew.button')}
        </Button>
      )}
    </div>
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
