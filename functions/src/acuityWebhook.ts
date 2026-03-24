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

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const computed = hmac.digest('base64');
    return signature === computed;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

async function handleAppointmentWebhook(payload: WebhookPayload, organizationId: string) {
  console.log(`Processing appointment webhook: ${payload.action} for appointment ${payload.id}`);

  const email = payload.email || null;
  const phone = payload.phone || null;

  if (payload.action === 'appointment.canceled') {
    await db
      .collection('organizations')
      .doc(organizationId)
      .collection('appointments')
      .where('acuity_appointment_id', '==', payload.id)
      .get()
      .then(async snap => {
        for (const d of snap.docs) {
          await d.ref.update({
            status: 'cancelled',
            last_synced_at: new Date().toISOString(),
            sync_status: 'synced',
          });
        }
      });

    await db
      .collection('organizations')
      .doc(organizationId)
      .collection('acuitySyncLogs')
      .add({
        sync_type: 'webhook',
        entity_type: 'appointment',
        acuity_id: payload.id,
        action: 'update',
        status: 'success',
        data_synced: { ...payload, status: 'cancelled' },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { success: true, message: `Processed ${payload.action} for appointment ${payload.id}` };
  }

  if (
    payload.action === 'appointment.scheduled' ||
    payload.action === 'appointment.rescheduled' ||
    payload.action === 'appointment.updated'
  ) {
    // Find or upsert client
    let clientId: string | null = null;
    const clientsRef = db.collection('organizations').doc(organizationId).collection('clients');

    let existingClientSnap = null as admin.firestore.QuerySnapshot | null;
    if (email) {
      existingClientSnap = await clientsRef.where('email', '==', email).limit(1).get();
    }
    if ((!existingClientSnap || existingClientSnap.empty) && phone) {
      existingClientSnap = await clientsRef.where('phone', '==', phone).limit(1).get();
    }

    const clientPayload: any = {
      name: `${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
      email,
      phone: phone || '',
      acuity_sync_enabled: true,
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };

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

    // Check if appointment exists
    const apptSnap = await db
      .collection('organizations')
      .doc(organizationId)
      .collection('appointments')
      .where('acuity_appointment_id', '==', payload.id)
      .limit(1)
      .get();

    const appointmentData: any = {
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

    const apptRef = db.collection('organizations').doc(organizationId).collection('appointments');
    if (!apptSnap.empty) {
      await apptSnap.docs[0].ref.update(appointmentData);
    } else {
      await apptRef.add({ ...appointmentData, created_at: admin.firestore.FieldValue.serverTimestamp() });
    }

    await db
      .collection('organizations')
      .doc(organizationId)
      .collection('acuitySyncLogs')
      .add({
        sync_type: 'webhook',
        entity_type: 'appointment',
        acuity_id: payload.id,
        action: apptSnap.empty ? 'create' : 'update',
        status: 'success',
        data_synced: payload,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
  }

  return { success: true, message: `Processed ${payload.action} for appointment ${payload.id}` };
}

export const acuityWebhook = onRequest(
  { secrets: ['ACUITY_API_KEY'] },
  async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'content-type');
    res.status(204).send('');
    return;
  }

  try {
    const signature = req.headers['x-acuity-signature'] as string || '';
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

    console.log('Received Acuity webhook:', payload);

    // Find enabled Acuity config
    const configSnapshot = await db
      .collectionGroup('acuitySyncConfig')
      .where('sync_enabled', '==', true)
      .limit(1)
      .get();

    if (configSnapshot.empty) {
      console.log('No enabled Acuity configuration found');
      res.status(404).json({ success: false, error: 'No enabled Acuity configuration found' });
      return;
    }

    const orgConfig = configSnapshot.docs[0].data();
    const organizationId = orgConfig.organization_id as string;

    // Verify webhook signature
    const secret = orgConfig.webhook_secret || process.env.ACUITY_API_KEY || '';
    if (secret && signature) {
      const isValid = verifyWebhookSignature(rawBody, signature, secret);
      if (!isValid) {
        console.log('Invalid webhook signature');
        res.status(401).json({ success: false, error: 'Invalid webhook signature' });
        return;
      }
    } else {
      console.warn('Skipping signature verification: missing secret or signature header');
    }

    let result: any;
    if (payload.action?.startsWith('appointment.')) {
      result = await handleAppointmentWebhook(payload, organizationId);
    } else {
      console.log(`Unhandled webhook action: ${payload.action}`);
      result = { success: true, message: `Received but did not process action: ${payload.action}` };
    }

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
  }
);
