import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import {
  OAUTH_SECRETS,
  exchangeCodeForTokens,
  getUserEmailFromAccessToken,
  getDriveClientForRefreshToken,
  isAllowedReturnOrigin,
  verifyState,
} from './driveOAuth';
import { writeSecret } from '../lib/integrationSecrets';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ROOT_FOLDER_NAME = 'Beauty Hub Pro Backups';

function appendQuery(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

function htmlError(message: string): string {
  const safe = message.replace(/[<>&"']/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  );
  return `<!doctype html><meta charset="utf-8"><title>Drive connect failed</title>
<body style="font-family:system-ui;padding:2rem;max-width:480px"><h1>Connection failed</h1>
<p>${safe}</p><p>You can close this window and try again from settings.</p></body>`;
}

export const driveOAuthCallback = onRequest(
  { secrets: OAUTH_SECRETS, region: 'us-central1' },
  async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const errorParam = typeof req.query.error === 'string' ? req.query.error : '';

    if (errorParam) {
      res.status(400).send(htmlError(`Google returned: ${errorParam}`));
      return;
    }
    if (!code || !state) {
      res.status(400).send(htmlError('Missing code or state.'));
      return;
    }

    const payload = verifyState(state);
    if (!payload) {
      res.status(400).send(htmlError('State invalid or expired. Please try connecting again.'));
      return;
    }
    if (!isAllowedReturnOrigin(payload.returnTo)) {
      res.status(400).send(htmlError('Return URL not allowed.'));
      return;
    }

    try {
      const tokens = await exchangeCodeForTokens(code);
      const email = await getUserEmailFromAccessToken(tokens.accessToken);
      const drive = await getDriveClientForRefreshToken(tokens.refreshToken);

      // Create a dedicated root folder owned by the connecting user.
      // drive.file scope only lets us see/touch files this app created, so
      // we always create our own root rather than asking the user to share one.
      const created = await drive.files.create({
        requestBody: {
          name: ROOT_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id, name, webViewLink',
      });
      const folderId = created.data.id;
      const folderName = created.data.name ?? ROOT_FOLDER_NAME;
      if (!folderId) {
        throw new Error('Drive did not return a folder id');
      }

      // The long-lived refresh token goes ONLY into the write-only secret subdoc
      // (Firestore rules deny all client read/write there). The parent doc — which
      // org admins can read from the browser — keeps only non-secret hints.
      await writeSecret(payload.orgId, 'googleDrive', { refresh_token: tokens.refreshToken });

      const driveDoc = db
        .collection('organizations').doc(payload.orgId)
        .collection('marketingIntegrations').doc('googleDrive');

      await driveDoc.set(
        {
          organization_id: payload.orgId,
          provider: 'googleDrive',
          is_enabled: true,
          status: 'connected',
          error_message: null,
          configuration: {
            user_email: email,
            folder_id: folderId,
            folder_name: folderName,
            connected_at: new Date().toISOString(),
            connected_by_uid: payload.uid,
          },
          updated_at: new Date().toISOString(),
          updated_at_ts: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Strip any legacy readable token left on the parent doc by an older build
      // (merge above would otherwise preserve configuration.refresh_token).
      await driveDoc
        .update({ 'configuration.refresh_token': admin.firestore.FieldValue.delete() })
        .catch(() => undefined);

      // Do NOT put the connecting user's email in the redirect URL — it is PII and
      // would be persisted in browser history / access logs. The SPA reads the
      // connected account email from the marketingIntegrations/googleDrive doc
      // (configuration.user_email, written above) instead.
      res.redirect(302, appendQuery(payload.returnTo, { drive_connected: '1' }));
    } catch (err) {
      // Log the real error server-side for debugging, but never leak the raw
      // exception text into the redirect URL — it can disclose internal
      // integration detail. The SPA shows a generic "connection failed" message.
      console.error('[driveOAuthCallback] failed:', err);
      try {
        res.redirect(
          302,
          appendQuery(payload.returnTo, { drive_connected: '0' })
        );
      } catch {
        res.status(500).send(htmlError('Connection failed. Please close this window and try again from settings.'));
      }
    }
  }
);
