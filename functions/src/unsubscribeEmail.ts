import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyUnsubToken } from './lib/unsubscribeToken';
import { loadResendApiKey } from './lib/resendKey';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/** Minimal branded confirmation page. */
function page(heading: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading}</title></head>
<body style="margin:0;background:#f9f8f6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#232220">
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

    if (!o || !c || !t) {
      res.status(400).send(page('Invalid link', 'This unsubscribe link is missing information. You can also reply to the email with the word "unsubscribe".'));
      return;
    }

    const key = await loadResendApiKey(o);
    if (!key || !verifyUnsubToken(key, o, c, t)) {
      res.status(400).send(page('Invalid link', 'We could not verify this unsubscribe link. You can also reply to the email with the word "unsubscribe".'));
      return;
    }

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
      res.status(500).send(page('Something went wrong', 'Please try again later, or reply to the email with the word "unsubscribe".'));
      return;
    }

    res.status(200).send(
      page(
        'You’re unsubscribed',
        'You will no longer receive marketing emails. You may still receive important account, appointment, and transactional messages.',
      ),
    );
  },
);
