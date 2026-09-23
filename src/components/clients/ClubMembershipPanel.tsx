import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Coins, Crown, Loader2, SlidersHorizontal, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useToast } from '@/hooks/use-toast';
import { safeFormatters } from '@/lib/safeDateFormatter';
import type { Client } from '@/hooks/useClients';

type MembershipStatus = 'incomplete' | 'active' | 'past_due' | 'cancelled';
type LedgerType = 'credit_add' | 'credit_spend' | 'adjustment' | 'refund' | 'expiry';

interface Membership {
  id: string;
  plan_name: string;
  price: number;
  currency: string | null;
  monthly_credit: number;
  status: MembershipStatus;
  current_period_end: Timestamp | null;
  cancel_at_period_end: boolean;
  cancelled_at: Timestamp | null;
  credit_expires_at: Timestamp | null;
  started_at: Timestamp | null;
  created_at: Timestamp | null;
}

interface LedgerEntry {
  id: string;
  type: LedgerType | string;
  amount: number;
  balance_after: number;
  currency: string | null;
  description: string;
  created_at: Timestamp | null;
}

interface ClientClubFields {
  balance: number;
  currency: string | null;
  status: MembershipStatus | null;
  membershipId: string | null;
}

interface ClubMembershipPanelProps {
  client: Client;
}

const STATUSES: MembershipStatus[] = ['incomplete', 'active', 'past_due', 'cancelled'];
const isStatus = (value: unknown): value is MembershipStatus =>
  typeof value === 'string' && (STATUSES as string[]).includes(value);

const asTimestamp = (value: unknown): Timestamp | null =>
  value && typeof (value as Timestamp).toDate === 'function' ? (value as Timestamp) : null;

const asNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const toMembership = (id: string, data: Record<string, unknown>): Membership => ({
  id,
  plan_name: typeof data.plan_name === 'string' ? data.plan_name : '',
  price: asNumber(data.price),
  currency: typeof data.currency === 'string' && data.currency ? data.currency : null,
  monthly_credit: asNumber(data.monthly_credit),
  status: isStatus(data.status) ? data.status : 'incomplete',
  current_period_end: asTimestamp(data.current_period_end),
  cancel_at_period_end: data.cancel_at_period_end === true,
  cancelled_at: asTimestamp(data.cancelled_at),
  credit_expires_at: asTimestamp(data.credit_expires_at),
  started_at: asTimestamp(data.started_at),
  created_at: asTimestamp(data.created_at),
});

const toLedgerEntry = (id: string, data: Record<string, unknown>): LedgerEntry => ({
  id,
  type: typeof data.type === 'string' ? data.type : 'adjustment',
  amount: asNumber(data.amount),
  balance_after: asNumber(data.balance_after),
  currency: typeof data.currency === 'string' && data.currency ? data.currency : null,
  description: typeof data.description === 'string' ? data.description : '',
  created_at: asTimestamp(data.created_at),
});

const STATUS_STYLES: Record<MembershipStatus, string> = {
  active: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  past_due: 'border-amber-300 bg-amber-50 text-amber-800',
  cancelled: 'border-red-300 bg-red-50 text-red-700',
  incomplete: 'border-slate-300 bg-slate-100 text-slate-600',
};

const LEDGER_TYPE_STYLES: Record<string, string> = {
  credit_add: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  refund: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  credit_spend: 'border-blue-300 bg-blue-50 text-blue-700',
  adjustment: 'border-slate-300 bg-slate-100 text-slate-600',
  expiry: 'border-red-300 bg-red-50 text-red-700',
};

