import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface SendVerificationRequest {
  phoneNumber: string;
  countryCode: string;
  isSignUp: boolean;
}

function normalizePhoneNumber(phone: string, countryCode: string): string {
  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.startsWith(countryCode.replace('+', ''))) {
    return `+${digitsOnly}`;
  }

  if (digitsOnly.startsWith('0')) {
    return `${countryCode}${digitsOnly.substring(1)}`;
  }

  return `${countryCode}${digitsOnly}`;
}

export const sendVerification = onCall(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'] },
  async (request) => {
  const data = request.data as SendVerificationRequest;
  const { phoneNumber, countryCode, isSignUp } = data;

  if (!phoneNumber || !countryCode || typeof isSignUp !== 'boolean') {
    throw new HttpsError(
      'invalid-argument',
      'Phone number, country code, and isSignUp flag are required'
    );
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber, countryCode);
  const localFormat = normalizedPhone.replace(countryCode, '0');

  console.log(`Original phone: ${phoneNumber}, Country code: ${countryCode}, Normalized: ${normalizedPhone}, IsSignUp: ${isSignUp}`);

  const usersRef = db.collection('users');
  const [q1, q2, q3] = await Promise.all([
    usersRef.where('phone', '==', normalizedPhone).limit(1).get(),
    usersRef.where('phone', '==', phoneNumber).limit(1).get(),
    usersRef.where('phone', '==', localFormat).limit(1).get(),
  ]);

  const phoneExists = !q1.empty || !q2.empty || !q3.empty;

  if (isSignUp && phoneExists) {
    return {
      success: false,
      error: 'Phone number already registered. Please sign in instead.',
      code: 'PHONE_EXISTS',
    };
  }

  if (!isSignUp && !phoneExists) {
    return {
      success: false,
      error: 'Phone number not found. Please sign up first.',
      code: 'PHONE_NOT_FOUND',
    };
  }

  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
    console.error('Missing Twilio credentials');
    throw new HttpsError('internal', 'Twilio configuration missing');
  }

  const verificationUrl = `https://verify.twilio.com/v2/Services/${twilioVerifyServiceSid}/Verifications`;
  const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');

  const response = await fetch(verificationUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: normalizedPhone, Channel: 'sms' }).toString(),
  });

  const responseData = await response.json() as any;

  if (!response.ok) {
    console.error('Twilio error:', responseData);

    let errorMessage = 'Failed to send verification code';
    let errorCode: string | null = null;

    if (responseData.code === 21211 || responseData.message?.includes('invalid phone number')) {
      errorMessage = 'Invalid phone number format. Please check your number and try again.';
      errorCode = 'INVALID_PHONE_FORMAT';
    } else if (responseData.code === 21614 || responseData.message?.includes('not a valid phone number')) {
      errorMessage = 'This phone number is not valid. Please enter a correct phone number.';
      errorCode = 'INVALID_PHONE_NUMBER';
    } else if (responseData.code === 21608 || responseData.message?.includes('unsubscribed')) {
      errorMessage = 'This phone number has opted out of SMS messages.';
      errorCode = 'PHONE_UNSUBSCRIBED';
    } else if (responseData.message) {
      errorMessage = responseData.message;
    }

    return { success: false, error: errorMessage, code: errorCode };
  }

  console.log('Verification sent successfully:', responseData.sid);

  return {
    success: true,
    message: 'Verification code sent successfully',
    verificationSid: responseData.sid,
  };
  }
);
