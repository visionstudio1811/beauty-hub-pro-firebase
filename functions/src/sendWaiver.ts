import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID, randomInt } from 'crypto';
import { consumeRateLimit } from './rateLimit';
import { sendSms, SmsProvider } from './lib/smsProviders';
import { loadSecret } from './lib/integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const WAIVER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

type SendMode = 'sms' | 'email' | 'device';

interface SendWaiverRequest {
  clientId: string;
  organizationId: string;
  templateId: string;
  siteUrl?: string;
  mode?: SendMode;
  smsProvider?: SmsProvider;
  requiresOtp?: boolean;
  purchaseId?: string;
}

interface PurchaseSnapshot {
  purchaseId: string;
  packageId: string;
  packageName: string;
  packagePrice: number;
  packageSessions: number;
  purchaseDate: string;
  expiryDate: string;
}

async function loadPurchaseSnapshot(
  orgId: string,
  purchaseId: string,
): Promise<PurchaseSnapshot | null> {
  const purchaseSnap = await db
    .collection('organizations').doc(orgId)
    .collection('purchases').doc(purchaseId)
    .get();
  if (!purchaseSnap.exists) return null;
  const purchase = purchaseSnap.data()!;

  let packageName = '';
  let packageSessions = 0;
  if (purchase.package_id) {
    const pkgSnap = await db
      .collection('organizations').doc(orgId)
      .collection('packages').doc(purchase.package_id)
      .get();
    if (pkgSnap.exists) {
      const pkg = pkgSnap.data()!;
      packageName = pkg.name ?? '';
      packageSessions = pkg.total_sessions ?? 0;
    }
  }

  return {
    purchaseId,
    packageId: purchase.package_id ?? '',
    packageName,
    packagePrice: purchase.total_amount ?? 0,
    packageSessions: purchase.sessions_remaining ?? packageSessions,
    purchaseDate: purchase.purchase_date ?? '',
    expiryDate: purchase.expiry_date ?? '',
  };
}

