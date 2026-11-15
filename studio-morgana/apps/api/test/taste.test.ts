// The taste book flow: choose (step 1), spec (step 2), script (step 3, code).
import { TASTE } from '../src/taste.gen';
import { evalExpr, tidyPicks, tidySpec, fillTemplate, defaultSpec, chosenOf, widthOf } from '../src/taste/fill';
import { tastePrompt, chooseFromBook, makeFromBook, writeScript } from '../src/wizard/taste';
import type { Models } from '../src/wizard/models';
import type { Brief } from '../src/wizard/create';
import type { LibStamp } from '../src/library';

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) { passed++; console.log('✓ ' + name); } else { failed++; console.log('✗ ' + name + (detail ? ' — ' + detail : '')); } };
const brief = (prompt: string, extra: Partial<Brief> = {}): Brief => ({ prompt, refs: [], images: [], looksLike: [], assets: [], ...extra });
const riso = TASTE.templates.find((t) => t.id === 'riso-poster')!, swiss = TASTE.templates.find((t) => t.id === 'swiss-type-poster')!;
const pick = (t: string, palette: string, type: string, spacing: string) => ({ option: 1, template: t, palette, type, spacing, why: '' });

// sums in the holes
ok('sums: precedence and brackets', evalExpr('margin + size.h * 0.5 * (2 - 1)', { margin: 64, 'size.h': 100 }) === 114);
ok('sums: an unknown name is an error', (() => { try { evalExpr('nope + 1', {}); return false; } catch { return true; } })());
ok('sums: nothing but numbers, names and + - * / ( )', (() => { try { evalExpr('alert(1); 2', {}); return false; } catch { return true; } })());

// step 1
const p1 = tastePrompt(brief('a poster for a food market'), 4);
ok('the taste step sees the whole book: every template, palette, type system and spacing', [...TASTE.templates, ...TASTE.palettes, ...TASTE.type, ...TASTE.spacing].every((x) => p1.includes(`- ${x.id}:`)));
ok('the taste step sees each entry\'s description', TASTE.palettes.every((p) => p1.includes(p.description)));
const tidy = tidyPicks({ picks: [{ template: 'nope', palette: 'nope' }, { template: 'swiss-type-poster', palette: 'swiss-bone-red', type: 'editorial-serif', spacing: 'standard' }] }, TASTE, 3);
ok('picks: n come back whatever was sent', tidy.picks.length === 3);
ok('picks: unknown ids are replaced by real ones', TASTE.templates.some((t) => t.id === tidy.picks[0].template) && TASTE.palettes.some((p) => p.id === tidy.picks[0].palette));
ok('picks: a type the template does not take is swapped', swiss.fits.type.includes(tidy.picks[1].type), tidy.picks[1].type);
const same = tidyPicks({ picks: [pick('riso-poster', 'riso-pink-blue', 'editorial-serif', 'tight'), pick('riso-poster', 'riso-pink-blue', 'editorial-serif', 'tight')] }, TASTE, 2).picks;
ok('picks: options that came out the same are moved to another palette', same[0].palette !== same[1].palette);

// step 2
const c = chosenOf(TASTE, pick('riso-poster', 'riso-orange-green', 'editorial-serif', 'tight'));
const bad = tidySpec({ texts: { headline: ['Good', 'Food', 'Better Together Always'] }, sizes: { headline: 145, labels: 99 }, art: { use: 'stamp', stamp: 'dragon' } }, c, { stamps: ['orange'], assets: [] });
ok('spec: a missing slot is an error and takes the template\'s example', bad.errors.some((e) => e.startsWith('texts.about is missing')) && bad.spec.texts.about.join() === riso.slots.find((s) => s.name === 'about')!.default.join());
ok('spec: a line that is too long is an error and is cut at a word', bad.errors.some((e) => e.includes('"Better Together Always"')) && bad.spec.texts.headline[2] === 'Better');
ok('spec: sizes snap to the type scale, never above the template\'s max', bad.spec.sizes.headline === 140 && bad.spec.sizes.labels === 29, JSON.stringify(bad.spec.sizes));
ok('spec: a stamp that was not offered is an error', bad.errors.some((e) => e.includes('"dragon"')) && bad.spec.art.use === 'shapes');

