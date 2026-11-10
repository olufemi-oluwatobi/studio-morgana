const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface'] });
  const p = await b.newPage();
  p.on('console', m => console.log('console:', m.text()));
  p.on('pageerror', e => console.log('pageerror:', e.message));
  p.goto('http://localhost:8811/small_nodraw.html').catch(e=>console.log('goto',e.message));
  for (let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,2000)); try{ const s=await Promise.race([p.evaluate(()=>JSON.stringify(window.__room||null)), new Promise(r=>setTimeout(()=>r('eval-timeout'),3000))]); console.log(i, s);}catch(e){console.log('err',e.message);break;} }
  await b.close();
})();