export const sendWaiver = onCall(
  { secrets: ['RESEND_API_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

    const uid = request.auth.uid;
    const data = request.data as SendWaiverRequest;
    const { clientId, organizationId, templateId, siteUrl } = data;
    const mode: SendMode = data.mode ?? 'sms';
    const smsProvider: SmsProvider = data.smsProvider ?? 'twilio';
    const requiresOtp: boolean = data.requiresOtp ?? false;

    if (!clientId || !organizationId || !templateId)
      throw new HttpsError('invalid-argument', 'clientId, organizationId, and templateId are required');

    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
    const userData = userDoc.data()!;
    if (userData.organizationId !== organizationId)
      throw new HttpsError('permission-denied', 'Organization mismatch');
    if (!['admin', 'staff', 'reception'].includes(userData.role))
      throw new HttpsError('permission-denied', 'Reception, staff, or admin access required');

    await consumeRateLimit(organizationId, 'waiverSend', 200);

    const clientDoc = await db.collection('organizations').doc(organizationId).collection('clients').doc(clientId).get();
    if (!clientDoc.exists) throw new HttpsError('not-found', 'Client not found');
    const client = clientDoc.data()!;

    if (mode === 'sms' && !client.phone)
      throw new HttpsError('failed-precondition', 'Client has no phone number on file');
    if (mode === 'email' && !client.email)
      throw new HttpsError('failed-precondition', 'Client has no email on file');

    const templateDoc = await db.collection('organizations').doc(organizationId).collection('waiverTemplates').doc(templateId).get();
    if (!templateDoc.exists) throw new HttpsError('not-found', 'Template not found');

    const templateData = templateDoc.data() ?? {};
    const templateTitle = (templateData.title as string) ?? 'Waiver';
    const templateKind = (templateData.kind as 'waiver' | 'intake' | 'agreement') ?? 'waiver';
    const kindLabel =
      templateKind === 'intake' ? 'intake form'
      : templateKind === 'agreement' ? 'agreement'
      : 'waiver';
    const kindAction = templateKind === 'intake' ? 'fill out' : 'sign';

    const purchaseSnapshot = data.purchaseId
      ? await loadPurchaseSnapshot(organizationId, data.purchaseId)
      : null;
    if (data.purchaseId && !purchaseSnapshot)
      throw new HttpsError('not-found', 'Purchase not found');

    const token = randomUUID();

    const waiverRef = await db.collection('organizations').doc(organizationId).collection('clientWaivers').add({
      clientId, templateId,
      kind: templateKind,
      clientName: client.name ?? '',
      clientEmail: client.email ?? '',
      clientPhone: client.phone ?? '',
      clientBirthday: client.birthday ?? client.dateOfBirth ?? '',
      clientAge: client.age ?? null,
      clientAddress: client.address ?? '',
      clientGender: client.gender ?? '',
      clientCity: client.city ?? '',
      clientReferralSource: client.referral_source ?? client.referralSource ?? '',
      ...(purchaseSnapshot ? {
        purchaseId: purchaseSnapshot.purchaseId,
        packageId: purchaseSnapshot.packageId,
        packageName: purchaseSnapshot.packageName,
        packagePrice: purchaseSnapshot.packagePrice,
        packageSessions: purchaseSnapshot.packageSessions,
        purchaseDate: purchaseSnapshot.purchaseDate,
        expiryDate: purchaseSnapshot.expiryDate,
      } : {}),
      status: 'pending',
      token,
      sentBy: uid,
      sentVia: mode === 'sms' ? smsProvider : mode,
      requiresOtp: mode === 'sms' && requiresOtp,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('waiverTokens').doc(token).set({
      waiverId: waiverRef.id,
      organizationId,
      clientId,
      templateId,
      status: 'pending',
      requiresOtp: mode === 'sms' && requiresOtp,
      otpVerified: mode === 'sms' && requiresOtp ? false : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + WAIVER_TOKEN_TTL_MS),
    });

    const base = siteUrl || process.env.SITE_URL || 'https://beauty-hub-pro-app.web.app';
    const waiverUrl = `${base}/waiver/${token}`;
    const firstName = client.name?.split(' ')[0] || 'there';

    if (mode === 'device') {
      return { success: true, message: 'Waiver ready — open the link on your device', waiver_token: token, waiver_url: waiverUrl };
    }

    if (mode === 'email') {
      // Prefer per-org Resend config; fall back to global secret
      let resendKey: string | undefined;
      let fromEmail = 'noreply@beauty-hub-pro.com';
      let fromName = 'Beauty Hub Pro';

      const orgIntegrationSnap = await db
        .collection('organizations').doc(organizationId)
        .collection('marketingIntegrations').doc('resend')
        .get();

      if (orgIntegrationSnap.exists && orgIntegrationSnap.data()?.is_enabled) {
        const cfg = orgIntegrationSnap.data()!.configuration as { fromEmail?: string; fromName?: string };
        // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
        const secret = await loadSecret(organizationId, 'resend', orgIntegrationSnap.data());
        if (secret.apiKey) resendKey = secret.apiKey;
        if (cfg.fromEmail) fromEmail = cfg.fromEmail;
        if (cfg.fromName) fromName = cfg.fromName;
      }

      if (!resendKey) resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return { success: false, error: 'Email service not configured', waiver_token: token, waiver_url: waiverUrl };

      const orgDoc = await db.collection('organizations').doc(organizationId).get();
      const orgName = (orgDoc.data()?.name as string) ?? fromName;
      const safeFirstName = escapeHtml(firstName);
      const safeOrgName = escapeHtml(orgName);
      const safeTitle = escapeHtml(templateTitle);
      const safeUrl = encodeURI(waiverUrl);

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [client.email],
          subject: `Please ${kindAction} your ${kindLabel} for ${orgName}`,
          html: `<p>Hi ${safeFirstName},</p><p>${safeOrgName} has sent you a <strong>${safeTitle}</strong> to ${kindAction} before your appointment.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open ${templateKind === 'intake' ? 'form' : 'waiver'}</a></p><p>Or copy this link:<br/><a href="${safeUrl}">${safeUrl}</a></p><p style="color:#6b7280;font-size:13px">This link is unique to you — please do not share it.</p>`,
        }),
      });
      if (!resendResponse.ok) return { success: false, error: `Failed to send email: ${await resendResponse.text()}`, waiver_token: token, waiver_url: waiverUrl };
      return { success: true, message: 'Email sent successfully', waiver_token: token, waiver_url: waiverUrl };
    }

    // SMS mode — build message, optionally with OTP
    let otpCode: string | null = null;
    if (requiresOtp) {
      otpCode = randomInt(100000, 999999).toString();
      // Store OTP in a separate collection (admin-only read)
      await db.collection('otpCodes').doc(token).set({
        code: otpCode,
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
        attempts: 0,
        verified: false,
      });
    }

    const orgDoc = await db.collection('organizations').doc(organizationId).get();
    const orgName = (orgDoc.data()?.name as string) ?? 'your salon';

    const messageBody = requiresOtp && otpCode
      ? `Hi ${firstName}, your verification code for ${orgName} is: ${otpCode}\n\n${kindAction === 'fill out' ? 'Fill out' : 'Sign'} your ${kindLabel} here: ${waiverUrl}\n\nCode expires in 10 minutes.`
      : `Hi ${firstName}, please ${kindAction} your ${kindLabel} for ${orgName} here: ${waiverUrl}`;

    try {
      await sendSms(organizationId, client.phone, messageBody, smsProvider);
      return { success: true, message: `SMS sent via ${smsProvider}`, waiver_token: token, waiver_url: waiverUrl };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), waiver_token: token, waiver_url: waiverUrl };
    }
  }
);
