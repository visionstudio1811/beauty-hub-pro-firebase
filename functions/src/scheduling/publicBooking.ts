import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { consumeRateLimit } from '../rateLimit';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface ResolveRequest {
  token: string;
}

interface SubmitRequest {
  token: string;
  treatmentId?: string;          // Required when the link isn't pre-scoped to a treatment
  staffId?: string;              // Optional; ignored if the link pre-scopes staff
  date: string;                  // YYYY-MM-DD
  time: string;                  // HH:MM
  client: {
    name: string;
    email?: string;
    phone?: string;
  };
  notes?: string;
}

const requireActiveToken = async (token: string) => {
  if (!token || typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    throw new HttpsError('invalid-argument', 'Invalid token format');
  }
  const tokenSnap = await db.collection('schedulerLinkTokens').doc(token).get();
  if (!tokenSnap.exists) throw new HttpsError('not-found', 'Link not found');
  const data = tokenSnap.data() ?? {};
  if (data.is_active === false) throw new HttpsError('failed-precondition', 'Link is no longer active');
  const expiresAt = data.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    throw new HttpsError('failed-precondition', 'Link has expired');
  }
  return data;
};

/**
 * Unauthenticated. Given a token, returns enough information for the public
 * booking page to render: sanitized org branding, available treatments, and
 * staff list. Treatment/staff are scoped to the token if the admin pre-selected
 * them at link creation time.
 */
export const resolveSchedulerLink = onCall(async (request) => {
  const { token } = request.data as ResolveRequest;
  const tokenData = await requireActiveToken(token);
  const orgId = tokenData.organization_id as string;
  const scopedTreatmentId = tokenData.treatment_id as string | null;
  const scopedStaffId = tokenData.staff_id as string | null;

  // Org branding (limited fields)
  const orgSnap = await db.collection('organizations').doc(orgId).get();
  const orgData = orgSnap.data() ?? {};
  const businessInfoSnap = await db.collection('organizations').doc(orgId).collection('config').doc('businessInfo').get();
  const businessInfo = businessInfoSnap.data() ?? {};

  // Treatments
  let treatmentsList: Array<{ id: string; name: string; duration: number; price?: number; staff_ids?: string[] }> = [];
  if (scopedTreatmentId) {
    const tSnap = await db.collection('organizations').doc(orgId).collection('treatments').doc(scopedTreatmentId).get();
    if (tSnap.exists && tSnap.data()?.is_active !== false) {
      const t = tSnap.data() ?? {};
      treatmentsList = [{
        id: tSnap.id,
        name: t.name ?? 'Treatment',
        duration: typeof t.duration === 'number' ? t.duration : 60,
        price: typeof t.price === 'number' ? t.price : undefined,
        staff_ids: Array.isArray(t.staff_ids) ? t.staff_ids : undefined,
      }];
    }
  } else {
    const tSnap = await db
      .collection('organizations')
      .doc(orgId)
      .collection('treatments')
      .where('is_active', '==', true)
      .get();
    treatmentsList = tSnap.docs.map(d => {
      const t = d.data();
      return {
        id: d.id,
        name: t.name ?? 'Treatment',
        duration: typeof t.duration === 'number' ? t.duration : 60,
        price: typeof t.price === 'number' ? t.price : undefined,
        staff_ids: Array.isArray(t.staff_ids) ? t.staff_ids : undefined,
      };
    });
  }

  // Staff (used when treatment doesn't pre-scope staff and the visitor needs to pick)
  let staffList: Array<{ id: string; name: string }> = [];
  if (scopedStaffId) {
    const sSnap = await db.collection('users').doc(scopedStaffId).get();
    if (sSnap.exists) {
      staffList = [{
        id: sSnap.id,
        name: sSnap.data()?.fullName ?? sSnap.data()?.email ?? 'Staff',
      }];
    }
  } else {
    const usersSnap = await db
      .collection('users')
      .where('organizationId', '==', orgId)
      .where('isActive', '==', true)
      .get();
    staffList = usersSnap.docs
      .filter(d => ['staff', 'admin', 'beautician'].includes(d.data()?.role))
      .map(d => ({
        id: d.id,
        name: d.data()?.fullName ?? d.data()?.email ?? 'Staff',
      }));
  }

  return {
    organization: {
      id: orgId,
      name: orgData.name ?? 'Beauty Hub Pro',
      logo_url: orgData.logo_url ?? null,
      timezone: orgData.timezone ?? 'UTC',
    },
    business_info: {
      name: businessInfo.name ?? orgData.name ?? null,
      address: businessInfo.address ?? null,
      phone: businessInfo.phone ?? null,
      slot_interval_minutes: typeof businessInfo.slot_interval_minutes === 'number'
        ? businessInfo.slot_interval_minutes
        : null,
    },
    scoped_treatment_id: scopedTreatmentId,
    scoped_staff_id: scopedStaffId,
    treatments: treatmentsList,
    staff: staffList,
  };
});

