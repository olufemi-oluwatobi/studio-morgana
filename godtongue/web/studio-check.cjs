// Headless check of the studio page: compiles samples in the page and confirms each render boots.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const page = path.join(__dirname, '..', 'tools', 'studio', 'studio.html'), wrapped = '/tmp/gt-studio-check.html';
  fs.writeFileSync(wrapped, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(page, 'utf8') + '</body></html>');
  const br = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await br.newPage({ viewport: { width: 1400, height: 900 } });
  p.on('pageerror', (e) => console.log('page error:', e.message));
  await p.goto('file://' + wrapped);
  const booted = async (label) => {
    await p.waitForFunction(() => /Compiled|Not compiled/.test(document.getElementById('status').textContent), null, { timeout: 120000 });
    const st = await p.textContent('#status');
    const fr = p.frames()[1];
    let ok = false;
    if (/Compiled/.test(st)) { await fr.waitForFunction(() => window.__gt || window.__gtError, null, { timeout: 120000 }); ok = !(await fr.evaluate(() => window.__gtError)); }
    console.log(label, '|', st, '| render', ok ? 'booted' : 'failed', '|', (await p.textContent('#diag')).slice(0, 120));
  };
  await booted('goku');
  await p.screenshot({ path: path.join(__dirname, '..', 'tools', 'studio', 'studio-shot.png') });
  for (const s of ['video/mean-reversion.gt', 'stage/card-on-desk.gt', 'hello.gt']) {
    await p.evaluate(() => { document.getElementById('status').textContent = ''; });
    await p.selectOption('#sample', s); await booted(s);
  }
  await p.evaluate(() => { document.getElementById('status').textContent = ''; const t = document.getElementById('src'); t.value = t.value + '\nplate the moon with gold.'; });
  await p.click('#run'); await booted('broken hello');
  await br.close();
})().catch((e) => { console.error(e); process.exit(1); });
