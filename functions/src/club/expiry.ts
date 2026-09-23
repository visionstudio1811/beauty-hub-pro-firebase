import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { defineStrings, getOrgLanguage, makeT } from '../lib/i18n';
import { clubClientRef, clientCacheUpdate, currentBalance, ledgerEntryData, ledgerEntryRef, CLUB_CREDIT_EXPIRY_DAYS } from './ledger';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PAGE_SIZE = 200;

const STRINGS = defineStrings({
  en: { expiry_description: 'Club credit expired {{days}} days after cancellation' },
  he: { expiry_description: 'קרדיט המועדון פג {{days}} ימים לאחר ביטול המנוי' },
});

type ExpiryResult = 'expired' | 'nothing_to_expire' | 'skipped_active_membership' | 'skipped';

async function expireMembershipCredit(
  orgId: string,
  membershipRef: admin.firestore.DocumentReference,
  description: string,
): Promise<ExpiryResult> {
  return db.runTransaction(async (tx) => {
    const membershipSnap = await tx.get(membershipRef);
    if (!membershipSnap.exists) return 'skipped';
    const membership = membershipSnap.data()!;
    if (membership.status !== 'cancelled' || membership.credit_expired === true) return 'skipped';

    const serverNow = admin.firestore.FieldValue.serverTimestamp();
    const finish = (result: ExpiryResult): ExpiryResult => {
      tx.update(membershipRef, {
        credit_expired: true,
        credit_expired_at: serverNow,
        credit_expiry_result: result,
        updated_at: serverNow,
      });
      return result;
    };

    const clientId = typeof membership.client_id === 'string' ? membership.client_id : '';
    if (!clientId) return finish('skipped');

    const clientRef = clubClientRef(orgId, clientId);
    const entryRef = ledgerEntryRef(orgId, `expiry_${membershipRef.id}`);
    const [clientSnap, entrySnap] = await Promise.all([tx.get(clientRef), tx.get(entryRef)]);
    if (entrySnap.exists) return finish('expired');
    if (!clientSnap.exists) return finish('skipped');

    const client = clientSnap.data()!;
    const currentId = typeof client.club_membership_id === 'string' ? client.club_membership_id : '';
    const currentStatus = client.club_membership_status;
    // The client re-joined under a newer membership: the balance now belongs to that one.
    if (currentId && currentId !== membershipRef.id && (currentStatus === 'active' || currentStatus === 'past_due')) {
      return finish('skipped_active_membership');
    }

    const balance = currentBalance(client);
    if (balance <= 0) return finish('nothing_to_expire');

    const currency =
      typeof client.club_credit_currency === 'string' && client.club_credit_currency
        ? client.club_credit_currency
        : typeof membership.currency === 'string' && membership.currency
          ? membership.currency
          : 'USD';

    tx.set(
      entryRef,
      ledgerEntryData(
        orgId,
        {
          entryId: entryRef.id,
          client_id: clientId,
          membership_id: membershipRef.id,
          type: 'expiry',
          amount: -balance,
          currency,
          description,
          ref_type: 'system',
          ref_id: membershipRef.id,
          created_by: 'system',
        },
        0,
      ),
    );
    tx.update(clientRef, clientCacheUpdate(0, currency));
    return finish('expired');
  });
}

export const clubCreditExpiry = onSchedule({ schedule: 'every 24 hours' }, async () => {
  const now = admin.firestore.Timestamp.now();
  const descriptions = new Map<string, string>();
  const counts: Record<string, number> = {};
  let scanned = 0;
  let last: admin.firestore.QueryDocumentSnapshot | null = null;

  for (;;) {
    let query = db
      .collectionGroup('memberships')
      .where('status', '==', 'cancelled')
      .where('credit_expires_at', '<=', now)
      .orderBy('credit_expires_at')
      .limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned += 1;
      const data = doc.data();
      const orgId = doc.ref.parent.parent?.id ?? '';
      if (!orgId || data.credit_expired === true || data.organization_id !== orgId) continue;

      try {
        let description = descriptions.get(orgId);
        if (!description) {
          description = makeT(STRINGS, await getOrgLanguage(orgId))('expiry_description', { days: CLUB_CREDIT_EXPIRY_DAYS });
          descriptions.set(orgId, description);
        }
        const result = await expireMembershipCredit(orgId, doc.ref, description);
        counts[result] = (counts[result] ?? 0) + 1;
      } catch (err) {
        console.error(`clubCreditExpiry failed for org ${orgId}, membership ${doc.id}:`, err instanceof Error ? err.message : String(err));
        counts.failed = (counts.failed ?? 0) + 1;
      }
    }

    if (snap.size < PAGE_SIZE) break;
    last = snap.docs[snap.docs.length - 1];
  }

  console.log(`clubCreditExpiry: scanned ${scanned}`, counts);
});
