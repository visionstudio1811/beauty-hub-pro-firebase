import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrganization } from '@/contexts/OrganizationContext';
import type { StaffAvailabilityDoc } from '@/lib/scheduling/types';

// Path: organizations/{orgId}/staffSchedules/{staffId}/availability/{docId}
// {staffId} matches the value stored as appointment.staff_id (a users/{uid} UID).
// We use a dedicated `staffSchedules` collection (rather than `staff/{id}/availability`)
// because the existing `staff` collection holds a different ID space than user UIDs.
// Doc IDs follow a pattern: weekly-0..6 for weekly rows, override-YYYY-MM-DD for date overrides.

const sanitizeAvailabilityDoc = (raw: Record<string, unknown>): StaffAvailabilityDoc | null => {
  const type = raw.type;
  if (type === 'weekly') {
    const dow = Number(raw.day_of_week);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) return null;
    return {
      type: 'weekly',
      day_of_week: dow,
      start_time: typeof raw.start_time === 'string' ? raw.start_time : '09:00',
      end_time: typeof raw.end_time === 'string' ? raw.end_time : '18:00',
      is_active: raw.is_active !== false,
    };
  }
  if (type === 'override') {
    if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) return null;
    return {
      type: 'override',
      date: raw.date,
      start_time: typeof raw.start_time === 'string' ? raw.start_time : undefined,
      end_time: typeof raw.end_time === 'string' ? raw.end_time : undefined,
      is_active: raw.is_active !== false,
    };
  }
  return null;
};

const fetchStaffAvailability = async (orgId: string, staffId: string): Promise<StaffAvailabilityDoc[]> => {
  const snapshot = await getDocs(
    collection(db, 'organizations', orgId, 'staffSchedules', staffId, 'availability')
  );
  const docs: StaffAvailabilityDoc[] = [];
  snapshot.forEach(d => {
    const sanitized = sanitizeAvailabilityDoc(d.data() as Record<string, unknown>);
    if (sanitized) docs.push(sanitized);
  });
  return docs;
};

/**
 * Fetch a single staff member's availability docs (weekly + overrides).
 * Cached by React Query under ['staffAvailability', orgId, staffId].
 */
export const useStaffAvailability = (staffId: string | null | undefined) => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: ['staffAvailability', orgId, staffId],
    queryFn: () => fetchStaffAvailability(orgId!, staffId!),
    enabled: Boolean(orgId && staffId),
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Fetch availability for many staff members in parallel.
 * Returns a Map keyed by staff_id.
 */
export const useMultipleStaffAvailability = (staffIds: string[]) => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  return useQuery({
    queryKey: ['staffAvailabilityMulti', orgId, [...staffIds].sort()],
    queryFn: async () => {
      if (!orgId) return new Map<string, StaffAvailabilityDoc[]>();
      const results = await Promise.all(
        staffIds.map(async id => [id, await fetchStaffAvailability(orgId, id)] as const)
      );
      return new Map<string, StaffAvailabilityDoc[]>(results);
    },
    enabled: Boolean(orgId) && staffIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
};

// -------- mutations --------

export const useUpsertStaffAvailability = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      staffId: string;
      docId: string;             // e.g. "weekly-0" or "override-2026-06-15"
      data: StaffAvailabilityDoc;
    }) => {
      if (!orgId) throw new Error('No organization selected');
      const ref = doc(db, 'organizations', orgId, 'staff', params.staffId, 'availability', params.docId);
      await setDoc(ref, { ...params.data, updated_at: serverTimestamp(), created_at: serverTimestamp() }, { merge: true });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['staffAvailability', orgId, variables.staffId] });
      qc.invalidateQueries({ queryKey: ['staffAvailabilityMulti', orgId] });
    },
  });
};

export const useDeleteStaffAvailability = () => {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { staffId: string; docId: string }) => {
      if (!orgId) throw new Error('No organization selected');
      await deleteDoc(doc(db, 'organizations', orgId, 'staff', params.staffId, 'availability', params.docId));
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['staffAvailability', orgId, variables.staffId] });
      qc.invalidateQueries({ queryKey: ['staffAvailabilityMulti', orgId] });
    },
  });
};

// Helper: build the canonical doc id for a weekly/override record.
export const weeklyDocId = (dow: number) => `weekly-${dow}`;
export const overrideDocId = (date: string) => `override-${date}`;
