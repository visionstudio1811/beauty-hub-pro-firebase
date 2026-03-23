import { useState, useEffect } from 'react';
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
import { useOrganization } from '@/contexts/OrganizationContext';

export interface Staff {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  specialties: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const docToStaff = (id: string, data: any): Staff => ({
  id,
  name: data.name || '',
  email: data.email ?? undefined,
  phone: data.phone ?? undefined,
  specialties: data.specialties ?? [],
  is_active: data.is_active ?? data.isActive ?? true,
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
});

export const useSupabaseStaff = () => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const fetchStaff = async () => {
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'staff'),
        where('is_active', '==', true),
        orderBy('name')
      );
      const snapshot = await getDocs(q);
      setStaff(snapshot.docs.map(d => docToStaff(d.id, d.data())));
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast({ title: 'Error', description: 'Failed to load staff', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, [currentOrganization?.id]);

  const addStaff = async (staffData: Omit<Staff, 'id' | 'created_at' | 'updated_at'>): Promise<Staff> => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      const docRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'staff'),
        { ...staffData, created_at: serverTimestamp(), updated_at: serverTimestamp() }
      );
      const newMember = docToStaff(docRef.id, {
        ...staffData,
        created_at: { toDate: () => new Date() },
        updated_at: { toDate: () => new Date() },
      });
      setStaff(prev => [...prev, newMember]);
      toast({ title: 'Success', description: 'Staff member added successfully' });
      return newMember;
    } catch (error) {
      console.error('Error adding staff:', error);
      toast({ title: 'Error', description: 'Failed to add staff member', variant: 'destructive' });
      throw error;
    }
  };

  const updateStaff = async (id: string, updates: Partial<Staff>): Promise<Staff> => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      const staffRef = doc(db, 'organizations', currentOrganization.id, 'staff', id);
      await updateDoc(staffRef, { ...updates, updated_at: serverTimestamp() });
      const updatedMember = { ...staff.find(s => s.id === id)!, ...updates };
      setStaff(prev => prev.map(member => (member.id === id ? updatedMember : member)));
      toast({ title: 'Success', description: 'Staff member updated successfully' });
      return updatedMember;
    } catch (error) {
      console.error('Error updating staff:', error);
      toast({ title: 'Error', description: 'Failed to update staff member', variant: 'destructive' });
      throw error;
    }
  };

  return {
    staff,
    loading,
    addStaff,
    updateStaff,
    refetch: fetchStaff,
  };
};
