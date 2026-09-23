import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { Crown, CreditCard, ExternalLink, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useLanguage } from '@/i18n/LanguageProvider';
import { toast } from '@/hooks/use-toast';

interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  monthly_credit: number;
  benefits: string[];
  is_active: boolean;
  stripe: { test?: unknown; live?: unknown } | null;
  created_at: string;
  updated_at: string;
}

interface PlanForm {
  name: string;
  description: string;
  price: string;
  monthly_credit: string;
  benefits: string;
  is_active: boolean;
}

const EMPTY_FORM: PlanForm = {
  name: '',
  description: '',
  price: '',
  monthly_credit: '',
  benefits: '',
  is_active: true,
};

const toPlan = (id: string, data: Record<string, unknown>): MembershipPlan => ({
  id,
  name: typeof data.name === 'string' ? data.name : '',
  description: typeof data.description === 'string' ? data.description : '',
  price: typeof data.price === 'number' ? data.price : Number(data.price) || 0,
  currency: typeof data.currency === 'string' && data.currency ? data.currency : 'USD',
  monthly_credit:
    typeof data.monthly_credit === 'number' ? data.monthly_credit : Number(data.monthly_credit) || 0,
  benefits: Array.isArray(data.benefits) ? data.benefits.filter((b): b is string => typeof b === 'string') : [],
  is_active: data.is_active !== false,
  stripe: data.stripe && typeof data.stripe === 'object' ? (data.stripe as MembershipPlan['stripe']) : null,
  created_at: typeof data.created_at === 'string' ? data.created_at : '',
  updated_at: typeof data.updated_at === 'string' ? data.updated_at : '',
});

const isStripeConnected = (plan: MembershipPlan): boolean =>
  Boolean(plan.stripe && (plan.stripe.test || plan.stripe.live));

const parseBenefits = (raw: string): string[] =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

