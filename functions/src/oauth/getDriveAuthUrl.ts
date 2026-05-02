import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { OAUTH_SECRETS, buildAuthUrl, isAllowedReturnOrigin, signState } from './driveOAuth';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

interface GetDriveAuthUrlRequest {
  organizationId: string;
  returnTo: string;
}

export const getDriveAuthUrl = onCall(
  { secrets: OAUTH_SECRETS, region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Unauthorized');

    const { organizationId, returnTo } = (request.data ?? {}) as GetDriveAuthUrlRequest;
    if (!organizationId || !returnTo) {
      throw new HttpsError('invalid-argument', 'organizationId and returnTo are required');
    }
    if (!isAllowedReturnOrigin(returnTo)) {
      throw new HttpsError('invalid-argument', 'returnTo origin not allowed');
    }

    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
    const userData = userDoc.data()!;
    if (userData.organizationId !== organizationId) {
      throw new HttpsError('permission-denied', 'Organization mismatch');
    }
    if (userData.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const state = signState({ orgId: organizationId, uid: request.auth.uid, returnTo });
    return { authUrl: buildAuthUrl(state) };
  }
);
