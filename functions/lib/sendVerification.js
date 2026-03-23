"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerification = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
function normalizePhoneNumber(phone, countryCode) {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.startsWith(countryCode.replace('+', ''))) {
        return `+${digitsOnly}`;
    }
    if (digitsOnly.startsWith('0')) {
        return `${countryCode}${digitsOnly.substring(1)}`;
    }
    return `${countryCode}${digitsOnly}`;
}
exports.sendVerification = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c;
    const data = request.data;
    const { phoneNumber, countryCode, isSignUp } = data;
    if (!phoneNumber || !countryCode || typeof isSignUp !== 'boolean') {
        throw new https_1.HttpsError('invalid-argument', 'Phone number, country code, and isSignUp flag are required');
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
        throw new https_1.HttpsError('internal', 'Twilio configuration missing');
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
    const responseData = await response.json();
    if (!response.ok) {
        console.error('Twilio error:', responseData);
        let errorMessage = 'Failed to send verification code';
        let errorCode = null;
        if (responseData.code === 21211 || ((_a = responseData.message) === null || _a === void 0 ? void 0 : _a.includes('invalid phone number'))) {
            errorMessage = 'Invalid phone number format. Please check your number and try again.';
            errorCode = 'INVALID_PHONE_FORMAT';
        }
        else if (responseData.code === 21614 || ((_b = responseData.message) === null || _b === void 0 ? void 0 : _b.includes('not a valid phone number'))) {
            errorMessage = 'This phone number is not valid. Please enter a correct phone number.';
            errorCode = 'INVALID_PHONE_NUMBER';
        }
        else if (responseData.code === 21608 || ((_c = responseData.message) === null || _c === void 0 ? void 0 : _c.includes('unsubscribed'))) {
            errorMessage = 'This phone number has opted out of SMS messages.';
            errorCode = 'PHONE_UNSUBSCRIBED';
        }
        else if (responseData.message) {
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
});
//# sourceMappingURL=sendVerification.js.map