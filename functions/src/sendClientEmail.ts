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
  fromName?: string;
  fromEmail?: string;
  templateType?: string;
  variables?: Record<string, any>;
}

function renderTemplate(html: string, variables: Record<string, any>): string {
  let rendered = html;

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, String(value || ''));
  }

  rendered = rendered.replace(/{{#if\s+(\w+)}}(.*?){{\/if}}/g, (_match, varName, content) => {
    return variables[varName] ? content : '';
  });

  rendered = rendered.replace(/{{[^}]*}}/g, '');

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

  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists || userDoc.data()?.organizationId !== organizationId) {
    throw new HttpsError('permission-denied', 'Forbidden: Organization mismatch');
  }

  console.log('Sending email to:', to, 'Subject:', subject);
  console.log('Organization ID:', organizationId, 'Template Type:', templateType);

  const configSnapshot = await db
    .collection('organizations')
    .doc(organizationId)
    .collection('marketingIntegrations')
    .where('provider', '==', 'resend')
    .where('is_enabled', '==', true)
    .limit(1)
    .get();

  if (configSnapshot.empty) {
    throw new HttpsError(
      'not-found',
      'No email configuration found for this organization. Please configure Resend integration first.'
    );
  }

  const emailConfig = configSnapshot.docs[0].data();
  const config = emailConfig.configuration as any;
  const fromName = config.fromName || 'Beauty Hub Pro';
  const fromEmail = config.fromEmail || 'info@beautyhubpro.com';
  const apiKey = config.apiKey;

  if (!apiKey) {
    throw new HttpsError('internal', 'No API key found in organization email configuration');
  }

  const orgDoc = await db.collection('organizations').doc(organizationId).get();
  const orgData = orgDoc.data() || {};

  let clientData: any = null;
  if (clientId) {
    const clientDoc = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('clients')
      .doc(clientId)
      .get();
    if (clientDoc.exists) {
      clientData = clientDoc.data();
    }
  }

  const emailTemplates = emailConfig.email_templates || {};
  const template = emailTemplates[templateType] || emailTemplates['general'] || emailTemplates['default'];

  if (!template) {
    throw new HttpsError(
      'not-found',
      `Email template '${templateType}' not found and no fallback template available`
    );
  }

  const templateVariables = {
    subject,
    message: message.replace(/\n/g, '<br>'),
    client_name: clientData?.name || to.split('@')[0],
    organization_name: orgData.name || fromName,
    organization_phone: orgData.phone || '',
    organization_address: orgData.address || '',
    logo_url: orgData.logo_url || '',
    sender_name: fromName,
    from_email: fromEmail,
    date: new Date().toLocaleDateString(),
    datetime: new Date().toLocaleString(),
    ...template.settings,
    ...variables,
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
    console.error('Resend error:', emailResponse.error);
    throw new HttpsError('internal', `Failed to send email: ${JSON.stringify(emailResponse.error)}`);
  }

  console.log('Email sent successfully:', emailResponse.data);

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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return {
    success: true,
    messageId: emailResponse.data?.id,
    message: 'Email sent successfully',
  };
  }
);
