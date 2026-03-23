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
exports.sendWaiver = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("crypto");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.sendWaiver = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Unauthorized');
    }
    const uid = request.auth.uid;
    const data = request.data;
    const { clientId, organizationId, templateId, siteUrl } = data;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.organizationId) !== organizationId) {
        throw new https_1.HttpsError('permission-denied', 'Forbidden: Organization mismatch');
    }
    const clientDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('clients')
        .doc(clientId)
        .get();
    if (!clientDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Client not found');
    }
    const client = clientDoc.data();
    if (!client.phone) {
        throw new https_1.HttpsError('failed-precondition', 'Client has no phone number on file');
    }
    const templateDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('waiverTemplates')
        .doc(templateId)
        .get();
    if (!templateDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Template not found');
    }
    const token = (0, crypto_1.randomUUID)();
    const waiverRef = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('clientWaivers')
        .add({
        clientId,
        templateId,
        status: 'pending',
        token,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection('waiverTokens').doc(token).set({
        waiverId: waiverRef.id,
        organizationId,
        clientId,
        templateId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const base = siteUrl || process.env.SITE_URL || 'https://beauty-hub-pro-app.web.app';
    const waiverUrl = `${base}/waiver/${token}`;
    const twilioSnapshot = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('marketingIntegrations')
        .where('provider', '==', 'twilio')
        .where('is_enabled', '==', true)
        .limit(1)
        .get();
    if (twilioSnapshot.empty) {
        return {
            success: false,
            error: 'Twilio integration not configured or disabled. Please set it up in Settings > Marketing.',
            waiver_token: token,
            waiver_url: waiverUrl,
        };
    }
    const twilioConfig = twilioSnapshot.docs[0].data().configuration;
    if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.phoneNumber) {
        return {
            success: false,
            error: 'Twilio credentials incomplete',
            waiver_token: token,
            waiver_url: waiverUrl,
        };
    }
    const firstName = ((_b = client.name) === null || _b === void 0 ? void 0 : _b.split(' ')[0]) || 'there';
    const messageBody = `Hi ${firstName}, please sign your waiver here: ${waiverUrl}`;
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`;
    const credentials = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString('base64');
    const twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            From: twilioConfig.phoneNumber,
            To: client.phone,
            Body: messageBody,
        }).toString(),
    });
    const twilioData = await twilioResponse.json();
    if (!twilioResponse.ok) {
        console.error('Twilio error:', twilioData);
        return {
            success: false,
            error: `Twilio error: ${twilioData.message || 'Unknown error'}`,
            waiver_token: token,
            waiver_url: waiverUrl,
        };
    }
    return {
        success: true,
        message: `Waiver SMS sent to ${client.phone}`,
        waiver_token: token,
        waiver_url: waiverUrl,
        sms_sid: twilioData.sid,
    };
});
//# sourceMappingURL=sendWaiver.js.map