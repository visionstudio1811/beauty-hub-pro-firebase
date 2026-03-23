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
exports.sendClientEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
function renderTemplate(html, variables) {
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
exports.sendClientEmail = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Unauthorized');
    }
    const uid = request.auth.uid;
    const data = request.data;
    const { to, subject, message, clientId, organizationId, templateType = 'general', variables = {} } = data;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.organizationId) !== organizationId) {
        throw new https_1.HttpsError('permission-denied', 'Forbidden: Organization mismatch');
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
        throw new https_1.HttpsError('not-found', 'No email configuration found for this organization. Please configure Resend integration first.');
    }
    const emailConfig = configSnapshot.docs[0].data();
    const config = emailConfig.configuration;
    const fromName = config.fromName || 'Beauty Hub Pro';
    const fromEmail = config.fromEmail || 'info@beautyhubpro.com';
    const apiKey = config.apiKey;
    if (!apiKey) {
        throw new https_1.HttpsError('internal', 'No API key found in organization email configuration');
    }
    const orgDoc = await db.collection('organizations').doc(organizationId).get();
    const orgData = orgDoc.data() || {};
    let clientData = null;
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
        throw new https_1.HttpsError('not-found', `Email template '${templateType}' not found and no fallback template available`);
    }
    const templateVariables = Object.assign(Object.assign({ subject, message: message.replace(/\n/g, '<br>'), client_name: (clientData === null || clientData === void 0 ? void 0 : clientData.name) || to.split('@')[0], organization_name: orgData.name || fromName, organization_phone: orgData.phone || '', organization_address: orgData.address || '', logo_url: orgData.logo_url || '', sender_name: fromName, from_email: fromEmail, date: new Date().toLocaleDateString(), datetime: new Date().toLocaleString() }, template.settings), variables);
    const emailHtml = renderTemplate(template.html, templateVariables);
    const resend = new resend_1.Resend(apiKey);
    const emailResponse = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html: emailHtml,
    });
    if (emailResponse.error) {
        console.error('Resend error:', emailResponse.error);
        throw new https_1.HttpsError('internal', `Failed to send email: ${JSON.stringify(emailResponse.error)}`);
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
        messageId: (_b = emailResponse.data) === null || _b === void 0 ? void 0 : _b.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
        success: true,
        messageId: (_c = emailResponse.data) === null || _c === void 0 ? void 0 : _c.id,
        message: 'Email sent successfully',
    };
});
//# sourceMappingURL=sendClientEmail.js.map