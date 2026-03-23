import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useSecurityValidation } from '@/hooks/useSecurityValidation';
import { useAuth } from '@/contexts/AuthContext';
import { sanitizeString, sanitizeDateString } from '@/lib/dataSanitization';

export interface SupabaseAppointment {
  id: string;
  client_id?: string;
  client_name: string;
  client_phone: string;
  client_email: string;
  treatment_id?: string;
  treatment_name: string;
  staff_id?: string;
  staff_name: string;
  appointment_date: string;
  appointment_time: string;
  duration: number;
  status: 'scheduled' | 'confirmed' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  notes?: string;
  created_at: string;
  updated_at: string;
  room_id?: string;
  package_id?: string;
  purchase_id?: string;
  session_used?: boolean;
  organization_id?: string;
}

const sanitizeAppointmentData = (id: string, data: any): SupabaseAppointment => {
  console.log('Sanitizing appointment data:', id);
  return {
    id,
    client_id: data.client_id,
    client_name: sanitizeString(data.client_name, 'Unknown Client'),
    client_phone: sanitizeString(data.client_phone, 'No Phone'),
    client_email: sanitizeString(data.client_email, 'No Email'),
    treatment_id: data.treatment_id,
    treatment_name: sanitizeString(data.treatment_name, 'Unknown Treatment'),
    staff_id: data.staff_id,
    staff_name: sanitizeString(data.staff_name, 'Unknown Staff'),
    appointment_date: sanitizeDateString(data.appointment_date),
    appointment_time: sanitizeString(data.appointment_time, '09:00'),
    duration: typeof data.duration === 'number' ? data.duration : 60,
    status: (data.status as SupabaseAppointment['status']) || 'scheduled',
    notes: data.notes ? sanitizeString(data.notes, '') : undefined,
    created_at: data.created_at?.toDate?.()?.toISOString() ?? sanitizeDateString(data.created_at),
    updated_at: data.updated_at?.toDate?.()?.toISOString() ?? sanitizeDateString(data.updated_at),
    room_id: data.room_id ? sanitizeString(data.room_id) : undefined,
    package_id: data.package_id,
    purchase_id: data.purchase_id ?? undefined,
    session_used: Boolean(data.session_used),
    organization_id: data.organization_id,
  };
};

