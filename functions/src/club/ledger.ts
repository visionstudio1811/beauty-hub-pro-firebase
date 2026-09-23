import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const CLUB_CREDIT_EXPIRY_DAYS = 90;
export const CLUB_CREDIT_EXPIRY_MS = CLUB_CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export type CreditEntryType = 'credit_add' | 'credit_spend' | 'adjustment' | 'refund' | 'expiry';
export type CreditRefType = 'stripe_invoice' | 'invoice' | 'manual' | 'system';
export type ClubMembershipStatus = 'active' | 'past_due' | 'cancelled';

export interface CreditEntryInput {
  entryId: string;
  client_id: string;
  membership_id: string | null;
  type: CreditEntryType;
  amount: number;
  currency: string;
  description: string;
  ref_type: CreditRefType;
  ref_id: string | null;
  created_by: string;
}

export interface ApplyCreditResult {
  applied: boolean;
  balance_after: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function ledgerEntryRef(orgId: string, entryId: string): admin.firestore.DocumentReference {
  return db.collection('organizations').doc(orgId).collection('creditLedger').doc(entryId);
}

export function clubClientRef(orgId: string, clientId: string): admin.firestore.DocumentReference {
  return db.collection('organizations').doc(orgId).collection('clients').doc(clientId);
}

export function currentBalance(client: admin.firestore.DocumentData | undefined): number {
  const raw = Number(client?.club_credit_balance);
  return Number.isFinite(raw) ? round2(raw) : 0;
}

export function computeBalanceAfter(client: admin.firestore.DocumentData | undefined, amount: number): number {
  return round2(currentBalance(client) + amount);
}

export function ledgerEntryData(
  orgId: string,
  entry: CreditEntryInput,
  balance_after: number,
): admin.firestore.DocumentData {
  return {
    organization_id: orgId,
    client_id: entry.client_id,
    membership_id: entry.membership_id ?? null,
    type: entry.type,
    amount: round2(entry.amount),
    balance_after: round2(balance_after),
    currency: entry.currency.toUpperCase(),
    description: entry.description,
    ref_type: entry.ref_type,
    ref_id: entry.ref_id ?? null,
    created_by: entry.created_by,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export function clientCacheUpdate(balance_after: number, currency: string): admin.firestore.DocumentData {
  return {
    club_credit_balance: round2(balance_after),
    club_credit_currency: currency.toUpperCase(),
    club_credit_updated_at: admin.firestore.FieldValue.serverTimestamp(),
  };
}

export async function applyCreditEntry(orgId: string, entry: CreditEntryInput): Promise<ApplyCreditResult> {
  const amount = round2(entry.amount);
  if (!Number.isFinite(amount) || amount === 0) throw new HttpsError('invalid-argument', 'invalid_amount');
  const entryRef = ledgerEntryRef(orgId, entry.entryId);
  const clientRef = clubClientRef(orgId, entry.client_id);

  return db.runTransaction(async (tx) => {
    const [entrySnap, clientSnap] = await Promise.all([tx.get(entryRef), tx.get(clientRef)]);
    if (entrySnap.exists) return { applied: false, balance_after: currentBalance(clientSnap.data()) };
    if (!clientSnap.exists) throw new HttpsError('not-found', 'client_not_found');

    const balance_after = computeBalanceAfter(clientSnap.data(), amount);
    if (amount < 0 && balance_after < 0) throw new HttpsError('failed-precondition', 'insufficient_credit');

    tx.set(entryRef, ledgerEntryData(orgId, { ...entry, amount }, balance_after));
    tx.update(clientRef, clientCacheUpdate(balance_after, entry.currency));
    return { applied: true, balance_after };
  });
}

export async function setClientMembershipCache(
  orgId: string,
  clientId: string,
  membershipId: string,
  status: ClubMembershipStatus,
  currency?: string | null,
): Promise<boolean> {
  const clientRef = clubClientRef(orgId, clientId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(clientRef);
    if (!snap.exists) return false;
    const client = snap.data() ?? {};
    const currentId = typeof client.club_membership_id === 'string' ? client.club_membership_id : '';
    // A cancelled membership never overwrites the cache once the client has moved on to a newer one.
    if (status === 'cancelled' && currentId && currentId !== membershipId) return false;

    const update: admin.firestore.DocumentData = {
      club_membership_id: membershipId,
      club_membership_status: status,
    };
    if (typeof client.club_credit_balance !== 'number') update.club_credit_balance = currentBalance(client);
    if (!client.club_credit_currency && typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency)) {
      update.club_credit_currency = currency.toUpperCase();
    }
    tx.update(clientRef, update);
    return true;
  });
}
