
import React, { useCallback, useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  getDoc,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, functions, storage } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Download,
  MessageSquare,
  Mail,
  Tablet,
  Loader2,
  Clock,
  CheckCircle2,
  FileSignature,
  Image as ImageIcon,
} from 'lucide-react';
import { Client } from '@/hooks/useClients';
import { safeFormatters } from '@/lib/safeDateFormatter';

type TemplateKind = 'waiver' | 'intake';

interface WaiverTemplate { id: string; title: string; kind: TemplateKind }
interface WaiverRecord {
  id: string;
  token: string;
  status: string;
  kind: TemplateKind;
  pdf_url: string | null;
  signer_name: string | null;
  signed_at: string | null;
  createdAt: string;
  imageUrls: string[];
  waiver_templates: { title: string } | null;
}

interface Props {
  client: Client;
  kind?: TemplateKind;
}

type SendMode = 'sms' | 'email' | 'device';

const KIND_COPY: Record<TemplateKind, { singular: string; sendTitle: string; historyTitle: string; empty: string }> = {
  waiver: {
    singular: 'Waiver',
    sendTitle: 'Send New Waiver',
    historyTitle: 'Waiver History',
    empty: 'No waivers sent yet.',
  },
  intake: {
    singular: 'Intake Form',
    sendTitle: 'Send New Intake Form',
    historyTitle: 'Intake Form History',
    empty: 'No intake forms sent yet.',
  },
};