export const useSupabaseAppointments = () => {
  const [appointments, setAppointments] = useState<SupabaseAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { logSecurityEvent } = useSecurityValidation();
  const { user, profile } = useAuth();

  const fetchAppointments = async () => {
    if (!profile?.organizationId) {
      setAppointments([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const q = query(
        collection(db, 'organizations', profile.organizationId, 'appointments'),
        orderBy('appointment_date', 'asc'),
        orderBy('appointment_time', 'asc')
      );
      const snapshot = await getDocs(q);
      const sanitized = snapshot.docs.map(d => sanitizeAppointmentData(d.id, d.data()));
      console.log('Fetched and sanitized appointments:', sanitized.length);
      setAppointments(sanitized);
      await logSecurityEvent('APPOINTMENTS_FETCHED', { count: sanitized.length });
    } catch (error) {
      console.error('Error fetching appointments:', error);
      await logSecurityEvent('APPOINTMENTS_FETCH_ERROR', {
        error: error instanceof Error ? error.message : String(error),
      });
      toast({
        title: 'Error',
        description: 'Failed to load appointments. Please try refreshing the page.',
        variant: 'destructive',
      });
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [profile?.organizationId]);

  const addAppointment = async (
    appointmentData: Omit<SupabaseAppointment, 'id' | 'created_at' | 'updated_at'>
  ): Promise<SupabaseAppointment> => {
    if (!user) throw new Error('You must be logged in to create appointments');
    if (!profile?.organizationId) throw new Error('User profile must be associated with an organization');

    try {
      console.log('Adding appointment to database...', { appointmentData });

      const sanitizedData = {
        ...appointmentData,
        organization_id: profile.organizationId,
        client_name: sanitizeString(appointmentData.client_name, 'Unknown Client'),
        treatment_name: sanitizeString(appointmentData.treatment_name, 'Unknown Treatment'),
        staff_name: sanitizeString(appointmentData.staff_name, 'Unknown Staff'),
        appointment_date: sanitizeDateString(appointmentData.appointment_date),
        appointment_time: sanitizeString(appointmentData.appointment_time, '09:00'),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      const docRef = await addDoc(
        collection(db, 'organizations', profile.organizationId, 'appointments'),
        sanitizedData
      );

      const newAppointment = sanitizeAppointmentData(docRef.id, {
        ...sanitizedData,
        created_at: { toDate: () => new Date() },
        updated_at: { toDate: () => new Date() },
      });

      setAppointments(prev =>
        [...prev, newAppointment].sort((a, b) => {
          const dateCompare = a.appointment_date.localeCompare(b.appointment_date);
          if (dateCompare !== 0) return dateCompare;
          return a.appointment_time.localeCompare(b.appointment_time);
        })
      );

      await logSecurityEvent('APPOINTMENT_CREATED', { appointmentId: newAppointment.id });
      toast({ title: 'Success', description: 'Appointment created successfully' });
      return newAppointment;
    } catch (error) {
      console.error('Error adding appointment:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create appointment';
      await logSecurityEvent('APPOINTMENT_CREATE_FAILED', { error: errorMessage });
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      throw error;
    }
  };

  const updateAppointment = async (
    id: string,
    updates: Partial<SupabaseAppointment>
  ): Promise<SupabaseAppointment> => {
    if (!profile?.organizationId) throw new Error('No organization');
    try {
      console.log('Updating appointment in database...');
      const sanitizedUpdates = { ...updates };
      if (updates.client_name) sanitizedUpdates.client_name = sanitizeString(updates.client_name, 'Unknown Client');
      if (updates.treatment_name) sanitizedUpdates.treatment_name = sanitizeString(updates.treatment_name, 'Unknown Treatment');
      if (updates.staff_name) sanitizedUpdates.staff_name = sanitizeString(updates.staff_name, 'Unknown Staff');
      if (updates.appointment_date) sanitizedUpdates.appointment_date = sanitizeDateString(updates.appointment_date);
      if (updates.appointment_time) sanitizedUpdates.appointment_time = sanitizeString(updates.appointment_time, '09:00');

      const appointmentRef = doc(db, 'organizations', profile.organizationId, 'appointments', id);
      await updateDoc(appointmentRef, { ...sanitizedUpdates, updated_at: serverTimestamp() });

      const existing = appointments.find(a => a.id === id);
      const updatedAppointment = sanitizeAppointmentData(id, { ...existing, ...sanitizedUpdates });

      setAppointments(prev => prev.map(apt => (apt.id === id ? updatedAppointment : apt)));
      await logSecurityEvent('APPOINTMENT_UPDATED', { appointmentId: id, updates });
      toast({ title: 'Success', description: 'Appointment updated successfully' });
      return updatedAppointment;
    } catch (error: any) {
      console.error('Error updating appointment:', error);
      await logSecurityEvent('APPOINTMENT_UPDATE_FAILED', { appointmentId: id, error: error.message });
      toast({ title: 'Error', description: 'Failed to update appointment', variant: 'destructive' });
      throw error;
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!profile?.organizationId) throw new Error('No organization');
    try {
      console.log('Deleting appointment from database...');
      const appointmentRef = doc(db, 'organizations', profile.organizationId, 'appointments', id);
      await deleteDoc(appointmentRef);

      setAppointments(prev => prev.filter(apt => apt.id !== id));
      await logSecurityEvent('APPOINTMENT_DELETED', { appointmentId: id });
      toast({ title: 'Success', description: 'Appointment deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting appointment:', error);
      await logSecurityEvent('APPOINTMENT_DELETE_FAILED', { appointmentId: id, error: error.message });
      toast({ title: 'Error', description: 'Failed to delete appointment', variant: 'destructive' });
      throw error;
    }
  };

  return {
    appointments,
    loading,
    addAppointment,
    updateAppointment,
    deleteAppointment,
    refetch: fetchAppointments,
  };
};
