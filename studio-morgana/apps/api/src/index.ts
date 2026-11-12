// Studio Morgana Worker: /api (JSON), /files (R2, immutable), everything else is the web app (static assets).
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { App } from './env';
import { identify } from './auth';
import { account } from './account';
import { pieces } from './pieces';
import { projects } from './projects';
import { admin } from './admin';

const app = new Hono<App>();

// writes must carry a header a cross-site form cannot send, so a session cookie alone can never change anything
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('x-morgana') !== '1') {
    return c.json({ error: 'missing x-morgana header' }, 403);
  }
  await next();
});
app.use('/api/*', identify);
app.route('/api', account);
app.route('/api', pieces);
app.route('/api', projects);
app.route('/api/admin', admin);
app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

// files in R2: posters, videos and uploaded images; keys are content- or version-addressed, so they never change
app.get('/files/*', async (c) => {
  const key = decodeURIComponent(new URL(c.req.url).pathname.slice('/files/'.length));
  if (!/^(o|f)\/[\w./-]+$/.test(key) || key.includes('..')) return c.text('not found', 404);
  const obj = await c.env.BUCKET.get(key, { range: c.req.raw.headers, onlyIf: c.req.raw.headers });
  if (!obj) return c.text('not found', 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('cache-control', 'public, max-age=31536000, immutable');
  h.set('accept-ranges', 'bytes');
  if (!('body' in obj)) return new Response(null, { status: 304, headers: h });
  const r = obj.range as { offset?: number; length?: number } | undefined;
  if (r && c.req.header('range')) {
    const start = r.offset ?? 0, len = r.length ?? obj.size - start;
    h.set('content-range', `bytes ${start}-${start + len - 1}/${obj.size}`);
    h.set('content-length', String(len));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set('content-length', String(obj.size));
  return new Response(obj.body, { headers: h });
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'something went wrong on our side' }, 500);
});

export default app;
