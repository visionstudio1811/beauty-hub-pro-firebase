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
import { Loader2, MessageSquare, TestTube, ExternalLink } from 'lucide-react';

interface TwilioIntegrationProps {
  integration?: any;
  onUpdate: () => void;
}

export const TwilioIntegration: React.FC<TwilioIntegrationProps> = ({ integration, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const { currentOrganization } = useOrganization();
  
  const [config, setConfig] = useState({
    accountSid: integration?.configuration?.accountSid || '',
    authToken: integration?.configuration?.authToken || '',
    phoneNumber: integration?.configuration?.phoneNumber || '',
    isEnabled: integration?.is_enabled || false
  });

  const handleSave = async () => {
    if (!currentOrganization?.id) return;

    setLoading(true);
    try {
      const configData = {
        accountSid: config.accountSid,
        authToken: config.authToken,
        phoneNumber: config.phoneNumber
      };

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

      toast({
        title: "Twilio configuration saved",
        description: "Your Twilio settings have been saved successfully."
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
        description: "Please save your Twilio configuration before testing.",
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
          title: "Test successful",
          description: "Twilio connection is working properly."
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
            <MessageSquare className="h-5 w-5 mr-2" />
            Twilio SMS Configuration
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('https://console.twilio.com/', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Twilio Console
            </Button>
            {integration?.status && (
              <Badge variant={integration.status === 'connected' ? 'default' : 'secondary'}>
                {integration.status}
              </Badge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Configure your Twilio account to send SMS campaigns. You'll need your Account SID, Auth Token, and a Twilio phone number.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="accountSid">Account SID</Label>
            <Input
              id="accountSid"
              value={config.accountSid}
              onChange={(e) => setConfig({ ...config, accountSid: e.target.value })}
              placeholder="Enter your Twilio Account SID"
              type="password"
            />
          </div>

          <div>
            <Label htmlFor="authToken">Auth Token</Label>
            <Input
              id="authToken"
              value={config.authToken}
              onChange={(e) => setConfig({ ...config, authToken: e.target.value })}
              placeholder="Enter your Twilio Auth Token"
              type="password"
            />
          </div>

          <div>
            <Label htmlFor="phoneNumber">Twilio Phone Number</Label>
            <Input
              id="phoneNumber"
              value={config.phoneNumber}
              onChange={(e) => setConfig({ ...config, phoneNumber: e.target.value })}
              placeholder="+1234567890"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="enabled"
              checked={config.isEnabled}
              onCheckedChange={(checked) => setConfig({ ...config, isEnabled: checked })}
            />
            <Label htmlFor="enabled">Enable Twilio SMS</Label>
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
            <li>Create a Twilio account at <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.twilio.com</a></li>
            <li>Find your Account SID and Auth Token in the dashboard</li>
            <li>Purchase or set up a phone number in Twilio</li>
            <li>Enter the credentials above and test the connection</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};