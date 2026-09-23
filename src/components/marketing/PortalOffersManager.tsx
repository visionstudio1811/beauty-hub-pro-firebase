import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { toast } from '@/hooks/use-toast';
import { safeFormatters } from '@/lib/safeDateFormatter';
import { getBusinessToday } from '@/lib/timeUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Image as ImageIcon, Loader2, Megaphone, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';

export type PortalOfferAudience = 'all' | 'members' | 'low_sessions';

export interface PortalOffer {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  image_storage_path: string | null;
  cta_label: string | null;
  cta_url: string | null;
  audience: PortalOfferAudience;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const AUDIENCES: PortalOfferAudience[] = ['all', 'members', 'low_sessions'];
const TITLE_MAX = 120;
const BODY_MAX = 2000;
const CTA_LABEL_MAX = 40;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

interface OfferForm {
  title: string;
  body: string;
  image_url: string | null;
  image_storage_path: string | null;
  cta_label: string;
  cta_url: string;
  audience: PortalOfferAudience;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  sort_order: number;
}

const emptyForm = (sortOrder: number): OfferForm => ({
  title: '',
  body: '',
  image_url: null,
  image_storage_path: null,
  cta_label: '',
  cta_url: '',
  audience: 'all',
  starts_at: '',
  ends_at: '',
  is_active: true,
  sort_order: sortOrder,
});

const formFromOffer = (o: PortalOffer): OfferForm => ({
  title: o.title,
  body: o.body,
  image_url: o.image_url,
  image_storage_path: o.image_storage_path,
  cta_label: o.cta_label ?? '',
  cta_url: o.cta_url ?? '',
  audience: o.audience,
  starts_at: o.starts_at ?? '',
  ends_at: o.ends_at ?? '',
  is_active: o.is_active,
  sort_order: o.sort_order,
});

const isAudience = (v: unknown): v is PortalOfferAudience => AUDIENCES.includes(v as PortalOfferAudience);
const isoDay = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const toOffer = (id: string, d: Record<string, unknown>): PortalOffer => ({
  id,
  title: str(d.title),
  body: str(d.body),
  image_url: str(d.image_url) || null,
  image_storage_path: str(d.image_storage_path) || null,
  cta_label: str(d.cta_label) || null,
  cta_url: str(d.cta_url) || null,
  audience: isAudience(d.audience) ? d.audience : 'all',
  starts_at: isoDay(d.starts_at),
  ends_at: isoDay(d.ends_at),
  is_active: d.is_active !== false,
  sort_order: typeof d.sort_order === 'number' && Number.isFinite(d.sort_order) ? d.sort_order : 0,
  created_at: str(d.created_at),
  updated_at: str(d.updated_at),
});

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const extensionFor = (file: File): string => {
  const known = EXTENSIONS[file.type];
  if (known) return known;
  const fromName = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return fromName || 'img';
};

const deleteQuietly = (path: string | null): Promise<void> =>
  path ? deleteObject(storageRef(storage, path)).catch(() => undefined) : Promise.resolve();

const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

type OfferStatus = 'live' | 'scheduled' | 'ended' | 'inactive';

const offerStatus = (o: PortalOffer, today: string): OfferStatus => {
  if (!o.is_active) return 'inactive';
  if (o.starts_at && o.starts_at > today) return 'scheduled';
  if (o.ends_at && o.ends_at < today) return 'ended';
  return 'live';
};

const STATUS_VARIANT: Record<OfferStatus, 'default' | 'secondary' | 'outline'> = {
  live: 'default',
  scheduled: 'secondary',
  ended: 'outline',
  inactive: 'outline',
};

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const PortalOffersManager: React.FC = () => {
  const { t } = useTranslation('offers');
  const { currentOrganization } = useOrganization();
  const isAdmin = useIsAdmin();
  const orgId = currentOrganization?.id;
  const today = getBusinessToday(currentOrganization?.timezone);

  const [offers, setOffers] = useState<PortalOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PortalOffer | null>(null);
  const [form, setForm] = useState<OfferForm>(() => emptyForm(0));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<PortalOffer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const savedImagePath = editing?.image_storage_path ?? null;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'organizations', orgId, 'portalOffers'));
      setOffers(snap.docs.map((d) => toOffer(d.id, d.data())));
    } catch (err) {
      toast({ title: i18n.t('offers:toasts.loadError'), description: errorText(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [load, isAdmin]);

  const sorted = useMemo(
    () => [...offers].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [offers],
  );

  const openCreate = () => {
    const nextOrder = offers.reduce((max, o) => Math.max(max, o.sort_order), -1) + 1;
    setEditing(null);
    setForm(emptyForm(nextOrder));
    setDialogOpen(true);
  };

  const openEdit = (o: PortalOffer) => {
    setEditing(o);
    setForm(formFromOffer(o));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (form.image_storage_path && form.image_storage_path !== savedImagePath) {
      void deleteQuietly(form.image_storage_path);
    }
    setDialogOpen(false);
    setEditing(null);
  };

  const handleImageUpload = async (file: File) => {
    if (!orgId) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: t('toasts.invalidImage'), variant: 'destructive' });
      return;
    }
    if (file.size >= IMAGE_MAX_BYTES) {
      toast({ title: t('toasts.imageTooLarge'), variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const path = `organizations/${orgId}/offers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(file)}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);
      const previous = form.image_storage_path;
      if (previous && previous !== savedImagePath) void deleteQuietly(previous);
      setForm((f) => ({ ...f, image_url: url, image_storage_path: path }));
    } catch (err) {
      toast({ title: t('toasts.uploadFailed'), description: errorText(err), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    if (form.image_storage_path && form.image_storage_path !== savedImagePath) {
      void deleteQuietly(form.image_storage_path);
    }
    setForm((f) => ({ ...f, image_url: null, image_storage_path: null }));
  };

  const validate = (): string | null => {
    const title = form.title.trim();
    if (!title) return t('validation.titleRequired');
    if (title.length > TITLE_MAX) return t('validation.titleTooLong', { max: TITLE_MAX });
    if (form.body.trim().length > BODY_MAX) return t('validation.bodyTooLong', { max: BODY_MAX });
    const label = form.cta_label.trim();
    const url = form.cta_url.trim();
    if ((label && !url) || (!label && url)) return t('validation.ctaBoth');
    if (url) {
      if (!/^https:\/\//i.test(url)) return t('validation.ctaUrlHttps');
      if (!isHttpsUrl(url)) return t('validation.ctaUrlInvalid');
    }
    if (form.starts_at && form.ends_at && form.ends_at < form.starts_at) return t('validation.dateOrder');
    return null;
  };

  const handleSave = async () => {
    if (!orgId) return;
    const error = validate();
    if (error) {
      toast({ title: error, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        image_url: form.image_url,
        image_storage_path: form.image_storage_path,
        cta_label: form.cta_label.trim() || null,
        cta_url: form.cta_url.trim() || null,
        audience: form.audience,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        is_active: form.is_active,
        sort_order: Number.isFinite(form.sort_order) ? Math.trunc(form.sort_order) : 0,
        updated_at: now,
      };
      if (editing) {
        await updateDoc(doc(db, 'organizations', orgId, 'portalOffers', editing.id), payload);
        if (savedImagePath && savedImagePath !== payload.image_storage_path) void deleteQuietly(savedImagePath);
        toast({ title: t('toasts.updated') });
      } else {
        await addDoc(collection(db, 'organizations', orgId, 'portalOffers'), { ...payload, created_at: now });
        toast({ title: t('toasts.created') });
      }
      setDialogOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      toast({ title: t('toasts.saveError'), description: errorText(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (o: PortalOffer, next: boolean) => {
    if (!orgId) return;
    setOffers((list) => list.map((x) => (x.id === o.id ? { ...x, is_active: next } : x)));
    try {
      await updateDoc(doc(db, 'organizations', orgId, 'portalOffers', o.id), {
        is_active: next,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      setOffers((list) => list.map((x) => (x.id === o.id ? { ...x, is_active: o.is_active } : x)));
      toast({ title: t('toasts.toggleError'), description: errorText(err), variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!orgId || !deleting) return;
    setDeleteBusy(true);
    try {
      await deleteDoc(doc(db, 'organizations', orgId, 'portalOffers', deleting.id));
      void deleteQuietly(deleting.image_storage_path);
      toast({ title: t('toasts.deleted') });
      setDeleting(null);
      await load();
    } catch (err) {
      toast({ title: t('toasts.deleteError'), description: errorText(err), variant: 'destructive' });
    } finally {
      setDeleteBusy(false);
    }
  };

  const windowLabel = (o: PortalOffer): string => {
    const from = o.starts_at ? safeFormatters.shortDate(o.starts_at) : '';
    const to = o.ends_at ? safeFormatters.shortDate(o.ends_at) : '';
    if (from && to) return t('window.range', { from, to });
    if (from) return t('window.from', { date: from });
    if (to) return t('window.until', { date: to });
    return t('window.always');
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">{t('adminOnly')}</CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                {t('title')}
              </CardTitle>
              <CardDescription className="mt-1">{t('description')}</CardDescription>
            </div>
            <Button onClick={openCreate} size="sm" className="self-start">
              <Plus className="h-4 w-4 me-2" />
              {t('newOffer')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t('empty')}</p>
          ) : (
            <div className="space-y-2">
              {sorted.map((o) => {
                const status = offerStatus(o, today);
                return (
                  <div key={o.id} className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    {o.image_url ? (
                      <img src={o.image_url} alt="" className="h-14 w-14 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center shrink-0">
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">{o.title || t('untitled')}</span>
                        <Badge variant="secondary">{t(`audience.${o.audience}`)}</Badge>
                        <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {windowLabel(o)} · {t('sortOrder', { n: o.sort_order })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      <Switch
                        checked={o.is_active}
                        onCheckedChange={(checked) => void toggleActive(o, checked)}
                        aria-label={t('fields.active')}
                        className="me-2"
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(o)} aria-label={t('common:actions.edit')}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleting(o)}
                        aria-label={t('common:actions.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('dialog.editTitle') : t('dialog.createTitle')}</DialogTitle>
            <DialogDescription>{t('dialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="offer-title">{t('fields.title')}</Label>
              <Input
                id="offer-title"
                value={form.title}
                maxLength={TITLE_MAX}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('fields.titlePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer-body">{t('fields.body')}</Label>
              <Textarea
                id="offer-body"
                rows={5}
                value={form.body}
                maxLength={BODY_MAX}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder={t('fields.bodyPlaceholder')}
              />
              <p className="text-xs text-muted-foreground text-end">
                {t('fields.bodyCount', { used: form.body.length, max: BODY_MAX })}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('fields.image')}</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImageUpload(file);
                  e.target.value = '';
                }}
              />
              {form.image_url ? (
                <div className="space-y-2">
                  <div className="rounded-lg overflow-hidden border bg-muted/30">
                    <img src={form.image_url} alt={t('fields.imageAlt')} className="w-full max-h-48 object-cover" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Upload className="h-4 w-4 me-2" />}
                      {t('fields.replaceImage')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRemoveImage}
                      disabled={uploading}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="h-4 w-4 me-2" />
                      {t('fields.removeImage')}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 hover:bg-muted/30 transition-colors disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  )}
                  <p className="text-sm font-medium">{t('fields.uploadImage')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('fields.imageHint')}</p>
                </button>
              )}
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="offer-cta-label">{t('fields.ctaLabel')}</Label>
                  <Input
                    id="offer-cta-label"
                    value={form.cta_label}
                    maxLength={CTA_LABEL_MAX}
                    onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))}
                    placeholder={t('fields.ctaLabelPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offer-cta-url">{t('fields.ctaUrl')}</Label>
                  <Input
                    id="offer-cta-url"
                    type="url"
                    dir="ltr"
                    value={form.cta_url}
                    onChange={(e) => setForm((f) => ({ ...f, cta_url: e.target.value }))}
                    placeholder="https://"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('fields.ctaHint')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="offer-audience">{t('audience.label')}</Label>
              <Select
                value={form.audience}
                onValueChange={(value) => setForm((f) => ({ ...f, audience: isAudience(value) ? value : 'all' }))}
              >
                <SelectTrigger id="offer-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((audience) => (
                    <SelectItem key={audience} value={audience}>
                      {t(`audience.${audience}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t(`audience.help.${form.audience}`)}</p>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="offer-starts">{t('fields.startsAt')}</Label>
                  <Input
                    id="offer-starts"
                    type="date"
                    value={form.starts_at}
                    onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="offer-ends">{t('fields.endsAt')}</Label>
                  <Input
                    id="offer-ends"
                    type="date"
                    min={form.starts_at || undefined}
                    value={form.ends_at}
                    onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('fields.datesHint')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="space-y-2">
                <Label htmlFor="offer-sort">{t('fields.sortOrder')}</Label>
                <Input
                  id="offer-sort"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
                />
                <p className="text-xs text-muted-foreground">{t('fields.sortOrderHint')}</p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <Label htmlFor="offer-active">{t('fields.active')}</Label>
                  <p className="text-xs text-muted-foreground">{t('fields.activeHint')}</p>
                </div>
                <Switch
                  id="offer-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || uploading}>
              {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {editing ? t('common:actions.save') : t('common:actions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete.description', { title: deleting?.title || t('untitled') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>{t('common:actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {t('common:actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
