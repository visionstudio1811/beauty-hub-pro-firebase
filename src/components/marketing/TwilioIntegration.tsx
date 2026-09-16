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
import { Loader2, MessageSquare, TestTube, ExternalLink } from 'lucide-react';

interface TwilioIntegrationProps {
  integration?: any;
  onUpdate: () => void;
}

export const TwilioIntegration: React.FC<TwilioIntegrationProps> = ({ integration, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { currentOrganization } = useOrganization();
  const { t } = useTranslation('integrations');

  const [config, setConfig] = useState({
    accountSid: '', // write-only — never prefilled
    authToken: '',  // write-only — never prefilled
    phoneNumber: integration?.configuration?.phoneNumber || '',
    isEnabled: integration?.is_enabled || false
  });

  const hasSecret = Boolean(integration?.has_secret);
  const secretLast4 = integration?.secret_last4 as string | undefined;

  const handleSave = async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      // Non-secret config only — accountSid/authToken go to the write-only secret store.
      const configData = { phoneNumber: config.phoneNumber };

      await setDoc(
        doc(db, 'organizations', currentOrganization.id!, 'marketingIntegrations', 'twilio'),
        {
          organization_id: currentOrganization.id,
          provider: 'twilio',
          configuration: configData,
          is_enabled: config.isEnabled,
          status: 'disconnected',
          updated_at: new Date().toISOString(),
          updated_at_ts: serverTimestamp(),
        },
        { merge: true }
      );

      const secret: Record<string, string> = {};
      if (config.accountSid.trim()) secret.accountSid = config.accountSid.trim();
      if (config.authToken.trim()) secret.authToken = config.authToken.trim();
      if (Object.keys(secret).length > 0) {
        const saveSecret = httpsCallable(functions, 'saveIntegrationSecret');
        await saveSecret({ organizationId: currentOrganization.id, provider: 'twilio', secret });
        setConfig((c) => ({ ...c, accountSid: '', authToken: '' }));
      }

      toast({
        title: t('twilio.savedToast'),
        description: t('twilio.savedToastDescription')
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
        description: t('twilio.saveFirstDescription'),
        variant: "destructive"
      });
      return;
    }

    setTesting(true);
    try {
      const testFn = httpsCallable(functions, 'testTwilioIntegration');
      const result = await testFn({ integrationId: 'twilio' });
      const data = result.data as { success?: boolean; error?: string };

      if (data.success) {
        toast({
          title: t('shared.testSuccessful'),
          description: t('twilio.testSuccessDescription')
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
            <MessageSquare className="h-5 w-5 me-2" />
            {t('twilio.title')}
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://console.twilio.com/', '_blank')}
            >
              <ExternalLink className="h-4 w-4 me-2" />
              {t('twilio.consoleButton')}
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {t(`shared.status.${integration.status}`, { defaultValue: integration.status })}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          {t('twilio.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="accountSid">{t('twilio.accountSidLabel')}</Label>
            <Input
              id="accountSid"
              value={config.accountSid}
              onChange={(e) => setConfig({ ...config, accountSid: e.target.value })}
              placeholder={hasSecret ? t('shared.savedPlaceholder') : t('twilio.accountSidPlaceholder')}
              type="password"
            />
          </div>

          <div>
            <Label htmlFor="authToken">{t('twilio.authTokenLabel')}</Label>
            <Input
              id="authToken"
              value={config.authToken}
              onChange={(e) => setConfig({ ...config, authToken: e.target.value })}
              placeholder={hasSecret ? t('shared.savedKeyPlaceholder', { last4: secretLast4 ?? '' }) : t('twilio.authTokenPlaceholder')}
              type="password"
            />
            {hasSecret && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('twilio.leaveBlankToKeepCredentials')}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="phoneNumber">{t('twilio.phoneNumberLabel')}</Label>
            <Input
              id="phoneNumber"
              value={config.phoneNumber}
              onChange={(e) => setConfig({ ...config, phoneNumber: e.target.value })}
              placeholder={t('twilio.phoneNumberPlaceholder')}
              dir="ltr"
            />
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Switch
              id="enabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, isEnabled: checked })}
            />
            <Label htmlFor="enabled">{t('twilio.enableLabel')}</Label>
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
                i18nKey="twilio.steps.createAccount"
                components={{ a: <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" /> }}
              />
            </li>
            <li>{t('twilio.steps.findCredentials')}</li>
            <li>{t('twilio.steps.setupNumber')}</li>
            <li>{t('twilio.steps.enterAndTest')}</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};