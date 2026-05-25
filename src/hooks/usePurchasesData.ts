import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';

export type PurchaseRowType = 'package' | 'product' | 'treatment';

export interface PurchaseRow {
  id: string;
  type: PurchaseRowType;
  client_id: string;
  client_name: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  product_id?: string;
}

const toDateString = (raw: unknown): string => {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (typeof (raw as { seconds?: number }).seconds === 'number') {
    return new Date((raw as { seconds: number }).seconds * 1000).toISOString().slice(0, 10);
  }
  return '';
};

/**
 * Loads the unified revenue row list (packages + product sales + facial line
 * items from issued invoices). The single source of truth used by both the
 * Sales page panel and the Dashboard's today-revenue stat card so the numbers
 * never drift.
 */
export function usePurchasesData() {
  const { currentOrganization } = useOrganization();
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);

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
          getDocs(query(
            collection(db, ...orgPath, 'invoices'),
            where('status', '==', 'issued'),
          )),
        ]);

        if (cancelled) return;

        const clientNames = new Map<string, string>();
        clientsSnap.forEach((d) => clientNames.set(d.id, d.data().name || 'Unknown'));
        const packageNames = new Map<string, string>();
        packagesSnap.forEach((d) => packageNames.set(d.id, d.data().name || 'Package'));
        const productNames = new Map<string, string>();
        productsSnap.forEach((d) => productNames.set(d.id, d.data().name || 'Product'));

        const collected: PurchaseRow[] = [];

        purchasesSnap.forEach((d) => {
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

        productAssignmentsSnap.forEach((d) => {
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

        // Facials live on issued invoices only — no parallel treatmentAssignments
        // collection. We deliberately ignore product line items inside invoices
        // (would double-count productAssignments above).
        invoicesSnap.forEach((d) => {
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
        console.error('usePurchasesData: failed to load', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id]);

  return { rows, loading };
}
