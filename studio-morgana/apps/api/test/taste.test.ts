// The taste book flow: taste (step 1), spec (step 2), draft and writer (step 3). Replies are action sheets.
import { TASTE } from '../src/taste.gen';
import { evalExpr, tidyPicks, tidySpec, fillTemplate, defaultSpec, chosenOf, widthOf, canvasOf, detectFormat, filterBook } from '../src/taste/fill';
import { parseSheet, readPicksSheet, readSpecSheet } from '../src/taste/sheet';
import { tastePrompt, chooseFromBook, makeFromBook, writeScript, layoutIssues } from '../src/wizard/taste';
import { check } from '../src/gt/checker.gen.js';
import type { Models } from '../src/wizard/models';
import type { Brief } from '../src/wizard/create';
import type { LibStamp } from '../src/library';

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) { passed++; console.log('✓ ' + name); } else { failed++; console.log('✗ ' + name + (detail ? ' — ' + detail : '')); } };
const brief = (prompt: string, extra: Partial<Brief> = {}): Brief => ({ prompt, refs: [], images: [], looksLike: [], assets: [], ...extra });
const T = (id: string) => TASTE.templates.find((t) => t.id === id)!;
const F = (id: string) => TASTE.formats.find((f) => f.id === id)!;
const pick = (template: string, palette: string, type: string, spacing: string, mode: 'rewrite' | 'new' = 'rewrite') => ({ option: 1, template, palette, type, spacing, why: '', mode });

// sums in the holes
ok('sums: precedence and brackets', evalExpr('margin + size.h * 0.5 * (2 - 1)', { margin: 64, 'size.h': 100 }) === 114);
ok('sums: an unknown name is an error', (() => { try { evalExpr('nope + 1', {}); return false; } catch { return true; } })());
ok('sums: nothing but numbers, names and + - * / ( )', (() => { try { evalExpr('alert(1); 2', {}); return false; } catch { return true; } })());

// action sheets
const sheet = parseSheet('Sure! Here it is:\n```markdown\n# Option 1\n**template:** riso-poster\nmode: rewrite\n## headline\n1. Good food\n2. better\n- together\n```');
ok('sheet: a fence, bold keys and numbered items are read', sheet[0]?.fields.template === 'riso-poster' && sheet[0].children[0]?.items.join('|') === 'Good food|better|together', JSON.stringify(sheet));
const picksSheet = readPicksSheet('# Format\nformat: TikTok\n\n# Option 2\ntemplate: b\n\n# Option 1\ntemplate: a\nwhy: because');
ok('sheet: picks come back in option order, with the format', picksSheet.format === 'tiktok' && picksSheet.picks.map((p) => p.template).join() === 'a,b' && picksSheet.picks[0].why === 'because');
const specSheet = readSpecSheet('# Spec\n## headline\n- Good\n- "Food"\n## sizes\nheadline: 158\n## art\nuse: stamp (an orange)\nstamp: orange\n## tweaks\n- a square instead of the circle\n## why\nbecause', ['headline']);
ok('sheet: a spec is read: lines, sizes, art, tweaks, why', JSON.stringify(specSheet) === JSON.stringify({ texts: { headline: ['Good', 'Food'] }, sizes: { headline: 158 }, art: { use: 'stamp', stamp: 'orange', asset: undefined }, tweaks: ['a square instead of the circle'], why: 'because' }), JSON.stringify(specSheet));

// formats and filters
ok('format: found from the brief\'s words', detectFormat('a TikTok for our drop', TASTE.formats)?.id === 'tiktok' && detectFormat('an Instagram story for Friday', TASTE.formats)?.id === 'instagram-story' && detectFormat('a poster for the gig', TASTE.formats)?.id === 'poster');
ok('format: none named, none found', detectFormat('something nice for our café', TASTE.formats) === undefined);
const tk = filterBook(TASTE, { format: F('tiktok'), brief: 'drop' });
ok('filter: a format keeps only the templates made for it', tk.book.templates.map((t) => t.id).join() === 'vertical-stack', tk.book.templates.map((t) => t.id).join());
const night = filterBook(TASTE, { tags: ['night'] });
ok('filter: tags keep the palettes that carry them', night.book.palettes.length >= 2 && night.book.palettes.every((p) => p.tags.includes('night')), night.book.palettes.map((p) => p.id).join());
const capped = filterBook(TASTE, { brief: 'food market' }, { templates: 8, palettes: 4, type: 3 });
ok('filter: a big book is capped, best fit first', capped.book.palettes.length === 4 && capped.book.palettes.some((p) => p.tags.includes('food')));
ok('filter: every offered template keeps a type system it takes', capped.book.templates.every((t) => t.fits.type.some((id) => capped.book.type.some((x) => x.id === id))));

