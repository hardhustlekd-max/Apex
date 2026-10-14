import { app } from '../src/app.js';

export default function handler(req: any, res: any) {
  // Ensure req.url preserves the actual requested path on Vercel
  const forwardedUri = req.headers['x-forwarded-uri'] as string | undefined;
  const matchedPath = req.headers['x-matched-path'] as string | undefined;
  const rawQuery = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

  if (forwardedUri && forwardedUri.startsWith('/api')) {
    req.url = forwardedUri;
  } else if (matchedPath && matchedPath.startsWith('/api')) {
    req.url = matchedPath + rawQuery;
  } else if (req.query?.__path) {
    const subPath = Array.isArray(req.query.__path) ? req.query.__path.join('/') : req.query.__path;
    req.url = `/api/${subPath}${rawQuery}`;
  } else if (req.url === '/' || req.url === '' || req.url === '/api' || req.url === '/api/') {
    req.url = '/api/health';
  }

  return app(req, res);
}

