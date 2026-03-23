
import React, { createContext, useContext } from 'react';
import { useSupabaseDropdownData } from '@/hooks/useSupabaseDropdownData';

interface DropdownDataContextType {
  dropdownData: {
    cities: string[];
    referralSources: string[];
  };
  loading: boolean;
  addCity: (city: string) => Promise<void>;
  removeCity: (city: string) => Promise<void>;
  addReferralSource: (source: string) => Promise<void>;
  removeReferralSource: (source: string) => Promise<void>;
}

const DropdownDataContext = createContext<DropdownDataContextType | undefined>(undefined);

export const DropdownDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    dropdownData,
    loading,
    addCity,
    removeCity,
    addReferralSource,
    removeReferralSource
  } = useSupabaseDropdownData();

  return (
    <DropdownDataContext.Provider value={{
      dropdownData,
      loading,
      addCity,
      removeCity,
      addReferralSource,
      removeReferralSource
    }}>
      {children}
    </DropdownDataContext.Provider>
  );
};

export const useDropdownData = () => {
  const context = useContext(DropdownDataContext);
  if (context === undefined) {
    throw new Error('useDropdownData must be used within a DropdownDataProvider');
  }
  return context;
};
