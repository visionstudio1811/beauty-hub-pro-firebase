import React, { useState, useEffect, useRef } from 'react';
import { TwilioIntegration } from './TwilioIntegration';
import { ResendIntegration } from './ResendIntegration';
import { InfobipIntegration } from './InfobipIntegration';
import { QuoIntegration } from './QuoIntegration';
import { GoogleDriveIntegration } from './GoogleDriveIntegration';
import { EmailTemplateDesigner } from './EmailTemplateDesigner';
import { SmsTemplateManager } from './SmsTemplateManager';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, MessageSquare, Mail, Palette, HardDrive, ChevronRight, LucideIcon } from 'lucide-react';

interface MarketingIntegration {
  id: string;
  provider: string;
  is_enabled: boolean;
  status: string;
  configuration: any;
  last_tested_at: string | null;
  error_message: string | null;
  has_secret?: boolean;
  secret_last4?: string;
}

type ItemId = 'infobip' | 'twilio' | 'quo' | 'resend' | 'drive' | 'templates' | 'sms-templates';

interface NavItem {
  id: ItemId;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Firestore provider doc id — present only for connectable integrations. */
  provider?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'infobip', label: 'Infobip', description: 'SMS + OTP', icon: MessageSquare, provider: 'infobip' },
  { id: 'twilio', label: 'Twilio', description: 'SMS campaigns', icon: MessageSquare, provider: 'twilio' },
  { id: 'quo', label: 'Quo', description: 'SMS + call sync', icon: MessageSquare, provider: 'quo' },
  { id: 'resend', label: 'Resend Email', description: 'Email campaigns', icon: Mail, provider: 'resend' },
  { id: 'drive', label: 'Drive Backup', description: 'Auto-backup PDFs', icon: HardDrive, provider: 'googleDrive' },
  { id: 'templates', label: 'Email Templates', description: 'Design branded emails', icon: Palette },
  { id: 'sms-templates', label: 'SMS Templates', description: 'Reusable SMS messages', icon: MessageSquare },
];

export const MarketingIntegrations: React.FC = () => {
  const [integrations, setIntegrations] = useState<MarketingIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ItemId>('infobip');
  const { currentOrganization } = useOrganization();
  const migratedRef = useRef(false);

  const fetchIntegrations = async () => {
    if (!currentOrganization?.id) return;
    try {
      const [twilioSnap, resendSnap, infobipSnap, quoSnap, driveSnap] = await Promise.all([
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'twilio')),
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'resend')),
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'infobip')),
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'quo')),
        getDoc(doc(db, 'organizations', currentOrganization.id, 'marketingIntegrations', 'googleDrive')),
      ]);
      const results: MarketingIntegration[] = [];
      if (twilioSnap.exists())  results.push({ id: twilioSnap.id,  ...twilioSnap.data()  } as MarketingIntegration);
      if (resendSnap.exists())  results.push({ id: resendSnap.id,  ...resendSnap.data()  } as MarketingIntegration);
      if (infobipSnap.exists()) results.push({ id: infobipSnap.id, ...infobipSnap.data() } as MarketingIntegration);
      if (quoSnap.exists())     results.push({ id: quoSnap.id,     ...quoSnap.data()     } as MarketingIntegration);
      if (driveSnap.exists())   results.push({ id: driveSnap.id,   ...driveSnap.data()   } as MarketingIntegration);
      setIntegrations(results);

      // One-time self-healing migration: if any provider still has a raw secret
      // sitting in the client-readable `configuration`, move it server-side
      // (write-only) and strip it from the readable doc, then re-fetch.
      if (!migratedRef.current) {
        const exposed = results.some(
          (i) => i.configuration && (i.configuration.apiKey || i.configuration.authToken || i.configuration.accountSid),
        );
        if (exposed) {
          migratedRef.current = true;
          try {
            await httpsCallable(functions, 'migrateIntegrationSecrets')({ organizationId: currentOrganization.id });
            await fetchIntegrations();
          } catch (err) {
            console.error('Secret migration failed:', err);
          }
        }
      }
    } catch (error: any) {
      toast({ title: 'Error loading integrations', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIntegrations(); }, [currentOrganization?.id]);

  const byProvider = (p: string) => integrations.find(i => i.provider === p);

  /** Small colored status dot: green=connected, red=error, gray=disconnected. */
  const statusDot = (status?: string) => {
    const color = status === 'connected' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-300';
    return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading integrations...</span>
      </div>
    );
  }

  const renderContent = () => {
    switch (active) {
      case 'infobip': return <InfobipIntegration integration={byProvider('infobip')} onUpdate={fetchIntegrations} />;
      case 'twilio':  return <TwilioIntegration integration={byProvider('twilio')} onUpdate={fetchIntegrations} />;
      case 'quo':     return <QuoIntegration integration={byProvider('quo')} onUpdate={fetchIntegrations} />;
      case 'resend':  return <ResendIntegration integration={byProvider('resend')} onUpdate={fetchIntegrations} />;
      case 'drive':   return <GoogleDriveIntegration integration={byProvider('googleDrive')} onUpdate={fetchIntegrations} />;
      case 'templates': return <EmailTemplateDesigner onUpdate={fetchIntegrations} />;
      case 'sms-templates': return <SmsTemplateManager onUpdate={fetchIntegrations} />;
      default: return null;
    }
  };

  // Compact connection summary (connectable items only).
  const connectables = NAV_ITEMS.filter(i => i.provider);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold mb-1">Marketing Integrations</h2>
        <p className="text-muted-foreground">Connect SMS and email providers to send forms, campaigns, and OTP codes.</p>
      </div>

      {/* Compact status strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
        {connectables.map((item) => {
          const integ = byProvider(item.provider!);
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {statusDot(integ?.status)}
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Sidebar + content */}
      <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] gap-5">
        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const integ = item.provider ? byProvider(item.provider) : undefined;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60 text-foreground'
                }`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{item.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{item.description}</span>
                </span>
                {item.provider && statusDot(integ?.status)}
                {isActive && <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">{renderContent()}</div>
      </div>
    </div>
  );
};
