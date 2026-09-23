import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { localeFor } from '@/i18n';
import { httpsCallable } from 'firebase/functions';
import { collection, onSnapshot, query, where, type Timestamp } from 'firebase/firestore';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle, Loader2, Mail, Phone, RefreshCw, XCircle } from 'lucide-react';
import { db, functions } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getDateFnsLocale } from '@/i18n/dateLocale';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { validateDate } from '@/lib/timeUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

type RenewalStatus =
  | 'pending'
  | 'contacted'
  | 'dismissed'
  | 'pending_payment'
  | 'paid'
  | 'payment_failed'
  | 'cancelled';

type ReviewAction = 'contacted' | 'dismissed';

type PaymentProvider = 'stripe' | 'square';

type RenewalRequest = {
  id: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  purchase_id?: string;
  package_id?: string;
  package_name?: string;
  package_price?: number;
  currency?: string;
  sessions_remaining_at_request?: number;
  total_sessions_at_request?: number;
  expiry_date_at_request?: string | null;
  notes?: string;
  status?: RenewalStatus;
  source?: string;
  payment_provider?: PaymentProvider | null;
  paid_at?: Timestamp;
  payment?: { provider?: string; payment_id?: string; amount?: number; currency?: string };
  new_purchase_id?: string;
  created_at?: Timestamp;
  updated_at?: Timestamp;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: Timestamp;
};

const VISIBLE_STATUSES: RenewalStatus[] = ['pending', 'pending_payment', 'paid'];

