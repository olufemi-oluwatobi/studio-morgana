// Checks the showcase algorithm (apps/api/src/showcase.ts) on its own.   node scripts/check-showcase.mjs
import * as esbuild from 'esbuild';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(os.tmpdir(), 'morgana-showcase.mjs');
await esbuild.build({ entryPoints: [path.join(ROOT, 'apps/api/src/showcase.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { pickShowcase, score } = await import(pathToFileURL(out).href + '?' + Date.now());
const DAY = 86_400_000, now = Date.UTC(2026, 10, 13, 12);
let bad = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) bad++; };
const c = (id, o = {}) => ({ id, owner: 'o' + id, type: 'image', published: now - 2 * DAY, pins: 0, remixes: 0, ...o });

ok('more people pinning scores higher', score(c('a', { pins: 3 }), now) > score(c('b', { pins: 1 }), now));
ok('a remix counts, less than a pin', score(c('a', { pins: 1 }), now) > score(c('b', { remixes: 1 }), now) && score(c('b', { remixes: 1 }), now) > score(c('c'), now));
ok('older pieces fade (half after the half-life)', Math.abs(score(c('a', { published: now - 12 * DAY }), now) / score(c('b', { published: now - 2 * DAY }), now) - 0.5) < 0.01);
ok('a piece from the last day gets a boost', score(c('a', { published: now - 0.5 * DAY }), now) > score(c('b', { published: now - 1.5 * DAY }), now) * 1.4);
ok('a new piece with no signals can beat an old one with one pin', score(c('a', { published: now - 3600e3 }), now) > score(c('b', { published: now - 30 * DAY, pins: 1 }), now));

const many = Array.from({ length: 60 }, (_, i) => c('p' + i, { owner: 'o' + (i % 5), type: i % 4 ? 'image' : 'video', pins: i % 7, published: now - i * 0.3 * DAY }));
const { picked } = pickShowcase(many, { now });
const per = {}; const types = {};
for (const p of picked) { per[p.owner] = (per[p.owner] || 0) + 1; types[p.type] = (types[p.type] || 0) + 1; }
ok('picks at most 24', picked.length <= 24);
ok('no owner has more than 2', Math.max(...Object.values(per)) <= 2, JSON.stringify(per));
ok('5 owners x 2 = 10 picked when owners are scarce', picked.length === 10, String(picked.length));

const wide = Array.from({ length: 80 }, (_, i) => c('w' + i, { type: i < 60 ? 'image' : 'video', pins: i < 60 ? 2 : 0, published: now - 3 * DAY }));
const w = pickShowcase(wide, { now }).picked;
const vids = w.filter((p) => p.type === 'video').length;
ok('fills 24, and keeps a mix: no more than 70% of one type', w.length === 24 && w.filter((p) => p.type === 'image').length <= 17 && vids >= 7, `${w.length - vids} images, ${vids} videos`);
ok('only videos available: still fills (second pass)', pickShowcase(wide.filter((p) => p.type === 'video'), { now }).picked.length === 20);

const a = pickShowcase(many, { now }).picked.map((p) => p.id).join(), b = pickShowcase([...many].reverse(), { now }).picked.map((p) => p.id).join();
ok('same result whatever order the rows come in', a === b);
ok('empty in, empty out', pickShowcase([], { now }).picked.length === 0);
process.exit(bad ? 1 : 0);
