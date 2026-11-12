// Smoke test for the browser render pipeline, without the app: compile worker → sandboxed frame → poster, pins, video.
//   node scripts/render-smoke.mjs        (needs: npm run build:runtime)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GT = path.resolve(ROOT, '..', 'godtongue');
const OUT = path.join(ROOT, 'out', 'smoke'); fs.mkdirSync(OUT, { recursive: true });
const bridge = fs.readFileSync(path.join(ROOT, 'apps/web/src/render/bridge.gen.ts'), 'utf8').replace(/^\/\/.*\n/, '').replace('export const BRIDGE =', 'window.BRIDGE =');
const page = `<!doctype html><meta charset="utf-8"><body><script src="/bridge.js"></script><script>
const w = new Worker('/runtime/compiler.worker.js'); let k = 0; const wait = new Map();
w.onmessage = (e) => { const p = wait.get(e.data.id); wait.delete(e.data.id); e.data.ok ? p[0](e.data.r) : p[1](new Error(e.data.error)); };
const call = (cmd, a = {}, t) => new Promise((res, rej) => { const id = ++k; wait.set(id, [res, rej]); w.postMessage({ id, cmd, ...a }, t || []); });
const fr = document.createElement('iframe'); fr.setAttribute('sandbox', 'allow-scripts'); fr.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;border:0;pointer-events:none'; document.body.appendChild(fr);
let fk = 0; const fwait = new Map(); let onReady = null;
addEventListener('message', (e) => { if (e.source !== fr.contentWindow) return; const d = e.data || {};
  if (d.type === 'ready') return onReady && onReady[0](d.info); if (d.type === 'error') return onReady && onReady[1](new Error(d.error)); if (d.type === 'progress') return;
  const p = fwait.get(d.id); if (!p) return; fwait.delete(d.id); d.ok ? p[0](d.r) : p[1](new Error(d.error)); });
const fcall = (cmd, args) => new Promise((res, rej) => { const id = ++fk; fwait.set(id, [res, rej]); fr.contentWindow.postMessage({ id, cmd, args }, '*'); });
const load = (html) => new Promise((res, rej) => { onReady = [res, rej]; fr.srcdoc = html.replace('<body>', '<body><script>' + window.BRIDGE + '</' + 'script>'); });
const b64 = async (blob) => { const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
window.run = async (src, dir, files, opts) => {
  await call('init', { base: '/runtime/' });
  const bufs = {}; for (const [n, u] of Object.entries(files)) bufs[n] = await (await fetch(u)).arrayBuffer();
  await call('mount', { dir, files: bufs }, Object.values(bufs));
  const t0 = performance.now(); const c = await call('compile', { source: src, dir }); const tc = performance.now() - t0;
  if (!c.ok) return { ok: false, diagnostics: c.diagnostics };
  const t1 = performance.now(); const info = await load(c.html); const tl = performance.now() - t1;
  const t2 = performance.now();
  const posters = await fcall('poster', { face: c.faces.includes('front') ? 'front' : null, t: c.video ? c.video.seconds * 0.85 : 0, bare: !!c.crop, crop: c.crop, widths: [480, 1200] });
  const tp = performance.now() - t2;
  const masks = c.parts.map((p) => ({ svg: p.mask }));
  const anchors = c.crop ? await fcall('anchors', { masks, W: c.size[0], H: c.size[1] }) : null;
  let video = null, tv = 0;
  if (c.video && opts.video) { const t3 = performance.now(); video = await fcall('encode', { fps: 24, width: 540 }); tv = performance.now() - t3; video.b64 = await b64(video.blob); delete video.blob; }
  await fcall('dispose', {});
  return { ok: true, kind: c.kind, category: c.category, faces: c.faces, crop: c.crop, parts: c.parts.map((p) => p.n + ' ' + p.name + ' ' + p.ops.join('/') + ' L' + p.lines.join(',')),
    anchors, posters: await Promise.all(posters.map(async (p) => ({ w: p.width, h: p.height, type: p.blob.type, kb: Math.round(p.blob.size / 1024), b64: await b64(p.blob) }))),
    ms: { compile: Math.round(tc), build: Math.round(info.buildMs), load: Math.round(tl), poster: Math.round(tp), video: Math.round(tv) }, video };
};
</script></body>`;

const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/') { r.setHeader('content-type', 'text/html'); return r.end(page); }
  if (u === '/bridge.js') { r.setHeader('content-type', 'text/javascript'); return r.end(bridge); }
  const f = u.startsWith('/runtime/') ? path.join(ROOT, 'apps/web/public', u) : u.startsWith('/gt/') ? path.join(GT, u.slice(4)) : null;
  if (!f || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream');
  r.end(fs.readFileSync(f));
}).listen(0);
const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch(); const p = await b.newPage();
p.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 200)); });
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(base);
const cases = [['examples/goku/goku.gt', false], ['examples/video/graffiti.gt', true], ['examples/stage/three-bodies.gt', false], ['examples/canvas/post.gt', false]];
for (const [rel, video] of cases) {
  const dir = path.dirname(path.join(GT, rel));
  const files = Object.fromEntries(fs.readdirSync(dir).filter((f) => !/\.(py|gt)$/.test(f) && fs.statSync(path.join(dir, f)).isFile()).map((f) => [f, '/gt/' + path.relative(GT, path.join(dir, f))]));
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.gt'))) files[f] = '/gt/' + path.relative(GT, path.join(dir, f));
  const r = await p.evaluate(([src, d, fl, o]) => window.run(src, d, fl, o), [fs.readFileSync(path.join(GT, rel), 'utf8'), '/piece/' + path.basename(rel, '.gt'), files, { video }]);
  if (!r.ok) { console.log('✗', rel, JSON.stringify(r.diagnostics).slice(0, 300)); continue; }
  const name = path.basename(rel, '.gt');
  r.posters.forEach((x) => fs.writeFileSync(path.join(OUT, `${name}-${x.w}.webp`), Buffer.from(x.b64, 'base64')));
  if (r.video) fs.writeFileSync(path.join(OUT, `${name}.mp4`), Buffer.from(r.video.b64, 'base64'));
  console.log('✓', rel, r.kind, r.category, 'faces', r.faces.join('/'), 'ms', JSON.stringify(r.ms), 'posters', r.posters.map((x) => `${x.w}x${x.h} ${x.type} ${x.kb}KB`).join(', '),
    r.video ? `video ${r.video.width}x${r.video.height} ${r.video.codec} ${Math.round(r.video.b64.length * 0.75 / 1024)}KB` : '');
  console.log('   parts:', r.parts.slice(0, 8).join(' | '), r.anchors ? ' anchors: ' + r.anchors.slice(0, 4).map((a) => a && a.map(Math.round).join(',')).join(' ') : '');
}
await b.close(); srv.close();
