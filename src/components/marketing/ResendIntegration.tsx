import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  setDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { Trans, useTranslation } from 'react-i18next';
import { Loader2, Mail, TestTube, ExternalLink } from 'lucide-react';

interface ResendIntegrationProps {
  integration?: any;
  onUpdate: () => void;
}

const DEFAULT_LOW_SESSIONS_THRESHOLD = 2;

const normalizeThreshold = (value: unknown): number => {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_LOW_SESSIONS_THRESHOLD;
};

export const ResendIntegration: React.FC<ResendIntegrationProps> = ({ integration, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { currentOrganization } = useOrganization();
  const { t } = useTranslation('integrations');

  const [config, setConfig] = useState({
    apiKey: '', // write-only — never prefilled; blank means "keep saved key"
    fromEmail: integration?.configuration?.fromEmail || '',
    fromName: integration?.configuration?.fromName || '',
    isEnabled: integration?.is_enabled || false
  });

  const hasSecret = Boolean(integration?.has_secret);
  const secretLast4 = integration?.secret_last4 as string | undefined;

  const savedLowSessions = (integration?.email_automations?.low_sessions ?? {}) as {
    is_active?: boolean;
    sessions_threshold?: number;
  };
  const [lowSessions, setLowSessions] = useState({
    isActive: savedLowSessions.is_active !== false,
    threshold: normalizeThreshold(savedLowSessions.sessions_threshold),
  });

  const handleSave = async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      // Non-secret config only — the apiKey goes to the write-only secret store.
      const configData = {
        fromEmail: config.fromEmail,
        fromName: config.fromName
      };

      await setDoc(
        doc(db, 'organizations', currentOrganization.id!, 'marketingIntegrations', 'resend'),
        {
          organization_id: currentOrganization.id,
          provider: 'resend',
          configuration: configData,
          is_enabled: config.isEnabled,
          // Nested merge: sibling automations saved from the template designer are kept.
          email_automations: {
            low_sessions: {
              is_active: lowSessions.isActive,
              sessions_threshold: normalizeThreshold(lowSessions.threshold),
            },
          },
          status: 'disconnected',
          updated_at: new Date().toISOString(),
          updated_at_ts: serverTimestamp(),
        },
        { merge: true }
      );

      if (config.apiKey.trim()) {
        const saveSecret = httpsCallable(functions, 'saveIntegrationSecret');
        await saveSecret({ organizationId: currentOrganization.id, provider: 'resend', secret: { apiKey: config.apiKey.trim() } });
        setConfig((c) => ({ ...c, apiKey: '' }));
      }

      toast({
        title: t('resend.savedToast'),
        description: t('resend.savedToastDescription')
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: t('shared.errorSavingConfiguration'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!integration) {
      toast({
        title: t('shared.saveConfigurationFirst'),
        description: t('resend.saveFirstDescription'),
        variant: "destructive"
      });
      return;
    }

    setTesting(true);
    try {
      const testFn = httpsCallable(functions, 'testResendIntegration');
      const result = await testFn({ organizationId: currentOrganization?.id });
      const data = result.data as { success?: boolean; error?: string };

      if (data.success) {
        toast({
          title: t('shared.testSuccessful'),
          description: t('resend.testSuccessDescription')
        });
        onUpdate();
      } else {
        throw new Error(data.error || t('shared.testFailedGeneric'));
      }
    } catch (error: any) {
      toast({
        title: t('shared.testFailed'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Mail className="h-5 w-5 me-2" />
            {t('resend.title')}
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://resend.com/dashboard', '_blank')}
            >
              <ExternalLink className="h-4 w-4 me-2" />
              {t('resend.dashboardButton')}
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {t(`shared.status.${integration.status}`, { defaultValue: integration.status })}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          {t('resend.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="apiKey">{t('shared.apiKey')}</Label>
            <Input
              id="apiKey"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={hasSecret ? t('shared.savedKeyPlaceholder', { last4: secretLast4 ?? '' }) : t('resend.apiKeyPlaceholder')}
              type="password"
            />
            {hasSecret && (
              <p className="text-xs text-muted-foreground mt-1">{t('shared.leaveBlankToKeepKey')}</p>
            )}
          </div>

          <div>
            <Label htmlFor="fromEmail">{t('resend.fromEmailLabel')}</Label>
            <Input
              id="fromEmail"
              value={config.fromEmail}
              onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
              placeholder={t('resend.fromEmailPlaceholder')}
              type="email"
              dir="ltr"
            />
          </div>

          <div>
            <Label htmlFor="fromName">{t('resend.fromNameLabel')}</Label>
            <Input
              id="fromName"
              value={config.fromName}
              onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
              placeholder={t('resend.fromNamePlaceholder')}
            />
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Switch
              id="enabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, isEnabled: checked })}
            />
            <Label htmlFor="enabled">{t('resend.enableLabel')}</Label>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Label htmlFor="lowSessionsActive" className="font-medium">
                    {t('resend.automations.lowSessions.title')}
                  </Label>
                  {lowSessions.isActive && <Badge variant="default">{t('common:labels.active')}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('resend.automations.lowSessions.description')}
                </p>
              </div>
              <Switch
                id="lowSessionsActive"
                checked={lowSessions.isActive}
                onCheckedChange={(checked) => setLowSessions((s) => ({ ...s, isActive: checked }))}
              />
            </div>
            {lowSessions.isActive && (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="lowSessionsThreshold" className="text-xs whitespace-nowrap">
                  {t('resend.automations.lowSessions.threshold')}
                </Label>
                <Input
                  id="lowSessionsThreshold"
                  type="number"
                  min={1}
                  max={50}
                  value={lowSessions.threshold}
                  onChange={(e) => setLowSessions((s) => ({ ...s, threshold: parseInt(e.target.value, 10) || 0 }))}
                  className="w-20 h-8"
                />
                <span className="text-xs text-muted-foreground">{t('resend.automations.lowSessions.thresholdHelp')}</span>
              </div>
            )}
          </div>
        </div>

        {integration?.error_message && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{integration.error_message}</p>
          </div>
        )}

        <div className="flex space-x-2 rtl:space-x-reverse">
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {t('shared.saveConfiguration')}
          </Button>
          
          {integration && (
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 me-2" />
              )}
              {t('shared.testConnection')}
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-2">{t('shared.setupInstructions')}</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              <Trans
                t={t}
                i18nKey="resend.steps.createAccount"
                components={{ a: <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" /> }}
              />
            </li>
            <li>{t('resend.steps.verifyDomain')}</li>
            <li>
              <Trans
                t={t}
                i18nKey="resend.steps.createKey"
                components={{ a: <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" /> }}
              />
            </li>
            <li>{t('resend.steps.enterKey')}</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};