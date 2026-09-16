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
import {
  AppLanguage,
  DEFAULT_LANGUAGE,
  defineStrings,
  getOrgLanguage,
  htmlDirAttrs,
  makeT,
} from './lib/i18n';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const STRINGS = defineStrings({
  en: {
    notAllowedTitle: 'Not allowed',
    notAllowedBody: 'Unsupported request.',
    invalidLinkTitle: 'Invalid link',
    invalidLinkMissing: 'This link is missing information. Please contact the salon directly.',
    invalidLinkUnverified: 'We could not verify this link. Please contact the salon directly.',
    notFoundTitle: 'Appointment not found',
    notFoundBody: 'This appointment may have been removed. Please contact the salon.',
    confirmedTitle: 'You’re confirmed ✅',
    confirmedBodyWithWhen: 'Your appointment on {{when}} is confirmed. We look forward to seeing you!',
    confirmedBody: 'Your appointment is confirmed. We look forward to seeing you!',
    cancelTitle: 'Cancel this appointment?',
    cancelBodyWithWhen:
      'You’re about to request cancellation of your appointment on {{when}}. Our team will follow up to confirm.',
    cancelBody: 'You’re about to request cancellation of your appointment. Our team will follow up to confirm.',
    cancelButton: 'Yes, request cancellation',
    cancelRequestedTitle: 'Cancellation requested',
    cancelRequestedBody: 'Thanks — we’ve passed your request to our team, who will follow up shortly.',
    errorTitle: 'Something went wrong',
    errorBody: 'Please try again later or contact the salon directly.',
  },
  he: {
    notAllowedTitle: 'לא מורשה',
    notAllowedBody: 'בקשה לא נתמכת.',
    invalidLinkTitle: 'קישור לא תקין',
    invalidLinkMissing: 'בקישור חסר מידע. אנא צרו קשר ישירות עם הסלון.',
    invalidLinkUnverified: 'לא הצלחנו לאמת את הקישור. אנא צרו קשר ישירות עם הסלון.',
    notFoundTitle: 'התור לא נמצא',
    notFoundBody: 'ייתכן שהתור הוסר. אנא צרו קשר עם הסלון.',
    confirmedTitle: 'התור אושר ✅',
    confirmedBodyWithWhen: 'התור שלכם ב-{{when}} אושר. נשמח לראותכם!',
    confirmedBody: 'התור שלכם אושר. נשמח לראותכם!',
    cancelTitle: 'לבטל את התור?',
    cancelBodyWithWhen: 'אתם עומדים לבקש ביטול של התור שלכם ב-{{when}}. הצוות שלנו ייצור קשר לאישור.',
    cancelBody: 'אתם עומדים לבקש ביטול של התור שלכם. הצוות שלנו ייצור קשר לאישור.',
    cancelButton: 'כן, בקשו ביטול',
    cancelRequestedTitle: 'בקשת הביטול התקבלה',
    cancelRequestedBody: 'תודה — העברנו את הבקשה לצוות שלנו, שייצור קשר בקרוב.',
    errorTitle: 'משהו השתבש',
    errorBody: 'אנא נסו שוב מאוחר יותר או צרו קשר ישירות עם הסלון.',
  },
});

/** Escape stored/user-derived strings before interpolating into the HTML page. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Minimal branded page. `bodyExtra` lets the cancel step embed a POST form. */
function page(heading: string, message: string, bodyExtra = '', lang: AppLanguage = DEFAULT_LANGUAGE): string {
  const { dir } = htmlDirAttrs(lang);
  return `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading}</title></head>
<body style="margin:0;background:#f9f8f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#232220">
  <div dir="${dir}" style="max-width:520px;margin:10vh auto;padding:40px 32px;background:#fff;border:1px solid #e7e3df;border-radius:16px;text-align:center">
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
 *
 * Page copy is rendered in the org's language (organizations/{orgId}.language).
 */
export const confirmAppointment = onRequest(
  { region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    // Before we know the org we can only answer in the default language.
    let lang: AppLanguage = DEFAULT_LANGUAGE;
    let t = makeT(STRINGS, lang);

    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).send(page(t('notAllowedTitle'), t('notAllowedBody'), '', lang));
      return;
    }

    const o = String(req.query.o ?? '');
    const a = String(req.query.a ?? '');
    const k = String(req.query.k ?? '');
    const action = String(req.query.action ?? '') as ApptAction;

    if (o) {
      lang = await getOrgLanguage(o);
      t = makeT(STRINGS, lang);
    }

    if (!o || !a || !k || (action !== 'confirm' && action !== 'cancel')) {
      res.status(400).send(page(t('invalidLinkTitle'), t('invalidLinkMissing'), '', lang));
      return;
    }

    const secret = await loadResendApiKey(o);
    if (!secret || !verifyApptToken(secret, o, a, action, k)) {
      res.status(400).send(page(t('invalidLinkTitle'), t('invalidLinkUnverified'), '', lang));
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
      res.status(404).send(page(t('notFoundTitle'), t('notFoundBody'), '', lang));
      return;
    }

    const tz = await getOrgTimezone(o);
    // describeAppointment can echo the raw stored appointment_date/time on its
    // date-parse fallback path; escape before it reaches the HTML page.
    const whenLabel = escapeHtml(describeAppointment(apptData, tz, lang));

    try {
      if (action === 'confirm') {
        await applyConfirm(o, a, 'email');
        res.status(200).send(
          page(
            t('confirmedTitle'),
            whenLabel ? t('confirmedBodyWithWhen', { when: whenLabel }) : t('confirmedBody'),
            '',
            lang,
          ),
        );
        return;
      }

      // action === 'cancel'
      if (req.method === 'GET') {
        // Two-step: render a page with an explicit POST button. No state change.
        const form = `<form method="POST" action="/a?o=${encodeURIComponent(o)}&a=${encodeURIComponent(a)}&k=${encodeURIComponent(k)}&action=cancel" style="margin-top:24px">
  <button type="submit" style="background:#dc2626;color:#fff;border:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:9999px;cursor:pointer">${t('cancelButton')}</button>
</form>`;
        res.status(200).send(
          page(
            t('cancelTitle'),
            whenLabel ? t('cancelBodyWithWhen', { when: whenLabel }) : t('cancelBody'),
            form,
            lang,
          ),
        );
        return;
      }

      // POST cancel → flag for staff, never hard-cancel.
      await requestCancellation(o, a, 'email');
      await alertStaff(o, a, 'cancellation', String(apptData.client_name || ''));
      res.status(200).send(page(t('cancelRequestedTitle'), t('cancelRequestedBody'), '', lang));
    } catch (err) {
      console.error('confirmAppointment error:', err instanceof Error ? err.message : String(err));
      res.status(500).send(page(t('errorTitle'), t('errorBody'), '', lang));
    }
  },
);
