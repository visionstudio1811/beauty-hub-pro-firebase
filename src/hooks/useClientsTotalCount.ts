import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';

export const useClientsTotalCount = () => {
  const { currentOrganization } = useOrganization();
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchTotalCount = async () => {
    if (!currentOrganization?.id) return;
    try {
      // Count non-deleted clients
      const snap = await getDocs(
        collection(db, 'organizations', currentOrganization.id, 'clients')
      );
      const count = snap.docs.filter(d => !d.data().deleted_at).length;
      setTotalCount(count);
    } catch (err) {
      console.error('Error fetching clients total count:', err);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchTotalCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrganization?.id]);

  return { totalCount, loading, refetch: fetchTotalCount };
};
