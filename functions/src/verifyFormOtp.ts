import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { defineStrings, makeT, getOrgLanguage, isAppLanguage, DEFAULT_LANGUAGE, AppLanguage } from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_ATTEMPTS = 5;

// These HttpsError messages are rendered verbatim to the (unauthenticated)
// signer by the public WaiverForm, so they are end-user copy and follow the
// form language: the optional `lang` the form sends (its resolved signing
// language, e.g. a ?lang= override), else the `language` stamped on the
// clientWaivers doc by sendWaiver (the form's base language), else the org
// language behind the token.
const STRINGS = defineStrings({
  en: {
    invalid_link: 'Invalid link',
    already_submitted: 'This form has already been submitted',
    no_otp_required: 'This form does not require OTP verification',
    otp_missing: 'OTP not found or expired. Please request a new link.',
    otp_expired: 'Your verification code has expired. Please ask staff to resend the form.',
    too_many_attempts: 'Too many incorrect attempts. Please ask staff to resend the form.',
    incorrect_one: 'Incorrect code. 1 attempt remaining.',
    incorrect_many: 'Incorrect code. {{remaining}} attempts remaining.',
    token_otp_required: 'token and otp are required',
    otp_six_digits: 'OTP must be 6 digits',
  },
  he: {
    invalid_link: 'קישור לא תקין',
    already_submitted: 'הטופס הזה כבר נשלח',
    no_otp_required: 'הטופס הזה אינו דורש אימות בקוד',
    otp_missing: 'קוד האימות לא נמצא או שפג תוקפו. נא לבקש קישור חדש.',
    otp_expired: 'תוקף קוד האימות פג. נא לבקש מהצוות לשלוח את הטופס מחדש.',
    too_many_attempts: 'יותר מדי ניסיונות שגויים. נא לבקש מהצוות לשלוח את הטופס מחדש.',
    incorrect_one: 'קוד שגוי. נותר ניסיון אחד.',
    incorrect_many: 'קוד שגוי. נותרו {{remaining}} ניסיונות.',
    token_otp_required: 'נדרשים קישור וקוד אימות',
    otp_six_digits: 'קוד האימות חייב להיות בן 6 ספרות',
  },
});

interface VerifyOtpRequest {
  token: string;
  otp: string;
  /** Optional: the signing language the public form resolved (overrides the org language). */
  lang?: AppLanguage;
}

/**
 * Language the public form renders in when the caller did not pass `lang`:
 * the clientWaivers doc's stamped `language` (what WaiverForm's
 * resolveWaiverLanguage uses as its base), falling back to the org language.
 */
async function resolveFormLanguage(tokenData: FirebaseFirestore.DocumentData): Promise<AppLanguage> {
  const orgId = typeof tokenData.organizationId === 'string' ? tokenData.organizationId : null;
  const waiverId = typeof tokenData.waiverId === 'string' ? tokenData.waiverId : null;
  if (!orgId) return DEFAULT_LANGUAGE;
  if (waiverId) {
    try {
      const waiverSnap = await db
        .collection('organizations').doc(orgId)
        .collection('clientWaivers').doc(waiverId)
        .get();
      const stamped = waiverSnap.data()?.language;
      if (isAppLanguage(stamped)) return stamped;
    } catch {
      // fall through to the org language
    }
  }
  return getOrgLanguage(orgId);
}

export const verifyFormOtp = onCall(
  { enforceAppCheck: false },
  async (request) => {
    // Public callable — no auth required (form signer is unauthenticated)
    const data = request.data as VerifyOtpRequest;
    const { token, otp } = data;
    const requestedLang: AppLanguage | null = isAppLanguage(data?.lang) ? data.lang : null;

    // Before the token is looked up there is no org/waiver to derive a language
    // from, so argument-shape errors follow the form's `lang` (else English).
    const tNoOrg = makeT(STRINGS, requestedLang ?? DEFAULT_LANGUAGE);
    if (!token || !otp) throw new HttpsError('invalid-argument', tNoOrg('token_otp_required'));
    if (!/^\d{6}$/.test(otp)) throw new HttpsError('invalid-argument', tNoOrg('otp_six_digits'));

    // Verify token exists
    const tokenDoc = await db.collection('waiverTokens').doc(token).get();
    if (!tokenDoc.exists) {
      throw new HttpsError('not-found', tNoOrg('invalid_link'));
    }
    const tokenData = tokenDoc.data()!;
    const lang = requestedLang ?? await resolveFormLanguage(tokenData);
    const t = makeT(STRINGS, lang);

    if (tokenData.status !== 'pending') throw new HttpsError('failed-precondition', t('already_submitted'));
    if (!tokenData.requiresOtp) throw new HttpsError('failed-precondition', t('no_otp_required'));
    if (tokenData.otpVerified === true) return { success: true, alreadyVerified: true };

    // Read OTP secret (admin-only collection)
    const otpDoc = await db.collection('otpCodes').doc(token).get();
    if (!otpDoc.exists) throw new HttpsError('not-found', t('otp_missing'));

    const otpData = otpDoc.data()!;

    // Check expiry
    const expiresAt = otpData.expiresAt as admin.firestore.Timestamp;
    if (expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('deadline-exceeded', t('otp_expired'));
    }

    // Check attempts
    const attempts = (otpData.attempts as number) ?? 0;
    if (attempts >= MAX_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', t('too_many_attempts'));
    }

    if (otpData.code !== otp) {
      await db.collection('otpCodes').doc(token).update({ attempts: admin.firestore.FieldValue.increment(1) });
      const remaining = MAX_ATTEMPTS - attempts - 1;
      throw new HttpsError(
        'invalid-argument',
        remaining === 1 ? t('incorrect_one') : t('incorrect_many', { remaining }),
      );
    }

    // OTP is correct — mark verified
    await Promise.all([
      db.collection('waiverTokens').doc(token).update({ otpVerified: true }),
      db.collection('otpCodes').doc(token).update({ verified: true, attempts: admin.firestore.FieldValue.increment(1) }),
    ]);

    return { success: true };
  }
);
