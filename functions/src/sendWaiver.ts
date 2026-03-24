import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface SendWaiverRequest {
  clientId: string;
  organizationId: string;
  templateId: string;
  siteUrl?: string;
}

export const sendWaiver = onCall(
  { secrets: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Unauthorized');
    }

    const uid = request.auth.uid;
    const data = request.data as SendWaiverRequest;
    const { clientId, organizationId, templateId, siteUrl } = data;

    if (!clientId || !organizationId || !templateId) {
      throw new HttpsError('invalid-argument', 'clientId, organizationId, and templateId are required');
    }

    // Verify user belongs to organization AND has reception/staff/admin role
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      throw new HttpsError('permission-denied', 'User not found');
    }
    const userData = userDoc.data()!;
    if (userData.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Organization mismatch');
    }
    if (!['admin', 'staff', 'reception'].includes(userData.role)) {
      throw new HttpsError('permission-denied', 'Reception, staff, or admin access required');
    }

    const clientDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('clients')
      .doc(clientId)
      .get();

    if (!clientDoc.exists) {
      throw new HttpsError('not-found', 'Client not found');
    }

    const client = clientDoc.data()!;
    if (!client.phone) {
      throw new HttpsError('failed-precondition', 'Client has no phone number on file');
    }

    const templateDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('waiverTemplates')
      .doc(templateId)
      .get();

    if (!templateDoc.exists) {
      throw new HttpsError('not-found', 'Template not found');
    }

    // Generate cryptographically secure token (128 bits)
    const token = randomUUID();

    const waiverRef = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('clientWaivers')
      .add({
        clientId,
        templateId,
        status: 'pending',
        token,
        sentBy: uid,
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
        error: 'Twilio integration not configured. Please set it up in Settings > Marketing.',
        waiver_token: token,
        waiver_url: waiverUrl,
      };
    }

    const twilioConfig = twilioSnapshot.docs[0].data().configuration as {
      accountSid: string;
      authToken: string;
      phoneNumber: string;
    };

    if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.phoneNumber) {
      return {
        success: false,
        error: 'Twilio credentials incomplete',
        waiver_token: token,
        waiver_url: waiverUrl,
      };
    }

    const firstName = client.name?.split(' ')[0] || 'there';
    const messageBody = `Hi ${firstName}, please sign your waiver here: ${waiverUrl}`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`;
    const credentials = Buffer.from(`${twilioConfig.accountSid}:${twilioConfig.authToken}`).toString('base64');

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        From: twilioConfig.phoneNumber,
        To: client.phone,
        Body: messageBody,
      }).toString(),
    });

    if (!twilioResponse.ok) {
      return {
        success: false,
        error: 'Failed to send waiver SMS',
        waiver_token: token,
        waiver_url: waiverUrl,
      };
    }

    return {
      success: true,
      message: 'Waiver SMS sent successfully',
      waiver_token: token,
      waiver_url: waiverUrl,
    };
  }
);
