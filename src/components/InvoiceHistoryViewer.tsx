import React, { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { useInvoices } from '@/hooks/useInvoices';
import { useClients } from '@/hooks/useClients';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Download,
  Ban,
  Receipt,
  Search,
  ShieldAlert,
} from 'lucide-react';
import type { Invoice } from '@/types/firestore';

type DatePreset = 'this-month' | 'last-30' | 'last-90' | 'this-year' | 'all';
type StatusFilter = 'all' | 'issued' | 'void';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'last-90', label: 'Last 90 days' },
  { value: 'this-year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'issued', label: 'Issued only' },
  { value: 'void', label: 'Voided only' },
];

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function startOfRange(preset: DatePreset): Date | null {
  const now = new Date();
  if (preset === 'all') return null;
  if (preset === 'this-month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (preset === 'last-30') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  if (preset === 'last-90') {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    return d;
  }
  if (preset === 'this-year') return new Date(now.getFullYear(), 0, 1);
  return null;
}

function formatCents(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(ts: any, locale: string): string {
  const d = toDate(ts);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

function relativeTime(ts: any): string {
  const d = toDate(ts);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export const InvoiceHistoryViewer: React.FC = () => {
  const { profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const { invoices, loading } = useInvoices();
  const { clients } = useClients();

  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DatePreset>('this-year');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';

  if (profile && profile.role !== 'admin') {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-medium">Admins only</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You need admin access to view org-wide invoice history.
          </p>
        </CardContent>
      </Card>
    );
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const cutoff = startOfRange(dateFilter);
    return invoices.filter((inv) => {
      if (clientFilter !== 'all' && inv.client_id !== clientFilter) return false;
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (cutoff) {
        const d = toDate(inv.issued_at);
        if (!d || d < cutoff) return false;
      }
      if (needle) {
        const numberHit = inv.invoice_number.toLowerCase().includes(needle);
        const clientName = inv.client_snapshot?.name?.toLowerCase() ?? '';
        const nameHit = clientName.includes(needle);
        if (!numberHit && !nameHit) return false;
      }
      return true;
    });
  }, [invoices, search, clientFilter, dateFilter, statusFilter]);

  const stats = useMemo(() => {
    const issued = filtered.filter((i) => i.status === 'issued');
    const voided = filtered.filter((i) => i.status === 'void');
    const revenueCents = issued.reduce((sum, i) => sum + (i.total_cents || 0), 0);
    const avgCents = issued.length > 0 ? Math.round(revenueCents / issued.length) : 0;
    const currency = filtered[0]?.currency ?? 'USD';
    return {
      revenueCents,
      issuedCount: issued.length,
      voidedCount: voided.length,
      avgCents,
      currency,
    };
  }, [filtered]);

  const clientOptions = useMemo(
    () => clients.filter((c) => !c.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );

  const handleVoid = async (inv: Invoice) => {
    if (!currentOrganization?.id) return;
    setVoidingId(inv.id);
    try {
      const call = httpsCallable<
        { organizationId: string; invoiceId: string },
        { invoice: Invoice }
      >(functions, 'voidInvoice');
      await call({ organizationId: currentOrganization.id, invoiceId: inv.id });
      toast({
        title: 'Invoice voided',
        description: `${inv.invoice_number} is now marked as void.`,
      });
    } catch (err: any) {
      const message =
        err?.message?.includes('already voided')
          ? 'This invoice is already voided.'
          : err?.message?.includes('resource-exhausted')
            ? 'Daily void limit reached for this organization.'
            : err?.message ?? 'Failed to void invoice';
      toast({ title: 'Void failed', description: message, variant: 'destructive' });
    } finally {
      setVoidingId(null);
    }
  };

  const handleOpenPdf = (inv: Invoice) => {
    if (inv.pdf_url) window.open(inv.pdf_url, '_blank');
    else
      toast({
        title: 'PDF not ready',
        description: 'This invoice has no PDF on file.',
        variant: 'destructive',
      });
  };

  const clearFilters = () => {
    setSearch('');
    setClientFilter('all');
    setDateFilter('all');
    setStatusFilter('all');
  };

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader>
        <div className="flex items-center space-x-2 min-w-0">
          <FileText className="h-5 w-5 text-purple-600 flex-shrink-0" />
          <CardTitle className="truncate">Invoice History</CardTitle>
        </div>
        <CardDescription>
          All invoices issued across the organization. Search, filter, or void.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile
            label="Revenue"
            value={formatCents(stats.revenueCents, stats.currency, locale)}
          />
          <StatTile label="Invoices" value={String(stats.issuedCount)} />
          <StatTile
            label="Voided"
            value={String(stats.voidedCount)}
            muted
          />
          <StatTile
            label="Average"
            value={formatCents(stats.avgCents, stats.currency, locale)}
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Invoice # or client"
                className="pl-8"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Client</Label>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Date range</Label>
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DatePreset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading invoices…
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No invoices issued yet.</p>
            <p className="text-xs mt-1">
              Generate an invoice from a client's package row to get started.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-sm">No invoices match these filters.</p>
            <Button
              variant="link"
              size="sm"
              className="mt-2"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((inv) => (
              <div
                key={inv.id}
                className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Receipt
                    className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                      inv.status === 'void' ? 'text-muted-foreground' : 'text-purple-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <div
                      className={`font-mono font-medium truncate ${
                        inv.status === 'void' ? 'text-muted-foreground line-through' : ''
                      }`}
                    >
                      {inv.invoice_number}
                    </div>
                    <div className="text-sm truncate">
                      {inv.client_snapshot?.name ?? 'Unknown client'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(inv.issued_at, locale)} ·{' '}
                      {inv.line_items[0]?.name ?? 'Package'}
                      {inv.status === 'void' && inv.voided_at && (
                        <span className="ml-1">· voided {relativeTime(inv.voided_at)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:flex-shrink-0">
                  <div className="text-right">
                    <div
                      className={`font-medium ${
                        inv.status === 'void' ? 'text-muted-foreground' : ''
                      }`}
                    >
                      {formatCents(inv.total_cents, inv.currency, locale)}
                    </div>
                    <Badge
                      variant={inv.status === 'void' ? 'destructive' : 'default'}
                      className="mt-0.5"
                    >
                      {inv.status}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenPdf(inv)}
                      disabled={!inv.pdf_url}
                      title={inv.pdf_url ? 'Download PDF' : 'No PDF on file'}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {inv.status === 'issued' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={voidingId === inv.id}
                            title="Void invoice"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Void invoice {inv.invoice_number}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Voiding marks the invoice as cancelled — it stays on the record
                              for audit and the number ({inv.invoice_number}) is never reused.
                              This can't be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive hover:bg-destructive/90"
                              onClick={() => handleVoid(inv)}
                            >
                              Void invoice
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface StatTileProps {
  label: string;
  value: string;
  muted?: boolean;
}

const StatTile: React.FC<StatTileProps> = ({ label, value, muted }) => (
  <div className="border rounded-lg p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div
      className={`text-lg font-semibold mt-0.5 ${muted ? 'text-muted-foreground' : ''}`}
    >
      {value}
    </div>
  </div>
);
