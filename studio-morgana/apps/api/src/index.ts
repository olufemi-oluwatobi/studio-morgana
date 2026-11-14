// Studio Morgana Worker: /api (JSON), /files (R2, immutable), everything else is the web app (static assets).
import { runJobs } from './jobs';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { App, Env } from './env';
import { identify } from './auth';
import { account } from './account';
import { pieces } from './pieces';
import { projects } from './projects';
import { admin } from './admin';

const app = new Hono<App>();

// one address: the bare domain goes to www (keeps sign-in cookies and links on one host)
app.use('*', async (c, next) => {
  const u = new URL(c.req.url);
  if (u.hostname === 'studiomorgana.xyz') { u.hostname = 'www.studiomorgana.xyz'; return c.redirect(u.toString(), 301); }
  await next();
});

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

// Errors the person caused (HTTPException: a bad request, a limit) say what to do; anything else is ours: log it with a
// reference and show only the reference.
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  const ref = (c.req.header('cf-ray') || crypto.randomUUID()).slice(0, 8);
  console.error(JSON.stringify({ event: 'error', ref, path: new URL(c.req.url).pathname, message: String((err as Error)?.message || err), stack: (err as Error)?.stack?.split('\n').slice(0, 6) }));
  return c.json({ error: `Something went wrong on our side. Please try again. (ref ${ref})` }, 500);
});

// the same safe defaults on every API and file response
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('x-content-type-options', 'nosniff');
  c.res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
});

export default {
  fetch: app.fetch,
  // the cron trigger in wrangler.jsonc: refresh the showcase, tidy expired rows
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(runJobs(env)); },
};
