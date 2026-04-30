import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { consumeRateLimit } from './rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type TemplateBlock = { type?: string; label?: string; id?: string };
type Answer = string | boolean | string[] | undefined;

export interface SignedWaiverFields {
  signer_name?: string;
  signer_email?: string;
  signer_phone?: string;
  answers?: Record<string, unknown>;
  templateId?: string;
  kind?: 'waiver' | 'intake' | 'agreement';
}

export interface BackfillResult {
  filled: string[];
  updates: Record<string, string | number>;
}

/**
 * Fills empty fields on a client card from a signed waiver/intake/agreement.
 * Never overwrites a non-empty client field. Returns the list of fields filled.
 *
 * Used by both the notifyOrgOnWaiverSigned trigger (real-time) and the
 * backfillClientFromLatestForm callable (admin-triggered, for forms signed
 * before this code was deployed).
 */
export async function backfillClientFromSignedWaiver(
  orgId: string,
  clientId: string,
  waiver: SignedWaiverFields,
): Promise<BackfillResult> {
  const clientRef = db.collection('organizations').doc(orgId).collection('clients').doc(clientId);
  const clientSnap = await clientRef.get();
  if (!clientSnap.exists) return { filled: [], updates: {} };
  const client = clientSnap.data() ?? {};

  let templateBlocks: TemplateBlock[] = [];
  if (waiver.templateId) {
    const tplDoc = await db
      .collection('organizations').doc(orgId)
      .collection('waiverTemplates').doc(waiver.templateId)
      .get();
    if (tplDoc.exists) {
      const td = tplDoc.data() ?? {};
      if (Array.isArray(td.content)) templateBlocks = td.content as TemplateBlock[];
    }
  }

  const ans = (waiver.answers as Record<string, Answer>) ?? {};
  const signerEmail = (waiver.signer_email ?? '').trim();
  const signerPhone = (waiver.signer_phone ?? '').trim();
  const signerName  = (waiver.signer_name  ?? '').trim();

  const findAnswer = (predicate: (label: string, type: string) => boolean): string => {
    for (const block of templateBlocks) {
      const lbl = (block.label ?? '').toLowerCase();
      const type = block.type ?? '';
      if (!block.id) continue;
      if (predicate(lbl, type)) {
        const v = ans[block.id];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return '';
  };

  const isBirthdayLabel = (lbl: string) =>
    lbl.includes('birthday') || lbl.includes('date of birth') ||
    lbl.includes('dob') || lbl.includes('birth date');

  const firstNameAnswer = findAnswer(lbl => lbl.includes('first name'));
  const lastNameAnswer  = findAnswer(lbl => lbl.includes('last name'));
  const combinedName    = [firstNameAnswer, lastNameAnswer].filter(Boolean).join(' ').trim();

  const addressAnswer = findAnswer(lbl =>
    lbl.includes('address') && !lbl.includes('line 2') && !lbl.includes('email'),
  );
  const cityAnswer = findAnswer(lbl => lbl.includes('city'));
  const dobAnswer  = findAnswer((lbl, type) =>
    isBirthdayLabel(lbl) || (type === 'date' && isBirthdayLabel(lbl)),
  );
  const genderAnswer = findAnswer(lbl => lbl.includes('gender') || lbl === 'sex');
  const referralAnswer = findAnswer(lbl =>
    lbl.includes('how did you hear') || lbl.includes('referral') || lbl.includes('find us') || lbl.includes('hear about us'),
  );
  const ageAnswer = findAnswer(lbl => lbl === 'age' || lbl.endsWith(' age') || lbl.startsWith('age '));

  const updates: Record<string, string | number> = {};

  if (!client.email && signerEmail) updates.email = signerEmail;

  if ((!client.phone || (client.phone as string).length < 7) && signerPhone) updates.phone = signerPhone;

  const currentName = (client.name as string) ?? '';
  const fullerName = combinedName || signerName;
  if (
    fullerName &&
    (!currentName.trim() || currentName.trim().split(/\s+/).length < 2) &&
    fullerName.trim().split(/\s+/).length > currentName.trim().split(/\s+/).length
  ) {
    updates.name = fullerName;
  }

  if (!client.address && addressAnswer) updates.address = addressAnswer;
  if (!client.city && cityAnswer) updates.city = cityAnswer;
  if (!client.date_of_birth && dobAnswer) updates.date_of_birth = dobAnswer;
  if (!client.gender && genderAnswer) updates.gender = genderAnswer;
  if (!client.referral_source && referralAnswer) updates.referral_source = referralAnswer;

  if (client.age == null && ageAnswer) {
    const parsed = parseInt(ageAnswer, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed < 120) updates.age = parsed;
  }

  const filled = Object.keys(updates);
  if (filled.length > 0) {
    await clientRef.update({
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }

  return { filled, updates };
}

/**
 * Admin-triggered manual backfill. Finds the most recent signed waiver/intake/agreement
 * for a given client and applies the backfill. Useful when a form was signed before
 * the trigger-based backfill was deployed.
 */
export const backfillClientFromLatestForm = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const { organizationId, clientId } = (request.data ?? {}) as {
    organizationId?: string;
    clientId?: string;
  };
  if (!organizationId || !clientId) {
    throw new HttpsError('invalid-argument', 'organizationId and clientId are required.');
  }

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'Caller has no profile.');
  }
  const caller = callerSnap.data()!;
  if (caller.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch.');
  }
  if (!['admin', 'staff', 'reception'].includes((caller.role as string) ?? '')) {
    throw new HttpsError('permission-denied', 'Insufficient role.');
  }

  await consumeRateLimit(organizationId, 'backfillClient', 200);

  const waiversSnap = await db
    .collection('organizations').doc(organizationId)
    .collection('clientWaivers')
    .where('clientId', '==', clientId)
    .where('status', '==', 'signed')
    .get();

  if (waiversSnap.empty) {
    return { filled: [] as string[], message: 'No signed forms found for this client.' };
  }

  const docs = waiversSnap.docs.map(d => ({ id: d.id, data: d.data() }));
  docs.sort((a, b) => {
    const av = (a.data.signed_at as string) ?? '';
    const bv = (b.data.signed_at as string) ?? '';
    return bv.localeCompare(av);
  });
  const latest = docs[0].data;

  const result = await backfillClientFromSignedWaiver(organizationId, clientId, {
    signer_name:  latest.signer_name as string | undefined,
    signer_email: latest.signer_email as string | undefined,
    signer_phone: latest.signer_phone as string | undefined,
    answers:      latest.answers as Record<string, unknown> | undefined,
    templateId:   latest.templateId as string | undefined,
    kind:         latest.kind as 'waiver' | 'intake' | 'agreement' | undefined,
  });

  return {
    filled: result.filled,
    message:
      result.filled.length === 0
        ? 'Client card already has all available info — nothing to fill.'
        : `Filled ${result.filled.length} field(s) from latest signed form.`,
  };
});
