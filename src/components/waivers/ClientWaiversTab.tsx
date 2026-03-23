
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
  Send,
  Loader2,
  Clock,
  CheckCircle2,
  FileSignature,
} from 'lucide-react';
import { Client } from '@/hooks/useClients';

interface WaiverTemplate { id: string; title: string }
interface WaiverRecord {
  id: string;
  token: string;
  status: string;
  pdf_url: string | null;
  signer_name: string | null;
  signed_at: string | null;
  created_at: string;
  waiver_templates: { title: string } | null;
}

interface Props {
  client: Client;
}

export function ClientWaiversTab({ client }: Props) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();

  const [templates, setTemplates]       = useState<WaiverTemplate[]>([]);
  const [waivers, setWaivers]           = useState<WaiverRecord[]>([]);
  const [selectedTpl, setSelectedTpl]   = useState('');
  const [loading, setLoading]           = useState(true);
  const [sending, setSending]           = useState(false);

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
            where('client_id', '==', client.id),
            orderBy('created_at', 'desc')
          )
        ),
      ]);

      const tpls: WaiverTemplate[] = tplSnap.docs.map(d => ({ id: d.id, title: d.data().title ?? '' }));

      // Fetch template titles for waivers (join)
      const waiverList: WaiverRecord[] = await Promise.all(
        waiverSnap.docs.map(async (d) => {
          const data = d.data();
          let tplTitle: string | null = null;
          if (data.template_id) {
            const tplDoc = await getDoc(doc(db, 'organizations', currentOrganization.id, 'waiverTemplates', data.template_id));
            tplTitle = tplDoc.exists() ? tplDoc.data().title ?? null : null;
          }
          return {
            id: d.id,
            token: data.token ?? '',
            status: data.status ?? 'pending',
            pdf_url: data.pdf_url ?? null,
            signer_name: data.signer_name ?? null,
            signed_at: data.signed_at ?? null,
            created_at: data.created_at ?? new Date().toISOString(),
            waiver_templates: tplTitle ? { title: tplTitle } : null,
          };
        })
      );

      setTemplates(tpls);
      setWaivers(waiverList);
      if (tpls.length && !selectedTpl) setSelectedTpl(tpls[0].id);
    } catch (err) {
      console.error('Error loading waivers:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization, client.id, selectedTpl]);

  useEffect(() => { load(); }, [currentOrganization, client.id]);

  const sendWaiver = async () => {
    if (!selectedTpl || !currentOrganization) return;
    setSending(true);
    try {
      const sendWaiverFn = httpsCallable(functions, 'sendWaiver');
      const result = await sendWaiverFn({
        clientId: client.id,
        organizationId: currentOrganization.id,
        templateId: selectedTpl,
        siteUrl: window.location.origin,
      });

      const data = result.data as { success?: boolean; error?: string };
      if (!data?.success) throw new Error(data?.error ?? 'Unknown error');

      toast({ title: 'Waiver sent', description: `SMS sent to ${client.phone ?? client.name}` });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Failed to send waiver',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const downloadPdf = async (waiver: WaiverRecord) => {
    if (!waiver.pdf_url) return;
    try {
      const storageRef = ref(storage, `waivers/${waiver.token}.pdf`);
      const url = await getDownloadURL(storageRef);
      window.open(url, '_blank');
    } catch {
      // Fallback to stored URL
      window.open(waiver.pdf_url, '_blank');
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
          Send New Waiver
        </h3>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No waiver templates found. Create one in{' '}
            <span className="font-medium">Settings → Waivers</span>.
          </p>
        ) : (
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
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
            <Button
              size="sm"
              onClick={sendWaiver}
              disabled={sending || !selectedTpl || !client.phone}
              className="gap-1.5 h-9"
              title={!client.phone ? 'Client has no phone number' : undefined}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : 'Send via SMS'}
            </Button>
          </div>
        )}

        {!client.phone && (
          <p className="text-xs text-destructive">This client has no phone number — SMS cannot be sent.</p>
        )}
      </div>

      {/* Waiver history */}
      <div className="space-y-2">
        <h3 className="font-medium text-sm">Waiver History</h3>

        {waivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <FileText className="h-8 w-8" />
            <p className="text-sm">No waivers sent yet.</p>
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
                      {w.waiver_templates?.title ?? 'Waiver'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sent {new Date(w.created_at).toLocaleDateString()}
                      {w.status === 'signed' && w.signed_at && (
                        <> · Signed {new Date(w.signed_at).toLocaleDateString()}</>
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

                  {w.status === 'signed' && w.pdf_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() => downloadPdf(w)}
                    >
                      <Download className="h-3.5 w-3.5" /> PDF
                    </Button>
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
