import { google, drive_v3 } from 'googleapis';
import * as admin from 'firebase-admin';
import { createHmac, timingSafeEqual } from 'crypto';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const OAUTH_SECRETS = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'OAUTH_STATE_SECRET'];
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const REDIRECT_URI = 'https://us-central1-beauty-hub-pro-app.cloudfunctions.net/driveOAuthCallback';

const ALLOWED_RETURN_ORIGINS = [
  'https://crm.lumiereut.com',
  'https://crm.gayabeautyspa.com',
  'https://app.beautyhubpro.com',
  'https://beauty-hub-pro-app.web.app',
  'https://beautyhubpro.com',
  'https://www.beautyhubpro.com',
];

const STATE_TTL_MS = 10 * 60 * 1000;

function getClientId(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!v) throw new Error('GOOGLE_OAUTH_CLIENT_ID not set');
  return v;
}

function getClientSecret(): string {
  const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!v) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET not set');
  return v;
}

function getStateSecret(): string {
  const v = process.env.OAUTH_STATE_SECRET;
  if (!v) throw new Error('OAUTH_STATE_SECRET not set');
  return v;
}

export interface StatePayload {
  orgId: string;
  uid: string;
  returnTo: string;
  exp: number;
}

export function signState(payload: Omit<StatePayload, 'exp'>): string {
  const full: StatePayload = { ...payload, exp: Date.now() + STATE_TTL_MS };
  const b64 = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = createHmac('sha256', getStateSecret()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

export function verifyState(state: string): StatePayload | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [b64, sig] = parts;
  const expected = createHmac('sha256', getStateSecret()).update(b64).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString()) as StatePayload;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    if (typeof payload.orgId !== 'string' || typeof payload.uid !== 'string') return null;
    if (typeof payload.returnTo !== 'string') return null;
    return payload;
  } catch {
    return null;
  }
}

export function isAllowedReturnOrigin(returnTo: string): boolean {
  try {
    const url = new URL(returnTo);
    const origin = `${url.protocol}//${url.host}`;
    return ALLOWED_RETURN_ORIGINS.includes(origin);
  } catch {
    return false;
  }
}

export function buildAuthUrl(state: string): string {
  const oauth2 = new google.auth.OAuth2(getClientId(), getClientSecret(), REDIRECT_URI);
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE],
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  expiryDate: number | null;
}> {
  const oauth2 = new google.auth.OAuth2(getClientId(), getClientSecret(), REDIRECT_URI);
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('No refresh token returned. Revoke app access in Google account settings and try again.');
  }
  if (!tokens.access_token) throw new Error('No access token returned');
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiryDate: tokens.expiry_date ?? null,
  };
}

export async function getUserEmailFromAccessToken(accessToken: string): Promise<string> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const oauth2v2 = google.oauth2({ version: 'v2', auth: oauth2 });
  const me = await oauth2v2.userinfo.get();
  return me.data.email ?? '';
}

interface OrgDriveConfig {
  refresh_token?: string;
  user_email?: string;
  folder_id?: string;
  folder_name?: string;
}

async function loadOrgDriveConfig(orgId: string): Promise<OrgDriveConfig | null> {
  const snap = await db
    .collection('organizations').doc(orgId)
    .collection('marketingIntegrations').doc('googleDrive')
    .get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data?.is_enabled) return null;
  return (data.configuration ?? null) as OrgDriveConfig | null;
}

export async function getDriveClientForOrg(orgId: string): Promise<{
  drive: drive_v3.Drive;
  config: OrgDriveConfig;
} | null> {
  const cfg = await loadOrgDriveConfig(orgId);
  if (!cfg?.refresh_token) return null;
  const oauth2 = new google.auth.OAuth2(getClientId(), getClientSecret(), REDIRECT_URI);
  oauth2.setCredentials({ refresh_token: cfg.refresh_token });
  const drive = google.drive({ version: 'v3', auth: oauth2 });
  return { drive, config: cfg };
}

export async function getDriveClientForRefreshToken(refreshToken: string): Promise<drive_v3.Drive> {
  const oauth2 = new google.auth.OAuth2(getClientId(), getClientSecret(), REDIRECT_URI);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const oauth2 = new google.auth.OAuth2(getClientId(), getClientSecret(), REDIRECT_URI);
  try {
    await oauth2.revokeToken(refreshToken);
  } catch (err) {
    // If revocation fails (token already invalid), continue — caller will still clear local state.
    console.warn('[driveOAuth] revokeToken failed:', err instanceof Error ? err.message : err);
  }
}
