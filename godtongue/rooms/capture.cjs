// Capture walk frames from the baked WebGL renderer.
//   node capture.js DIR OUTDIR [--size W H] [--walk N]
// DIR holds bake.json, bake.bin and textures. Serves DIR on a local port, draws every frame of the walk in headless
// Chromium (software WebGL), and writes OUTDIR/frame-0000.png …
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const dir = path.resolve(args[0]), out = path.resolve(args[1]);
const opt = (k, n = 1) => { const i = args.indexOf(`--${k}`); return i < 0 ? null : args.slice(i + 1, i + 1 + n); };
const [W, H] = (opt('size', 2) || [1920, 1080]).map(Number), walk = +(opt('walk') || [0])[0];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png' };
const viewer = fs.readFileSync(path.join(__dirname, 'baked-view.js'));
const page = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}canvas{display:block}</style>
<canvas id="c" width="${W}" height="${H}" style="width:${W}px;height:${H}px"></canvas>
<script type="module">import { mountBaked } from './baked-view.js';
window.ready = mountBaked(document.getElementById('c'), '.').then(r => { window.R = r; }).catch(e => { window.err = String(e); });</script>`;
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/' || u === '/index.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page); }
  if (u === '/baked-view.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(viewer); }
  const f = path.join(dir, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
server.listen(0, async () => {
  const port = server.address().port;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    p.on('pageerror', e => console.error('pageerror:', e.message));
    await p.goto(`http://127.0.0.1:${port}/`);
    await p.evaluate(async () => { await window.ready; if (window.err) throw new Error(window.err); });
    fs.mkdirSync(out, { recursive: true });
    const n = await p.evaluate((w) => R.walks[w].frames.length, walk);
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const data = await p.evaluate(([w, i]) => { R.frame(w, i); return document.getElementById('c').toDataURL('image/png'); }, [walk, i]);
      fs.writeFileSync(path.join(out, `frame-${String(i).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    console.log(JSON.stringify({ frames: n, seconds: Math.round((Date.now() - t0) / 100) / 10, size: [W, H] }));
  } finally { await b.close(); server.close(); }
});
