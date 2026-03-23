import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TwilioIntegration } from './TwilioIntegration';
import { ResendIntegration } from './ResendIntegration';
import { EmailTemplateDesigner } from './EmailTemplateDesigner';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, MessageSquare, Mail, Settings, Palette } from 'lucide-react';

interface MarketingIntegration {
  id: string;
  provider: string;
  is_enabled: boolean;
  status: string;
  configuration: any;
  last_tested_at: string | null;
  error_message: string | null;
}

export const MarketingIntegrations: React.FC = () => {
  const [integrations, setIntegrations] = useState<MarketingIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentOrganization } = useOrganization();

  const fetchIntegrations = async () => {
    if (!currentOrganization?.id) return;

    try {
      const snap = await getDocs(
        collection(db, 'organizations', currentOrganization.id, 'marketingIntegrations')
      );
      setIntegrations(snap.docs.map(d => ({ id: d.id, ...d.data() } as MarketingIntegration)));
    } catch (error: any) {
      toast({
        title: "Error loading integrations",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, [currentOrganization?.id]);

  const getIntegrationByProvider = (provider: string) => {
    return integrations.find(int => int.provider === provider);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-100 text-green-800">Connected</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Disconnected</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading integrations...</span>
      </div>
    );
  }

  const twilioIntegration = getIntegrationByProvider('twilio');
  const resendIntegration = getIntegrationByProvider('resend');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Marketing Integrations</h2>
        <p className="text-muted-foreground">
          Connect your organization with SMS and email providers to send marketing campaigns.
        </p>
      </div>

      {/* Integration Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex-1">
              <CardTitle className="text-base font-medium flex items-center">
                <MessageSquare className="h-4 w-4 mr-2" />
                Twilio SMS
              </CardTitle>
              <CardDescription>Send SMS campaigns to your clients</CardDescription>
            </div>
            <div>
              {getStatusBadge(twilioIntegration?.status || 'disconnected')}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {twilioIntegration?.is_enabled 
                ? 'Ready to send SMS campaigns'
                : 'Configure Twilio to start sending SMS campaigns'
              }
            </p>
            {twilioIntegration?.error_message && (
              <p className="text-sm text-red-600 mt-2">{twilioIntegration.error_message}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex-1">
              <CardTitle className="text-base font-medium flex items-center">
                <Mail className="h-4 w-4 mr-2" />
                Resend Email
              </CardTitle>
              <CardDescription>Send email campaigns to your clients</CardDescription>
            </div>
            <div>
              {getStatusBadge(resendIntegration?.status || 'disconnected')}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {resendIntegration?.is_enabled 
                ? 'Ready to send email campaigns'
                : 'Configure Resend to start sending email campaigns'
              }
            </p>
            {resendIntegration?.error_message && (
              <p className="text-sm text-red-600 mt-2">{resendIntegration.error_message}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Integration Configuration Tabs */}
      <Tabs defaultValue="twilio" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="twilio" className="flex items-center">
            <MessageSquare className="h-4 w-4 mr-2" />
            Twilio SMS
          </TabsTrigger>
          <TabsTrigger value="resend" className="flex items-center">
            <Mail className="h-4 w-4 mr-2" />
            Resend Email
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center">
            <Palette className="h-4 w-4 mr-2" />
            Email Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="twilio">
          <TwilioIntegration 
            integration={twilioIntegration}
            onUpdate={fetchIntegrations}
          />
        </TabsContent>

        <TabsContent value="resend">
          <ResendIntegration 
            integration={resendIntegration}
            onUpdate={fetchIntegrations}
          />
        </TabsContent>

        <TabsContent value="templates">
          <EmailTemplateDesigner onUpdate={fetchIntegrations} />
        </TabsContent>
      </Tabs>
    </div>
  );
};