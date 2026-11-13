// The compile worker: godtongue compiler + the web engine's page build, off the main thread.
// Messages in:  { id, cmd: 'init', base } · { id, cmd: 'mount', dir, files: { name: ArrayBuffer } } · { id, cmd: 'compile', source, dir }
// Messages out: { id, ok: true, r } or { id, ok: false, error }
import fs from 'node:fs';
import { compile, createRegistry } from '../../../../godtongue/index.js';
import web from '../../../../godtongue/engines/web.js';
import { toSvg } from '../../../../godtongue/engines/svg.js';
import { partsOf, categoryOf } from './parts.js';

let reg = null, ready = null, n = 0;

async function init({ base }) {
  if (!ready) {
    ready = (async () => {
      const res = await fetch(base + 'vfs-base.json');
      if (!res.ok) throw new Error('could not load the godtongue runtime files (' + res.status + ')');
      globalThis.__GT_VFS = await res.json();
      reg = createRegistry();
      return { root: globalThis.__GT_VFS.root };
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}

// a piece's own files (images, fonts, other .gt files) under its folder
function mount({ dir, files }) {
  for (const [name, buf] of Object.entries(files || {})) fs.writeFileSync(dir + '/' + name, new Uint8Array(buf));
  return { mounted: Object.keys(files || {}).length };
}

async function compileSource({ source, dir }) {
  if (!reg) throw new Error('the compiler is not ready');
  const file = dir + '/piece.gt';
  const t0 = performance.now();
  let r;
  try { r = compile(source, { registry: reg, baseDir: dir, file }); }
  catch (e) { return { ok: false, diagnostics: [{ level: 'error', line: 0, msg: e.message }] }; }
  const errors = (r.diagnostics || []).filter((d) => d.level === 'error');
  if (!r.ok || errors.length) return { ok: false, diagnostics: r.diagnostics };
  const doc = r.doc;
  if (doc.kind === 'room') return { ok: false, diagnostics: [{ level: 'error', line: 0, msg: 'rooms are not supported in the studio yet' }] };
  const out = '/mem/out/' + (n++), logs = [];
  try { await web.build(doc, { outDir: out, log: (l) => logs.push(l) }); }
  catch (e) { return { ok: false, diagnostics: [{ level: 'error', line: 0, msg: 'engine: ' + e.message }] }; }
  const html = fs.readFileSync(out + '/index.html', 'utf8');
  fs.rmSync(out + '/index.html');
  const c = doc.card;
  return {
    ok: true, html, logs, diagnostics: r.diagnostics, ms: performance.now() - t0,
    name: doc.name, kind: doc.kind, category: categoryOf(doc), video: doc.video || null,
    size: [c.grid[0], c.grid[1]],
    // a card or canvas is cut out along its body; a stage or video is the whole frame
    crop: doc.kind === 'stage' ? null : c.rect,
    corners: doc.kind === 'stage' ? 0 : c.r || 0,
    faces: Object.keys(doc.sides || {}),
    parts: partsOf(doc),
  };
}

// a card or canvas as one vector SVG file (godtongue/engines/svg.js says what it leaves out)
function svgOf({ source, dir }) {
  if (!reg) throw new Error('the compiler is not ready');
  const r = compile(source, { registry: reg, baseDir: dir, file: dir + '/piece.gt' });
  if (!r.ok) throw new Error((r.diagnostics || []).find((d) => d.level === 'error')?.msg || 'does not compile');
  return { svg: toSvg(r.doc), name: r.doc.name };
}

const H = { init, mount, compile: compileSource, svg: svgOf };
self.onmessage = async (ev) => {
  const { id, cmd, ...args } = ev.data || {};
  if (!id || !H[cmd]) return;
  try { self.postMessage({ id, ok: true, r: await H[cmd](args) }); }
  catch (e) { self.postMessage({ id, ok: false, error: String(e?.message || e) }); }
};
