import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import type { Invoice } from '@/types/firestore';

// Call with a clientId for per-client subscription (client detail modal), or
// omit to subscribe to every invoice in the current org (Invoice History view).
export function useInvoices(clientId?: string) {
  const { currentOrganization } = useOrganization();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrganization?.id) {
      setInvoices([]);
      return;
    }

    setLoading(true);
    const base = collection(db, 'organizations', currentOrganization.id, 'invoices');
    const q = clientId
      ? query(base, where('client_id', '==', clientId), orderBy('invoice_number_int', 'desc'))
      : query(base, orderBy('invoice_number_int', 'desc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setInvoices(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Invoice, 'id'>) })),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [currentOrganization?.id, clientId]);

  return { invoices, loading };
}
