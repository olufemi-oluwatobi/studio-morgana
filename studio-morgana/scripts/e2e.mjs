// End to end, in a real browser, against a running Worker (npm run dev + npm run seed first):
// the wall, generating, references, the drag tray, type tabs, projects and pins, deleting, the editor (parts, command, hand edit, undo, export),
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
check('gutters with room to breathe', gap >= 12 && gap <= 16, `${gap}px between columns`);
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
const trayOk = await dragToZone(page.locator('a.tile').first(), 'Delete');
const n1 = await page.locator('a.tile').count();
check('dragging your piece to Delete takes it off the wall', trayOk && n1 === n0 - 1, `${n0} → ${n1}`);
await page.locator('.toast button', { hasText: 'Undo' }).click(); await page.waitForTimeout(800);
check('Undo brings it back', (await page.locator('a.tile').count()) === n0);

// ── piece types: the tabs go by type; slides are coming
check('the Slides tab is shown as coming soon', await page.locator('.tab.soon', { hasText: 'Slides' }).isDisabled());

// ── projects: make one, pin a featured piece by dropping it on the project, make pieces on its wall, unpin
const PROJECT = 'Moodboard ' + Date.now().toString(36).slice(-4);
await page.locator('button[aria-label="New project"]').click();
await page.locator('.new-project input').fill(PROJECT);
await page.keyboard.press('Enter');
await page.waitForURL(/\/projects\/[a-z0-9]+$/);
const projectUrl = page.url();
await page.waitForSelector('.project-name');
check('a new project opens its own (empty) wall', (await page.locator('.project-name').innerText()) === PROJECT && (await page.locator('a.tile').count()) === 0, projectUrl.replace(BASE, ''));
await shot(page, 'project-empty');
await page.locator('.side-link', { hasText: 'Wall' }).click();
await page.waitForSelector('a.tile img.loaded');
const link = page.locator('.side-link.project', { hasText: PROJECT });
const pinTitle = await page.locator('a.tile').nth(6).getAttribute('aria-label');
await page.locator('a.tile').nth(6).dragTo(link);
await page.waitForSelector('.toast', { hasText: 'Pinned to ' + PROJECT });
check('dropping a piece on a project pins it', (await link.locator('.project-n').innerText()) === '1', pinTitle);
await link.click();
await page.waitForSelector('a.tile img.loaded');
check("the project's wall shows its pins", (await page.locator('a.tile').count()) === 1 && (await page.locator('a.tile').first().getAttribute('aria-label')) === pinTitle);
await page.locator('.composer textarea').fill('a navy post with a gold star');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.waitForFunction(() => !document.querySelector('.tile .tile-state'), null, { timeout: 180000 });
await page.waitForTimeout(500);
const inProject = await page.locator('a.tile').count();
check('pieces made on a project wall are pinned to it', inProject === 5 && (await link.locator('.project-n').innerText()) === '5', `${inProject} pieces`);
await shot(page, 'project-wall');
const unpinOk = await dragToZone(page.locator('a.tile').last(), 'Unpin');
check('dragging to Unpin takes it off the project only', unpinOk && (await page.locator('a.tile').count()) === 4 && (await link.locator('.project-n').innerText()) === '4');
await page.locator('.side-link', { hasText: 'Wall' }).click();
await page.waitForSelector('a.tile img.loaded');

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

// pin from the editor
await page.locator('.editor-bar .btn', { hasText: 'Pin' }).click();
// (this piece was made on the project's wall, so it starts pinned there: unpin, then pin again)
const item = page.locator('.pin-menu button', { hasText: PROJECT });
const startsPinned = (await item.getAttribute('aria-checked')) === 'true';
await item.click(); await page.waitForFunction((on) => document.querySelector('.pin-menu [aria-checked]')?.getAttribute('aria-checked') === String(!on), startsPinned);
if (startsPinned) { await item.click(); await page.waitForSelector('.pin-menu [aria-checked="true"]'); }
await shot(page, 'editor-pin-menu');
await page.keyboard.press('Escape');
check('Pin in the editor pins and unpins the piece', startsPinned && /Pinned/.test(await page.locator('.btn.pinned').innerText()) && (await link.locator('.project-n').innerText()) === '4');

const v1 = await page.locator('.panel-meta').innerText();
const src1 = await page.locator('.art img').getAttribute('src');
await page.locator('#cmd').fill('make p1 crimson');
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

// delete from the editor: back to your pieces, gone from them, Undo available
const doomed = page.url().split('/p/')[1];
await page.goto(BASE + '/p/' + doomed); await page.waitForSelector('.art img');
await page.locator('button[aria-label="Delete this piece"]').click();
await page.waitForURL(/\/mine$/);
await page.waitForTimeout(800);
const stillThere = await page.locator(`a.tile[href="/p/${doomed}"]`).count();
check('Delete in the editor deletes the piece (with Undo)', stillThere === 0 && (await page.locator('.toast button', { hasText: 'Undo' }).count()) === 1);

