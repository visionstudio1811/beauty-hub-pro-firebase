import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface AcuitySyncRequest {
  action: 'sync_clients' | 'sync_appointments' | 'full_sync';
  organization_id: string;
  cursor?: number;
  batch_size?: number;
}

interface AcuityConfig {
  acuity_user_id: string;
  api_key_encrypted: string;
  sync_enabled: boolean;
  sync_direction: string;
  conflict_resolution: string;
}

async function fetchFromAcuity(endpoint: string, userId: string, apiKey: string) {
  const credentials = Buffer.from(`${userId}:${apiKey}`).toString('base64');
  const url = `https://acuityscheduling.com/api/v1/${endpoint}`;
  // request dispatched

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Acuity API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

function normalizeEmail(email: any): string | null {
  if (!email || typeof email !== 'string') return null;
  return email.trim().toLowerCase();
}

function normalizePhone(phone: any): string | null {
  if (!phone) return null;
  const s = String(phone).trim();
  const sanitized = s.replace(/[\s\-()]/g, '');
  return sanitized || null;
}

async function syncClientsFromAcuity(
  config: AcuityConfig,
  organizationId: string,
  cursor = 0,
  batchSize = 200
) {
  // client sync started

  if (cursor === 0) {
    await fetchFromAcuity('me', config.acuity_user_id, config.api_key_encrypted);
    // connectivity ok
  }

  const acuityClients = await fetchFromAcuity(
    `clients?limit=${batchSize}&offset=${cursor}`,
    config.acuity_user_id,
    config.api_key_encrypted
  ) as any[];

  if (!Array.isArray(acuityClients)) {
    throw new Error('Invalid response from Acuity API - expected array of clients');
  }

  const clientsRef = db.collection('organizations').doc(organizationId).collection('clients');
  let successCount = 0;
  let errorCount = 0;

  for (const acuityClient of acuityClients) {
    try {
      const hasName = Boolean(acuityClient.firstName || acuityClient.lastName);
      const email = acuityClient.email || null;
      const phone = acuityClient.phone || null;
      if (!hasName || !(email || phone)) {
        errorCount++;
        continue;
      }

      const emailNorm = normalizeEmail(email);
      const phoneNorm = normalizePhone(phone);
      const acuityId = acuityClient.id ? String(acuityClient.id) : null;

      let existingId: string | null = null;

      if (acuityId) {
        const snap = await clientsRef.where('acuity_customer_id', '==', acuityId).limit(1).get();
        if (!snap.empty) existingId = snap.docs[0].id;
      }
      if (!existingId && emailNorm) {
        const snap = await clientsRef.where('email', '==', emailNorm).limit(1).get();
        if (!snap.empty) existingId = snap.docs[0].id;
      }
      if (!existingId && phoneNorm) {
        const snap = await clientsRef.where('phone', '==', phoneNorm).limit(1).get();
        if (!snap.empty) existingId = snap.docs[0].id;
      }

      const clientData: any = {
        name: `${acuityClient.firstName || ''} ${acuityClient.lastName || ''}`.trim(),
        email: emailNorm,
        phone: phoneNorm || '',
        address: acuityClient.address || null,
        city: acuityClient.city || null,
        notes: acuityClient.notes || null,
        acuity_sync_enabled: true,
        last_synced_at: new Date().toISOString(),
        sync_status: 'synced',
        organization_id: organizationId,
        acuity_customer_id: acuityId,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (existingId) {
        await clientsRef.doc(existingId).update(clientData);
      } else {
        await clientsRef.add({ ...clientData, deleted_at: null, created_at: admin.firestore.FieldValue.serverTimestamp() });
      }

      // Log only non-PII metadata — never store full client records
      await db
        .collection('organizations')
        .doc(organizationId)
        .collection('acuitySyncLogs')
        .add({
          sync_type: 'clients_page',
          entity_type: 'client',
          acuity_id: String(acuityClient.id ?? 'unknown'),
          action: existingId ? 'update' : 'create',
          status: 'success',
          cursor,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      successCount++;
    } catch (clientError: any) {
      console.error(`Error processing client ${acuityClient.id}:`, clientError);
      errorCount++;
    }
  }

  const hasMore = acuityClients.length === batchSize;
  return {
    success: true,
    count: successCount,
    errors: errorCount,
    next_cursor: hasMore ? cursor + acuityClients.length : null,
    has_more: hasMore,
  };
}

async function syncAppointmentsFromAcuity(config: AcuityConfig, organizationId: string) {
  // appointment sync started

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 90);
  const minDate = new Date();
  minDate.setDate(minDate.getDate() - 30);

  const appointments = await fetchFromAcuity(
    `appointments?minDate=${minDate.toISOString().split('T')[0]}&maxDate=${maxDate.toISOString().split('T')[0]}`,
    config.acuity_user_id,
    config.api_key_encrypted
  ) as any[];

  const apptRef = db.collection('organizations').doc(organizationId).collection('appointments');
  const clientsRef = db.collection('organizations').doc(organizationId).collection('clients');

  for (const acuityAppt of appointments) {
    const email = acuityAppt.email || null;
    const phone = acuityAppt.phone || null;

    let clientId: string | null = null;
    let existingClient: any = null;

    if (email) {
      const snap = await clientsRef.where('email', '==', email).limit(1).get();
      if (!snap.empty) existingClient = snap.docs[0];
    }
    if (!existingClient && phone) {
      const snap = await clientsRef.where('phone', '==', phone).limit(1).get();
      if (!snap.empty) existingClient = snap.docs[0];
    }

    const clientPayload: any = {
      name: `${acuityAppt.firstName || ''} ${acuityAppt.lastName || ''}`.trim(),
      email,
      phone: phone || '',
      organization_id: organizationId,
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (existingClient) {
      clientId = existingClient.id;
      await clientsRef.doc(clientId!).update(clientPayload);
    } else if (clientPayload.name && (email || phone)) {
      const newClient = await clientsRef.add({
        ...clientPayload,
        deleted_at: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      clientId = newClient.id;
    }

    const apptSnap = await apptRef
      .where('acuity_appointment_id', '==', acuityAppt.id.toString())
      .limit(1)
      .get();

    const appointmentData: any = {
      client_id: clientId,
      client_name: `${acuityAppt.firstName || ''} ${acuityAppt.lastName || ''}`.trim(),
      client_email: acuityAppt.email,
      client_phone: acuityAppt.phone,
      appointment_date: acuityAppt.date,
      appointment_time: acuityAppt.time,
      duration: parseInt(acuityAppt.duration),
      treatment_name: acuityAppt.type,
      staff_name: 'Acuity Staff',
      notes: acuityAppt.notes,
      acuity_appointment_id: acuityAppt.id.toString(),
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      organization_id: organizationId,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!apptSnap.empty) {
      await apptSnap.docs[0].ref.update(appointmentData);
    } else {
      await apptRef.add({ ...appointmentData, created_at: admin.firestore.FieldValue.serverTimestamp() });
    }
  }

  // appointment sync complete
  return { success: true, count: appointments.length };
}

export const acuitySync = onCall(
  { secrets: ['ACUITY_API_USER_ID', 'ACUITY_API_KEY'] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Unauthorized');
    }

    const data = request.data as AcuitySyncRequest;
    const { action, organization_id, cursor = 0, batch_size = 200 } = data;

    if (!organization_id) {
      throw new HttpsError('invalid-argument', 'Organization ID is required');
    }

    // Verify user is admin of this organization
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists) {
      throw new HttpsError('permission-denied', 'User not found');
    }
    const userData = userDoc.data()!;
    if (userData.role !== 'admin' || userData.organizationId !== organization_id) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const configSnap = await db
      .collection('organizations')
      .doc(organization_id)
      .collection('acuitySyncConfig')
      .limit(1)
      .get();

    if (configSnap.empty) {
      throw new HttpsError('not-found', 'Acuity sync is not configured for this organization');
    }

    const configData = configSnap.docs[0].data();

    const acuityUserId = process.env.ACUITY_API_USER_ID;
    const acuityApiKey = process.env.ACUITY_API_KEY;

    if (!acuityUserId || !acuityApiKey) {
      throw new HttpsError('internal', 'Acuity API credentials not configured');
    }

    if (!configData.sync_enabled) {
      throw new HttpsError('failed-precondition', 'Acuity sync is not enabled for this organization');
    }

    const config: AcuityConfig = {
      ...configData as any,
      acuity_user_id: acuityUserId,
      api_key_encrypted: acuityApiKey,
    };

    if (action === 'sync_clients') {
      const result = await syncClientsFromAcuity(config, organization_id, cursor, batch_size);
      return { success: true, message: `Synced ${result.count} clients (offset ${cursor})`, data: result };
    }

    if (action === 'sync_appointments') {
      const result = await syncAppointmentsFromAcuity(config, organization_id);
      return { success: true, message: `Synced ${result.count} appointments`, data: result };
    }

    if (action === 'full_sync') {
      const clientsResult = await syncClientsFromAcuity(config, organization_id, cursor, batch_size);
      if (clientsResult.has_more) {
        return {
          success: true,
          message: `Synced ${clientsResult.count} clients (batch at offset ${cursor}), more remaining...`,
          data: { clients: clientsResult.count, phase: 'clients', next_cursor: clientsResult.next_cursor, has_more: true },
        };
      }

      const apptResult = await syncAppointmentsFromAcuity(config, organization_id);

      await db
        .collection('organizations')
        .doc(organization_id)
        .collection('acuitySyncConfig')
        .doc(configSnap.docs[0].id)
        .update({ last_full_sync: new Date().toISOString() });

      return {
        success: true,
        message: `Full sync completed: ${clientsResult.count} clients, ${apptResult.count} appointments`,
        data: { clients: clientsResult.count, appointments: apptResult.count, phase: 'complete', has_more: false },
      };
    }

    throw new HttpsError('invalid-argument', `Unknown action: ${action}`);
  }
);
