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

export interface Addon {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes?: number | null;
  category?: string;
  color?: string;
  sort_order?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const docToAddon = (id: string, data: any): Addon => ({
  id,
  name: data.name || '',
  description: data.description ?? undefined,
  price: typeof data.price === 'number' ? data.price : Number(data.price ?? 0),
  duration_minutes:
    data.duration_minutes === null || data.duration_minutes === undefined
      ? null
      : Number(data.duration_minutes),
  category: data.category ?? undefined,
  color: typeof data.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : undefined,
  sort_order: typeof data.sort_order === 'number' ? data.sort_order : 0,
  is_active: data.is_active ?? data.isActive ?? true,
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
});

export const useSupabaseAddons = () => {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const fetchAddons = async () => {
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'addons'),
        where('is_active', '==', true),
        orderBy('sort_order'),
        orderBy('name')
      );
      const snapshot = await getDocs(q);
      setAddons(snapshot.docs.map(d => docToAddon(d.id, d.data())));
    } catch (error) {
      console.error('Error fetching addons:', error);
      toast({ title: 'Error', description: 'Failed to load add-ons', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddons();
  }, [currentOrganization?.id]);

  const stripUndefined = <T extends Record<string, any>>(obj: T): Partial<T> => {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) result[key] = value;
    }
    return result as Partial<T>;
  };

  const addAddon = async (
    addonData: Omit<Addon, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Addon> => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      const docRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'addons'),
        { ...stripUndefined(addonData), created_at: serverTimestamp(), updated_at: serverTimestamp() }
      );
      const newAddon = docToAddon(docRef.id, {
        ...addonData,
        created_at: { toDate: () => new Date() },
        updated_at: { toDate: () => new Date() },
      });
      setAddons(prev => [...prev, newAddon]);
      toast({ title: 'Success', description: 'Add-on added successfully' });
      return newAddon;
    } catch (error) {
      console.error('Error adding addon:', error);
      toast({ title: 'Error', description: 'Failed to add add-on', variant: 'destructive' });
      throw error;
    }
  };

  const updateAddon = async (id: string, updates: Partial<Addon>): Promise<Addon> => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      const addonRef = doc(db, 'organizations', currentOrganization.id, 'addons', id);
      await updateDoc(addonRef, { ...stripUndefined(updates), updated_at: serverTimestamp() });
      const updatedAddon = { ...addons.find(a => a.id === id)!, ...updates };
      setAddons(prev => prev.map(a => (a.id === id ? updatedAddon : a)));
      toast({ title: 'Success', description: 'Add-on updated successfully' });
      return updatedAddon;
    } catch (error) {
      console.error('Error updating addon:', error);
      toast({ title: 'Error', description: 'Failed to update add-on', variant: 'destructive' });
      throw error;
    }
  };

  return {
    addons,
    loading,
    addAddon,
    updateAddon,
    refetch: fetchAddons,
  };
};
