import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { clientSchema, validateAndSanitize } from '@/lib/validation';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';

export interface Client {
  id: string;
  name: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  date_of_birth?: string;
  referral_source?: string;
  allergies?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  has_membership: boolean;
  organization_id?: string;
  deleted_at?: string;
  deleted_by?: string;
  acuity_customer_id?: string;
  last_synced_at?: string;
  sync_status?: string;
  acuity_sync_enabled?: boolean;
  status: string;
  lastVisit: string;
  totalVisits: number;
  activePackage: string | null;
  reviewReceived: boolean;
  birthday: string;
  purchases: any[];
  totalRevenue?: number;
  recentPurchases?: string[];
}

interface ClientsContextValue {
  clients: Client[];
  loading: boolean;
  addClient: (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => Promise<Client>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<Client>;
  deleteClient: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
  handleStatusChange: (clientId: string, newStatus: string) => Promise<void>;
  handleSaveClient: (clientData: Client) => Promise<void>;
  handleAddClient: (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  handleAssignment: (client: Client, assignment: any) => Promise<void>;
  handleBookAppointment: (client: Client, appointmentData: any) => Promise<void>;
}

const ClientsContext = createContext<ClientsContextValue | undefined>(undefined);

const errMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const transformClient = (id: string, data: any, extras?: Partial<Client>): Client => ({
  id,
  name: data.name || '',
  email: data.email ?? undefined,
  phone: data.phone || '',
  address: data.address ?? undefined,
  city: data.city ?? undefined,
  date_of_birth: data.date_of_birth ?? data.dateOfBirth ?? undefined,
  referral_source: data.referral_source ?? data.referralSource ?? undefined,
  allergies: data.allergies ?? undefined,
  notes: data.notes ?? undefined,
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  has_membership: data.has_membership ?? data.hasMembership ?? false,
  organization_id: data.organization_id ?? data.organizationId ?? undefined,
  deleted_at: data.deleted_at ?? undefined,
  deleted_by: data.deleted_by ?? undefined,
  acuity_customer_id: data.acuity_customer_id ?? undefined,
  last_synced_at: data.last_synced_at ?? undefined,
  sync_status: data.sync_status ?? undefined,
  acuity_sync_enabled: data.acuity_sync_enabled ?? undefined,
  status: (data.has_membership ?? data.hasMembership) ? 'Have Membership' : "Don't Have Membership",
  lastVisit: extras?.lastVisit ?? new Date().toISOString().split('T')[0],
  totalVisits: extras?.totalVisits ?? 0,
  activePackage: extras?.activePackage ?? null,
  reviewReceived: extras?.reviewReceived ?? false,
  birthday: data.date_of_birth ?? data.dateOfBirth ?? '',
  purchases: extras?.purchases ?? [],
  totalRevenue: extras?.totalRevenue ?? 0,
  recentPurchases: extras?.recentPurchases ?? [],
});

export const ClientsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { logSecurityEvent } = useSecurityValidation();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();

  const fetchClients = useCallback(async () => {
    if (!currentOrganization?.id) {
      setClients([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'clients'),
        where('deleted_at', '==', null),
        orderBy('created_at', 'desc')
      );

      let snapshot;
      try {
        snapshot = await getDocs(q);
      } catch {
        // Fallback if deleted_at field doesn't exist on all docs
        const q2 = query(
          collection(db, 'organizations', currentOrganization.id, 'clients'),
          orderBy('created_at', 'desc')
        );
        snapshot = await getDocs(q2);
      }

      const transformedClients = snapshot.docs
        .map(d => transformClient(d.id, d.data()))
        .filter(c => !c.deleted_at);

      setClients(transformedClients);
      await logSecurityEvent('CLIENTS_FETCHED', { count: transformedClients.length });
    } catch (error) {
      console.error('Error fetching clients:', error);
      await logSecurityEvent('CLIENTS_FETCH_ERROR', { error: errMessage(error) });
      toast({ title: 'Error', description: 'Failed to load clients', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const addClient = async (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<Client> => {
    if (!currentOrganization) throw new Error('No organization selected');

    try {
      const validatedData = validateAndSanitize(clientSchema, {
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone,
        address: clientData.address,
        city: clientData.city,
        date_of_birth: clientData.birthday || clientData.date_of_birth,
        referral_source: clientData.referral_source,
        allergies: clientData.allergies,
        notes: clientData.notes,
      });

      const docRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'clients'),
        {
          name: validatedData.name,
          email: validatedData.email ?? null,
          phone: validatedData.phone,
          address: validatedData.address ?? null,
          city: validatedData.city ?? null,
          date_of_birth: validatedData.date_of_birth ?? null,
          referral_source: validatedData.referral_source ?? null,
          allergies: validatedData.allergies ?? null,
          notes: validatedData.notes ?? null,
          has_membership: clientData.has_membership || false,
          organization_id: currentOrganization.id,
          deleted_at: null,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }
      );

      const newClient = transformClient(docRef.id, {
        ...validatedData,
        has_membership: clientData.has_membership || false,
        organization_id: currentOrganization.id,
        deleted_at: null,
        created_at: { toDate: () => new Date() },
        updated_at: { toDate: () => new Date() },
      });

      setClients(prev => [newClient, ...prev]);
      await logSecurityEvent('CLIENT_CREATED', { clientId: docRef.id });
      toast({ title: 'Success', description: 'Client added successfully' });
      return newClient;
    } catch (error: any) {
      console.error('Error adding client:', error);
      await logSecurityEvent('CLIENT_CREATE_FAILED', { error: errMessage(error) });

      if (error.errors) {
        const validationErrors = error.errors.map((err: any) => err.message).join(', ');
        toast({ title: 'Validation Error', description: validationErrors, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: 'Failed to add client', variant: 'destructive' });
      }
      throw error;
    }
  };

  const updateClient = async (id: string, updates: Partial<Client>): Promise<Client> => {
    if (!currentOrganization) throw new Error('No organization selected');

    try {
      let validatedData: any = updates;
      if (updates.name || updates.email || updates.phone) {
        validatedData = validateAndSanitize(clientSchema, {
          name: updates.name,
          email: updates.email,
          phone: updates.phone,
          address: updates.address,
          city: updates.city,
          date_of_birth: updates.birthday || updates.date_of_birth,
          referral_source: updates.referral_source,
          allergies: updates.allergies,
          notes: updates.notes,
        });
      }

      const clientRef = doc(db, 'organizations', currentOrganization.id, 'clients', id);
      await updateDoc(clientRef, {
        name: validatedData.name,
        email: validatedData.email ?? null,
        phone: validatedData.phone,
        address: validatedData.address ?? null,
        city: validatedData.city ?? null,
        date_of_birth: validatedData.birthday || validatedData.date_of_birth || null,
        referral_source: validatedData.referral_source ?? null,
        allergies: validatedData.allergies ?? null,
        notes: validatedData.notes ?? null,
        has_membership: updates.has_membership,
        updated_at: serverTimestamp(),
      });

      const existing = clients.find(c => c.id === id);
      const updatedClient = transformClient(id, { ...existing, ...validatedData, has_membership: updates.has_membership }, {
        lastVisit: updates.lastVisit || existing?.lastVisit,
        totalVisits: updates.totalVisits ?? existing?.totalVisits ?? 0,
        activePackage: updates.activePackage ?? existing?.activePackage ?? null,
        reviewReceived: updates.reviewReceived ?? existing?.reviewReceived ?? false,
        purchases: updates.purchases ?? existing?.purchases ?? [],
        totalRevenue: updates.totalRevenue ?? existing?.totalRevenue ?? 0,
        recentPurchases: updates.recentPurchases ?? existing?.recentPurchases ?? [],
      });

      setClients(prev => prev.map(client => (client.id === id ? updatedClient : client)));
      await logSecurityEvent('CLIENT_UPDATED', { clientId: id });
      toast({ title: 'Success', description: 'Client updated successfully' });
      return updatedClient;
    } catch (error: any) {
      console.error('Error updating client:', error);
      await logSecurityEvent('CLIENT_UPDATE_FAILED', { clientId: id, error: errMessage(error) });

      if (error.errors) {
        const validationErrors = error.errors.map((err: any) => err.message).join(', ');
        toast({ title: 'Validation Error', description: validationErrors, variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: 'Failed to update client', variant: 'destructive' });
      }
      throw error;
    }
  };

  const softDeleteClient = async (id: string) => {
    if (!currentOrganization) throw new Error('No organization selected');
    try {
      const clientRef = doc(db, 'organizations', currentOrganization.id, 'clients', id);
      await updateDoc(clientRef, {
        deleted_at: new Date().toISOString(),
        deleted_by: user?.uid ?? null,
        updated_at: serverTimestamp(),
      });
      setClients(prev => prev.filter(client => client.id !== id));
      await logSecurityEvent('CLIENT_DELETED', { clientId: id });
      toast({ title: 'Success', description: 'Client moved to trash (can be restored within 30 days)' });
    } catch (error) {
      console.error('Error deleting client:', error);
      await logSecurityEvent('CLIENT_DELETE_FAILED', { clientId: id, error: errMessage(error) });
      toast({ title: 'Error', description: 'Failed to delete client', variant: 'destructive' });
      throw error;
    }
  };

  const handleStatusChange = async (clientId: string, newStatus: string) => {
    const client = clients.find(c => c.id === clientId);
    if (client) {
      const hasMembership = newStatus === 'Have Membership';
      await updateClient(clientId, { ...client, has_membership: hasMembership });
    }
  };

  const handleSaveClient = async (clientData: Client) => {
    await updateClient(clientData.id, clientData);
  };

  const handleAddClient = async (clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => {
    await addClient(clientData);
  };

  const handleAssignment = async (client: Client, assignment: any) => {
    console.log('Assignment:', assignment);
    await logSecurityEvent('PACKAGE_ASSIGNMENT', { clientId: client.id, assignment });
  };

  const handleBookAppointment = async (client: Client, appointmentData: any) => {
    console.log('Book appointment:', appointmentData);
    await logSecurityEvent('APPOINTMENT_BOOKING', { clientId: client.id, appointmentData });
  };

  const value: ClientsContextValue = {
    clients,
    loading,
    addClient,
    updateClient,
    deleteClient: softDeleteClient,
    refetch: fetchClients,
    handleStatusChange,
    handleSaveClient,
    handleAddClient,
    handleAssignment,
    handleBookAppointment,
  };

  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
};

export const useClients = () => {
  const ctx = useContext(ClientsContext);
  if (!ctx) {
    throw new Error('useClients must be used within a ClientsProvider');
  }
  return ctx;
};
