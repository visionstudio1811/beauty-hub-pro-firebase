import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useSupabaseTreatments } from '@/hooks/useSupabaseTreatments';
import { useSupabaseProfiles } from '@/hooks/useSupabaseProfiles';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Link as LinkIcon, Copy, Plus, Trash2, Code2 } from 'lucide-react';

interface SchedulerLink {
  id: string;       // The token
  treatment_id: string | null;
  staff_id: string | null;
  label: string | null;
  is_active: boolean;
  expires_at: Timestamp | null;
  created_at: Timestamp | null;
  revoked_at: Timestamp | null;
}

const tsToDate = (t: Timestamp | null): Date | null =>
  t && typeof t.toDate === 'function' ? t.toDate() : null;

const formatDate = (d: Date | null): string =>
  d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const isExpired = (l: SchedulerLink) => {
  const exp = tsToDate(l.expires_at);
  return exp ? exp.getTime() < Date.now() : false;
};

const buildBookingUrl = (token: string, crmDomain?: string | null): string => {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/book/${token}`;
  }
  return `https://${crmDomain ?? 'beautyhubpro.com'}/book/${token}`;
};

const buildIframeSnippet = (url: string): string =>
  `<iframe src="${url}" width="100%" height="800" style="border:0;" loading="lazy" allow="payment"></iframe>`;