// step 1
const p1 = tastePrompt(brief('a poster for a food market'), 4, TASTE);
ok('taste: with no format, the formats are offered to choose from', p1.includes('# Formats (choose one') && TASTE.formats.every((f) => p1.includes(`- ${f.id}:`)));
const p1f = tastePrompt(brief('x'), 2, tk.book, { format: F('tiktok'), notes: tk.notes });
ok('taste: with a format, it is stated with its safe area', p1f.includes('# Format\nTikTok video, 1080 by 1920') && p1f.includes('320 from the bottom') && !p1f.includes('# Formats'));
ok('taste: the reply is asked for as an action sheet, not JSON', /action sheet/.test(p1) && !/JSON/.test(p1));
ok('taste: every entry is there with its description', [...TASTE.templates, ...TASTE.palettes, ...TASTE.type, ...TASTE.spacing].every((x) => p1.includes(`- ${x.id}:`)) && TASTE.palettes.every((p) => p1.includes(p.description)));
const tidy = tidyPicks({ picks: [{ template: 'nope', palette: 'nope' }, { template: 'swiss-type-poster', palette: 'swiss-bone-red', type: 'editorial-serif', spacing: 'standard', mode: 'new' }] }, TASTE, 3);
ok('picks: n come back; unknown ids replaced; a type the template does not take swapped', tidy.picks.length === 3 && TASTE.templates.some((t) => t.id === tidy.picks[0].template) && T('swiss-type-poster').fits.type.includes(tidy.picks[1].type));
ok('picks: the mode is kept, rewrite by default', tidy.picks[1].mode === 'new' && tidy.picks[0].mode === 'rewrite');

// step 2
const c = chosenOf(TASTE, pick('riso-poster', 'riso-orange-green', 'editorial-serif', 'tight'));
const bad = tidySpec({ texts: { headline: ['Good', 'Food', 'Better Together Always'] }, sizes: { headline: 145, labels: 99 }, art: { use: 'stamp', stamp: 'dragon' }, tweaks: ['none'] }, c, { stamps: ['orange'], assets: [] });
ok('spec: a missing slot is an error and takes the example', bad.errors.some((e) => e.startsWith('texts.about is missing')));
ok('spec: a line too long is an error and is cut at a word', bad.errors.some((e) => e.includes('"Better Together Always"')) && bad.spec.texts.headline[2] === 'Better');
ok('spec: sizes snap to the scale, never above the template\'s max', bad.spec.sizes.headline === 140 && bad.spec.sizes.labels === 29, JSON.stringify(bad.spec.sizes));
ok('spec: a stamp that was not offered is an error', bad.errors.some((e) => e.includes('"dragon"')) && bad.spec.art.use === 'shapes');
ok('spec: "none" is no tweak', bad.spec.tweaks.length === 0);

// canvases and drafts
const vs = chosenOf(TASTE, pick('vertical-stack', 'sunset-ochre', 'grotesk-poster', 'standard'), F('tiktok'));
ok('canvas: a flexible template takes the format\'s size and safe area', JSON.stringify(canvasOf(vs)) === JSON.stringify({ W: 1080, H: 1920, margin: 72, safe: F('tiktok').safe, native: true }));
const rf = chosenOf(TASTE, pick('riso-poster', 'riso-orange-green', 'editorial-serif', 'tight'), F('instagram-story'));
ok('canvas: a fixed template keeps its size, to be moved by the writer', canvasOf(rf).W === 1080 && canvasOf(rf).H === 1666 && !canvasOf(rf).native);
const dv = writeScript(vs, defaultSpec(T('vertical-stack')), []);
ok('draft: the vertical stack at TikTok compiles with nothing in the app\'s way', dv.checked.ok && layoutIssues(dv.checked, F('tiktok')).length === 0, layoutIssues(dv.checked, F('tiktok')).join('; '));
const thumb = chosenOf(TASTE, pick('screen-title', 'citrus-pop', 'friendly-round', 'standard'), F('youtube-thumbnail'));
const dt = writeScript(thumb, defaultSpec(T('screen-title')), []);
ok('draft: at a smaller format, text is fitted to the real canvas', dt.checked.ok && dt.spec.sizes.headline < 200 && dt.checked.elements['headline-2'].box[2] <= 0.6 * 1280 + 48 + 1, JSON.stringify(dt.notes));
ok('draft: no hole is left, the palette is in it', !/\{\{|\}\}/.test(fillTemplate(c, defaultSpec(T('riso-poster')))) && fillTemplate(c, defaultSpec(T('riso-poster'))).includes(c.palette.roles.accent.hex));
const orange: LibStamp = { slug: 'orange', name: 'Orange', words: ['orange'], tags: [], parts: [{ name: 'body', area: 1 }], gt: 'define a orange as:\n  draw a circle called body, 80 big.\n  make the body #1d1b2e.\nend.\n' };
const st = writeScript(c, { ...defaultSpec(T('riso-poster')), art: { use: 'stamp', stamp: 'orange' } }, [orange]);
ok('draft: a stamp goes in front, recoloured, and compiles', st.checked.ok && st.source.startsWith('define a orange') && st.source.includes(`make the body ${c.palette.roles.second.hex}`));
const low = check('Let there be a flat canvas called t, 1080 by 1920.\nWrite "LINK IN BIO" called info in Jost, at 100 1800, size 40, aligned left.\nWrite "A" called a in Jost, at 300 400, size 100.\nWrite "B" called b in Jost, at 300 400, size 100.\n', {});
const issues = layoutIssues(low, F('tiktok'));
ok('layout: text in the app\'s safe area and text over text are found', issues.some((x) => x.includes('"info"') && x.includes('safe area')) && issues.some((x) => x.includes('overlap')), issues.join('; '));

