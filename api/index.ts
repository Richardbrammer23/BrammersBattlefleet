import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clientIp, handleApi } from '../server/api.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = (typeof req.query.path === 'string' ? req.query.path : url.pathname.replace(/^\/api/, '')) || '/';
  const query = Object.fromEntries([...url.searchParams.entries()].filter(([k]) => k !== 'path'));
  const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const out = await handleApi({ method: req.method ?? 'GET', path, query, headers, body: req.body, ip: clientIp(req.headers) });
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.body);
}
