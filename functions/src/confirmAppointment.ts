import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { loadResendApiKey } from './lib/resendKey';
import { verifyApptToken, ApptAction } from './lib/appointmentToken';
import {
  confirmAppointment as applyConfirm,
  requestCancellation,
  alertStaff,
  getOrgTimezone,
  describeAppointment,
} from './lib/appointmentConfirm';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/** Minimal branded page. `bodyExtra` lets the cancel step embed a POST form. */
function page(heading: string, message: string, bodyExtra = ''): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading}</title></head>
<body style="margin:0;background:#f9f8f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#232220">
  <div style="max-width:520px;margin:10vh auto;padding:40px 32px;background:#fff;border:1px solid #e7e3df;border-radius:16px;text-align:center">
    <h1 style="font-size:24px;margin:0 0 12px 0;color:#232220">${heading}</h1>
    <p style="font-size:15px;line-height:24px;color:#6d645a;margin:0">${message}</p>
    ${bodyExtra}
  </div>
</body></html>`;
}

/**
 * Public appointment Confirm / Cancel endpoint, reached via the `/a` brand-domain
 * rewrite: `/a?o=<orgId>&a=<apptId>&k=<token>&action=confirm|cancel`.
 *
 * - GET confirm  → applies immediately (prefetch-safe: confirming is the goal).
 * - GET cancel   → renders a page with a POST button; NO state change (so email
 *                  link prefetchers can't trigger a cancellation).
 * - POST cancel  → flags a cancellation request + alerts staff (never hard-cancels).
 */
export const confirmAppointment = onRequest(
  { region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).send(page('Not allowed', 'Unsupported request.'));
      return;
    }

    const o = String(req.query.o ?? '');
    const a = String(req.query.a ?? '');
    const k = String(req.query.k ?? '');
    const action = String(req.query.action ?? '') as ApptAction;

    if (!o || !a || !k || (action !== 'confirm' && action !== 'cancel')) {
      res.status(400).send(page('Invalid link', 'This link is missing information. Please contact the salon directly.'));
      return;
    }

    const secret = await loadResendApiKey(o);
    if (!secret || !verifyApptToken(secret, o, a, action, k)) {
      res.status(400).send(page('Invalid link', 'We could not verify this link. Please contact the salon directly.'));
      return;
    }

    // Load the appointment for a friendlier page + staff alert context.
    let apptData: admin.firestore.DocumentData | null = null;
    try {
      const snap = await db.collection('organizations').doc(o).collection('appointments').doc(a).get();
      apptData = snap.exists ? snap.data() ?? null : null;
    } catch {
      apptData = null;
    }
    if (!apptData) {
      res.status(404).send(page('Appointment not found', 'This appointment may have been removed. Please contact the salon.'));
      return;
    }

    const tz = await getOrgTimezone(o);
    const whenLabel = describeAppointment(apptData, tz);

    try {
      if (action === 'confirm') {
        await applyConfirm(o, a, 'email');
        res.status(200).send(
          page('You’re confirmed ✅', `Your appointment ${whenLabel ? `on ${whenLabel} ` : ''}is confirmed. We look forward to seeing you!`),
        );
        return;
      }

      // action === 'cancel'
      if (req.method === 'GET') {
        // Two-step: render a page with an explicit POST button. No state change.
        const form = `<form method="POST" action="/a?o=${encodeURIComponent(o)}&a=${encodeURIComponent(a)}&k=${encodeURIComponent(k)}&action=cancel" style="margin-top:24px">
  <button type="submit" style="background:#dc2626;color:#fff;border:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:9999px;cursor:pointer">Yes, request cancellation</button>
</form>`;
        res.status(200).send(
          page(
            'Cancel this appointment?',
            `You’re about to request cancellation of your appointment${whenLabel ? ` on ${whenLabel}` : ''}. Our team will follow up to confirm.`,
            form,
          ),
        );
        return;
      }

      // POST cancel → flag for staff, never hard-cancel.
      await requestCancellation(o, a, 'email');
      await alertStaff(o, a, 'cancellation', String(apptData.client_name || ''));
      res.status(200).send(
        page('Cancellation requested', 'Thanks — we’ve passed your request to our team, who will follow up shortly.'),
      );
    } catch (err) {
      console.error('confirmAppointment error:', err instanceof Error ? err.message : String(err));
      res.status(500).send(page('Something went wrong', 'Please try again later or contact the salon directly.'));
    }
  },
);