export const ClubMembershipSettings: React.FC = () => {
  const { t } = useTranslation('club');
  const { locale } = useLanguage();
  const { currentOrganization } = useOrganization();
  const isAdmin = useIsAdmin();
  const orgId = currentOrganization?.id;

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgCurrency, setOrgCurrency] = useState('USD');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [creditTouched, setCreditTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MembershipPlan | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'organizations', orgId, 'membershipPlans'),
      (snap) => {
        const next = snap.docs.map((d) => toPlan(d.id, d.data() as Record<string, unknown>));
        next.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        setPlans(next);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading membership plans:', error);
        toast({ title: t('settings.toasts.loadFailed'), variant: 'destructive' });
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [orgId, t]);

  const formatMoney = useMemo(
    () => (amount: number, currency: string) => {
      try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
      } catch {
        return `${amount.toFixed(2)} ${currency}`;
      }
    },
    [locale],
  );

  const formCurrency = editing?.currency ?? orgCurrency;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setCreditTouched(false);
    setDialogOpen(true);
  };

  const openEdit = (plan: MembershipPlan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      description: plan.description,
      price: String(plan.price),
      monthly_credit: String(plan.monthly_credit),
      benefits: plan.benefits.join('\n'),
      is_active: plan.is_active,
    });
    setCreditTouched(plan.monthly_credit !== plan.price);
    setDialogOpen(true);
  };

  const handlePriceChange = (value: string) => {
    setForm((f) => ({
      ...f,
      price: value,
      monthly_credit: creditTouched ? f.monthly_credit : value,
    }));
  };

  const handleSave = async () => {
    if (!orgId || saving) return;
    const name = form.name.trim();
    if (!name) {
      toast({ title: t('settings.toasts.nameRequired'), variant: 'destructive' });
      return;
    }
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price <= 0) {
      toast({ title: t('settings.toasts.priceInvalid'), variant: 'destructive' });
      return;
    }
    const creditRaw = form.monthly_credit.trim();
    const monthlyCredit = creditRaw === '' ? price : parseFloat(creditRaw);
    if (!Number.isFinite(monthlyCredit) || monthlyCredit < 0) {
      toast({ title: t('settings.toasts.creditInvalid'), variant: 'destructive' });
      return;
    }

    const now = new Date().toISOString();
    const payload = {
      name,
      description: form.description.trim(),
      price: Math.round(price * 100) / 100,
      currency: formCurrency,
      monthly_credit: Math.round(monthlyCredit * 100) / 100,
      benefits: parseBenefits(form.benefits),
      is_active: form.is_active,
      updated_at: now,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateDoc(doc(db, 'organizations', orgId, 'membershipPlans', editing.id), payload);
        toast({ title: t('settings.toasts.updated') });
      } else {
        await addDoc(collection(db, 'organizations', orgId, 'membershipPlans'), {
          ...payload,
          created_at: now,
        });
        toast({ title: t('settings.toasts.created') });
      }
      setDialogOpen(false);
    } catch (error: unknown) {
      console.error('Error saving membership plan:', error);
      toast({
        title: t('settings.toasts.saveFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: MembershipPlan) => {
    if (!orgId || togglingId) return;
    setTogglingId(plan.id);
    try {
      await updateDoc(doc(db, 'organizations', orgId, 'membershipPlans', plan.id), {
        is_active: !plan.is_active,
        updated_at: new Date().toISOString(),
      });
      toast({ title: plan.is_active ? t('settings.toasts.deactivated') : t('settings.toasts.activated') });
    } catch (error: unknown) {
      console.error('Error toggling membership plan:', error);
      toast({
        title: t('settings.toasts.saveFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!orgId || !deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'organizations', orgId, 'membershipPlans', deleteTarget.id));
      toast({ title: t('settings.toasts.deleted') });
      setDeleteTarget(null);
    } catch (error: unknown) {
      console.error('Error deleting membership plan:', error);
      toast({
        title: t('settings.toasts.deleteFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            {t('settings.title')}
          </CardTitle>
          <CardDescription>{t('settings.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <CreditCard className="h-4 w-4" />
            <AlertTitle>{t('settings.stripeNotice.title')}</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{t('settings.stripeNotice.body')}</p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/settings?section=payments">
                  <ExternalLink className="h-4 w-4 me-2" />
                  {t('settings.stripeNotice.link')}
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle>{t('settings.plans.title')}</CardTitle>
              <CardDescription>{t('settings.plans.description')}</CardDescription>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={openCreate} className="w-full sm:w-auto shrink-0">
                <Plus className="h-4 w-4 me-2" />
                {t('settings.plans.add')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isAdmin && <p className="text-xs text-muted-foreground">{t('settings.readOnly')}</p>}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('settings.plans.loading')}
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center">
              <p className="text-sm font-medium">{t('settings.plans.empty')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.plans.emptyHint')}</p>
            </div>
          ) : (
            plans.map((plan) => {
              const connected = isStripeConnected(plan);
              return (
                <div key={plan.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-medium break-words">{plan.name}</h4>
                        <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                          {plan.is_active ? t('settings.plans.active') : t('settings.plans.inactive')}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            connected
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'text-muted-foreground'
                          }
                        >
                          {connected ? t('settings.plans.stripeConnected') : t('settings.plans.stripeNotConnected')}
                        </Badge>
                      </div>
                      {plan.description && (
                        <p className="text-sm text-muted-foreground break-words">{plan.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span className="font-medium">
                          {t('settings.plans.perMonth', { price: formatMoney(plan.price, plan.currency) })}
                        </span>
                        <span className="text-muted-foreground">
                          {t('settings.plans.monthlyCredit', { credit: formatMoney(plan.monthly_credit, plan.currency) })}
                        </span>
                        <span className="text-muted-foreground">
                          {t('settings.plans.benefits', { count: plan.benefits.length })}
                        </span>
                      </div>
                      {plan.benefits.length > 0 && (
                        <ul className="list-disc ps-5 text-xs text-muted-foreground space-y-0.5">
                          {plan.benefits.map((benefit, index) => (
                            <li key={index}>{benefit}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => openEdit(plan)}>
                          <Pencil className="h-3.5 w-3.5 me-1" />
                          {t('common:actions.edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(plan)}
                          disabled={togglingId === plan.id}
                        >
                          {togglingId === plan.id && <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" />}
                          {plan.is_active ? t('settings.plans.deactivate') : t('settings.plans.activate')}
                        </Button>
                        {!connected && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(plan)}
                          >
                            <Trash2 className="h-3.5 w-3.5 me-1" />
                            {t('common:actions.delete')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {isAdmin && plans.some(isStripeConnected) && (
            <p className="text-xs text-muted-foreground">{t('settings.plans.deleteHint')}</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('settings.form.editTitle') : t('settings.form.createTitle')}</DialogTitle>
            <DialogDescription>{t('settings.form.description')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="club_plan_name">{t('settings.form.name')}</Label>
              <Input
                id="club_plan_name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('settings.form.namePlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="club_plan_description">{t('settings.form.planDescription')}</Label>
              <Textarea
                id="club_plan_description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('settings.form.planDescriptionPlaceholder')}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="club_plan_price">{t('settings.form.price', { currency: formCurrency })}</Label>
                <Input
                  id="club_plan_price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="club_plan_credit">{t('settings.form.monthlyCredit', { currency: formCurrency })}</Label>
                <Input
                  id="club_plan_credit"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.monthly_credit}
                  onChange={(e) => {
                    setCreditTouched(true);
                    setForm((f) => ({ ...f, monthly_credit: e.target.value }));
                  }}
                  placeholder={form.price || '0.00'}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">{t('settings.form.monthlyCreditHelp')}</p>
            <div className="grid gap-2">
              <Label htmlFor="club_plan_benefits">{t('settings.form.benefits')}</Label>
              <Textarea
                id="club_plan_benefits"
                value={form.benefits}
                onChange={(e) => setForm((f) => ({ ...f, benefits: e.target.value }))}
                placeholder={t('settings.form.benefitsPlaceholder')}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">{t('settings.form.benefitsHelp')}</p>
            </div>
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Switch
                id="club_plan_active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
              />
              <div className="space-y-1">
                <Label htmlFor="club_plan_active">{t('settings.form.active')}</Label>
                <p className="text-xs text-muted-foreground">{t('settings.form.activeHelp')}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {editing ? t('settings.form.save') : t('settings.form.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.deleteDialog.title', { name: deleteTarget?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.deleteDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {t('settings.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
