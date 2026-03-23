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
exports.verifyOtp = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.verifyOtp = (0, https_1.onCall)(async (request) => {
    const data = request.data;
    const { phoneNumber, code, isSignUp = false, fullName } = data;
    if (!phoneNumber || !code) {
        throw new https_1.HttpsError('invalid-argument', 'Phone number and verification code are required');
    }
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!twilioAccountSid || !twilioAuthToken || !twilioVerifyServiceSid) {
        console.error('Missing Twilio credentials');
        throw new https_1.HttpsError('internal', 'Twilio configuration missing');
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
    const verificationData = await response.json();
    if (!response.ok || verificationData.status !== 'approved') {
        console.error('Twilio verification failed:', verificationData);
        return { success: false, error: 'Invalid verification code' };
    }
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('phone', '==', phoneNumber).limit(1).get();
    let uid;
    if (!snapshot.empty) {
        uid = snapshot.docs[0].id;
        console.log('Signing in existing user:', uid);
    }
    else if (isSignUp) {
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
        }
        catch (err) {
            console.error('Error creating user:', err);
            throw new https_1.HttpsError('internal', 'Failed to create user account');
        }
    }
    else {
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
});
//# sourceMappingURL=verifyOtp.js.map