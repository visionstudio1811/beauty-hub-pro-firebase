
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/hooks/useClients';
import { SmsProvider, SMS_PROVIDER_LABELS } from '@/types/sms';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  FileSignature,
  Loader2,
  Mail,
  MessageSquare,
  ShieldCheck,
  Tablet,
} from 'lucide-react';

interface AgreementTemplate { id: string; title: string }

type SendMode = 'sms' | 'email' | 'device';

interface Props {
  client: Client;
  purchaseId: string;
  packageName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SendAgreementDialog({ client, purchaseId, packageName, isOpen, onClose }: Props) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<AgreementTemplate[]>([]);
  const [selectedTpl, setSelectedTpl] = useState('');
  const [loading, setLoading] = useState(true);
  const [sendingMode, setSendingMode] = useState<SendMode | null>(null);
  const [smsProvider, setSmsProvider] = useState<SmsProvider>('infobip');
  const [requiresOtp, setRequiresOtp] = useState(true);

  useEffect(() => {
    if (!isOpen || !currentOrganization) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(
            collection(db, 'organizations', currentOrganization.id, 'waiverTemplates'),
            where('kind', '==', 'agreement'),
          ),
        );
        if (cancelled) return;
        const tpls = snap.docs
          .map(d => ({ id: d.id, title: (d.data().title as string) ?? '' }))
          .sort((a, b) => a.title.localeCompare(b.title));
        setTemplates(tpls);
        if (tpls.length > 0) setSelectedTpl(tpls[0].id);
      } catch (err) {
        console.error('Failed to load agreement templates:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, currentOrganization]);

  const send = async (mode: SendMode) => {
    if (!selectedTpl || !currentOrganization) return;
    setSendingMode(mode);
    try {
      const fn = httpsCallable(functions, 'sendWaiver');
      const result = await fn({
        clientId: client.id,
        organizationId: currentOrganization.id,
        templateId: selectedTpl,
        siteUrl: window.location.origin,
        purchaseId,
        mode,
        ...(mode === 'sms' ? { smsProvider, requiresOtp } : {}),
      });
      const data = result.data as { success?: boolean; error?: string; waiver_url?: string };
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      if (mode === 'device' && data.waiver_url) {
        window.open(data.waiver_url, '_blank');
        toast({ title: 'Agreement of Purchase ready', description: 'Hand the device to the client to sign.' });
      } else if (mode === 'email') {
        toast({ title: 'Agreement of Purchase sent', description: `Email sent to ${client.email}` });
      } else {
        toast({ title: 'Agreement of Purchase sent', description: `SMS sent to ${client.phone}` });
      }
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Failed to send Agreement of Purchase',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSendingMode(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Send Agreement of Purchase
          </DialogTitle>
          <DialogDescription>
            {packageName
              ? <>Send <strong>{client.name}</strong> a prefilled Agreement of Purchase for <strong>{packageName}</strong>.</>
              : <>Send <strong>{client.name}</strong> a prefilled Agreement of Purchase.</>}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              No Agreement of Purchase templates yet. Create one in{' '}
              <span className="font-medium">Settings → Agreements of Purchase</span>, then come back here.
            </p>
            <Button variant="outline" className="w-full" onClick={onClose}>Skip for now</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Template</Label>
              <Select value={selectedTpl} onValueChange={setSelectedTpl}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">SMS Provider</Label>
              <div className="flex gap-2">
                {(['infobip', 'twilio', 'quo'] as SmsProvider[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSmsProvider(p)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors capitalize ${
                      smsProvider === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:border-primary/50 hover:bg-background'
                    }`}
                  >
                    {SMS_PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="agreement-otp"
                  checked={requiresOtp}
                  onCheckedChange={setRequiresOtp}
                />
                <Label htmlFor="agreement-otp" className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Require OTP verification
                </Label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button
                onClick={() => send('sms')}
                disabled={sendingMode !== null || !selectedTpl || !client.phone}
                variant="outline"
                className="gap-1.5 h-9"
                title={!client.phone ? 'Client has no phone number' : undefined}
              >
                {sendingMode === 'sms' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Send via SMS {requiresOtp ? '+ OTP' : ''}
              </Button>
              <Button
                onClick={() => send('email')}
                disabled={sendingMode !== null || !selectedTpl || !client.email}
                variant="outline"
                className="gap-1.5 h-9"
                title={!client.email ? 'Client has no email on file' : undefined}
              >
                {sendingMode === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send via Email
              </Button>
              <Button
                onClick={() => send('device')}
                disabled={sendingMode !== null || !selectedTpl}
                className="gap-1.5 h-9"
              >
                {sendingMode === 'device' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tablet className="h-4 w-4" />}
                Sign on this device
              </Button>
            </div>

            <Button variant="ghost" className="w-full" onClick={onClose} disabled={sendingMode !== null}>
              Skip for now
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
