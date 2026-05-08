import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Package, ShoppingBag, DollarSign, TrendingUp, Sparkles } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';

type PurchaseTypeFilter = 'all' | 'packages' | 'products' | 'facials';
type RowType = 'package' | 'product' | 'treatment';

interface UnifiedRow {
  id: string;
  type: RowType;
  client_id: string;
  client_name: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  // Only present on type === 'product'.
  product_id?: string;
}

interface PurchasesSectionProps {
  // Day-scoped filter from dashboard top filter strip; if empty, all dates.
  // Optional so the section can be reused on the Clients page without a global date filter.
  dateFilter?: string;
  // Optional product filter; only applies when type==='products'.
  productFilter?: string;
  // Optional title override (defaults to "Purchases").
  title?: string;
  // Optional description override.
  description?: string;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);

// Convert a Firestore Timestamp/ISO/millis value into a YYYY-MM-DD string.
const toDateString = (raw: unknown): string => {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  // Firestore Timestamp shape
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (typeof (raw as { seconds?: number }).seconds === 'number') {
    return new Date((raw as { seconds: number }).seconds * 1000).toISOString().slice(0, 10);
  }
  return '';
};

export const PurchasesSection: React.FC<PurchasesSectionProps> = ({
  dateFilter = '',
  productFilter = 'all',
  title = 'Purchases',
  description,
}) => {
  const { currentOrganization } = useOrganization();
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<PurchaseTypeFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!currentOrganization?.id) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const orgId = currentOrganization.id;
        const orgPath = ['organizations', orgId] as const;

        const [
          purchasesSnap,
          productAssignmentsSnap,
          clientsSnap,
          packagesSnap,
          productsSnap,
          invoicesSnap,
        ] = await Promise.all([
          getDocs(query(
            collection(db, ...orgPath, 'purchases'),
            where('payment_status', 'in', ['active', 'completed']),
          )),
          getDocs(collection(db, ...orgPath, 'productAssignments')),
          getDocs(collection(db, ...orgPath, 'clients')),
          getDocs(collection(db, ...orgPath, 'packages')),
          getDocs(collection(db, ...orgPath, 'products')),
          // Issued (non-void) invoices — used only to pull facial line items so
          // we don't double-count packages/products that have their own source.
          getDocs(query(
            collection(db, ...orgPath, 'invoices'),
            where('status', '==', 'issued'),
          )),
        ]);

        if (cancelled) return;

        const clientNames = new Map<string, string>();
        clientsSnap.forEach(d => clientNames.set(d.id, d.data().name || 'Unknown'));
        const packageNames = new Map<string, string>();
        packagesSnap.forEach(d => packageNames.set(d.id, d.data().name || 'Package'));
        const productNames = new Map<string, string>();
        productsSnap.forEach(d => productNames.set(d.id, d.data().name || 'Product'));

        const collected: UnifiedRow[] = [];

        purchasesSnap.forEach(d => {
          const data = d.data();
          if (data.deleted_at) return;
          collected.push({
            id: `purchase-${d.id}`,
            type: 'package',
            client_id: data.client_id || '',
            client_name: clientNames.get(data.client_id) || 'Unknown',
            description: packageNames.get(data.package_id) || 'Custom package',
            amount: Number(data.total_amount || 0),
            date: (data.purchase_date as string) || '',
          });
        });

        productAssignmentsSnap.forEach(d => {
          const data = d.data();
          if (data.deleted_at) return;
          collected.push({
            id: `product-${d.id}`,
            type: 'product',
            client_id: data.client_id || '',
            client_name: clientNames.get(data.client_id) || 'Unknown',
            description: productNames.get(data.product_id) || 'Product',
            amount: Number(data.assigned_price || 0) * Number(data.quantity || 1),
            date: toDateString(data.assigned_at),
            product_id: data.product_id || '',
          });
        });

        // Facials are billed only via standalone invoices — there's no parallel
        // "treatmentAssignments" collection, so issued invoices are the only
        // source of truth. We deliberately ignore product line items inside
        // invoices since those would double-count productAssignments.
        invoicesSnap.forEach(d => {
          const data = d.data();
          const lineItems = Array.isArray(data.line_items) ? data.line_items : [];
          const issuedDate = toDateString(data.issued_at);
          const clientId = data.client_id || '';
          const clientName = data.client_snapshot?.name || clientNames.get(clientId) || 'Unknown';

          (lineItems as Array<Record<string, unknown>>).forEach((li, idx) => {
            if (li?.type !== 'treatment') return;
            const qty = Number(li.quantity ?? 1);
            const unitPriceCents = Number(li.unit_price_cents ?? 0);
            const subtotalCents = Number(li.subtotal_cents ?? unitPriceCents * qty);
            collected.push({
              id: `treatment-${d.id}-${idx}`,
              type: 'treatment',
              client_id: clientId,
              client_name: clientName,
              description: typeof li.name === 'string' ? li.name : 'Facial',
              amount: subtotalCents / 100,
              date: issuedDate,
            });
          });
        });

        setRows(collected);
      } catch (err) {
        console.error('PurchasesSection: failed to load', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(r => {
      if (typeFilter !== 'all') {
        if (typeFilter === 'packages' && r.type !== 'package') return false;
        if (typeFilter === 'products' && r.type !== 'product') return false;
        if (typeFilter === 'facials' && r.type !== 'treatment') return false;
      }
      if (productFilter !== 'all' && r.type === 'product') {
        if (r.product_id !== productFilter) return false;
      }
      if (dateFilter && r.date !== dateFilter) return false;
      if (needle) {
        const blob = `${r.client_name} ${r.description}`.toLowerCase();
        if (!blob.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, productFilter, dateFilter, search]);

  const totals = useMemo(() => {
    const pkg = filtered.filter(r => r.type === 'package');
    const prod = filtered.filter(r => r.type === 'product');
    const facial = filtered.filter(r => r.type === 'treatment');
    return {
      totalRevenue: filtered.reduce((sum, r) => sum + r.amount, 0),
      packagesCount: pkg.length,
      productsCount: prod.length,
      facialsCount: facial.length,
      packageRevenue: pkg.reduce((s, r) => s + r.amount, 0),
      productRevenue: prod.reduce((s, r) => s + r.amount, 0),
      facialRevenue: facial.reduce((s, r) => s + r.amount, 0),
    };
  }, [filtered]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-violet-600" />
          {title}
        </CardTitle>
        <CardDescription>
          {description ?? `Revenue from packages, product sales, and facials${dateFilter ? ` on ${dateFilter}` : ''}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Total Revenue"
            value={formatCurrency(totals.totalRevenue)}
            accent="border-emerald-500"
            iconBg="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            icon={<Package className="h-4 w-4" />}
            label="Packages Sold"
            value={String(totals.packagesCount)}
            sub={formatCurrency(totals.packageRevenue)}
            accent="border-violet-500"
            iconBg="bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400"
          />
          <StatCard
            icon={<ShoppingBag className="h-4 w-4" />}
            label="Products Sold"
            value={String(totals.productsCount)}
            sub={formatCurrency(totals.productRevenue)}
            accent="border-amber-500"
            iconBg="bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
          />
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="Facials Sold"
            value={String(totals.facialsCount)}
            sub={formatCurrency(totals.facialRevenue)}
            accent="border-pink-500"
            iconBg="bg-pink-50 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Type</label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as PurchaseTypeFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="packages">Packages only</SelectItem>
                <SelectItem value="products">Products only</SelectItem>
                <SelectItem value="facials">Facials only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Search</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Client or item"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Quick</label>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setTypeFilter('all');
                setSearch('');
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-6 text-sm text-muted-foreground">Loading purchases…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No purchases match these filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, 25).map((r) => (
              <div
                key={r.id}
                className="border rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {r.type === 'package' ? (
                    <Package className="h-4 w-4 text-violet-600 flex-shrink-0" />
                  ) : r.type === 'product' ? (
                    <ShoppingBag className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-pink-600 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.description}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.client_name} · {r.date || '—'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {r.type === 'treatment' ? 'facial' : r.type}
                  </Badge>
                  <div className="font-medium tabular-nums">{formatCurrency(r.amount)}</div>
                </div>
              </div>
            ))}
            {filtered.length > 25 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                Showing 25 of {filtered.length} matches.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  iconBg: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, accent, iconBg }) => (
  <div className={`bg-card border border-border rounded-lg p-4 border-l-4 ${accent} shadow-sm`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 truncate">
          {label}
        </p>
        <p className="text-2xl font-bold text-foreground tabular-nums truncate">
          {value}
        </p>
        {sub && (
          <p className="text-xs text-muted-foreground tabular-nums mt-0.5">{sub}</p>
        )}
      </div>
      <div className={`p-2 rounded-lg ${iconBg}`}>
        {icon}
      </div>
    </div>
  </div>
);