export function ClientWaiversTab({ client, kind = 'waiver' }: Props) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const copy = KIND_COPY[kind];

  const [templates, setTemplates]       = useState<WaiverTemplate[]>([]);
  const [waivers, setWaivers]           = useState<WaiverRecord[]>([]);
  const [selectedTpl, setSelectedTpl]   = useState('');
  const [loading, setLoading]           = useState(true);
  const [sendingMode, setSendingMode]   = useState<SendMode | null>(null);

  const load = useCallback(async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const [tplSnap, waiverSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'organizations', currentOrganization.id, 'waiverTemplates'),
            orderBy('title')
          )
        ),
        getDocs(
          query(
            collection(db, 'organizations', currentOrganization.id, 'clientWaivers'),
            where('clientId', '==', client.id),
            orderBy('createdAt', 'desc')
          )
        ),
      ]);

      const allTpls: WaiverTemplate[] = tplSnap.docs.map(d => ({
        id: d.id,
        title: d.data().title ?? '',
        kind: (d.data().kind as TemplateKind) ?? 'waiver',
      }));
      const tpls = allTpls.filter(t => t.kind === kind);

      const waiverList: WaiverRecord[] = await Promise.all(
        waiverSnap.docs.map(async (d) => {
          const data = d.data();
          let tplTitle: string | null = null;
          let recordKind: TemplateKind = (data.kind as TemplateKind) ?? 'waiver';
          if (data.templateId) {
            const tplDoc = await getDoc(doc(db, 'organizations', currentOrganization.id, 'waiverTemplates', data.templateId));
            if (tplDoc.exists()) {
              tplTitle = tplDoc.data().title ?? null;
              if (!data.kind) recordKind = (tplDoc.data().kind as TemplateKind) ?? 'waiver';
            }
          }
          const answers = (data.answers ?? {}) as Record<string, unknown>;
          const imageUrls: string[] = [];
          for (const v of Object.values(answers)) {
            if (Array.isArray(v)) {
              for (const item of v) {
                if (typeof item === 'string' && /^https?:\/\//.test(item)) imageUrls.push(item);
              }
            }
          }
          const ca = data.createdAt;
          const createdAt =
            typeof ca === 'string'
              ? ca
              : ca?.toDate?.()?.toISOString?.() ?? new Date().toISOString();
          return {
            id: d.id,
            token: data.token ?? '',
            status: data.status ?? 'pending',
            kind: recordKind,
            pdf_url: data.pdf_url ?? null,
            signer_name: data.signer_name ?? null,
            signed_at: data.signed_at ?? null,
            createdAt,
            imageUrls,
            waiver_templates: tplTitle ? { title: tplTitle } : null,
          };
        })
      );

      setTemplates(tpls);
      setWaivers(waiverList.filter(w => w.kind === kind));
      if (tpls.length && !selectedTpl) setSelectedTpl(tpls[0].id);
    } catch (err) {
      console.error('Error loading waivers:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization, client.id, selectedTpl]);

  useEffect(() => { load(); }, [currentOrganization, client.id, kind]);

  const sendWaiver = async (mode: SendMode) => {
    if (!selectedTpl || !currentOrganization) return;
    setSendingMode(mode);
    try {
      const sendWaiverFn = httpsCallable(functions, 'sendWaiver');
      const result = await sendWaiverFn({
        clientId: client.id,
        organizationId: currentOrganization.id,
        templateId: selectedTpl,
        siteUrl: window.location.origin,
        mode,
      });

      const data = result.data as { success?: boolean; error?: string; waiver_url?: string };
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      if (mode === 'device' && data.waiver_url) {
        // Open the waiver directly in a new tab for the client to fill in-store
        window.open(data.waiver_url, '_blank');
        toast({ title: 'Waiver ready', description: 'Hand the device to the client to fill out.' });
      } else if (mode === 'email') {
        toast({ title: 'Waiver sent', description: `Email sent to ${client.email}` });
      } else {
        toast({ title: 'Waiver sent', description: `SMS sent to ${client.phone}` });
      }
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Failed to send waiver',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSendingMode(null);
    }
  };

  const downloadPdf = async (waiver: WaiverRecord) => {
    if (!waiver.pdf_url && !waiver.token) return;
    try {
      const storageRef = ref(storage, `waivers/${waiver.token}.pdf`);
      const url = await getDownloadURL(storageRef);
      window.open(url, '_blank');
    } catch {
      if (waiver.pdf_url) window.open(waiver.pdf_url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Send section */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <h3 className="font-medium flex items-center gap-2 text-sm">
          <FileSignature className="h-4 w-4" />
          {copy.sendTitle}
        </h3>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No {copy.singular.toLowerCase()} templates found. Create one in{' '}
            <span className="font-medium">Settings → {kind === 'intake' ? 'Intake Forms' : 'Waivers'}</span>.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Template</Label>
              <Select value={selectedTpl} onValueChange={setSelectedTpl}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => sendWaiver('sms')}
                disabled={sendingMode !== null || !selectedTpl || !client.phone}
                className="gap-1.5 h-9"
                title={!client.phone ? 'Client has no phone number' : undefined}
              >
                {sendingMode === 'sms' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                Send via SMS
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => sendWaiver('email')}
                disabled={sendingMode !== null || !selectedTpl || !client.email}
                className="gap-1.5 h-9"
                title={!client.email ? 'Client has no email on file' : undefined}
              >
                {sendingMode === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send via Email
              </Button>

              <Button
                size="sm"
                onClick={() => sendWaiver('device')}
                disabled={sendingMode !== null || !selectedTpl}
                className="gap-1.5 h-9"
              >
                {sendingMode === 'device' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tablet className="h-4 w-4" />}
                Fill now on this device
              </Button>
            </div>

            {!client.phone && !client.email && (
              <p className="text-xs text-destructive">
                This client has no phone or email — use "Fill now on this device".
              </p>
            )}
          </>
        )}
      </div>

      {/* Waiver history */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">{copy.historyTitle}</h3>

        {waivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <FileText className="h-8 w-8" />
            <p className="text-sm">{copy.empty}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {waivers.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {w.status === 'signed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {w.waiver_templates?.title ?? copy.singular}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sent {safeFormatters.shortDate(w.createdAt) || '—'}
                      {w.status === 'signed' && w.signed_at && (
                        <> · Signed {safeFormatters.shortDate(w.signed_at) || '—'}</>
                      )}
                      {w.imageUrls.length > 0 && (
                        <> · {w.imageUrls.length} photo{w.imageUrls.length > 1 ? 's' : ''}</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge
                    variant="outline"
                    className={w.status === 'signed'
                      ? 'border-green-300 text-green-700 bg-green-50'
                      : 'border-amber-300 text-amber-700 bg-amber-50'}
                  >
                    {w.status === 'signed' ? 'Signed' : 'Pending'}
                  </Badge>

                  {w.status === 'signed' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => downloadPdf(w)}
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </Button>

                      {w.imageUrls.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => w.imageUrls.forEach((u) => window.open(u, '_blank'))}
                          title={`Open ${w.imageUrls.length} uploaded photo${w.imageUrls.length > 1 ? 's' : ''}`}
                        >
                          <ImageIcon className="h-3.5 w-3.5" /> Photos
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
