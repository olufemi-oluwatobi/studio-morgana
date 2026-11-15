// The stamp library. Public: the published stamps (the generator reads these). Admin: import, review, publish.
// Every stamp is compiled with the real godtongue checker before it is stored; a stamp that does not compile is refused.
import { Hono } from 'hono';
import type { App } from './env';
import { check } from './gt/checker.gen.js';
import { fail, now } from './util';

type Row = {
  slug: string; name: string; words: string; tags: string; parts: string;
  source: string; credit: string; gt: string; svg: string; status: string; created: number; updated: number;
};

const SLUG = /^[a-z][a-z0-9-]{0,39}$/;
const STATUSES = ['draft', 'published', 'hidden'] as const;
type Status = (typeof STATUSES)[number];

const list = (v: unknown, max: number, each = 40): string[] =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((s) => s.trim().slice(0, each)).filter(Boolean).slice(0, max);

const parseJSON = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };

const shape = (r: Row) => ({
  slug: r.slug,
  name: r.name,
  words: parseJSON<string[]>(r.words, []),
  tags: parseJSON<string[]>(r.tags, []),
  parts: parseJSON<{ name: string; area: number }[]>(r.parts, []),
  source: r.source,
  credit: r.credit,
  status: r.status,
  svg: r.svg,
  updated: r.updated,
});

// ---- public -------------------------------------------------------------------------------------------

export const library = new Hono<App>();

