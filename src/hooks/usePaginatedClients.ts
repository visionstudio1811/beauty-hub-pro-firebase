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
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Client } from '@/contexts/ClientsContext';
import { validateDate } from '@/lib/timeUtils';
import type { PurchaseFilter, SortField, SortDir } from '@/hooks/useClientFilters';

export const PAGE_SIZE = 25;

interface UsePaginatedClientsParams {
  searchTerm: string;
  filterStatus: string;
  purchaseFilter?: PurchaseFilter;
  sortField?: SortField;
  sortDir?: SortDir;
  page: number;
  version?: number;
}

interface StatsAggregates {
  totalRevenue: number;
  vipCount: number;
  newCount: number;
}

interface UsePaginatedClientsResult {
  clients: Client[];
  totalCount: number;
  aggregates: StatsAggregates;
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

interface SessionSlot {
  total?: number;
  remaining?: number;
}

export const usePaginatedClients = ({
  searchTerm,
  filterStatus,
  purchaseFilter = 'all',
  sortField = 'created',
  sortDir = 'desc',
  page,
  version = 0,
}: UsePaginatedClientsParams): UsePaginatedClientsResult => {
  const { currentOrganization } = useOrganization();
  // productAssignments is an admin-only read (firestore.rules). Non-admin staff
  // never see retail revenue in the UI, so the fetch below is skipped for them.
  const isAdmin = useIsAdmin();
  const [clients, setClients] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [aggregates, setAggregates] = useState<StatsAggregates>({
    totalRevenue: 0,
    vipCount: 0,
    newCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = useCallback(() => setFetchTick(t => t + 1), []);

  useEffect(() => {
    if (!currentOrganization?.id) {
      setClients([]);
      setTotalCount(0);
      setAggregates({ totalRevenue: 0, vipCount: 0, newCount: 0 });
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const orgId = currentOrganization.id;
        const orgPath = ['organizations', orgId] as const;

        // Parallel fetch: clients + appointments + purchases + product assignments + packages.
        // Packages give us total_sessions per package_id so we can compute
        // sessions-used per purchase (total_sessions - sessions_remaining).
        // productAssignments is admin-only at the rules level — non-admins
        // skip it (it only feeds retail revenue, which they never see).
        const [
          clientsSnap,
          appointmentsSnap,
          purchasesSnap,
          productAssignmentsSnap,
          packagesSnap,
        ] = await Promise.all([
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
          isAdmin
            ? getDocs(collection(db, ...orgPath, 'productAssignments'))
            : Promise.resolve(null),
          getDocs(collection(db, ...orgPath, 'packages')),
        ]);

        if (cancelled) return;

        // Catalog map: package_id → total_sessions. Purchases don't store
        // total_sessions on the doc itself, so we look it up from the catalog
        // to compute sessions used (= total - remaining) for the visits count.
        const packageTotalSessions = new Map<string, number>();
        packagesSnap.forEach((d) => {
          const data = d.data();
          packageTotalSessions.set(d.id, Number(data.total_sessions || 0));
        });

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

        // Standalone appointments (not tied to a purchase) count as a visit
        // directly. Package-linked appointments are captured via the purchase's
        // sessions_used below — counting both would double-count.
        appointmentsSnap.forEach((d) => {
          const data = d.data();
          const clientId = data.client_id;
          if (!clientId) return;
          const agg = ensure(clientId);
          // Always track lastVisit from any completed appointment.
          const apptDate: string = data.appointment_date ?? '';
          if (apptDate && apptDate > agg.lastVisit) {
            agg.lastVisit = apptDate;
          }
          if (!data.purchase_id) {
            agg.totalVisits += 1;
          }
        });

        // For each purchase, count sessions_used = total - remaining toward the
        // client's visits. This captures both appointment-driven decrements
        // (handled atomically in decrementSessionForAppointment) and manual
        // session edits in PurchaseManagementModal.
        purchasesSnap.forEach((d) => {
          const data = d.data();
          if (data.deleted_at) return;
          const clientId = data.client_id;
          if (!clientId) return;
          const agg = ensure(clientId);
          agg.totalRevenue += Number(data.total_amount || 0);
          agg.hasPackages = true;
          if (data.payment_status === 'active') {
            agg.hasActivePackage = true;
          } else if (data.payment_status === 'completed') {
            agg.hasCompletedPackage = true;
          }

          // Sessions used: prefer per-treatment slots when present (they carry
          // per-purchase totals so we don't need the catalog), otherwise fall
          // back to the catalog package's total_sessions.
          let sessionsUsed = 0;
          const slots = Array.isArray(data.sessions_by_treatment)
            ? (data.sessions_by_treatment as SessionSlot[])
            : null;
          if (slots && slots.length > 0) {
            for (const slot of slots) {
              const t = Number(slot.total || 0);
              const r = Number(slot.remaining || 0);
              if (t > r) sessionsUsed += t - r;
            }
          } else {
            const total = packageTotalSessions.get(data.package_id) ?? 0;
            const remaining = Number(data.sessions_remaining || 0);
            if (total > remaining) sessionsUsed = total - remaining;
          }
          agg.totalVisits += sessionsUsed;
        });

        // Standalone product assignments (no parent purchase) also count toward
        // client revenue — e.g. retail-only visits where no package was bought.
        // productAssignmentsSnap is null for non-admins (fetch skipped above).
        if (productAssignmentsSnap) {
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
        }

        let allClients = clientsSnap.docs
          .filter(d => !d.data().deleted_at)
          .map(d => {
            const data = d.data();
            const agg = aggregates.get(d.id);
            const hasMembership = data.has_membership ?? false;
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

        // Apply status filter
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

        // Sort. Default (created/desc) matches the prior implicit order so a
        // user who never touches the sort dropdown sees the same list as before.
        const dirMul = sortDir === 'asc' ? 1 : -1;
        const compareNum = (a: number, b: number) => (a - b) * dirMul;
        const compareStr = (a: string, b: string) => {
          // Empty strings sort to the end regardless of direction so clients
          // with no visits / no last-visit don't crowd the top.
          if (!a && !b) return 0;
          if (!a) return 1;
          if (!b) return -1;
          return a < b ? -1 * dirMul : a > b ? 1 * dirMul : 0;
        };
        allClients.sort((a, b) => {
          switch (sortField) {
            case 'visits':
              return compareNum(a.totalVisits ?? 0, b.totalVisits ?? 0);
            case 'revenue':
              return compareNum(a.totalRevenue ?? 0, b.totalRevenue ?? 0);
            case 'lastVisit':
              return compareStr(a.lastVisit || '', b.lastVisit || '');
            case 'created':
            default:
              return compareStr(a.created_at || '', b.created_at || '');
          }
        });

        const total = allClients.length;

        // Org-wide stat-card aggregates, computed over the SAME (search + status +
        // purchase) filtered universe that `totalCount` counts — NOT the paginated
        // slice — so Total Revenue / VIP / New Clients stay constant across page
        // changes and stay coherent with the Total Clients card. `created_at` is an
        // ISO string here (or a Timestamp upstream); parse via validateDate, never
        // `new Date()` directly on a Timestamp.
        const NEW_CLIENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
        const newCutoff = Date.now() - NEW_CLIENT_WINDOW_MS;
        let aggTotalRevenue = 0;
        let aggVipCount = 0;
        let aggNewCount = 0;
        for (const c of allClients) {
          aggTotalRevenue += c.totalRevenue || 0;
          if (c.has_membership) aggVipCount += 1;
          const created = validateDate(c.created_at);
          if (created && created.getTime() >= newCutoff) aggNewCount += 1;
        }

        const from = (page - 1) * PAGE_SIZE;
        const paginated = allClients.slice(from, from + PAGE_SIZE);

        setClients(paginated);
        setTotalCount(total);
        setAggregates({
          totalRevenue: aggTotalRevenue,
          vipCount: aggVipCount,
          newCount: aggNewCount,
        });
      } catch (err) {
        console.error('usePaginatedClients: fetch error', err);
        if (!cancelled) {
          setClients([]);
          setTotalCount(0);
          setAggregates({ totalRevenue: 0, vipCount: 0, newCount: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [currentOrganization?.id, isAdmin, searchTerm, filterStatus, purchaseFilter, sortField, sortDir, page, version, fetchTick]);

  return { clients, totalCount, aggregates, loading, refetch };
};
