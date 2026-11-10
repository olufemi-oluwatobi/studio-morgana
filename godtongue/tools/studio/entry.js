// The browser studio: compile godtongue and build the web engine page, all in memory.
import fs from 'node:fs';
import path from 'node:path';
import { compile, createRegistry } from '../../index.js';
import web from '../../engines/web.js';

const reg = createRegistry();
let n = 0;
export function read(file) { return fs.readFileSync(file, 'utf8'); }
export async function run(source, file) {
  const t0 = performance.now();
  let r;
  try { r = compile(source, { registry: reg, baseDir: path.dirname(file), file }); }
  catch (e) { return { ok: false, diagnostics: [{ level: 'error', line: 0, msg: e.message }], ms: performance.now() - t0 }; }
  if (!r.ok) return { ok: false, diagnostics: r.diagnostics, ms: performance.now() - t0 };
  if (r.doc.kind === 'room') return { ok: false, diagnostics: [{ level: 'error', line: 0, msg: 'rooms need the room engine (not in the studio)' }], ms: performance.now() - t0 };
  const out = '/mem/out/' + (n++), logs = [];
  try { await web.build(r.doc, { outDir: out, log: (l) => logs.push(l) }); }
  catch (e) { return { ok: false, diagnostics: [{ level: 'error', line: 0, msg: 'engine: ' + e.message }], ms: performance.now() - t0 }; }
  const html = fs.readFileSync(out + '/index.html', 'utf8');
  fs.rmSync(out + '/index.html');
  return { ok: true, html, diagnostics: r.diagnostics, logs, ms: performance.now() - t0 };
}
