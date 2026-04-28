import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TwilioIntegration } from './TwilioIntegration';
import { ResendIntegration } from './ResendIntegration';
import { InfobipIntegration } from './InfobipIntegration';
import { EmailTemplateDesigner } from './EmailTemplateDesigner';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, MessageSquare, Mail, Palette } from 'lucide-react';

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
      const [twilioSnap, resendSnap, infobipSnap] = await Promise.all([
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'twilio')),
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'resend')),
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'infobip')),
      ]);
      const results: MarketingIntegration[] = [];
      if (twilioSnap.exists())  results.push({ id: twilioSnap.id,  ...twilioSnap.data()  } as MarketingIntegration);
      if (resendSnap.exists())  results.push({ id: resendSnap.id,  ...resendSnap.data()  } as MarketingIntegration);
      if (infobipSnap.exists()) results.push({ id: infobipSnap.id, ...infobipSnap.data() } as MarketingIntegration);
      setIntegrations(results);
    } catch (error: any) {
      toast({ title: 'Error loading integrations', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIntegrations(); }, [currentOrganization?.id]);

  const byProvider = (p: string) => integrations.find(i => i.provider === p);

  const statusBadge = (status: string) => {
    if (status === 'connected') return <Badge className="bg-green-100 text-green-800">Connected</Badge>;
    if (status === 'error')     return <Badge variant="destructive">Error</Badge>;
    return <Badge variant="secondary">Disconnected</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading integrations...</span>
      </div>
    );
  }

  const twilio  = byProvider('twilio');
  const resend  = byProvider('resend');
  const infobip = byProvider('infobip');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Marketing Integrations</h2>
        <p className="text-muted-foreground">Connect SMS and email providers to send forms, campaigns, and OTP codes.</p>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex-1">
              <CardTitle className="text-base font-medium flex items-center">
                <MessageSquare className="h-4 w-4 mr-2" />Twilio SMS
              </CardTitle>
              <CardDescription>SMS campaigns</CardDescription>
            </div>
            {statusBadge(twilio?.status || 'disconnected')}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{twilio?.is_enabled ? 'Ready' : 'Not configured'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex-1">
              <CardTitle className="text-base font-medium flex items-center">
                <MessageSquare className="h-4 w-4 mr-2" />Infobip SMS + OTP
              </CardTitle>
              <CardDescription>SMS with OTP verification</CardDescription>
            </div>
            {statusBadge(infobip?.status || 'disconnected')}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{infobip?.is_enabled ? 'Ready' : 'Not configured'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center space-y-0 pb-2">
            <div className="flex-1">
              <CardTitle className="text-base font-medium flex items-center">
                <Mail className="h-4 w-4 mr-2" />Resend Email
              </CardTitle>
              <CardDescription>Email campaigns</CardDescription>
            </div>
            {statusBadge(resend?.status || 'disconnected')}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{resend?.is_enabled ? 'Ready' : 'Not configured'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Config tabs */}
      <Tabs defaultValue="infobip" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="infobip" className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />Infobip
          </TabsTrigger>
          <TabsTrigger value="twilio" className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />Twilio
          </TabsTrigger>
          <TabsTrigger value="resend" className="flex items-center gap-1.5">
            <Mail className="h-4 w-4" />Resend Email
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5">
            <Palette className="h-4 w-4" />Email Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="infobip">
          <InfobipIntegration integration={infobip} onUpdate={fetchIntegrations} />
        </TabsContent>
        <TabsContent value="twilio">
          <TwilioIntegration integration={twilio} onUpdate={fetchIntegrations} />
        </TabsContent>
        <TabsContent value="resend">
          <ResendIntegration integration={resend} onUpdate={fetchIntegrations} />
        </TabsContent>
        <TabsContent value="templates">
          <EmailTemplateDesigner onUpdate={fetchIntegrations} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
