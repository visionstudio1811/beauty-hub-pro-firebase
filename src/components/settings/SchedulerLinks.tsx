import React, { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';
import i18n from '@/i18n';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { useSupabaseProfiles } from '@/hooks/useSupabaseProfiles';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Link as LinkIcon, Copy, Plus, Trash2, Code2, X, Pencil, ExternalLink } from 'lucide-react';

interface SchedulerLink {
  id: string;       // The token
  treatment_id: string | null;
  staff_id: string | null;
  label: string | null;
  is_active: boolean;
  expires_at: Timestamp | null;
  created_at: Timestamp | null;
  revoked_at: Timestamp | null;
}

const tsToDate = (t: Timestamp | null): Date | null =>
  t && typeof t.toDate === 'function' ? t.toDate() : null;

const formatDate = (d: Date | null, locale: string): string =>
  d ? d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const isExpired = (l: SchedulerLink) => {
  const exp = tsToDate(l.expires_at);
  return exp ? exp.getTime() < Date.now() : false;
};

const buildBookingUrl = (token: string, crmDomain?: string | null): string => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/book/${token}`;
  }
  return `https://${crmDomain ?? 'beautyhubpro.com'}/book/${token}`;
};

// Expiration choices in the create/edit dialog. 'keep' (edit only) leaves the
// current expiration untouched; the others are measured from today.
type ExpiryChoice = 'keep' | 'never' | '30' | '90' | '180' | '365';
const EXPIRY_DAY_CHOICES = ['30', '90', '180', '365'] as const;

interface LinkForm {
  treatmentId: string;   // 'any' = visitor picks
  label: string;
  expiry: ExpiryChoice;
  isActive: boolean;
}

const EMPTY_FORM: LinkForm = { treatmentId: 'any', label: '', expiry: 'never', isActive: true };

const expiryToIso = (choice: ExpiryChoice): string | null =>
  choice === 'never' || choice === 'keep'
    ? null
    : new Date(Date.now() + parseInt(choice, 10) * 24 * 60 * 60 * 1000).toISOString();

const buildIframeSnippet = (url: string): string =>
  `<iframe src="${url}" width="100%" height="800" style="border:0;" loading="lazy" allow="payment"></iframe>`;

