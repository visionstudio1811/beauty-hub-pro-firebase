import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface VerifyOtpRequest {
  phoneNumber: string;
  code: string;
  isSignUp?: boolean;
  fullName?: string;
}

interface TwilioVerificationCheckResponse {
  status?: string;
  valid?: boolean;
  message?: string;
}

/** Max 10 OTP verification attempts per phone per hour */
async function enforceVerifyRateLimit(phoneNumber: string): Promise<void> {
  const limiterRef = db.collection('rateLimits').doc(`otp_verify_${phoneNumber}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(limiterRef);
    const now = Date.now();
    const data = snap.data() || { count: 0, windowStart: now };

    if (now - data.windowStart > 3_600_000) {
      tx.set(limiterRef, { count: 1, windowStart: now });
    } else if (data.count >= 10) {
      throw new HttpsError('resource-exhausted', 'Too many verification attempts. Please try again in an hour.');
    } else {
      tx.update(limiterRef, { count: data.count + 1 });
    }
  });
}

export const verifyOtp = onCall(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'] },
  async (request) => {
    const data = request.data as VerifyOtpRequest;
    const { phoneNumber, code, isSignUp = false, fullName } = data;

    if (!phoneNumber || !code) {
      throw new HttpsError('invalid-argument', 'Phone number and verification code are required');
    }

    // Validate code is exactly 6 digits
    if (!/^\d{6}$/.test(code)) {
      throw new HttpsError('invalid-argument', 'Verification code must be 6 digits');
    }

    await enforceVerifyRateLimit(phoneNumber);

    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
      throw new HttpsError('internal', 'SMS service not configured');
    }

    const verificationUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/VerificationCheck`;
    const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');

    const response = await fetch(verificationUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: phoneNumber, Code: code }).toString(),
    });

    const verificationData = await response.json() as TwilioVerificationCheckResponse;

    if (!response.ok || verificationData.status !== 'approved') {
      return { success: false, error: 'Invalid or expired verification code' };
    }

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('phone', '==', phoneNumber).limit(1).get();

    let uid: string;

    if (!snapshot.empty) {
      uid = snapshot.docs[0].id;
    } else if (isSignUp) {
      try {
        const userRecord = await admin.auth().createUser({
          phoneNumber,
          displayName: fullName || undefined,
        });
        uid = userRecord.uid;

        await db.collection('users').doc(uid).set({
          phone: phoneNumber,
          fullName: fullName || '',
          email: '',
          role: 'staff',
          organizationId: null,
          organizationRole: null,
          isActive: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err: any) {
        throw new HttpsError('internal', 'Failed to create user account');
      }
    } else {
      return { success: false, error: 'Phone number not found. Please sign up first.' };
    }

    // Clear rate limit on success
    await db.collection('rateLimits').doc(`otp_verify_${phoneNumber}`).delete().catch(() => {});

    const customToken = await admin.auth().createCustomToken(uid);

    return { success: true, customToken, uid, message: 'Phone number verified successfully' };
  }
);
