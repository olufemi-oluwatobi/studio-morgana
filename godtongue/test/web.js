// Golden frames for the web engine (order 0.4). Builds each case with the web engine, renders one fixed moment
// headless, and compares it with golden/web/<name>.png: mean error per pixel on a 0..1 scale, pass under 0.02.
//   node test/web.js           check (slow: one browser per case; run it on its own, not in test/run.js)
//   BLESS=1 node test/web.js   write the goldens after an intended change, and say so in the commit
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildSource } from '../core/build.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLD = path.join(ROOT, 'golden', 'web');
const OUT = path.join(ROOT, 'out', 'web-test');
const TOL = 0.02;
const { frame, compare } = createRequire(import.meta.url)(path.join(ROOT, 'web', 'capture.cjs'));

// one case per kind of thing the engine draws: a held card front and back, a canvas, a stage, sprays, video, flip
const CASES = [
  { name: 'goku-front', file: 'goku/goku.gt', side: 'front' },
  { name: 'goku-back', file: 'goku/goku.gt', side: 'back' },
  { name: 'marilyn-front', file: 'marilyn.gt', side: 'front' },
  { name: 'bride-v10-back', file: 'the-bride-v10.gt', side: 'back' },
  { name: 'post-canvas', file: 'canvas/post.gt' },
  { name: 'three-bodies', file: 'stage/three-bodies.gt', t: 2 },
  { name: 'graffiti-t5', file: 'video/graffiti.gt', t: 5 },
  { name: 'mean-reversion-t10', file: 'video/mean-reversion.gt', t: 10 },
  { name: 'card-on-desk-flipped', file: 'stage/card-on-desk.gt', t: 2.8 },
];

const bless = !!process.env.BLESS;
fs.mkdirSync(GOLD, { recursive: true });
let failed = 0;
for (const c of CASES) {
  const file = path.join(ROOT, 'examples', c.file);
  const dir = path.join(OUT, c.name);
  const r = await buildSource(fs.readFileSync(file, 'utf8'), { engine: 'web', outDir: dir, baseDir: path.dirname(file), file });
  if (!r.ok) { failed++; console.log(`✗ ${c.name}: does not build`, r.diagnostics?.[0]?.msg); continue; }
  const shot = await frame(path.join(dir, 'index.html'), { side: c.side, t: c.t });
  const gold = path.join(GOLD, c.name + '.png');
  if (bless) { fs.writeFileSync(gold, shot); console.log(`✓ blessed ${c.name}`); continue; }
  if (!fs.existsSync(gold)) { failed++; console.log(`✗ ${c.name}: no golden (run with BLESS=1)`); continue; }
  const err = await compare(shot, fs.readFileSync(gold));
  const ok = err < TOL;
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${c.name}: mean error ${(err * 100).toFixed(2)}% (tolerance ${TOL * 100}%)`);
}
if (bless) console.log(`${CASES.length} goldens written to golden/web/`);
else console.log(failed ? `${failed} case(s) failed` : `all ${CASES.length} frames match`);
process.exit(failed && !bless ? 1 : 0);
