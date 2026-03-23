import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';

interface RevenueData {
  totalRevenue: number;
  packageRevenue: number;
  productRevenue: number;
  appointmentRevenue: number;
  loading: boolean;
  error: string | null;
}

export const useClientRevenue = (clientId?: string) => {
  const { currentOrganization } = useOrganization();
  const [revenueData, setRevenueData] = useState<RevenueData>({
    totalRevenue: 0,
    packageRevenue: 0,
    productRevenue: 0,
    appointmentRevenue: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!currentOrganization?.id) return;
    if (clientId) {
      fetchClientRevenue(clientId);
    } else {
      fetchTotalRevenue();
    }
  }, [clientId, currentOrganization?.id]);

  const fetchClientRevenue = async (cId: string) => {
    if (!currentOrganization?.id) return;
    try {
      setRevenueData(prev => ({ ...prev, loading: true, error: null }));

      // Fetch package purchases
      const purchasesSnap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'purchases'),
          where('client_id', '==', cId),
          where('payment_status', 'in', ['completed', 'active'])
        )
      );

      const packageRevenue = purchasesSnap.docs.reduce(
        (sum, d) => sum + (Number(d.data().total_amount) || 0),
        0
      );

      // Fetch product assignments
      const productSnap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'productAssignments'),
          where('client_id', '==', cId),
          where('status', '==', 'delivered')
        )
      );

      const productRevenue = productSnap.docs.reduce(
        (sum, d) => sum + Number(d.data().assigned_price || 0) * (d.data().quantity || 1),
        0
      );

      const totalRevenue = packageRevenue + productRevenue;

      setRevenueData({
        totalRevenue,
        packageRevenue,
        productRevenue,
        appointmentRevenue: 0,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching client revenue:', error);
      setRevenueData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch revenue data',
      }));
    }
  };

  const fetchTotalRevenue = async () => {
    if (!currentOrganization?.id) return;
    try {
      setRevenueData(prev => ({ ...prev, loading: true, error: null }));

      const allPurchasesSnap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'purchases'),
          where('payment_status', 'in', ['completed', 'active'])
        )
      );

      const packageRevenue = allPurchasesSnap.docs.reduce(
        (sum, d) => sum + (Number(d.data().total_amount) || 0),
        0
      );

      const allProductSnap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'productAssignments'),
          where('status', '==', 'delivered')
        )
      );

      const productRevenue = allProductSnap.docs.reduce(
        (sum, d) => sum + Number(d.data().assigned_price || 0) * (d.data().quantity || 1),
        0
      );

      const totalRevenue = packageRevenue + productRevenue;

      setRevenueData({
        totalRevenue,
        packageRevenue,
        productRevenue,
        appointmentRevenue: 0,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching total revenue:', error);
      setRevenueData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch revenue data',
      }));
    }
  };

  const refetch = () => {
    if (!currentOrganization?.id) return;
    if (clientId) {
      fetchClientRevenue(clientId);
    } else {
      fetchTotalRevenue();
    }
  };

  return { ...revenueData, refetch };
};
