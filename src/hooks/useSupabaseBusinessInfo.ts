import { useState, useEffect } from 'react';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface BusinessInfo {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  created_at: string;
  updated_at: string;
}

export const useSupabaseBusinessInfo = () => {
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const fetchBusinessInfo = async () => {
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const infoRef = doc(db, 'organizations', currentOrganization.id, 'config', 'businessInfo');
      const snap = await getDoc(infoRef);

      console.log('Fetched business info:', snap.data());

      if (snap.exists()) {
        const data = snap.data();
        setBusinessInfo({
          id: snap.id,
          name: data.name || '',
          address: data.address ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          website: data.website ?? null,
          created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          updated_at: data.updated_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        });
      } else {
        setBusinessInfo(null);
      }
    } catch (error) {
      console.error('Error fetching business info:', error);
      toast({ title: 'Error', description: 'Failed to load business information', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateBusinessInfo = async (info: Omit<BusinessInfo, 'id' | 'created_at' | 'updated_at'>) => {
    if (!currentOrganization?.id) return;
    try {
      console.log('Updating business info:', info);
      const infoRef = doc(db, 'organizations', currentOrganization.id, 'config', 'businessInfo');
      await setDoc(
        infoRef,
        { ...info, updated_at: serverTimestamp() },
        { merge: true }
      );

      const updatedInfo: BusinessInfo = {
        id: 'businessInfo',
        ...info,
        created_at: businessInfo?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setBusinessInfo(updatedInfo);

      toast({ title: 'Success', description: 'Business information updated successfully' });
    } catch (error) {
      console.error('Error updating business info:', error);
      toast({ title: 'Error', description: 'Failed to update business information', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchBusinessInfo();
  }, [currentOrganization?.id]);

  return {
    businessInfo,
    loading,
    updateBusinessInfo,
    refetch: fetchBusinessInfo,
  };
};
