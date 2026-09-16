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
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';

export interface AppointmentAddonSnapshot {
  addon_id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

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
  package_name?: string | null;
  purchase_id?: string;
  session_used?: boolean;
  organization_id?: string;
  price?: number;
  addons?: AppointmentAddonSnapshot[];
  addons_total_price?: number;
  addons_total_duration?: number;
  acuity_appointment_id?: string | null;
  sync_status?: 'pending' | 'synced' | 'failed' | 'skipped' | string;
  // Scheduling fields
  buffer_before_minutes?: number; // Snapshotted from treatment at write time
  buffer_after_minutes?: number;
  is_custom_time?: boolean;       // True when staff used the "Custom time" override
  // Two-way confirmation (set by Cloud Functions / staff)
  confirmed_at?: string;
  confirmed_via?: 'sms' | 'email' | 'staff';
  cancellation_requested?: boolean;
  reschedule_requested?: boolean;
}

// Sentinel used only to detect when sanitizeString had to fall back. Missing or
// malformed display names are persisted as null (never an English placeholder)
// so the read path in sanitizeAppointmentData can localize the fallback.
const MISSING_NAME = '\u0000missing';
const persistedName = (value: unknown): string | null => {
  const sanitized = sanitizeString(value, MISSING_NAME);
  return sanitized === MISSING_NAME ? null : sanitized;
};

const sanitizeAppointmentData = (id: string, data: any): SupabaseAppointment => ({
  id,
  client_id: data.client_id,
  client_name: sanitizeString(data.client_name, i18n.t('hooks:fallbacks.unknownClient')),
  client_phone: sanitizeString(data.client_phone, i18n.t('hooks:fallbacks.noPhone')),
  client_email: sanitizeString(data.client_email, i18n.t('hooks:fallbacks.noEmail')),
  treatment_id: data.treatment_id,
  treatment_name: sanitizeString(data.treatment_name, i18n.t('hooks:fallbacks.unknownTreatment')),
  staff_id: data.staff_id,
  staff_name: sanitizeString(data.staff_name, i18n.t('hooks:fallbacks.unknownStaff')),
  appointment_date: sanitizeDateString(data.appointment_date),
  appointment_time: sanitizeString(data.appointment_time, '09:00'),
  duration: typeof data.duration === 'number' ? data.duration : 60,
  status: (data.status as SupabaseAppointment['status']) || 'scheduled',
  notes: data.notes ? sanitizeString(data.notes, '') : undefined,
  created_at: data.created_at?.toDate?.()?.toISOString() ?? sanitizeDateString(data.created_at),
  updated_at: data.updated_at?.toDate?.()?.toISOString() ?? sanitizeDateString(data.updated_at),
  room_id: data.room_id ? sanitizeString(data.room_id) : undefined,
  package_id: data.package_id,
  package_name: data.package_name ?? null,
  purchase_id: data.purchase_id ?? undefined,
  session_used: Boolean(data.session_used),
  organization_id: data.organization_id,
  price: typeof data.price === 'number' ? data.price : undefined,
  addons: Array.isArray(data.addons)
    ? data.addons.map((a: any) => ({
        addon_id: String(a?.addon_id ?? ''),
        name: sanitizeString(a?.name, i18n.t('hooks:fallbacks.addon')),
        price: typeof a?.price === 'number' ? a.price : Number(a?.price ?? 0),
        duration_minutes:
          typeof a?.duration_minutes === 'number' ? a.duration_minutes : Number(a?.duration_minutes ?? 0),
      }))
    : undefined,
  addons_total_price: typeof data.addons_total_price === 'number' ? data.addons_total_price : undefined,
  addons_total_duration:
    typeof data.addons_total_duration === 'number' ? data.addons_total_duration : undefined,
  acuity_appointment_id:
    data.acuity_appointment_id === undefined ? undefined : data.acuity_appointment_id,
  sync_status: typeof data.sync_status === 'string' ? data.sync_status : undefined,
  buffer_before_minutes:
    typeof data.buffer_before_minutes === 'number' ? data.buffer_before_minutes : undefined,
  buffer_after_minutes:
    typeof data.buffer_after_minutes === 'number' ? data.buffer_after_minutes : undefined,
  is_custom_time: typeof data.is_custom_time === 'boolean' ? data.is_custom_time : undefined,
  confirmed_at: typeof data.confirmed_at === 'string' ? data.confirmed_at : undefined,
  confirmed_via:
    data.confirmed_via === 'sms' || data.confirmed_via === 'email' || data.confirmed_via === 'staff'
      ? data.confirmed_via
      : undefined,
  cancellation_requested: data.cancellation_requested === true ? true : undefined,
  reschedule_requested: data.reschedule_requested === true ? true : undefined,
});

