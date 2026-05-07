import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { syncMembershipStatus } from '@/hooks/useMembershipSync';

/**
 * Decrements the session count on a purchase when an appointment is completed.
 * Reads the current purchase state from Firestore so it works correctly even
 * when called outside of a React hook context (e.g. from a page-level handler).
 */
export async function decrementSessionForAppointment(
  orgId: string,
  purchaseId: string,
  treatmentId: string | null | undefined,
  clientId: string | null | undefined,
): Promise<void> {
  const purchaseRef = doc(db, 'organizations', orgId, 'purchases', purchaseId);
  const purchaseSnap = await getDoc(purchaseRef);
  if (!purchaseSnap.exists()) return;

  const purchase = purchaseSnap.data();
  const updates: Record<string, unknown> = { updated_at: serverTimestamp() };
  let newTotal: number;

  const slots = purchase.sessions_by_treatment as
    | Array<{ treatment_id: string; remaining: number }>
    | undefined;

  if (slots && slots.length > 0 && treatmentId) {
    const updatedSlots = slots.map(s => ({ ...s }));
    const slot = updatedSlots.find(s => s.treatment_id === treatmentId);
    if (slot && slot.remaining > 0) {
      slot.remaining = Math.max(0, slot.remaining - 1);
    }
    newTotal = updatedSlots.reduce((sum, s) => sum + s.remaining, 0);
    updates.sessions_by_treatment = updatedSlots;
    updates.sessions_remaining = newTotal;
  } else {
    newTotal = Math.max(0, (purchase.sessions_remaining ?? 0) - 1);
    updates.sessions_remaining = newTotal;
  }

  if (newTotal === 0) {
    updates.payment_status = 'completed';
  }

  await updateDoc(purchaseRef, updates);

  if (newTotal === 0 && clientId) {
    await syncMembershipStatus(orgId, clientId);
  }
}
