// Seeds the featured collection from godtongue's examples, rendered by the app itself, and creates the demo admin.
//   node scripts/seed.mjs                       local:  http://127.0.0.1:8787, wrangler --local --env offline
//   node scripts/seed.mjs --base https://… --remote   a deployed Worker
// Needs Playwright (the app renders in a real browser, exactly as for a person).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GT = path.resolve(ROOT, '..', 'godtongue');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8787').replace(/\/$/, '');
const REMOTE = process.argv.includes('--remote');
export const DEMO = { email: 'demo@example.com', password: 'morgana-demo-2026' };

// in wall order: a mix of kinds, so every tab has something
const FEATURED = [
  'goku/goku.gt', 'video/graffiti.gt', 'marilyn.gt', 'stage/three-bodies.gt', 'canvas/post.gt', 'the-bride-v10.gt',
  'video/mean-reversion.gt', 'hello.gt', 'stage/card-on-desk.gt', 'rose-and-plane.gt', 'stage/desk-ticket.gt', 'lounge-card.gt',
];
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gt: 'text/x-godtongue' };

let cookie = '';
async function call(p, { method, body, raw, headers = {} } = {}) {
  const h = { 'x-morgana': '1', cookie, ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(BASE + '/api' + p, { method: method || (body !== undefined || raw ? 'POST' : 'GET'), headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(';'); const [k] = kv.split('=');
    cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; ');
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${p}: ${res.status} ${j.error || ''}`), { status: res.status });
  return j;
}

// the files a source uses: @name references, and theirs in turn (a placed card is a .gt file with its own)
function filesOf(file, seen = new Map()) {
  const dir = path.dirname(file), src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/@([\w.-]+\.(?:png|jpe?g|webp|svg|gt))/gi)) {
    const f = path.join(dir, m[1]);
    if (seen.has(m[1]) || !fs.existsSync(f)) continue;
    seen.set(m[1], f);
    if (f.endsWith('.gt')) filesOf(f, seen);
  }
  // a style can name files too (the studded bezel style draws its own; nothing to add)
  return seen;
}

async function main() {
  // 1. the demo account, promoted to admin
  try { await call('/auth/signup', { body: DEMO }); console.log('created', DEMO.email); }
  catch (e) { if (e.status !== 409) throw e; await call('/auth/login', { body: DEMO }); console.log('signed in', DEMO.email); }
  const sql = `UPDATE users SET role = 'admin', verified = 1 WHERE email = '${DEMO.email}'`;
  execFileSync('npx', ['wrangler', 'd1', 'execute', 'morgana', REMOTE ? '--remote' : '--local', ...(REMOTE ? [] : ['--env', 'offline']), '--command', sql],
    { cwd: path.join(ROOT, 'apps', 'api'), stdio: 'pipe' });
  const me = await call('/me');
  if (me.user?.role !== 'admin') throw new Error('could not make the demo account an admin');

  // 2. the pieces, with their files
  const ids = [];
  for (const rel of FEATURED) {
    const file = path.join(GT, 'examples', rel);
    const files = [];
    for (const [name, f] of filesOf(file)) {
      const type = TYPES[name.split('.').pop().toLowerCase()];
      const up = await call('/uploads', { raw: fs.readFileSync(f), headers: { 'content-type': type, 'x-file-name': encodeURIComponent(name) } });
      files.push({ name, key: up.key });
    }
    const p = await call('/admin/pieces', { body: { source: fs.readFileSync(file, 'utf8'), files } });
    ids.push(p.id);
    console.log('added', rel, files.length ? `(${files.length} files)` : '');
  }

  // 3. render each one in the app, the same way a person's browser does
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const host = new URL(BASE).hostname;
  await ctx.addCookies(cookie.split('; ').filter(Boolean).map((kv) => { const i = kv.indexOf('='); return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: host, path: '/' }; }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  for (let i = 0; i < ids.length; i++) {
    const t0 = Date.now();
    await page.goto(`${BASE}/p/${ids[i]}`);
    let d;
    for (;;) {
      d = await call(`/pieces/${ids[i]}`);
      if (d.piece.status === 'ready' && (d.piece.category !== 'videos' || d.piece.video)) break;
      if (Date.now() - t0 > 15 * 60_000) throw new Error('timed out rendering ' + FEATURED[i]);
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.log('rendered', FEATURED[i], '→', d.piece.category, `${d.piece.w}x${d.piece.h}`, d.piece.video ? '+ video' : '', `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await browser.close();

  // 4. featured, in order
  const r = await call('/admin/collections/featured', { method: 'PUT', body: { title: 'Featured', pieceIds: ids } });
  console.log(`featured: ${r.count} pieces · demo login ${DEMO.email} / ${DEMO.password}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
