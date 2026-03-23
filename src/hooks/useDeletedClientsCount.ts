import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';

export const useDeletedClientsCount = () => {
  const [deletedCount, setDeletedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const { currentOrganization } = useOrganization();

  const fetchDeletedCount = async () => {
    if (!currentOrganization?.id) {
      setDeletedCount(0);
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'clients'),
        where('deleted_at', '!=', null)
      );
      const snapshot = await getDocs(q);
      setDeletedCount(snapshot.size);
    } catch (error) {
      console.error('Error fetching deleted clients count:', error);
      setDeletedCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedCount();
  }, [currentOrganization?.id]);

  return {
    deletedCount,
    loading,
    refetch: fetchDeletedCount,
  };
};
