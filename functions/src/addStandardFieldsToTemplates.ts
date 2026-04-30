import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface TemplateBlock {
  id: string;
  type: string;
  label?: string;
  required?: boolean;
  value?: string;
}

/**
 * One-shot admin migration: appends Age / Gender / "How did you hear about us?"
 * Short Answer blocks to every template of the requested kinds for the given
 * organization, skipping any block whose label already matches.
 *
 * Idempotent: re-running it is safe and a no-op once all blocks are present.
 */
export const addStandardFieldsToTemplates = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  const { organizationId, kinds } = (request.data ?? {}) as {
    organizationId?: string;
    kinds?: string[];
  };
  if (!organizationId) {
    throw new HttpsError('invalid-argument', 'organizationId is required.');
  }
  const targetKinds = (Array.isArray(kinds) && kinds.length > 0)
    ? kinds.filter((k) => k === 'waiver' || k === 'intake' || k === 'agreement')
    : ['agreement', 'intake'];

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', 'Caller has no profile.');
  }
  const caller = callerSnap.data()!;
  if (caller.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch.');
  }
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin role required.');
  }

  const tplCol = db.collection('organizations').doc(organizationId).collection('waiverTemplates');
  const allSnap = await tplCol.get();

  const summary: Array<{ id: string; title: string; kind: string; added: string[] }> = [];

  for (const docSnap of allSnap.docs) {
    const data = docSnap.data();
    const kind = (data.kind as string) ?? 'waiver';
    if (!targetKinds.includes(kind)) continue;

    const content: TemplateBlock[] = Array.isArray(data.content) ? [...data.content] : [];
    const has = (test: (lbl: string) => boolean) =>
      content.some((b) => test((b.label ?? '').toLowerCase()));

    const toAdd: TemplateBlock[] = [];

    if (!has((l) => l === 'age' || l.endsWith(' age') || l.startsWith('age '))) {
      toAdd.push({ id: randomUUID(), type: 'short_answer', label: 'Age', required: false });
    }
    if (!has((l) => l.includes('gender') || l === 'sex')) {
      toAdd.push({ id: randomUUID(), type: 'short_answer', label: 'Gender', required: false });
    }
    if (!has((l) => l.includes('how did you hear') || l.includes('referral') || l.includes('find us') || l.includes('hear about us'))) {
      toAdd.push({ id: randomUUID(), type: 'short_answer', label: 'How did you hear about us?', required: false });
    }

    if (toAdd.length > 0) {
      await docSnap.ref.update({
        content: [...content, ...toAdd],
        updated_at: new Date().toISOString(),
        updated_at_ts: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    summary.push({
      id: docSnap.id,
      title: (data.title as string) ?? '(untitled)',
      kind,
      added: toAdd.map((b) => b.label ?? ''),
    });
  }

  return {
    organizationId,
    kinds: targetKinds,
    templatesProcessed: summary.length,
    templatesUpdated: summary.filter((s) => s.added.length > 0).length,
    summary,
  };
});
