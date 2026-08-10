import { useState, useEffect, useCallback } from 'react';
import { collection, doc, getDocs, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface SessionSlot {
  treatment_id: string;
  remaining: number;
  total: number;
}

export interface ProductSnapshot {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

export interface ClientPackage {
  id: string;
  package_id: string;
  package_name: string;
  package_description: string;
  sessions_remaining: number;
  total_sessions: number;
  expiry_date: string | null;
  payment_status: string;
  treatments: string[];
  sessions_by_treatment?: SessionSlot[];
  product_snapshot?: ProductSnapshot[];
  price: number;
  is_custom?: boolean;
}

export const useClientPackages = (clientId?: string) => {
  const [packages, setPackages] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const orgId = currentOrganization?.id;

  const fetchClientPackages = useCallback(async (cId: string) => {
    if (!orgId) return;
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const purchasesSnap = await getDocs(
        query(
          collection(db, 'organizations', orgId, 'purchases'),
          where('client_id', '==', cId),
          where('payment_status', '==', 'active')
        )
      );

      const transformedPackages: ClientPackage[] = [];

      for (const purchaseDoc of purchasesSnap.docs) {
        const purchase = purchaseDoc.data();
        if (purchase.deleted_at) continue;
        if ((purchase.sessions_remaining || 0) <= 0) continue;
        if (purchase.expiry_date && purchase.expiry_date < today) continue;

        // Fetch package details
        let pkgData: any = {};
        if (purchase.package_id) {
          const pkgSnap = await getDoc(
            doc(db, 'organizations', orgId, 'packages', purchase.package_id)
          );
          if (pkgSnap.exists()) pkgData = pkgSnap.data();
        }

        const sessionsByTreatment = Array.isArray(purchase.sessions_by_treatment)
          ? (purchase.sessions_by_treatment as SessionSlot[])
          : undefined;

        const productSnapshot = Array.isArray(purchase.product_snapshot) ? purchase.product_snapshot : undefined;

        const descriptionOverride = typeof purchase.description_override === 'string' ? purchase.description_override : null;
        transformedPackages.push({
          id: purchaseDoc.id,
          package_id: purchase.package_id || '',
          package_name: pkgData.name || '',
          package_description: descriptionOverride ?? pkgData.description ?? '',
          sessions_remaining: purchase.sessions_remaining || 0,
          total_sessions: pkgData.total_sessions || 0,
          expiry_date: purchase.expiry_date || null,
          payment_status: purchase.payment_status || '',
          treatments: pkgData.treatments || [],
          sessions_by_treatment: sessionsByTreatment,
          product_snapshot: productSnapshot,
          price: pkgData.price || 0,
          is_custom: pkgData.is_custom ?? false,
        });
      }

      setPackages(transformedPackages);
    } catch (error) {
      console.error('Error fetching client packages:', error);
      toast({ title: 'Error', description: 'Failed to load client packages', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => {
    if (clientId && orgId) {
      fetchClientPackages(clientId);
    } else {
      setPackages([]);
    }
  }, [clientId, orgId, fetchClientPackages]);

  const refreshPackages = useCallback(() => {
    if (clientId) fetchClientPackages(clientId);
  }, [clientId, fetchClientPackages]);

  const refetch = useCallback(() => {
    if (clientId) fetchClientPackages(clientId);
  }, [clientId, fetchClientPackages]);

  return {
    packages,
    loading,
    refetch,
    refreshPackages,
  };
};