export const SchedulerLinks: React.FC = () => {
  const { currentOrganization } = useOrganization();
  const { treatments } = useSupabaseTreatments();
  const { profiles } = useSupabaseProfiles();
  const { toast } = useToast();
  const [links, setLinks] = useState<SchedulerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [embedFor, setEmbedFor] = useState<{ url: string; snippet: string } | null>(null);
  const [form, setForm] = useState<{
    treatmentId: string;
    label: string;
    expiresDays: string;
  }>({ treatmentId: 'any', label: '', expiresDays: '90' });

  useEffect(() => {
    if (!currentOrganization?.id) return;
    setLoading(true);
    const q = query(
      collection(db, 'organizations', currentOrganization.id, 'schedulerLinks'),
      orderBy('created_at', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const rows: SchedulerLink[] = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            treatment_id: data.treatment_id ?? null,
            staff_id: data.staff_id ?? null,
            label: data.label ?? null,
            is_active: data.is_active !== false,
            expires_at: data.expires_at ?? null,
            created_at: data.created_at ?? null,
            revoked_at: data.revoked_at ?? null,
          };
        });
        setLinks(rows);
        setLoading(false);
      },
      err => {
        console.error('Failed to load scheduler links', err);
        toast({ title: 'Error', description: 'Failed to load scheduler links', variant: 'destructive' });
        setLoading(false);
      },
    );
    return () => unsub();
  }, [currentOrganization?.id, toast]);

  const bookableStaff = profiles.filter(
    p => p.is_active && (p.role === 'staff' || p.role === 'admin' || p.role === 'beautician'),
  );

  const handleCreate = async () => {
    if (!currentOrganization?.id) return;
    setCreating(true);
    try {
      const days = Math.max(1, Math.min(365, parseInt(form.expiresDays, 10) || 90));
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      const fn = httpsCallable<
        {
          organizationId: string;
          treatmentId?: string | null;
          staffId?: string | null;
          label?: string;
          expiresAtIso?: string;
        },
        { token: string; url: string }
      >(functions, 'createSchedulerLink');
      const result = await fn({
        organizationId: currentOrganization.id,
        treatmentId: form.treatmentId === 'any' ? null : form.treatmentId,
        staffId: null,
        label: form.label.trim() || undefined,
        expiresAtIso: expiresAt,
      });
      toast({ title: 'Link created', description: 'Copy the URL or embed snippet next.' });
      setCreateOpen(false);
      setForm({ treatmentId: 'any', label: '', expiresDays: '90' });
      // Surface embed dialog so the admin can copy + paste right away
      setEmbedFor({ url: result.data.url, snippet: buildIframeSnippet(result.data.url) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create link';
      toast({ title: 'Create failed', description: msg, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    if (!currentOrganization?.id) return;
    if (!confirm('Revoke this link? The public URL will stop working immediately.')) return;
    try {
      const fn = httpsCallable(functions, 'revokeSchedulerLink');
      await fn({ organizationId: currentOrganization.id, token });
      toast({ title: 'Link revoked' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke';
      toast({ title: 'Revoke failed', description: msg, variant: 'destructive' });
    }
  };

  const copyToClipboard = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: label, description: text.length > 60 ? `${text.slice(0, 60)}…` : text });
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy manually', variant: 'destructive' });
    }
  };

  const crmDomain = (currentOrganization as { crm_domain?: string } | null)?.crm_domain;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-purple-600" />
              Scheduler Links
            </CardTitle>
            <CardDescription>
              Shareable booking URLs for your website, email signature, or social bio. Each link can
              be scoped to a specific treatment, staff member, both, or neither.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create Link
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No links yet. Click <strong>Create Link</strong> to generate your first shareable URL.
          </p>
        ) : (
          <div className="space-y-2">
            {links.map(link => {
              const treatment = link.treatment_id
                ? treatments.find(t => t.id === link.treatment_id)
                : null;
              const staff = link.staff_id
                ? bookableStaff.find(s => s.id === link.staff_id)
                : null;
              const url = buildBookingUrl(link.id, crmDomain);
              const expired = isExpired(link);
              return (
                <div
                  key={link.id}
                  className="rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">
                        {link.label || (treatment ? treatment.name : 'Any treatment')}
                      </span>
                      {treatment && (
                        <Badge variant="secondary" className="text-xs">{treatment.name}</Badge>
                      )}
                      {staff && (
                        <Badge variant="outline" className="text-xs">
                          {staff.full_name || staff.email}
                        </Badge>
                      )}
                      {!link.is_active && <Badge variant="destructive" className="text-xs">Revoked</Badge>}
                      {link.is_active && expired && (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      )}
                      {link.is_active && !expired && (
                        <Badge className="text-xs bg-green-100 text-green-700">Active</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono break-all">
                      {url}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created {formatDate(tsToDate(link.created_at))} · Expires {formatDate(tsToDate(link.expires_at))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(url, 'URL copied')}
                      disabled={!link.is_active}
                    >
                      <Copy className="h-3 w-3 mr-1" /> URL
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEmbedFor({ url, snippet: buildIframeSnippet(url) })}
                      disabled={!link.is_active}
                    >
                      <Code2 className="h-3 w-3 mr-1" /> Embed
                    </Button>
                    {link.is_active && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(link.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Revoke
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Scheduler Link</DialogTitle>
            <DialogDescription>
              The URL works without a sign-in. Anyone with the link can request a booking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm">Treatment (optional)</Label>
              <Select value={form.treatmentId} onValueChange={v => setForm({ ...form, treatmentId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any treatment (visitor picks)</SelectItem>
                  {treatments.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Label (optional)</Label>
              <Input
                value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Website footer link"
                maxLength={80}
              />
            </div>
            <div>
              <Label className="text-sm">Expires in (days)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={form.expiresDays}
                onChange={e => setForm({ ...form, expiresDays: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Embed snippet dialog */}
      <Dialog open={Boolean(embedFor)} onOpenChange={open => !open && setEmbedFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share or Embed</DialogTitle>
            <DialogDescription>
              Send the URL directly, or paste the snippet into a website to embed the booking page.
            </DialogDescription>
          </DialogHeader>
          {embedFor && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Public URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={embedFor.url} readOnly className="font-mono text-xs" />
                  <Button onClick={() => copyToClipboard(embedFor.url, 'URL copied')} variant="outline">
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm">Embed snippet (iframe)</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={embedFor.snippet} readOnly className="font-mono text-xs" />
                  <Button onClick={() => copyToClipboard(embedFor.snippet, 'Snippet copied')} variant="outline">
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Paste this into any web page's HTML to embed the booking widget.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmbedFor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