export const ClubMembershipPanel: React.FC<ClubMembershipPanelProps> = ({ client }) => {
  const { t } = useTranslation('club');
  const { locale } = useLanguage();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const clientId = client.id;

  const [clubFields, setClubFields] = useState<ClientClubFields | null>(null);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[] | null>(null);
  const [ledgerError, setLedgerError] = useState(false);
  const [orgCurrency, setOrgCurrency] = useState('USD');

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    getDoc(doc(db, 'organizations', orgId, 'config', 'businessInfo'))
      .then((snap) => {
        if (cancelled) return;
        const raw = snap.data()?.currency;
        if (typeof raw === 'string' && raw.trim()) setOrgCurrency(raw.trim().toUpperCase());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !clientId) return;
    setClubFields(null);
    const unsubscribe = onSnapshot(
      doc(db, 'organizations', orgId, 'clients', clientId),
      (snap) => {
        const data = (snap.data() ?? {}) as Record<string, unknown>;
        setClubFields({
          balance: asNumber(data.club_credit_balance),
          currency:
            typeof data.club_credit_currency === 'string' && data.club_credit_currency
              ? data.club_credit_currency
              : null,
          status: isStatus(data.club_membership_status) ? data.club_membership_status : null,
          membershipId: typeof data.club_membership_id === 'string' ? data.club_membership_id : null,
        });
      },
      (error) => {
        console.error('Error loading client club fields:', error);
        setClubFields({ balance: 0, currency: null, status: null, membershipId: null });
        toast({ title: t('panel.toasts.loadFailed'), variant: 'destructive' });
      },
    );
    return unsubscribe;
  }, [orgId, clientId, t, toast]);

  useEffect(() => {
    if (!orgId || !clientId) return;
    setMemberships(null);
    const unsubscribe = onSnapshot(
      query(collection(db, 'organizations', orgId, 'memberships'), where('client_id', '==', clientId)),
      (snap) => {
        setMemberships(snap.docs.map((d) => toMembership(d.id, d.data() as Record<string, unknown>)));
      },
      (error) => {
        console.error('Error loading memberships:', error);
        setMemberships([]);
        toast({ title: t('panel.toasts.loadFailed'), variant: 'destructive' });
      },
    );
    return unsubscribe;
  }, [orgId, clientId, t, toast]);

  useEffect(() => {
    if (!orgId || !clientId) return;
    setLedger(null);
    setLedgerError(false);
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'organizations', orgId, 'creditLedger'),
        where('client_id', '==', clientId),
        orderBy('created_at', 'desc'),
        limit(50),
      ),
      (snap) => {
        setLedger(snap.docs.map((d) => toLedgerEntry(d.id, d.data() as Record<string, unknown>)));
      },
      (error) => {
        console.error('Error loading credit ledger:', error);
        setLedger([]);
        setLedgerError(true);
      },
    );
    return unsubscribe;
  }, [orgId, clientId]);

  const membership = useMemo<Membership | null>(() => {
    if (!memberships || memberships.length === 0) return null;
    const cached = clubFields?.membershipId
      ? memberships.find((m) => m.id === clubFields.membershipId)
      : undefined;
    if (cached) return cached;
    const sorted = [...memberships].sort(
      (a, b) => (b.created_at?.toMillis() ?? 0) - (a.created_at?.toMillis() ?? 0),
    );
    return sorted.find((m) => m.status === 'active' || m.status === 'past_due') ?? sorted[0];
  }, [memberships, clubFields?.membershipId]);

  const currency = clubFields?.currency ?? membership?.currency ?? orgCurrency;
  const balance = clubFields?.balance ?? 0;
  const status: MembershipStatus | null = membership?.status ?? clubFields?.status ?? null;
  const canCancel =
    Boolean(membership) &&
    (membership?.status === 'active' || membership?.status === 'past_due') &&
    !membership?.cancel_at_period_end;

  const formatMoney = useMemo(
    () => (amount: number, code: string = currency) => {
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(amount);
      } catch {
        return `${amount.toFixed(2)} ${code}`;
      }
    },
    [locale, currency],
  );

  const formatSigned = (amount: number, code: string) => {
    const formatted = formatMoney(Math.abs(amount), code);
    return amount < 0 ? `-${formatted}` : `+${formatted}`;
  };

  const dateOrDash = (value: Timestamp | null) => (value ? safeFormatters.shortDate(value) || '—' : '—');

  const openAdjust = () => {
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustOpen(true);
  };

  const parsedAdjust = parseFloat(adjustAmount);
  const adjustValid = Number.isFinite(parsedAdjust) && parsedAdjust !== 0;

  const handleAdjust = async () => {
    if (!orgId || adjusting) return;
    if (!adjustValid) {
      toast({ title: t('panel.toasts.amountInvalid'), variant: 'destructive' });
      return;
    }
    const reason = adjustReason.trim();
    if (!reason) {
      toast({ title: t('panel.toasts.reasonRequired'), variant: 'destructive' });
      return;
    }
    setAdjusting(true);
    try {
      const adjust = httpsCallable<
        { organizationId: string; clientId: string; amount: number; reason: string },
        { balance_after: number }
      >(functions, 'adjustClubCredit');
      const res = await adjust({
        organizationId: orgId,
        clientId,
        amount: Math.round(parsedAdjust * 100) / 100,
        reason,
      });
      const balanceAfter = asNumber(res.data?.balance_after);
      setClubFields((prev) => (prev ? { ...prev, balance: balanceAfter } : prev));
      toast({
        title: t('panel.toasts.adjusted'),
        description: t('panel.toasts.adjustedDesc', { balance: formatMoney(balanceAfter) }),
      });
      setAdjustOpen(false);
    } catch (error: unknown) {
      console.error('Error adjusting club credit:', error);
      toast({
        title: t('panel.toasts.adjustFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setAdjusting(false);
    }
  };

  const handleCancel = async () => {
    if (!orgId || !membership || cancelling) return;
    setCancelling(true);
    try {
      const cancel = httpsCallable<
        { organizationId: string; membershipId: string },
        { success: boolean; cancel_at_period_end: boolean }
      >(functions, 'cancelClubMembership');
      const res = await cancel({ organizationId: orgId, membershipId: membership.id });
      toast({
        title: t('panel.toasts.cancelled'),
        description: res.data?.cancel_at_period_end
          ? t('panel.toasts.cancelledPeriodEnd')
          : t('panel.toasts.cancelledNow'),
      });
      setCancelOpen(false);
    } catch (error: unknown) {
      console.error('Error cancelling club membership:', error);
      toast({
        title: t('panel.toasts.cancelFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  };

  const loading = clubFields === null || memberships === null;

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('panel.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          {t('panel.title')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={openAdjust}>
              <SlidersHorizontal className="h-4 w-4 me-2" />
              {t('panel.adjustCredit')}
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="h-4 w-4 me-2" />
              {t('panel.cancelMembership')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              {t('panel.creditBalance')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-3xl font-bold tabular-nums" dir="ltr">
              {formatMoney(balance)}
            </div>
            {membership?.credit_expires_at && (
              <p className="text-xs text-muted-foreground">
                {t('panel.fields.creditExpires')}: {dateOrDash(membership.credit_expires_at)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              {membership ? membership.plan_name || t('panel.fields.plan') : t('panel.title')}
              {status && (
                <Badge variant="outline" className={STATUS_STYLES[status]}>
                  {t(`panel.status.${status}`)}
                </Badge>
              )}
              {membership?.cancel_at_period_end && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  {t('panel.cancelsAtPeriodEnd')}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {membership ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t('panel.fields.price')}</dt>
                <dd className="tabular-nums" dir="ltr">
                  {formatMoney(membership.price, membership.currency ?? currency)}
                </dd>
                <dt className="text-muted-foreground">{t('panel.fields.monthlyCredit')}</dt>
                <dd className="tabular-nums" dir="ltr">
                  {formatMoney(membership.monthly_credit, membership.currency ?? currency)}
                </dd>
                <dt className="text-muted-foreground">{t('panel.fields.nextBilling')}</dt>
                <dd>{membership.cancel_at_period_end || membership.status === 'cancelled' ? '—' : dateOrDash(membership.current_period_end)}</dd>
                <dt className="text-muted-foreground">{t('panel.fields.memberSince')}</dt>
                <dd>{dateOrDash(membership.started_at ?? membership.created_at)}</dd>
                {membership.cancelled_at && (
                  <>
                    <dt className="text-muted-foreground">{t('panel.fields.cancelledOn')}</dt>
                    <dd>{dateOrDash(membership.cancelled_at)}</dd>
                  </>
                )}
              </dl>
            ) : (
              <div className="space-y-1">
                <p className="text-sm">{t('panel.noMembership')}</p>
                <p className="text-xs text-muted-foreground">{t('panel.noMembershipHint')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('panel.ledger.title')}</CardTitle>
          <CardDescription>{t('panel.ledger.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger === null ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('panel.ledger.loading')}
            </div>
          ) : ledgerError ? (
            <p className="text-sm text-destructive">{t('panel.toasts.loadFailed')}</p>
          ) : ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('panel.ledger.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('panel.ledger.columns.date')}</TableHead>
                    <TableHead>{t('panel.ledger.columns.type')}</TableHead>
                    <TableHead>{t('panel.ledger.columns.description')}</TableHead>
                    <TableHead className="text-end">{t('panel.ledger.columns.amount')}</TableHead>
                    <TableHead className="text-end">{t('panel.ledger.columns.balanceAfter')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.map((entry) => {
                    const entryCurrency = entry.currency ?? currency;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">{dateOrDash(entry.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={LEDGER_TYPE_STYLES[entry.type] ?? LEDGER_TYPE_STYLES.adjustment}>
                            {t(`panel.ledger.types.${entry.type}`, { defaultValue: entry.type })}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[280px] break-words">{entry.description || '—'}</TableCell>
                        <TableCell
                          className={`text-end tabular-nums whitespace-nowrap ${entry.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}
                          dir="ltr"
                        >
                          {formatSigned(entry.amount, entryCurrency)}
                        </TableCell>
                        <TableCell className="text-end tabular-nums whitespace-nowrap" dir="ltr">
                          {formatMoney(entry.balance_after, entryCurrency)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={adjustOpen} onOpenChange={(open) => !adjusting && setAdjustOpen(open)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{t('panel.adjustDialog.title')}</DialogTitle>
            <DialogDescription>{t('panel.adjustDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <p className="text-sm text-muted-foreground">
              {t('panel.adjustDialog.currentBalance', { balance: formatMoney(balance) })}
            </p>
            <div className="grid gap-2">
              <Label htmlFor="club_adjust_amount">{t('panel.adjustDialog.amount', { currency })}</Label>
              <Input
                id="club_adjust_amount"
                type="number"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder={t('panel.adjustDialog.amountPlaceholder')}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">{t('panel.adjustDialog.amountHelp')}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="club_adjust_reason">{t('panel.adjustDialog.reason')}</Label>
              <Textarea
                id="club_adjust_reason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder={t('panel.adjustDialog.reasonPlaceholder')}
                rows={2}
                className="resize-none"
              />
            </div>
            {adjustValid && (
              <p className="text-sm font-medium">
                {t('panel.adjustDialog.newBalance', { balance: formatMoney(balance + parsedAdjust) })}
              </p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setAdjustOpen(false)} disabled={adjusting}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleAdjust} disabled={adjusting || !adjustValid || !adjustReason.trim()}>
              {adjusting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {adjusting ? t('panel.adjustDialog.submitting') : t('panel.adjustDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={(open) => !cancelling && setCancelOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('panel.cancelDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('panel.cancelDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>{t('panel.cancelDialog.keep')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleCancel();
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {cancelling ? t('panel.cancelDialog.cancelling') : t('panel.cancelDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
