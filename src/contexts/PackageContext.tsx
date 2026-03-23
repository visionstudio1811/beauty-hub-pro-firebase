import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface Package {
  id: string;
  name: string;
  description: string;
  treatments: string[];
  price: number;
  total_sessions: number;
  validity_months: number;
  is_active: boolean;
  created_at: string;
}

interface PackageContextType {
  packages: Package[];
  loading: boolean;
  error: string | null;
  addPackage: (packageData: Omit<Package, 'id' | 'created_at'>) => Promise<void>;
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
  price: data.price ?? 0,
  total_sessions: data.total_sessions ?? 0,
  validity_months: data.validity_months ?? 0,
  is_active: data.is_active ?? true,
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
      setPackages(snapshot.docs.map(d => docToPackage(d.id, d.data())));
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

  const addPackage = async (packageData: Omit<Package, 'id' | 'created_at'>) => {
    if (!currentOrganization?.id) {
      toast({ title: 'Error', description: 'No organization selected.', variant: 'destructive' });
      throw new Error('No organization selected');
    }
    try {
      const docRef = await addDoc(
        collection(db, 'organizations', currentOrganization.id, 'packages'),
        {
          name: packageData.name,
          description: packageData.description,
          treatments: packageData.treatments,
          price: packageData.price,
          total_sessions: packageData.total_sessions,
          validity_months: packageData.validity_months,
          is_active: packageData.is_active,
          organization_id: currentOrganization.id,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }
      );
      const newPkg = docToPackage(docRef.id, {
        ...packageData,
        created_at: { toDate: () => new Date() },
      });
      setPackages(prev => [newPkg, ...prev]);
      toast({ title: 'Package Created', description: `${packageData.name} has been created successfully.` });
    } catch (err) {
      console.error('Error adding package:', err);
      toast({ title: 'Error', description: 'Failed to create package. Please try again.', variant: 'destructive' });
      throw err;
    }
  };

  const updatePackage = async (id: string, packageData: Partial<Package>) => {
    if (!currentOrganization?.id) throw new Error('No organization selected');
    try {
      const pkgRef = doc(db, 'organizations', currentOrganization.id, 'packages', id);
      await updateDoc(pkgRef, { ...packageData, updated_at: serverTimestamp() });
      setPackages(prev => prev.map(pkg => (pkg.id === id ? { ...pkg, ...packageData } : pkg)));
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
      const pkgRef = doc(db, 'organizations', currentOrganization.id, 'packages', id);
      await deleteDoc(pkgRef);
      setPackages(prev => prev.filter(pkg => pkg.id !== id));
      toast({ title: 'Package Deleted', description: 'Package has been deleted successfully.' });
    } catch (err) {
      console.error('Error deleting package:', err);
      toast({ title: 'Error', description: 'Failed to delete package. Please try again.', variant: 'destructive' });
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
