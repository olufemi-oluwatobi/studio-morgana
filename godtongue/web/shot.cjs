// Headless check of the web engine: node web/shot.cjs <index.html> <out.png> [side]
// Prints build time and frame rate (software GL in headless, so the numbers are a floor, not the target machine).
const { chromium } = require('playwright');
(async () => {
  const [html, out, side] = process.argv.slice(2);
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await br.newPage({ viewport: { width: +(process.env.VW || 700), height: +(process.env.VH || 1000) } });
  p.on('console', m => m.type() === 'error' && console.log('console:', m.text()));
  await p.goto('file://' + require('path').resolve(html));
  await p.waitForFunction(() => window.__gt || window.__gtError, null, { timeout: 60000 });
  const err = await p.evaluate(() => window.__gtError); if (err) { console.log('ERROR', err); process.exit(1); }
  if (side) await p.evaluate((s) => window.__gt.show(s), side);
  await p.evaluate(() => window.__gt.setTilt(0.12, -0.05));
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({ buildMs: Math.round(__gt.buildMs), steps: __gt.steps, fps: Math.round(__gt.fps()) }));
  await p.locator('#gl').screenshot({ path: out });
  console.log(JSON.stringify(info)); await br.close();
})();
