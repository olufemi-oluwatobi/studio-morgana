const { chromium } = require('playwright');
const [page, target, out] = [process.argv[2], +process.argv[3], process.argv[4]];
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface'] });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto(`http://localhost:8811/${page}?headless`);
  const marks = [1, 4, 16, 64, 256, 1024].filter(n => n <= target);
  while (marks.length) {
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => window.__room);
    if (r && r.spp >= marks[0]) {
      const n = marks.shift();
      const a = await p.evaluate(() => window.__readAccum());
      require('fs').writeFileSync(`${out}_${n}.json`, JSON.stringify(a));
      const d = await p.evaluate(() => window.__readDenoised()); if (n === 1) require('fs').writeFileSync('guide.json', JSON.stringify(await p.evaluate(() => window.__readGuide()))); require('fs').writeFileSync(`${out}_dn_${n}.json`, JSON.stringify(d));
      console.log('saved at spp', r.spp, r.elapsed.toFixed(1) + 's');
    }
  }
  await b.close();
})();
