import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useTranslation } from 'react-i18next';

interface DropdownData {
  cities: string[];
  referralSources: string[];
}

export const useSupabaseDropdownData = () => {
  const [dropdownData, setDropdownData] = useState<DropdownData>({
    cities: [],
    referralSources: [],
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation('hooks');
  const { currentOrganization } = useOrganization();

  const fetchDropdownData = async () => {
    if (!currentOrganization?.id) {
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'dropdownData'),
        where('is_active', '==', true),
        orderBy('sort_order')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

      const cities = data.filter(item => item.category === 'cities').map(item => item.value);
      const referralSources = data
        .filter(item => item.category === 'referral_sources')
        .map(item => item.value);

      setDropdownData({ cities, referralSources });
    } catch (error) {
      console.error('Error fetching dropdown data:', error);
      toast({ title: t('common:status.error'), description: t('dropdownData.loadFailed'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdownData();
  }, [currentOrganization?.id]);

  const addCity = async (city: string) => {
    if (!currentOrganization?.id) throw new Error(t('common.noOrganization'));
    await addDoc(collection(db, 'organizations', currentOrganization.id, 'dropdownData'), {
      category: 'cities',
      value: city,
      is_active: true,
      sort_order: 0,
      created_at: serverTimestamp(),
    });
    setDropdownData(prev => ({ ...prev, cities: [...prev.cities, city].sort() }));
  };

  const removeCity = async (city: string) => {
    if (!currentOrganization?.id) return;
    try {
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'dropdownData'),
        where('category', '==', 'cities'),
        where('value', '==', city)
      );
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'dropdownData', docSnap.id));
      }
      setDropdownData(prev => ({ ...prev, cities: prev.cities.filter(c => c !== city) }));
      toast({ title: t('common:status.success'), description: t('dropdownData.cityRemoved') });
    } catch (error) {
      console.error('Error removing city:', error);
      toast({ title: t('common:status.error'), description: t('dropdownData.cityRemoveFailed'), variant: 'destructive' });
    }
  };

  const addReferralSource = async (source: string) => {
    if (!currentOrganization?.id) throw new Error(t('common.noOrganization'));
    await addDoc(collection(db, 'organizations', currentOrganization.id, 'dropdownData'), {
      category: 'referral_sources',
      value: source,
      is_active: true,
      sort_order: 0,
      created_at: serverTimestamp(),
    });
    setDropdownData(prev => ({
      ...prev,
      referralSources: [...prev.referralSources, source].sort(),
    }));
  };

  const removeReferralSource = async (source: string) => {
    if (!currentOrganization?.id) return;
    try {
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'dropdownData'),
        where('category', '==', 'referral_sources'),
        where('value', '==', source)
      );
      const snapshot = await getDocs(q);
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'organizations', currentOrganization.id, 'dropdownData', docSnap.id));
      }
      setDropdownData(prev => ({
        ...prev,
        referralSources: prev.referralSources.filter(s => s !== source),
      }));
      toast({ title: t('common:status.success'), description: t('dropdownData.referralSourceRemoved') });
    } catch (error) {
      console.error('Error removing referral source:', error);
      toast({ title: t('common:status.error'), description: t('dropdownData.referralSourceRemoveFailed'), variant: 'destructive' });
    }
  };

  return {
    dropdownData,
    loading,
    addCity,
    removeCity,
    addReferralSource,
    removeReferralSource,
  };
};
