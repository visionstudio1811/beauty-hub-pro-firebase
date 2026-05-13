import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import type { InvoiceDraft, InvoiceDraftLine } from '@/types/firestore';

export type DraftPayload = {
  client_id: string | null;
  purchase_id?: string | null;
  lines: InvoiceDraftLine[];
  payment_method?: string;
  notes?: string;
};

export const useInvoiceDrafts = (clientId?: string | null) => {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const queryKey = useMemo(
    () => ['invoice-drafts', orgId, clientId ?? null] as const,
    [orgId, clientId],
  );

  const { data: drafts = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<InvoiceDraft[]> => {
      if (!orgId) return [];
      const baseRef = collection(db, 'organizations', orgId, 'invoiceDrafts');
      const q = clientId
        ? query(baseRef, where('client_id', '==', clientId), orderBy('updated_at', 'desc'))
        : query(baseRef, orderBy('updated_at', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          client_id: data.client_id ?? null,
          purchase_id: data.purchase_id ?? null,
          lines: Array.isArray(data.lines) ? (data.lines as InvoiceDraftLine[]) : [],
          payment_method: data.payment_method ?? undefined,
          notes: data.notes ?? undefined,
          created_at: data.created_at,
          updated_at: data.updated_at,
          created_by: data.created_by ?? '',
          updated_by: data.updated_by ?? '',
        };
      });
    },
    enabled: !!orgId,
  });

  const saveDraft = useCallback(
    async (payload: DraftPayload, existingId?: string): Promise<string> => {
      if (!orgId) throw new Error('No organization');
      if (!user?.uid) throw new Error('Not signed in');
      const collRef = collection(db, 'organizations', orgId, 'invoiceDrafts');
      const data = {
        client_id: payload.client_id,
        purchase_id: payload.purchase_id ?? null,
        lines: payload.lines,
        payment_method: payload.payment_method ?? null,
        notes: payload.notes ?? null,
        updated_at: serverTimestamp(),
        updated_by: user.uid,
      };

      if (existingId) {
        await updateDoc(doc(collRef, existingId), data);
        await queryClient.invalidateQueries({ queryKey });
        return existingId;
      }

      const newRef = doc(collRef);
      await setDoc(newRef, {
        ...data,
        created_at: serverTimestamp(),
        created_by: user.uid,
      });
      await queryClient.invalidateQueries({ queryKey });
      return newRef.id;
    },
    [orgId, user?.uid, queryClient, queryKey],
  );

  const loadDraft = useCallback(
    async (id: string): Promise<InvoiceDraft | null> => {
      if (!orgId) return null;
      const ref = doc(db, 'organizations', orgId, 'invoiceDrafts', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        id: snap.id,
        client_id: data.client_id ?? null,
        purchase_id: data.purchase_id ?? null,
        lines: Array.isArray(data.lines) ? (data.lines as InvoiceDraftLine[]) : [],
        payment_method: data.payment_method ?? undefined,
        notes: data.notes ?? undefined,
        created_at: data.created_at,
        updated_at: data.updated_at,
        created_by: data.created_by ?? '',
        updated_by: data.updated_by ?? '',
      };
    },
    [orgId],
  );

  const deleteDraft = useCallback(
    async (id: string): Promise<void> => {
      if (!orgId) return;
      await deleteDoc(doc(db, 'organizations', orgId, 'invoiceDrafts', id));
      await queryClient.invalidateQueries({ queryKey });
    },
    [orgId, queryClient, queryKey],
  );

  return { drafts, isLoading, refetch, saveDraft, loadDraft, deleteDraft };
};
