import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';

interface ClientProduct {
  id: string;
  product_id: string;
  client_id: string;
  assigned_price: number;
  quantity: number;
  status: string;
  assigned_at: string;
  notes?: string;
  products: {
    id: string;
    name: string;
    description?: string;
    price: number;
    image_url?: string;
  } | null;
}

export const useClientProducts = (clientId?: string) => {
  const { currentOrganization } = useOrganization();

  const { data: products = [], isLoading, error, refetch } = useQuery({
    queryKey: ['client-products', clientId, currentOrganization?.id],
    queryFn: async () => {
      if (!clientId || !currentOrganization?.id) return [];

      const snap = await getDocs(
        query(
          collection(db, 'organizations', currentOrganization.id, 'productAssignments'),
          where('client_id', '==', clientId),
          orderBy('assigned_at', 'desc')
        )
      );

      const results: ClientProduct[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        let productData: ClientProduct['products'] = null;

        if (data.product_id) {
          const productSnap = await getDoc(
            doc(db, 'organizations', currentOrganization.id, 'products', data.product_id)
          );
          if (productSnap.exists()) {
            const p = productSnap.data();
            productData = {
              id: productSnap.id,
              name: p.name || '',
              description: p.description ?? undefined,
              price: p.price ?? 0,
              image_url: p.image_url ?? undefined,
            };
          }
        }

        results.push({
          id: d.id,
          product_id: data.product_id || '',
          client_id: data.client_id || '',
          assigned_price: data.assigned_price ?? 0,
          quantity: data.quantity ?? 1,
          status: data.status || '',
          assigned_at: data.assigned_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          notes: data.notes ?? undefined,
          products: productData,
        });
      }

      return results;
    },
    enabled: !!clientId && !!currentOrganization?.id,
  });

  return { products, isLoading, error, refetch };
};
