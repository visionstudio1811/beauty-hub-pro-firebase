import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface CreateUserRequest {
  email: string;
  phone?: string;
  fullName: string;
  role: 'admin' | 'staff' | 'reception' | 'beautician';
  organizationId: string;
  organizationRole?: string;
  password?: string;
}

const VALID_ROLES = new Set(['admin', 'staff', 'reception', 'beautician']);

export const adminCreateUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const data = request.data as CreateUserRequest;

  if (!data.email || !data.fullName || !data.role || !data.organizationId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }
  if (!VALID_ROLES.has(data.role)) {
    throw new HttpsError('invalid-argument', `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new HttpsError('invalid-argument', 'Invalid email address');
  }

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  if (callerDoc.data()?.organizationId !== data.organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }

  const { email, phone, fullName, role, organizationId, organizationRole, password } = data;

  try {
    const securePassword = password || randomBytes(16).toString('hex');

    // Phone is stored in Firestore on the user doc only — we don't push it to
    // Firebase Auth's phoneNumber field because that requires E.164 format and
    // enforces uniqueness across the project. Local-format numbers
    // (e.g. "0524028264") would otherwise fail with auth/invalid-phone-number.
    const userRecord = await admin.auth().createUser({
      email,
      displayName: fullName,
      password: securePassword,
      emailVerified: true,
    });

    await db.collection('users').doc(userRecord.uid).set({
      email,
      phone: phone || '',
      fullName,
      role,
      organizationId,
      organizationRole: organizationRole || null,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, uid: userRecord.uid, message: 'User created successfully' };
  } catch (error: any) {
    // Log the underlying error so future failures aren't opaque. The thrown
    // HttpsError stays generic to avoid leaking auth details to the client.
    console.error('adminCreateUser failed', {
      code: error?.code,
      message: error?.message,
      email,
    });
    const safeMessage = error.code === 'auth/email-already-exists'
      ? 'A user with this email already exists'
      : error.code === 'auth/invalid-email'
      ? 'Invalid email address'
      : error.code === 'auth/weak-password'
      ? 'Password is too weak — generate a new one and retry'
      : 'Failed to create user account';
    throw new HttpsError('internal', safeMessage);
  }
});
