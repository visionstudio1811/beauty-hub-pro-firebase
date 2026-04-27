import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logo_url?: string | null;
  timezone: string; // IANA timezone identifier e.g. "America/New_York"
  settings?: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

const docToOrganization = (id: string, data: any): Organization => ({
  id,
  name: data.name || '',
  slug: data.slug || '',
  email: data.email ?? null,
  phone: data.phone ?? null,
  address: data.address ?? null,
  logo_url: data.logo_url ?? null,
  timezone: data.timezone || 'America/New_York',
  settings: data.settings ?? null,
  is_active: data.is_active ?? true,
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  created_by: data.created_by ?? null,
});

export const useFirebaseOrganizations = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const fetchOrganizations = async () => {
    // Only fetch the organization the current user belongs to.
    // Never query all organizations — users must only see their own org.
    if (!profile?.organizationId) {
      setLoading(false);
      return;
    }
    try {
      const orgRef = doc(db, 'organizations', profile.organizationId);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        const org = docToOrganization(orgSnap.id, orgSnap.data());
        setOrganizations([org]);
      } else {
        setOrganizations([]);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load organization',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentOrganization = async () => {
    if (!profile?.organizationId) return;
    try {
      const orgRef = doc(db, 'organizations', profile.organizationId);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        setCurrentOrganization(docToOrganization(orgSnap.id, orgSnap.data()));
      }
    } catch (error) {
      console.error('Error fetching current organization:', error);
    }
  };

  useEffect(() => {
    if (!user || !profile) {
      // Flush cached org state on sign-out so the next user on a shared device
      // does not see the previous tenant's name/logo in the UI.
      setOrganizations([]);
      setCurrentOrganization(null);
      setLoading(false);
      return;
    }
    fetchOrganizations();
    fetchCurrentOrganization();
  }, [user, profile]);

  const createOrganization = async (
    orgData: Omit<Organization, 'id' | 'created_at' | 'updated_at' | 'created_by'>
  ): Promise<Organization> => {
    try {
      const docRef = await addDoc(collection(db, 'organizations'), {
        ...orgData,
        created_by: user?.uid ?? null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      const newOrg = docToOrganization(docRef.id, {
        ...orgData,
        created_by: user?.uid ?? null,
        created_at: { toDate: () => new Date() },
        updated_at: { toDate: () => new Date() },
      });

      // Update user profile to link to new organization
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          organizationId: docRef.id,
          organizationRole: 'owner',
          updated_at: serverTimestamp(),
        });
      }

      setOrganizations(prev => [...prev, newOrg]);
      setCurrentOrganization(newOrg);

      toast({ title: 'Success', description: 'Organization created successfully' });
      return newOrg;
    } catch (error) {
      console.error('Error creating organization:', error);
      toast({ title: 'Error', description: 'Failed to create organization', variant: 'destructive' });
      throw error;
    }
  };

  const updateOrganization = async (id: string, updates: Partial<Organization>): Promise<Organization> => {
    try {
      const orgRef = doc(db, 'organizations', id);
      await updateDoc(orgRef, { ...updates, updated_at: serverTimestamp() });

      const updatedOrg = { ...organizations.find(o => o.id === id)!, ...updates };
      setOrganizations(prev => prev.map(org => (org.id === id ? updatedOrg : org)));
      if (currentOrganization?.id === id) {
        setCurrentOrganization(updatedOrg);
      }

      toast({ title: 'Success', description: 'Organization updated successfully' });
      return updatedOrg;
    } catch (error) {
      console.error('Error updating organization:', error);
      toast({ title: 'Error', description: 'Failed to update organization', variant: 'destructive' });
      throw error;
    }
  };

  const switchOrganization = async (_organizationId: string) => {
    // Changing a user's organizationId is not allowed from the client — the
    // Firestore rule on users/{uid} locks organizationId once it is set to
    // prevent cross-tenant escalation. If multi-org membership is ever needed,
    // add a Cloud Function that validates an invite/membership record.
    toast({
      title: 'Not available',
      description: 'Organization switching must be performed by an administrator.',
      variant: 'destructive',
    });
    throw new Error('Organization switching is disabled on the client.');
  };

  return {
    organizations,
    currentOrganization,
    loading,
    createOrganization,
    updateOrganization,
    switchOrganization,
    refetch: fetchOrganizations,
  };
};

// Keep backward-compatible export name
export const useSupabaseOrganizations = useFirebaseOrganizations;
