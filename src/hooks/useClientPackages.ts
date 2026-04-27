import { useState, useEffect } from 'react';
import { collection, doc, getDocs, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface SessionSlot {
  treatment_id: string;
  remaining: number;
  total: number;
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
  price: number;
  is_custom?: boolean;
}

export const useClientPackages = (clientId?: string) => {
  const [packages, setPackages] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  useEffect(() => {
    if (clientId && currentOrganization?.id) {
      fetchClientPackages(clientId);
    } else {
      setPackages([]);
    }
  }, [clientId, currentOrganization?.id]);

  const fetchClientPackages = async (cId: string) => {
    if (!currentOrganization?.id) return;
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const purchasesSnap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'purchases'),
          where('client_id', '==', cId),
          where('payment_status', '==', 'active')
        )
      );

      const transformedPackages: ClientPackage[] = [];

      for (const purchaseDoc of purchasesSnap.docs) {
        const purchase = purchaseDoc.data();
        if ((purchase.sessions_remaining || 0) <= 0) continue;
        if (purchase.expiry_date && purchase.expiry_date < today) continue;

        // Fetch package details
        let pkgData: any = {};
        if (purchase.package_id) {
          const pkgSnap = await getDoc(
            doc(db, 'organizations', currentOrganization.id, 'packages', purchase.package_id)
          );
          if (pkgSnap.exists()) pkgData = pkgSnap.data();
        }

        const sessionsByTreatment = Array.isArray(purchase.sessions_by_treatment)
          ? (purchase.sessions_by_treatment as SessionSlot[])
          : undefined;

        transformedPackages.push({
          id: purchaseDoc.id,
          package_id: purchase.package_id || '',
          package_name: pkgData.name || '',
          package_description: pkgData.description || '',
          sessions_remaining: purchase.sessions_remaining || 0,
          total_sessions: pkgData.total_sessions || 0,
          expiry_date: purchase.expiry_date || null,
          payment_status: purchase.payment_status || '',
          treatments: pkgData.treatments || [],
          sessions_by_treatment: sessionsByTreatment,
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
  };

  const refreshPackages = () => {
    if (clientId) fetchClientPackages(clientId);
  };

  return {
    packages,
    loading,
    refetch: () => clientId && fetchClientPackages(clientId),
    refreshPackages,
  };
};
