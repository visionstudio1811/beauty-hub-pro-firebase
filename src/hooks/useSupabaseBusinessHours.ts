import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface BusinessHour {
  id: string;
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
  break_start: string | null;
  break_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface DayHours {
  day: string;
  enabled: boolean;
  openTime: string;
  closeTime: string;
}

const formatTime = (timeStr: string | null): string => {
  if (!timeStr) return '09:00';
  if (timeStr.length === 5 && timeStr.includes(':')) return timeStr;
  if (timeStr.length === 8 && timeStr.includes(':')) return timeStr.substring(0, 5);
  return timeStr;
};

export const useSupabaseBusinessHours = () => {
  const [businessHours, setBusinessHours] = useState<DayHours[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const fetchBusinessHours = async () => {
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'businessHours'),
        orderBy('day_of_week', 'asc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      console.log('Fetched business hours:', data);

      const formattedHours = dayNames.map((dayName, index) => {
        const dbHour = data.find(h => h.day_of_week === index);
        const dayHour = {
          day: dayName,
          enabled: dbHour?.is_open || false,
          openTime: formatTime(dbHour?.open_time) || '09:00',
          closeTime: formatTime(dbHour?.close_time) || '18:00',
        };
        console.log(`Day ${index} (${dayName}):`, { dbHour, formatted: dayHour });
        return dayHour;
      });

      setBusinessHours(formattedHours);
    } catch (error) {
      console.error('Error fetching business hours:', error);
      toast({ title: 'Error', description: 'Failed to load business hours', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateBusinessHours = async (hours: DayHours[]) => {
    if (!currentOrganization?.id) return;
    try {
      console.log('Updating business hours:', hours);

      // Delete existing documents
      const existingSnapshot = await getDocs(
        collection(db, 'organizations', currentOrganization.id, 'businessHours')
      );

      const batch = writeBatch(db);
      existingSnapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      // Insert new documents
      const insertBatch = writeBatch(db);
      hours.forEach((hour, index) => {
        const newRef = doc(collection(db, 'organizations', currentOrganization.id, 'businessHours'));
        insertBatch.set(newRef, {
          day_of_week: index,
          is_open: hour.enabled,
          open_time: hour.enabled ? hour.openTime : null,
          close_time: hour.enabled ? hour.closeTime : null,
          break_start: null,
          break_end: null,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      });
      await insertBatch.commit();

      setBusinessHours(hours);
      toast({ title: 'Success', description: 'Business hours updated successfully' });
    } catch (error) {
      console.error('Error updating business hours:', error);
      toast({ title: 'Error', description: 'Failed to update business hours', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchBusinessHours();
  }, [currentOrganization?.id]);

  return {
    businessHours,
    loading,
    updateBusinessHours,
    refetch: fetchBusinessHours,
  };
};
