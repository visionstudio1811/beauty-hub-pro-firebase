import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useLanguage } from '@/i18n/LanguageProvider';
import { toast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { Check, Copy, CreditCard, ExternalLink, Loader2, TestTube } from 'lucide-react';

type PaymentProvider = 'stripe' | 'square';
type PaymentMode = 'test' | 'live';
type SquareEnvironment = 'sandbox' | 'production';

interface PaymentConfigState {
  provider: PaymentProvider | null;
  is_enabled: boolean;
  mode: PaymentMode;
  stripe: {
    publishable_key: string;
    has_secret_key: boolean;
    secret_key_last4: string | null;
    has_webhook_secret: boolean;
  };
  square: {
    location_id: string;
    environment: SquareEnvironment;
    has_access_token: boolean;
    access_token_last4: string | null;
    has_webhook_signature_key: boolean;
  };
}

interface SecretInputs {
  secret_key: string;
  webhook_secret: string;
  access_token: string;
  webhook_signature_key: string;
}

interface TestConnectionResponse {
  ok: boolean;
  error?: string;
  details?: {
    provider?: PaymentProvider;
    livemode?: boolean;
    available?: Array<{ amount: number; currency: string }>;
    environment?: SquareEnvironment;
    location_name?: string;
    location_status?: string;
    currency?: string | null;
  };
}

const EMPTY_CONFIG: PaymentConfigState = {
  provider: null,
  is_enabled: false,
  mode: 'test',
  stripe: { publishable_key: '', has_secret_key: false, secret_key_last4: null, has_webhook_secret: false },
  square: {
    location_id: '',
    environment: 'sandbox',
    has_access_token: false,
    access_token_last4: null,
    has_webhook_signature_key: false,
  },
};

const EMPTY_SECRETS: SecretInputs = { secret_key: '', webhook_secret: '', access_token: '', webhook_signature_key: '' };

function normalizeConfig(data: Record<string, any> | undefined): PaymentConfigState {
  const d = data ?? {};
  const stripe = d.stripe ?? {};
  const square = d.square ?? {};
  return {
    provider: d.provider === 'stripe' || d.provider === 'square' ? d.provider : null,
    is_enabled: d.is_enabled === true,
    mode: d.mode === 'live' ? 'live' : 'test',
    stripe: {
      publishable_key: typeof stripe.publishable_key === 'string' ? stripe.publishable_key : '',
      has_secret_key: stripe.has_secret_key === true,
      secret_key_last4: typeof stripe.secret_key_last4 === 'string' ? stripe.secret_key_last4 : null,
      has_webhook_secret: stripe.has_webhook_secret === true,
    },
    square: {
      location_id: typeof square.location_id === 'string' ? square.location_id : '',
      environment: square.environment === 'production' ? 'production' : 'sandbox',
      has_access_token: square.has_access_token === true,
      access_token_last4: typeof square.access_token_last4 === 'string' ? square.access_token_last4 : null,
      has_webhook_signature_key: square.has_webhook_signature_key === true,
    },
  };
}

export const PaymentIntegration: React.FC = () => {
  const { currentOrganization } = useOrganization();
  const { t } = useTranslation('payments');
  const { locale } = useLanguage();
  const orgId = currentOrganization?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [configExists, setConfigExists] = useState(false);
  const [config, setConfig] = useState<PaymentConfigState>(EMPTY_CONFIG);
  const [secrets, setSecrets] = useState<SecretInputs>(EMPTY_SECRETS);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState<PaymentProvider | null>(null);

  const functionsBase = `https://${import.meta.env.VITE_FIREBASE_REGION ?? 'us-central1'}-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net`;
  const stripeWebhookUrl = orgId ? `${functionsBase}/stripeWebhook?org=${encodeURIComponent(orgId)}` : '';
  const squareWebhookUrl = orgId ? `${functionsBase}/squareWebhook?org=${encodeURIComponent(orgId)}` : '';

  const loadConfig = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'organizations', orgId, 'paymentSettings', 'config'));
      setConfigExists(snap.exists());
      setConfig(snap.exists() ? normalizeConfig(snap.data()) : EMPTY_CONFIG);
    } catch (error) {
      console.error('Error loading payment settings:', error);
      toast({ title: t('toasts.loadFailed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const secretPlaceholder = (has: boolean, last4: string | null, fallback: string) => {
    if (!has) return fallback;
    return last4 ? t('secrets.savedPlaceholder', { last4 }) : t('secrets.savedNoLast4');
  };

  const validateBeforeEnable = (): string | null => {
    if (!config.is_enabled) return null;
    if (!config.provider) return t('toasts.selectProvider');
    if (config.provider === 'stripe' && !config.stripe.has_secret_key && !secrets.secret_key.trim()) {
      return t('toasts.stripeSecretRequired');
    }
    if (config.provider === 'square') {
      if (!config.square.has_access_token && !secrets.access_token.trim()) return t('toasts.squareTokenRequired');
      if (!config.square.location_id.trim()) return t('toasts.squareLocationRequired');
    }
    return null;
  };

  const handleSave = async () => {
    if (!orgId) {
      toast({ title: t('toasts.noOrg'), variant: 'destructive' });
      return;
    }
    const validationError = validateBeforeEnable();
    if (validationError) {
      toast({ title: t('toasts.saveFailed'), description: validationError, variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (config.provider) {
        const typed: Record<string, string> = {};
        if (config.provider === 'stripe') {
          if (secrets.secret_key.trim()) typed.secret_key = secrets.secret_key.trim();
          if (secrets.webhook_secret.trim()) typed.webhook_secret = secrets.webhook_secret.trim();
        } else {
          if (secrets.access_token.trim()) typed.access_token = secrets.access_token.trim();
          if (secrets.webhook_signature_key.trim()) typed.webhook_signature_key = secrets.webhook_signature_key.trim();
        }
        if (Object.keys(typed).length > 0) {
          const saveSecret = httpsCallable(functions, 'savePaymentSecret');
          await saveSecret({ organizationId: orgId, provider: config.provider, secret: typed });
        }
      }

      await setDoc(
        doc(db, 'organizations', orgId, 'paymentSettings', 'config'),
        {
          organization_id: orgId,
          provider: config.provider,
          is_enabled: config.is_enabled,
          mode: config.mode,
          stripe: { publishable_key: config.stripe.publishable_key.trim() || null },
          square: {
            location_id: config.square.location_id.trim() || null,
            environment: config.square.environment,
            notification_url: squareWebhookUrl,
          },
          updated_at: new Date().toISOString(),
        },
        { merge: true },
      );

      setSecrets(EMPTY_SECRETS);
      setTestResult(null);
      toast({ title: t('toasts.saved'), description: t('toasts.savedDescription') });
      await loadConfig();
    } catch (error: any) {
      console.error('Error saving payment settings:', error);
      toast({ title: t('toasts.saveFailed'), description: error?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatMoney = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100);
    } catch {
      return `${(amount / 100).toFixed(2)} ${currency}`;
    }
  };

  const handleTest = async () => {
    if (!orgId || !config.provider) return;
    setTesting(true);
    setTestResult(null);
    try {
      const testFn = httpsCallable(functions, 'testPaymentConnection');
      const result = await testFn({ organizationId: orgId, provider: config.provider });
      const data = result.data as TestConnectionResponse;
      if (data.ok) {
        const details = data.details ?? {};
        const message = config.provider === 'stripe'
          ? t('test.stripeSummary', {
              mode: details.livemode ? t('test.liveMode') : t('test.testMode'),
              balance: details.available && details.available.length > 0
                ? details.available.map((b) => formatMoney(b.amount, b.currency)).join(', ')
                : t('test.noBalance'),
            })
          : t('test.squareSummary', {
              name: details.location_name ?? config.square.location_id,
              status: details.location_status ?? '',
              currency: details.currency ?? '',
              environment: details.environment ?? config.square.environment,
            });
        setTestResult({ ok: true, message });
        toast({ title: t('toasts.testOk'), description: message });
      } else {
        const message = data.error || t('toasts.testFailedGeneric');
        setTestResult({ ok: false, message });
        toast({ title: t('toasts.testFailed'), description: message, variant: 'destructive' });
      }
    } catch (error: any) {
      const message = error?.message || t('toasts.testFailedGeneric');
      setTestResult({ ok: false, message });
      toast({ title: t('toasts.testFailed'), description: message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const copyUrl = async (provider: PaymentProvider, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(provider);
      toast({ title: t('webhooks.copied'), description: t('webhooks.copiedDescription') });
      window.setTimeout(() => setCopied((c) => (c === provider ? null : c)), 2000);
    } catch {
      toast({ title: t('webhooks.copyFailed'), variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const providerLabel = config.provider ? t(`provider.${config.provider}`) : null;
  const dashboardUrl = config.provider === 'square'
    ? 'https://developer.squareup.com/apps'
    : 'https://dashboard.stripe.com/webhooks';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center">
              <CreditCard className="h-5 w-5 me-2" />
              {t('title')}
            </div>
            <div className="flex items-center gap-2">
              {providerLabel && <Badge variant="outline">{providerLabel}</Badge>}
              <Badge variant={config.is_enabled ? 'default' : 'secondary'}>
                {config.is_enabled ? t('badges.enabled') : t('badges.disabled')}
              </Badge>
              {config.provider && (
                <Button variant="outline" size="sm" asChild>
                  <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 me-2" />
                    {t(`${config.provider}.dashboard`)}
                  </a>
                </Button>
              )}
            </div>
          </CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3">
            <Switch
              id="payments_enabled"
              checked={config.is_enabled}
              onCheckedChange={(checked) => setConfig((c) => ({ ...c, is_enabled: checked }))}
            />
            <div className="space-y-1">
              <Label htmlFor="payments_enabled">{t('enable.label')}</Label>
              <p className="text-xs text-muted-foreground">{t('enable.hint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="payments_provider">{t('provider.label')}</Label>
              <Select
                value={config.provider ?? ''}
                onValueChange={(value) => {
                  setTestResult(null);
                  setConfig((c) => ({ ...c, provider: value as PaymentProvider }));
                }}
              >
                <SelectTrigger id="payments_provider">
                  <SelectValue placeholder={t('provider.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe">{t('provider.stripe')}</SelectItem>
                  <SelectItem value="square">{t('provider.square')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payments_mode">{t('mode.label')}</Label>
              <Select
                value={config.mode}
                onValueChange={(value) => setConfig((c) => ({ ...c, mode: value as PaymentMode }))}
              >
                <SelectTrigger id="payments_mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">{t('mode.test')}</SelectItem>
                  <SelectItem value="live">{t('mode.live')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('mode.hint')}</p>
            </div>
          </div>

          {config.provider === 'stripe' && (
            <div className="space-y-4 rounded-md border p-4">
              <h3 className="font-medium">{t('stripe.title')}</h3>
              <div className="space-y-2">
                <Label htmlFor="stripe_publishable_key">{t('stripe.publishableKey')}</Label>
                <Input
                  id="stripe_publishable_key"
                  value={config.stripe.publishable_key}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, stripe: { ...c.stripe, publishable_key: e.target.value } }))
                  }
                  placeholder={t('stripe.publishableKeyPlaceholder')}
                  dir="ltr"
                  autoComplete="off"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stripe_secret_key">{t('stripe.secretKey')}</Label>
                  <Input
                    id="stripe_secret_key"
                    type="password"
                    value={secrets.secret_key}
                    onChange={(e) => setSecrets((s) => ({ ...s, secret_key: e.target.value }))}
                    placeholder={secretPlaceholder(config.stripe.has_secret_key, config.stripe.secret_key_last4, t('stripe.secretKeyPlaceholder'))}
                    dir="ltr"
                    autoComplete="new-password"
                  />
                  {config.stripe.has_secret_key && (
                    <p className="text-xs text-muted-foreground">{t('secrets.leaveBlank')}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stripe_webhook_secret">{t('stripe.webhookSecret')}</Label>
                  <Input
                    id="stripe_webhook_secret"
                    type="password"
                    value={secrets.webhook_secret}
                    onChange={(e) => setSecrets((s) => ({ ...s, webhook_secret: e.target.value }))}
                    placeholder={secretPlaceholder(config.stripe.has_webhook_secret, null, t('stripe.webhookSecretPlaceholder'))}
                    dir="ltr"
                    autoComplete="new-password"
                  />
                  {config.stripe.has_webhook_secret && (
                    <p className="text-xs text-muted-foreground">{t('secrets.leaveBlank')}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('secrets.writeOnly')}</p>
            </div>
          )}

          {config.provider === 'square' && (
            <div className="space-y-4 rounded-md border p-4">
              <h3 className="font-medium">{t('square.title')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="square_environment">{t('square.environment')}</Label>
                  <Select
                    value={config.square.environment}
                    onValueChange={(value) =>
                      setConfig((c) => ({ ...c, square: { ...c.square, environment: value as SquareEnvironment } }))
                    }
                  >
                    <SelectTrigger id="square_environment">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">{t('square.sandbox')}</SelectItem>
                      <SelectItem value="production">{t('square.production')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="square_location_id">{t('square.locationId')}</Label>
                  <Input
                    id="square_location_id"
                    value={config.square.location_id}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, square: { ...c.square, location_id: e.target.value } }))
                    }
                    placeholder={t('square.locationIdPlaceholder')}
                    dir="ltr"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="square_access_token">{t('square.accessToken')}</Label>
                  <Input
                    id="square_access_token"
                    type="password"
                    value={secrets.access_token}
                    onChange={(e) => setSecrets((s) => ({ ...s, access_token: e.target.value }))}
                    placeholder={secretPlaceholder(config.square.has_access_token, config.square.access_token_last4, t('square.accessTokenPlaceholder'))}
                    dir="ltr"
                    autoComplete="new-password"
                  />
                  {config.square.has_access_token && (
                    <p className="text-xs text-muted-foreground">{t('secrets.leaveBlank')}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="square_webhook_signature_key">{t('square.webhookSignatureKey')}</Label>
                  <Input
                    id="square_webhook_signature_key"
                    type="password"
                    value={secrets.webhook_signature_key}
                    onChange={(e) => setSecrets((s) => ({ ...s, webhook_signature_key: e.target.value }))}
                    placeholder={secretPlaceholder(config.square.has_webhook_signature_key, null, t('square.webhookSignatureKeyPlaceholder'))}
                    dir="ltr"
                    autoComplete="new-password"
                  />
                  {config.square.has_webhook_signature_key && (
                    <p className="text-xs text-muted-foreground">{t('secrets.leaveBlank')}</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('secrets.writeOnly')}</p>
            </div>
          )}

          {testResult && (
            <div
              className={
                testResult.ok
                  ? 'p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-700'
                  : 'p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600'
              }
            >
              {testResult.message}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {saving ? t('actions.saving') : t('actions.save')}
            </Button>
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || saving || !configExists || !config.provider}
            >
              {testing ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <TestTube className="h-4 w-4 me-2" />}
              {testing ? t('actions.testing') : t('actions.test')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('webhooks.title')}</CardTitle>
          <CardDescription>{t('webhooks.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t('webhooks.stripeLabel')}</Label>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex-1 p-2 bg-muted rounded font-mono text-xs break-all ltr-inline" dir="ltr">
                {stripeWebhookUrl}
              </div>
              <Button variant="outline" size="sm" onClick={() => copyUrl('stripe', stripeWebhookUrl)}>
                {copied === 'stripe' ? <Check className="h-4 w-4 me-2" /> : <Copy className="h-4 w-4 me-2" />}
                {copied === 'stripe' ? t('webhooks.copied') : t('webhooks.copy')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('webhooks.stripeHint')}</p>
          </div>

          <div className="space-y-2">
            <Label>{t('webhooks.squareLabel')}</Label>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex-1 p-2 bg-muted rounded font-mono text-xs break-all ltr-inline" dir="ltr">
                {squareWebhookUrl}
              </div>
              <Button variant="outline" size="sm" onClick={() => copyUrl('square', squareWebhookUrl)}>
                {copied === 'square' ? <Check className="h-4 w-4 me-2" /> : <Copy className="h-4 w-4 me-2" />}
                {copied === 'square' ? t('webhooks.copied') : t('webhooks.copy')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('webhooks.squareHint')}</p>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">{t('setup.title')}</p>
            <ol className="list-decimal list-inside space-y-1 text-start">
              {(['step1', 'step2', 'step3', 'step4'] as const).map((step) => (
                <li key={step}>{t(`setup.${config.provider ?? 'stripe'}.${step}`)}</li>
              ))}
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
