
import React, { createContext, useContext, useState, ReactNode } from 'react';
import i18n from '@/i18n';

export interface Treatment {
  id: string;
  name: string;
  price: number;
  duration: number;
  description: string;
  member_price?: number;
}

interface TreatmentContextType {
  treatments: Treatment[];
  addTreatment: (treatment: Treatment) => void;
  updateTreatment: (treatment: Treatment) => void;
  deleteTreatment: (id: string) => void;
}

const TreatmentContext = createContext<TreatmentContextType | undefined>(undefined);

export const useTreatments = () => {
  const context = useContext(TreatmentContext);
  if (!context) {
    throw new Error('useTreatments must be used within a TreatmentProvider');
  }
  return context;
};

interface TreatmentProviderProps {
  children: ReactNode;
}

export const TreatmentProvider: React.FC<TreatmentProviderProps> = ({ children }) => {
  const [treatments, setTreatments] = useState<Treatment[]>([
    { id: '1', name: i18n.t('contexts:seed.treatments.classicFacial.name'), price: 80, duration: 60, description: i18n.t('contexts:seed.treatments.classicFacial.description') },
    { id: '2', name: i18n.t('contexts:seed.treatments.glowDermaplaneFacial.name'), price: 120, duration: 75, description: i18n.t('contexts:seed.treatments.glowDermaplaneFacial.description') },
    { id: '3', name: i18n.t('contexts:seed.treatments.acneTreatmentFacial.name'), price: 100, duration: 90, description: i18n.t('contexts:seed.treatments.acneTreatmentFacial.description') },
    { id: '4', name: i18n.t('contexts:seed.treatments.mensFacial.name'), price: 90, duration: 60, description: i18n.t('contexts:seed.treatments.mensFacial.description') },
    { id: '5', name: i18n.t('contexts:seed.treatments.ledSkinTightening.name'), price: 150, duration: 45, description: i18n.t('contexts:seed.treatments.ledSkinTightening.description') },
    { id: '6', name: i18n.t('contexts:seed.treatments.nonSurgicalRfFacial.name'), price: 200, duration: 90, description: i18n.t('contexts:seed.treatments.nonSurgicalRfFacial.description') },
  ]);

  const addTreatment = (treatment: Treatment) => {
    setTreatments(prev => [...prev, treatment]);
  };

  const updateTreatment = (updatedTreatment: Treatment) => {
    setTreatments(prev => prev.map(t => t.id === updatedTreatment.id ? updatedTreatment : t));
  };

  const deleteTreatment = (id: string) => {
    setTreatments(prev => prev.filter(t => t.id !== id));
  };

  return (
    <TreatmentContext.Provider value={{ treatments, addTreatment, updateTreatment, deleteTreatment }}>
      {children}
    </TreatmentContext.Provider>
  );
};
