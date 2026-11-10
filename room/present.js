const { chromium } = require('playwright');
const sets = [
 ['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader'],
 ['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-webgpu-adapter=swiftshader','--use-angle=swiftshader'],
 ['--enable-unsafe-webgpu','--enable-features=Vulkan,WebGPUService','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--use-angle=vulkan'],
];
(async () => {
  for (const args of sets) {
    for (const headless of [true]) {
      const b = await chromium.launch({ args, headless, channel: undefined });
      const p = await b.newPage();
      let err = ''; p.on('pageerror', e => err += e.message); p.on('console', m => { if (/lost|gpuerr/.test(m.text())) err += m.text(); });
      await p.goto('http://localhost:8811/small.html');
      await p.waitForTimeout(6000);
      const r = await p.evaluate(() => window.__room);
      console.log(args.slice(1).join(' '), '=>', JSON.stringify(r), err.slice(0, 80));
      if (r && r.spp > 0) { await p.screenshot({ path: 'present_ok.png' }); }
      await b.close();
    }
  }
})();
