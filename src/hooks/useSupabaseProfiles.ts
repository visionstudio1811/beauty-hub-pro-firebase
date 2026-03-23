import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  role: string | null;
  is_active: boolean;
}

export const useSupabaseProfiles = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfiles = async () => {
    try {
      const q = query(
        collection(db, 'users'),
        where('isActive', '==', true),
        orderBy('fullName')
      );
      const snapshot = await getDocs(q);
      const data: Profile[] = snapshot.docs.map(d => {
        const docData = d.data();
        return {
          id: d.id,
          full_name: docData.fullName ?? null,
          email: docData.email ?? '',
          phone: docData.phone ?? null,
          role: docData.role ?? null,
          is_active: docData.isActive ?? true,
        };
      });
      console.log('Fetched profiles:', data);
      setProfiles(data);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast({
        title: 'Error',
        description: 'Failed to load staff profiles',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const getStaffProfiles = () => {
    const staffProfiles = profiles.filter(
      profile => profile.role === 'staff' || profile.role === 'admin'
    );
    console.log('Staff profiles available:', staffProfiles);
    return staffProfiles;
  };

  const getBeauticianProfiles = () => {
    const beauticianProfiles = profiles.filter(profile => profile.role === 'beautician');
    console.log('Beautician profiles available:', beauticianProfiles);
    return beauticianProfiles;
  };

  return {
    profiles,
    loading,
    refetch: fetchProfiles,
    getStaffProfiles,
    getBeauticianProfiles,
  };
};
