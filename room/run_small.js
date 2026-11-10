// Run the WebGPU page headless (SwiftShader, CPU) until N spp, then save the canvas.
const { chromium } = require('playwright');
const target = +(process.argv[2] || 16), out = process.argv[3] || 'webgpu.png';
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface'] });
  const p = await b.newPage({ viewport: { width: 1000, height: 1000 } });
  p.on('console', m => console.log('console:', m.text()));
  p.on('pageerror', e => console.log('pageerror:', e.message));
  await p.goto('http://localhost:8811/small.html');
  const t0 = Date.now();
  while (true) {
    await p.waitForTimeout(1000);
    const r = await p.evaluate(() => [window.__room, document.getElementById('msg').textContent]);
    if (r[1]) { console.log('msg:', r[1]); break; }
    if (r[0] && r[0].spp >= target) { console.log('spp', r[0].spp, 'in', r[0].elapsed.toFixed(1), 's'); break; }
    if (Date.now() - t0 > 540000) { console.log('timeout at', r[0]); break; }
  }
  const data = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  require('fs').writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  await b.close();
})();
