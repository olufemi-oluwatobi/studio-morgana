// Runs inside the sandboxed render frame, before the engine. Answers the app's commands over postMessage:
//   poster  → one draw, cut out and scaled to several widths (WebP blobs)
//   anchors → where each part's mask sits (for the numbered pins)
//   encode  → the whole timeline as an MP4 (WebCodecs + mp4-muxer), with progress
//   dispose → frees the WebGL context before the frame is reused
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

window.__capturing = true; // the engine's live loop never draws; we draw on demand

// resolve as soon as the engine publishes its API (no polling, so hidden-frame timer throttling cannot slow us down)
let resolveGt, rejectGt;
const gtReady = new Promise((res, rej) => { resolveGt = res; rejectGt = rej; });
let gtValue;
Object.defineProperty(window, '__gt', { configurable: true, get: () => gtValue, set: (v) => { gtValue = v; resolveGt(v); } });
Object.defineProperty(window, '__gtError', { configurable: true, get: () => undefined, set: (m) => rejectGt(new Error(m)) });

const post = (msg) => parent.postMessage(msg, '*');
const even = (x) => Math.max(2, Math.round(x / 2) * 2);

async function poster({ face = null, t = 0, bare = false, crop = null, widths = [1200], type = 'image/webp', quality = 0.9 }) {
  const g = await gtReady;
  if (face && g.faces.flat().includes(face)) await g.show(face);
  const cv = g.draw(t, { bare });
  const [sx, sy, sw, sh] = crop || [0, 0, cv.width, cv.height];
  const out = [];
  for (const w0 of widths) {
    const s = Math.min(1, w0 / sw), w = Math.round(sw * s), h = Math.round(sh * s);
    const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(cv, sx, sy, sw, sh, 0, 0, w, h);
    out.push({ width: w, height: h, blob: await c.convertToBlob({ type, quality }) });
  }
  return out;
}

// each mask: SVG in white on transparent at grid size; we rasterise it small and pick a point inside it near its middle
async function anchors({ masks, W, H, scale = 0.125 }) {
  const w = Math.max(8, Math.round(W * scale)), h = Math.max(8, Math.round(H * scale));
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  const out = [];
  for (const m of masks) {
    if (!m.svg) { out.push(null); continue; }
    const url = URL.createObjectURL(new Blob([m.svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image(); img.src = url; await img.decode();
      x.clearRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data;
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (d[(y * w + i) * 4 + 3] > 96) { sx += i; sy += y; n++; }
      if (!n) { out.push(null); continue; }
      const cx = sx / n, cy = sy / n;
      let best = null, bd = Infinity;
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (d[(y * w + i) * 4 + 3] > 96) {
        const dd = (i - cx) ** 2 + (y - cy) ** 2; if (dd < bd) { bd = dd; best = [i, y]; }
      }
      out.push([(best[0] + 0.5) / w * W, (best[1] + 0.5) / h * H]);
    } catch { out.push(null); }
    finally { URL.revokeObjectURL(url); }
  }
  return out;
}

const CODECS = [
  ['avc', 'avc1.640028', { avc: { format: 'avc' } }],
  ['vp9', 'vp09.00.40.08', {}],
  ['av1', 'av01.0.08M.08', {}],
];

async function encode({ fps = 24, width = 1080, bitrate = 5e6 }, id) {
  const g = await gtReady;
  if (!g.video) throw new Error('this piece has no timeline');
  if (typeof VideoEncoder === 'undefined') throw new Error('this browser cannot encode video (WebCodecs is missing)');
  const T = g.video.seconds, N = Math.max(1, Math.ceil(T * fps));
  const W = g.canvas.width, H = g.canvas.height, s = Math.min(1, width / W), w = even(W * s), h = even(H * s);
  let pick = null;
  for (const [name, codec, extra] of CODECS) {
    const cfg = { codec, width: w, height: h, bitrate, framerate: fps, ...extra };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) { pick = { name, cfg }; break; } } catch { /* try the next */ }
  }
  if (!pick) throw new Error('no video codec available in this browser');
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: pick.name, width: w, height: h, frameRate: fps }, fastStart: 'in-memory' });
  let failed = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  enc.configure(pick.cfg);
  const sc = new OffscreenCanvas(w, h), sx = sc.getContext('2d');
  try {
    for (let i = 0; i < N; i++) {
      if (failed) throw failed;
      const cv = g.draw(i / fps);
      sx.drawImage(cv, 0, 0, w, h);
      const vf = new VideoFrame(sc, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();
      if (enc.encodeQueueSize > 6) await new Promise((r) => enc.addEventListener('dequeue', r, { once: true }));
      if (i % 6 === 0) post({ type: 'progress', id, k: i / N });
    }
    await enc.flush();
    if (failed) throw failed;
  } finally {
    if (enc.state !== 'closed') enc.close();
  }
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), width: w, height: h, fps, seconds: T, codec: pick.name };
}

async function dispose() { try { (await Promise.race([gtReady, Promise.resolve(null)]))?.dispose(); } catch { /* already gone */ } return true; }

const H = { poster, anchors, encode, dispose };
addEventListener('message', async (ev) => {
  const { id, cmd, args } = ev.data || {};
  if (!id || !H[cmd]) return;
  try { post({ id, ok: true, r: await H[cmd](args || {}, id) }); }
  catch (e) { post({ id, ok: false, error: String(e?.message || e) }); }
});

gtReady.then(
  (g) => post({ type: 'ready', info: { video: g.video, faces: g.faces, buildMs: g.buildMs, W: g.canvas.width, H: g.canvas.height, unsupported: g.scene.unsupported } }),
  (e) => post({ type: 'error', error: e.message }),
);
