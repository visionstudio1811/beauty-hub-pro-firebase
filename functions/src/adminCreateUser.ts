import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface CreateUserRequest {
  email: string;
  phone: string;
  fullName: string;
  role: 'admin' | 'staff' | 'reception' | 'beautician';
  organizationId: string;
  organizationRole?: string;
  password?: string;
}

export const adminCreateUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Unauthorized');
  }

  const data = request.data as CreateUserRequest;

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const callerOrgId = callerDoc.data()?.organizationId;
  if (callerOrgId !== data.organizationId) {
    throw new HttpsError('permission-denied', 'Organization mismatch');
  }

  const { email, phone, fullName, role, organizationId, organizationRole, password } = data;

  try {
    const userRecord = await admin.auth().createUser({
      email,
      phoneNumber: phone,
      displayName: fullName,
      password: password || Math.random().toString(36).substring(2, 12),
      emailVerified: true,
    });

    await db.collection('users').doc(userRecord.uid).set({
      email,
      phone,
      fullName,
      role,
      organizationId,
      organizationRole: organizationRole || null,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('Created user:', userRecord.uid, 'for organization:', organizationId);

    return {
      success: true,
      uid: userRecord.uid,
      message: 'User created successfully',
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    throw new HttpsError('internal', error.message || 'Failed to create user');
  }
});
