// Pieces: the wall, generating, editing (AI command, hand edit, repair), committing renders, files and remixes.
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { App, Env, Who } from './env';
import { spend } from './auth';
import { HTTPException } from 'hono/http-exception';
import { log } from './wizard/common';
import { editFor, makeOption, pictureOf, planFor, readFiles, repairFor, reviewFor, type Diagnostic, type FileRef, type PartBrief } from './ai';
import type { Img } from './wizard/models';
import { fail, id, now, sha256hex, str, titleOf } from './util';
import { isPieceType } from './types';
import { refreshIfDue } from './jobs';

export const pieces = new Hono<App>();
export { CARD_SELECT, card, type CardRow, type PieceRow };

const CATS = new Set(['cards', 'posts', 'scenes', 'videos']);
const OUTPUTS: Record<string, { types: string[]; max: number; ext: string }> = {
  'poster-480': { types: ['image/webp', 'image/png', 'image/jpeg'], max: 4e6, ext: 'webp' },
  'poster-1200': { types: ['image/webp', 'image/png', 'image/jpeg'], max: 12e6, ext: 'webp' },
  video: { types: ['video/mp4', 'video/webm'], max: 80e6, ext: 'mp4' },
};
const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'text/x-godtongue': 'gt' };
const fileUrl = (key: string | null | undefined) => (key ? '/files/' + key : null);

interface PieceRow {
  id: string; owner: string; title: string; category: string; type: string; status: string; visibility: 'public' | 'private'; published: number | null; version_id: string | null;
  poster_w: number | null; poster_h: number | null; prompt: string | null; parent_id: string | null; deleted: number; created: number; updated: number;
}
interface CardRow extends PieceRow { sm: string | null; lg: string | null; video: string | null }
interface VersionRow { id: string; piece_id: string; n: number; source: string; by: string; command: string | null; parent_id: string | null; fingerprint: string | null; created: number }

const CARD_SELECT = `SELECT p.*, o1.key AS sm, o2.key AS lg, o3.key AS video FROM pieces p
  LEFT JOIN outputs o1 ON o1.version_id = p.version_id AND o1.name = 'poster-480'
  LEFT JOIN outputs o2 ON o2.version_id = p.version_id AND o2.name = 'poster-1200'
  LEFT JOIN outputs o3 ON o3.version_id = p.version_id AND o3.name = 'video'`;

function card(r: CardRow, who: Who) {
  return {
    id: r.id, title: r.title, category: r.category, type: r.type, status: r.status, visibility: r.visibility, mine: r.owner === who.owner,
    w: r.poster_w, h: r.poster_h, sm: fileUrl(r.sm), lg: fileUrl(r.lg), video: fileUrl(r.video), updated: r.updated,
  };
}

