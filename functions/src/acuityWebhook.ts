import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface WebhookPayload {
  id: string;
  action: string;
  appointmentTypeID?: string;
  calendarID?: string;
  datetime?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  type?: string;
  duration?: string;
  notes?: string;
  date?: string;
  time?: string;
}

/** Constant-time comparison to prevent timing attacks */
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const computed = hmac.digest('base64');
    // Use timingSafeEqual to prevent timing attacks
    const sigBuf = Buffer.from(signature);
    const computedBuf = Buffer.from(computed);
    if (sigBuf.length !== computedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, computedBuf);
  } catch {
    return false;
  }
}

async function handleAppointmentWebhook(payload: WebhookPayload, organizationId: string) {
  const email = payload.email || null;
  const phone = payload.phone || null;

  if (payload.action === 'appointment.canceled') {
    const snap = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('appointments')
      .where('acuity_appointment_id', '==', payload.id)
      .get();

    for (const d of snap.docs) {
      await d.ref.update({ status: 'cancelled', last_synced_at: new Date().toISOString(), sync_status: 'synced' });
    }

    // Log only non-PII metadata
    await db.collection('organizations').doc(organizationId).collection('acuitySyncLogs').add({
      sync_type: 'webhook',
      entity_type: 'appointment',
      acuity_id: payload.id,
      action: 'cancel',
      status: 'success',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  }

  if (['appointment.scheduled', 'appointment.rescheduled', 'appointment.updated'].includes(payload.action)) {
    const clientsRef = db.collection('organizations').doc(organizationId).collection('clients');

    let existingClientSnap: admin.firestore.QuerySnapshot | null = null;
    if (email) existingClientSnap = await clientsRef.where('email', '==', email).limit(1).get();
    if ((!existingClientSnap || existingClientSnap.empty) && phone) {
      existingClientSnap = await clientsRef.where('phone', '==', phone).limit(1).get();
    }

    const clientPayload = {
      name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
      email,
      phone: phone || '',
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    let clientId: string | null = null;
    if (existingClientSnap && !existingClientSnap.empty) {
      clientId = existingClientSnap.docs[0].id;
      await clientsRef.doc(clientId).update(clientPayload);
    } else if (clientPayload.name && (email || phone)) {
      const newClient = await clientsRef.add({
        ...clientPayload,
        deleted_at: null,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      clientId = newClient.id;
    }

    const apptRef = db.collection('organizations').doc(organizationId).collection('appointments');
    const apptSnap = await apptRef.where('acuity_appointment_id', '==', payload.id).limit(1).get();

    const appointmentData = {
      client_id: clientId,
      client_name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
      client_email: payload.email,
      client_phone: payload.phone,
      appointment_date: payload.date,
      appointment_time: payload.time,
      duration: parseInt(payload.duration || '60'),
      treatment_name: payload.type || 'Acuity Appointment',
      staff_name: 'Acuity Staff',
      notes: payload.notes,
      acuity_appointment_id: payload.id,
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      organization_id: organizationId,
      status: 'scheduled',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (!apptSnap.empty) {
      await apptSnap.docs[0].ref.update(appointmentData);
    } else {
      await apptRef.add({ ...appointmentData, created_at: admin.firestore.FieldValue.serverTimestamp() });
    }

    // Log only non-PII metadata
    await db.collection('organizations').doc(organizationId).collection('acuitySyncLogs').add({
      sync_type: 'webhook',
      entity_type: 'appointment',
      acuity_id: payload.id,
      action: apptSnap.empty ? 'create' : 'update',
      status: 'success',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  return { success: true };
}

export const acuityWebhook = onRequest(
  { secrets: ['ACUITY_API_KEY'] },
  async (req, res) => {
    // Acuity posts server-to-server — no browser, no CORS needed.
    if (req.method === 'OPTIONS') {
      res.status(405).send('');
      return;
    }

    try {
      // Reject non-POST requests
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const signature = req.headers['x-acuity-signature'] as string | undefined;

      // Signature header is mandatory — reject immediately if missing
      if (!signature) {
        res.status(401).json({ error: 'Missing webhook signature' });
        return;
      }

      const contentType = req.headers['content-type'] || '';
      const rawBody = JSON.stringify(req.body);

      let payload: WebhookPayload;
      if (contentType.includes('application/json')) {
        payload = req.body as WebhookPayload;
      } else {
        const params = new URLSearchParams(rawBody);
        payload = {
          id: params.get('id') || params.get('appointmentID') || params.get('appointmentId') || '',
          action: params.get('action') || '',
          appointmentTypeID: params.get('appointmentTypeID') || undefined,
          calendarID: params.get('calendarID') || undefined,
          datetime: params.get('datetime') || undefined,
          firstName: params.get('firstName') || undefined,
          lastName: params.get('lastName') || undefined,
          email: params.get('email') || undefined,
          phone: params.get('phone') || undefined,
          type: params.get('type') || undefined,
          duration: params.get('duration') || undefined,
          notes: params.get('notes') || undefined,
          date: params.get('date') || undefined,
          time: params.get('time') || undefined,
        };
      }

      // Validate payload has required fields
      if (!payload.id || !payload.action) {
        res.status(400).json({ error: 'Invalid webhook payload' });
        return;
      }

      const configSnapshot = await db
        .collectionGroup('acuitySyncConfig')
        .where('sync_enabled', '==', true)
        .limit(1)
        .get();

      if (configSnapshot.empty) {
        res.status(404).json({ error: 'No Acuity configuration found' });
        return;
      }

      const orgConfig = configSnapshot.docs[0].data();
      const organizationId = orgConfig.organization_id as string;

      // Use dedicated webhook_secret only — do NOT fall back to the API key
      const webhookSecret = orgConfig.webhook_secret as string | undefined;
      if (!webhookSecret) {
        // No secret configured — reject to prevent unauthenticated processing
        res.status(403).json({ error: 'Webhook secret not configured for this organization' });
        return;
      }

      // Always validate signature using constant-time comparison
      const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      let result: { success: boolean };
      if (payload.action?.startsWith('appointment.')) {
        result = await handleAppointmentWebhook(payload, organizationId);
      } else {
        result = { success: true };
      }

      res.status(200).json(result);
    } catch (error: any) {
      // Do not expose internal error details
      console.error('Webhook processing error:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);
