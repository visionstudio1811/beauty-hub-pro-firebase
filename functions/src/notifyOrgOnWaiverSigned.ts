import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { backfillClientFromSignedWaiver } from './backfillClient';
import { consumeRateLimit } from './rateLimit';
import { loadSecret } from './lib/integrationSecrets';
import { defineStrings, makeT, orgLanguageFromData, htmlDirAttrs, formatDateTime } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

// This email goes to the org's own admins, so it follows the ORG language.
const STRINGS = defineStrings({
  en: {
    org_fallback: 'Your organization',
    signer_fallback: 'A client',
    title_waiver: 'Waiver',
    title_intake: 'Intake Form',
    title_agreement: 'Agreement of Purchase',
    // lower-case noun used mid-sentence
    kind_waiver: 'waiver',
    kind_intake: 'intake form',
    kind_agreement: 'Agreement of Purchase',
    subject: '✅ Signed {{kind}}: {{title}} — {{signer}}',
    intro: 'A client has signed a {{kind}} for <strong>{{org}}</strong>.',
    label_client: 'Client',
    label_email: 'Email',
    label_phone: 'Phone',
    label_signed: 'Signed',
    attached: 'The signed PDF is attached{{photos}}.',
    attached_photos_suffix: ' and any uploaded photos are linked below',
    photos_heading: 'Uploaded photos ({{count}}):',
    photo_n: 'Photo {{n}}',
    view_pdf: 'View the PDF online →',
  },
  he: {
    org_fallback: 'הארגון שלך',
    signer_fallback: 'לקוח/ה',
    title_waiver: 'כתב ויתור',
    title_intake: 'טופס קליטה',
    title_agreement: 'הסכם רכישה',
    kind_waiver: 'כתב ויתור',
    kind_intake: 'טופס קליטה',
    kind_agreement: 'הסכם רכישה',
    subject: '✅ {{kind}} נחתם: {{title}} — {{signer}}',
    intro: 'לקוח/ה חתם/ה על {{kind}} עבור <strong>{{org}}</strong>.',
    label_client: 'לקוח/ה',
    label_email: 'אימייל',
    label_phone: 'טלפון',
    label_signed: 'נחתם',
    attached: 'קובץ ה-PDF החתום מצורף{{photos}}.',
    attached_photos_suffix: ', וקישורים לתמונות שהועלו מופיעים למטה',
    photos_heading: 'תמונות שהועלו ({{count}}):',
    photo_n: 'תמונה {{n}}',
    view_pdf: '← צפייה ב-PDF אונליין',
  },
});

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
 * Attachment-filename sanitizer — unchanged ASCII-only behaviour (Resend/MIME
 * filename headers are safest in ASCII). `fallback` is used only when the
 * sanitized value has no letters/digits at all (e.g. a purely Hebrew title that
 * would otherwise collapse to underscores).
 */
function fileSafe(value: string, fallback: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, '_');
  return /[a-zA-Z0-9]/.test(safe) ? safe : fallback;
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
    const lang = orgLanguageFromData(org);
    const t = makeT(STRINGS, lang);
    const orgTz = (org.timezone as string) || 'America/New_York';
    const orgEmail = org.email as string | undefined;
    const orgName = (org.name as string) ?? t('org_fallback');
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
    let kind: 'waiver' | 'intake' | 'agreement' = (after.kind as 'waiver' | 'intake' | 'agreement') ?? 'waiver';
    const defaultTitleFor = (k: typeof kind) =>
      k === 'intake' ? t('title_intake') : k === 'agreement' ? t('title_agreement') : t('title_waiver');
    let templateTitle = t('title_waiver');
    if (after.templateId) {
      const tplDoc = await db.collection('organizations').doc(orgId).collection('waiverTemplates').doc(after.templateId).get();
      if (tplDoc.exists) {
        const td = tplDoc.data() ?? {};
        // Same order as before the i18n pass: the default title derives from
        // `after.kind` (pre-refinement), then `kind` is refined from the template.
        templateTitle = (td.title as string) ?? defaultTitleFor(kind);
        if (!after.kind) kind = (td.kind as 'waiver' | 'intake' | 'agreement') ?? 'waiver';
      }
    }
    const kindNoun = kind === 'intake' ? t('kind_intake') : kind === 'agreement' ? t('kind_agreement') : t('kind_waiver');
    const kindNounUpper = defaultTitleFor(kind);

    const signerName = (after.signer_name as string) ?? t('signer_fallback');
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
          filename: `${fileSafe(templateTitle, kind)}-${fileSafe(signerName, 'client')}.pdf`,
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

    // English keeps the exact pre-i18n rendering (server-default toLocaleString).
    // Hebrew renders in he-IL in the org timezone; falls back to the raw value on bad input.
    const signedAtDate = new Date(signedAt);
    let signedAtDisplay = signedAtDate.toLocaleString();
    if (lang !== 'en' && !Number.isNaN(signedAtDate.getTime())) {
      try {
        signedAtDisplay = formatDateTime(signedAtDate, lang, orgTz, { dateStyle: 'medium', timeStyle: 'short' });
      } catch {
        signedAtDisplay = signedAtDate.toLocaleString();
      }
    }

    const { dir, align } = htmlDirAttrs(lang);

    const imagesHtml = safeImageUrls.length
      ? `<p><strong>${t('photos_heading', { count: safeImageUrls.length })}</strong></p><ul>${safeImageUrls
          .map((u, i) => `<li><a href="${escapeHtml(u)}">${t('photo_n', { n: i + 1 })}</a></li>`)
          .join('')}</ul>`
      : '';

    const body = {
      from: `${fromName} <${fromEmail}>`,
      to: [orgEmail],
      subject: t('subject', { kind: kindNoun, title: subjectTitle, signer: subjectSignerName }),
      html: `
        <div dir="${dir}" style="text-align:${align}">
        <p>${t('intro', { kind: kindNoun, org: safeOrgName })}</p>
        <table style="border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:4px 12px;color:#6b7280">${kindNounUpper}</td><td style="padding:4px 12px"><strong>${safeTitle}</strong></td></tr>
          <tr><td style="padding:4px 12px;color:#6b7280">${t('label_client')}</td><td style="padding:4px 12px">${safeSignerName}</td></tr>
          ${safeSignerEmail ? `<tr><td style="padding:4px 12px;color:#6b7280">${t('label_email')}</td><td style="padding:4px 12px">${safeSignerEmail}</td></tr>` : ''}
          ${safeSignerPhone ? `<tr><td style="padding:4px 12px;color:#6b7280">${t('label_phone')}</td><td style="padding:4px 12px">${safeSignerPhone}</td></tr>` : ''}
          <tr><td style="padding:4px 12px;color:#6b7280">${t('label_signed')}</td><td style="padding:4px 12px">${escapeHtml(signedAtDisplay)}</td></tr>
        </table>
        <p>${t('attached', { photos: safeImageUrls.length ? t('attached_photos_suffix') : '' })}</p>
        ${imagesHtml}
        ${safePdfUrl ? `<p style="margin-top:24px"><a href="${escapeHtml(safePdfUrl)}">${t('view_pdf')}</a></p>` : ''}
        </div>
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
        console.log(`Backfilled ${result.filled.length} field(s) on client ${clientId} from ${kind}: ${result.filled.join(', ')}`);
      }
    } catch (err) {
      // Backfill is best-effort — don't fail the whole trigger
      console.error('Client backfill failed:', err);
    }
  }
);
