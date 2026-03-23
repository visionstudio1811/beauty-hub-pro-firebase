
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { safeToLocaleDateString } from '@/lib/safeDateFormatter';

export interface DayHours {
  day: string;
  enabled: boolean;
  openTime: string;
  closeTime: string;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  staffId?: string;
  appointmentId?: string;
}

interface BusinessHoursContextType {
  businessHours: DayHours[];
  updateBusinessHours: (hours: DayHours[]) => void;
  generateTimeSlots: (date: string, staffId?: string, treatmentDuration?: number) => TimeSlot[];
  isBusinessOpen: (date: string, time: string) => boolean;
}

const BusinessHoursContext = createContext<BusinessHoursContextType | undefined>(undefined);

export const BusinessHoursProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [businessHours, setBusinessHours] = useState<DayHours[]>([
    { day: 'Monday', enabled: true, openTime: '09:00', closeTime: '18:00' },
    { day: 'Tuesday', enabled: true, openTime: '09:00', closeTime: '18:00' },
    { day: 'Wednesday', enabled: true, openTime: '09:00', closeTime: '18:00' },
    { day: 'Thursday', enabled: true, openTime: '09:00', closeTime: '18:00' },
    { day: 'Friday', enabled: true, openTime: '09:00', closeTime: '18:00' },
    { day: 'Saturday', enabled: false, openTime: '10:00', closeTime: '16:00' },
    { day: 'Sunday', enabled: true, openTime: '10:00', closeTime: '16:00' },
  ]);

  const updateBusinessHours = (hours: DayHours[]) => {
    setBusinessHours(hours);
  };

  const isBusinessOpen = (date: string, time: string) => {
    const dayOfWeek = safeToLocaleDateString(new Date(date), 'en-US', { weekday: 'long' });
    const dayHours = businessHours.find(h => h.day === dayOfWeek);
    
    if (!dayHours || !dayHours.enabled) return false;
    
    return time >= dayHours.openTime && time <= dayHours.closeTime;
  };

  const generateTimeSlots = (date: string, staffId?: string, treatmentDuration: number = 30) => {
    const dayOfWeek = safeToLocaleDateString(new Date(date), 'en-US', { weekday: 'long' });
    const dayHours = businessHours.find(h => h.day === dayOfWeek);
    
    if (!dayHours || !dayHours.enabled) return [];

    const slots: TimeSlot[] = [];
    const startHour = parseInt(dayHours.openTime.split(':')[0]);
    const startMinute = parseInt(dayHours.openTime.split(':')[1]);
    const endHour = parseInt(dayHours.closeTime.split(':')[0]);
    const endMinute = parseInt(dayHours.closeTime.split(':')[1]);

    let currentHour = startHour;
    let currentMinute = startMinute;

    while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
      const timeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      
      slots.push({
        time: timeString,
        available: true, // Will be updated based on existing appointments
        staffId
      });

      currentMinute += treatmentDuration;
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60);
        currentMinute = currentMinute % 60;
      }
    }

    return slots;
  };

  return (
    <BusinessHoursContext.Provider value={{
      businessHours,
      updateBusinessHours,
      generateTimeSlots,
      isBusinessOpen
    }}>
      {children}
    </BusinessHoursContext.Provider>
  );
};

export const useBusinessHours = () => {
  const context = useContext(BusinessHoursContext);
  if (!context) {
    throw new Error('useBusinessHours must be used within a BusinessHoursProvider');
  }
  return context;
};
