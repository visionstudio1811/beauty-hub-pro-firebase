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
import { useTranslation } from 'react-i18next';

export interface TreatmentAvailabilityWindow {
  day_of_week: number; // 0=Sun..6=Sat (matches BusinessHours convention)
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  is_active: boolean;
}

export interface Treatment {
  id: string;
  name: string;
  description?: string;
  duration: number;
  price?: number;
  category?: string;
  color?: string;
  is_active: boolean;
  // Scheduling fields (all optional; defaults preserve current behavior)
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  advance_min_hours?: number;
  advance_max_days?: number;
  staff_ids?: string[]; // Empty/missing = any active staff can perform
  availability?: TreatmentAvailabilityWindow[]; // Per-day windows; missing = inherit business hours
  created_at: string;
  updated_at: string;
}

const sanitizeAvailability = (raw: any): TreatmentAvailabilityWindow[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const windows: TreatmentAvailabilityWindow[] = [];
  for (const w of raw) {
    const dow = Number(w?.day_of_week);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    const start = typeof w?.start_time === 'string' ? w.start_time : '';
    const end = typeof w?.end_time === 'string' ? w.end_time : '';
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) continue;
    windows.push({
      day_of_week: dow,
      start_time: start,
      end_time: end,
      is_active: w?.is_active !== false,
    });
  }
  return windows.length ? windows : undefined;
};

const docToTreatment = (id: string, data: any): Treatment => ({
  id,
  name: data.name || '',
  description: data.description ?? undefined,
  duration: data.duration ?? 60,
  price: data.price ?? undefined,
  category: data.category ?? undefined,
  color: typeof data.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : undefined,
  is_active: data.is_active ?? data.isActive ?? true,
  buffer_before_minutes: typeof data.buffer_before_minutes === 'number' ? data.buffer_before_minutes : undefined,
  buffer_after_minutes: typeof data.buffer_after_minutes === 'number' ? data.buffer_after_minutes : undefined,
  advance_min_hours: typeof data.advance_min_hours === 'number' ? data.advance_min_hours : undefined,
  advance_max_days: typeof data.advance_max_days === 'number' ? data.advance_max_days : undefined,
  staff_ids: Array.isArray(data.staff_ids) ? data.staff_ids.filter((s: any) => typeof s === 'string') : undefined,
  availability: sanitizeAvailability(data.availability),
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
  updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
});

export const useSupabaseTreatments = () => {
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation('hooks');
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
      toast({ title: t('common:status.error'), description: t('treatments.loadFailed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTreatments();
  }, [currentOrganization?.id]);

  const stripUndefined = <T extends Record<string, any>>(obj: T): Partial<T> => {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) result[key] = value;
    }
    return result as Partial<T>;
  };

  const addTreatment = async (
    treatmentData: Omit<Treatment, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Treatment> => {
    if (!currentOrganization?.id) throw new Error(t('common.noOrganization'));
    try {
      const docRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'treatments'),
        { ...stripUndefined(treatmentData), created_at: serverTimestamp(), updated_at: serverTimestamp() }
      );
      const newTreatment = docToTreatment(docRef.id, {
        ...treatmentData,
        created_at: { toDate: () => new Date() },
        updated_at: { toDate: () => new Date() },
      });
      setTreatments(prev => [...prev, newTreatment]);
      toast({ title: t('common:status.success'), description: t('treatments.added') });
      return newTreatment;
    } catch (error) {
      console.error('Error adding treatment:', error);
      toast({ title: t('common:status.error'), description: t('treatments.addFailed'), variant: 'destructive' });
      throw error;
    }
  };

  const updateTreatment = async (id: string, updates: Partial<Treatment>): Promise<Treatment> => {
    if (!currentOrganization?.id) throw new Error(t('common.noOrganization'));
    try {
      const treatmentRef = doc(db, 'organizations', currentOrganization.id, 'treatments', id);
      await updateDoc(treatmentRef, { ...stripUndefined(updates), updated_at: serverTimestamp() });
      const updatedTreatment = { ...treatments.find(item => item.id === id)!, ...updates };
      setTreatments(prev => prev.map(item => (item.id === id ? updatedTreatment : item)));
      toast({ title: t('common:status.success'), description: t('treatments.updated') });
      return updatedTreatment;
    } catch (error) {
      console.error('Error updating treatment:', error);
      toast({ title: t('common:status.error'), description: t('treatments.updateFailed'), variant: 'destructive' });
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
