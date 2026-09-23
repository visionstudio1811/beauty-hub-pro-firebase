import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Image as ImageIcon, Loader2, Lock, Mail, RotateCcw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { db, storage } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import {
  EMPTY_LOGIN_BRANDING,
  LOGIN_BRANDING_SUBTITLE_MAX,
  LOGIN_BRANDING_TITLE_MAX,
  LOGIN_HERO_MAX_BYTES,
  LOGIN_HERO_URL,
  accentButtonStyle,
  heroBackgroundImage,
  normalizeHexColor,
  sanitizeLoginBranding,
  type LoginBranding,
} from '@/lib/loginBranding';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

const extensionFor = (file: File): string => {
  const byMime = EXTENSION_BY_MIME[file.type];
  if (byMime) return byMime;
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{2,5}$/.test(fromName) ? fromName : 'jpg';
};

const deleteQuietly = (path: string) => deleteObject(storageRef(storage, path)).catch(() => undefined);

interface HeroDraft {
  url: string;
  path: string;
}

interface LoginPreviewProps {
  orgName: string;
  logoUrl: string | null;
  heroUrl: string;
  title: string;
  subtitle: string;
  accent: string | null;
}

const LoginPreview: React.FC<LoginPreviewProps> = ({ orgName, logoUrl, heroUrl, title, subtitle, accent }) => {
  const { t } = useTranslation('settings');
  return (
    <div className="gc-site overflow-hidden rounded-xl border border-border/80 bg-[rgb(var(--c-cream2))] shadow-sm">
      <div className="flex flex-col sm:flex-row">
        <div
          className="relative flex min-h-[210px] flex-1 flex-col justify-between bg-neutral-900 bg-cover bg-center p-5 text-white"
          style={{ backgroundImage: heroBackgroundImage(heroUrl) }}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/20" aria-hidden />
          <div className="relative z-10">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={orgName}
                className="h-9 w-auto max-w-[130px] rounded-md bg-white/95 object-contain p-1 shadow-md"
              />
            ) : (
              <span className="font-display text-xl font-semibold drop-shadow-md">{orgName}</span>
            )}
            <p className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.3em] text-white/80">
              {t('shell:auth.staffWorkspace')}
            </p>
          </div>
          <div className="relative z-10 mt-6 space-y-1.5">
            <p className="font-display text-2xl font-semibold leading-tight">{title}</p>
            <p className="text-xs leading-relaxed text-white/85">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-2.5 p-5">
          <p className="font-display text-lg font-semibold text-neutral-900">{t('shell:auth.signIn')}</p>
          <div className="flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs text-neutral-500">
            <Mail className="h-3.5 w-3.5" />
            {t('common:labels.email')}
          </div>
          <div className="flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs text-neutral-500">
            <Lock className="h-3.5 w-3.5" />
            {t('shell:auth.password')}
          </div>
          <div
            className="flex h-9 items-center justify-center rounded-md bg-neutral-900 text-xs font-medium text-white"
            style={accentButtonStyle(accent)}
          >
            {t('shell:auth.signIn')}
          </div>
        </div>
      </div>
    </div>
  );
};