const HHMM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+\d][\d\s\-()]{5,30}$/;

/**
 * Unauthenticated. Records a public booking request gated by a scheduler-link
 * token. Writes a `bookingRequests` doc with source='public_link' that staff
 * approve via the existing BookingRequestsPanel flow.
 */
export const submitPublicBookingRequest = onCall(async (request) => {
  const data = request.data as SubmitRequest;
  if (!data?.token || !data?.date || !data?.time || !data?.client?.name) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }
  if (!YMD.test(data.date) || !HHMM.test(data.time)) {
    throw new HttpsError('invalid-argument', 'Invalid date or time format');
  }
  const client = {
    name: String(data.client.name).slice(0, 120).trim(),
    email: data.client.email ? String(data.client.email).trim() : '',
    phone: data.client.phone ? String(data.client.phone).trim() : '',
  };
  if (!client.name) throw new HttpsError('invalid-argument', 'Name required');
  if (!client.email && !client.phone) {
    throw new HttpsError('invalid-argument', 'Provide an email or phone number');
  }
  if (client.email && !EMAIL.test(client.email)) {
    throw new HttpsError('invalid-argument', 'Invalid email address');
  }
  if (client.phone && !PHONE.test(client.phone)) {
    throw new HttpsError('invalid-argument', 'Invalid phone number');
  }

  const tokenData = await requireActiveToken(data.token);
  const orgId = tokenData.organization_id as string;
  const treatmentId = (tokenData.treatment_id as string | null) ?? data.treatmentId;
  if (!treatmentId) throw new HttpsError('invalid-argument', 'Treatment is required for this link');
  const staffId = (tokenData.staff_id as string | null) ?? data.staffId ?? null;

  await consumeRateLimit(orgId, 'publicBookingRequest', 100);

  // Load treatment for snapshot fields (name + duration + buffers)
  const tSnap = await db.collection('organizations').doc(orgId).collection('treatments').doc(treatmentId).get();
  if (!tSnap.exists) throw new HttpsError('not-found', 'Treatment not found');
  const t = tSnap.data() ?? {};
  if (t.is_active === false) throw new HttpsError('failed-precondition', 'Treatment is inactive');
  const treatmentName = (t.name as string) ?? 'Treatment';
  const duration = typeof t.duration === 'number' ? t.duration : 60;

  let staffName: string | null = null;
  if (staffId) {
    const sSnap = await db.collection('users').doc(staffId).get();
    if (sSnap.exists) {
      staffName = (sSnap.data()?.fullName as string) ?? (sSnap.data()?.email as string) ?? null;
    }
  }

  const requestRef = await db
    .collection('organizations')
    .doc(orgId)
    .collection('bookingRequests')
    .add({
      organization_id: orgId,
      client_id: null,                         // Public visitor — not a registered client yet
      client_name: client.name,
      client_email: client.email || null,
      client_phone: client.phone || null,
      purchase_id: null,
      package_id: null,
      treatment_id: treatmentId,
      treatment_name: treatmentName,
      duration,
      staff_id: staffId,
      staff_name: staffName,
      preferred_slot: { date: data.date, time: data.time, staff_id: staffId ?? undefined },
      alternative_slots: [],
      notes: data.notes ? String(data.notes).slice(0, 500) : null,
      // Snapshot buffers for the overlap check during approval
      buffer_before_minutes: typeof t.buffer_before_minutes === 'number' ? t.buffer_before_minutes : 0,
      buffer_after_minutes: typeof t.buffer_after_minutes === 'number' ? t.buffer_after_minutes : 0,
      status: 'pending',
      source: 'public_link',
      source_token: data.token,
      created_by_uid: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { bookingRequestId: requestRef.id };
});
