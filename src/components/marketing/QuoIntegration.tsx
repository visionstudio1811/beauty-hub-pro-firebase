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
        title: 'Quo configuration saved',
        description: 'Your Quo settings have been saved successfully.',
      });

      onUpdate();
    } catch (error: any) {
      toast({ title: 'Error saving configuration', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!integration) {
      toast({
        title: 'Save configuration first',
        description: 'Please save your Quo configuration before testing.',
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
        toast({ title: 'Test successful', description: 'Quo connection is working properly.' });
        onUpdate();
      } else {
        throw new Error(data.error || 'Test failed');
      }
    } catch (error: any) {
      toast({ title: 'Test failed', description: error.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleWebhooks = async () => {
    if (!integration) {
      toast({
        title: 'Save configuration first',
        description: 'Save and test your Quo configuration before enabling history sync.',
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
      if (!data.success) throw new Error(data.error || 'Request failed');

      toast({
        title: webhooksRegistered ? 'History sync disabled' : 'History sync enabled',
        description: webhooksRegistered
          ? 'Quo will no longer send inbound SMS and call events to this CRM.'
          : 'Inbound SMS replies and call records will now appear in each client\'s history.',
      });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Could not update history sync', description: error.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            Quo SMS &amp; Call Sync
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://my.quo.com/', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Quo Dashboard
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {integration.status}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Send SMS campaigns and waivers through Quo, and sync inbound SMS replies and call
          records (with transcripts and summaries) into each client's history. Note: Quo's API
          cannot place outbound calls — it logs calls that happen through the Quo app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="quoApiKey">API Key</Label>
            <Input
              id="quoApiKey"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={hasSecret ? `••••${secretLast4 ?? ''} (saved)` : 'Enter your Quo API key'}
              type="password"
            />
            {hasSecret && (
              <p className="text-xs text-muted-foreground mt-1">Leave blank to keep your saved key.</p>
            )}
          </div>

          <div>
            <Label htmlFor="quoFromNumber">Quo Phone Number</Label>
            <Input
              id="quoFromNumber"
              value={config.fromNumber}
              onChange={(e) => setConfig({ ...config, fromNumber: e.target.value })}
              placeholder="+1234567890"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must be a number owned by your Quo workspace, in E.164 format.
            </p>
          </div>

          <div>
            <Label htmlFor="quoUserId">Sender User ID (optional)</Label>
            <Input
              id="quoUserId"
              value={config.userId}
              onChange={(e) => setConfig({ ...config, userId: e.target.value })}
              placeholder="US123abc — leave blank to send as the number owner"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="quoEnabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, isEnabled: checked })}
            />
            <Label htmlFor="quoEnabled">Enable Quo SMS</Label>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="quoPrimary"
              checked={config.isPrimary}
              onCheckedChange={(checked) => setConfig({ ...config, isPrimary: checked })}
            />
            <Label htmlFor="quoPrimary">Make Quo the default SMS provider</Label>
          </div>
        </div>

        {integration?.error_message && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{integration.error_message}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Configuration
          </Button>

          {integration && (
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
          )}

          {integration && (
            <Button variant="outline" onClick={handleToggleWebhooks} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : webhooksRegistered ? (
                <PhoneOff className="h-4 w-4 mr-2" />
              ) : (
                <PhoneIncoming className="h-4 w-4 mr-2" />
              )}
              {webhooksRegistered ? 'Disable History Sync' : 'Enable Call & SMS History Sync'}
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-2">Setup Instructions:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>In Quo → Workspace Settings → API, generate an API key</li>
            <li>Enter the key and one of your Quo phone numbers above</li>
            <li>Save, then click <strong>Test Connection</strong></li>
            <li>Click <strong>Enable Call &amp; SMS History Sync</strong> to log inbound replies and calls</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
