import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { ensureFolderPath, uploadPdf } from './lib/googleDrive';
import { OAUTH_SECRETS, getDriveClientForOrg } from './oauth/driveOAuth';

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

type WaiverKind = 'waiver' | 'intake' | 'agreement';

function kindToFolder(kind: WaiverKind): string {
  if (kind === 'intake') return 'Intakes';
  if (kind === 'agreement') return 'Agreements';
  return 'Waivers';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateForFilename(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const valid = !isNaN(d.getTime()) ? d : new Date();
  return (
    `${valid.getUTCFullYear()}-${pad(valid.getUTCMonth() + 1)}-${pad(valid.getUTCDate())}` +
    `_${pad(valid.getUTCHours())}-${pad(valid.getUTCMinutes())}`
  );
}

export const backupWaiverToDrive = onDocumentUpdated(
  {
    document: 'organizations/{orgId}/clientWaivers/{waiverId}',
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
    if (before.status === 'signed' || after.status !== 'signed') return;
    if (after.drive_backup?.fileId) return;

    const { orgId, waiverId } = event.params as { orgId: string; waiverId: string };
    const token = (after.token as string) ?? '';
    if (!token) {
      console.warn(`[backupWaiverToDrive] waiver ${waiverId} has no token; skipping`);
      return;
    }

    const driveCtx = await getDriveClientForOrg(orgId);
    if (!driveCtx) {
      console.warn(`[backupWaiverToDrive] no Drive connected for org ${orgId}; skipping`);
      return;
    }
    const { drive, config } = driveCtx;
    if (!config.folder_id) {
      console.warn(`[backupWaiverToDrive] org ${orgId} has no folder_id; skipping`);
      return;
    }

    let templateTitle = 'Form';
    let kind: WaiverKind = (after.kind as WaiverKind) ?? 'waiver';
    if (after.templateId) {
      const tplDoc = await db
        .collection('organizations').doc(orgId)
        .collection('waiverTemplates').doc(after.templateId as string)
        .get();
      const td = tplDoc.data();
      if (td) {
        templateTitle = (td.title as string) ?? templateTitle;
        if (!after.kind) kind = (td.kind as WaiverKind) ?? kind;
      }
    }

    const clientName =
      (after.signer_name as string) ||
      (after.clientName as string) ||
      'Unknown Client';

    const file = bucket.file(`waivers/${token}.pdf`);
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`[backupWaiverToDrive] PDF missing at waivers/${token}.pdf; skipping`);
      return;
    }
    const [buffer] = await file.download();

    const folderId = await ensureFolderPath(
      drive,
      [kindToFolder(kind), clientName],
      config.folder_id
    );
    const filename = `${formatDateForFilename(after.signed_at as string)}_${templateTitle}`;
    const uploaded = await uploadPdf(drive, { folderId, name: filename, buffer });

    await event.data!.after.ref.update({
      drive_backup: {
        fileId: uploaded.id,
        webViewLink: uploaded.webViewLink,
        backedUpAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });

    console.log(`[backupWaiverToDrive] backed up ${kind} ${waiverId} to Drive ${uploaded.id}`);
  }
);
