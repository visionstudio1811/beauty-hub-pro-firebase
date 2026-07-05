import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { backfillClientFromSignedWaiver } from './backfillClient';
import { consumeRateLimit } from './rateLimit';
import { loadSecret } from './lib/integrationSecrets';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function loadOrgResendSender(orgId: string): Promise<{ apiKey: string; fromEmail: string; fromName: string } | null> {
  const snap = await db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc('resend')
    .get();
  if (!snap.exists || !snap.data()?.is_enabled) return null;
  const cfg = snap.data()!.configuration as { fromEmail?: string; fromName?: string };
  // apiKey from the write-only secret subdoc (legacy configuration.apiKey fallback).
  const { apiKey } = await loadSecret(orgId, 'resend', snap.data());
  if (!apiKey || !cfg.fromEmail) return null;
  return { apiKey, fromEmail: cfg.fromEmail, fromName: cfg.fromName || 'Beauty Hub Pro' };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeHttpUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * Fires when a waiver transitions from pending → signed and emails the
 * organization's contact address with the signed PDF attached.
 */
export const notifyOrgOnWaiverSigned = onDocumentUpdated(
  {
    document: 'organizations/{orgId}/clientWaivers/{waiverId}',
    secrets: ['RESEND_API_KEY'],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.status === 'signed' || after.status !== 'signed') return;

    const { orgId } = event.params as { orgId: string };

    // Load the organization to get contact email + name
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    if (!orgDoc.exists) return;
    const org = orgDoc.data()!;
    const orgEmail = org.email as string | undefined;
    const orgName = (org.name as string) ?? 'Your organization';
    if (!orgEmail) {
      console.warn(`Org ${orgId} has no email — skipping waiver notification`);
      return;
    }

    // Prefer per-org verified Resend sender; fall back to global secret + brand domain.
    const orgSender = await loadOrgResendSender(orgId);
    const resendKey = orgSender?.apiKey ?? process.env.RESEND_API_KEY;
    const fromEmail = orgSender?.fromEmail ?? 'noreply@beauty-hub-pro.com';
    const fromName  = orgSender?.fromName  ?? 'Beauty Hub Pro';
    if (!resendKey) {
      console.error('No Resend sender configured (per-org or global) — cannot email org on waiver sign');
      return;
    }

    // Cap at 500 admin notifications per org per day. Anything past that is a
    // form-submission flood and would burn Resend budget without staff value.
    try {
      await consumeRateLimit(orgId, 'waiverNotify', 500);
    } catch (err) {
      console.warn(`Daily waiverNotify limit reached for org ${orgId}; skipping notification.`, err);
      return;
    }

    // Load template title + kind for the email body
    let templateTitle = 'Waiver';
    let kind: 'waiver' | 'intake' | 'agreement' = (after.kind as 'waiver' | 'intake' | 'agreement') ?? 'waiver';
    if (after.templateId) {
      const tplDoc = await db.collection('organizations').doc(orgId).collection('waiverTemplates').doc(after.templateId).get();
      if (tplDoc.exists) {
        const td = tplDoc.data() ?? {};
        templateTitle = (td.title as string) ?? (kind === 'intake' ? 'Intake Form' : kind === 'agreement' ? 'Agreement of Purchase' : 'Waiver');
        if (!after.kind) kind = (td.kind as 'waiver' | 'intake' | 'agreement') ?? 'waiver';
      }
    }
    const kindNoun = kind === 'intake' ? 'intake form' : kind === 'agreement' ? 'Agreement of Purchase' : 'waiver';
    const kindNounUpper = kind === 'intake' ? 'Intake Form' : kind === 'agreement' ? 'Agreement of Purchase' : 'Waiver';

    const signerName = (after.signer_name as string) ?? 'A client';
    const signerEmail = (after.signer_email as string) ?? '';
    const signerPhone = (after.signer_phone as string) ?? '';
    const signedAt = (after.signed_at as string) ?? new Date().toISOString();
    const pdfUrl = (after.pdf_url as string) ?? '';
    const token = (after.token as string) ?? '';
    const answers = (after.answers as Record<string, unknown>) ?? {};

    // Collect uploaded image URLs from answers (image_upload blocks store arrays of URLs)
    const imageUrls: string[] = [];
    for (const value of Object.values(answers)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          if (typeof v === 'string' && /^https?:\/\//.test(v)) imageUrls.push(v);
        }
      }
    }

    // Download the PDF from Storage for attachment
    let attachment: { filename: string; content: string } | null = null;
    if (token) {
      try {
        const file = bucket.file(`waivers/${token}.pdf`);
        const [buffer] = await file.download();
        attachment = {
          filename: `${templateTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}-${signerName.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`,
          content: buffer.toString('base64'),
        };
      } catch (err) {
        console.error('Could not download PDF for attachment:', err);
      }
    }

    // Header-safe versions for the Subject line: strip CR/LF (header-injection
    // guard) and cap length. Signer/template-controlled values only.
    const headerSafe = (value: string) => value.replace(/[\r\n]+/g, ' ').slice(0, 120);
    const subjectTitle = headerSafe(templateTitle);
    const subjectSignerName = headerSafe(signerName);

    const safeOrgName = escapeHtml(orgName);
    const safeTitle = escapeHtml(templateTitle);
    const safeSignerName = escapeHtml(signerName);
    const safeSignerEmail = escapeHtml(signerEmail);
    const safeSignerPhone = escapeHtml(signerPhone);
    const safePdfUrl = safeHttpUrl(pdfUrl);
    const safeImageUrls = imageUrls.map(safeHttpUrl).filter(Boolean);

    const imagesHtml = safeImageUrls.length
      ? `<p><strong>Uploaded photos (${safeImageUrls.length}):</strong></p><ul>${safeImageUrls
          .map((u, i) => `<li><a href="${escapeHtml(u)}">Photo ${i + 1}</a></li>`)
          .join('')}</ul>`
      : '';

    const body = {
      from: `${fromName} <${fromEmail}>`,
      to: [orgEmail],
      subject: `✅ Signed ${kindNoun}: ${subjectTitle} — ${subjectSignerName}`,
      html: `
        <p>A client has signed a ${kindNoun} for <strong>${safeOrgName}</strong>.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px;color:#6b7280">${kindNounUpper}</td><td style="padding:4px 12px"><strong>${safeTitle}</strong></td></tr>
          <tr><td style="padding:4px 12px;color:#6b7280">Client</td><td style="padding:4px 12px">${safeSignerName}</td></tr>
          ${safeSignerEmail ? `<tr><td style="padding:4px 12px;color:#6b7280">Email</td><td style="padding:4px 12px">${safeSignerEmail}</td></tr>` : ''}
          ${safeSignerPhone ? `<tr><td style="padding:4px 12px;color:#6b7280">Phone</td><td style="padding:4px 12px">${safeSignerPhone}</td></tr>` : ''}
          <tr><td style="padding:4px 12px;color:#6b7280">Signed</td><td style="padding:4px 12px">${escapeHtml(new Date(signedAt).toLocaleString())}</td></tr>
        </table>
        <p>The signed PDF is attached${safeImageUrls.length ? ` and any uploaded photos are linked below` : ''}.</p>
        ${imagesHtml}
        ${safePdfUrl ? `<p style="margin-top:24px"><a href="${escapeHtml(safePdfUrl)}">View the PDF online →</a></p>` : ''}
      `,
      ...(attachment ? { attachments: [attachment] } : {}),
    };

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      console.error('Failed to notify org on waiver sign:', await resp.text());
    }

    // ── Backfill empty client fields from the signed form ──────────────
    // Only fills fields that are currently empty on the client card —
    // never overwrites values the salon has already entered.
    const clientId = (after.clientId as string) ?? '';
    if (!clientId) return;

    try {
      const result = await backfillClientFromSignedWaiver(orgId, clientId, {
        signer_name:  signerName,
        signer_email: signerEmail,
        signer_phone: signerPhone,
        answers,
        templateId:   after.templateId as string | undefined,
        kind,
      });
      if (result.filled.length > 0) {
        console.log(`Backfilled ${result.filled.length} field(s) on client ${clientId} from ${kindNoun}: ${result.filled.join(', ')}`);
      }
    } catch (err) {
      // Backfill is best-effort — don't fail the whole trigger
      console.error('Client backfill failed:', err);
    }
  }
);
