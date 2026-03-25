import {
  collection,
  doc,
  getDocs,
  updateDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Checks whether a client still has at least one active purchase (not expired,
 * sessions remaining > 0) and updates the `has_membership` flag on the client
 * document accordingly.
 *
 * Call this after any operation that changes a client's purchases:
 *  - Package assignment
 *  - Purchase deletion
 *  - Session decrement (when last session consumed)
 *  - Manual edit of sessions_remaining or expiry_date
 */
export async function syncMembershipStatus(
  organizationId: string,
  clientId: string,
): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];

  const purchasesSnap = await getDocs(
    query(
      collection(db, 'organizations', organizationId, 'purchases'),
      where('client_id', '==', clientId),
      where('payment_status', '==', 'active'),
    ),
  );

  // A client "has membership" if they have at least one purchase with
  // remaining sessions that hasn't expired.
  const hasActivePurchase = purchasesSnap.docs.some((d) => {
    const data = d.data();
    if ((data.sessions_remaining ?? 0) <= 0) return false;
    if (data.expiry_date && data.expiry_date < today) return false;
    return true;
  });

  await updateDoc(
    doc(db, 'organizations', organizationId, 'clients', clientId),
    { has_membership: hasActivePurchase, updated_at: serverTimestamp() },
  );

  return hasActivePurchase;
}
