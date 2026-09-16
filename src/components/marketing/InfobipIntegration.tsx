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
import { Loader2, MessageSquare, ExternalLink } from 'lucide-react';

interface InfobipIntegrationProps {
  integration?: any;
  onUpdate: () => void;
}

export const InfobipIntegration: React.FC<InfobipIntegrationProps> = ({ integration, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const { currentOrganization } = useOrganization();
  const { t } = useTranslation('integrations');

  const [config, setConfig] = useState({
    apiKey:    '', // write-only — never prefilled; blank means "keep saved key"
    sender:    integration?.configuration?.sender    || '',
    baseUrl:   integration?.configuration?.baseUrl   || 'https://api.infobip.com',
    isEnabled: integration?.is_enabled || false,
  });

  const hasSecret = Boolean(integration?.has_secret);
  const secretLast4 = integration?.secret_last4 as string | undefined;

  const handleSave = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      await setDoc(
        doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'infobip'),
        {
          organization_id: currentOrganization.id,
          provider: 'infobip',
          // Non-secret config only — apiKey goes to the write-only secret store.
          configuration: {
            sender:  config.sender,
            baseUrl: config.baseUrl,
          },
          is_enabled: config.isEnabled,
          status: 'disconnected',
          updated_at: new Date().toISOString(),
          updated_at_ts: serverTimestamp(),
        },
        { merge: true }
      );

      if (config.apiKey.trim()) {
        const saveSecret = httpsCallable(functions, 'saveIntegrationSecret');
        await saveSecret({ organizationId: currentOrganization.id, provider: 'infobip', secret: { apiKey: config.apiKey.trim() } });
        setConfig((c) => ({ ...c, apiKey: '' }));
      }

      toast({ title: t('infobip.savedToast') });
      onUpdate();
    } catch (error: any) {
      toast({ title: t('shared.errorSavingConfiguration'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <MessageSquare className="h-5 w-5 me-2" />
            {t('infobip.title')}
          </div>
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Button variant="outline" size="sm" onClick={() => window.open('https://portal.infobip.com/', '_blank')}>
              <ExternalLink className="h-4 w-4 me-2" />
              {t('infobip.portalButton')}
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {t(`shared.status.${integration.status}`, { defaultValue: integration.status })}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          {t('infobip.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="ib-apiKey">{t('shared.apiKey')}</Label>
            <Input
              id="ib-apiKey"
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={hasSecret ? t('shared.savedKeyPlaceholder', { last4: secretLast4 ?? '' }) : t('infobip.apiKeyPlaceholder')}
            />
            {hasSecret && (
              <p className="text-xs text-muted-foreground mt-1">{t('shared.leaveBlankToKeepKey')}</p>
            )}
          </div>

          <div>
            <Label htmlFor="ib-sender">{t('infobip.senderLabel')}</Label>
            <Input
              id="ib-sender"
              value={config.sender}
              onChange={(e) => setConfig({ ...config, sender: e.target.value })}
              placeholder={t('infobip.senderPlaceholder')}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('infobip.senderHelp')}
            </p>
          </div>

          <div>
            <Label htmlFor="ib-baseUrl">{t('infobip.baseUrlLabel')}</Label>
            <Input
              id="ib-baseUrl"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              placeholder={t('infobip.baseUrlPlaceholder')}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-1">
              <Trans t={t} i18nKey="infobip.baseUrlHelp" components={{ code: <code dir="ltr" /> }} />
            </p>
          </div>

          <div className="flex items-center space-x-2 rtl:space-x-reverse">
            <Switch
              id="ib-enabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, isEnabled: checked })}
            />
            <Label htmlFor="ib-enabled">{t('infobip.enableLabel')}</Label>
          </div>
        </div>

        <Button onClick={handleSave} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
          {t('shared.saveConfiguration')}
        </Button>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-2">{t('shared.setupInstructions')}</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              <Trans
                t={t}
                i18nKey="infobip.steps.signUp"
                components={{ a: <a href="https://portal.infobip.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" /> }}
              />
            </li>
            <li><Trans t={t} i18nKey="infobip.steps.createKey" components={{ b: <strong /> }} /></li>
            <li>{t('infobip.steps.noteBaseUrl')}</li>
            <li>{t('infobip.steps.enterSender')}</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
