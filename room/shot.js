const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface'] });
  const p = await b.newPage({ viewport: { width: 1040, height: 1000 } });
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8811/' + process.argv[2]);
  await p.waitForTimeout(+process.argv[3] || 20000);
  console.log(p.url(), JSON.stringify(await p.evaluate(() => window.__room)));
  await p.screenshot({ path: process.argv[4] || 'shot.png', fullPage: true });
  await b.close();
})();
