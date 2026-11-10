#!/usr/bin/env node
// Godtongue Studio: a local server. node studio/server.js [--port 4400]
// Write godtongue on the left, press Run, see the card on the right. No npm packages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { buildSource, engines } from '../core/build.js';
import { createRegistry } from '../index.js';
import { ROOT } from '../core/config.js';

const PORT = +(process.argv[process.argv.indexOf('--port') + 1] || process.env.PORT || 4400);
const CARDS = path.join(ROOT, 'cards'), EXAMPLES = path.join(ROOT, 'examples'), RUNS = path.join(ROOT, 'runs');
for (const d of [CARDS, RUNS]) fs.mkdirSync(d, { recursive: true });
const ROOTS = { cards: CARDS, examples: EXAMPLES };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.yaml': 'text/plain; charset=utf-8', '.gt': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8' };

// "cards/foo.gt" → absolute path, only inside cards/ or examples/
function safe(rel) {
  const [root, ...rest] = String(rel || '').split('/');
  if (!ROOTS[root]) return null;
  const p = path.resolve(ROOTS[root], rest.join('/'));
  return p.startsWith(ROOTS[root] + path.sep) || p === ROOTS[root] ? p : null;
}
const list = (root) => walk(ROOTS[root]).filter(f => f.endsWith('.gt')).map(f => `${root}/${path.relative(ROOTS[root], f)}`);
function walk(d) { return fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : []; }
const body = (req) => new Promise((res, rej) => { let b = ''; req.on('data', d => { b += d; if (b.length > 20e6) rej(new Error('too big')); }); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch (e) { rej(e); } }); });
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

let runN = 0;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(fs.readFileSync(path.join(ROOT, 'studio', 'index.html')));
    }
    if (url.pathname === '/api/meta') {
      const E = await engines();
      return json(res, 200, {
        engines: Object.values(E).map(e => ({ name: e.name, label: e.label, describe: e.describe, ok: e.supports() === true, why: e.supports() === true ? null : e.supports() })),
        reference: createRegistry().reference(), files: [...list('cards'), ...list('examples')],
      });
    }
    if (url.pathname === '/api/file') {
      const p = safe(url.searchParams.get('path'));
      if (!p || !fs.existsSync(p)) return json(res, 404, { error: 'no such file' });
      return json(res, 200, { path: url.searchParams.get('path'), source: fs.readFileSync(p, 'utf8') });
    }
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const { path: rel, source } = await body(req), p = safe(rel);
      if (!p || !p.endsWith('.gt')) return json(res, 400, { error: 'save under cards/ with a .gt name' });
      fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, source);
      return json(res, 200, { ok: true, path: rel });
    }
    if (url.pathname === '/api/sketch' && req.method === 'POST') {          // a drawing becomes an @asset next to the card
      const { path: rel, name, svg } = await body(req);
      const dir = rel && rel.startsWith('cards/') && safe(rel) ? path.dirname(safe(rel)) : CARDS;   // examples stay clean
      const file = `${String(name || 'sketch').replace(/[^\w-]/g, '-')}.svg`;
      fs.writeFileSync(path.join(dir, file), svg);
      return json(res, 200, { ok: true, asset: file });
    }
    if (url.pathname === '/api/run' && req.method === 'POST') {
      const { source, engine, path: rel } = await body(req);
      const id = `${Date.now().toString(36)}-${++runN}`, outDir = path.join(RUNS, id), log = [];
      const p = rel && safe(rel);
      const r = await buildSource(source, { engine, outDir, baseDir: p ? path.dirname(p) : CARDS, assetDirs: [CARDS, EXAMPLES], file: p, log: (l) => log.push(l) });
      pruneRuns();
      const u = (f) => f && `/runs/${id}/${f}`;
      return json(res, 200, {
        ok: r.ok, diagnostics: r.diagnostics, ms: r.ms, log, engine,
        entry: u(r.output?.entry), previews: Object.fromEntries(Object.entries(r.output?.previews || {}).map(([k, v]) => [k, u(v)])),
        doc: r.ok ? u('card.gtdoc.json') : null, manifest: u(r.output?.manifest),
        grid: r.doc?.card.grid, stats: r.doc ? { layers: Object.keys(r.doc.layers).length, steps: Object.values(r.doc.sides).reduce((a, s) => a + s.steps.length, 0) } : null,
      });
    }
    if (url.pathname.startsWith('/runs/')) {
      const p = path.resolve(RUNS, decodeURIComponent(url.pathname.slice(6)));
      if (!p.startsWith(RUNS + path.sep) || !fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); return fs.createReadStream(p).pipe(res);
    }
    res.writeHead(404); res.end('not found');
  } catch (e) { json(res, 500, { error: e.message }); }
});
function pruneRuns(keep = 30) {
  const ds = fs.readdirSync(RUNS).map(d => ({ d, t: fs.statSync(path.join(RUNS, d)).mtimeMs })).sort((a, b) => b.t - a.t);
  for (const { d } of ds.slice(keep)) fs.rmSync(path.join(RUNS, d), { recursive: true, force: true });
}
server.listen(PORT, () => console.log(`godtongue studio → http://localhost:${PORT}`));
