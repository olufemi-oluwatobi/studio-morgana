// Export a godtongue video: node web/video.cjs <index.html> <out.mp4>
// Frames come from the web runtime (window.__gt.frame(t)); ffmpeg only encodes them. Sound comes later, as its own property.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const [html, out] = process.argv.slice(2);
  const tmp = fs.mkdtempSync(path.join(path.dirname(path.resolve(out)), 'frames-'));
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await br.newPage({ viewport: { width: 400, height: 500 } });
  await p.goto('file://' + path.resolve(html));
  await p.waitForFunction(() => window.__gt || window.__gtError, null, { timeout: 120000 });
  const err = await p.evaluate(() => window.__gtError); if (err) throw new Error(err);
  const video = await p.evaluate(() => __gt.video);
  const N = Math.round(video.seconds * video.fps), t0 = Date.now();
  for (let f = 0; f < N; f++) {
    const url = await p.evaluate((t) => __gt.frame(t), f / video.fps);
    fs.writeFileSync(path.join(tmp, `f${String(f).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    if (f % 60 === 0) process.stdout.write(`frame ${f}/${N}\n`);
  }
  await br.close();
  const drawS = (Date.now() - t0) / 1000;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(video.fps), '-i', path.join(tmp, 'f%04d.jpg'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  fs.rmSync(tmp, { recursive: true });
  console.log(JSON.stringify({ frames: N, drawSeconds: drawS, perFrameMs: Math.round(drawS * 1000 / N), out }));
})().catch(e => { console.error(e.message); process.exit(1); });
