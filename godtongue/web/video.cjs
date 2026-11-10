// Export a godtongue video: node web/video.cjs <index.html> <out.mp4>
// Frames come from the same web runtime (window.__gt.frame(t)); sound is built from the timeline
// (a spray hiss for every timed coat, shaped by its nozzle). ffmpeg only encodes; it draws nothing.
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
  const { video, sprays } = await p.evaluate(() => ({ video: __gt.video, sprays: SCENE.elements.flatMap(e => e.steps.filter(s => s.kind === 'paint' && s.params.t0 != null).map(s => s.params)) }));
  const N = Math.round(video.seconds * video.fps), t0 = Date.now();
  for (let f = 0; f < N; f++) {
    const url = await p.evaluate((t) => __gt.frame(t), f / video.fps);
    fs.writeFileSync(path.join(tmp, `f${String(f).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    if (f % 60 === 0) process.stdout.write(`frame ${f}/${N}\n`);
  }
  await br.close();
  const drawS = (Date.now() - t0) / 1000;
  // sound: one hiss per coat; finer nozzles hiss higher and softer, every coat starts with a short burst
  const args = ['-y', '-v', 'error', '-framerate', String(video.fps), '-i', path.join(tmp, 'f%04d.jpg')];
  const parts = [];
  sprays.forEach((s, i) => {
    const hp = { fine: 2600, medium: 1600, coarse: 900 }[s.nozzle], vol = { fine: .22, medium: .3, coarse: .38 }[s.nozzle], d = s.dur || 1;
    args.push('-f', 'lavfi', '-t', String(d + .15), '-i', `anoisesrc=color=pink:seed=${i + 3}:amplitude=1`);
    parts.push(`[${i + 1}:a]highpass=f=${hp},lowpass=f=11000,volume=${vol},afade=t=in:d=0.04,afade=t=out:st=${d - .05}:d=0.2,adelay=${Math.round(s.t0 * 1000)}|${Math.round(s.t0 * 1000)}[a${i}]`);
  });
  const mix = `${parts.join(';')};${sprays.map((_, i) => `[a${i}]`).join('')}amix=inputs=${sprays.length}:normalize=0,apad[aout]`;
  args.push('-filter_complex', mix, '-map', '0:v', '-map', '[aout]', '-t', String(video.seconds), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out);
  execFileSync('ffmpeg', args);
  fs.rmSync(tmp, { recursive: true });
  console.log(JSON.stringify({ frames: N, drawSeconds: drawS, perFrameMs: Math.round(drawS * 1000 / N), out }));
})().catch(e => { console.error(e.message); process.exit(1); });
