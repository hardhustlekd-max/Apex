import { app } from '../src/app.js';
import { db } from '../src/core/db.js';
import { predictionsDb } from '../src/core/predictionsDb.js';

let initialized = false;

export default async function handler(req: any, res: any) {
  if (!initialized) {
    try {
      await db.init();
      await predictionsDb.init();
      initialized = true;
    } catch (e) {
      console.warn('Vercel serverless DB init warning:', e);
    }
  }

  // Catch-all serverless handler for /api/* routes on Vercel
  const forwardedUri = req.headers['x-forwarded-uri'] as string | undefined;
  const matchedPath = req.headers['x-matched-path'] as string | undefined;
  const rawQuery = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  if (forwardedUri && forwardedUri.startsWith('/api')) {
    req.url = forwardedUri;
  } else if (matchedPath && matchedPath.startsWith('/api')) {
    req.url = matchedPath + rawQuery;
  } else if (req.query?.path) {
    const subPath = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
    req.url = `/api/${subPath}${rawQuery}`;
  }

  req.originalUrl = req.url;
  return app(req, res);
}