// step 3
const src = fillTemplate(c, defaultSpec(riso));
ok('script: no hole is left', !/\{\{|\}\}/.test(src));
ok('script: the palette\'s colours are in it', src.includes(c.palette.roles.accent.hex) && src.includes(c.palette.roles.ground.hex));
const sw = chosenOf(TASTE, pick('swiss-type-poster', 'swiss-white-blue', 'grotesk-poster', 'standard'));
ok('script: a type system set in capitals sets the lines in capitals', fillTemplate(sw, { ...defaultSpec(swiss), texts: { ...defaultSpec(swiss).texts, headline: ['form', 'follows', 'feeling'] } }).includes('"FOLLOWS"'));
const long = writeScript(c, { ...defaultSpec(riso), texts: { ...defaultSpec(riso).texts, headline: ['Wednesday', 'Markets', 'Together'] } }, []);
const room = widthOf(riso.sizes.headline, 1080, Math.round(1080 * c.spacing.margin));
const widest = Math.max(...riso.sizes.headline.elements.map((e) => { const b = long.checked.elements[e].box; return b[2] - b[0]; }));
ok('script: a headline that runs too wide is shrunk until it fits', long.checked.ok && long.spec.sizes.headline < 158 && widest <= room + 1, `size ${long.spec.sizes.headline}, ${Math.round(widest)} of ${Math.round(room)}`);
const orange: LibStamp = { slug: 'orange', name: 'Orange', words: ['orange', 'fruit'], tags: [], parts: [{ name: 'body', area: 1 }], gt: 'define a orange as:\n  draw a circle called body, 80 big.\n  make the body #1d1b2e.\nend.\n' };
const st = writeScript(c, { ...defaultSpec(riso), art: { use: 'stamp', stamp: 'orange' } }, [orange]);
ok('script: a stamp goes in front, recoloured to the template\'s ink for it, and compiles', st.checked.ok && st.source.startsWith('define a orange') && st.source.includes(`make the body ${c.palette.roles.second.hex}`), JSON.stringify(st.checked.diagnostics.slice(0, 2)));

// the whole option, with a stand-in model that gets the spec wrong once
const said: string[] = [];
const fake = (replies: string[]): Models => ({ names: { reader: 'r', writer: 'w' }, read: async (a) => { said.push(a.prompt); return replies.shift() ?? '{}'; }, write: async (a) => { said.push(a.prompt); return replies.shift() ?? '{}'; } });
const good = JSON.stringify({ texts: { headline: ['Good', 'Food', 'Together'], about: ['Supper', 'Stories', 'Seconds'], where: ['Yaba market', 'Lagos'], when: ['Sat 14 Dec', 'From six'] }, sizes: { headline: 158, labels: 29 }, art: { use: 'shapes' }, why: 'food' });
const made = await makeFromBook(fake(['{"texts":{"headline":["Good food better together"]}}', good]), { brief: brief('Good Food Better Together, a supper club in Yaba, Lagos'), pick: pick('riso-poster', 'riso-orange-green', 'editorial-serif', 'tight'), i: 0, n: 1, files: {}, rounds: 1, stamps: [] });
ok('option: a broken spec is said back once with its problems', said.some((p) => /It has these problems/.test(p)));
ok('option: the corrected spec is used and the piece compiles', made.ok && made.source.includes('"Together"') && made.source.includes('"YABA MARKET"'), JSON.stringify({ ok: made.ok, notes: made.trace.map((t) => t.note), head: made.source.slice(0, 300) }));
ok('option: the trace shows spec, the correction, then code writing the script', made.trace.map((t) => t.step).join(',') === 'spec,spec (corrected),script' && made.trace[2].by === 'code');
const chose = await chooseFromBook(fake(['not json at all']), brief('anything'), 2);
ok('taste: a reply that is not JSON still gives usable picks', chose.picks.length === 2 && chose.trace.step === 'taste');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
