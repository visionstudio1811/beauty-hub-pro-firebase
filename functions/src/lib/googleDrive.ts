import { drive_v3 } from 'googleapis';
import { Readable } from 'stream';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Cache keyed by rootFolderId so caches from different orgs cannot collide.
const folderIdCache = new Map<string, string>();

export function sanitizeSegment(input: string): string {
  if (!input) return 'unknown';
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = cleaned.slice(0, 80);
  return capped || 'unknown';
}

function escapeQueryString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string
): Promise<string> {
  const q = `name = '${escapeQueryString(name)}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
  const list = await drive.files.list({
    q,
    fields: 'files(id, name)',
    pageSize: 1,
    spaces: 'drive',
  });
  const existing = list.data.files?.[0]?.id;
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
  });
  if (!created.data.id) throw new Error(`Drive failed to return id for created folder ${name}`);
  return created.data.id;
}

export async function ensureFolderPath(
  drive: drive_v3.Drive,
  parts: string[],
  rootFolderId: string
): Promise<string> {
  const sanitized = parts.map(sanitizeSegment);
  const cacheKey = `${rootFolderId}::${sanitized.join('/')}`;
  const cached = folderIdCache.get(cacheKey);
  if (cached) return cached;

  let parentId = rootFolderId;
  let runningKey = rootFolderId;
  for (const part of sanitized) {
    runningKey = `${runningKey}/${part}`;
    const cachedSub = folderIdCache.get(runningKey);
    if (cachedSub) {
      parentId = cachedSub;
      continue;
    }
    parentId = await findOrCreateFolder(drive, part, parentId);
    folderIdCache.set(runningKey, parentId);
  }
  folderIdCache.set(cacheKey, parentId);
  return parentId;
}

export async function uploadPdf(
  drive: drive_v3.Drive,
  opts: { folderId: string; name: string; buffer: Buffer }
): Promise<{ id: string; webViewLink: string }> {
  const fileName = sanitizeSegment(opts.name);
  const ext = fileName.toLowerCase().endsWith('.pdf') ? '' : '.pdf';
  const created = await drive.files.create({
    requestBody: {
      name: `${fileName}${ext}`,
      parents: [opts.folderId],
      mimeType: 'application/pdf',
    },
    media: {
      mimeType: 'application/pdf',
      body: Readable.from(opts.buffer),
    },
    fields: 'id, webViewLink',
  });
  if (!created.data.id) throw new Error('Drive upload returned no id');
  return {
    id: created.data.id,
    webViewLink: created.data.webViewLink ?? '',
  };
}

export async function verifyFolderAccess(
  drive: drive_v3.Drive,
  folderId: string
): Promise<{ name: string; canWrite: boolean }> {
  const meta = await drive.files.get({
    fileId: folderId,
    fields: 'id, name, mimeType, capabilities(canAddChildren)',
  });
  if (meta.data.mimeType !== FOLDER_MIME) {
    throw new Error('That ID is not a folder');
  }
  return {
    name: meta.data.name ?? '',
    canWrite: !!meta.data.capabilities?.canAddChildren,
  };
}
