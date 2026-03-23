
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSupabaseSchedulingConfig, SchedulingConfig } from '@/hooks/useSupabaseSchedulingConfig';

interface SchedulingConfigContextType {
  schedulingConfigs: SchedulingConfig[];
  loading: boolean;
  addSchedulingConfig: (config: Omit<SchedulingConfig, 'id' | 'created_at' | 'updated_at'>) => Promise<SchedulingConfig>;
  updateSchedulingConfig: (id: string, updates: Partial<SchedulingConfig>) => Promise<SchedulingConfig>;
  deleteSchedulingConfig: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const SchedulingConfigContext = createContext<SchedulingConfigContextType | undefined>(undefined);

export const SchedulingConfigProvider = ({ children }: { children: ReactNode }) => {
  const schedulingConfigHook = useSupabaseSchedulingConfig();
  
  return (
    <SchedulingConfigContext.Provider value={schedulingConfigHook}>
      {children}
    </SchedulingConfigContext.Provider>
  );
};

export const useSchedulingConfig = () => {
  const context = useContext(SchedulingConfigContext);
  if (context === undefined) {
    throw new Error('useSchedulingConfig must be used within a SchedulingConfigProvider');
  }
  return context;
};
