import React, { useState, useEffect, useMemo } from 'react';
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '@/contexts/AuthContext';
import { LoginFloralCorner } from '@/components/auth/LoginFloralCorner';
import { auth, functions } from '@/lib/firebase';
import {
  LOGIN_HERO_URL,
  accentButtonStyle,
  heroBackgroundImage,
  isWhiteLabelHost,
  sanitizeLoginBranding,
  type LoginBranding,
} from '@/lib/loginBranding';
import { Wordmark } from '@/components/public-site/Wordmark';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

const GoogleIcon = () => (
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

interface HostBranding {
  name: string;
  logoUrl: string | null;
  branding: LoginBranding;
}

interface PortalOrgPayload {
  organization?: {
    name?: unknown;
    logo_url?: unknown;
    login_branding?: unknown;
  };
}

export default function Auth() {
  const { t } = useTranslation('shell');
  const whiteLabel = useMemo(() => isWhiteLabelHost(window.location.hostname), []);
  const [hostBranding, setHostBranding] = useState<HostBranding | null>(null);
  const [brandingPending, setBrandingPending] = useState(whiteLabel);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, signInWithGoogle, signInWithEmail } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!whiteLabel) return;
    let cancelled = false;
    const previousTitle = document.title;
    const resolveHostBranding = async () => {
      try {
        const getOrg = httpsCallable<{ host: string }, PortalOrgPayload>(functions, 'getClientPortalOrg');
        const result = await getOrg({ host: window.location.hostname });
        if (cancelled) return;
        const org = result.data?.organization;
        if (!org) return;
        const name = typeof org.name === 'string' ? org.name.trim() : '';
        const logoUrl = typeof org.logo_url === 'string' && org.logo_url.trim() ? org.logo_url.trim() : null;
        setHostBranding({ name, logoUrl, branding: sanitizeLoginBranding(org.login_branding) });
        if (name) document.title = name;
      } catch {
        return;
      } finally {
        if (!cancelled) setBrandingPending(false);
      }
    };
    resolveHostBranding();
    return () => {
      cancelled = true;
      document.title = previousTitle;
    };
  }, [whiteLabel]);

  const applyPersistence = async () => {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await applyPersistence();
      await signInWithGoogle();
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      toast({
        title: t('auth.toasts.signInFailed'),
        description: t('auth.toasts.googleFailed'),
        variant: 'destructive',
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: t('auth.toasts.missingInfo'),
        description: t('auth.toasts.missingInfoDescription'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await applyPersistence();
      await signInWithEmail(email, password);
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : '';
      const description =
        code === 'auth/too-many-requests'
          ? t('auth.toasts.tooManyAttempts')
          : t('auth.toasts.invalidCredentials');
      toast({ title: t('auth.toasts.signInFailed'), description, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const branding = hostBranding?.branding ?? null;
  const customHero = Boolean(branding?.hero_url);
  const heroStyle = brandingPending
    ? undefined
    : { backgroundImage: heroBackgroundImage(branding?.hero_url ?? LOGIN_HERO_URL) };
  const heading = branding?.title ?? t('auth.welcomeBack');
  const tagline = branding?.subtitle ?? t('auth.tagline');
  const submitStyle = accentButtonStyle(branding?.accent);
  const showPlatformBrand = !whiteLabel || (!brandingPending && !hostBranding);

  return (
    <div className="gc-site flex min-h-screen flex-col items-center justify-center bg-cream p-0 sm:p-6 md:p-8">
      <div
        className={cn(
          'flex w-full max-w-6xl flex-1 flex-col overflow-hidden bg-[rgb(var(--c-cream2))] shadow-2xl ring-1 ring-black/5',
          'sm:max-h-[min(920px,calc(100vh-3rem))] sm:flex-initial sm:rounded-2xl lg:flex-row lg:min-h-[580px]',
        )}
      >
        <div
          className="relative flex min-h-[42vh] flex-1 flex-col justify-between bg-neutral-900 bg-cover bg-center px-8 py-10 text-white lg:min-h-0 lg:w-1/2 lg:rounded-s-2xl lg:py-12"
          style={heroStyle}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/20 lg:rounded-s-2xl" aria-hidden />
          <div className="relative z-10 min-h-[4.5rem]">
            {showPlatformBrand ? (
              <Wordmark className="text-4xl text-white drop-shadow-md" />
            ) : hostBranding ? (
              hostBranding.logoUrl ? (
                <img
                  src={hostBranding.logoUrl}
                  alt={hostBranding.name}
                  className="h-14 w-auto max-w-[220px] rounded-md bg-white/95 object-contain p-1.5 shadow-md"
                />
              ) : (
                <span className="font-display text-4xl font-semibold text-white drop-shadow-md">{hostBranding.name}</span>
              )
            ) : null}
            {!brandingPending && (
              <p className="mt-2 font-sans text-xs font-medium uppercase tracking-[0.35em] text-white/85">{t('auth.staffWorkspace')}</p>
            )}
          </div>

          {!brandingPending && (
            <div className="relative z-10 mt-8 max-w-md space-y-4 lg:mt-0">
              <p className="font-sans text-xs font-medium uppercase tracking-[0.35em] text-white/80">{t('auth.crmSignIn')}</p>
              <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{heading}</h1>
              <p className="font-sans text-sm leading-relaxed text-white/85">
                {tagline}
              </p>
            </div>
          )}

          <p className="relative z-10 mt-10 font-sans text-sm text-white/75 lg:mt-12">
            {t('auth.secureAccess')}
          </p>
        </div>

        <div className="relative flex flex-1 flex-col justify-center bg-[rgb(var(--c-cream2))] px-6 py-10 sm:px-10 lg:w-1/2 lg:rounded-e-2xl lg:px-12 lg:py-14">
          {!customHero && (
            <LoginFloralCorner className="absolute end-0 top-0 h-56 w-56 -translate-y-2 translate-x-4 rtl:-translate-x-4 sm:h-64 sm:w-64" />
          )}

          <div className="absolute start-4 top-4 z-20 sm:start-6 sm:top-6">
            <LanguageSwitcher variant="full" persist />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-md space-y-8">
            <div className="space-y-2">
              <h2 className="font-display text-3xl font-semibold text-foreground">{t('auth.signIn')}</h2>
              <p className="font-sans text-sm text-muted-foreground">
                {t('auth.instructions')}
              </p>
            </div>

            <div className="space-y-5 font-sans">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full gap-2 rounded-lg border-border/80 bg-white text-base shadow-sm"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || isLoading}
              >
                <GoogleIcon />
                {googleLoading ? t('auth.signingIn') : t('auth.continueWithGoogle')}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <span className="w-full border-t border-border/70" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[rgb(var(--c-cream2))] px-3 font-medium uppercase tracking-wide text-muted-foreground">{t('auth.or')}</span>
                </div>
              </div>

              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="staff-email">{t('common:labels.email')}</Label>
                  <div className="relative">
                    <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="staff-email"
                      type="email"
                      placeholder={t('auth.emailPlaceholder')}
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 rounded-lg border-border/80 bg-white ps-10 text-base shadow-sm"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff-password">{t('auth.password')}</Label>
                  <div className="relative">
                    <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="staff-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('auth.passwordPlaceholder')}
                      dir="ltr"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 rounded-lg border-border/80 bg-white ps-10 pe-12 text-base shadow-sm"
                      autoComplete="current-password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute end-1 top-1/2 h-9 -translate-y-1/2 px-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 text-sm text-foreground">
                  <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(v === true)} />
                  {t('auth.rememberMe')}
                </label>

                <Button
                  type="submit"
                  className={cn(
                    'h-12 w-full rounded-lg bg-foreground text-base font-medium text-background hover:bg-foreground/90',
                    submitStyle && 'hover:opacity-90',
                  )}
                  style={submitStyle}
                  disabled={isLoading || googleLoading}
                >
                  {isLoading ? t('auth.signingIn') : t('auth.signIn')}
                </Button>
              </form>
            </div>

            <p className="text-center font-sans text-xs text-muted-foreground">
              {t('auth.accountsNote')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
