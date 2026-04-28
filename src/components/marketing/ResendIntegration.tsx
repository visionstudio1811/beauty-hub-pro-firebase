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
import { Loader2, Mail, TestTube, ExternalLink } from 'lucide-react';

interface ResendIntegrationProps {
  integration?: any;
  onUpdate: () => void;
}

export const ResendIntegration: React.FC<ResendIntegrationProps> = ({ integration, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { currentOrganization } = useOrganization();
  
  const [config, setConfig] = useState({
    apiKey: integration?.configuration?.apiKey || '',
    fromEmail: integration?.configuration?.fromEmail || '',
    fromName: integration?.configuration?.fromName || '',
    isEnabled: integration?.is_enabled || false
  });

  const handleSave = async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      const configData = {
        apiKey: config.apiKey,
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
          status: 'disconnected',
          updated_at: new Date().toISOString(),
          updated_at_ts: serverTimestamp(),
        },
        { merge: true }
      );

      toast({
        title: "Resend configuration saved",
        description: "Your Resend settings have been saved successfully."
      });

      onUpdate();
    } catch (error: any) {
      toast({
        title: "Error saving configuration",
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
        title: "Save configuration first",
        description: "Please save your Resend configuration before testing.",
        variant: "destructive"
      });
      return;
    }

    setTesting(true);
    try {
      const testFn = httpsCallable(functions, 'testResendIntegration');
      const result = await testFn({ integrationId: 'resend' });
      const data = result.data as { success?: boolean; error?: string };

      if (data.success) {
        toast({
          title: "Test successful",
          description: "Resend connection is working properly."
        });
        onUpdate();
      } else {
        throw new Error(data.error || 'Test failed');
      }
    } catch (error: any) {
      toast({
        title: "Test failed",
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
            <Mail className="h-5 w-5 mr-2" />
            Resend Email Configuration
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://resend.com/dashboard', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Resend Dashboard
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {integration.status}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Configure your Resend account to send email campaigns. You'll need an API key and verified domain.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="Enter your Resend API key"
              type="password"
            />
          </div>

          <div>
            <Label htmlFor="fromEmail">From Email Address</Label>
            <Input
              id="fromEmail"
              value={config.fromEmail}
              onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
              placeholder="noreply@yourdomain.com"
              type="email"
            />
          </div>

          <div>
            <Label htmlFor="fromName">From Name</Label>
            <Input
              id="fromName"
              value={config.fromName}
              onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
              placeholder="Your Business Name"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="enabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, isEnabled: checked })}
            />
            <Label htmlFor="enabled">Enable Resend Email</Label>
          </div>
        </div>

        {integration?.error_message && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{integration.error_message}</p>
          </div>
        )}

        <div className="flex space-x-2">
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Configuration
          </Button>
          
          {integration && (
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium mb-2">Setup Instructions:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Create a Resend account at <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">resend.com</a></li>
            <li>Verify your domain in the Resend dashboard</li>
            <li>Create an API key in the <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">API Keys section</a></li>
            <li>Enter your API key and verified email address above</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};