// End to end, in a real browser, against a running Worker (npm run dev + npm run seed first):
// the wall, generating, references, the drag tray, tabs, the editor (parts, command, hand edit, undo, export),
// light and dark, phone layout, sign-in, and memory over repeated navigation.
//   node scripts/e2e.mjs [--base http://127.0.0.1:8787]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'e2e'); fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.argv[process.argv.indexOf('--base') + 1] || '').startsWith('http') ? process.argv[process.argv.indexOf('--base') + 1] : 'http://127.0.0.1:8787';
const { chromium } = createRequire(import.meta.url)('playwright');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' · ' + detail : ''}`); };
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') });
const errors = [];

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });

// ── wall
await page.goto(BASE + '/');
await page.waitForSelector('a.tile img.loaded', { timeout: 30000 });
await page.waitForTimeout(800);
const featured = await page.locator('a.tile').count();
check('wall shows the featured pieces', featured >= 8, `${featured} tiles`);
const borders = await page.evaluate(() => { const t = document.querySelector('a.tile'); const s = getComputedStyle(t); return [s.borderTopWidth, s.boxShadow, s.backgroundColor]; });
check('tiles have no border, shadow or backdrop', borders[0] === '0px' && borders[1] === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(borders[2]), borders.join(' | '));
const gap = await page.evaluate(() => { const r = [...document.querySelectorAll('a.tile')].slice(0, 2).map((t) => t.getBoundingClientRect()); return Math.round(r[1].left - r[0].right); });
check('tight gutters', gap >= 4 && gap <= 8, `${gap}px between columns`);
await shot(page, 'wall-desktop-dark');

await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(300);
const barTop = await page.evaluate(() => Math.round(document.querySelector('.bar').getBoundingClientRect().top));
const sideTop = await page.evaluate(() => Math.round(document.querySelector('.side').getBoundingClientRect().top));
check('header and sidebar stay fixed while scrolling', barTop === 0 && sideTop === 0, `header ${barTop}px, sidebar ${sideTop}px`);
await page.evaluate(() => window.scrollTo(0, 0));

// tabs
await page.locator('.tab', { hasText: 'Videos' }).click();
await page.waitForTimeout(1200);
const vids = await page.locator('a.tile').count();
check('the Videos tab shows only videos', vids >= 1 && vids < featured, `${vids} tiles`);
await page.waitForTimeout(1500);
const playing = await page.evaluate(() => [...document.querySelectorAll('.tile video')].filter((v) => !v.paused).length);
check('video previews play in view (at most two)', playing >= 1 && playing <= 2, `${playing} playing`);
await page.locator('.tab', { hasText: 'All' }).click();
await page.waitForTimeout(1200);

// composer opens smoothly; a piece dragged onto it becomes a reference
await page.locator('.composer textarea').click();
await page.waitForTimeout(400);
const panelOpen = await page.evaluate(() => document.querySelector('.composer').classList.contains('open'));
check('the composer opens when you type', panelOpen);
await page.locator('a.tile').nth(2).dragTo(page.locator('.composer'));
await page.waitForTimeout(400);
check('dropping a piece on the composer adds a reference', (await page.locator('.composer .ref').count()) === 1);
await shot(page, 'composer-with-reference');

// generate four options
await page.locator('.composer textarea').fill('a jade card with gold trim called "Orchid"');
const before = await page.locator('a.tile').count();
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const skeletons = await page.locator('.tile .tile-state').count();
check('Make puts four skeletons on the wall at once', skeletons >= 4, `${skeletons} skeletons`);
await shot(page, 'wall-generating');
const t0 = Date.now();
await page.waitForFunction(() => !document.querySelector('.tile .tile-state'), null, { timeout: 180000 });
const made = (await page.locator('a.tile').count()) - before;
check('all four options render and land on the wall', made === 4, `${made} new pieces in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await shot(page, 'wall-after-make');

