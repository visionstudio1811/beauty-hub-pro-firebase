import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { Trans, useTranslation } from 'react-i18next';
import { Loader2, MessageSquare, TestTube, ExternalLink, PhoneIncoming, PhoneOff } from 'lucide-react';

interface QuoIntegrationProps {
  integration?: any;
  onUpdate: () => void;
}

export const QuoIntegration: React.FC<QuoIntegrationProps> = ({ integration, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { currentOrganization } = useOrganization();
  const { t } = useTranslation('integrations');

  const [config, setConfig] = useState({
    apiKey: '', // write-only — never prefilled; blank means "keep saved key"
    fromNumber: integration?.configuration?.fromNumber || '',
    userId: integration?.configuration?.userId || '',
    isEnabled: integration?.is_enabled || false,
    isPrimary: integration?.is_primary || false,
  });

  const hasSecret = Boolean(integration?.has_secret);
  const secretLast4 = integration?.secret_last4 as string | undefined;
  const webhooksRegistered = Boolean(integration?.webhook_ids?.messages || integration?.webhook_ids?.calls);

  const handleSave = async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      // Non-secret config only — the apiKey goes to the write-only secret store.
      const configData: Record<string, unknown> = { fromNumber: config.fromNumber };
      if (config.userId) configData.userId = config.userId;

      await setDoc(
        doc(db, 'organizations', currentOrganization.id!, 'marketingIntegrations', 'quo'),
        {
          organization_id: currentOrganization.id,
          provider: 'quo',
          configuration: configData,
          is_enabled: config.isEnabled,
          is_primary: config.isPrimary,
          status: 'disconnected',
          updated_at: new Date().toISOString(),
          updated_at_ts: serverTimestamp(),
        },
        { merge: true }
      );

      // Save the API key into the server-only secret store (only if a new one
      // was entered — blank means keep the existing saved key).
      if (config.apiKey.trim()) {
        const saveSecret = httpsCallable(functions, 'saveIntegrationSecret');
        await saveSecret({ organizationId: currentOrganization.id, provider: 'quo', secret: { apiKey: config.apiKey.trim() } });
        setConfig((c) => ({ ...c, apiKey: '' }));
      }

      toast({
        title: t('quo.savedToast'),
        description: t('quo.savedToastDescription'),
      });

      onUpdate();
    } catch (error: any) {
      toast({ title: t('shared.errorSavingConfiguration'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!integration) {
      toast({
        title: t('shared.saveConfigurationFirst'),
        description: t('quo.saveFirstDescription'),
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    try {
      const testFn = httpsCallable(functions, 'testQuoIntegration');
      const result = await testFn({ integrationId: 'quo', organizationId: currentOrganization?.id });
      const data = result.data as { success?: boolean; error?: string };

      if (data.success) {
        toast({ title: t('shared.testSuccessful'), description: t('quo.testSuccessDescription') });
        onUpdate();
      } else {
        throw new Error(data.error || t('shared.testFailedGeneric'));
      }
    } catch (error: any) {
      toast({ title: t('shared.testFailed'), description: error.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleWebhooks = async () => {
    if (!integration) {
      toast({
        title: t('shared.saveConfigurationFirst'),
        description: t('quo.saveAndTestFirst'),
        variant: 'destructive',
      });
      return;
    }

    setSyncing(true);
    try {
      const fnName = webhooksRegistered ? 'unregisterQuoWebhooks' : 'registerQuoWebhooks';
      const fn = httpsCallable(functions, fnName);
      const result = await fn({ organizationId: currentOrganization?.id });
      const data = result.data as { success?: boolean; error?: string };
      if (!data.success) throw new Error(data.error || t('quo.requestFailed'));

      toast({
        title: webhooksRegistered ? t('quo.historySyncDisabled') : t('quo.historySyncEnabled'),
        description: webhooksRegistered
          ? t('quo.historySyncDisabledDescription')
          : t('quo.historySyncEnabledDescription'),
      });
      onUpdate();
    } catch (error: any) {
      toast({ title: t('quo.historySyncUpdateFailed'), description: error.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <MessageSquare className="h-5 w-5 me-2" />
            {t('quo.title')}
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://my.quo.com/', '_blank')}
            >
              <ExternalLink className="h-4 w-4 me-2" />
              {t('quo.dashboardButton')}
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {t(`shared.status.${integration.status}`, { defaultValue: integration.status })}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          {t('quo.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="quoApiKey">{t('shared.apiKey')}</Label>
            <Input
              id="quoApiKey"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={hasSecret ? t('shared.savedKeyPlaceholder', { last4: secretLast4 ?? '' }) : t('quo.apiKeyPlaceholder')}
              type="password"
            />
            {hasSecret && (
              <p className="text-xs text-muted-foreground mt-1">{t('shared.leaveBlankToKeepKey')}</p>
            )}
          </div>

          <div>
            <Label htmlFor="quoFromNumber">{t('quo.phoneNumberLabel')}</Label>
            <Input
              id="quoFromNumber"
              value={config.fromNumber}
              onChange={(e) => setConfig({ ...config, fromNumber: e.target.value })}
              placeholder={t('quo.phoneNumberPlaceholder')}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('quo.phoneNumberHelp')}
            </p>
          </div>

          <div>
            <Label htmlFor="quoUserId">{t('quo.userIdLabel')}</Label>
            <Input
              id="quoUserId"
              value={config.userId}
              onChange={(e) => setConfig({ ...config, userId: e.target.value })}
              placeholder={t('quo.userIdPlaceholder')}
            />
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Switch
              id="quoEnabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, isEnabled: checked })}
            />
            <Label htmlFor="quoEnabled">{t('quo.enableLabel')}</Label>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Switch
              id="quoPrimary"
              checked={config.isPrimary}
              onCheckedChange={(checked) => setConfig({ ...config, isPrimary: checked })}
            />
            <Label htmlFor="quoPrimary">{t('quo.primaryLabel')}</Label>
          </div>
        </div>

        {integration?.error_message && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{integration.error_message}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {t('shared.saveConfiguration')}
          </Button>

          {integration && (
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <TestTube className="h-4 w-4 me-2" />}
              {t('shared.testConnection')}
            </Button>
          )}

          {integration && (
            <Button variant="outline" onClick={handleToggleWebhooks} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : webhooksRegistered ? (
                <PhoneOff className="h-4 w-4 me-2" />
              ) : (
                <PhoneIncoming className="h-4 w-4 me-2" />
              )}
              {webhooksRegistered ? t('quo.disableHistorySync') : t('quo.enableHistorySync')}
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-2">{t('shared.setupInstructions')}</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>{t('quo.steps.generateKey')}</li>
            <li>{t('quo.steps.enterKey')}</li>
            <li><Trans t={t} i18nKey="quo.steps.saveThenTest" components={{ b: <strong /> }} /></li>
            <li><Trans t={t} i18nKey="quo.steps.enableSync" components={{ b: <strong /> }} /></li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
