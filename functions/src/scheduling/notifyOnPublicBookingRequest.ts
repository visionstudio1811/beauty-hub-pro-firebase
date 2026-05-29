import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import {
  formatDateForDisplay,
  formatTimeForDisplay,
  getActiveEmailAutomation,
  isValidEmail,
  renderAndSend,
  resolveEmailContext,
} from './bookingEmailSend';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface BookingRequestDoc {
  client_name?: string;
  client_email?: string | null;
  client_phone?: string | null;
  treatment_name?: string;
  staff_name?: string | null;
  preferred_slot?: { date?: string; time?: string };
  notes?: string;
  source?: string;
  status?: string;
}

/**
 * Fires when a public-link booking request is created. Sends two branded emails:
 *   1. Acknowledgment to the visitor (booking_request_received template / public_booking_request trigger).
 *   2. Alert to every active org admin (booking_request_admin_alert template / public_booking_request_admin trigger).
 *
 * Both reuse the org's Resend integration + email_templates pipeline — same
 * branded HTML wrapper, logo, header image, footer.
 *
 * No-ops gracefully when integration / automations / templates aren't set up.
 */
export const notifyOnPublicBookingRequest = onDocumentCreated(
  {
    document: 'organizations/{orgId}/bookingRequests/{requestId}',
    secrets: ['RESEND_API_KEY'],
  },
  async (event) => {
    const orgId = event.params.orgId;
    const requestId = event.params.requestId;
    const snap = event.data;
    if (!snap) return;
    const req = snap.data() as BookingRequestDoc;

    // Public-link path only. client_portal bookings stay on the existing flow
    // (silent until approval, then appointmentScheduledNotification fires).
    if (req.source !== 'public_link') return;

    const dateStr = String(req.preferred_slot?.date || '');
    const timeStr = String(req.preferred_slot?.time || '');
    const visitorName = (String(req.client_name || 'there').trim()) || 'there';

    // -------- Email 1: visitor acknowledgment --------
    if (isValidEmail(req.client_email)) {
      const visitorAutomation = await getActiveEmailAutomation(orgId, 'public_booking_request');
      if (visitorAutomation) {
        const ctx = await resolveEmailContext(orgId, 'booking_request_received');
        if (!ctx) {
          console.warn('notifyOnPublicBookingRequest: Resend not configured for visitor ack', { orgId, requestId });
        } else {
          const tz = String(ctx.orgData.timezone || 'America/New_York');
          const vars: Record<string, string> = {
            NAME: visitorName,
            TREATMENT: String(req.treatment_name || 'your appointment'),
            DATE: formatDateForDisplay(dateStr, tz),
            TIME: formatTimeForDisplay(timeStr),
            STAFF: String(req.staff_name || ''),
            ORG: String(ctx.orgData.name || ctx.fromName),
          };
          try {
            await renderAndSend({
              orgId,
              toEmail: req.client_email,
              toName: visitorName,
              automation: visitorAutomation,
              ctx,
              vars,
              sendKind: 'system:publicBookingRequest:visitor_ack',
              bookingRequestId: requestId,
            });
            console.log('notifyOnPublicBookingRequest: visitor ack sent', {
              orgId, requestId, to: req.client_email,
            });
          } catch (err) {
            console.error('notifyOnPublicBookingRequest: visitor ack failed', {
              orgId, requestId, error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    // -------- Email 2: admin alert (to every active admin in the org) --------
    const adminAutomation = await getActiveEmailAutomation(orgId, 'public_booking_request_admin');
    if (adminAutomation) {
      const ctx = await resolveEmailContext(orgId, 'booking_request_admin_alert');
      if (!ctx) {
        console.warn('notifyOnPublicBookingRequest: Resend not configured for admin alert', { orgId, requestId });
        return;
      }

      const adminsSnap = await db
        .collection('users')
        .where('organizationId', '==', orgId)
        .where('role', '==', 'admin')
        .where('isActive', '==', true)
        .get();
      const adminUsers = adminsSnap.docs
        .map((d) => ({ email: d.data()?.email as string, name: d.data()?.fullName as string }))
        .filter((u) => isValidEmail(u.email));

      if (adminUsers.length === 0) {
        console.log('notifyOnPublicBookingRequest: no active admin emails', { orgId, requestId });
        return;
      }

      const tz = String(ctx.orgData.timezone || 'America/New_York');
      const adminVars: Record<string, string> = {
        NAME: visitorName,
        TREATMENT: String(req.treatment_name || 'your appointment'),
        DATE: formatDateForDisplay(dateStr, tz),
        TIME: formatTimeForDisplay(timeStr),
        STAFF: String(req.staff_name || ''),
        ORG: String(ctx.orgData.name || ctx.fromName),
        VISITOR_NAME: visitorName,
        VISITOR_EMAIL: String(req.client_email || ''),
        VISITOR_PHONE: String(req.client_phone || ''),
        VISITOR_NOTES: String(req.notes || ''),
      };

      for (const user of adminUsers) {
        try {
          await renderAndSend({
            orgId,
            toEmail: user.email,
            toName: user.name || 'Admin',
            automation: adminAutomation,
            ctx,
            vars: adminVars,
            sendKind: 'system:publicBookingRequest:admin_alert',
            bookingRequestId: requestId,
          });
          console.log('notifyOnPublicBookingRequest: admin alert sent', {
            orgId, requestId, to: user.email,
          });
        } catch (err) {
          console.error('notifyOnPublicBookingRequest: admin alert failed', {
            orgId, requestId, to: user.email,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  },
);
