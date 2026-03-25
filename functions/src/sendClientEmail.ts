import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface EmailRequest {
  to: string;
  subject: string;
  message: string;
  clientId: string;
  organizationId: string;
  templateType?: string;
  variables?: Record<string, string>;
}

interface EmailConfig {
  fromName?: string;
  fromEmail?: string;
  apiKey?: string;
}

/** Escape HTML entities to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTemplate(html: string, variables: Record<string, string>): string {
  let rendered = html;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    // Escape all variable values before injection to prevent HTML injection
    rendered = rendered.replace(regex, escapeHtml(String(value ?? '')));
  }

  rendered = rendered.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, varName, content) => {
    return variables[varName] ? content : '';
  });

  // Remove any remaining unresolved placeholders
  rendered = rendered.replace(/\{\{[^}]*\}\}/g, '');

  return rendered;
}

export const sendClientEmail = onCall(
  { secrets: ['RESEND_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Unauthorized');
    }

    const uid = request.auth.uid;
    const data = request.data as EmailRequest;
    const { to, subject, message, clientId, organizationId, templateType = 'general', variables = {} } = data;

    // Input validation
    if (!to || !subject || !organizationId) {
      throw new HttpsError('invalid-argument', 'Missing required fields: to, subject, organizationId');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new HttpsError('invalid-argument', 'Invalid recipient email address');
    }
    if (subject.length > 200) {
      throw new HttpsError('invalid-argument', 'Subject too long (max 200 characters)');
    }

    // Verify user belongs to organization AND has staff/admin role
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      throw new HttpsError('permission-denied', 'User not found');
    }
    const userData = userDoc.data()!;
    if (userData.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Organization mismatch');
    }
    if (!['admin', 'staff'].includes(userData.role)) {
      throw new HttpsError('permission-denied', 'Staff or admin access required to send emails');
    }

    const configSnapshot = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('marketingIntegrations')
      .where('provider', '==', 'resend')
      .where('is_enabled', '==', true)
      .limit(1)
      .get();

    if (configSnapshot.empty) {
      throw new HttpsError('not-found', 'No email configuration found. Please configure Resend integration in Settings.');
    }

    const emailConfig = configSnapshot.docs[0].data();
    const config = emailConfig.configuration as EmailConfig;
    const fromName = config.fromName || 'Beauty Hub Pro';
    const fromEmail = config.fromEmail || 'info@beautyhubpro.com';
    const apiKey = config.apiKey;

    if (!apiKey) {
      throw new HttpsError('internal', 'Email API key not configured');
    }

    const orgDoc = await db.collection('organizations').doc(organizationId).get();
    const orgData = orgDoc.data() || {};

    let clientName = to.split('@')[0];
    if (clientId) {
      const clientDoc = await db
        .collection('organizations')
        .doc(organizationId)
        .collection('clients')
        .doc(clientId)
        .get();
      if (clientDoc.exists) {
        clientName = clientDoc.data()?.name || clientName;
      }
    }

    const emailTemplates = emailConfig.email_templates || {};
    const template = emailTemplates[templateType] || emailTemplates['general'] || emailTemplates['default'];

    if (!template) {
      throw new HttpsError('not-found', `Email template '${templateType}' not found`);
    }

    // All values in templateVariables must be strings (enforced by type)
    const orgTimezone = orgData.timezone || 'America/New_York';
    const templateVariables: Record<string, string> = {
      subject,
      message: message.replace(/\n/g, '<br>'),
      client_name: clientName,
      organization_name: String(orgData.name || fromName),
      organization_phone: String(orgData.phone || ''),
      organization_address: String(orgData.address || ''),
      sender_name: fromName,
      from_email: fromEmail,
      date: new Date().toLocaleDateString('en-US', { timeZone: orgTimezone }),
      datetime: new Date().toLocaleString('en-US', { timeZone: orgTimezone }),
      ...Object.fromEntries(
        Object.entries(variables).map(([k, v]) => [k, String(v ?? '')])
      ),
    };

    const emailHtml = renderTemplate(template.html, templateVariables);

    const resend = new Resend(apiKey);
    const emailResponse = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html: emailHtml,
    });

    if (emailResponse.error) {
      throw new HttpsError('internal', 'Failed to send email');
    }

    await db
      .collection('organizations')
      .doc(organizationId)
      .collection('clientCommunications')
      .add({
        clientId,
        type: 'email',
        status: 'delivered',
        subject,
        to,
        messageId: emailResponse.data?.id,
        sentBy: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: true, messageId: emailResponse.data?.id, message: 'Email sent successfully' };
  }
);