// a piece is seen by its owner, and by anyone once it is public. Anything else is "not found", so a private id tells nothing.
const canSee = (p: { owner: string; visibility: string }, who: Who) => p.owner === who.owner || p.visibility === 'public';
async function getPiece(env: Env, pid: string, who?: Who): Promise<PieceRow> {
  const p = await env.DB.prepare('SELECT * FROM pieces WHERE id = ? AND deleted = 0').bind(pid).first<PieceRow>();
  if (!p || (who && !canSee(p, who))) fail(404, 'that piece does not exist');
  return p;
}
async function getVersion(env: Env, pid: string, vid?: string | null): Promise<VersionRow> {
  const v = vid
    ? await env.DB.prepare('SELECT * FROM versions WHERE id = ? AND piece_id = ?').bind(vid, pid).first<VersionRow>()
    : await env.DB.prepare('SELECT v.* FROM versions v JOIN pieces p ON p.version_id = v.id WHERE p.id = ?').bind(pid).first<VersionRow>()
      ?? await env.DB.prepare('SELECT * FROM versions WHERE piece_id = ? ORDER BY n DESC LIMIT 1').bind(pid).first<VersionRow>();
  if (!v) fail(404, 'that version does not exist');
  return v;
}
async function addVersion(env: Env, pid: string, source: string, by: string, command: string | null, parent: string | null): Promise<VersionRow> {
  const vid = id();
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO versions (id, piece_id, n, source, by, command, parent_id, created)
     VALUES (?, ?, (SELECT COALESCE(MAX(n), 0) + 1 FROM versions WHERE piece_id = ?), ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(vid, pid, pid, source, by, command, parent, t).first<VersionRow>();
  await env.DB.prepare('UPDATE pieces SET updated = ? WHERE id = ?').bind(t, pid).run();
  return row!;
}

// editing someone else's piece (a featured one, say) makes your own copy first: a remix
async function editable(env: Env, who: Who, p: PieceRow): Promise<PieceRow> {
  if (p.owner === who.owner) return p;
  if (!canSee(p, who)) fail(404, 'that piece does not exist');
  const nid = id(), t = now();
  const v = await getVersion(env, p.id);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO pieces (id, owner, title, category, type, status, version_id, poster_w, poster_h, prompt, parent_id, created, updated)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`).bind(nid, who.owner, p.title, p.category, p.type, p.status, p.poster_w, p.poster_h, p.prompt, p.id, t, t),
    env.DB.prepare('INSERT INTO piece_files (piece_id, name, key, type, bytes) SELECT ?, name, key, type, bytes FROM piece_files WHERE piece_id = ?').bind(nid, p.id),
  ]);
  const copy = await addVersion(env, nid, v.source, 'fork', null, null);
  await env.DB.batch([
    env.DB.prepare('UPDATE versions SET fingerprint = ? WHERE id = ?').bind(v.fingerprint, copy.id),
    env.DB.prepare('INSERT INTO outputs (version_id, name, key, type, w, h, bytes, created) SELECT ?, name, key, type, w, h, bytes, ? FROM outputs WHERE version_id = ?').bind(copy.id, t, v.id),
    env.DB.prepare('UPDATE pieces SET version_id = ? WHERE id = ?').bind(copy.id, nid),
  ]);
  return (await getPiece(env, nid));
}

async function fileRefs(env: Env, pid: string): Promise<FileRef[]> {
  const { results } = await env.DB.prepare('SELECT name, key, type FROM piece_files WHERE piece_id = ?').bind(pid).all<FileRef>();
  return results;
}

async function filesOf(env: Env, pid: string) {
  const { results } = await env.DB.prepare('SELECT name, key, type, bytes FROM piece_files WHERE piece_id = ? ORDER BY name').bind(pid).all<{ name: string; key: string; type: string; bytes: number }>();
  return results.map((f) => ({ name: f.name, url: fileUrl(f.key)!, type: f.type, bytes: f.bytes }));
}

function versionOut(v: VersionRow) {
  return { id: v.id, n: v.n, source: v.source, by: v.by, command: v.command, parentId: v.parent_id, fingerprint: v.fingerprint, created: v.created };
}

const json = async <T>(c: Context<App>): Promise<T> => { try { return await c.req.json<T>(); } catch { fail(400, 'expected a JSON body'); } };

// ── the wall: your pieces first (newest first), then the featured and showcase pieces (public ones only)
pieces.get('/wall', async (c) => {
  // never run, or the cron missed a day: catch up in the background
  c.executionCtx.waitUntil(refreshIfDue(c.env, 13 * 3600_000));
  const who = c.get('who');
  const type = c.req.query('type'), cat = c.req.query('cat');
  const catSql = isPieceType(type) ? ' AND p.type = ?' : cat && CATS.has(cat) ? ' AND p.category = ?' : '';
  const binds = isPieceType(type) ? [type] : cat && CATS.has(cat) ? [cat] : [];
  const offset = Math.max(0, Number(c.req.query('cursor') || 0) | 0);
  const limit = Math.min(60, Math.max(6, Number(c.req.query('limit') || 30) | 0));
  const featured = await c.env.DB.prepare(
    // hand-picked first (in their order), then what the scheduled job chose from the public pieces
    `${CARD_SELECT} JOIN collection_items ci ON ci.piece_id = p.id AND ci.slug IN ('featured', 'showcase')
     WHERE p.deleted = 0 AND p.status = 'ready' AND p.visibility = 'public'${catSql}
     GROUP BY p.id ORDER BY MIN(CASE ci.slug WHEN 'featured' THEN 0 ELSE 1 END), MIN(ci.position) LIMIT ? OFFSET ?`,
  ).bind(...binds, limit + 1, offset).all<CardRow>();
  const more = featured.results.length > limit;
  let mine: CardRow[] = [];
  if (!offset) {
    mine = (await c.env.DB.prepare(
      `${CARD_SELECT} WHERE p.owner = ? AND p.deleted = 0 AND p.status = 'ready'${catSql} ORDER BY p.updated DESC LIMIT 60`,
    ).bind(who.owner, ...binds).all<CardRow>()).results;
  }
  return c.json({
    mine: mine.map((r) => card(r, who)),
    featured: featured.results.slice(0, limit).map((r) => card(r, who)),
    next: more ? offset + limit : null,
  }, 200, { 'cache-control': 'no-store' });
});

// ── generate: one line of NDJSON per option as soon as it is written, so the wall fills in as they arrive
pieces.post('/generate', async (c) => {
  const who = c.get('who');
  const body = await json<{ prompt?: string; refs?: string[]; uploads?: string[]; inspiration?: string[]; dockets?: string[]; n?: number; projectId?: string }>(c);
  const prompt = str(body.prompt, 'prompt', 2000);
  const n = Math.min(4, Math.max(1, Number(body.n) || 4));
  await spend(c.env, who, 'generate', n);
  const refIds = (Array.isArray(body.refs) ? body.refs : []).filter((x) => typeof x === 'string').slice(0, 4);
  const refs: string[] = [], looksLike: Img[] = [];
  for (const rid of refIds) {
    const v = await c.env.DB.prepare("SELECT v.id AS vid, v.source FROM pieces p JOIN versions v ON v.id = p.version_id WHERE p.id = ? AND p.deleted = 0 AND (p.owner = ? OR p.visibility = 'public')").bind(rid, who.owner).first<{ vid: string; source: string }>();
    if (!v) continue;
    refs.push(v.source);
    // the reader sees the piece as it looks, not only its code
    const pic = await pictureOf(c.env, v.vid).catch(() => null);
    if (pic) looksLike.push({ ...pic, name: `reference piece ${refs.length}` });
  }
  // made from a project's wall: the new pieces are pinned to it
  const project = typeof body.projectId === 'string'
    ? await c.env.DB.prepare('SELECT id FROM projects WHERE id = ? AND owner = ? AND deleted = 0').bind(body.projectId, who.owner).first<{ id: string }>()
    : null;
  const upKeys = (Array.isArray(body.uploads) ? body.uploads : []).filter((x) => typeof x === 'string').slice(0, 4);
  const uploads: { key: string; name: string; type: string; bytes: number }[] = [];
  for (const k of upKeys) {
    const u = await c.env.DB.prepare('SELECT key, name, type, bytes FROM uploads WHERE key = ? AND owner = ?').bind(k, who.owner).first<{ key: string; name: string; type: string; bytes: number }>();
    if (u) uploads.push(u);
  }
  // loose inspiration: images to match in style, never printed and never attached to the piece
  const inspoKeys = (Array.isArray(body.inspiration) ? body.inspiration : []).filter((x) => typeof x === 'string').slice(0, 4);
  const inspo: FileRef[] = [];
  for (const k of inspoKeys) {
    const u = await c.env.DB.prepare('SELECT key, name, type FROM uploads WHERE key = ? AND owner = ?').bind(k, who.owner).first<FileRef>();
    if (u) inspo.push(u);
  }
  if (inspo.length) (await readFiles(c.env, inspo)).images.forEach((im, i) => looksLike.push({ ...im, name: `style image ${i + 1}` }));
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const w = writable.getWriter(), enc = new TextEncoder();
  const send = (o: unknown) => w.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => { /* the client went away */ });
  const env = c.env;
  const late = <T,>(p: Promise<T>, ms: number): Promise<T> => { let t: ReturnType<typeof setTimeout>; return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('late')), ms); })]).finally(() => clearTimeout(t)); };
  const run = async () => {
    await send({ type: 'start', n });
    // a sign of life every few seconds, so the browser (and anything between) can tell slow from stuck
    const beat = setInterval(() => { void send({ type: 'ping' }); }, 8000);
    try {
    // one plan for all the options (the reader looks at the images and picks the manual's chapters), then one write each
    const planned = await late(planFor(env, { prompt, refs, files: uploads.map((u) => ({ name: u.name, key: u.key, type: u.type })), looksLike, dockets: (Array.isArray(body.dockets) ? body.dockets : []).map(String).slice(0, 2) }), 70_000).catch((e) => { console.error('planning failed', e); return null; });
    if (planned) log('plan', { n, dockets: planned.planned.dockets.map((d) => d.id), kind: planned.planned.plan.kind, chapters: planned.planned.chapters.map((c) => c.id), trail: planned.planned.trail });
    await Promise.all(Array.from({ length: n }, async (_, i) => {
      try {
        const made = await late(makeOption(env, planned, { prompt, uploads: uploads.map((u) => u.name), i, n }), 200_000);
        const source = made.source;
        log('option', { i, ok: made.ok, lines: source.split('\n').length, trail: made.trail });
        const pid = id(), t = now();
        await env.DB.prepare(`INSERT INTO pieces (id, owner, title, status, prompt, created, updated) VALUES (?, ?, ?, 'draft', ?, ?, ?)`)
          .bind(pid, who.owner, titleOf(source, prompt.slice(0, 40)), prompt, t, t).run();
        if (uploads.length) await env.DB.batch(uploads.map((u) => env.DB.prepare('INSERT INTO piece_files (piece_id, name, key, type, bytes) VALUES (?, ?, ?, ?, ?)').bind(pid, u.name, u.key, u.type, u.bytes)));
        const v = await addVersion(env, pid, source, 'ai', null, null);
        if (project) await env.DB.prepare('INSERT OR IGNORE INTO project_pins (project_id, piece_id, pinned) VALUES (?, ?, ?)').bind(project.id, pid, now()).run();
        await send({ type: 'piece', index: i, piece: { id: pid, title: titleOf(source, prompt.slice(0, 40)) }, version: versionOut(v), files: await filesOf(env, pid) });
      } catch (e) {
        console.error('option failed', e);
        await send({ type: 'error', index: i, message: e instanceof HTTPException ? e.message : (e as Error).message === 'late' ? 'this is taking too long; please try again' : 'this option could not be made' });
      }
    }));
    } finally { clearInterval(beat); await send({ type: 'done' }); }
  };
  c.executionCtx.waitUntil(run().catch(() => { /* the client went away */ }).finally(() => w.close().catch(() => { })));
  return new Response(readable, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
});

pieces.get('/pieces/:id', async (c) => {
  const who = c.get('who');
  const p = await c.env.DB.prepare(`${CARD_SELECT} WHERE p.id = ? AND p.deleted = 0`).bind(c.req.param('id')).first<CardRow>();
  if (!p || !canSee(p, who)) fail(404, 'that piece does not exist');
  const v = await getVersion(c.env, p.id, c.req.query('version'));
  const { results: vs } = await c.env.DB.prepare('SELECT id, n, by, command, created, fingerprint FROM versions WHERE piece_id = ? ORDER BY n DESC LIMIT 100').bind(p.id).all();
  const { results: pins } = await c.env.DB.prepare(
    'SELECT pp.project_id AS id FROM project_pins pp JOIN projects pr ON pr.id = pp.project_id WHERE pp.piece_id = ? AND pr.owner = ? AND pr.deleted = 0',
  ).bind(p.id, who.owner).all<{ id: string }>();
  return c.json({
    piece: { ...card(p, who), prompt: p.prompt, parentId: p.parent_id, versionId: p.version_id, pinnedIn: pins.map((x) => x.id) },
    version: versionOut(v), versions: vs, files: await filesOf(c.env, p.id),
  }, 200, { 'cache-control': 'no-store' });
});

// ── the command box: the model rewrites the source; the browser compiles, renders and commits it
pieces.post('/pieces/:id/command', async (c) => {
  const who = c.get('who');
  const body = await json<{ text?: string; versionId?: string; parts?: PartBrief[] }>(c);
  const text = str(body.text, 'command', 1000);
  const p = await editable(c.env, who, await getPiece(c.env, c.req.param('id')));
  const base = await getVersion(c.env, p.id, p.id === c.req.param('id') ? body.versionId : null);
  await spend(c.env, who, 'command');
  const parts = (Array.isArray(body.parts) ? body.parts : []).slice(0, 200).map((x) => ({
    n: Number(x.n) | 0, name: String(x.name ?? '').slice(0, 80), face: x.face ? String(x.face).slice(0, 40) : undefined,
    lines: (Array.isArray(x.lines) ? x.lines : []).map(Number).filter(Number.isFinite).slice(0, 50),
  }));
  const r = await editFor(c.env, { source: base.source, parts, text, versionId: base.id, files: await fileRefs(c.env, p.id) });
  // a question gets an answer and no new version
  log('command', { piece: p.id, intent: r.understood.intent, ok: r.ok, rounds: r.rounds, trail: r.trail });
  if (r.answer) return c.json({ pieceId: p.id, answer: r.answer });
  const v = await addVersion(c.env, p.id, r.source, 'ai', text, base.id);
  return c.json({ pieceId: p.id, version: versionOut(v), files: await filesOf(c.env, p.id) });
});

// ── a hand edit from the code box
pieces.post('/pieces/:id/versions', async (c) => {
  const who = c.get('who');
  const body = await json<{ source?: string; parentId?: string }>(c);
  const source = str(body.source, 'source', 200_000);
  const p = await editable(c.env, who, await getPiece(c.env, c.req.param('id')));
  const parent = body.parentId && p.id === c.req.param('id') ? body.parentId : null;
  const v = await addVersion(c.env, p.id, source.endsWith('\n') ? source : source + '\n', 'human', null, parent);
  return c.json({ pieceId: p.id, version: versionOut(v), files: await filesOf(c.env, p.id) });
});

// ── a version that did not compile: the model fixes it
pieces.post('/pieces/:id/repair', async (c) => {
  const who = c.get('who');
  const body = await json<{ versionId?: string; diagnostics?: Diagnostic[] }>(c);
  const p = await getPiece(c.env, c.req.param('id'));
  if (p.owner !== who.owner) fail(403, 'not your piece');
  const v = await getVersion(c.env, p.id, body.versionId);
  const diags = (Array.isArray(body.diagnostics) ? body.diagnostics : []).slice(0, 20).map((d) => ({
    level: String(d.level || 'error'), line: Number(d.line) || undefined, msg: String(d.msg || '').slice(0, 400), hint: d.hint ? String(d.hint).slice(0, 400) : undefined,
  }));
  if (!diags.length) fail(400, 'nothing to repair');
  await spend(c.env, who, 'command');
  const r = await repairFor(c.env, { source: v.source, files: await fileRefs(c.env, p.id) });
  const nv = await addVersion(c.env, p.id, r.source, 'repair', null, v.id);
  log('repair', { piece: p.id, ok: r.ok, trail: r.trail });
  return c.json({ pieceId: p.id, version: versionOut(nv) });
});

// ── a version the browser has drawn: the reader looks at the picture and says whether it does what was asked
pieces.post('/pieces/:id/review', async (c) => {
  const who = c.get('who');
  const body = await json<{ versionId?: string; text?: string }>(c);
  const p = await getPiece(c.env, c.req.param('id'));
  if (p.owner !== who.owner) fail(403, 'not your piece');
  const v = await getVersion(c.env, p.id, str(body.versionId, 'versionId', 64));
  const text = body.text ? str(body.text, 'text', 1000) : v.command || p.prompt || '';
  const review = await reviewFor(c.env, { versionId: v.id, text, source: v.source });
  log('review', { piece: p.id, ok: review?.ok, issues: review?.issues });
  return c.json({ review: review && !review.ok && review.issues.length ? { ok: false, issues: review.issues } : null });
});

// ── the browser rendered a version and uploaded its posters: make it the current one
pieces.post('/pieces/:id/commit', async (c) => {
  const who = c.get('who');
  const body = await json<{ versionId?: string; category?: string; type?: string; fingerprint?: string; w?: number; h?: number }>(c);
  const p = await getPiece(c.env, c.req.param('id'));
  if (p.owner !== who.owner) fail(403, 'not your piece');
  const v = await getVersion(c.env, p.id, str(body.versionId, 'versionId', 64));
  const have = await c.env.DB.prepare(`SELECT COUNT(*) AS k FROM outputs WHERE version_id = ? AND name IN ('poster-480', 'poster-1200')`).bind(v.id).first<{ k: number }>();
  if ((have?.k ?? 0) < 2) fail(409, 'upload both posters before committing');
  const category = body.category && CATS.has(body.category) ? body.category : p.category;
  const type = isPieceType(body.type) ? body.type : category === 'videos' ? 'video' : 'image';
  const fp = typeof body.fingerprint === 'string' ? body.fingerprint.slice(0, 80) : null;
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE versions SET fingerprint = COALESCE(?, fingerprint) WHERE id = ?').bind(fp, v.id),
    c.env.DB.prepare(`UPDATE pieces SET version_id = ?, status = 'ready', category = ?, type = ?, poster_w = ?, poster_h = ?, title = ?, updated = ? WHERE id = ?`)
      .bind(v.id, category, type, Number(body.w) | 0 || p.poster_w, Number(body.h) | 0 || p.poster_h, titleOf(v.source, p.title || 'Untitled'), now(), p.id),
  ]);
  const row = await c.env.DB.prepare(`${CARD_SELECT} WHERE p.id = ?`).bind(p.id).first<CardRow>();
  return c.json({ piece: card(row!, who) });
});

// ── posters and video for one version (versions never change, so their files never change)
pieces.put('/versions/:vid/outputs/:name', async (c) => {
  const who = c.get('who');
  const spec = OUTPUTS[c.req.param('name')];
  if (!spec) fail(400, 'unknown output');
  const v = await c.env.DB.prepare('SELECT v.id, p.owner FROM versions v JOIN pieces p ON p.id = v.piece_id WHERE v.id = ? AND p.deleted = 0')
    .bind(c.req.param('vid')).first<{ id: string; owner: string }>();
  if (!v) fail(404, 'that version does not exist');
  if (v.owner !== who.owner) fail(403, 'not your piece');
  const type = (c.req.header('content-type') || '').split(';')[0].trim();
  if (!spec.types.includes(type)) fail(415, `expected ${spec.types.join(' or ')}`);
  const len = Number(c.req.header('content-length') || 0);
  if (len > spec.max) fail(413, 'that file is too large');
  const body = await c.req.arrayBuffer();
  if (!body.byteLength || body.byteLength > spec.max) fail(413, 'that file is empty or too large');
  const ext = type === 'video/webm' ? 'webm' : type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : spec.ext;
  const key = `o/${v.id}/${c.req.param('name')}.${ext}`;
  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  const w = Number(c.req.header('x-width')) | 0 || null, h = Number(c.req.header('x-height')) | 0 || null;
  await c.env.DB.prepare(`INSERT INTO outputs (version_id, name, key, type, w, h, bytes, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (version_id, name) DO UPDATE SET key = excluded.key, type = excluded.type, w = excluded.w, h = excluded.h, bytes = excluded.bytes`)
    .bind(v.id, c.req.param('name'), key, type, w, h, body.byteLength, now()).run();
  return c.json({ url: fileUrl(key) });
});

pieces.delete('/pieces/:id', async (c) => {
  const who = c.get('who');
  const p = await getPiece(c.env, c.req.param('id'));
  if (p.owner !== who.owner) fail(403, 'not your piece');
  await c.env.DB.prepare('UPDATE pieces SET deleted = 1, updated = ? WHERE id = ?').bind(now(), p.id).run();
  return c.json({ ok: true });
});
// ── public or private. Public: anyone with the link can open it, and the showcase job may pick it. Private: only you.
pieces.post('/pieces/:id/visibility', async (c) => {
  const who = c.get('who');
  const body = await json<{ visibility?: string }>(c);
  if (body.visibility !== 'public' && body.visibility !== 'private') fail(400, 'visibility is public or private');
  const p = await getPiece(c.env, c.req.param('id'));
  if (p.owner !== who.owner) fail(403, 'not your piece');
  if (body.visibility === 'public') {
    if (!who.userId) fail(403, 'sign in to make a piece public');
    if (p.status !== 'ready') fail(409, 'let the piece finish rendering first');
    if (p.visibility !== 'public') await c.env.DB.prepare("UPDATE pieces SET visibility = 'public', published = ? WHERE id = ?").bind(now(), p.id).run();
    // seed the showcase now rather than at the next cron, while it has room (at most once a minute)
    c.executionCtx.waitUntil(refreshIfDue(c.env, 60_000, true));
  } else if (p.visibility !== 'private') {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE pieces SET visibility = 'private', published = NULL WHERE id = ?").bind(p.id),
      c.env.DB.prepare("DELETE FROM collection_items WHERE piece_id = ? AND slug = 'showcase'").bind(p.id),
    ]);
  }
  return c.json({ visibility: body.visibility });
});

pieces.post('/pieces/:id/restore', async (c) => {
  const who = c.get('who');
  const r = await c.env.DB.prepare('UPDATE pieces SET deleted = 0, updated = ? WHERE id = ? AND owner = ?').bind(now(), c.req.param('id'), who.owner).run();
  if (!r.meta.changes) fail(404, 'nothing to restore');
  return c.json({ ok: true });
});

// ── a reference image (or any image a piece prints), content-addressed
pieces.post('/uploads', async (c) => {
  const who = c.get('who');
  const type = (c.req.header('content-type') || '').split(';')[0].trim();
  const ext = IMAGE_TYPES[type];
  if (!ext) fail(415, 'upload a PNG, JPEG, WebP or SVG image (or a .gt file)');
  const body = await c.req.arrayBuffer();
  if (!body.byteLength || body.byteLength > (ext === 'gt' ? 200e3 : 10e6)) fail(413, ext === 'gt' ? 'godtongue files can be up to 200 KB' : 'images can be up to 10 MB');
  const raw = decodeURIComponent(c.req.header('x-file-name') || 'image');
  const base = raw.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
  const hash = await sha256hex(body);
  const key = 'f/' + hash;
  const name = `${base}-${hash.slice(0, 6)}.${ext}`;
  if (!(await c.env.BUCKET.head(key))) await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  await c.env.DB.prepare('INSERT OR REPLACE INTO uploads (key, owner, name, type, bytes, created) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(key, who.owner, name, type, body.byteLength, now()).run();
  return c.json({ key, name, url: fileUrl(key), type, bytes: body.byteLength });
});
