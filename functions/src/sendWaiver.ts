import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import { consumeRateLimit } from './rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const WAIVER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

type SendMode = 'sms' | 'email' | 'device';

interface SendWaiverRequest {
  clientId: string;
  organizationId: string;
  templateId: string;
  siteUrl?: string;
  mode?: SendMode; // default: 'sms'
}

// Resend is used for email mode. Twilio creds come from Firestore (marketingIntegrations), not secrets.
export const sendWaiver = onCall(
  { secrets: ['RESEND_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Unauthorized');
    }

    const uid = request.auth.uid;
    const data = request.data as SendWaiverRequest;
    const { clientId, organizationId, templateId, siteUrl } = data;
    const mode: SendMode = data.mode ?? 'sms';

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

    // Per-org daily cap: blocks runaway loops and SMS/email spend abuse.
    await consumeRateLimit(organizationId, 'waiverSend', 200);

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

    // Validate per-mode requirements before creating any records
    if (mode === 'sms' && !client.phone) {
      throw new HttpsError('failed-precondition', 'Client has no phone number on file');
    }
    if (mode === 'email' && !client.email) {
      throw new HttpsError('failed-precondition', 'Client has no email on file');
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

    const templateData = templateDoc.data() ?? {};
    const templateTitle = (templateData.title as string) ?? 'Waiver';
    const templateKind = (templateData.kind as 'waiver' | 'intake') ?? 'waiver';
    const kindLabel = templateKind === 'intake' ? 'intake form' : 'waiver';
    const kindAction = templateKind === 'intake' ? 'fill out' : 'sign';

    // Generate cryptographically secure token (128 bits)
    const token = randomUUID();

    const waiverRef = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('clientWaivers')
      .add({
        clientId,
        templateId,
        kind: templateKind,
        clientName: client.name ?? '',
        clientEmail: client.email ?? '',
        clientPhone: client.phone ?? '',
        status: 'pending',
        token,
        sentBy: uid,
        sentVia: mode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await db.collection('waiverTokens').doc(token).set({
      waiverId: waiverRef.id,
      organizationId,
      clientId,
      templateId,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + WAIVER_TOKEN_TTL_MS),
    });

    const base = siteUrl || process.env.SITE_URL || 'https://beauty-hub-pro-app.web.app';
    const waiverUrl = `${base}/waiver/${token}`;
    const firstName = client.name?.split(' ')[0] || 'there';

    // Mode: device — admin just opens the URL themselves on a tablet. No send.
    if (mode === 'device') {
      return {
        success: true,
        message: 'Waiver ready — open the link on your device',
        waiver_token: token,
        waiver_url: waiverUrl,
      };
    }

    // Mode: email — use Resend
    if (mode === 'email') {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        return {
          success: false,
          error: 'Email service not configured (missing RESEND_API_KEY)',
          waiver_token: token,
          waiver_url: waiverUrl,
        };
      }

      const orgDoc = await db.collection('organizations').doc(organizationId).get();
      const orgName = (orgDoc.data()?.name as string) ?? 'Your salon';

      const safeFirstName = escapeHtml(firstName);
      const safeOrgName = escapeHtml(orgName);
      const safeTitle = escapeHtml(templateTitle);
      const safeUrl = encodeURI(waiverUrl);

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Beauty Hub Pro <noreply@beauty-hub-pro.com>',
          to: [client.email],
          subject: `Please ${kindAction} your ${kindLabel} for ${orgName}`,
          html: `
            <p>Hi ${safeFirstName},</p>
            <p>${safeOrgName} has sent you a <strong>${safeTitle}</strong> to ${kindAction} before your appointment.</p>
            <p><a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open ${templateKind === 'intake' ? 'form' : 'waiver'}</a></p>
            <p>Or copy this link: <br/><a href="${safeUrl}">${safeUrl}</a></p>
            <p style="color:#6b7280;font-size:13px">This link is unique to you — please do not share it.</p>
          `,
        }),
      });

      if (!resendResponse.ok) {
        const errText = await resendResponse.text();
        return {
          success: false,
          error: `Failed to send waiver email: ${errText}`,
          waiver_token: token,
          waiver_url: waiverUrl,
        };
      }

      return {
        success: true,
        message: 'Waiver email sent successfully',
        waiver_token: token,
        waiver_url: waiverUrl,
      };
    }

    // Mode: sms — existing Twilio flow
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

    const messageBody = `Hi ${firstName}, please ${kindAction} your ${kindLabel} here: ${waiverUrl}`;

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
