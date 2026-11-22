import { Router, Request, Response as ExpressResponse, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import {
  DATA_DIR,
  createConsistentSqliteSnapshot,
  getSqliteDbStats,
  getSqliteGateState,
  isSqliteDbFilePresent,
  isSqliteEnabled,
  replaceSqliteDbFromFile,
} from '../core/sqliteClient.js';
import { db } from '../core/db.js';
import { predictionsDb } from '../core/predictionsDb.js';
import { fixturesWorkerService } from '../services/fixturesWorkerService.js';
import { loggerService } from '../services/loggerService.js';

export const driveDbRouter = Router();

const DRIVE_DB_FILENAME = 'football_engine.db';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveFileMeta {
  id: string;
  name: string;
  size?: string;
  modifiedTime?: string;
  mimeType?: string;
  webViewLink?: string;
}

// Enforce strictly dev server preview usage only
driveDbRouter.use((_req: Request, res: ExpressResponse, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      isDevPreview: false,
      error: 'Google Drive SQLite storage is restricted to dev server preview only.',
    });
  }
  next();
});

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token.length > 10 ? token : null;
}

async function parseGoogleDriveError(resp: globalThis.Response, fallbackPrefix: string): Promise<{
  status: number;
  needsReauth: boolean;
  message: string;
}> {
  const errText = await resp.text().catch(() => '');
  let apiMessage = '';
  let reason = '';
  try {
    const parsed = JSON.parse(errText);
    apiMessage = parsed?.error?.message || '';
    reason = parsed?.error?.errors?.[0]?.reason || '';
  } catch {}

  const lowerMsg = apiMessage.toLowerCase();
  const isScopeOrTokenError =
    resp.status === 401 ||
    reason === 'authError' ||
    reason === 'insufficientPermissions' ||
    reason === 'unauthorized' ||
    lowerMsg.includes('insufficient authentication scopes') ||
    lowerMsg.includes('invalid credentials');

  if (reason === 'accessNotConfigured' || lowerMsg.includes('has not been used in project') || lowerMsg.includes('it is disabled')) {
    return {
      status: 403,
      needsReauth: false,
      message: apiMessage || 'Google Drive API is not enabled on the Google Cloud project.',
    };
  }

  if (isScopeOrTokenError) {
    return {
      status: 401,
      needsReauth: true,
      message: apiMessage
        ? `Google Drive authorization failed (${apiMessage}). Please sign in again and allow Google Drive file access.`
        : 'Google Drive session expired or missing Drive file permission. Please sign in again.',
    };
  }

  return {
    status: resp.status >= 400 ? resp.status : 500,
    needsReauth: false,
    message: apiMessage || `${fallbackPrefix} (${resp.status})${errText ? `: ${errText.slice(0, 180)}` : ''}`,
  };
}

