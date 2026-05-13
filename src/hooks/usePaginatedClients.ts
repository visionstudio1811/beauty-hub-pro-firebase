import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Client } from '@/contexts/ClientsContext';
import type { PurchaseFilter } from '@/hooks/useClientFilters';

export const PAGE_SIZE = 25;

interface UsePaginatedClientsParams {
  searchTerm: string;
  filterStatus: string;
  purchaseFilter?: PurchaseFilter;
  page: number;
  version?: number;
}

interface UsePaginatedClientsResult {
  clients: Client[];
  totalCount: number;
  loading: boolean;
  refetch: () => void;
}

interface ClientAggregates {
  totalVisits: number;
  totalRevenue: number;
  lastVisit: string;
  hasPackages: boolean;
  hasActivePackage: boolean;
  hasCompletedPackage: boolean;
  hasProducts: boolean;
}

export const usePaginatedClients = ({
  searchTerm,
  filterStatus,
  purchaseFilter = 'all',
  page,
  version = 0,
}: UsePaginatedClientsParams): UsePaginatedClientsResult => {
  const { currentOrganization } = useOrganization();
  const [clients, setClients] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = useCallback(() => setFetchTick(t => t + 1), []);

  useEffect(() => {
    if (!currentOrganization?.id) {
      setClients([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const orgId = currentOrganization.id;
        const orgPath = ['organizations', orgId] as const;

        // Parallel fetch: clients + appointments + purchases.
        // Aggregates are computed in memory and joined by client_id.
        const [clientsSnap, appointmentsSnap, purchasesSnap, productAssignmentsSnap] = await Promise.all([
          getDocs(query(
            collection(db, ...orgPath, 'clients'),
            orderBy('created_at', 'desc'),
          )),
          getDocs(query(
            collection(db, ...orgPath, 'appointments'),
            where('status', '==', 'completed'),
          )),
          getDocs(query(
            collection(db, ...orgPath, 'purchases'),
            where('payment_status', 'in', ['completed', 'active']),
          )),
          getDocs(collection(db, ...orgPath, 'productAssignments')),
        ]);

        if (cancelled) return;

        const aggregates = new Map<string, ClientAggregates>();
        const ensure = (id: string): ClientAggregates => {
          let agg = aggregates.get(id);
          if (!agg) {
            agg = {
              totalVisits: 0,
              totalRevenue: 0,
              lastVisit: '',
              hasPackages: false,
              hasActivePackage: false,
              hasCompletedPackage: false,
              hasProducts: false,
            };
            aggregates.set(id, agg);
          }
          return agg;
        };

        appointmentsSnap.forEach((d) => {
          const data = d.data();
          const clientId = data.client_id;
          if (!clientId) return;
          const agg = ensure(clientId);
          agg.totalVisits += 1;
          const apptDate: string = data.appointment_date ?? '';
          if (apptDate && apptDate > agg.lastVisit) {
            agg.lastVisit = apptDate;
          }
        });

        purchasesSnap.forEach((d) => {
          const data = d.data();
          if (data.deleted_at) return;
          const clientId = data.client_id;
          if (!clientId) return;
          const agg = ensure(clientId);
          agg.totalRevenue += Number(data.total_amount || 0);
          // A purchase doc with a package_id means the client bought a package.
          // Without one (e.g., legacy/standalone purchase rows) we still count
          // it as a "package" purchase since it's not a productAssignment.
          agg.hasPackages = true;
          // Track active vs completed separately so we can derive a "Membership
          // Ended" status for clients whose packages are all used up.
          if (data.payment_status === 'active') {
            agg.hasActivePackage = true;
          } else if (data.payment_status === 'completed') {
            agg.hasCompletedPackage = true;
          }
        });

        // Standalone product assignments (no parent purchase) also count toward
        // client revenue — e.g. retail-only visits where no package was bought.
        productAssignmentsSnap.forEach((d) => {
          const data = d.data();
          if (data.deleted_at) return;
          const clientId = data.client_id;
          if (!clientId) return;
          const agg = ensure(clientId);
          const price = Number(data.assigned_price || 0);
          const qty = Number(data.quantity || 1);
          agg.totalRevenue += price * qty;
          agg.hasProducts = true;
        });

        let allClients = clientsSnap.docs
          .filter(d => !d.data().deleted_at)
          .map(d => {
            const data = d.data();
            const agg = aggregates.get(d.id);
            const hasMembership = data.has_membership ?? false;
            // Derive membership status from purchase lifecycle. The has_membership
            // flag stays as a manual override (e.g. Vagaro-imported clients with
            // no purchase record) but lifecycle is the source of truth:
            //   active package OR override → Have Membership
            //   only completed packages    → Membership Ended (red)
            //   nothing                    → Don't Have Membership
            let status: string;
            if (hasMembership || agg?.hasActivePackage) {
              status = 'Have Membership';
            } else if (agg?.hasCompletedPackage) {
              status = 'Membership Ended';
            } else {
              status = "Don't Have Membership";
            }
            return {
              id: d.id,
              name: data.name || '',
              email: data.email ?? undefined,
              phone: data.phone || '',
              address: data.address ?? undefined,
              city: data.city ?? undefined,
              date_of_birth: data.date_of_birth ?? undefined,
              referral_source: data.referral_source ?? undefined,
              allergies: data.allergies ?? undefined,
              notes: data.notes ?? undefined,
              gender: data.gender ?? undefined,
              age: data.age ?? undefined,
              created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
              updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
              has_membership: hasMembership,
              organization_id: data.organization_id ?? undefined,
              deleted_at: data.deleted_at ?? undefined,
              deleted_by: data.deleted_by ?? undefined,
              status,
              lastVisit: agg?.lastVisit || '',
              totalVisits: agg?.totalVisits ?? 0,
              activePackage: null,
              reviewReceived: false,
              birthday: data.date_of_birth ?? '',
              purchases: [],
              totalRevenue: agg?.totalRevenue ?? 0,
              recentPurchases: [],
            } as Client;
          });

        // Apply search filter
        const trimmed = searchTerm.trim().toLowerCase();
        if (trimmed) {
          allClients = allClients.filter(
            c =>
              c.name.toLowerCase().includes(trimmed) ||
              (c.phone || '').toLowerCase().includes(trimmed) ||
              (c.email || '').toLowerCase().includes(trimmed)
          );
        }

        // Apply status filter (now matches the derived status string so
        // "Membership Ended" can be filtered like the other two).
        if (filterStatus === 'Have Membership') {
          allClients = allClients.filter(c => c.status === 'Have Membership');
        } else if (filterStatus === 'Membership Ended') {
          allClients = allClients.filter(c => c.status === 'Membership Ended');
        } else if (filterStatus === "Don't Have Membership") {
          allClients = allClients.filter(c => c.status === "Don't Have Membership");
        }

        // Apply purchase-type filter
        if (purchaseFilter !== 'all') {
          allClients = allClients.filter(c => {
            const agg = aggregates.get(c.id);
            const hasPackages = !!agg?.hasPackages;
            const hasProducts = !!agg?.hasProducts;
            switch (purchaseFilter) {
              case 'has_packages':
                return hasPackages;
              case 'has_products':
                return hasProducts;
              case 'has_both':
                return hasPackages && hasProducts;
              case 'none':
                return !hasPackages && !hasProducts;
              default:
                return true;
            }
          });
        }

        const total = allClients.length;
        const from = (page - 1) * PAGE_SIZE;
        const paginated = allClients.slice(from, from + PAGE_SIZE);

        setClients(paginated);
        setTotalCount(total);
      } catch (err) {
        console.error('usePaginatedClients: fetch error', err);
        if (!cancelled) {
          setClients([]);
          setTotalCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id, searchTerm, filterStatus, purchaseFilter, page, version, fetchTick]);

  return { clients, totalCount, loading, refetch };
};