// the drag tray: drag a tile onto Remove, then Undo
async function dragToZone(tile, zone) {
  const b = await tile.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 20, { steps: 5 }); await page.waitForTimeout(200);
  const z = page.locator('.zone', { hasText: zone }); const zb = await z.boundingBox();
  if (!zb) { await page.mouse.up(); return false; }
  await page.mouse.move(zb.x + zb.width / 2, zb.y + zb.height / 2, { steps: 8 }); await page.waitForTimeout(150);
  await shot(page, 'drag-tray');
  await page.mouse.up(); await page.waitForTimeout(500); return true;
}
const n0 = await page.locator('a.tile').count();
const trayOk = await dragToZone(page.locator('a.tile').first(), 'Remove');
const n1 = await page.locator('a.tile').count();
check('dragging to Remove takes the piece off the wall', trayOk && n1 === n0 - 1, `${n0} → ${n1}`);
await page.locator('.toast button', { hasText: 'Undo' }).click(); await page.waitForTimeout(800);
check('Undo brings it back', (await page.locator('a.tile').count()) === n0);

// ── editor (one of the new pieces: ours, so edits stay on it)
await page.locator('a.tile').first().click();
await page.waitForSelector('.art img', { timeout: 30000 });
await page.waitForTimeout(800);
check('the editor shows the piece with nothing over it', (await page.locator('.pin').count()) === 0);
await shot(page, 'editor');
await page.locator('.seg button', { hasText: 'Parts' }).click();
await page.waitForSelector('.pin', { timeout: 30000 });
const pins = await page.locator('.pin').count();
check('Parts shows numbered pins', pins >= 2, `${pins} pins`);
await shot(page, 'editor-parts');
await page.locator('.seg button', { hasText: 'Image' }).click();

const v1 = await page.locator('.panel-meta').innerText();
const src1 = await page.locator('.art img').getAttribute('src');
await page.locator('#cmd').fill('make p1 navy');
const tc = Date.now();
await page.locator('.command .make').click();
await page.waitForFunction((s) => { const i = document.querySelector('.art img'); return i && i.getAttribute('src') !== s && !document.querySelector('.working'); }, src1, { timeout: 90000 });
const v2 = await page.locator('.panel-meta').innerText();
const marked = await page.locator('.mark.changed').count();
check('a command makes a new version and re-renders', v2 !== v1 && marked >= 1, `${v1} → ${v2}, ${marked} changed line(s), ${((Date.now() - tc) / 1000).toFixed(1)} s`);
await shot(page, 'editor-after-command');

const code = page.locator('.code textarea');
await code.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('\n-- edited by hand');
const src2 = await page.locator('.art img').getAttribute('src');
await page.keyboard.press('Control+Enter');
await page.waitForFunction(() => !document.querySelector('.working'), null, { timeout: 90000 });
await page.waitForTimeout(500);
const v3 = await page.locator('.panel-meta').innerText();
check('editing the godtongue and pressing Run saves a version', /edited by hand/.test(v3), v3);
await page.locator('button[aria-label="Undo"]').click();
await page.waitForFunction(() => !document.querySelector('.working'), null, { timeout: 90000 });
await page.waitForTimeout(500);
const undone = await code.inputValue();
check('Undo goes back to the version before', !undone.includes('-- edited by hand'));
void src2;

// a broken line shows where it is
await code.click(); await page.keyboard.press('Control+End'); await page.keyboard.type('\nfrobnicate the card.');
await page.keyboard.press('Control+Enter');
await page.waitForSelector('.diags li', { timeout: 60000 });
check('a broken line is reported with its line number', /Line \d+/.test(await page.locator('.diags').innerText()), (await page.locator('.diags li').first().innerText()).slice(0, 80));
await shot(page, 'editor-error');

// export
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), (async () => { await page.locator('button', { hasText: 'Export' }).click(); await page.locator('.menu button', { hasText: 'Image (PNG)' }).click(); })()]);
const pngPath = path.join(OUT, 'export.png'); await dl.saveAs(pngPath);
check('Export saves a PNG', fs.statSync(pngPath).size > 10000, `${Math.round(fs.statSync(pngPath).size / 1024)} KB`);