const STATUS_BADGE: Partial<Record<RenewalStatus, { key: string; className: string }>> = {
  pending: {
    key: 'pending',
    className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  pending_payment: {
    key: 'pendingPayment',
    className: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  },
  paid: {
    key: 'paid',
    className: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
};

const TOAST_KEYS = {
  contacted: { title: 'renewalRequests.contactedTitle', description: 'renewalRequests.contactedDescription' },
  handled: { title: 'renewalRequests.handledTitle', description: 'renewalRequests.handledDescription' },
  dismissed: { title: 'renewalRequests.dismissedTitle', description: 'renewalRequests.dismissedDescription' },
} as const;

function createdMillis(request: RenewalRequest) {
  return validateDate(request.created_at)?.getTime() ?? 0;
}

function relativeTime(date: Date | null) {
  if (!date) return '';
  try {
    return formatDistanceToNow(date, { addSuffix: true, locale: getDateFnsLocale() });
  } catch {
    return '';
  }
}

function formatMoney(amount: number | undefined, currency: string | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '';
  const code = (currency ?? '').trim().toUpperCase();
  if (!code) return amount.toFixed(2);
  try {
    return new Intl.NumberFormat(localeFor(i18n.language), { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function providerLabel(provider: string | null | undefined) {
  if (provider === 'stripe' || provider === 'square') {
    return i18n.t(`appointments:renewalRequests.providers.${provider}`);
  }
  return '';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : i18n.t('appointments:renewalRequests.tryAgain');
}

export function RenewalRequestsPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation('appointments');
  const tRef = useRef(t);
  tRef.current = t;
  const [requests, setRequests] = useState<RenewalRequest[]>([]);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [pendingDismiss, setPendingDismiss] = useState<RenewalRequest | null>(null);

  const canReview = Boolean(profile?.role && ['admin', 'staff', 'reception'].includes(profile.role));
  const orgId = profile?.organizationId;

  useEffect(() => {
    if (!orgId || !canReview) {
      setRequests([]);
      return;
    }
    const q = query(
      collection(db, 'organizations', orgId, 'renewalRequests'),
      where('status', 'in', VISIBLE_STATUSES),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        // "Mark handled" on a paid request keeps status 'paid' (so the client
        // portal still shows "Renewed") and only stamps reviewed_at, so handled
        // rows must be dropped here rather than by the status filter.
        setRequests(
          snap.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as RenewalRequest))
            .filter((request) => !(request.status === 'paid' && request.reviewed_at))
            .sort((a, b) => createdMillis(b) - createdMillis(a)),
        );
      },
      (error) => {
        console.error(error);
        toast({ title: tRef.current('renewalRequests.loadFailed'), variant: 'destructive' });
      },
    );
    return () => unsubscribe();
  }, [canReview, orgId, toast]);

  const count = requests.length;
  const title = useMemo(() => (
    <span className="flex items-center gap-2">
      <RefreshCw className="h-5 w-5" />
      {t('renewalRequests.title')}
      {count > 0 && <Badge>{count}</Badge>}
    </span>
  ), [count, t]);

  const reviewRequest = async (request: RenewalRequest, action: ReviewAction) => {
    if (!orgId) return;
    setWorkingId(request.id);
    try {
      const updateStatus = httpsCallable(functions, 'updateRenewalRequestStatus');
      await updateStatus({ organizationId: orgId, renewalRequestId: request.id, action });
      const outcome = action === 'dismissed' ? 'dismissed' : request.status === 'paid' ? 'handled' : 'contacted';
      toast({ title: t(TOAST_KEYS[outcome].title), description: t(TOAST_KEYS[outcome].description) });
    } catch (error) {
      console.error(error);
      toast({ title: t('renewalRequests.updateFailed'), description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setWorkingId(null);
    }
  };

  if (!canReview || requests.length === 0) return null;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.map((request) => {
          const status: RenewalStatus = request.status ?? 'pending';
          const badge = STATUS_BADGE[status];
          const isWorking = workingId === request.id;
          const createdAt = validateDate(request.created_at);
          const paidAt = validateDate(request.paid_at ?? request.updated_at ?? request.created_at);
          const paidAmount = formatMoney(
            request.payment?.amount ?? request.package_price,
            request.payment?.currency ?? request.currency,
          );
          const provider = providerLabel(request.payment?.provider ?? request.payment_provider);
          const packagePrice = formatMoney(request.package_price, request.currency);
          const remaining = request.sessions_remaining_at_request;
          const total = request.total_sessions_at_request;
          const expiry = request.expiry_date_at_request
            ? safeFormatters.shortDate(request.expiry_date_at_request)
            : '';

          return (
            <div key={request.id} className="rounded-md border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{request.client_name || t('renewalRequests.clientFallback')}</span>
                    {badge && (
                      <Badge variant="outline" className={badge.className}>
                        {t(`renewalRequests.status.${badge.key}`)}
                      </Badge>
                    )}
                  </div>
                  {(request.client_phone || request.client_email) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {request.client_phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          <span className="ltr-inline" dir="ltr">{request.client_phone}</span>
                        </span>
                      )}
                      {request.client_email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="ltr-inline" dir="ltr">{request.client_email}</span>
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-sm">
                    {request.package_name || t('renewalRequests.packageFallback')}
                    {packagePrice && <span className="text-muted-foreground"> · {packagePrice}</span>}
                  </div>
                  {typeof remaining === 'number' && typeof total === 'number' && (
                    <div className="text-sm text-muted-foreground">
                      {t('renewalRequests.sessionsAtRequest', { remaining, total })}
                    </div>
                  )}
                  {expiry && (
                    <div className="text-sm text-muted-foreground">{t('renewalRequests.validUntil', { date: expiry })}</div>
                  )}
                  {request.notes && (
                    <div className="text-sm text-muted-foreground">{t('renewalRequests.notes', { notes: request.notes })}</div>
                  )}
                  {status === 'paid' && (
                    <div className="space-y-0.5 text-sm">
                      {paidAmount && (
                        <div className="text-emerald-700 dark:text-emerald-300">
                          {provider
                            ? t('renewalRequests.paidLine', { amount: paidAmount, provider, date: safeFormatters.shortDate(paidAt) })
                            : t('renewalRequests.paidLineNoProvider', { amount: paidAmount, date: safeFormatters.shortDate(paidAt) })}
                        </div>
                      )}
                      <div className="text-muted-foreground">{t('renewalRequests.invoiceHint')}</div>
                    </div>
                  )}
                  {status === 'pending_payment' && (
                    <div className="text-sm text-muted-foreground">{t('renewalRequests.awaitingPaymentHint')}</div>
                  )}
                  {createdAt && (
                    <div className="text-xs text-muted-foreground">
                      {t('renewalRequests.requested', {
                        relative: relativeTime(createdAt),
                        date: safeFormatters.shortDate(createdAt),
                      })}
                    </div>
                  )}
                </div>

                {(status === 'pending' || status === 'paid') && (
                  <div className="flex flex-col gap-2 md:min-w-48">
                    <Button size="sm" disabled={isWorking} onClick={() => reviewRequest(request, 'contacted')}>
                      {isWorking
                        ? <Loader2 className="me-2 h-4 w-4 animate-spin" />
                        : <CheckCircle className="me-2 h-4 w-4" />}
                      {status === 'paid' ? t('renewalRequests.markHandled') : t('renewalRequests.markContacted')}
                    </Button>
                    {status === 'pending' && (
                      <Button size="sm" variant="outline" disabled={isWorking} onClick={() => setPendingDismiss(request)}>
                        <XCircle className="me-2 h-4 w-4" />
                        {t('renewalRequests.dismiss')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>

    <AlertDialog
      open={!!pendingDismiss}
      onOpenChange={(open) => { if (!open) setPendingDismiss(null); }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('renewalRequests.confirmDismissTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('renewalRequests.confirmDismissDescription', {
              client: pendingDismiss?.client_name || t('renewalRequests.thisClient'),
              packageName: pendingDismiss?.package_name || t('renewalRequests.thePackage'),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common:actions.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700"
            onClick={() => {
              if (!pendingDismiss) return;
              const request = pendingDismiss;
              setPendingDismiss(null);
              reviewRequest(request, 'dismissed');
            }}
          >
            {t('renewalRequests.dismissRequest')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
