import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { consumeRateLimit } from './rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const NOTIFY_TO = 'thegoldencircle.skincare@gmail.com';
const NOTIFY_FROM_NAME = 'beautyhubpro Leads';
const NOTIFY_FROM_EMAIL = 'leads@beautyhubpro.com';

const ALLOWED_TIERS = new Set(['essentials', 'signature', 'suite', 'unsure']);

interface QuoteRequest {
  name?: unknown;
  business?: unknown;
  email?: unknown;
  phone?: unknown;
  tier?: unknown;
  message?: unknown;
  website?: unknown; // honeypot
}

function requireString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `Missing ${field}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpsError('invalid-argument', `Missing ${field}`);
  }
  if (trimmed.length > max) {
    throw new HttpsError('invalid-argument', `${field} too long`);
  }
  return trimmed;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const submitQuoteRequest = onCall(
  { secrets: ['RESEND_API_KEY'] },
  async (request) => {
    const data = (request.data || {}) as QuoteRequest;

    // Honeypot: real users never fill this hidden field. Return ok silently so
    // bots don't learn they've been filtered.
    if (typeof data.website === 'string' && data.website.trim().length > 0) {
      return { ok: true };
    }

    const name = requireString(data.name, 'name', 120);
    const business = requireString(data.business, 'business', 160);
    const email = requireString(data.email, 'email', 200);
    const phone = requireString(data.phone, 'phone', 40);
    const tierRaw = requireString(data.tier, 'tier', 20).toLowerCase();
    const message = requireString(data.message, 'message', 2000);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Invalid email');
    }
    if (!ALLOWED_TIERS.has(tierRaw)) {
      throw new HttpsError('invalid-argument', 'Invalid tier');
    }

    // Global daily cap — the rate limiter is per-org, so we reuse it under a
    // synthetic "_public" org. Admin SDK bypasses the firestore rule that
    // denies client access to this path.
    await consumeRateLimit('_public', 'quote_requests', 200);

    const leadRef = await db.collection('marketingLeads').add({
      name,
      business,
      email,
      phone,
      tier: tierRaw,
      message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'public_site',
      userAgent: request.rawRequest?.headers?.['user-agent'] ?? null,
      ip: request.rawRequest?.ip ?? null,
      status: 'new',
    });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      // Lead is stored; just skip notification. Logged for ops follow-up.
      console.warn('RESEND_API_KEY not set; quote request stored without email notification', leadRef.id);
      return { ok: true };
    }

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111;">
        <h2 style="margin:0 0 16px;">New beautyhubpro quote request</h2>
        <table cellpadding="6" style="border-collapse: collapse;">
          <tr><td><strong>Name</strong></td><td>${escapeHtml(name)}</td></tr>
          <tr><td><strong>Business</strong></td><td>${escapeHtml(business)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
          <tr><td><strong>Phone</strong></td><td>${escapeHtml(phone)}</td></tr>
          <tr><td><strong>Tier</strong></td><td>${escapeHtml(tierRaw)}</td></tr>
        </table>
        <h3 style="margin:24px 0 8px;">Message</h3>
        <p style="white-space: pre-wrap; background: #f7f3ee; padding: 12px; border-radius: 6px;">${escapeHtml(message)}</p>
        <p style="color:#666; font-size: 12px; margin-top: 24px;">Lead ID: ${leadRef.id}</p>
      </div>
    `;

    try {
      const resend = new Resend(apiKey);
      const res = await resend.emails.send({
        from: `${NOTIFY_FROM_NAME} <${NOTIFY_FROM_EMAIL}>`,
        to: [NOTIFY_TO],
        replyTo: email,
        subject: `New quote request — ${business}`,
        html,
      });
      if (res.error) {
        console.error('Resend error for lead', leadRef.id, res.error);
      }
    } catch (err) {
      console.error('Failed to send lead email for', leadRef.id, err);
      // Don't throw — the lead is persisted; email is best-effort.
    }

    return { ok: true };
  }
);