// a featured piece: editing it makes your own copy
await page.goto(BASE + '/');
await page.waitForSelector('a.tile img.loaded');
await page.locator('.side-link', { hasText: 'Wall' }).click();
const featuredId = await page.evaluate(async () => (await (await fetch('/api/wall')).json()).featured.find((p) => p.category === 'cards').id);
await page.goto(BASE + '/p/' + featuredId);
await page.waitForSelector('.art img');
await page.locator('#cmd').fill('make p1 crimson');
await page.locator('.command .make').click();
await page.waitForFunction((id) => !location.pathname.includes(id) && !document.querySelector('.working'), featuredId, { timeout: 90000 });
check('editing a featured piece saves your own copy', !page.url().includes(featuredId), page.url().replace(BASE, ''));

// ── memory: back and forth between the wall and the editor
const heap = async () => { await page.evaluate(() => window.gc && window.gc()); await page.waitForTimeout(300); return page.evaluate(() => performance.memory.usedJSHeapSize); };
await page.goto(BASE + '/'); await page.waitForSelector('a.tile img.loaded');
const h0 = await heap();
for (let i = 0; i < 6; i++) {
  await page.locator('a.tile').nth(i % 4).click(); await page.waitForSelector('.art img, .player video', { timeout: 30000 }); await page.waitForTimeout(600);
  await page.goBack(); await page.waitForSelector('a.tile'); await page.waitForTimeout(600);
}
const h1 = await heap();
const frames = await page.evaluate(() => document.querySelectorAll('iframe').length);
const liveVideos = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => v.getAttribute('src')).length);
check('no memory growth over six round trips', h1 - h0 < 8e6, `heap ${(h0 / 1e6).toFixed(1)} → ${(h1 / 1e6).toFixed(1)} MB, ${frames} render frame, ${liveVideos} live videos`);

// ── light mode
await page.locator('.side-link', { hasText: 'Light' }).click(); await page.waitForTimeout(400);
const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('light mode', bg === 'rgb(246, 244, 240)', bg);
await shot(page, 'wall-desktop-light');
await page.goto(BASE + '/p/' + featuredId); await page.waitForSelector('.art img'); await page.waitForTimeout(600);
await shot(page, 'editor-light');
await page.evaluate(() => { localStorage.removeItem('morgana-theme'); });

// ── phone
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const m = await phone.newPage();
m.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message));
await m.goto(BASE + '/'); await m.waitForSelector('a.tile img.loaded'); await m.waitForTimeout(800);
const mw = await m.evaluate(() => document.documentElement.scrollWidth);
const cols = await m.evaluate(() => new Set([...document.querySelectorAll('a.tile')].map((t) => Math.round(t.getBoundingClientRect().left))).size);
const pad = await m.evaluate(() => Math.round(document.querySelector('a.tile').getBoundingClientRect().left));
check('phone: two columns, small side padding, no sideways scroll', mw === 390 && cols === 2 && pad <= 8, `${cols} columns, ${pad}px side padding, width ${mw}`);
await m.screenshot({ path: path.join(OUT, 'wall-phone.png') });
await m.evaluate(() => window.scrollTo(0, 900)); await m.waitForTimeout(300);
await m.screenshot({ path: path.join(OUT, 'wall-phone-scrolled.png') });
await m.locator('.menu-btn').click(); await m.waitForTimeout(400);
await m.screenshot({ path: path.join(OUT, 'phone-menu.png') });
await m.locator('.side-close').click(); await m.waitForTimeout(300);
await m.goto(BASE + '/p/' + featuredId); await m.waitForSelector('.art img'); await m.waitForTimeout(800);
check('phone: the editor fits', (await m.evaluate(() => document.documentElement.scrollWidth)) === 390);
await m.screenshot({ path: path.join(OUT, 'editor-phone.png') });
await m.evaluate(() => window.scrollTo(0, 2000)); await m.waitForTimeout(300);
await m.screenshot({ path: path.join(OUT, 'editor-phone-code.png') });

// ── sign in with the demo account
const a = await (await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' })).newPage();
await a.goto(BASE + '/auth');
await a.fill('input[type=email]', 'demo@example.com'); await a.fill('input[type=password]', 'morgana-demo-2026');
await a.screenshot({ path: path.join(OUT, 'sign-in.png') });
await a.locator('button.primary').click();
await a.waitForSelector('.account-email', { timeout: 15000 });
check('the demo account signs in', /demo@example.com/.test(await a.locator('.account-email').innerText()));

check('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' || '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