export const LoginBrandingSettings: React.FC = () => {
  const { t } = useTranslation('settings');
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;

  const [saved, setSaved] = useState<LoginBranding>(EMPTY_LOGIN_BRANDING);
  const [hero, setHero] = useState<HeroDraft | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [accentInput, setAccentInput] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, 'organizations', orgId));
        if (cancelled) return;
        const data = snap.data() ?? {};
        const branding = sanitizeLoginBranding(data.login_branding);
        setSaved(branding);
        setHero(
          branding.hero_url && branding.hero_storage_path
            ? { url: branding.hero_url, path: branding.hero_storage_path }
            : null,
        );
        setTitle(branding.title ?? '');
        setSubtitle(branding.subtitle ?? '');
        setAccentInput(branding.accent ?? '');
        setLogoUrl(typeof data.logo_url === 'string' && data.logo_url ? data.logo_url : null);
      } catch (error) {
        console.error('Login branding load error:', error);
        if (!cancelled) {
          toast({ title: t('loginBranding.toasts.loadFailed'), variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [orgId, t, toast]);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('loginBranding.toasts.invalidTypeTitle'),
        description: t('loginBranding.toasts.invalidTypeDescription'),
        variant: 'destructive',
      });
      return;
    }
    if (file.size > LOGIN_HERO_MAX_BYTES) {
      toast({
        title: t('loginBranding.toasts.tooLargeTitle'),
        description: t('loginBranding.toasts.tooLargeDescription'),
        variant: 'destructive',
      });
      return;
    }
    if (!orgId) {
      toast({
        title: t('loginBranding.toasts.noOrgTitle'),
        description: t('loginBranding.toasts.noOrgDescription'),
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    try {
      const path = `organizations/${orgId}/branding/login-hero.${extensionFor(file)}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);
      setHero({ url, path });
      toast({
        title: t('loginBranding.toasts.uploadedTitle'),
        description: t('loginBranding.toasts.uploadedDescription'),
      });
    } catch (error) {
      console.error('Login hero upload error:', error);
      toast({
        title: t('loginBranding.toasts.uploadFailedTitle'),
        description: t('loginBranding.toasts.uploadFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveHero = async () => {
    const unsavedPath = hero && hero.path !== saved.hero_storage_path ? hero.path : null;
    setHero(null);
    if (unsavedPath) await deleteQuietly(unsavedPath);
  };

  const handleSave = async () => {
    if (!orgId) {
      toast({
        title: t('loginBranding.toasts.noOrgTitle'),
        description: t('loginBranding.toasts.noOrgDescription'),
        variant: 'destructive',
      });
      return;
    }
    if (accentInput.trim() && !normalizeHexColor(accentInput)) {
      toast({
        title: t('loginBranding.toasts.invalidAccentTitle'),
        description: t('loginBranding.toasts.invalidAccentDescription'),
        variant: 'destructive',
      });
      return;
    }

    const payload = sanitizeLoginBranding({
      hero_url: hero?.url ?? null,
      hero_storage_path: hero?.path ?? null,
      title,
      subtitle,
      accent: accentInput,
    });

    setSaving(true);
    try {
      await updateDoc(doc(db, 'organizations', orgId), { login_branding: payload });
      const stalePath = saved.hero_storage_path;
      if (stalePath && stalePath !== payload.hero_storage_path) await deleteQuietly(stalePath);
      setSaved(payload);
      setTitle(payload.title ?? '');
      setSubtitle(payload.subtitle ?? '');
      setAccentInput(payload.accent ?? '');
      toast({
        title: t('loginBranding.toasts.savedTitle'),
        description: t('loginBranding.toasts.savedDescription'),
      });
    } catch (error) {
      console.error('Login branding save error:', error);
      toast({
        title: t('loginBranding.toasts.saveFailedTitle'),
        description: t('loginBranding.toasts.saveFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  const accent = normalizeHexColor(accentInput);
  const busy = loading || uploading || saving;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('loginBranding.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('loginBranding.domainNote')}</p>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label>{t('loginBranding.hero.label')}</Label>
            {hero ? (
              <>
                <div className="overflow-hidden rounded-lg border bg-muted/40">
                  <img src={hero.url} alt={t('loginBranding.hero.alt')} className="aspect-[16/9] w-full object-cover" />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                  >
                    {uploading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Upload className="me-2 h-4 w-4" />}
                    {t('loginBranding.hero.change')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 text-destructive hover:text-destructive"
                    onClick={handleRemoveHero}
                    disabled={busy}
                  >
                    <X className="me-2 h-4 w-4" />
                    {t('loginBranding.hero.remove')}
                  </Button>
                </div>
              </>
            ) : (
              <div
                className={cn(
                  'cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors sm:p-8',
                  isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                )}
                <p className="mb-1 text-sm font-medium text-foreground">
                  {uploading ? t('loginBranding.hero.uploading') : t('loginBranding.hero.dragAndDrop')}
                </p>
                <p className="mb-3 text-xs text-muted-foreground">{t('loginBranding.hero.usingDefault')}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={busy}
                >
                  {t('loginBranding.hero.browseFiles')}
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('loginBranding.hero.hint')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-branding-title">{t('loginBranding.fields.title')}</Label>
            <Input
              id="login-branding-title"
              value={title}
              maxLength={LOGIN_BRANDING_TITLE_MAX}
              placeholder={t('shell:auth.welcomeBack')}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-branding-subtitle">{t('loginBranding.fields.subtitle')}</Label>
            <Textarea
              id="login-branding-subtitle"
              value={subtitle}
              rows={3}
              maxLength={LOGIN_BRANDING_SUBTITLE_MAX}
              placeholder={t('shell:auth.tagline')}
              onChange={(e) => setSubtitle(e.target.value)}
              disabled={busy}
            />
            <p className="text-end text-xs text-muted-foreground ltr-inline">
              {subtitle.length}/{LOGIN_BRANDING_SUBTITLE_MAX}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-branding-accent">{t('loginBranding.fields.accent')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                aria-label={t('loginBranding.fields.pickColor')}
                value={accent ?? '#1f1f1f'}
                onChange={(e) => setAccentInput(e.target.value)}
                disabled={busy}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Input
                id="login-branding-accent"
                value={accentInput}
                dir="ltr"
                maxLength={7}
                placeholder={t('loginBranding.fields.accentPlaceholder')}
                onChange={(e) => setAccentInput(e.target.value)}
                disabled={busy}
                className="w-36 font-mono"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAccentInput('')}
                disabled={busy || !accentInput}
              >
                <RotateCcw className="me-2 h-4 w-4" />
                {t('loginBranding.fields.clearAccent')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('loginBranding.fields.accentHint')}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('loginBranding.preview.label')}</Label>
          <LoginPreview
            orgName={currentOrganization?.name ?? ''}
            logoUrl={logoUrl}
            heroUrl={hero?.url ?? LOGIN_HERO_URL}
            title={title.trim() || t('shell:auth.welcomeBack')}
            subtitle={subtitle.trim() || t('shell:auth.tagline')}
            accent={accent}
          />
          <p className="text-xs text-muted-foreground">{t('loginBranding.preview.hint')}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={busy || !orgId} className="w-full sm:w-auto">
          {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
          {saving ? t('loginBranding.saving') : t('loginBranding.save')}
        </Button>
      </div>
    </div>
  );
};

export default LoginBrandingSettings;
