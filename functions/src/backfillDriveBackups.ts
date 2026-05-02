import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { drive_v3 } from 'googleapis';
import { ensureFolderPath, sanitizeSegment, uploadPdf } from './lib/googleDrive';
import { OAUTH_SECRETS, getDriveClientForOrg } from './oauth/driveOAuth';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

type WaiverKind = 'waiver' | 'intake' | 'agreement';

const PAGE_SIZE = 25;
const TIMEOUT_BUFFER_MS = 60_000;
const FUNCTION_TIMEOUT_S = 540;

function kindToFolder(kind: WaiverKind): string {
  if (kind === 'intake') return 'Intakes';
  if (kind === 'agreement') return 'Agreements';
  return 'Waivers';
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function formatDateForFilename(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const valid = !isNaN(d.getTime()) ? d : new Date();
  return (
    `${valid.getUTCFullYear()}-${pad(valid.getUTCMonth() + 1)}-${pad(valid.getUTCDate())}` +
    `_${pad(valid.getUTCHours())}-${pad(valid.getUTCMinutes())}`
  );
}

interface DriveTarget { drive: drive_v3.Drive; rootFolderId: string }

const templateCache = new Map<string, { title: string; kind: WaiverKind }>();
async function loadTemplate(orgId: string, templateId: string): Promise<{ title: string; kind: WaiverKind }> {
  const cacheKey = `${orgId}/${templateId}`;
  const cached = templateCache.get(cacheKey);
  if (cached) return cached;
  const snap = await db.collection('organizations').doc(orgId).collection('waiverTemplates').doc(templateId).get();
  const td = snap.data() ?? {};
  const result = {
    title: (td.title as string) || 'Form',
    kind: (td.kind as WaiverKind) || 'waiver',
  };
  templateCache.set(cacheKey, result);
  return result;
}

async function backupOneWaiver(orgId: string, target: DriveTarget, doc: FirebaseFirestore.QueryDocumentSnapshot): Promise<void> {
  const data = doc.data();
  const token = data.token as string | undefined;
  if (!token) throw new Error('waiver has no token');

  let templateTitle = 'Form';
  let kind: WaiverKind = (data.kind as WaiverKind) ?? 'waiver';
  if (data.templateId) {
    const tpl = await loadTemplate(orgId, data.templateId as string);
    templateTitle = tpl.title;
    if (!data.kind) kind = tpl.kind;
  }

  const clientName =
    (data.signer_name as string) ||
    (data.clientName as string) ||
    'Unknown Client';

  const file = bucket.file(`waivers/${token}.pdf`);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`PDF missing at waivers/${token}.pdf`);
  const [buffer] = await file.download();

  const folderId = await ensureFolderPath(target.drive, [kindToFolder(kind), clientName], target.rootFolderId);
  const filename = `${formatDateForFilename(data.signed_at as string)}_${templateTitle}`;
  const uploaded = await uploadPdf(target.drive, { folderId, name: filename, buffer });

  await doc.ref.update({
    drive_backup: {
      fileId: uploaded.id,
      webViewLink: uploaded.webViewLink,
      backedUpAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });
}

async function backupOneInvoice(orgId: string, target: DriveTarget, doc: FirebaseFirestore.QueryDocumentSnapshot): Promise<void> {
  const data = doc.data();
  const storagePath = (data.pdf_storage_path as string) ?? `invoices/${orgId}/${doc.id}.pdf`;
  const clientSnapshot = (data.client_snapshot as { name?: string }) ?? {};
  const clientName = clientSnapshot.name || 'Unknown Client';
  const invoiceNumber = (data.invoice_number as string) || doc.id;

  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`PDF missing at ${storagePath}`);
  const [buffer] = await file.download();

  const folderId = await ensureFolderPath(target.drive, ['Invoices', clientName], target.rootFolderId);
  const filename = `${invoiceNumber}_${sanitizeSegment(clientName)}`;
  const uploaded = await uploadPdf(target.drive, { folderId, name: filename, buffer });

  await doc.ref.update({
    drive_backup: {
      fileId: uploaded.id,
      webViewLink: uploaded.webViewLink,
      backedUpAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  });
}

async function backfillCollection(
  baseQuery: FirebaseFirestore.Query,
  shouldSkip: (data: FirebaseFirestore.DocumentData) => boolean,
  uploader: (doc: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>,
  deadline: number,
  errors: string[]
): Promise<{ processed: number; done: boolean }> {
  let processed = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  while (Date.now() < deadline) {
    let q = baseQuery.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) return { processed, done: true };

    for (const doc of snap.docs) {
      if (Date.now() > deadline) return { processed, done: false };
      if (shouldSkip(doc.data())) continue;
      try {
        await uploader(doc);
        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (errors.length < 5) errors.push(`${doc.id}: ${msg}`);
        console.error(`[backfillDriveBackups] ${doc.ref.path}: ${msg}`);
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) return { processed, done: true };
  }
  return { processed, done: false };
}

export const backfillDriveBackups = onCall(
  { secrets: OAUTH_SECRETS, timeoutSeconds: FUNCTION_TIMEOUT_S, memory: '1GiB', region: 'us-central1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { organizationId } = (request.data ?? {}) as { organizationId?: string };

    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError('permission-denied', 'User not found');
    const u = userDoc.data()!;
    const orgId = organizationId || u.organizationId;
    if (!orgId || u.organizationId !== orgId) throw new HttpsError('permission-denied', 'Organization mismatch');
    if (u.role !== 'admin') throw new HttpsError('permission-denied', 'Admin role required');

    const driveCtx = await getDriveClientForOrg(orgId);
    if (!driveCtx) {
      throw new HttpsError('failed-precondition', 'Google Drive is not connected for this organization');
    }
    if (!driveCtx.config.folder_id) {
      throw new HttpsError('failed-precondition', 'Drive folder is missing. Reconnect Google Drive.');
    }
    const target: DriveTarget = { drive: driveCtx.drive, rootFolderId: driveCtx.config.folder_id };

    const startedAt = Date.now();
    const deadline = startedAt + (FUNCTION_TIMEOUT_S * 1000) - TIMEOUT_BUFFER_MS;
    const errors: string[] = [];

    const waiversQuery = db
      .collection('organizations').doc(orgId)
      .collection('clientWaivers')
      .where('status', '==', 'signed');

    const invoicesQuery = db
      .collection('organizations').doc(orgId)
      .collection('invoices');

    const waiversResult = await backfillCollection(
      waiversQuery,
      (data) => !!data.drive_backup?.fileId,
      (doc) => backupOneWaiver(orgId, target, doc),
      deadline,
      errors,
    );

    let invoicesResult = { processed: 0, done: true };
    if (Date.now() < deadline) {
      invoicesResult = await backfillCollection(
        invoicesQuery,
        (data) => !data.pdf_url || !!data.drive_backup?.fileId,
        (doc) => backupOneInvoice(orgId, target, doc),
        deadline,
        errors,
      );
    } else {
      invoicesResult = { processed: 0, done: false };
    }

    return {
      processed: { waivers: waiversResult.processed, invoices: invoicesResult.processed },
      done: waiversResult.done && invoicesResult.done,
      errors,
    };
  }
);
