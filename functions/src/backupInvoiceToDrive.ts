import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { ensureFolderPath, sanitizeSegment, uploadPdf } from './lib/googleDrive';
import { OAUTH_SECRETS, getDriveClientForOrg } from './oauth/driveOAuth';

if (!admin.apps.length) admin.initializeApp();

const bucket = admin.storage().bucket();

export const backupInvoiceToDrive = onDocumentUpdated(
  {
    document: 'organizations/{orgId}/invoices/{invoiceId}',
    secrets: OAUTH_SECRETS,
    retry: false,
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.pdf_url || !after.pdf_url) return;
    if (after.drive_backup?.fileId) return;

    const { orgId, invoiceId } = event.params as { orgId: string; invoiceId: string };

    const driveCtx = await getDriveClientForOrg(orgId);
    if (!driveCtx) {
      console.warn(`[backupInvoiceToDrive] no Drive connected for org ${orgId}; skipping`);
      return;
    }
    const { drive, config } = driveCtx;
    if (!config.folder_id) {
      console.warn(`[backupInvoiceToDrive] org ${orgId} has no folder_id; skipping`);
      return;
    }

    const storagePath = (after.pdf_storage_path as string) ?? `invoices/${orgId}/${invoiceId}.pdf`;
    const clientSnapshot = (after.client_snapshot as { name?: string }) ?? {};
    const clientName = clientSnapshot.name || 'Unknown Client';
    const invoiceNumber = (after.invoice_number as string) || invoiceId;

    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`[backupInvoiceToDrive] PDF missing at ${storagePath}; skipping`);
      return;
    }
    const [buffer] = await file.download();

    const folderId = await ensureFolderPath(drive, ['Invoices', clientName], config.folder_id);
    const filename = `${invoiceNumber}_${sanitizeSegment(clientName)}`;
    const uploaded = await uploadPdf(drive, { folderId, name: filename, buffer });

    await event.data!.after.ref.update({
      drive_backup: {
        fileId: uploaded.id,
        webViewLink: uploaded.webViewLink,
        backedUpAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    console.log(`[backupInvoiceToDrive] backed up invoice ${invoiceNumber} to Drive ${uploaded.id}`);
  }
);
