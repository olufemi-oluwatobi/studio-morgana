// The editor's hover cards and error handling, in a real browser against a running Worker.
//   node scripts/check-inspect.mjs [--base http://127.0.0.1:8787] [pieceId]
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'out', 'inspect'); fs.mkdirSync(OUT, { recursive: true });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8787');
const { chromium } = createRequire(import.meta.url)('playwright');
const res = []; const check = (n, ok, d = '') => { res.push(ok); console.log(`${ok ? '✓' : '✗'} ${n}${d ? ' · ' + d : ''}`); };
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', deviceScaleFactor: 2 })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let id = process.argv.find((a) => /^[a-z0-9]{16}$/.test(a));
if (!id) { const w = await (await fetch(BASE + '/api/wall')).json(); id = w.featured.find((p) => p.title === 'post')?.id || w.featured.find((p) => p.type === 'image')?.id; }
await page.goto(BASE + '/p/' + id); await page.waitForSelector('.art img'); await page.waitForSelector('.code textarea:not([disabled])');
await page.waitForFunction(() => document.querySelector('.status')?.textContent?.length > 0, null, { timeout: 20000 });
await page.waitForTimeout(2500);
check('a clean piece reads cleanly', /Reads cleanly/.test(await page.locator('.status').innerText()));

// the position of a word in the code, found from the text
const where = async (needle, nth = 0) => page.evaluate(([needle, nth]) => {
  const lines = document.querySelector('.code textarea').value.split('\n'); let n = 0;
  for (let i = 0; i < lines.length; i++) { let from = 0, at; while ((at = lines[i].indexOf(needle, from)) >= 0) { if (n++ === nth) { const body = document.querySelector('.code-body').getBoundingClientRect(); const probe = document.querySelector('.code-probe').getBoundingClientRect().width / 20; return { x: body.left + 4 + (at + needle.length / 2) * probe, y: body.top + 12 + i * 20 + 10, line: i + 1 }; } from = at + 1; } }
  return null; }, [needle, nth]);
const card = () => page.locator('.hc[data-open="true"]');
const hoverWord = async (w, nth = 0) => { await page.mouse.move(700, 600); await page.waitForTimeout(450); const p = await where(w, nth); if (!p) return null; await page.mouse.move(p.x, p.y); await page.waitForTimeout(450); return p; };

const src = await page.locator('.code textarea').inputValue();
const first = src.split('\n').find((l) => /^\s*[A-Za-z]/.test(l)) || '';
const verb = first.trim().split(/\s+/)[0];
await hoverWord(verb);
check('hovering an action word shows what it does', (await card().count()) === 1 && (await card().innerText()).length > 20, (await card().innerText().catch(() => '')).replace(/\n/g, ' | ').slice(0, 160));
await page.screenshot({ path: path.join(OUT, 'hover-verb.png') });

// a named thing: the first thing after "called"
const nm = (src.match(/called ([a-z][\w-]*)/gi) || []).map((x) => x.split(' ')[1]).find((n) => n !== 'post' && n !== 'card') || 'headline';
if (nm) {
  await hoverWord('called ' + nm); await page.mouse.move((await where('called ' + nm)).x + 28, (await where('called ' + nm)).y); await page.waitForTimeout(500);
  const t = await card().innerText().catch(() => '');
  console.log('NM', nm, t.replace(/\n/g, '|').slice(0, 200), await card().locator('.hc-crop').count());
  check('hovering a named thing shows the thing, formed', (await card().locator('.hc-crop').count()) === 1 && /Size/.test(t), t.replace(/\n/g, ' | ').slice(0, 160));
  check('and marks it in the picture', (await page.locator('.art-hl').count()) >= 1);
  await page.screenshot({ path: path.join(OUT, 'hover-element.png') });
}
// the card moves from word to word without blinking: it stays one element
const before = await page.locator('.hc').count();
await hoverWord(verb, 1);
check('one card, moving between words', (await page.locator('.hc').count()) <= 1 && before <= 1);
await page.mouse.move(700, 500); await page.waitForTimeout(700);
check('the card goes when the pointer leaves', (await page.locator('.hc').count()) === 0);

// the picture: the thing under the pointer
const box = await page.locator('.art img').boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 }); await page.waitForTimeout(500);
check('hovering the picture shows the thing under the pointer', (await card().count()) === 1, (await card().innerText().catch(() => '')).split('\n')[0]);
await page.screenshot({ path: path.join(OUT, 'hover-picture.png') });
await page.mouse.move(5, 5); await page.waitForTimeout(500);

// errors: a typo in a word the language knows
const ta = page.locator('.code textarea');
await ta.click();
await page.evaluate(() => { const t = document.querySelector('.code textarea'); const v = t.value.replace(/\s*$/, ''); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, v + '\nMake the ' + (v.match(/called (headline)/i)?.[1] || 'card') + ' glowy.\nLet there be a cirle called oops, 40 big.\nMake the oops red.\n'); t.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForFunction(() => /error/.test(document.querySelector('.status')?.textContent || ''), null, { timeout: 15000 });
const st = await page.locator('.status').innerText();
check('typing a mistake is noticed as you type', /error/.test(st), st);
check('the word at fault is underlined', (await page.locator('.squig.err').count()) >= 1, `${await page.locator('.squig.err').count()} squiggles`);
const rows = await page.locator('.diags li').count();
check('a failed sentence does not show its consequences as new problems', rows === 2 || rows === 1, `${rows} rows; ${await page.locator('.diags li .muted').allInnerTexts()}`);
check('a typo with a close word comes with a fix', (await page.locator('.fixit').count()) >= 1, await page.locator('.fixit').allInnerTexts());
const g = await hoverWord('glowy');
const et = await card().innerText().catch(() => '');
check('hovering the word at fault explains it', /glowy/.test(et), et.replace(/\n/g, ' | ').slice(0, 140));
await page.screenshot({ path: path.join(OUT, 'hover-error.png') });
if (await card().locator('.hc-fix').count()) { await card().locator('.hc-fix').click(); await page.waitForTimeout(700); check('one click applies the fix', !/glowy/.test(await ta.inputValue())); }
await page.evaluate(() => { const t = document.querySelector('.code textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, t.value.replace(/\nMake the headline glowy\.|\nLet there be a cirle[^\n]*|\nMake the oops red\./g, '')); t.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(700);
check('removing the mistakes leaves it reading cleanly', /Reads cleanly|warning/.test(await page.locator('.status').innerText()), await page.locator('.status').innerText());
await page.screenshot({ path: path.join(OUT, 'after-fix.png') });
check('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`); process.exit(res.every(Boolean) ? 0 : 1);
