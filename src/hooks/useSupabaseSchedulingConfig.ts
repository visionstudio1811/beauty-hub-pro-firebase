import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
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

export interface SchedulingConfig {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  max_concurrent_appointments: number;
  time_interval_minutes: number;
  staff_ids?: string[];
  treatment_categories?: string[];
  is_active: boolean;
  organization_id?: string;
  created_at: string;
  updated_at: string;
}

const docToConfig = (id: string, data: any): SchedulingConfig => ({
  id,
  day_of_week: data.day_of_week ?? 0,
  start_time: data.start_time || '09:00',
  end_time: data.end_time || '18:00',
  max_concurrent_appointments: data.max_concurrent_appointments ?? 1,
  time_interval_minutes: data.time_interval_minutes ?? 30,
  staff_ids: data.staff_ids ?? undefined,
  treatment_categories: data.treatment_categories ?? undefined,
  is_active: data.is_active ?? true,
  organization_id: data.organization_id ?? undefined,
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
});

export const useSupabaseSchedulingConfig = () => {
  const [schedulingConfigs, setSchedulingConfigs] = useState<SchedulingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const fetchSchedulingConfigs = async () => {
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'schedulingConfig'),
        where('is_active', '==', true),
        orderBy('day_of_week'),
        orderBy('start_time')
      );
      const snapshot = await getDocs(q);
      setSchedulingConfigs(snapshot.docs.map(d => docToConfig(d.id, d.data())));
    } catch (error) {
      console.error('Error fetching scheduling configs:', error);
      toast({ title: 'Error', description: 'Failed to load scheduling configurations', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const addSchedulingConfig = async (
    config: Omit<SchedulingConfig, 'id' | 'created_at' | 'updated_at' | 'organization_id'>
  ): Promise<SchedulingConfig | undefined> => {
    if (!currentOrganization?.id) return;
    try {
      const docRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'schedulingConfig'),
        { ...config, organization_id: currentOrganization.id, created_at: serverTimestamp(), updated_at: serverTimestamp() }
      );
      const newConfig = docToConfig(docRef.id, {
        ...config,
        organization_id: currentOrganization.id,
        created_at: { toDate: () => new Date() },
        updated_at: { toDate: () => new Date() },
      });
      setSchedulingConfigs(prev => [...prev, newConfig]);
      toast({ title: 'Success', description: 'Scheduling configuration added successfully' });
      return newConfig;
    } catch (error) {
      console.error('Error adding scheduling config:', error);
      toast({ title: 'Error', description: 'Failed to add scheduling configuration', variant: 'destructive' });
      throw error;
    }
  };

  const updateSchedulingConfig = async (
    id: string,
    updates: Partial<SchedulingConfig>
  ): Promise<SchedulingConfig> => {
    if (!currentOrganization?.id) throw new Error('No organization');
    try {
      const configRef = doc(db, 'organizations', currentOrganization.id, 'schedulingConfig', id);
      await updateDoc(configRef, { ...updates, updated_at: serverTimestamp() });
      const updatedConfig = { ...schedulingConfigs.find(c => c.id === id)!, ...updates };
      setSchedulingConfigs(prev => prev.map(config => (config.id === id ? updatedConfig : config)));
      toast({ title: 'Success', description: 'Scheduling configuration updated successfully' });
      return updatedConfig;
    } catch (error) {
      console.error('Error updating scheduling config:', error);
      toast({ title: 'Error', description: 'Failed to update scheduling configuration', variant: 'destructive' });
      throw error;
    }
  };

  const deleteSchedulingConfig = async (id: string) => {
    if (!currentOrganization?.id) throw new Error('No organization');
    try {
      const configRef = doc(db, 'organizations', currentOrganization.id, 'schedulingConfig', id);
      await deleteDoc(configRef);
      setSchedulingConfigs(prev => prev.filter(config => config.id !== id));
      toast({ title: 'Success', description: 'Scheduling configuration deleted successfully' });
    } catch (error) {
      console.error('Error deleting scheduling config:', error);
      toast({ title: 'Error', description: 'Failed to delete scheduling configuration', variant: 'destructive' });
      throw error;
    }
  };

  useEffect(() => {
    fetchSchedulingConfigs();
  }, [currentOrganization?.id]);

  return {
    schedulingConfigs,
    loading,
    addSchedulingConfig,
    updateSchedulingConfig,
    deleteSchedulingConfig,
    refetch: fetchSchedulingConfigs,
  };
};
