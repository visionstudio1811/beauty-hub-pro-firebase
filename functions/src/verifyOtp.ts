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

export const verifyOtp = onCall(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'] },
  async (request) => {
  const data = request.data as VerifyOtpRequest;
  const { phoneNumber, code, isSignUp = false, fullName } = data;

  if (!phoneNumber || !code) {
    throw new HttpsError(
      'invalid-argument',
      'Phone number and verification code are required'
    );
  }

  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
    console.error('Missing Twilio credentials');
    throw new HttpsError('internal', 'Twilio configuration missing');
  }

  const verificationUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/VerificationCheck`;
  const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');

  const response = await fetch(verificationUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phoneNumber, Code: code }).toString(),
  });

  const verificationData = await response.json() as any;

  if (!response.ok || verificationData.status !== 'approved') {
    console.error('Twilio verification failed:', verificationData);
    return { success: false, error: 'Invalid verification code' };
  }

  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('phone', '==', phoneNumber).limit(1).get();

  let uid: string;

  if (!snapshot.empty) {
    uid = snapshot.docs[0].id;
    console.log('Signing in existing user:', uid);
  } else if (isSignUp) {
    try {
      const userRecord = await admin.auth().createUser({
        phoneNumber,
        displayName: fullName || phoneNumber,
      });
      uid = userRecord.uid;

      await db.collection('users').doc(uid).set({
        phone: phoneNumber,
        fullName: fullName || phoneNumber,
        email: '',
        role: 'staff',
        organizationId: null,
        organizationRole: null,
        isActive: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('Created new Firebase Auth user:', uid);
    } catch (err: any) {
      console.error('Error creating user:', err);
      throw new HttpsError('internal', 'Failed to create user account');
    }
  } else {
    return { success: false, error: 'Phone number not found. Please sign up first.' };
  }

  const customToken = await admin.auth().createCustomToken(uid);

  console.log('Phone verification successful for:', phoneNumber);

  return {
    success: true,
    customToken,
    uid,
    message: 'Phone number verified successfully',
  };
  }
);