async function listDriveBackupFiles(token: string): Promise<DriveFileMeta[]> {
  const q = encodeURIComponent(`name = '${DRIVE_DB_FILENAME}' and trashed = false`);
  const fields = encodeURIComponent('files(id, name, size, modifiedTime, mimeType, webViewLink)');
  const url = `${DRIVE_FILES_ENDPOINT}?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=${fields}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    const parsed = await parseGoogleDriveError(resp, 'Google Drive list failed');
    const err: any = new Error(parsed.message);
    err.status = parsed.status;
    err.needsReauth = parsed.needsReauth;
    throw err;
  }

  const data = (await resp.json()) as { files?: DriveFileMeta[] };
  return Array.isArray(data.files) ? data.files : [];
}

/**
 * GET /api/drive-db/status
 * Checks current backup file in Google Drive + local SQLite disk stats
 */
driveDbRouter.get('/status', async (req: Request, res: ExpressResponse) => {
  try {
    const token = extractBearerToken(req);
    const localStats = getSqliteDbStats();
    const sqliteGate = getSqliteGateState();

    if (!token) {
      return res.json({
        success: true,
        isDevPreview: true,
        authenticated: false,
        driveFile: null,
        localStats,
        sqliteGate,
      });
    }

    const files = await listDriveBackupFiles(token);
    return res.json({
      success: true,
      isDevPreview: true,
      authenticated: true,
      driveFile: files[0] || null,
      filesCount: files.length,
      localStats,
      sqliteGate,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' && err.status >= 400 ? err.status : 500;
    const needsReauth = Boolean(err?.needsReauth || status === 401);
    return res.status(status).json({
      success: false,
      isDevPreview: true,
      needsReauth,
      error: err?.message || 'Failed to check Google Drive backup status.',
    });
  }
});

/**
 * POST /api/drive-db/upload
 * Creates a clean online SQLite snapshot and uploads (creates or updates) it in Google Drive via resumable upload.
 */
driveDbRouter.post('/upload', async (req: Request, res: ExpressResponse) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      needsReauth: true,
      error: 'Missing Google Drive authorization token.',
    });
  }

  if (!isSqliteEnabled() || !isSqliteDbFilePresent()) {
    return res.status(409).json({
      success: false,
      sqliteBlocked: true,
      sqliteGate: getSqliteGateState(),
      error: 'SQLite database is switched off or missing. Enable SQLite DB manually before uploading to Google Drive.',
    });
  }

  const tmpSnapshotPath = path.join(DATA_DIR, `football_engine.drive_upload_${Date.now()}.tmp`);

  try {
    // 1. Capture transactionally consistent snapshot of football_engine.db
    await createConsistentSqliteSnapshot(tmpSnapshotPath);
    const stat = fs.statSync(tmpSnapshotPath);
    const fileSize = stat.size;

    // 2. Determine whether to update an existing Drive file or create a new one
    let targetFileId: string | undefined =
      typeof req.body?.fileId === 'string' && req.body.fileId.trim()
        ? req.body.fileId.trim()
        : undefined;

    if (!targetFileId) {
      const existing = await listDriveBackupFiles(token);
      if (existing.length > 0) {
        targetFileId = existing[0].id;
      }
    }

    const metadata = {
      name: DRIVE_DB_FILENAME,
      mimeType: 'application/x-sqlite3',
      description: 'Dev preview SQLite database backup for Football Prediction Engine',
      appProperties: {
        app: 'football-prediction-engine',
        env: 'dev-preview',
      },
    };

    // 3. Initiate Google Drive Resumable Upload session
    const sessionUrl = targetFileId
      ? `${DRIVE_UPLOAD_ENDPOINT}/${encodeURIComponent(targetFileId)}?uploadType=resumable&fields=id,name,size,modifiedTime,mimeType,webViewLink`
      : `${DRIVE_UPLOAD_ENDPOINT}?uploadType=resumable&fields=id,name,size,modifiedTime,mimeType,webViewLink`;

    const initResp = await fetch(sessionUrl, {
      method: targetFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/x-sqlite3',
        'X-Upload-Content-Length': String(fileSize),
      },
      body: JSON.stringify(metadata),
    });

    if (!initResp.ok) {
      const parsed = await parseGoogleDriveError(initResp, 'Failed to initiate Google Drive upload');
      const err: any = new Error(parsed.message);
      err.status = parsed.status;
      err.needsReauth = parsed.needsReauth;
      throw err;
    }

    const uploadUri = initResp.headers.get('location');
    if (!uploadUri) {
      throw new Error('Google Drive did not return a resumable upload URI.');
    }

    // 4. Upload snapshot binary content
    const fileBuffer = await fs.promises.readFile(tmpSnapshotPath);
    const uploadResp = await fetch(uploadUri, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/x-sqlite3',
        'Content-Length': String(fileSize),
      },
      body: fileBuffer,
    });

    if (!uploadResp.ok) {
      const errText = await uploadResp.text().catch(() => '');
      throw new Error(`Google Drive file upload failed (${uploadResp.status}): ${errText.slice(0, 200)}`);
    }

    const uploadedMeta = (await uploadResp.json()) as DriveFileMeta;

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'DATABASE',
      source: 'DriveSync',
      message: `Saved SQLite snapshot (${(fileSize / (1024 * 1024)).toFixed(2)} MB) to Google Drive (${uploadedMeta.id}) for dev preview.`,
    });

    return res.json({
      success: true,
      action: targetFileId ? 'UPDATED' : 'CREATED',
      driveFile: uploadedMeta,
      sizeBytes: fileSize,
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' && err.status >= 400 ? err.status : 500;
    return res.status(status).json({
      success: false,
      needsReauth: Boolean(err?.needsReauth || status === 401),
      error: err?.message || 'Failed to upload SQLite database to Google Drive.',
    });
  } finally {
    try {
      if (fs.existsSync(tmpSnapshotPath)) fs.unlinkSync(tmpSnapshotPath);
    } catch {}
  }
});

/**
 * POST /api/drive-db/restore
 * Downloads football_engine.db from Google Drive, validates integrity, replaces local DB, and reloads worker index.
 */
driveDbRouter.post('/restore', async (req: Request, res: ExpressResponse) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      needsReauth: true,
      error: 'Missing Google Drive authorization token.',
    });
  }

  const tmpRestorePath = path.join(DATA_DIR, `football_engine.drive_restore_${Date.now()}.tmp`);

  try {
    let fileId: string | undefined =
      typeof req.body?.fileId === 'string' && req.body.fileId.trim()
        ? req.body.fileId.trim()
        : undefined;

    if (!fileId) {
      const files = await listDriveBackupFiles(token);
      if (files.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No SQLite backup file found in Google Drive.',
        });
      }
      fileId = files[0].id;
    }

    const downloadUrl = `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`;
    const downloadResp = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!downloadResp.ok) {
      const parsed = await parseGoogleDriveError(downloadResp, 'Failed to download Google Drive backup');
      const err: any = new Error(parsed.message);
      err.status = parsed.status;
      err.needsReauth = parsed.needsReauth;
      throw err;
    }

    const arrayBuf = await downloadResp.arrayBuffer();
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    await fs.promises.writeFile(tmpRestorePath, Buffer.from(arrayBuf));

    const restoreResult = await replaceSqliteDbFromFile(tmpRestorePath);
    await db.init();
    await predictionsDb.init().catch(() => {});
    await fixturesWorkerService.ensureIndexReady(true).catch(() => {});

    loggerService.addLog({
      level: 'SUCCESS',
      category: 'DATABASE',
      source: 'DriveSync',
      message: `Restored SQLite database (${(restoreResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB) from Google Drive (${fileId}) into dev server preview.`,
    });

    return res.json({
      success: true,
      restoredFileId: fileId,
      sizeBytes: restoreResult.sizeBytes,
      tableCounts: restoreResult.tableCounts,
      sqliteGate: getSqliteGateState(),
    });
  } catch (err: any) {
    const status = typeof err?.status === 'number' && err.status >= 400 ? err.status : 500;
    return res.status(status).json({
      success: false,
      needsReauth: Boolean(err?.needsReauth || status === 401),
      error: err?.message || 'Failed to restore SQLite database from Google Drive.',
    });
  } finally {
    try {
      if (fs.existsSync(tmpRestorePath)) fs.unlinkSync(tmpRestorePath);
    } catch {}
  }
});

/**
 * DELETE /api/drive-db/file/:fileId
 * Deletes the stored SQLite backup file from Google Drive.
 */
driveDbRouter.delete('/file/:fileId', async (req: Request, res: ExpressResponse) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      needsReauth: true,
      error: 'Missing Google Drive authorization token.',
    });
  }

  const fileId = req.params.fileId;
  if (!fileId) {
    return res.status(400).json({ success: false, error: 'Missing fileId parameter.' });
  }

  try {
    const delResp = await fetch(`${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!delResp.ok && delResp.status !== 204) {
      const parsed = await parseGoogleDriveError(delResp, 'Failed to delete Google Drive backup');
      const err: any = new Error(parsed.message);
      err.status = parsed.status;
      err.needsReauth = parsed.needsReauth;
      throw err;
    }

    loggerService.addLog({
      level: 'INFO',
      category: 'DATABASE',
      source: 'DriveSync',
      message: `Deleted dev preview SQLite backup (${fileId}) from Google Drive.`,
    });

    return res.json({ success: true, deletedFileId: fileId });
  } catch (err: any) {
    const status = typeof err?.status === 'number' && err.status >= 400 ? err.status : 500;
    return res.status(status).json({
      success: false,
      needsReauth: Boolean(err?.needsReauth || status === 401),
      error: err?.message || 'Failed to delete Google Drive backup.',
    });
  }
});
