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

export interface Treatment {
  id: string;
  name: string;
  description?: string;
  duration: number;
  price?: number;
  category?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const docToTreatment = (id: string, data: any): Treatment => ({
  id,
  name: data.name || '',
  description: data.description ?? undefined,
  duration: data.duration ?? 60,
  price: data.price ?? undefined,
  category: data.category ?? undefined,
  is_active: data.is_active ?? data.isActive ?? true,
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
});

export const useSupabaseTreatments = () => {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const fetchTreatments = async () => {
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'treatments'),
        where('is_active', '==', true),
        orderBy('category'),
        orderBy('name')
      );
      const snapshot = await getDocs(q);
      setTreatments(snapshot.docs.map(d => docToTreatment(d.id, d.data())));
    } catch (error) {
      console.error('Error fetching treatments:', error);
      toast({ title: 'Error', description: 'Failed to load treatments', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTreatments();
  }, [currentOrganization?.id]);

  const addTreatment = async (
    treatmentData: Omit<Treatment, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Treatment> => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      const docRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'treatments'),
        { ...treatmentData, created_at: serverTimestamp(), updated_at: serverTimestamp() }
      );
      const newTreatment = docToTreatment(docRef.id, {
        ...treatmentData,
        created_at: { toDate: () => new Date() },
        updated_at: { toDate: () => new Date() },
      });
      setTreatments(prev => [...prev, newTreatment]);
      toast({ title: 'Success', description: 'Treatment added successfully' });
      return newTreatment;
    } catch (error) {
      console.error('Error adding treatment:', error);
      toast({ title: 'Error', description: 'Failed to add treatment', variant: 'destructive' });
      throw error;
    }
  };

  const updateTreatment = async (id: string, updates: Partial<Treatment>): Promise<Treatment> => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      const treatmentRef = doc(db, 'organizations', currentOrganization.id, 'treatments', id);
      await updateDoc(treatmentRef, { ...updates, updated_at: serverTimestamp() });
      const updatedTreatment = { ...treatments.find(t => t.id === id)!, ...updates };
      setTreatments(prev => prev.map(t => (t.id === id ? updatedTreatment : t)));
      toast({ title: 'Success', description: 'Treatment updated successfully' });
      return updatedTreatment;
    } catch (error) {
      console.error('Error updating treatment:', error);
      toast({ title: 'Error', description: 'Failed to update treatment', variant: 'destructive' });
      throw error;
    }
  };

  return {
    treatments,
    loading,
    addTreatment,
    updateTreatment,
    refetch: fetchTreatments,
  };
};
