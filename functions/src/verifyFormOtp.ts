import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const MAX_ATTEMPTS = 5;

interface VerifyOtpRequest {
  token: string;
  otp: string;
}

export const verifyFormOtp = onCall(
  { enforceAppCheck: false },
  async (request) => {
    // Public callable — no auth required (form signer is unauthenticated)
    const data = request.data as VerifyOtpRequest;
    const { token, otp } = data;

    if (!token || !otp) throw new HttpsError('invalid-argument', 'token and otp are required');
    if (!/^\d{6}$/.test(otp)) throw new HttpsError('invalid-argument', 'OTP must be 6 digits');

    // Verify token exists
    const tokenDoc = await db.collection('waiverTokens').doc(token).get();
    if (!tokenDoc.exists) throw new HttpsError('not-found', 'Invalid link');
    const tokenData = tokenDoc.data()!;
    if (tokenData.status !== 'pending') throw new HttpsError('failed-precondition', 'This form has already been submitted');
    if (!tokenData.requiresOtp) throw new HttpsError('failed-precondition', 'This form does not require OTP verification');
    if (tokenData.otpVerified === true) return { success: true, alreadyVerified: true };

    // Read OTP secret (admin-only collection)
    const otpDoc = await db.collection('otpCodes').doc(token).get();
    if (!otpDoc.exists) throw new HttpsError('not-found', 'OTP not found or expired. Please request a new link.');

    const otpData = otpDoc.data()!;

    // Check expiry
    const expiresAt = otpData.expiresAt as admin.firestore.Timestamp;
    if (expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('deadline-exceeded', 'Your verification code has expired. Please ask staff to resend the form.');
    }

    // Check attempts
    const attempts = (otpData.attempts as number) ?? 0;
    if (attempts >= MAX_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', 'Too many incorrect attempts. Please ask staff to resend the form.');
    }

    if (otpData.code !== otp) {
      await db.collection('otpCodes').doc(token).update({ attempts: admin.firestore.FieldValue.increment(1) });
      const remaining = MAX_ATTEMPTS - attempts - 1;
      throw new HttpsError('invalid-argument', `Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`);
    }

    // OTP is correct — mark verified
    await Promise.all([
      db.collection('waiverTokens').doc(token).update({ otpVerified: true }),
      db.collection('otpCodes').doc(token).update({ verified: true, attempts: admin.firestore.FieldValue.increment(1) }),
    ]);

    return { success: true };
  }
);
