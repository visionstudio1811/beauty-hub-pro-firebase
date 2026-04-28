import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type Slot = {
  date: string;
  time: string;
  staff_id: string;
};

type PortalAccess = {
  organization_id: string;
  client_id: string;
  uid: string;
  matched_by: 'email' | 'phone';
};

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(phone: unknown): string | null {
  if (!phone) return null;
  const normalized = String(phone).replace(/[^\d+]/g, '');
  return normalized || null;
}

function assertDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Date must be YYYY-MM-DD');
  }
  return value;
}

function assertTime(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Time must be HH:mm');
  }
  return value;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${field} is required`);
  }
  return value.trim();
}

function asSlot(value: unknown, field: string): Slot {
  const raw = value as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') {
    throw new HttpsError('invalid-argument', `${field} is required`);
  }
  return {
    date: assertDate(raw.date),
    time: assertTime(raw.time),
    staff_id: assertString(raw.staff_id, `${field}.staff_id`),
  };
}

async function getStaffUser(uid: string, orgId: string) {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', 'User profile not found');
  }

  const user = userSnap.data()!;
  if (user.organizationId !== orgId || !['admin', 'staff', 'reception'].includes(user.role)) {
    throw new HttpsError('permission-denied', 'Staff access required');
  }

  return user;
}

async function getPortalAccess(uid: string, orgId: string): Promise<PortalAccess> {
  const accessSnap = await db
    .collection('clientPortalAccess')
    .doc(uid)
    .collection('organizations')
    .doc(orgId)
    .get();

  if (!accessSnap.exists) {
    throw new HttpsError('permission-denied', 'Client portal access has not been linked');
  }

  return accessSnap.data() as PortalAccess;
}

async function getAcuityConfig(orgId: string) {
  const snap = await db
    .collection('organizations')
    .doc(orgId)
    .collection('acuitySyncConfig')
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

async function assertPurchaseCanBook(
  orgRef: admin.firestore.DocumentReference,
  purchaseId: string,
  clientId: string,
  treatmentId: string,
) {
  const purchaseSnap = await orgRef.collection('purchases').doc(purchaseId).get();
  if (!purchaseSnap.exists) {
    throw new HttpsError('not-found', 'Package purchase not found');
  }

  const purchase = purchaseSnap.data()!;
  const today = new Date().toISOString().slice(0, 10);

  if (purchase.client_id !== clientId) {
    throw new HttpsError('permission-denied', 'Purchase does not belong to this client');
  }
  if (purchase.payment_status !== 'active') {
    throw new HttpsError('failed-precondition', 'Package is not active');
  }
  if (purchase.expiry_date && purchase.expiry_date < today) {
    throw new HttpsError('failed-precondition', 'Package is expired');
  }

  const slots = Array.isArray(purchase.sessions_by_treatment)
    ? purchase.sessions_by_treatment as Array<{ treatment_id?: string; remaining?: number }>
    : [];

  if (slots.length > 0) {
    const slot = slots.find((s) => s.treatment_id === treatmentId);
    if (!slot || Number(slot.remaining ?? 0) <= 0) {
      throw new HttpsError('failed-precondition', 'No remaining sessions for this treatment');
    }
  } else if (Number(purchase.sessions_remaining ?? 0) <= 0) {
    throw new HttpsError('failed-precondition', 'No remaining package sessions');
  }

  return purchase;
}

async function assertTreatmentCanBook(
  orgRef: admin.firestore.DocumentReference,
  purchase: admin.firestore.DocumentData,
  treatmentId: string,
) {
  const treatmentSnap = await orgRef.collection('treatments').doc(treatmentId).get();
  if (!treatmentSnap.exists) {
    throw new HttpsError('not-found', 'Treatment not found');
  }

  const pkgSnap = purchase.package_id
    ? await orgRef.collection('packages').doc(purchase.package_id).get()
    : null;
  const pkg = pkgSnap?.exists ? pkgSnap.data()! : {};
  const allowedTreatments = Array.isArray(pkg.treatments) ? pkg.treatments as string[] : [];

  if (allowedTreatments.length > 0 && !allowedTreatments.includes(treatmentId)) {
    throw new HttpsError('failed-precondition', 'Treatment is not included in this package');
  }

  return treatmentSnap.data()!;
}

async function assertSlotAvailable(
  orgRef: admin.firestore.DocumentReference,
  slot: Slot,
  duration: number,
) {
  const start = new Date(`${slot.date}T${slot.time}:00`);
  if (Number.isNaN(start.getTime())) {
    throw new HttpsError('invalid-argument', 'Invalid requested slot');
  }
  if (start.getTime() <= Date.now()) {
    throw new HttpsError('failed-precondition', 'Requested slot must be in the future');
  }

  const end = new Date(start.getTime() + duration * 60000);
  const apptSnap = await orgRef
    .collection('appointments')
    .where('appointment_date', '==', slot.date)
    .where('staff_id', '==', slot.staff_id)
    .get();

  const conflicts = apptSnap.docs.filter((doc) => {
    const appt = doc.data();
    if (['cancelled', 'no-show'].includes(appt.status)) return false;
    const apptStart = new Date(`${appt.appointment_date}T${appt.appointment_time}:00`);
    const apptEnd = new Date(apptStart.getTime() + Number(appt.duration ?? 60) * 60000);
    return start < apptEnd && end > apptStart;
  });

  if (conflicts.length > 0) {
    throw new HttpsError('failed-precondition', 'Requested slot is no longer available');
  }
}

async function createAcuityAppointment(
  orgId: string,
  appointmentId: string,
  appointment: admin.firestore.DocumentData,
) {
  const config = await getAcuityConfig(orgId);
  if (!config?.data.sync_enabled) {
    return { status: 'skipped', reason: 'Acuity sync is disabled' };
  }

  const acuityUserId = process.env.ACUITY_API_USER_ID;
  const acuityApiKey = process.env.ACUITY_API_KEY;
  if (!acuityUserId || !acuityApiKey) {
    return { status: 'failed', reason: 'Acuity API credentials are not configured' };
  }

  const mappings = config.data.client_portal_acuity_mappings ?? {};
  const treatmentMapping = mappings.treatments?.[appointment.treatment_id] ?? {};
  const calendarId = mappings.staff_calendars?.[appointment.staff_id];
  const appointmentTypeId = treatmentMapping.appointmentTypeID ?? treatmentMapping.appointment_type_id;

  if (!appointmentTypeId || !calendarId) {
    return { status: 'failed', reason: 'Missing Acuity treatment or staff calendar mapping' };
  }

  const credentials = Buffer.from(`${acuityUserId}:${acuityApiKey}`).toString('base64');
  const response = await fetch('https://acuityscheduling.com/api/v1/appointments', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appointmentTypeID: appointmentTypeId,
      calendarID: calendarId,
      datetime: `${appointment.appointment_date}T${appointment.appointment_time}:00`,
      firstName: String(appointment.client_name ?? '').split(' ')[0] || appointment.client_name,
      lastName: String(appointment.client_name ?? '').split(' ').slice(1).join(' '),
      email: appointment.client_email,
      phone: appointment.client_phone,
      notes: appointment.notes,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { status: 'failed', reason: `Acuity API error: ${response.status} ${errorText}` };
  }

  const created = await response.json() as { id?: number | string };
  await db
    .collection('organizations')
    .doc(orgId)
    .collection('appointments')
    .doc(appointmentId)
    .update({
      acuity_appointment_id: created.id ? String(created.id) : null,
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

  return { status: 'synced', acuityAppointmentId: created.id ? String(created.id) : null };
}

export const getClientPortalOrg = onCall({ enforceAppCheck: false }, async (request) => {
  const rawSlug = typeof request.data?.slug === 'string' ? request.data.slug.trim().toLowerCase() : '';
  const rawHost = typeof request.data?.host === 'string' ? request.data.host.trim().toLowerCase() : '';
  const host = rawHost.split(':')[0];

  if (!rawSlug && !host) {
    throw new HttpsError('invalid-argument', 'slug or host is required');
  }

  const orgs = db.collection('organizations');
  const queries: Array<Promise<admin.firestore.QuerySnapshot>> = [];
  const slugCandidates = new Set<string>();

  if (rawSlug) slugCandidates.add(rawSlug);

  if (host && !['localhost', '127.0.0.1'].includes(host)) {
    queries.push(orgs.where('crm_domain', '==', host).where('is_active', '==', true).limit(1).get());
    queries.push(orgs.where('custom_domain', '==', host).where('is_active', '==', true).limit(1).get());
    queries.push(orgs.where('domain', '==', host).where('is_active', '==', true).limit(1).get());
    queries.push(orgs.where('portal_domains', 'array-contains', host).where('is_active', '==', true).limit(1).get());

    const withoutCrm = host.startsWith('crm.') ? host.slice(4) : host;
    const labels = withoutCrm.split('.').filter(Boolean);
    if (labels[0]) slugCandidates.add(labels[0].replace(/[^a-z0-9-]/g, ''));
    if (labels.length > 1) slugCandidates.add(labels.slice(0, -1).join('-').replace(/[^a-z0-9-]/g, '-'));
    slugCandidates.add(withoutCrm.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
  }

  for (const slug of Array.from(slugCandidates).filter(Boolean)) {
    queries.push(orgs.where('slug', '==', slug).where('is_active', '==', true).limit(1).get());
  }

  const snaps = await Promise.all(queries);
  const snap = snaps.find((candidate) => !candidate.empty);

  if (!snap || snap.empty) {
    throw new HttpsError('not-found', 'Client portal not found');
  }

  const org = snap.docs[0].data();
  return {
    organization: {
      id: snap.docs[0].id,
      name: org.name ?? '',
      slug: org.slug ?? rawSlug,
      logo_url: org.logo_url ?? org.logoUrl ?? null,
      timezone: org.timezone ?? 'UTC',
      phone: org.phone ?? null,
      email: org.email ?? null,
      address: org.address ?? null,
    },
  };
});

export const linkClientPortalAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in is required');
  }

  const orgId = assertString(request.data?.organizationId, 'organizationId');
  const authEmail = normalizeEmail(request.auth.token.email);
  const authPhone = normalizePhone(request.auth.token.phone_number);
  const orgRef = db.collection('organizations').doc(orgId);
  const clientsRef = orgRef.collection('clients');

  let clientSnap: admin.firestore.QuerySnapshot | null = null;
  let matchedBy: 'email' | 'phone' | null = null;

  if (authEmail) {
    clientSnap = await clientsRef.where('email', '==', authEmail).limit(1).get();
    matchedBy = clientSnap.empty ? null : 'email';
  }

  if ((!clientSnap || clientSnap.empty) && authPhone) {
    clientSnap = await clientsRef.where('phone', '==', authPhone).limit(1).get();
    matchedBy = clientSnap.empty ? null : 'phone';
  }

  if (!clientSnap || clientSnap.empty || !matchedBy) {
    const fallbackSnap = await clientsRef.limit(500).get();
    const fallbackDoc = fallbackSnap.docs.find((docSnap) => {
      const client = docSnap.data();
      return (authEmail && normalizeEmail(client.email) === authEmail)
        || (authPhone && normalizePhone(client.phone) === authPhone);
    });

    if (fallbackDoc) {
      clientSnap = {
        empty: false,
        docs: [fallbackDoc],
      } as admin.firestore.QuerySnapshot;
      const client = fallbackDoc.data();
      matchedBy = authEmail && normalizeEmail(client.email) === authEmail ? 'email' : 'phone';
    }
  }

  if (!clientSnap || clientSnap.empty || !matchedBy) {
    throw new HttpsError('permission-denied', 'No matching client card was found for this spa');
  }

  const clientDoc = clientSnap.docs[0];
  const client = clientDoc.data();
  if (client.deleted_at || client.deletedAt) {
    throw new HttpsError('permission-denied', 'This client card is not active');
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection('clientPortalAccess')
    .doc(request.auth.uid)
    .collection('organizations')
    .doc(orgId)
    .set({
      uid: request.auth.uid,
      organization_id: orgId,
      client_id: clientDoc.id,
      matched_by: matchedBy,
      email: authEmail,
      phone: authPhone,
      created_at: now,
      updated_at: now,
    }, { merge: true });

  return {
    access: {
      organization_id: orgId,
      client_id: clientDoc.id,
      matched_by: matchedBy,
    },
  };
});

export const createClientBookingRequest = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in is required');
  }

  const orgId = assertString(request.data?.organizationId, 'organizationId');
  const purchaseId = assertString(request.data?.purchaseId, 'purchaseId');
  const treatmentId = assertString(request.data?.treatmentId, 'treatmentId');
  const preferredSlot = asSlot(request.data?.preferredSlot, 'preferredSlot');
  const alternativeSlots = Array.isArray(request.data?.alternativeSlots)
    ? request.data.alternativeSlots.slice(0, 3).map((slot: unknown) => asSlot(slot, 'alternativeSlot'))
    : [];
  const notes = typeof request.data?.notes === 'string'
    ? request.data.notes.trim().slice(0, 1000)
    : '';

  const access = await getPortalAccess(request.auth.uid, orgId);
  const orgRef = db.collection('organizations').doc(orgId);
  const [clientSnap, purchase] = await Promise.all([
    orgRef.collection('clients').doc(access.client_id).get(),
    assertPurchaseCanBook(orgRef, purchaseId, access.client_id, treatmentId),
  ]);

  if (!clientSnap.exists) {
    throw new HttpsError('not-found', 'Client not found');
  }

  const treatment = await assertTreatmentCanBook(orgRef, purchase, treatmentId);
  await assertSlotAvailable(orgRef, preferredSlot, Number(treatment.duration ?? 60));
  const staffSnap = await orgRef.collection('staff').doc(preferredSlot.staff_id).get();
  const staffName = staffSnap.exists
    ? String(staffSnap.data()?.name ?? staffSnap.data()?.fullName ?? 'Staff')
    : 'Staff';

  const client = clientSnap.data()!;
  const requestRef = await orgRef.collection('bookingRequests').add({
    organization_id: orgId,
    client_id: access.client_id,
    client_name: client.name ?? '',
    client_email: client.email ?? '',
    client_phone: client.phone ?? '',
    purchase_id: purchaseId,
    package_id: purchase.package_id ?? null,
    treatment_id: treatmentId,
    treatment_name: treatment.name ?? 'Treatment',
    duration: Number(treatment.duration ?? 60),
    staff_name: staffName,
    preferred_slot: preferredSlot,
    alternative_slots: alternativeSlots,
    notes,
    status: 'pending',
    source: 'client_portal',
    created_by_uid: request.auth.uid,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { bookingRequestId: requestRef.id };
});

export const updateClientBookingRequest = onCall(
  { secrets: ['ACUITY_API_USER_ID', 'ACUITY_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in is required');
    }

    const orgId = assertString(request.data?.organizationId, 'organizationId');
    const requestId = assertString(request.data?.bookingRequestId, 'bookingRequestId');
    const action = assertString(request.data?.action, 'action');
    if (!['approve', 'reject'].includes(action)) {
      throw new HttpsError('invalid-argument', 'action must be approve or reject');
    }

    const staff = await getStaffUser(request.auth.uid, orgId);
    const orgRef = db.collection('organizations').doc(orgId);
    const requestRef = orgRef.collection('bookingRequests').doc(requestId);

    if (action === 'reject') {
      await requestRef.update({
        status: 'rejected',
        staff_response: typeof request.data?.staffResponse === 'string'
          ? request.data.staffResponse.trim().slice(0, 1000)
          : '',
        reviewed_by: request.auth.uid,
        reviewed_by_name: staff.fullName ?? staff.email ?? '',
        reviewed_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { status: 'rejected' };
    }

    const appointmentRef = orgRef.collection('appointments').doc();
    const appointmentPayload = await db.runTransaction(async (tx) => {
      const requestSnap = await tx.get(requestRef);
      if (!requestSnap.exists) {
        throw new HttpsError('not-found', 'Booking request not found');
      }

      const booking = requestSnap.data()!;
      if (booking.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Booking request has already been reviewed');
      }

      const purchaseRef = orgRef.collection('purchases').doc(booking.purchase_id);
      const purchaseSnap = await tx.get(purchaseRef);
      if (!purchaseSnap.exists) {
        throw new HttpsError('not-found', 'Package purchase not found');
      }

      const purchase = purchaseSnap.data()!;
      if (purchase.client_id !== booking.client_id || purchase.payment_status !== 'active') {
        throw new HttpsError('failed-precondition', 'Package is no longer active');
      }

      const slots = Array.isArray(purchase.sessions_by_treatment)
        ? purchase.sessions_by_treatment.map((slot: Record<string, unknown>) => ({ ...slot }))
        : [];
      const purchaseUpdates: Record<string, unknown> = {
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (slots.length > 0) {
        const slot = slots.find((item) => item.treatment_id === booking.treatment_id);
        const remaining = Number(slot?.remaining ?? 0);
        if (!slot || remaining <= 0) {
          throw new HttpsError('failed-precondition', 'No remaining sessions for this treatment');
        }
        slot.remaining = remaining - 1;
        const totalRemaining = slots.reduce((sum, item) => sum + Number(item.remaining ?? 0), 0);
        purchaseUpdates.sessions_by_treatment = slots;
        purchaseUpdates.sessions_remaining = totalRemaining;
        if (totalRemaining === 0) purchaseUpdates.payment_status = 'completed';
      } else {
        const remaining = Number(purchase.sessions_remaining ?? 0);
        if (remaining <= 0) {
          throw new HttpsError('failed-precondition', 'No remaining package sessions');
        }
        const nextRemaining = remaining - 1;
        purchaseUpdates.sessions_remaining = nextRemaining;
        if (nextRemaining === 0) purchaseUpdates.payment_status = 'completed';
      }

      const selectedSlot = asSlot(request.data?.selectedSlot ?? booking.preferred_slot, 'selectedSlot');
      const selectedStaffName = typeof request.data?.selectedStaffName === 'string' && request.data.selectedStaffName.trim()
        ? request.data.selectedStaffName.trim()
        : booking.staff_name ?? 'Staff';
      const appointment = {
        organization_id: orgId,
        client_id: booking.client_id,
        client_name: booking.client_name,
        client_email: booking.client_email,
        client_phone: booking.client_phone,
        appointment_date: selectedSlot.date,
        appointment_time: selectedSlot.time,
        staff_id: selectedSlot.staff_id,
        staff_name: selectedStaffName,
        treatment_id: booking.treatment_id,
        treatment_name: booking.treatment_name,
        duration: Number(booking.duration ?? 60),
        status: 'scheduled',
        notes: booking.notes ?? '',
        package_id: booking.package_id ?? null,
        purchase_id: booking.purchase_id,
        session_used: true,
        booking_request_id: requestId,
        acuity_sync_enabled: false,
        sync_status: 'pending',
        created_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      tx.set(appointmentRef, appointment);
      tx.update(purchaseRef, purchaseUpdates);
      tx.update(requestRef, {
        status: 'approved',
        appointment_id: appointmentRef.id,
        approved_slot: selectedSlot,
        reviewed_by: request.auth!.uid,
        reviewed_by_name: staff.fullName ?? staff.email ?? '',
        reviewed_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });

      return appointment;
    });

    const acuityResult = await createAcuityAppointment(orgId, appointmentRef.id, appointmentPayload);
    if (acuityResult.status !== 'synced') {
      await appointmentRef.update({
        sync_status: acuityResult.status,
        sync_error: acuityResult.reason ?? null,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return { status: 'approved', appointmentId: appointmentRef.id, acuity: acuityResult };
  },
);
