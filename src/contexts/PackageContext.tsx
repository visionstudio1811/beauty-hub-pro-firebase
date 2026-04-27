import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';
import { TreatmentItem } from '@/types/package';

export interface Package {
  id: string;
  name: string;
  description: string;
  treatments: string[];
  treatment_items?: TreatmentItem[];
  price: number;
  total_sessions: number;
  validity_months: number;
  is_active: boolean;
  is_custom?: boolean;
  client_id?: string | null;
  created_at: string;
}

interface PackageContextType {
  packages: Package[];
  loading: boolean;
  error: string | null;
  addPackage: (packageData: Omit<Package, 'id' | 'created_at'>) => Promise<Package>;
  updatePackage: (id: string, packageData: Partial<Package>) => Promise<void>;
  deletePackage: (id: string) => Promise<void>;
  togglePackageStatus: (id: string) => Promise<void>;
  refetchPackages: () => Promise<void>;
  getTreatmentNamesByIds: (treatmentIds: string[]) => Promise<string[]>;
}

const PackageContext = createContext<PackageContextType | undefined>(undefined);

export const usePackages = () => {
  const context = useContext(PackageContext);
  if (!context) {
    throw new Error('usePackages must be used within a PackageProvider');
  }
  return context;
};

const docToPackage = (id: string, data: any): Package => ({
  id,
  name: data.name || '',
  description: data.description || '',
  treatments: data.treatments ?? [],
  treatment_items: Array.isArray(data.treatment_items) ? data.treatment_items : undefined,
  price: data.price ?? 0,
  total_sessions: data.total_sessions ?? 0,
  validity_months: data.validity_months ?? 0,
  is_active: data.is_active ?? true,
  is_custom: data.is_custom ?? false,
  client_id: data.client_id ?? null,
  created_at: data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString(),
});

export const PackageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();

  const fetchPackages = useCallback(async () => {
    if (!currentOrganization?.id) {
      setPackages([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const q = query(
        collection(db, 'organizations', currentOrganization.id, 'packages'),
        orderBy('created_at', 'desc')
      );
      const snapshot = await getDocs(q);
      // Custom packages (is_custom: true) belong to a single client and must
      // never show up in the Settings catalog list.
      setPackages(
        snapshot.docs
          .map(d => docToPackage(d.id, d.data()))
          .filter(p => !p.is_custom)
      );
    } catch (err) {
      console.error('Error fetching packages:', err);
      setError('Failed to fetch packages');
    } finally {
      setLoading(false);
    }
  }, [currentOrganization?.id]);

  const getTreatmentNamesByIds = async (treatmentIds: string[]): Promise<string[]> => {
    if (!currentOrganization?.id || treatmentIds.length === 0) return [];
    try {
      const names: string[] = [];
      for (const id of treatmentIds) {
        const treatmentRef = doc(db, 'organizations', currentOrganization.id, 'treatments', id);
        const snap = await getDoc(treatmentRef);
        if (snap.exists()) {
          names.push(snap.data().name || '');
        }
      }
      return names;
    } catch (err) {
      console.error('Error fetching treatment names:', err);
      return [];
    }
  };

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // When treatment_items is the canonical source, keep treatments[] and total_sessions
  // populated as derived copies so existing readers (expiry notifications, client package
  // views, legacy decrement path) keep working without branching.
  const deriveLegacyFields = (items?: TreatmentItem[]) => {
    if (!items || items.length === 0) return {};
    return {
      treatments: items.map(i => i.treatment_id),
      total_sessions: items.reduce((sum, i) => sum + (i.quantity || 0), 0),
    };
  };

  const addPackage = async (packageData: Omit<Package, 'id' | 'created_at'>) => {
    if (!currentOrganization?.id) {
      toast({ title: 'Error', description: 'No organization selected.', variant: 'destructive' });
      throw new Error('No organization selected');
    }
    try {
      const derived = deriveLegacyFields(packageData.treatment_items);
      const payload: Record<string, unknown> = {
        name: packageData.name,
        description: packageData.description,
        treatments: derived.treatments ?? packageData.treatments,
        price: packageData.price,
        total_sessions: derived.total_sessions ?? packageData.total_sessions,
        validity_months: packageData.validity_months,
        is_active: packageData.is_active,
        organization_id: currentOrganization.id,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };
      if (packageData.treatment_items) payload.treatment_items = packageData.treatment_items;
      if (packageData.is_custom) payload.is_custom = true;
      if (packageData.client_id) payload.client_id = packageData.client_id;

      const docRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'packages'),
        payload
      );
      const newPkg = docToPackage(docRef.id, {
        ...packageData,
        ...derived,
        created_at: { toDate: () => new Date() },
      });
      // Don't add custom packages to the catalog list — they belong to one client.
      if (!newPkg.is_custom) {
        setPackages(prev => [newPkg, ...prev]);
      }
      toast({ title: 'Package Created', description: `${packageData.name} has been created successfully.` });
      return newPkg;
    } catch (err) {
      console.error('Error adding package:', err);
      toast({ title: 'Error', description: 'Failed to create package. Please try again.', variant: 'destructive' });
      throw err;
    }
  };

  const updatePackage = async (id: string, packageData: Partial<Package>) => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      const derived = deriveLegacyFields(packageData.treatment_items);
      const pkgRef = doc(db, 'organizations', currentOrganization.id, 'packages', id);
      await updateDoc(pkgRef, {
        ...packageData,
        ...derived,
        updated_at: serverTimestamp(),
      });
      setPackages(prev => prev.map(pkg => (pkg.id === id ? { ...pkg, ...packageData, ...derived } : pkg)));
      toast({ title: 'Package Updated', description: 'Package has been updated successfully.' });
    } catch (err) {
      console.error('Error updating package:', err);
      toast({ title: 'Error', description: 'Failed to update package. Please try again.', variant: 'destructive' });
      throw err;
    }
  };

  const deletePackage = async (id: string) => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      // Soft-delete: deactivate rather than hard-delete so existing client purchases
      // that reference this package keep their data intact.
      const pkgRef = doc(db, 'organizations', currentOrganization.id, 'packages', id);
      await updateDoc(pkgRef, { is_active: false, updated_at: serverTimestamp() });
      setPackages(prev => prev.map(pkg => (pkg.id === id ? { ...pkg, is_active: false } : pkg)));
      toast({ title: 'Package Deactivated', description: 'Package has been deactivated successfully.' });
    } catch (err) {
      console.error('Error deactivating package:', err);
      toast({ title: 'Error', description: 'Failed to deactivate package. Please try again.', variant: 'destructive' });
      throw err;
    }
  };

  const togglePackageStatus = async (id: string) => {
    try {
      const packageToUpdate = packages.find(pkg => pkg.id === id);
      if (!packageToUpdate) return;
      await updatePackage(id, { is_active: !packageToUpdate.is_active });
    } catch (err) {
      console.error('Error toggling package status:', err);
    }
  };

  const refetchPackages = async () => {
    await fetchPackages();
  };

  return (
    <PackageContext.Provider
      value={{
        packages,
        loading,
        error,
        addPackage,
        updatePackage,
        deletePackage,
        togglePackageStatus,
        refetchPackages,
        getTreatmentNamesByIds,
      }}
    >
      {children}
    </PackageContext.Provider>
  );
};
