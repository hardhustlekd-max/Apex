import { app } from '../src/app.js';
import { db } from '../src/core/db.js';
import { predictionsDb } from '../src/core/predictionsDb.js';

let initialized = false;

export default async function handler(req: any, res: any) {
  // Ensure DBs are initialized before processing in serverless environment
  if (!initialized) {
    try {
      await db.init();
      await predictionsDb.init();
      initialized = true;
    } catch (e) {
      console.warn('Vercel serverless DB init warning:', e);
    }
  }

  // Ensure req.url preserves the actual requested path on Vercel
  const forwardedUri = req.headers['x-forwarded-uri'] as string | undefined;
  const matchedPath = req.headers['x-matched-path'] as string | undefined;

  if (forwardedUri && forwardedUri.startsWith('/api')) {
    req.url = forwardedUri;
  } else if (matchedPath && matchedPath.startsWith('/api')) {
    const rawQuery = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = matchedPath + rawQuery;
  } else if (req.query?.__path) {
    const subPath = Array.isArray(req.query.__path) ? req.query.__path.join('/') : req.query.__path;
    try {
      const urlObj = new URL(req.url, 'http://localhost');
      urlObj.searchParams.delete('__path');
      req.url = `/api/${subPath}${urlObj.search}`;
    } catch {
      const rawQuery = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      req.url = `/api/${subPath}${rawQuery}`;
    }
  } else if (req.url === '/' || req.url === '' || req.url === '/api' || req.url === '/api/') {
    req.url = '/api/health';
  }

  req.originalUrl = req.url;

  return app(req, res);
}

