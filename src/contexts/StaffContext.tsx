import React, { createContext, useContext, useState, ReactNode } from 'react';
import { safeToLocaleDateString } from '@/lib/safeDateFormatter';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  specialties: string[];
  workingHours: {
    [key: string]: { enabled: boolean; start: string; end: string; };
  };
  isActive: boolean;
}

interface StaffContextType {
  staff: StaffMember[];
  updateStaff: (staff: StaffMember[]) => void;
  addStaff: (member: StaffMember) => void;
  updateStaffMember: (id: string, updates: Partial<StaffMember>) => void;
  getAvailableStaff: (date: string, time: string, treatmentType?: string) => StaffMember[];
  getStaffById: (id: string) => StaffMember | undefined;
}

const StaffContext = createContext<StaffContextType | undefined>(undefined);

export const StaffProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [staff, setStaff] = useState<StaffMember[]>([
    {
      id: '1',
      name: 'Emma Wilson',
      email: 'emma@clinic.com',
      role: 'Senior Aesthetician',
      specialties: ['Facial Treatment', 'Chemical Peels', 'Microdermabrasion'],
      workingHours: {
        Monday: { enabled: true, start: '09:00', end: '17:00' },
        Tuesday: { enabled: true, start: '09:00', end: '17:00' },
        Wednesday: { enabled: true, start: '09:00', end: '17:00' },
        Thursday: { enabled: true, start: '09:00', end: '17:00' },
        Friday: { enabled: true, start: '09:00', end: '15:00' },
        Saturday: { enabled: false, start: '10:00', end: '16:00' },
        Sunday: { enabled: false, start: '10:00', end: '16:00' },
      },
      isActive: true
    },
    {
      id: '2',
      name: 'Lisa Johnson',
      email: 'lisa@clinic.com',
      role: 'Laser Specialist',
      specialties: ['Laser Hair Removal', 'IPL', 'Skin Rejuvenation'],
      workingHours: {
        Monday: { enabled: true, start: '10:00', end: '18:00' },
        Tuesday: { enabled: true, start: '10:00', end: '18:00' },
        Wednesday: { enabled: true, start: '10:00', end: '18:00' },
        Thursday: { enabled: true, start: '10:00', end: '18:00' },
        Friday: { enabled: true, start: '10:00', end: '18:00' },
        Saturday: { enabled: true, start: '10:00', end: '16:00' },
        Sunday: { enabled: false, start: '10:00', end: '16:00' },
      },
      isActive: true
    }
  ]);

  const updateStaff = (newStaff: StaffMember[]) => {
    setStaff(newStaff);
  };

  const addStaff = (member: StaffMember) => {
    setStaff(prev => [...prev, member]);
  };

  const updateStaffMember = (id: string, updates: Partial<StaffMember>) => {
    setStaff(prev => prev.map(member => 
      member.id === id ? { ...member, ...updates } : member
    ));
  };

  const getStaffById = (id: string) => {
    return staff.find(member => member.id === id);
  };

  const getAvailableStaff = (date: string, time: string, treatmentType?: string) => {
    const dayOfWeek = safeToLocaleDateString(new Date(date), 'en-US', { weekday: 'long' });
    
    return staff.filter(member => {
      if (!member.isActive) return false;
      
      const workingHours = member.workingHours[dayOfWeek];
      if (!workingHours || !workingHours.enabled) return false;
      
      if (time < workingHours.start || time > workingHours.end) return false;
      
      if (treatmentType && !member.specialties.includes(treatmentType)) return false;
      
      return true;
    });
  };

  return (
    <StaffContext.Provider value={{
      staff,
      updateStaff,
      addStaff,
      updateStaffMember,
      getAvailableStaff,
      getStaffById
    }}>
      {children}
    </StaffContext.Provider>
  );
};

export const useStaff = () => {
  const context = useContext(StaffContext);
  if (!context) {
    throw new Error('useStaff must be used within a StaffProvider');
  }
  return context;
};