// the published stamps, with the godtongue the generator and the editor need
library.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT slug, name, words, tags, parts, credit, gt FROM library_stamps WHERE status = 'published' ORDER BY slug`)
    .all<Pick<Row, 'slug' | 'name' | 'words' | 'tags' | 'parts' | 'credit' | 'gt'>>();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    stamps: results.map((r) => ({ slug: r.slug, name: r.name, words: parseJSON<string[]>(r.words, []), tags: parseJSON<string[]>(r.tags, []), parts: parseJSON<{ name: string; area: number }[]>(r.parts, []), credit: r.credit, gt: r.gt })),
  });
});

// a preview drawing of one published stamp
library.get('/:slug/preview.svg', async (c) => {
  const r = await c.env.DB.prepare(`SELECT svg FROM library_stamps WHERE slug = ? AND status = 'published'`).bind(c.req.param('slug')).first<{ svg: string }>();
  if (!r) return c.notFound();
  c.header('Cache-Control', 'public, max-age=3600');
  return c.body(r.svg, 200, { 'Content-Type': 'image/svg+xml' });
});

// ---- admin (mounted under /api/admin, which already requires an admin) -------------------------------

export const libraryAdmin = new Hono<App>();

// everything, or one status: the review grid
libraryAdmin.get('/', async (c) => {
  const s = c.req.query('status') || 'all';
  if (s !== 'all' && !STATUSES.includes(s as Status)) fail(400, 'status must be draft, published, hidden or all');
  const rows = s === 'all'
    ? await c.env.DB.prepare('SELECT * FROM library_stamps ORDER BY slug').all<Row>()
    : await c.env.DB.prepare('SELECT * FROM library_stamps WHERE status = ? ORDER BY slug').bind(s).all<Row>();
  const counts = await c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM library_stamps GROUP BY status').all<{ status: string; n: number }>();
  return c.json({ stamps: rows.results.map(shape), counts: Object.fromEntries(counts.results.map((x) => [x.status, x.n])) });
});

// import a batch: each stamp is compiled first; the ones that pass are stored as drafts (or published, if asked)
libraryAdmin.post('/import', async (c) => {
  const b = await c.req.json<{ items?: unknown[]; publish?: boolean }>().catch(() => ({} as { items?: unknown[]; publish?: boolean }));
  const items = Array.isArray(b.items) ? b.items.slice(0, 100) : [];
  if (!items.length) fail(400, 'send items: [...] (up to 100 at a time)');
  const t = now();
  const results: { slug: string; ok: boolean; message?: string }[] = [];
  const stmts = [];
  for (const raw of items) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const slug = typeof it.slug === 'string' ? it.slug : '';
    if (!SLUG.test(slug)) { results.push({ slug, ok: false, message: 'slug: lowercase letters, digits and hyphens, starting with a letter' }); continue; }
    const gt = typeof it.gt === 'string' ? it.gt : '';
    const svg = typeof it.svg === 'string' ? it.svg : '';
    if (!gt || gt.length > 60_000) { results.push({ slug, ok: false, message: 'gt: missing or too long' }); continue; }
    if (svg.length > 40_000) { results.push({ slug, ok: false, message: 'svg: too long for a preview' }); continue; }
    // a definition is only checked when it is placed, so compile it on a test canvas the way the generator will use it
    const checked = check(`Let there be a flat canvas called t, 400 by 400.\n${gt}place a ${slug} at 200 200.\n`, {});
    if (!checked.ok) {
      const first = checked.diagnostics.find((d) => d.level === 'error') ?? checked.diagnostics[0];
      // the probe adds one line before the definition, so the stamp's own lines start one earlier
      const at = first?.line ? first.line - 1 : undefined;
      results.push({ slug, ok: false, message: first ? (at ? `line ${at}: ${first.msg}` : first.msg) : 'does not compile' });
      continue;
    }
    const name = typeof it.name === 'string' && it.name.trim() ? it.name.trim().slice(0, 60) : slug;
    const status: Status = b.publish ? 'published' : 'draft';
    stmts.push(c.env.DB.prepare(
      `INSERT INTO library_stamps (slug, name, words, tags, parts, source, credit, gt, svg, status, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (slug) DO UPDATE SET name = excluded.name, words = excluded.words, tags = excluded.tags, parts = excluded.parts,
         source = excluded.source, credit = excluded.credit, gt = excluded.gt, svg = excluded.svg, updated = excluded.updated`,
    ).bind(
      slug, name,
      JSON.stringify(list(it.words, 30)), JSON.stringify(list(it.tags, 20)),
      JSON.stringify(Array.isArray(it.parts) ? it.parts.slice(0, 40) : []),
      String(it.source ?? '').slice(0, 200), String(it.credit ?? '').slice(0, 300),
      gt, svg, status, t, t,
    ));
    results.push({ slug, ok: true });
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ results, stored: results.filter((r) => r.ok).length });
});

// fix one stamp's words, tags or name, or change its status
libraryAdmin.patch('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const b = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const sets: string[] = [], vals: unknown[] = [];
  if (typeof b.name === 'string') { sets.push('name = ?'); vals.push(b.name.trim().slice(0, 60) || slug); }
  if (b.words !== undefined) { sets.push('words = ?'); vals.push(JSON.stringify(list(b.words, 30))); }
  if (b.tags !== undefined) { sets.push('tags = ?'); vals.push(JSON.stringify(list(b.tags, 20))); }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as Status)) fail(400, 'status must be draft, published or hidden');
    sets.push('status = ?'); vals.push(b.status);
  }
  if (!sets.length) fail(400, 'nothing to change');
  sets.push('updated = ?'); vals.push(now(), slug);
  const r = await c.env.DB.prepare(`UPDATE library_stamps SET ${sets.join(', ')} WHERE slug = ?`).bind(...vals).run();
  if (!r.meta.changes) fail(404, 'no such stamp');
  return c.json({ slug, ok: true });
});

// publish, hide or return many at once
libraryAdmin.post('/status', async (c) => {
  const b = await c.req.json<{ slugs?: unknown; status?: unknown }>().catch(() => ({} as { slugs?: unknown; status?: unknown }));
  if (!STATUSES.includes(b.status as Status)) fail(400, 'status must be draft, published or hidden');
  const slugs = list(b.slugs, 200, 40);
  if (!slugs.length) fail(400, 'slugs: [...]');
  const t = now();
  await c.env.DB.batch(slugs.map((s) => c.env.DB.prepare('UPDATE library_stamps SET status = ?, updated = ? WHERE slug = ?').bind(b.status, t, s)));
  return c.json({ changed: slugs.length, status: b.status });
});

libraryAdmin.delete('/:slug', async (c) => {
  await c.env.DB.prepare('DELETE FROM library_stamps WHERE slug = ?').bind(c.req.param('slug')).run();
  return c.json({ ok: true });
});

// ---- for the generator --------------------------------------------------------------------------------------

export interface LibStamp { slug: string; name: string; words: string[]; tags: string[]; parts: { name: string; area: number }[]; gt: string }

// the published stamps, read once a minute per Worker
let cached: { at: number; rows: LibStamp[] } | null = null;
export async function publishedStamps(env: { DB: D1Database }): Promise<LibStamp[]> {
  if (cached && Date.now() - cached.at < 60_000) return cached.rows;
  const { results } = await env.DB.prepare(`SELECT slug, name, words, tags, parts, gt FROM library_stamps WHERE status = 'published' ORDER BY slug`)
    .all<Pick<Row, 'slug' | 'name' | 'words' | 'tags' | 'parts' | 'gt'>>();
  const rows = results.map((r) => ({ slug: r.slug, name: r.name, words: parseJSON<string[]>(r.words, []), tags: parseJSON<string[]>(r.tags, []), parts: parseJSON<{ name: string; area: number }[]>(r.parts, []), gt: r.gt }));
  cached = { at: Date.now(), rows };
  return rows;
}

// the stamps that fit what the plan asks for: words shared with the element names and descriptions
export function stampsFor(all: LibStamp[], elements: { name: string; what: string }[], n = 24): LibStamp[] {
  const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
  const want = new Set<string>();
  for (const e of elements) for (const w of words(`${e.name} ${e.what}`)) want.add(w);
  if (!want.size) return [];
  const scored = all.map((s) => {
    const have = words(`${s.name} ${s.slug} ${s.words.join(' ')} ${s.tags.join(' ')}`);
    let hit = 0; for (const w of have) if (want.has(w)) hit++;
    return { s, hit };
  }).filter((x) => x.hit > 0);
  return scored.sort((a, b) => b.hit - a.hit || a.s.slug.localeCompare(b.s.slug)).slice(0, n).map((x) => x.s);
}

// the prompt's list: what each stamp is called and what it is made of
export function stampList(list: LibStamp[]): string {
  if (!list.length) return '';
  return [
    'Drawings we already have. Use one with `place a <name> at x y, size N` (size 100 draws it 200 pixels square, centred on x y). Recolour a part with `make the <part> #hex`. Do not write their define lines: they are added for you.',
    ...list.map((s) => `- ${s.slug}: ${s.words.slice(0, 4).join(', ') || s.name}; parts ${s.parts.map((p) => p.name).join(', ') || 'body'}`),
  ].join('\n');
}

// the definitions of the stamps the piece places, put in front of it so the piece stands on its own in the editor
export function withStamps(source: string, all: LibStamp[]): string {
  if (!source || !all.length) return source;
  const used = all.filter((s) => new RegExp(`\\bplace\\s+(?:an?\\s+|the\\s+)?${s.slug}\\b`).test(source)
    && !new RegExp(`\\bdefine\\s+(?:an?\\s+)?${s.slug}\\b`).test(source));
  if (!used.length) return source;
  return used.map((s) => s.gt.endsWith('\n') ? s.gt : s.gt + '\n').join('') + source;
}
