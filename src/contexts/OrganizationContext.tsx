import React, { createContext, useContext, ReactNode } from 'react';
import { useFirebaseOrganizations, Organization } from '@/hooks/useSupabaseOrganizations';

interface OrganizationContextType {
  organizations: Organization[];
  currentOrganization: Organization | null;
  loading: boolean;
  createOrganization: (orgData: Omit<Organization, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<Organization>;
  updateOrganization: (id: string, updates: Partial<Organization>) => Promise<Organization>;
  switchOrganization: (organizationId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

interface OrganizationProviderProps {
  children: ReactNode;
}

export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({ children }) => {
  const organizationData = useFirebaseOrganizations();

  return (
    <OrganizationContext.Provider value={organizationData}>
      {children}
    </OrganizationContext.Provider>
  );
};
