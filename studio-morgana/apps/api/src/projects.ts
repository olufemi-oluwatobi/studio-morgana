// Projects: your own walls. Pin any piece (yours or a featured one) to a project; pins never copy the piece.
// Visitors can have projects too; they move to your account when you sign up or sign in (adoptVisitorWork).
import { Hono } from 'hono';
import type { App, Env, Who } from './env';
import { CARD_SELECT, card, type CardRow } from './pieces';
import { isPieceType } from './types';
import { fail, id, now } from './util';

export const projects = new Hono<App>();

const MAX_PROJECTS = 200;
const nameOf = (v: unknown) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (!s) fail(400, 'give the project a name');
  return s.slice(0, 80);
};
const body = async <T>(c: { req: { json: <X>() => Promise<X> } }): Promise<T> => { try { return await c.req.json<T>(); } catch { fail(400, 'expected a JSON body'); } };

async function own(env: Env, who: Who, pid: string) {
  const p = await env.DB.prepare('SELECT id, name, owner FROM projects WHERE id = ? AND deleted = 0').bind(pid).first<{ id: string; name: string; owner: string }>();
  if (!p) fail(404, 'that project does not exist');
  if (p.owner !== who.owner) fail(403, 'not your project');
  return p;
}

// the sidebar: your projects, newest activity first, each with a count and the poster of its latest pin
projects.get('/projects', async (c) => {
  const who = c.get('who');
  const { results } = await c.env.DB.prepare(`
    SELECT pr.id, pr.name, pr.updated,
      (SELECT COUNT(*) FROM project_pins pp JOIN pieces p ON p.id = pp.piece_id WHERE pp.project_id = pr.id AND p.deleted = 0 AND (p.owner = pr.owner OR p.visibility = 'public')) AS count,
      (SELECT o.key FROM project_pins pp JOIN pieces p ON p.id = pp.piece_id JOIN outputs o ON o.version_id = p.version_id AND o.name = 'poster-480'
        WHERE pp.project_id = pr.id AND p.deleted = 0 AND (p.owner = pr.owner OR p.visibility = 'public') ORDER BY pp.pinned DESC LIMIT 1) AS cover
    FROM projects pr WHERE pr.owner = ? AND pr.deleted = 0 ORDER BY pr.updated DESC LIMIT ?`,
  ).bind(who.owner, MAX_PROJECTS).all<{ id: string; name: string; updated: number; count: number; cover: string | null }>();
  return c.json({ projects: results.map((r) => ({ ...r, cover: r.cover ? '/files/' + r.cover : null })) }, 200, { 'cache-control': 'no-store' });
});

projects.post('/projects', async (c) => {
  const who = c.get('who');
  const b = await body<{ name?: string; pieceId?: string }>(c);
  const name = nameOf(b.name);
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE owner = ? AND deleted = 0').bind(who.owner).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_PROJECTS) fail(429, `you can have up to ${MAX_PROJECTS} projects`);
  const pid = id(), t = now();
  const stmts = [c.env.DB.prepare('INSERT INTO projects (id, owner, name, created, updated) VALUES (?, ?, ?, ?, ?)').bind(pid, who.owner, name, t, t)];
  // "New project" from a piece's pin menu: make it and pin the piece in one go
  if (typeof b.pieceId === 'string') {
    stmts.push(c.env.DB.prepare('INSERT OR IGNORE INTO project_pins (project_id, piece_id, pinned) SELECT ?, id, ? FROM pieces WHERE id = ? AND deleted = 0 AND (owner = ? OR visibility = \'public\')').bind(pid, t, b.pieceId, who.owner));
  }
  await c.env.DB.batch(stmts);
  return c.json({ project: { id: pid, name, updated: t, count: stmts.length - 1, cover: null } });
});

projects.patch('/projects/:id', async (c) => {
  const who = c.get('who');
  const p = await own(c.env, who, c.req.param('id'));
  const name = nameOf((await body<{ name?: string }>(c)).name);
  await c.env.DB.prepare('UPDATE projects SET name = ?, updated = ? WHERE id = ?').bind(name, now(), p.id).run();
  return c.json({ ok: true, name });
});

projects.delete('/projects/:id', async (c) => {
  const who = c.get('who');
  const p = await own(c.env, who, c.req.param('id'));
  await c.env.DB.prepare('UPDATE projects SET deleted = 1, updated = ? WHERE id = ?').bind(now(), p.id).run();
  return c.json({ ok: true });
});
projects.post('/projects/:id/restore', async (c) => {
  const who = c.get('who');
  const r = await c.env.DB.prepare('UPDATE projects SET deleted = 0, updated = ? WHERE id = ? AND owner = ?').bind(now(), c.req.param('id'), who.owner).run();
  if (!r.meta.changes) fail(404, 'nothing to restore');
  return c.json({ ok: true });
});

// a project's wall: its pins, newest first (filtered by type like the main wall)
projects.get('/projects/:id/wall', async (c) => {
  const who = c.get('who');
  const p = await own(c.env, who, c.req.param('id'));
  const type = c.req.query('type');
  const offset = Math.max(0, Number(c.req.query('cursor') || 0) | 0);
  const limit = Math.min(60, Math.max(6, Number(c.req.query('limit') || 30) | 0));
  const typeSql = isPieceType(type) ? ' AND p.type = ?' : '';
  const { results } = await c.env.DB.prepare(
    `${CARD_SELECT} JOIN project_pins pp ON pp.piece_id = p.id AND pp.project_id = ?
     WHERE p.deleted = 0 AND p.status = 'ready' AND (p.owner = ? OR p.visibility = 'public')${typeSql} ORDER BY pp.pinned DESC LIMIT ? OFFSET ?`,
  ).bind(p.id, who.owner, ...(typeSql ? [type] : []), limit + 1, offset).all<CardRow>();
  return c.json({
    project: { id: p.id, name: p.name },
    pieces: results.slice(0, limit).map((r) => card(r, who)),
    next: results.length > limit ? offset + limit : null,
  }, 200, { 'cache-control': 'no-store' });
});

// pin and unpin (any piece you can see; featured ones included)
projects.put('/projects/:id/pins/:piece', async (c) => {
  const who = c.get('who');
  const p = await own(c.env, who, c.req.param('id'));
  const t = now();
  const seen = "deleted = 0 AND (owner = ? OR visibility = 'public')";
  const r = await c.env.DB.prepare(`INSERT OR IGNORE INTO project_pins (project_id, piece_id, pinned) SELECT ?, id, ? FROM pieces WHERE id = ? AND ${seen}`)
    .bind(p.id, t, c.req.param('piece'), who.owner).run();
  if (!r.meta.changes) {
    const exists = await c.env.DB.prepare(`SELECT 1 FROM pieces WHERE id = ? AND ${seen}`).bind(c.req.param('piece'), who.owner).first();
    if (!exists) fail(404, 'that piece does not exist');
  }
  await c.env.DB.prepare('UPDATE projects SET updated = ? WHERE id = ?').bind(t, p.id).run();
  return c.json({ ok: true, pinned: !!r.meta.changes });
});
projects.delete('/projects/:id/pins/:piece', async (c) => {
  const who = c.get('who');
  const p = await own(c.env, who, c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM project_pins WHERE project_id = ? AND piece_id = ?').bind(p.id, c.req.param('piece')).run();
  return c.json({ ok: true });
});
