// The godtongue compiler for the API (a Cloudflare Worker): compile a source, without drawing it, and say what is
// wrong and what is there. The model-writing loop uses it to check each attempt before anyone renders it.
//   check(source, files) → { ok, diagnostics, elements, kind, size, names }
import fs from 'node:fs';
import { compile, createRegistry } from '../../../../godtongue/index.js';
import { elementsOf, categoryOf } from './parts.js';

let reg = null, n = 0;

export function check(source, files = {}) {
  if (!globalThis.__GT_VFS) globalThis.__GT_VFS = __GT_VFS_DATA__;   // the style files, embedded by the build
  if (!reg) reg = createRegistry();
  const dir = globalThis.__GT_VFS.root + '/.pieces/' + (n++);
  const names = Object.keys(files);
  for (const name of names) fs.writeFileSync(dir + '/' + name, files[name]);
  try {
    let r;
    try { r = compile(source, { registry: reg, baseDir: dir, file: dir + '/piece.gt' }); }
    catch (e) { return { ok: false, diagnostics: [{ level: 'error', line: 0, msg: String(e?.message || e) }], elements: {}, kind: null, size: null, category: null }; }
    const errors = (r.diagnostics || []).filter((d) => d.level === 'error');
    const doc = r.doc, c = doc?.card;
    if (doc?.kind === 'room') errors.push({ level: 'error', line: 0, msg: 'rooms are not supported in the studio yet' });
    return {
      ok: !!r.ok && !errors.length, diagnostics: [...(r.diagnostics || []), ...(doc?.kind === 'room' ? errors.slice(-1) : [])],
      elements: doc ? elementsOf(doc) : {}, kind: doc?.kind ?? null, size: c ? [c.grid[0], c.grid[1]] : null, category: doc ? categoryOf(doc) : null,
    };
  } finally {
    for (const name of names) fs.rmSync(dir + '/' + name);
  }
}
