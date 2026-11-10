// Deterministic frame capture for the web engine. Used by web/frames.cjs (CLI) and test/web.js (golden frames).
//   frame(html, { side })  a card: shows the named face with a fixed tilt; returns the lit canvas as PNG bytes
//   frame(html, { t })     a stage or video: returns the exact frame at time t (seconds) from __gt.frame(t)
//   compare(a, b)          mean absolute difference of two PNG buffers, 0..1 (decoded in a browser)
const { chromium } = require('playwright');

const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };

async function open(html, fn) {
  const br = await chromium.launch(LAUNCH);
  try {
    const p = await br.newPage({ viewport: { width: 1000, height: 1000 } });
    await p.goto('file://' + require('path').resolve(html));
    await p.waitForFunction(() => window.__gt || window.__gtError, null, { timeout: 180000 });
    const err = await p.evaluate(() => window.__gtError);
    if (err) throw new Error('page error: ' + err);
    return await fn(p);
  } finally { await br.close(); }
}

async function frame(html, { side, t } = {}) {
  return open(html, async (p) => {
    const isVideo = await p.evaluate(() => !!window.__gt.video);
    if (isVideo || t != null) {
      const url = await p.evaluate((tt) => window.__gt.frame(tt), t ?? 0);
      return Buffer.from(url.split(',')[1], 'base64');
    }
    if (side) await p.evaluate((s) => window.__gt.show(s), side);
    await p.evaluate(() => window.__gt.setTilt(0.12, -0.05));
    await p.waitForTimeout(1500);
    return p.locator('#gl').screenshot({ type: 'png' });
  });
}

async function compare(a, b) {
  const br = await chromium.launch(LAUNCH);
  try { const p = await br.newPage(); await p.setContent('<!doctype html><title>compare</title>'); return await p.evaluate(async ([A, B]) => {
    const load = (buf) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + buf; });
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return 1;
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 0; i < da.length; i += 4) s += (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
    return s / (da.length / 4) / 255;
  }, [a.toString('base64'), b.toString('base64')]); } finally { await br.close(); }
}

module.exports = { frame, compare, LAUNCH };
