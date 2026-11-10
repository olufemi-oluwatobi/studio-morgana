// Records every file the compiler and the web engine read while building the samples, so the browser studio can
// carry exactly those files in memory. Output: tools/studio/vfs.json  { files: { path: base64 }, dirs: { path: [names] } }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SAMPLES = [
  ['Cards', 'hello.gt'], ['Cards', 'marilyn.gt'], ['Cards', 'goku/goku.gt'], ['Cards', 'the-bride-v10.gt'],
  ['Cards', 'the-bride.gt'], ['Cards', 'rose-and-plane.gt'], ['Cards', 'lounge-card.gt'],
  ['Canvas', 'canvas/post.gt'],
  ['Stage', 'stage/three-bodies.gt'], ['Stage', 'stage/card-on-desk.gt'], ['Stage', 'stage/desk-ticket.gt'],
  ['Video', 'video/graffiti.gt'], ['Video', 'video/mean-reversion.gt'],
];

const files = new Map(), dirs = new Map();
const keep = (p) => { p = path.resolve(String(p)); if (!files.has(p) && fs.statSync(p).isFile()) files.set(p, true); };
const real = { readFileSync: fs.readFileSync, readdirSync: fs.readdirSync, existsSync: fs.existsSync };
fs.readFileSync = function (p, ...a) { const r = real.readFileSync.call(fs, p, ...a); if (typeof p === 'string') keep(p); return r; };
fs.readdirSync = function (p, ...a) { const r = real.readdirSync.call(fs, p, ...a); dirs.set(path.resolve(p), r.map(String)); return r; };
fs.existsSync = function (p) { const r = real.existsSync.call(fs, p); if (r && typeof p === 'string') { try { if (fs.statSync(p).isFile()) keep(p); else dirs.set(path.resolve(p), real.readdirSync.call(fs, p).map(String)); } catch { } } return r; };

const { compile, createRegistry } = await import(path.join(ROOT, 'index.js'));
const web = (await import(path.join(ROOT, 'engines', 'web.js'))).default;
const reg = createRegistry();
for (const [, rel] of SAMPLES) {
  const file = path.join(ROOT, 'examples', rel);
  keep(file);
  const r = compile(fs.readFileSync(file, 'utf8'), { registry: reg, baseDir: path.dirname(file), file });
  if (!r.ok) { console.log('✗', rel, r.diagnostics[0]); continue; }
  await web.build(r.doc, { outDir: path.join(ROOT, 'out', 'studio-record', rel.replace(/\W+/g, '-')) });
  console.log('✓', rel);
}
// every image and godtongue file next to the samples, so edits can use them too
for (const d of new Set(SAMPLES.map(([, rel]) => path.dirname(path.join(ROOT, 'examples', rel))))) {
  dirs.set(d, real.readdirSync.call(fs, d).map(String));
  for (const f of real.readdirSync.call(fs, d)) if (/\.(gt|png|jpe?g|webp|svg)$/i.test(f)) keep(path.join(d, f));
}
const out = { root: ROOT, samples: SAMPLES, files: {}, dirs: Object.fromEntries(dirs) };
let bytes = 0;
for (const p of files.keys()) { if (p.includes('/out/')) continue; const b = real.readFileSync.call(fs, p); bytes += b.length; out.files[p] = b.toString('base64'); }
fs.writeFileSync(path.join(ROOT, 'tools', 'studio', 'vfs.json'), JSON.stringify(out));
console.log(`${Object.keys(out.files).length} files, ${(bytes / 1e6).toFixed(1)} MB raw`);
