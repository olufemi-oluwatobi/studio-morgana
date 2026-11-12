// Compiles everything the offline generator can write, and runs its editor, with the real godtongue compiler.
//   node scripts/check-local-gen.mjs
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GT = path.resolve(ROOT, '..', 'godtongue');
const out = path.join(os.tmpdir(), 'morgana-local-gen.mjs');
await esbuild.build({ entryPoints: [path.join(ROOT, 'apps/api/src/local-gen.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { localGenerate, localEdit } = await import(pathToFileURL(out).href + '?' + Date.now());
const { compile, createRegistry } = await import(path.join(GT, 'index.js'));
const { partsOf } = await import(path.join(ROOT, 'packages/renderer/src/parts.js'));
const reg = createRegistry();

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-'));
fs.copyFileSync(path.join(GT, 'examples', 'marilyn.jpg'), path.join(dir, 'ref.jpg'));
const briefs = ['a navy card with chrome trim called "Aurora"', 'sale poster for the weekend, red and gold', 'a desk scene with a summons ticket',
  'rose gold collectible for a jazz club', 'black mirror card', 'minimal ivory piece'];
let bad = 0, n = 0;
for (const b of briefs) for (let i = 0; i < 4; i++) for (const up of [[], ['ref.jpg']]) {
  const src = localGenerate(b, i, up); n++;
  const r = compile(src, { registry: reg, baseDir: dir, file: path.join(dir, 'p.gt') });
  const errs = (r.diagnostics || []).filter((d) => d.level === 'error');
  if (!r.ok || errs.length) { bad++; console.log('✗', JSON.stringify(b), i, up.join(), errs.map((d) => `line ${d.line}: ${d.msg}`).join(' | '), '\n' + src); continue; }
  // edits: a material on P2 and a colour on P1 must also compile
  const parts = partsOf(r.doc);
  for (const cmd of ['make p2 chrome', 'make p1 navy']) {
    let e;
    try { e = localEdit(src, parts, cmd); } catch (x) { console.log('  edit refused:', cmd, '-', x.message); continue; }
    const r2 = compile(e, { registry: reg, baseDir: dir, file: path.join(dir, 'p.gt') });
    const e2 = (r2.diagnostics || []).filter((d) => d.level === 'error');
    if (!r2.ok || e2.length) { bad++; console.log('✗ edit', cmd, 'on', JSON.stringify(b), i, e2.map((d) => `line ${d.line}: ${d.msg}`).join(' | ')); }
  }
}
console.log(bad ? `${bad} failures in ${n} pieces` : `all ${n} generated pieces and their edits compile`);
process.exit(bad ? 1 : 0);
