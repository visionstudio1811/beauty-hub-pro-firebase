import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, MessageSquare, ExternalLink } from 'lucide-react';

interface InfobipIntegrationProps {
  integration?: any;
  onUpdate: () => void;
}

export const InfobipIntegration: React.FC<InfobipIntegrationProps> = ({ integration, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const { currentOrganization } = useOrganization();

  const [config, setConfig] = useState({
    apiKey:    integration?.configuration?.apiKey    || '',
    sender:    integration?.configuration?.sender    || '',
    baseUrl:   integration?.configuration?.baseUrl   || 'https://api.infobip.com',
    isEnabled: integration?.is_enabled || false,
  });

  const handleSave = async () => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    try {
      await setDoc(
        doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'infobip'),
        {
          organization_id: currentOrganization.id,
          provider: 'infobip',
          configuration: {
            apiKey:  config.apiKey,
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
      toast({ title: 'Infobip configuration saved' });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Error saving configuration', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            Infobip SMS Configuration
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => window.open('https://portal.infobip.com/', '_blank')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Infobip Portal
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {integration.status}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Configure Infobip to send SMS and OTP verification codes to clients.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="ib-apiKey">API Key</Label>
            <Input
              id="ib-apiKey"
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="Your Infobip API key"
            />
          </div>

          <div>
            <Label htmlFor="ib-sender">Sender Name / Number</Label>
            <Input
              id="ib-sender"
              value={config.sender}
              onChange={(e) => setConfig({ ...config, sender: e.target.value })}
              placeholder="e.g. Lumiere or +1234567890"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Alphanumeric sender IDs (e.g. "Lumiere") require pre-registration in some countries.
            </p>
          </div>

          <div>
            <Label htmlFor="ib-baseUrl">API Base URL</Label>
            <Input
              id="ib-baseUrl"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              placeholder="https://api.infobip.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Found in your Infobip portal under API settings (e.g. <code>xxxxx.api.infobip.com</code>).
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="ib-enabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, isEnabled: checked })}
            />
            <Label htmlFor="ib-enabled">Enable Infobip SMS</Label>
          </div>
        </div>

        <Button onClick={handleSave} disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Configuration
        </Button>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-2">Setup Instructions:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Sign up or log in at <a href="https://portal.infobip.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">portal.infobip.com</a></li>
            <li>Go to <strong>API Keys</strong> and create a new key</li>
            <li>Note your custom API base URL from the portal</li>
            <li>Enter sender name (register alphanumeric senders if required)</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
