import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyUnsubToken } from './lib/unsubscribeToken';
import { loadResendApiKey } from './lib/resendKey';
import { defineStrings, makeT, getOrgLanguage, htmlDirAttrs, DEFAULT_LANGUAGE, AppLanguage } from './lib/i18n';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const STRINGS = defineStrings({
  en: {
    invalid_title: 'Invalid link',
    invalid_missing: 'This unsubscribe link is missing information. You can also reply to the email with the word "unsubscribe".',
    invalid_verify: 'We could not verify this unsubscribe link. You can also reply to the email with the word "unsubscribe".',
    error_title: 'Something went wrong',
    error_body: 'Please try again later, or reply to the email with the word "unsubscribe".',
    done_title: 'You’re unsubscribed',
    done_body: 'You will no longer receive marketing emails. You may still receive important account, appointment, and transactional messages.',
  },
  he: {
    invalid_title: 'קישור לא תקין',
    invalid_missing: 'בקישור ההסרה חסר מידע. אפשר גם להשיב לאימייל עם המילה "unsubscribe".',
    invalid_verify: 'לא הצלחנו לאמת את קישור ההסרה. אפשר גם להשיב לאימייל עם המילה "unsubscribe".',
    error_title: 'משהו השתבש',
    error_body: 'נא לנסות שוב מאוחר יותר, או להשיב לאימייל עם המילה "unsubscribe".',
    done_title: 'הוסרת מרשימת התפוצה',
    done_body: 'לא תקבלו עוד אימיילים שיווקיים. ייתכן שעדיין תקבלו הודעות חשובות בנוגע לחשבון, לתורים ולעסקאות.',
  },
});

/** Minimal branded confirmation page. */
function page(heading: string, message: string, lang: AppLanguage = DEFAULT_LANGUAGE): string {
  const { dir, align } = htmlDirAttrs(lang);
  return `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading}</title></head>
<body style="margin:0;background:#f9f8f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#232220;direction:${dir};text-align:${align}">
  <div style="max-width:520px;margin:10vh auto;padding:40px 32px;background:#fff;border:1px solid #e7e3df;border-radius:16px;text-align:center">
    <h1 style="font-size:24px;margin:0 0 12px 0;color:#232220">${heading}</h1>
    <p style="font-size:15px;line-height:24px;color:#6d645a;margin:0">${message}</p>
  </div>
</body></html>`;
}

/**
 * One-click email unsubscribe endpoint (RFC 8058). Reached via the brand domain
 * rewrite `/u?o=<orgId>&c=<clientId>&t=<token>`. Handles both the in-body link
 * (GET) and the mail-client one-click (POST). Sets `email_opt_out` on the
 * client doc via the Admin SDK. Never reveals whether an id exists beyond a
 * generic invalid-link message.
 */
export const unsubscribeEmail = onRequest(
  { region: 'us-central1', invoker: 'public' },
  async (req, res) => {
    const o = String(req.query.o ?? '');
    const c = String(req.query.c ?? '');
    const t = String(req.query.t ?? '');

    // Until the token is verified, `o` is an attacker-controlled query param, so
    // no org document is read on its behalf: invalid-link pages render in the
    // default language. Only a verified link resolves the org language below.
    const trDefault = makeT(STRINGS, DEFAULT_LANGUAGE);

    if (!o || !c || !t) {
      res.status(400).send(page(trDefault('invalid_title'), trDefault('invalid_missing'), DEFAULT_LANGUAGE));
      return;
    }

    const key = await loadResendApiKey(o);
    if (!key || !verifyUnsubToken(key, o, c, t)) {
      res.status(400).send(page(trDefault('invalid_title'), trDefault('invalid_verify'), DEFAULT_LANGUAGE));
      return;
    }

    // Token verified — page language follows the org that sent the email.
    // getOrgLanguage swallows read errors (falls back to 'en').
    const lang: AppLanguage = await getOrgLanguage(o);
    const tr = makeT(STRINGS, lang);

    try {
      await db
        .collection('organizations')
        .doc(o)
        .collection('clients')
        .doc(c)
        .set(
          {
            email_opt_out: true,
            email_opt_out_at: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    } catch {
      res.status(500).send(page(tr('error_title'), tr('error_body'), lang));
      return;
    }

    res.status(200).send(page(tr('done_title'), tr('done_body'), lang));
  },
);