export const SchedulerLinks: React.FC = () => {
  const { t } = useTranslation('settings');
  const { locale } = useLanguage();
  const { currentOrganization } = useOrganization();
  const { treatments } = useSupabaseTreatments();
  const { profiles } = useSupabaseProfiles();
  const { toast } = useToast();
  const [links, setLinks] = useState<SchedulerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // The link being edited; null while creating a new one.
  const [editing, setEditing] = useState<SchedulerLink | null>(null);
  const [embedFor, setEmbedFor] = useState<{ url: string; snippet: string } | null>(null);
  const [form, setForm] = useState<LinkForm>(EMPTY_FORM);

  useEffect(() => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    const q = query(
      collection(db, 'organizations', currentOrganization.id, 'schedulerLinks'),
      orderBy('created_at', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const rows: SchedulerLink[] = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            treatment_id: data.treatment_id ?? null,
            staff_id: data.staff_id ?? null,
            label: data.label ?? null,
            is_active: data.is_active !== false,
            expires_at: data.expires_at ?? null,
            created_at: data.created_at ?? null,
            revoked_at: data.revoked_at ?? null,
          };
        });
        setLinks(rows);
        setLoading(false);
      },
      err => {
        console.error('Failed to load scheduler links', err);
        // Read via the module-level i18n instance so the hook's `t` (which changes
        // identity on language switch) does not need to be a dependency — otherwise
        // switching language would tear down and re-subscribe the Firestore listener.
        toast({ title: i18n.t('common:status.error'), description: i18n.t('settings:schedulerLinks.toasts.loadFailed'), variant: 'destructive' });
        setLoading(false);
      },
    );
    return () => unsub();
  }, [currentOrganization?.id, toast]);

  const bookableStaff = profiles.filter(
    p => p.is_active && (p.role === 'staff' || p.role === 'admin' || p.role === 'beautician'),
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (link: SchedulerLink) => {
    setEditing(link);
    setForm({
      treatmentId: link.treatment_id ?? 'any',
      label: link.label ?? '',
      expiry: 'keep',
      isActive: link.is_active,
    });
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!currentOrganization?.id) return;
    setSaving(true);
    try {
      const fn = httpsCallable<
        {
          organizationId: string;
          treatmentId?: string | null;
          staffId?: string | null;
          label?: string;
          expiresAtIso?: string;
          neverExpires?: boolean;
        },
        { token: string; url: string }
      >(functions, 'createSchedulerLink');
      const expiresAtIso = expiryToIso(form.expiry);
      const result = await fn({
        organizationId: currentOrganization.id,
        treatmentId: form.treatmentId === 'any' ? null : form.treatmentId,
        staffId: null,
        label: form.label.trim() || undefined,
        ...(expiresAtIso ? { expiresAtIso } : { neverExpires: true }),
      });
      toast({ title: t('schedulerLinks.toasts.createdTitle'), description: t('schedulerLinks.toasts.createdDescription') });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      // Surface embed dialog so the admin can copy + paste right away
      setEmbedFor({ url: result.data.url, snippet: buildIframeSnippet(result.data.url) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('schedulerLinks.toasts.createFailedDescription');
      toast({ title: t('schedulerLinks.toasts.createFailedTitle'), description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!currentOrganization?.id || !editing) return;
    setSaving(true);
    try {
      const fn = httpsCallable<
        {
          organizationId: string;
          token: string;
          treatmentId: string | null;
          label: string | null;
          expiresAtIso?: string | null;
          isActive: boolean;
        },
        { success: boolean }
      >(functions, 'updateSchedulerLink');
      await fn({
        organizationId: currentOrganization.id,
        token: editing.id,
        treatmentId: form.treatmentId === 'any' ? null : form.treatmentId,
        label: form.label.trim() || null,
        ...(form.expiry === 'keep' ? {} : { expiresAtIso: expiryToIso(form.expiry) }),
        isActive: form.isActive,
      });
      toast({ title: t('schedulerLinks.toasts.updatedTitle') });
      setDialogOpen(false);
      setEditing(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('schedulerLinks.toasts.updateFailedDescription');
      toast({ title: t('schedulerLinks.toasts.updateFailedTitle'), description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (token: string) => {
    if (!currentOrganization?.id) return;
    if (!confirm(t('schedulerLinks.confirmRevoke'))) return;
    try {
      const fn = httpsCallable(functions, 'revokeSchedulerLink');
      await fn({ organizationId: currentOrganization.id, token });
      toast({ title: t('schedulerLinks.toasts.revokedTitle') });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('schedulerLinks.toasts.revokeFailedDescription');
      toast({ title: t('schedulerLinks.toasts.revokeFailedTitle'), description: msg, variant: 'destructive' });
    }
  };

  const handleDelete = async (token: string) => {
    if (!currentOrganization?.id) return;
    if (!confirm(t('schedulerLinks.confirmDelete'))) return;
    try {
      const fn = httpsCallable(functions, 'deleteSchedulerLink');
      await fn({ organizationId: currentOrganization.id, token });
      toast({ title: t('schedulerLinks.toasts.deletedTitle') });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('schedulerLinks.toasts.deleteFailedDescription');
      toast({ title: t('schedulerLinks.toasts.deleteFailedTitle'), description: msg, variant: 'destructive' });
    }
  };

  const copyToClipboard = async (text: string, label: string = t('common:actions.copied')) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: label, description: text.length > 60 ? `${text.slice(0, 60)}…` : text });
    } catch {
      toast({ title: t('schedulerLinks.toasts.copyFailedTitle'), description: t('schedulerLinks.toasts.copyFailedDescription'), variant: 'destructive' });
    }
  };

  const crmDomain = (currentOrganization as { crm_domain?: string } | null)?.crm_domain;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-purple-600" />
              {t('schedulerLinks.title')}
            </CardTitle>
            <CardDescription>
              {t('schedulerLinks.description')}
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 me-1" /> {t('schedulerLinks.createLink')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('schedulerLinks.loading')}</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Trans t={t} i18nKey="schedulerLinks.empty" components={{ strong: <strong /> }} />
          </p>
        ) : (
          <div className="space-y-2">
            {links.map(link => {
              const treatment = link.treatment_id
                ? treatments.find(t => t.id === link.treatment_id)
                : null;
              const staff = link.staff_id
                ? bookableStaff.find(s => s.id === link.staff_id)
                : null;
              const url = buildBookingUrl(link.id, crmDomain);
              const expired = isExpired(link);
              return (
                <div
                  key={link.id}
                  className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">
                        {link.label || (treatment ? treatment.name : t('schedulerLinks.anyTreatment'))}
                      </span>
                      {treatment && (
                        <Badge variant="secondary" className="text-xs">{treatment.name}</Badge>
                      )}
                      {staff && (
                        <Badge variant="outline" className="text-xs">
                          {staff.full_name || staff.email}
                        </Badge>
                      )}
                      {!link.is_active && <Badge variant="destructive" className="text-xs">{t('schedulerLinks.badges.revoked')}</Badge>}
                      {link.is_active && expired && (
                        <Badge variant="destructive" className="text-xs">{t('schedulerLinks.badges.expired')}</Badge>
                      )}
                      {link.is_active && !expired && (
                        <Badge className="text-xs bg-green-100 text-green-700">{t('schedulerLinks.badges.active')}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono break-all ltr-inline" dir="ltr">
                      {url}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {link.expires_at
                        ? t('schedulerLinks.createdExpires', {
                            created: formatDate(tsToDate(link.created_at), locale),
                            expires: formatDate(tsToDate(link.expires_at), locale),
                          })
                        : t('schedulerLinks.createdNeverExpires', {
                            created: formatDate(tsToDate(link.created_at), locale),
                          })}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openEdit(link)}>
                      <Pencil className="h-3 w-3 me-1" /> {t('schedulerLinks.actions.edit')}
                    </Button>
                    {link.is_active && !expired && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3 me-1" /> {t('schedulerLinks.actions.open')}
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(url, t('schedulerLinks.toasts.urlCopied'))}
                      disabled={!link.is_active}
                    >
                      <Copy className="h-3 w-3 me-1" /> {t('schedulerLinks.actions.url')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEmbedFor({ url, snippet: buildIframeSnippet(url) })}
                      disabled={!link.is_active}
                    >
                      <Code2 className="h-3 w-3 me-1" /> {t('schedulerLinks.actions.embed')}
                    </Button>
                    {link.is_active && !expired && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(link.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-3 w-3 me-1" /> {t('schedulerLinks.actions.revoke')}
                      </Button>
                    )}
                    {(!link.is_active || expired) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(link.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3 me-1" /> {t('schedulerLinks.actions.delete')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Create / edit dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('schedulerLinks.editDialog.title') : t('schedulerLinks.createDialog.title')}
            </DialogTitle>
            <DialogDescription>
              {editing ? t('schedulerLinks.editDialog.description') : t('schedulerLinks.createDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">{t('schedulerLinks.createDialog.treatment')}</Label>
              <Select value={form.treatmentId} onValueChange={v => setForm({ ...form, treatmentId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('schedulerLinks.createDialog.anyTreatmentOption')}</SelectItem>
                  {treatments.map(tr => (
                    <SelectItem key={tr.id} value={tr.id}>{tr.name}</SelectItem>
                  ))}
                  {/* Keep a link's current treatment selectable even if it was since deactivated. */}
                  {form.treatmentId !== 'any' && !treatments.some(tr => tr.id === form.treatmentId) && (
                    <SelectItem value={form.treatmentId}>{t('schedulerLinks.editDialog.removedTreatment')}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('schedulerLinks.createDialog.label')}</Label>
              <Input
                value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder={t('schedulerLinks.createDialog.labelPlaceholder')}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t('schedulerLinks.linkForm.expiration')}</Label>
              <Select value={form.expiry} onValueChange={v => setForm({ ...form, expiry: v as ExpiryChoice })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {editing && (
                    <SelectItem value="keep">
                      {editing.expires_at
                        ? t('schedulerLinks.linkForm.keepCurrent', { date: formatDate(tsToDate(editing.expires_at), locale) })
                        : t('schedulerLinks.linkForm.keepCurrentNever')}
                    </SelectItem>
                  )}
                  <SelectItem value="never">{t('schedulerLinks.linkForm.never')}</SelectItem>
                  {EXPIRY_DAY_CHOICES.map(days => (
                    <SelectItem key={days} value={days}>{t('schedulerLinks.linkForm.daysFromToday', { days })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editing && (
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={v => setForm({ ...form, isActive: v })}
                  aria-label={t('schedulerLinks.linkForm.active')}
                />
                <div>
                  <Label className="text-sm">{t('schedulerLinks.linkForm.active')}</Label>
                  <p className="text-xs text-muted-foreground">{t('schedulerLinks.linkForm.activeHelp')}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            {editing ? (
              <Button onClick={handleUpdate} disabled={saving}>
                {saving ? t('schedulerLinks.linkForm.saving') : t('schedulerLinks.linkForm.save')}
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? t('schedulerLinks.createDialog.creating') : t('schedulerLinks.createLink')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Embed snippet dialog */}
      <Dialog open={Boolean(embedFor)} onOpenChange={open => !open && setEmbedFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('schedulerLinks.embedDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('schedulerLinks.embedDialog.description')}
            </DialogDescription>
          </DialogHeader>
          {embedFor && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm">{t('schedulerLinks.embedDialog.publicUrl')}</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={embedFor.url} readOnly dir="ltr" className="font-mono text-xs" />
                  <Button onClick={() => copyToClipboard(embedFor.url, t('schedulerLinks.toasts.urlCopied'))} variant="outline">
                    <Copy className="h-3 w-3 me-1" /> {t('schedulerLinks.actions.copy')}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm">{t('schedulerLinks.embedDialog.embedSnippet')}</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={embedFor.snippet} readOnly dir="ltr" className="font-mono text-xs" />
                  <Button onClick={() => copyToClipboard(embedFor.snippet, t('schedulerLinks.toasts.snippetCopied'))} variant="outline">
                    <Copy className="h-3 w-3 me-1" /> {t('schedulerLinks.actions.copy')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('schedulerLinks.embedDialog.embedHint')}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmbedFor(null)}>{t('common:actions.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
