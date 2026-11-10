const { chromium } = require('playwright');
(async () => {
  for (const args of [
    ['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface'],
    ['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan'],
  ]) {
    const b = await chromium.launch({ args });
    const p = await b.newPage(); await p.goto('http://localhost:8811/blank.html');
    const r = await p.evaluate(async () => {
      if (!navigator.gpu) return 'no navigator.gpu';
      const a = await navigator.gpu.requestAdapter();
      if (!a) return 'no adapter';
      const info = a.info || {};
      return 'adapter ok ' + JSON.stringify({v: info.vendor, d: info.description, arch: info.architecture});
    });
    console.log(args.join(' '), '=>', r);
    await b.close();
  }
})();