export const useSupabaseAppointments = () => {
  const [appointments, setAppointments] = useState<SupabaseAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation('hooks');
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
      setAppointments(sanitized);
      await logSecurityEvent('APPOINTMENTS_FETCHED', { count: sanitized.length });
    } catch (error) {
      console.error('Error fetching appointments:', error);
      await logSecurityEvent('APPOINTMENTS_FETCH_ERROR', {
        error: error instanceof Error ? error.message : String(error),
      });
      toast({
        title: t('common:status.error'),
        description: t('appointments.loadFailed'),
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
    if (!user) throw new Error(t('appointments.mustBeLoggedIn'));
    if (!profile?.organizationId) throw new Error(t('appointments.profileNeedsOrganization'));

    try {
      // Missing/malformed names are stored as null so no English placeholder is
      // persisted; sanitizeAppointmentData localizes the display fallback on read.
      const sanitizedData = {
        ...appointmentData,
        organization_id: profile.organizationId,
        client_name: persistedName(appointmentData.client_name),
        treatment_name: persistedName(appointmentData.treatment_name),
        staff_name: persistedName(appointmentData.staff_name),
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
      toast({ title: t('common:status.success'), description: t('appointments.created') });
      return newAppointment;
    } catch (error) {
      console.error('Error adding appointment:', error);
      const errorMessage = error instanceof Error ? error.message : t('appointments.createFailed');
      await logSecurityEvent('APPOINTMENT_CREATE_FAILED', { error: errorMessage });
      toast({ title: t('common:status.error'), description: errorMessage, variant: 'destructive' });
      throw error;
    }
  };

  const updateAppointment = async (
    id: string,
    updates: Partial<SupabaseAppointment>
  ): Promise<SupabaseAppointment> => {
    if (!profile?.organizationId) throw new Error(t('common.noOrganization'));
    try {
      const sanitizedUpdates: Record<string, unknown> = { ...updates };
      if (updates.client_name) sanitizedUpdates.client_name = persistedName(updates.client_name);
      if (updates.treatment_name) sanitizedUpdates.treatment_name = persistedName(updates.treatment_name);
      if (updates.staff_name) sanitizedUpdates.staff_name = persistedName(updates.staff_name);
      if (updates.appointment_date) sanitizedUpdates.appointment_date = sanitizeDateString(updates.appointment_date);
      if (updates.appointment_time) sanitizedUpdates.appointment_time = sanitizeString(updates.appointment_time, '09:00');

      const appointmentRef = doc(db, 'organizations', profile.organizationId, 'appointments', id);
      await updateDoc(appointmentRef, { ...sanitizedUpdates, updated_at: serverTimestamp() });

      const existing = appointments.find(a => a.id === id);
      const updatedAppointment = sanitizeAppointmentData(id, { ...existing, ...sanitizedUpdates });

      setAppointments(prev => prev.map(apt => (apt.id === id ? updatedAppointment : apt)));
      await logSecurityEvent('APPOINTMENT_UPDATED', { appointmentId: id, updates });
      toast({ title: t('common:status.success'), description: t('appointments.updated') });
      return updatedAppointment;
    } catch (error: any) {
      console.error('Error updating appointment:', error);
      await logSecurityEvent('APPOINTMENT_UPDATE_FAILED', { appointmentId: id, error: error.message });
      toast({ title: t('common:status.error'), description: t('appointments.updateFailed'), variant: 'destructive' });
      throw error;
    }
  };

  const deleteAppointment = async (id: string) => {
    if (!profile?.organizationId) throw new Error(t('common.noOrganization'));
    try {
      const appointmentRef = doc(db, 'organizations', profile.organizationId, 'appointments', id);
      await deleteDoc(appointmentRef);

      setAppointments(prev => prev.filter(apt => apt.id !== id));
      await logSecurityEvent('APPOINTMENT_DELETED', { appointmentId: id });
      toast({ title: t('common:status.success'), description: t('appointments.deleted') });
    } catch (error: any) {
      console.error('Error deleting appointment:', error);
      await logSecurityEvent('APPOINTMENT_DELETE_FAILED', { appointmentId: id, error: error.message });
      toast({ title: t('common:status.error'), description: t('appointments.deleteFailed'), variant: 'destructive' });
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
