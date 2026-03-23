
import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  date: string;
  time: string;
  treatmentId: string;
  treatmentName: string;
  staffId: string;
  staffName: string;
  duration: number;
  status: 'scheduled' | 'confirmed' | 'arrived' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
  packageId?: string;
  createdAt: string;
  updatedAt: string;
}

interface AppointmentContextType {
  appointments: Appointment[];
  addAppointment: (appointment: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateAppointment: (id: string, updates: Partial<Appointment>) => void;
  deleteAppointment: (id: string) => void;
  getAppointmentsByDate: (date: string) => Appointment[];
  getAppointmentsByStaff: (staffId: string, date?: string) => Appointment[];
  isTimeSlotAvailable: (date: string, time: string, staffId: string, duration: number) => boolean;
  getConflictingAppointments: (date: string, time: string, staffId: string, duration: number) => Appointment[];
}

const AppointmentContext = createContext<AppointmentContextType | undefined>(undefined);

export const AppointmentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: '1',
      clientId: 'c1',
      clientName: 'Sarah Johnson',
      clientPhone: '(555) 123-4567',
      clientEmail: 'sarah.johnson@email.com',
      date: new Date().toISOString().split('T')[0],
      time: '09:00',
      treatmentId: 't1',
      treatmentName: 'Facial Treatment',
      staffId: '1',
      staffName: 'Emma Wilson',
      duration: 60,
      status: 'scheduled',
      notes: 'Regular client, prefers gentle products',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);

  const addAppointment = (appointmentData: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newAppointment: Appointment = {
      ...appointmentData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setAppointments(prev => [...prev, newAppointment]);
  };

  const updateAppointment = (id: string, updates: Partial<Appointment>) => {
    setAppointments(prev => prev.map(apt => 
      apt.id === id 
        ? { ...apt, ...updates, updatedAt: new Date().toISOString() }
        : apt
    ));
  };

  const deleteAppointment = (id: string) => {
    setAppointments(prev => prev.filter(apt => apt.id !== id));
  };

  const getAppointmentsByDate = (date: string) => {
    return appointments.filter(apt => apt.date === date);
  };

  const getAppointmentsByStaff = (staffId: string, date?: string) => {
    return appointments.filter(apt => 
      apt.staffId === staffId && (date ? apt.date === date : true)
    );
  };

  const isTimeSlotAvailable = (date: string, time: string, staffId: string, duration: number) => {
    const conflicting = getConflictingAppointments(date, time, staffId, duration);
    return conflicting.length === 0;
  };

  const getConflictingAppointments = (date: string, time: string, staffId: string, duration: number) => {
    const appointmentStart = new Date(`${date}T${time}`);
    const appointmentEnd = new Date(appointmentStart.getTime() + duration * 60000);

    return appointments.filter(apt => {
      if (apt.date !== date || apt.staffId !== staffId || apt.status === 'cancelled') {
        return false;
      }

      const existingStart = new Date(`${apt.date}T${apt.time}`);
      const existingEnd = new Date(existingStart.getTime() + apt.duration * 60000);

      // Check for overlap
      return appointmentStart < existingEnd && appointmentEnd > existingStart;
    });
  };

  return (
    <AppointmentContext.Provider value={{
      appointments,
      addAppointment,
      updateAppointment,
      deleteAppointment,
      getAppointmentsByDate,
      getAppointmentsByStaff,
      isTimeSlotAvailable,
      getConflictingAppointments
    }}>
      {children}
    </AppointmentContext.Provider>
  );
};

export const useAppointments = () => {
  const context = useContext(AppointmentContext);
  if (!context) {
    throw new Error('useAppointments must be used within an AppointmentProvider');
  }
  return context;
};
