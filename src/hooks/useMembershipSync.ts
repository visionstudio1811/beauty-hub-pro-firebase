import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  addDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Checks whether a client still has at least one active purchase (not expired,
 * sessions remaining > 0) and updates the `has_membership` flag on the client
 * document accordingly.  Also logs the transition in the client's
 * `membershipHistory` sub-collection.
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
  reason?: string,
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

  // Read current membership flag to detect transitions
  const clientRef = doc(db, 'organizations', organizationId, 'clients', clientId);
  const clientSnap = await getDoc(clientRef);
  const previousStatus = clientSnap.exists() ? (clientSnap.data().has_membership ?? false) : false;

  await updateDoc(clientRef, {
    has_membership: hasActivePurchase,
    updated_at: serverTimestamp(),
  });

  // Log a history entry whenever membership status actually changes
  if (previousStatus !== hasActivePurchase) {
    await addDoc(
      collection(db, 'organizations', organizationId, 'clients', clientId, 'membershipHistory'),
      {
        type: hasActivePurchase ? 'membership_activated' : 'membership_deactivated',
        reason: reason ?? (hasActivePurchase ? 'package_assigned' : 'no_active_packages'),
        createdAt: serverTimestamp(),
      },
    );
  }

  return hasActivePurchase;
}

/**
 * Log an arbitrary membership event (e.g. package assigned, sessions edited).
 */
export async function logMembershipEvent(
  organizationId: string,
  clientId: string,
  type: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await addDoc(
    collection(db, 'organizations', organizationId, 'clients', clientId, 'membershipHistory'),
    {
      type,
      ...details,
      createdAt: serverTimestamp(),
    },
  );
}
