import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Client } from '@/contexts/ClientsContext';

export const useDeletedClients = () => {
  const [deletedClients, setDeletedClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const fetchDeletedClients = async () => {
    if (!currentOrganization?.id) {
      setDeletedClients([]);
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'clients'),
        where('deleted_at', '!=', null),
        orderBy('deleted_at', 'desc')
      );
      const snapshot = await getDocs(q);
      const transformedClients = snapshot.docs
        .filter(d => d.data().deleted_at)
        .map(d => {
          const data = d.data();
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
            lastVisit: new Date().toISOString().split('T')[0],
            totalVisits: 0,
            activePackage: null,
            reviewReceived: false,
            birthday: data.date_of_birth || '',
            purchases: [],
            totalRevenue: 0,
            recentPurchases: [],
          } as Client;
        });
      setDeletedClients(transformedClients);
    } catch (error) {
      console.error('Error fetching deleted clients:', error);
      toast({ title: 'Error', description: 'Failed to load deleted clients', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedClients();
  }, [currentOrganization?.id]);

  const restoreClient = async (clientId: string) => {
    if (!currentOrganization?.id) return;
    try {
      const clientRef = doc(db, 'organizations', currentOrganization.id, 'clients', clientId);
      await updateDoc(clientRef, {
        deleted_at: null,
        deleted_by: null,
        updated_at: serverTimestamp(),
      });
      setDeletedClients(prev => prev.filter(client => client.id !== clientId));
      toast({ title: 'Success', description: 'Client restored successfully' });
    } catch (error) {
      console.error('Error restoring client:', error);
      toast({ title: 'Error', description: 'Failed to restore client', variant: 'destructive' });
      throw error;
    }
  };

  const permanentlyDeleteClient = async (clientId: string) => {
    if (!currentOrganization?.id) return;
    try {
      const clientRef = doc(db, 'organizations', currentOrganization.id, 'clients', clientId);
      await deleteDoc(clientRef);
      setDeletedClients(prev => prev.filter(client => client.id !== clientId));
      toast({ title: 'Success', description: 'Client permanently deleted' });
    } catch (error) {
      console.error('Error permanently deleting client:', error);
      toast({ title: 'Error', description: 'Failed to permanently delete client', variant: 'destructive' });
      throw error;
    }
  };

  return {
    deletedClients,
    loading,
    restoreClient,
    permanentlyDeleteClient,
    refetch: fetchDeletedClients,
  };
};
