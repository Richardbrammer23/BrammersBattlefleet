import type { Plugin } from 'vite';
import { clientIp, handleApi } from './api.js';

/** Serves /api/* from the same handler used on Vercel, so `npm run dev` runs the full stack. */
export function apiDevPlugin(): Plugin {
  const attach = (server: { middlewares: { use: (path: string, fn: (req: never, res: never, next: () => void) => void) => void } }) => {
    server.middlewares.use('/api', (async (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse,
    ) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      let body: unknown = undefined;
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
      } catch {
        body = undefined;
      }
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
      const out = await handleApi({
        method: req.method ?? 'GET',
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        headers,
        body,
        ip: clientIp(req.headers, req.socket.remoteAddress ?? 'local'),
      });
      res.statusCode = out.status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(out.body));
    }) as never);
  };
  return { name: 'bbf-api-dev', configureServer: attach as never, configurePreviewServer: attach as never };
}
