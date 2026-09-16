import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'node:crypto';
import { DEFAULT_LANGUAGE, defineStrings, getCallerLanguage, makeT, orgLanguageFromData, type AppLanguage } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Labels of the standard blocks appended to org form templates, per org language.
//
// The three code paths that recognise the seeded blocks by label text all
// accept both the English and the Hebrew spellings, so Hebrew orgs get
// Hebrew labels and everything downstream keeps working:
//   - functions/src/backfillClient.ts       (signed-form -> client card backfill)
//   - src/pages/WaiverForm.tsx              (public form prefill from the client card)
//   - src/components/waivers/WaiverTemplateEditor.tsx (quick-add dedupe)
// If you change a label here, keep the matchers below (and in those files)
// in sync — the Hebrew values must stay exactly 'גיל', 'מגדר' and
// 'איך שמעת עלינו?'.
const STANDARD_LABELS = defineStrings({
  en: {
    age: 'Age',
    gender: 'Gender',
    referral: 'How did you hear about us?',
  },
  he: {
    age: 'גיל',
    gender: 'מגדר',
    referral: 'איך שמעת עלינו?',
  },
});

function standardLabelsFor(lang: AppLanguage) {
  const t = makeT(STANDARD_LABELS, lang);
  return {
    age: t('age'),
    gender: t('gender'),
    referral: t('referral'),
  };
}

// Strings shown to the (staff) caller of this migration: error messages and
// the "(untitled)" placeholder used in the response summary. All resolved in
// the caller's language.
const CALLER_STRINGS = defineStrings({
  en: {
    unauthenticated: 'You must be signed in.',
    orgRequired: 'organizationId is required.',
    noProfile: 'Caller has no profile.',
    orgMismatch: 'Organization mismatch.',
    adminRequired: 'Admin role required.',
    untitled: '(untitled)',
  },
  he: {
    unauthenticated: 'יש להתחבר כדי להמשיך.',
    orgRequired: 'נדרש מזהה ארגון (organizationId).',
    noProfile: 'למשתמש המבצע אין פרופיל.',
    orgMismatch: 'אי-התאמה בין הארגונים.',
    adminRequired: 'נדרשת הרשאת מנהל.',
    untitled: '(ללא כותרת)',
  },
});

/**
 * Label matchers, applied to the lower-cased block label. They accept
 * both English and Hebrew spellings so re-running the migration never
 * duplicates a block on a hand-authored Hebrew template.
 *
 * The English predicates are byte-for-byte the historical ones (also used by
 * backfillClient.ts + WaiverTemplateEditor.tsx) so English behaviour is
 * unchanged — e.g. "average age of children" is NOT an age field.
 */
function isAgeLabel(l: string): boolean {
  if (l === 'age' || l.endsWith(' age') || l.startsWith('age ')) return true;
  // Hebrew: the bare word, optionally with the definite article ("הגיל"), a
  // possessive suffix ("גילך"), and optional trailing punctuation ("גיל:").
  // Must stand as its own word so "גילוי" (disclosure) etc. don't match.
  return /(^|\s)ה?גיל(ך|כם|כן)?(?=$|\s|[:?*.])/.test(l);
}

function isGenderLabel(l: string): boolean {
  if (l.includes('gender') || l === 'sex') return true;
  return /(^|\s)ה?מגדר(?=$|\s|[:?*.])|^מין[:?*.]?$/.test(l);
}

function isReferralLabel(l: string): boolean {
  if (
    l.includes('how did you hear') || l.includes('referral') ||
    l.includes('find us') || l.includes('hear about us')
  ) return true;
  // Hebrew: anchored to the "how did you hear / reach us" phrasings and the
  // explicit "referral source" compound. Bare "הפניה" (referral) / "המלצה"
  // (recommendation) are intentionally NOT matched — they appear in unrelated
  // medical labels such as "הפניה מרופא" or "המלצה לטיפול".
  return /איך שמעת|שמעת עלינו|שמעתם עלינו|הגעת אלינו|הגעתם אלינו|איך הגעת|מקור ה?הפניה|מקור ה?פנייה/.test(l);
}

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
  // Auth check first: an unauthenticated caller is rejected before any
  // Firestore read (the message falls back to the default language).
  if (!request.auth) {
    throw new HttpsError('unauthenticated', makeT(CALLER_STRINGS, DEFAULT_LANGUAGE)('unauthenticated'));
  }
  const { organizationId, kinds } = (request.data ?? {}) as {
    organizationId?: string;
    kinds?: string[];
  };
  // Caller language from the caller's own profile (and, failing that, the org
  // on that profile) — never from the request payload.
  const err = makeT(CALLER_STRINGS, await getCallerLanguage(request.auth.uid));
  if (!organizationId) {
    throw new HttpsError('invalid-argument', err('orgRequired'));
  }
  const targetKinds = (Array.isArray(kinds) && kinds.length > 0)
    ? kinds.filter((k) => k === 'waiver' || k === 'intake' || k === 'agreement')
    : ['agreement', 'intake'];

  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError('permission-denied', err('noProfile'));
  }
  const caller = callerSnap.data()!;
  if (caller.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', err('orgMismatch'));
  }
  if (caller.role !== 'admin') {
    throw new HttpsError('permission-denied', err('adminRequired'));
  }

  // Fresh read (not the 60s-cached getOrgLanguage) so an admin who just
  // switched the org language in Settings sees the new value reflected here.
  const orgRef = db.collection('organizations').doc(organizationId);
  const orgSnap = await orgRef.get();
  const lang = orgLanguageFromData(orgSnap.data());
  const labels = standardLabelsFor(lang);

  const tplCol = orgRef.collection('waiverTemplates');
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

    if (!has(isAgeLabel)) {
      toAdd.push({ id: randomUUID(), type: 'short_answer', label: labels.age, required: false });
    }
    if (!has(isGenderLabel)) {
      toAdd.push({ id: randomUUID(), type: 'short_answer', label: labels.gender, required: false });
    }
    if (!has(isReferralLabel)) {
      toAdd.push({ id: randomUUID(), type: 'short_answer', label: labels.referral, required: false });
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
      title: (data.title as string) ?? err('untitled'),
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
