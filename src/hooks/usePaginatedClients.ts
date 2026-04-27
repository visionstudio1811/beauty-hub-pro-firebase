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

export const PAGE_SIZE = 25;

interface UsePaginatedClientsParams {
  searchTerm: string;
  filterStatus: string;
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
}

export const usePaginatedClients = ({
  searchTerm,
  filterStatus,
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
        const [clientsSnap, appointmentsSnap, purchasesSnap] = await Promise.all([
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
        ]);

        if (cancelled) return;

        const aggregates = new Map<string, ClientAggregates>();
        const ensure = (id: string): ClientAggregates => {
          let agg = aggregates.get(id);
          if (!agg) {
            agg = { totalVisits: 0, totalRevenue: 0, lastVisit: '' };
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
          const clientId = data.client_id;
          if (!clientId) return;
          const agg = ensure(clientId);
          agg.totalRevenue += Number(data.total_amount || 0);
        });

        let allClients = clientsSnap.docs
          .filter(d => !d.data().deleted_at)
          .map(d => {
            const data = d.data();
            const agg = aggregates.get(d.id);
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
              created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
              updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
              has_membership: data.has_membership ?? false,
              organization_id: data.organization_id ?? undefined,
              deleted_at: data.deleted_at ?? undefined,
              deleted_by: data.deleted_by ?? undefined,
              status: data.has_membership ? 'Have Membership' : "Don't Have Membership",
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
          allClients = allClients.filter(c => c.has_membership);
        } else if (filterStatus === "Don't Have Membership") {
          allClients = allClients.filter(c => !c.has_membership);
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
  }, [currentOrganization?.id, searchTerm, filterStatus, page, version, fetchTick]);

  return { clients, totalCount, loading, refetch };
};
