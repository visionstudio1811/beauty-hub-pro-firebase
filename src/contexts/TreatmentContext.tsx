
import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface Treatment {
  id: string;
  name: string;
  price: number;
  duration: number;
  description: string;
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
    { id: '1', name: 'Classic Facial', price: 80, duration: 60, description: 'Traditional facial treatment for all skin types' },
    { id: '2', name: 'Glow Dermaplane Facial', price: 120, duration: 75, description: 'Dermaplaning with hydrating facial for radiant skin' },
    { id: '3', name: 'Acne Treatment Facial', price: 100, duration: 90, description: 'Specialized treatment for acne-prone skin' },
    { id: '4', name: "Men's Facial", price: 90, duration: 60, description: 'Customized facial treatment designed for men' },
    { id: '5', name: 'LED Skin Tightening', price: 150, duration: 45, description: 'LED light therapy for skin tightening and rejuvenation' },
    { id: '6', name: 'Non-Surgical RF Facial', price: 200, duration: 90, description: 'Radio frequency treatment for skin lifting and tightening' },
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
