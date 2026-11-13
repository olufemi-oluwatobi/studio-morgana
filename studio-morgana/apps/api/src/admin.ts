// Admin: the featured collection, and pieces added by hand (the seed). Admins only.
import { Hono } from 'hono';
import type { App } from './env';
import { requireAdmin } from './auth';
import { runJobs, type JobName } from './jobs';
import { fail, id, now, str, titleOf } from './util';

export const admin = new Hono<App>();
admin.use('*', async (c, next) => { requireAdmin(c); await next(); });

// replace a collection's pieces, in order
admin.put('/collections/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) fail(400, 'bad collection name');
  const b = await c.req.json<{ title?: string; pieceIds?: string[] }>().catch(() => ({} as { title?: string; pieceIds?: string[] }));
  const ids = (Array.isArray(b.pieceIds) ? b.pieceIds : []).filter((x) => typeof x === 'string').slice(0, 500);
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO collections (slug, title) VALUES (?, ?) ON CONFLICT (slug) DO UPDATE SET title = COALESCE(?, title)')
      .bind(slug, b.title || slug, b.title || null),
    c.env.DB.prepare('DELETE FROM collection_items WHERE slug = ?').bind(slug),
    ...ids.map((pid, i) => c.env.DB.prepare('INSERT OR IGNORE INTO collection_items (slug, piece_id, position) SELECT ?, id, ? FROM pieces WHERE id = ?').bind(slug, i, pid)),
  ]);
  // hand-picked means public: they are shown to everyone
  if (slug === 'featured' && ids.length) {
    await c.env.DB.prepare(`UPDATE pieces SET visibility = 'public', published = COALESCE(published, ?) WHERE id IN (${ids.map(() => '?').join(',')})`).bind(now(), ...ids).run();
  }
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM collection_items WHERE slug = ?').bind(slug).first<{ n: number }>();
  return c.json({ slug, count: n?.n ?? 0 });
});

admin.get('/collections/:slug', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT piece_id FROM collection_items WHERE slug = ? ORDER BY position').bind(c.req.param('slug')).all<{ piece_id: string }>();
  return c.json({ pieceIds: results.map((r) => r.piece_id) });
});

// a piece from a source and uploaded files; it starts as a draft until a browser renders and commits it
admin.post('/pieces', async (c) => {
  const who = c.get('who');
  const b = await c.req.json<{ source?: string; files?: { name: string; key: string }[]; title?: string }>().catch(() => ({} as { source?: string; files?: { name: string; key: string }[]; title?: string }));
  const source = str(b.source, 'source', 200_000);
  const pid = id(), vid = id(), t = now();
  const files = Array.isArray(b.files) ? b.files.slice(0, 64) : [];
  const stmts = [
    c.env.DB.prepare(`INSERT INTO pieces (id, owner, title, status, created, updated) VALUES (?, ?, ?, 'draft', ?, ?)`).bind(pid, who.owner, b.title || titleOf(source), t, t),
    c.env.DB.prepare(`INSERT INTO versions (id, piece_id, n, source, by, created) VALUES (?, ?, 1, ?, 'seed', ?)`).bind(vid, pid, source.endsWith('\n') ? source : source + '\n', t),
  ];
  for (const f of files) {
    if (typeof f?.name !== 'string' || typeof f?.key !== 'string' || !/^[\w.-]{1,120}$/.test(f.name)) fail(400, 'bad file entry');
    stmts.push(c.env.DB.prepare('INSERT INTO piece_files (piece_id, name, key, type, bytes) SELECT ?, ?, key, type, bytes FROM uploads WHERE key = ? AND owner = ?')
      .bind(pid, f.name, f.key, who.owner));
  }
  await c.env.DB.batch(stmts);
  return c.json({ id: pid, versionId: vid });
});

admin.get('/drafts', async (c) => {
  const who = c.get('who');
  const { results } = await c.env.DB.prepare(`SELECT id, title FROM pieces WHERE owner = ? AND status = 'draft' AND deleted = 0 ORDER BY created`).bind(who.owner).all();
  return c.json({ drafts: results });
});

// the scheduler: run the jobs now (the cron does the same every six hours), and see when they last ran
admin.post('/jobs/run', async (c) => {
  const b = await c.req.json<{ job?: string }>().catch(() => ({} as { job?: string }));
  const only = b.job === 'showcase' || b.job === 'housekeeping' ? (b.job as JobName) : 'all';
  return c.json({ results: await runJobs(c.env, only) });
});
admin.get('/jobs', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT name, ran, ms, result FROM job_runs ORDER BY name').all<{ name: string; ran: number; ms: number; result: string }>();
  return c.json({ jobs: results.map((r) => ({ ...r, result: JSON.parse(r.result) })) });
});
