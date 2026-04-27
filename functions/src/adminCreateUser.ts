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

    const createPayload: admin.auth.CreateRequest = {
      email,
      displayName: fullName,
      password: securePassword,
      emailVerified: true,
    };
    if (phone) {
      createPayload.phoneNumber = phone;
    }

    const userRecord = await admin.auth().createUser(createPayload);

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
    const safeMessage = error.code === 'auth/email-already-exists'
      ? 'A user with this email already exists'
      : error.code === 'auth/phone-number-already-exists'
      ? 'A user with this phone number already exists'
      : 'Failed to create user account';
    throw new HttpsError('internal', safeMessage);
  }
});