// a featured piece: editing it makes your own copy
await page.goto(BASE + '/');
await page.waitForSelector('a.tile img.loaded');
await page.locator('.side-link', { hasText: 'Wall' }).click();
const featuredId = await page.evaluate(async () => (await (await fetch('/api/wall')).json()).featured.find((p) => p.category === 'cards').id);
await page.goto(BASE + '/p/' + featuredId);
await page.waitForSelector('.art img');
await page.locator('#cmd').fill('make p1 crimson');
await page.locator('.command .make').click();
await page.waitForFunction((id) => !location.pathname.includes(id) && !document.querySelector('.working'), featuredId, { timeout: 90000 }).catch(async (e) => { await shot(page, 'remix-fail'); console.log(page.url(), await page.locator('.toast').allInnerTexts()); throw e; });
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
check('phone: two columns, small side padding, no sideways scroll', mw === 390 && cols === 2 && pad >= 12 && pad <= 16, `${cols} columns, ${pad}px side padding, width ${mw}`);
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


// ── the input: "+", files and content
await a.goto(BASE + '/');
await a.waitForSelector('a.tile img.loaded', { timeout: 30000 });
check('the input has a + button and no sparkle or image icon', (await a.locator('.composer .add').count()) === 1 && (await a.locator('.composer-mark').count()) === 0 && (await a.locator('.composer-row .icon-btn').count()) === 0);
await shot(a, 'input-1-empty');
await a.locator('.composer textarea').click(); await a.waitForTimeout(400);
await shot(a, 'input-2-focused');
await a.locator('.composer textarea').fill('a chrome-trimmed navy card called "Aurora", with the face from the photo');
await shot(a, 'input-3-with-text');
const EX = path.resolve(ROOT, '..', 'godtongue', 'examples');
const photos = ['marilyn.jpg', 'back-art.jpg'].map((f) => path.join(EX, f)).filter((f) => fs.existsSync(f));
await a.locator('.composer input[type=file]').setInputFiles(photos);
await a.waitForFunction((n) => document.querySelectorAll('.composer .ref').length === n && !document.querySelector('.composer .ref.busy'), photos.length, { timeout: 30000 });
check('uploaded files appear as chips inside the input', (await a.locator('.composer .refs.in-input .ref').count()) === photos.length);
await a.locator('.composer textarea').fill('a chrome-trimmed navy card called "Aurora", with the face from the photo, soft light, a long second line to show how the input grows when there is a lot to say about the piece');
await a.waitForTimeout(300);
await shot(a, 'input-4-files-and-content');
await a.locator('.composer .ref-x').first().click();
check('a chip can be removed', (await a.locator('.composer .ref').count()) === photos.length - 1);
const [at, bt] = [await a.locator('.composer').boundingBox(), await a.locator('.tabs').boundingBox()];
check('the input stays above the tabs and full width', at.y + at.height <= bt.y + 1 && at.width > 900, `${Math.round(at.width)}px wide`);

// ── public and private
await a.locator('.composer textarea').fill('minimal ivory piece called "Quiet"');
await a.keyboard.press('Enter');
await a.waitForFunction(() => !document.querySelector('.tile .tile-state') && document.querySelectorAll('a.tile').length > 0, null, { timeout: 180000 });
await a.goto(BASE + '/mine'); await a.waitForSelector('.mine-head'); await a.waitForSelector('a.tile img.loaded', { timeout: 30000 });
const mineIds = await a.evaluate(async () => (await (await fetch('/api/wall')).json()).mine.map((p) => p.id));
check('Your pieces has a piece to make public', mineIds.length >= 2, `${mineIds.length} pieces`);
const [pubId, privId] = mineIds;
// every page of the featured + showcase section, in order
const ALL_FEATURED = async () => { const ids = []; let cur = 0; for (let k = 0; k < 20 && cur != null; k++) { const r = await (await fetch('/api/wall?limit=60&cursor=' + cur)).json(); ids.push(...r.featured.map((p) => p.id)); cur = r.next; } return ids; };
const visitor = await (await browser.newContext()).newPage();
await visitor.goto(BASE + '/');
const vget = (id) => visitor.evaluate(async (i) => (await fetch('/api/pieces/' + i)).status, id);
check('a new piece is private by default: a visitor gets 404', (await vget(pubId)) === 404);
await a.goto(BASE + '/p/' + pubId); await a.waitForSelector('.art img');
await a.locator('.editor-bar button[aria-label="Private"]').click(); await a.waitForTimeout(250);
await shot(a, 'visibility-menu');
await a.locator('.vis-menu button', { hasText: 'Public' }).click();
await a.waitForSelector('.editor-bar button[aria-label="Public"]');
check('making it public works, and the button says so', true);
check('a visitor can now open the public piece, not the private one', (await vget(pubId)) === 200 && (await vget(privId)) === 404);
const vjson = await visitor.evaluate(ALL_FEATURED);
let seeded = vjson.includes(pubId);
for (let i = 0; i < 20 && !seeded; i++) { await a.waitForTimeout(250); seeded = (await visitor.evaluate(ALL_FEATURED)).includes(pubId); }
check('going public fires the showcase job at once, no waiting for the cron', seeded);
const anon = await visitor.evaluate(async (i) => (await fetch('/api/pieces/' + i + '/visibility', { method: 'POST', headers: { 'content-type': 'application/json', 'x-morgana': '1' }, body: '{"visibility":"public"}' })).status, privId);
check('a visitor cannot change visibility', anon === 403 || anon === 401 || anon === 404, String(anon));