// the whole option, with stand-in models
const said: string[] = [];
const fake = (replies: string[]): Models => ({ names: { reader: 'r', writer: 'w' }, read: async (a) => { said.push(a.prompt); return replies.shift() ?? ''; }, write: async (a) => { said.push(a.prompt); return replies.shift() ?? ''; } });
const goodSheet = '# Spec\n## headline\n- Good\n- Food\n- Together\n## about\n- Supper\n- Stories\n- Seconds\n## where\n- Yaba market\n- Lagos\n## when\n- Sat 14 Dec\n- From six\n## sizes\nheadline: 158\nlabels: 29\n## art\nuse: shapes\n## tweaks\n- none\n## why\nfood';
said.length = 0;
const plain = await makeFromBook(fake(['# Spec\n## headline\n- Good food better together', goodSheet]), { brief: brief('Good Food Better Together, a supper club in Yaba'), pick: pick('riso-poster', 'riso-orange-green', 'editorial-serif', 'tight'), i: 0, n: 1, files: {}, rounds: 1, stamps: [] });
ok('option: a broken sheet is said back once with its problems', said.some((p) => /It has these problems/.test(p)) && said.every((p) => !/Reply with JSON/.test(p)));
ok('option: with nothing to rewrite, the draft is the piece and the writer is not asked', plain.ok && plain.wrote === 'draft' && plain.trace.map((t) => t.step).join(',') === 'spec,spec (corrected),draft,write' && plain.source.includes('"YABA MARKET"'), plain.trace.map((t) => t.step).join(','));
said.length = 0;
const tweakSheet = goodSheet.replace('- none', '- a square instead of the circle');
const tweaked = await makeFromBook(fake([tweakSheet, '```gt\n' + writeScript(c, defaultSpec(T('riso-poster')), []).source.replace('Let there be a circle called sun, 330 big', 'Let there be a square called sun, 330 big') + '```']), { brief: brief('Good food, but a square sun'), pick: pick('riso-poster', 'riso-orange-green', 'editorial-serif', 'tight'), i: 0, n: 1, files: {}, rounds: 1, stamps: [] });
ok('option: a tweak sends the draft to the writer, which applies it', tweaked.wrote === 'writer' && tweaked.ok && /square called sun/.test(tweaked.source) && said.some((p) => p.includes('- a square instead of the circle') && p.includes('## The draft')), tweaked.trace.map((t) => `${t.step}: ${t.note}`).join(' | '));
const notGt = '```gt\nLet there be a flat canvas called t, 1080 by 1666.\nMake the card wobbly sparkle.\n```';
const broken = await makeFromBook(fake([tweakSheet, notGt, notGt, notGt, notGt]), { brief: brief('x'), pick: pick('riso-poster', 'riso-orange-green', 'editorial-serif', 'tight'), i: 0, n: 1, files: {}, rounds: 1, stamps: [] });
ok('option: when the writer\'s piece will not compile, the draft is used', broken.ok && broken.wrote === 'draft' && broken.trace.some((t) => t.step === 'fallback'), broken.trace.map((t) => `${t.step}: ${t.note}`).join(' | '));
said.length = 0;
const fresh = await makeFromBook(fake([goodSheet, '```gt\nLet there be a flat canvas called fresh, 1080 by 1350.\nMake the card #f3ecdc.\nWrite "Good" called headline-1 in Newsreader 700, at 540 600, size 140.\n```']), { brief: brief('something new'), pick: pick('riso-poster', 'riso-orange-green', 'editorial-serif', 'tight', 'new'), format: F('instagram-post'), i: 0, n: 1, files: {}, rounds: 1, stamps: [] });
ok('option: mode new asks for a new layout in the picked palette and type, and uses it', fresh.wrote === 'writer' && fresh.source.includes('called fresh') && said.some((p) => p.includes('a new layout') && p.includes('#ff5a1f') && p.includes('Newsreader 700') && p.includes('1080 by 1350')));
const chose = await chooseFromBook(fake(['not a sheet at all']), brief('a TikTok for our drop'), 2);
ok('taste: a reply that is not a sheet still gives picks; the brief\'s format is kept', chose.picks.length === 2 && chose.format.id === 'tiktok' && chose.picks.every((p) => p.template === 'vertical-stack'), JSON.stringify(chose.picks));
const chose2 = await chooseFromBook(fake(['# Format\nformat: big-screen\n# Option 1\ntemplate: screen-title\npalette: neon-night\ntype: condensed-tech\nspacing: standard\nmode: rewrite']), brief('a title card for our talk'), 1);
ok('taste: with no format in the brief, the model\'s choice is used', chose2.format.id === 'big-screen' && chose2.picks[0].palette === 'neon-night');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