// ── the scheduler
const run = await a.evaluate(async () => (await (await fetch('/api/admin/jobs/run', { method: 'POST', headers: { 'content-type': 'application/json', 'x-morgana': '1' }, body: '{}' })).json()));
const sc = run.results?.find((r) => r.job === 'showcase');
check('the showcase job runs and picks the public piece', sc && !sc.error && sc.picked >= 1 && sc.eligible >= 1, JSON.stringify(sc));
const after = await visitor.evaluate(ALL_FEATURED);
check('now the public piece is on everyones wall, the private one is not', after.includes(pubId) && !after.includes(privId));
check('the featured pieces stay first', after[0] === (await visitor.evaluate(async () => (await (await fetch('/api/wall')).json()).featured[0].id)) && after.indexOf(pubId) > 0);
const jobs = await a.evaluate(async () => (await (await fetch('/api/admin/jobs')).json()).jobs.map((j) => j.name));
check('last runs are recorded', jobs.includes('showcase') && jobs.includes('housekeeping'), jobs.join(', '));
const vis403 = await visitor.evaluate(async () => (await fetch('/api/admin/jobs/run', { method: 'POST', headers: { 'content-type': 'application/json', 'x-morgana': '1' }, body: '{}' })).status);
check('visitors cannot run jobs', vis403 === 401 || vis403 === 403, String(vis403));
await a.goto(BASE + '/p/' + pubId); await a.waitForSelector('.art img');
await a.locator('.editor-bar button[aria-label="Public"]').click();
await a.locator('.vis-menu button', { hasText: 'Private' }).click();
await a.waitForSelector('.editor-bar button[aria-label="Private"]');
const back = await visitor.evaluate(ALL_FEATURED);
check('making it private again takes it off the showcase at once', !back.includes(pubId));
await a.locator('.vis-menu').count();
await a.locator('.editor-bar button[aria-label="Private"]').click();
await a.locator('.vis-menu button', { hasText: 'Public' }).click();
await a.waitForSelector('.editor-bar button[aria-label="Public"]');

await a.goto(BASE + '/mine'); await a.waitForSelector('.mine-head'); await a.waitForSelector('a.tile img.loaded', { timeout: 30000 });
const total = await a.locator('a.tile').count();
await a.locator('.mine-head .seg button', { hasText: 'Public' }).click(); await a.waitForTimeout(400);
const nPub = await a.locator('a.tile').count();
await shot(a, 'your-pieces-public');
await a.locator('.mine-head .seg button', { hasText: 'Private' }).click(); await a.waitForTimeout(400);
const nPriv = await a.locator('a.tile').count();
await shot(a, 'your-pieces-private');
await a.locator('.mine-head .seg button', { hasText: 'All' }).click(); await a.waitForTimeout(300);
check('the filter splits Your pieces into public and private', nPub >= 1 && nPriv >= 1 && nPub + nPriv === total, `${nPub} public + ${nPriv} private = ${total}`);
await a.goto(BASE + '/'); await a.waitForSelector('a.tile img.loaded', { timeout: 30000 });
await a.locator('.side-link', { hasText: 'Refresh showcase' }).click();
await a.waitForSelector('.toast', { timeout: 15000 });
check('admins get a Refresh showcase button', /Showcase refreshed/.test(await a.locator('.toast').first().innerText()));

// ── seeding an empty wall from the browser (admin)
await a.goto(BASE + '/'); await a.waitForSelector('a.tile img.loaded', { timeout: 30000 });
const fBefore = await a.evaluate(async () => (await (await fetch('/api/admin/collections/featured')).json()).pieceIds.length);
await a.locator('.side-link', { hasText: 'Seed the wall' }).click();
await a.waitForFunction(() => [...document.querySelectorAll('.toast')].some((t) => /Seeded the wall/.test(t.textContent)), null, { timeout: 240000 });
const fAfter = await a.evaluate(async () => (await (await fetch('/api/admin/collections/featured')).json()).pieceIds.length);
check('Seed the wall makes pieces in the browser and features them', fAfter > fBefore, `${fBefore} → ${fAfter} featured`);

check('no errors in the console', errors.length === 0, errors.slice(0, 5).join(' || '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} checks failed` : `all ${results.length} checks passed`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed ? 1 : 0);
