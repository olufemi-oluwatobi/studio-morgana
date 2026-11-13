// Pack: the plain-English layer. Seven words carry most sentences:
//
//   let     brings a thing into being, or names a value     Let there be a circle called sun, 330 big, at 800 330.
//   write   makes text (packs/text.js)                       Write "Golden Hour" called title in Lilita One, size 170.
//   make    applies a known word to a thing                  Make the sun gold.  Make the title glow in #ffd98a, 40 wide.
//   give    sets a property a thing has                      Give the title a shadow, 10 down.  Give the glow a width of 90.
//   move    puts a thing somewhere else                      Move the badge to 540 300.  Move the ball 40 right.
//   change  a change that happens over time                  Change the title to invisible over 0.5 s.
//   when    an event: the rest happens at that moment        When the ball arrives, make the banner pulse.
//
// The craft operations keep their own first word (emboss, engrave, plate, print, spray, …).
//
// "make" knows a word because it is in the dictionary: a colour, a material, or an entry added with
//   reg.word({ words: ['glow', 'glowing'], kind: 'effect', help, example, apply(ctx, a) })
// so a new effect, state or motion is one entry here (or in any pack) and "make", "give", the errors and the
// reference pick it up.
//
// A piece that starts with "Let there be …" arranges itself: what a thing was made (its colour, shadow, glow, outline)
// belongs to the thing, things stack in the order they were let, and the order of the sentences does not matter.
// A piece that starts with "create …" paints in sentence order, as before.
import { readMods, readName, readMaterial, isWord, dropArticles, num } from '../core/phrases.js';
import { textBox, textWidth } from './text.js';
import { element as groupOf } from './shapes.js';

const UNIT = { pct: '%', deg: ' degrees', s: ' s', mm: ' mm', um: ' um', px: ' px', m: ' m', cm: ' cm' };
const txt1 = (t) => t.t === 'word' ? (t.raw ?? t.v) : t.t === 'num' ? `${t.v}${UNIT[t.unit] || ''}` : t.t === 'str' ? `"${t.v}"` : t.t === 'color' ? t.v : t.t === 'asset' ? '@' + t.v : t.t === 'var' ? '$' + t.v : t.t === 'op' ? t.v : t.t;
export const txt = (toks) => toks.map(txt1).join(' ').replace(/ ,/g, ',').replace(/\( /g, '(').replace(/ \)/g, ')');
const r2 = (v) => Math.round(v * 100) / 100;
// the numbers that follow a word: after(rest, 'to', 2) reads "to 880 300"; after(rest, 'over') reads "over 1.4 s"
const after = (toks, word, n = 1) => { const i = toks.findIndex(t => isWord(t, word)); if (i < 0) return null; const v = []; for (let k = i + 1; k < toks.length && v.length < n && toks[k].t === 'num'; k++) v.push(toks[k]); return v.length === n ? (n === 1 ? v[0].v : v) : null; };
const secs = (t) => t == null ? null : (Array.isArray(t) ? t[0] : t)?.t === 'num' ? (Array.isArray(t) ? t[0] : t).v : null;
const split = (toks, seps) => { const out = [[]]; for (const t of toks) { if (t.t === ',' || (seps && isWord(t, ...seps))) out.push([]); else out.at(-1).push(t); } return out.filter(c => c.length); };

// the order a thing's looks are painted in, bottom to top
const PRE = ['shadow', 'glow', 'frosted'], POST = ['adjust'], TOP = ['outline', 'inshadow'], FINISH = ['vignette', 'grain'];
const SLOTS = [...PRE, 'fill', ...POST, ...TOP, ...FINISH];

// ── things: what a sentence is about ─────────────────────────────────────────────────────────────────────────────
function thing(ctx, raw) {
  const d = ctx.doc, side = ctx.side || 'front';
  if (d.elements?.[raw]) return { name: raw, ref: 'card', side: raw, el: d.elements[raw] };
  if (['card', 'canvas', 'page', 'background', 'poster', 'stage'].includes(raw) && !d.layers[raw]) return { name: 'card', ref: 'card', side };
  let n; try { n = ctx.resolve(raw); } catch (e) { throw e; }
  if (d.elements?.[n]) return { name: n, ref: 'card', side: n, el: d.elements[n] };
  if (d.layers[n]) return { name: n, ref: n, side: ctx.layerSide?.get(n) || side, L: d.layers[n] };
  if (d.zones[n]) return { name: n, ref: n, side, zone: true };
  return null;
}
function readThing(ctx, toks, i) {
  if (toks[i]?.t !== 'word') return null;
  if (isWord(toks[i], 'it', 'them', 'they')) {
    const its = [].concat(ctx.it || []).map(n => thing(ctx, n)).filter(Boolean);
    return its.length ? { things: its, i: i + 1 } : null;
  }
  let every = false;
  if (isWord(toks[i], 'every') && isWord(toks[i + 1], 'other', 'second')) { every = true; i += 2; }
  for (let n = Math.min(4, toks.length - i); n >= 1; n--) {
    const ws = toks.slice(i, i + n); if (!ws.every(w => w.t === 'word')) continue;
    const th = thing(ctx, ws.map(w => w.v.replace(/['’]s$/, '')).join('-'));
    if (!th) continue;
    if (every) { const set = ctx.sets?.get(th.name); if (!set) ctx.err(`"every other" needs several things; "${th.name}" is one`); return { things: set.filter((_, k) => k % 2 === 0).map(m => thing(ctx, m)), i: i + n }; }
    return { things: [th], i: i + n };
  }
  return null;
}
// "the title", "the title and the body", "the one, the two and the three", "it", "the third orbit", "every other dot"
function readThings(ctx, toks, i = 0) {
  const out = [];
  for (;;) {
    while (isWord(toks[i], 'the', 'a', 'an', 'all', 'both')) i++;
    const one = readThing(ctx, toks, i); if (!one) break;
    out.push(...one.things); i = one.i;
    let j = i; if (toks[j]?.t === ',') j++; if (isWord(toks[j], 'and')) j++;
    if (j === i) break;
    let k = j; while (isWord(toks[k], 'the', 'a', 'an')) k++;
    if (!readThing(ctx, toks, k)) break;
    i = j;
  }
  return { things: out, i };
}
const known = (ctx) => ['the card', ...Object.keys(ctx.doc.elements || {}), ...Object.keys(ctx.doc.layers)].slice(0, 14).join(', ');

// ── looks: what things have been made, kept per side and thing until the end ───────────────────────────────────────
const sentence = (ref, sl) => `${sl.verb} the ${ref}${sl.head ? ' ' + sl.head : ''}${(sl.mods || []).filter(Boolean).map(m => ', ' + m).join('')}.`;
function looksOf(ctx, th) {
  const bySide = (ctx.looks ||= new Map()), side = bySide.get(th.side) || bySide.set(th.side, new Map()).get(th.side);
  return side.get(th.ref) || side.set(th.ref, { slots: {}, fillMods: [] }).get(th.ref);
}
// run old-style sentences now, on a thing's own side
function say(ctx, side, text) { const prev = ctx.side, it = ctx.it; ctx.side = side; try { ctx.run(text, 'make'); } finally { ctx.side = prev; ctx.it = it; } }

// a sentence gathers what it applies; at its end the looks are kept (a self-arranging piece) or painted at once
function commit(ctx, pending) {
  for (const [th, p] of pending) {
    if (ctx.english) {
      const lk = looksOf(ctx, th);
      for (const [k, sl] of Object.entries(p.slots)) {
        if (k === 'adjust' && lk.slots.adjust) lk.slots.adjust.mods.push(...sl.mods); else lk.slots[k] = { ...sl, line: ctx.line, span: ctx.span };
      }
      lk.fillMods.push(...p.fillMods);
    } else {
      if (p.fillMods.length && !p.slots.fill) ctx.err('say the colour in the same sentence', 'e.g. "make the leaf #0e6b4f, 85% opacity."');
      if (p.slots.fill) p.slots.fill = { ...p.slots.fill, mods: [...(p.slots.fill.mods || []), ...p.fillMods] };
      for (const k of SLOTS) if (p.slots[k]) say(ctx, th.side, sentence(th.ref, p.slots[k]));
    }
  }
}

// after the last sentence: a self-arranging piece turns its looks into steps, thing by thing, bottom to top
function arrange(ctx) {
  if (!ctx.english) return;
  const d = ctx.doc, order = ['card', ...Object.keys(d.zones).filter(z => z !== 'card' && !d.layers[z]), ...Object.keys(d.layers)];
  const sides = new Set([...Object.keys(d.sides), ...(ctx.looks?.keys() || [])]);
  for (const side of sides) {
    const S = ctx.sideObj(side), explicit = S.steps.slice(), looks = ctx.looks?.get(side) || new Map();
    const owned = new Map(); for (const st of explicit) { const o = st.area?.terms?.[0]?.ref ?? 'card'; (owned.get(o) || owned.set(o, []).get(o)).push(st); }
    const out = [], tail = [];
    const emit = (ref, sl, into) => {
      const n0 = S.steps.length, line = ctx.line, span = ctx.span; ctx.line = sl.line; ctx.span = sl.span;
      say(ctx, side, sentence(ref, sl)); ctx.line = line; ctx.span = span;
      into.push(...S.steps.splice(n0));
    };
    S.steps = [];
    for (const ref of order) {
      const lk = looks.get(ref), mine = owned.get(ref) || []; owned.delete(ref);
      if (!lk) { out.push(...mine); continue; }
      const sl = lk.slots;
      for (const k of PRE) if (sl[k]) emit(ref, sl[k], out);
      if (sl.fill) emit(ref, { ...sl.fill, mods: [...(sl.fill.mods || []), ...lk.fillMods] }, out);
      else if (lk.fillMods.length) ctx.warn(`"${ref}" has no colour yet, so its opacity or blend has nothing to act on`, `e.g. "make the ${ref} #ffffff."`);
      out.push(...mine);
      for (const k of [...POST, ...TOP]) if (sl[k]) emit(ref, sl[k], out);
      for (const k of FINISH) if (sl[k]) emit(ref, sl[k], ref === 'card' ? tail : out);   // the page's grain and vignette go over everything
    }
    for (const rest of owned.values()) out.push(...rest);
    S.steps = [...out, ...tail];
  }
}

// ── the dictionary: what "make" and "give" can apply ──────────────────────────────────────────────────────────────
function dictionary(reg) {
  const W = (words, kind, help, example, apply, extra = {}) => reg.word({ words, kind, help, example, apply, ...extra });
  // an effect with a sentence of its own: "glow the x in #fff, 40 wide"
  const effect = (slot, verb, defaults = [], more = []) => (ctx, a) => {
    let r = a.rest; while (isWord(r[0], 'of', 'a', 'an', 'the')) r = r.slice(1);
    const head = isWord(r[0], 'in', 'with') ? txt(r) : '';
    const mods = [...a.lead.length ? [txt(a.lead)] : [], ...(head || !r.length ? [] : [txt(r)]), ...a.mods.map(txt)];
    a.slot(slot, { verb, head, mods: [...(mods.length ? mods : defaults), ...more] });
  };
  W(['shadow', 'shadowed', 'drop shadow'], 'effect', 'A soft shadow under the thing. Details: 10 down, 6 right, blur 14, in #000000, 50% opacity. "inside" makes it an inner shadow.', 'Make the title shadowed, 10 down, blur 14.',
    (ctx, a) => { const inner = [a.rest, ...a.mods].some(c => c.some(t => isWord(t, 'inside', 'inner', 'inset'))); effect(inner ? 'inshadow' : 'shadow', 'shadow')(ctx, a); }, { slot: 'shadow' });
  W(['inner shadow', 'inset'], 'effect', 'A shadow inside the thing, so it looks cut in.', 'Give the panel an inner shadow, 6 down, blur 10.', effect('inshadow', 'shadow', [], ['inside']), { slot: 'inshadow' });
  W(['glow', 'glowing'], 'effect', 'Light round the thing. Details: in #ffd98a, 40 wide, strength 2.', 'Make the sun glow in #ffd98a, 90 wide.', effect('glow', 'glow'), { slot: 'glow' });
  W(['outline', 'outlined'], 'effect', 'A flat line round the thing. Details: in #1b1145, 8 wide.', 'Make the title outlined in #1b1145, 8 wide.',
    (ctx, a) => { let r = a.rest; while (isWord(r[0], 'of', 'a', 'an', 'the')) r = r.slice(1);
      const col = isWord(r[0], 'in', 'with') ? txt(r) : r.length && (r[0].t === 'color' || ctx.reg.colors.has(r[0].v)) ? 'in ' + txt(r) : null;
      a.slot('outline', { verb: 'stroke', head: col || 'in #000000', mods: [...(col || !r.length ? [] : [txt(r)]), ...a.mods.map(txt)] }); }, { slot: 'outline' });
  W(['frosted', 'frosted glass', 'glassy'], 'effect', 'Blurs what is under the thing, like frosted glass. Details: blurred 18, brightness 1.1.', 'Make the panel frosted.', effect('frosted', 'adjust', ['blurred 18', 'brightness 1.1']), { slot: 'frosted' });
  W(['grain', 'grainy', 'noise', 'noisy'], 'effect', 'Film grain over the thing: an amount from 0 to 1.', 'Make the card grainy, 0.2.', effect('grain', 'grain'), { slot: 'grain' });
  W(['vignette', 'vignetted'], 'effect', 'Darkens the edges of the thing: an amount from 0 to 1, and a colour.', 'Give the card a vignette of 0.35, in #1f3a5f.', effect('vignette', 'vignette'), { slot: 'vignette' });

  // colour: flat, gradient, and how it sits
  const fill = (ctx, a, c) => {
    let toks = c.filter(t => !isWord(t, 'colour', 'color', 'coloured', 'colored'));
    while (isWord(toks[0], 'of', 'a', 'an', 'the', 'in', 'with')) toks = toks.slice(1);
    const { material, i } = readMaterial(ctx, toks);
    const flat = material.type === 'color' || material.type === 'enamel' || (c.length !== toks.length && material.hex);
    a.slot('fill', { verb: flat ? 'enamel' : 'plate', head: (flat ? 'in ' : 'with ') + txt(toks.slice(0, i)), mods: [...(toks.length > i ? [txt(toks.slice(i))] : []), ...a.mods.map(txt)] });
  };
  reg.fillWord = { words: ['<a colour or a material>'], kind: 'colour', apply: (ctx, a) => fill(ctx, a, a.rest) };
  W(['colour', 'color'], 'colour', 'The thing\'s colour: any hex colour, colour name or material.', 'Give the card the colour #10131f.', (ctx, a) => fill(ctx, a, a.rest));
  W(['gradient', 'radial gradient', 'linear gradient'], 'colour', 'A blend of colours across the thing: from … to … (to …), "angled 45"; "radial gradient" spreads from the middle.', 'Make the card a gradient from #1b1145 to #ffb347, angled 80.',
    (ctx, a) => a.slot('fill', { verb: 'enamel', head: `in a ${a.word.startsWith('radial') ? 'radial ' : ''}gradient ${txt(a.rest)}`, mods: a.mods.map(txt) }));
  const pct = (a, d) => { const n = [...a.lead, ...a.rest].find(t => t.t === 'num'); return n ? (n.unit === 'pct' || n.v > 1 ? n.v : n.v * 100) : d; };
  W(['see-through', 'transparent', 'translucent', 'faint'], 'colour', 'How much shows through the thing\'s colour: "40% see-through". Without a number, half.', 'Make the panel 85% see-through.', (ctx, a) => a.fillMod(`${r2(100 - pct(a, 50))}% opacity`));
  W(['opacity', 'opaque'], 'colour', 'How solid the thing\'s colour is: "60% opacity".', 'Give the leaf an opacity of 85%.', (ctx, a) => a.fillMod(`${r2(pct(a, 100))}% opacity`), { lone: true });
  W(['multiply', 'screen', 'overlay', 'darken', 'lighten', 'soft-light', 'hard-light', 'difference', 'color-dodge', 'color-burn'], 'colour', 'How the thing\'s colour mixes with what is under it (a blend mode).', 'Make the leaf #0e6b4f, multiply.', (ctx, a) => a.fillMod(a.word), { lone: true });
  W(['feathered', 'soft-edged'], 'colour', 'Soft edges on the thing\'s colour: "feathered 12".', 'Make the core #ffd166, feathered 6.', (ctx, a) => a.fillMod(`feathered ${pct(a, 12)}`), { lone: true });

  // states: how what the thing shows is adjusted
  const adjust = (f) => (ctx, a) => a.slot('adjust', { verb: 'adjust', head: '', mods: [f(a)] });
  const factor = (a, d) => { const n = [...a.lead, ...a.rest].find(t => t.t === 'num'); return !n ? d : n.unit === 'pct' ? 1 + Math.sign(d - 1) * n.v / 100 : n.v; };
  W(['grayscale', 'greyscale', 'monochrome'], 'state', 'Removes the colour from what the thing shows.', 'Make the photo grayscale.', adjust(() => 'grayscale'));
  W(['sepia'], 'state', 'A warm brown tone.', 'Make the photo sepia.', adjust(() => 'sepia'));
  W(['inverted', 'negative'], 'state', 'Swaps light and dark.', 'Make the photo inverted.', adjust(() => 'inverted'));
  W(['blurred', 'blurry', 'out-of-focus'], 'state', 'Blurs what the thing shows: "blurred 6".', 'Make the photo blurred 6.', adjust((a) => `blurred ${pct(a, 6)}`));
  W(['brighter', 'lighter'], 'state', 'Brightens it: "20% brighter".', 'Make the photo 20% brighter.', adjust((a) => `brightness ${r2(factor(a, 1.2))}`));
  W(['darker', 'dimmer'], 'state', 'Darkens it: "20% darker".', 'Make the photo 20% darker.', adjust((a) => `brightness ${r2(factor(a, .8))}`));
  W(['vivid', 'saturated', 'punchy'], 'state', 'Stronger colours.', 'Make the photo vivid.', adjust((a) => `saturation ${r2(factor(a, 1.4))}`));
  W(['muted', 'desaturated', 'washed-out'], 'state', 'Weaker colours.', 'Make the photo muted.', adjust((a) => `saturation ${r2(factor(a, .5))}`));
  W(['contrasty', 'high-contrast'], 'state', 'More contrast.', 'Make the photo contrasty.', adjust((a) => `contrast ${r2(factor(a, 1.3))}`));
  const textOnly = (ctx, a, f) => a.things.forEach(th => { if (th.L?.kind !== 'text') ctx.err(`"${th.name}" is not text`); f(th.L); th.L.box = textBox(th.L); });
  W(['uppercase', 'capitals', 'caps'], 'state', 'Sets text in capitals.', 'Make the title uppercase.', (ctx, a) => textOnly(ctx, a, (L) => { L.text = L.text.toUpperCase(); if (L.lines) L.lines = L.lines.map(l => l.toUpperCase()); }));
  W(['lowercase'], 'state', 'Sets text in small letters.', 'Make the title lowercase.', (ctx, a) => textOnly(ctx, a, (L) => { L.text = L.text.toLowerCase(); if (L.lines) L.lines = L.lines.map(l => l.toLowerCase()); }));

  // transforms: the thing itself changes
  const resize = (ctx, th, k) => {
    if (th.el) { th.el.size = th.el.size.map(v => r2(v * k)); ctx.doc.zones[th.name].rect = [0, 0, ...th.el.size]; }
    else if (th.L?.kind === 'text') { th.L.size = r2(th.L.size * k); th.L.box = textBox(th.L); }
    else if (th.L?.shapes) say(ctx, th.side, `scale the ${th.name} by ${r2(k)}.`);
    else ctx.err(`"${th.name}" can't be resized this way`);
  };
  const times = (a, d) => { const n = [...a.lead, ...a.rest].find(t => t.t === 'num'); return !n ? d : n.unit === 'pct' ? 1 + n.v / 100 : n.v; };
  W(['bigger', 'larger'], 'transform', 'Scales the thing up: "1.6 times bigger", "20% bigger". Without a number, a quarter bigger.', 'Make the leaf 1.6 times bigger.', (ctx, a) => a.things.forEach(th => resize(ctx, th, times(a, 1.25))));
  W(['smaller'], 'transform', 'Scales the thing down: "20% smaller", "2 times smaller".', 'Make the badge 20% smaller.', (ctx, a) => a.things.forEach(th => { const n = [...a.lead, ...a.rest].find(t => t.t === 'num'); resize(ctx, th, !n ? .8 : n.unit === 'pct' ? 1 - n.v / 100 : 1 / n.v); }));
  const extent = (th) => th.el ? th.el.size : th.L?.box ? [th.L.box[2] - th.L.box[0], th.L.box[3] - th.L.box[1]] : th.L?.shapes ? (() => { const xs = th.L.shapes.flatMap(s => s.pts.map(p => p[0])), ys = th.L.shapes.flatMap(s => s.pts.map(p => p[1])); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; })() : null;
  const toSize = (axis) => (ctx, a) => a.things.forEach(th => { const n = [...a.lead, ...a.rest].find(t => t.t === 'num'), e = extent(th); if (!n || !e) ctx.err(`make it how ${axis ? 'tall' : 'wide'}?`, 'e.g. "make the title 780 wide."'); resize(ctx, th, ctx.px(n) / e[axis]); });
  W(['wide'], 'transform', 'Scales the thing to a width: "780 wide".', 'Make the title 780 wide.', toSize(0), { lone: true });
  W(['tall', 'high'], 'transform', 'Scales the thing to a height: "300 tall".', 'Make the badge 300 tall.', toSize(1), { lone: true });
  W(['turned', 'tilted', 'rotated'], 'transform', 'Turns the thing by degrees.', 'Make the leaf turned -24.', (ctx, a) => a.things.forEach(th => {
    const n = [...a.rest, ...a.lead].find(t => t.t === 'num'); if (!n) ctx.err('turned how far?', 'e.g. "make the leaf turned -24."');
    if (th.el) th.el.turn = (th.el.turn || 0) + n.v; else if (th.L?.kind === 'text') th.L.turn = (th.L.turn || 0) + n.v; else say(ctx, th.side, `turn the ${th.name} ${n.v} degrees.`);
  }));
  W(['flipped', 'mirrored'], 'transform', 'Flips the thing left to right ("flipped upside down" for top to bottom).', 'Make the leaf flipped.', (ctx, a) => a.things.forEach(th => say(ctx, th.side, `flip the ${th.name}${a.rest.length ? ' ' + txt(a.rest) : ''}.`)));
  const together = (verb) => (ctx, a) => say(ctx, a.things[0].side, `${verb} ${a.things.map(th => 'the ' + th.name).join(' and ')} ${txt(a.rest)}${a.mods.map(m => ', ' + txt(m)).join('')}.`);
  W(['line up', 'lined up', 'aligned', 'align'], 'transform', 'Lines things up by an edge or centre: on the left, right, top, bottom, centre or middle. One thing lines up with the page.', 'Make the title and the body line up on the left.', together('align'), { joint: true });
  W(['evenly spaced', 'spaced evenly', 'spread out', 'spread evenly'], 'transform', 'Spaces three or more things evenly: horizontally or vertically.', 'Make the one, the two and the three evenly spaced horizontally.', together('distribute'), { joint: true });

  // motion: needs a video, and a thing that is its own object on the stage
  const motion = (verb, more = () => []) => (ctx, a) => a.things.forEach(th => {
    if (!th.el) ctx.err(`only an object on a stage can ${a.word}`, `"${th.name}" is drawn on a surface; objects: ${Object.keys(ctx.doc.elements || {}).join(', ') || 'none (start with "Let there be a video …" and let there be a card)'}`);
    const mods = [...(a.rest.length ? [txt(a.rest)] : []), ...a.mods.map(txt), ...more(a)];
    if (ctx.when != null && !mods.some(m => /^at\b/.test(m))) mods.push(`at ${ctx.when} s`);
    say(ctx, th.side, `${verb} the ${th.name}${mods.map(m => ', ' + m).join('')}.`);
  });
  const every = (a, d) => [a.rest, ...a.mods].some(c => c.some(t => isWord(t, 'every'))) ? [] : [`every ${d} s`];
  W(['float', 'floating', 'bob', 'bobbing'], 'motion', 'Bobs up and down for the whole video: "14 high, every 3 s".', 'Make the badge float, 14 high, every 3 s.', motion('float'), { timed: true });
  W(['pulse', 'pulsing', 'breathe', 'breathing'], 'motion', 'Grows and shrinks a little, over and over: "by 0.06, every 1.2 s".', 'Make the button pulse, by 0.06, every 1.2 s.', motion('pulse'), { timed: true });
  W(['sway', 'swaying', 'rock', 'rocking'], 'motion', 'Rocks from side to side: "5 degrees, every 2 s".', 'Make the tag sway, 5 degrees, every 2 s.', motion('sway'), { timed: true });
  W(['spin', 'spinning'], 'motion', 'Keeps turning: "every 4 s" is one turn.', 'Make the wheel spin, every 3 s.', motion('turn', (a) => every(a, 4)), { timed: true });
  W(['fade in', 'appear'], 'motion', 'Fades the object in: "at 1 s, over 0.5 s".', 'Make the title fade in at 1 s, over 0.5 s.', (ctx, a) => motion('fade in')(ctx, { ...a, rest: [], mods: [a.rest, ...a.mods].filter(c => c.length) }), { timed: true });
  W(['fade out', 'disappear', 'vanish'], 'motion', 'Fades the object out: "at 4 s, over 0.4 s".', 'Make the title fade out at 4 s.', (ctx, a) => motion('fade out')(ctx, { ...a, rest: [], mods: [a.rest, ...a.mods].filter(c => c.length) }), { timed: true });
}

// find the known word a clause starts with (a number or "times" may come first: "85% see-through", "1.6 times bigger")
function findWord(ctx, c) {
  for (let k = 0; k < Math.min(4, c.length); k++) {
    if (!c.slice(0, k).every(t => t.t === 'num' || isWord(t, 'times', 'much', 'slightly', 'very'))) break;
    const m = ctx.reg.match(ctx.reg.words, c, k, 3);
    if (m) return { entry: m.entry, at: k, n: m.n, key: m.key };
  }
  // a colour or a material: "red", "#10131f", "mirror chrome", "gold 24k"
  let i = 0; while (isWord(c[i], 'a', 'an', 'the')) i++;
  if (c[i]?.t === 'color') return { entry: ctx.reg.fillWord, at: 0, n: 0, key: 'colour' };
  if (c[i]?.t === 'word' && (ctx.reg.match(ctx.materialsByName(), c, i, 4) || ctx.reg.match(ctx.reg.materials, c, i, 4) || ctx.reg.match(ctx.reg.colors, c, i, 3))) return { entry: ctx.reg.fillWord, at: 0, n: 0, key: 'colour' };
  return null;
}

// "make" and "give": read the things, then apply each known word to them
function applyWords(ctx, things, rest, verb) {
  // values named with "let" stand in for themselves: "Let gold be #ffb347." then "make the sun gold."
  rest = rest.flatMap(t => t.t === 'word' && ctx.lets?.has(t.v) ? ctx.vars.get(t.v).value : [t]);
  const apps = [];
  for (let c of split(rest, ['and'])) {
    while (isWord(c[0], 'a', 'an', 'the', 'to', 'be', 'look', 'some')) c = c.slice(1);
    if (!c.length) continue;
    let hit = findWord(ctx, c);
    // "90 wide", "50% opacity", "multiply" after an effect or a motion are its details, not a new word
    if (hit?.entry.lone && apps.length && ['effect', 'motion'].includes(apps.at(-1).entry.kind)) hit = null;
    if (hit) apps.push({ entry: hit.entry, word: hit.key, lead: c.slice(0, hit.at), rest: c.slice(hit.at + hit.n), mods: [] });
    else if (apps.length) apps.at(-1).mods.push(c);
    else {
      const w = c.find(t => t.t === 'word')?.v || txt(c);
      ctx.err(`${verb} it what? "${w}" is not a colour, a material or a word I know`, ctx.suggest(w, [...ctx.reg.words.keys(), ...ctx.reg.colors.keys(), ...ctx.reg.materials.keys()]) || `e.g. "${verb === 'give' ? 'give the title a shadow' : 'make the card #10131f'}." Known words: ${[...new Set(ctx.reg.wordList.map(w => w.words[0]))].join(', ')}`);
    }
  }
  if (!apps.length) ctx.err(`${verb} ${things.map(t => 'the ' + t.name).join(' and ')} what?`, 'e.g. "make the card #10131f." or "make the title glow."');
  const pending = new Map(things.map(th => [th, { slots: {}, fillMods: [] }]));
  for (const ap of apps) {
    if (ctx.when != null && !ap.entry.timed) ctx.warn(`"${ap.word}" cannot start at a moment yet, so it is there from the beginning`, 'only motion (float, pulse, sway, spin, fade in, fade out), "move" and "change" follow "when"');
    ap.entry.apply(ctx, {
      ...ap, things,
      slot: (name, sl) => { for (const p of pending.values()) { if (name === 'adjust' && p.slots.adjust) p.slots.adjust.mods.push(...sl.mods); else p.slots[name] = sl; } },
      fillMod: (m) => { for (const p of pending.values()) p.fillMods.push(m); },
    });
  }
  commit(ctx, pending);
  ctx.it = things.length > 1 ? things.map(t => t.name) : things[0].name;
}

// settings: "give the title a size of 170", "give the glow a width of 90"
const EFFECT_SETTING = { width: (v) => `${v} wide`, blur: (v) => `blur ${v}`, softness: (v) => `blur ${v}`, strength: (v) => `strength ${v}`, opacity: (v) => `${v} opacity`, amount: (v) => v, colour: null, color: null, down: (v) => `${v} down`, right: (v) => `${v} right`, up: (v) => `${v} up`, left: (v) => `${v} left` };
function setting(ctx, things, p) {
  let slot = null; const hit = ctx.reg.match(ctx.reg.words, p, 0, 3);
  if (hit?.entry.slot) { let q = p.slice(hit.n); while (isWord(q[0], 'a', 'an', 'the')) q = q.slice(1); if (q[0]?.t === 'word' && q[0].v in EFFECT_SETTING && (isWord(q[1], 'of') || q.length === 2)) { slot = hit.entry.slot; p = q; } }
  if (p[0]?.t !== 'word') return false;
  const key = p[0].v; let val = p.slice(1); if (isWord(val[0], 'of', 'to')) val = val.slice(1);
  if (slot) {
    if (!ctx.english) ctx.err('say it in the same sentence', `e.g. "make the title ${slot}, ${txt(val)} wide."`);
    for (const th of things) {
      const sl = looksOf(ctx, th).slots[slot]; if (!sl) ctx.err(`"${th.name}" has no ${slot} yet`, `first: "make the ${th.name} ${slot}."`);
      if (key === 'colour' || key === 'color') sl.head = 'in ' + txt(val); else sl.mods = [...sl.mods.filter(m => !/^(blurred|brightness)/.test(m) || slot !== 'frosted'), EFFECT_SETTING[key](txt(val))];
    }
    return true;
  }
  const TEXT = { size: (L, v) => { L.size = ctx.px(v[0]); }, tracking: (L, v) => { L.track = num(v[0]); }, leading: (L, v) => { L.leading = num(v[0]); }, 'line-height': (L, v) => { L.leading = num(v[0]); } };
  if (TEXT[key] && val[0]?.t === 'num' && val.length === 1) {
    for (const th of things) { if (th.L?.kind !== 'text') ctx.err(`only text has a ${key}`, `"${th.name}" is not text; try "make the ${th.name} bigger."`); TEXT[key](th.L, val); th.L.box = textBox(th.L); }
    return true;
  }
  return false;
}

// ── let: many things at once ────────────────────────────────────────────────────────────────────────────────────
// Let there be 9 circles called orbit, at 540 560, the first 70 big, each 70 bigger than the last.
// Let there be 12 triangles called ray, 46 by 150, in a ring around 540 560, 450 out.
// Let there be 40 circles called dot, 7 big, in a grid 8 by 5, 46 apart, from 70 70.
function many(ctx, N, kind, toks) {
  if (!(N >= 1) || N > 500) ctx.err('how many?', 'between 1 and 500');
  const clauses = split(toks), first = clauses.shift() || [];
  const ci = first.findIndex(t => isWord(t, 'called', 'named'));
  if (ci < 0) ctx.err(`name the ${kind}s`, `e.g. "Let there be ${N} ${kind}s called dot, …"`);
  const { name, i } = readName(first, ci + 1, new Set(['at', 'in', 'from', 'around', 'each']));
  const base = []; if (first.length > i) clauses.unshift(first.slice(i));
  let arr = null, grid = null, around = null, gap = null, out = null, from = null, at = null, dBig = null, fBig = null, dTurn = null;
  const nums = (c) => c.filter(t => t.t === 'num');
  for (let c of clauses) {
    if (isWord(c[0], 'the')) c = c.slice(1);
    if (isWord(c[0], 'first')) c = c.slice(1);
    if (isWord(c[0], 'each', 'every')) {
      const n = nums(c)[0]; if (!n) ctx.err('each one differs by how much?', 'e.g. "each 70 bigger than the last" or "each turned 30 more"');
      if (c.some(t => isWord(t, 'turned', 'tilted', 'rotated'))) dTurn = n.v;
      else if (c.some(t => isWord(t, 'bigger', 'larger', 'smaller'))) { const sign = c.some(t => isWord(t, 'smaller')) ? -1 : 1; if (n.unit === 'pct') fBig = 1 + sign * n.v / 100; else dBig = sign * ctx.px(n); }
      else ctx.err(`I don't know how each one should differ: "${txt(c)}"`, '"each 70 bigger than the last", "each 10% smaller", "each turned 30 more"');
      continue;
    }
    if (isWord(c[0], 'in') && c.some(t => isWord(t, 'row', 'column', 'grid', 'ring', 'circle', 'line'))) {
      arr = c.find(t => isWord(t, 'row', 'column', 'grid', 'ring', 'circle', 'line')).v; if (arr === 'circle') arr = 'ring'; if (arr === 'line') arr = 'row';
      const ai = c.findIndex(t => isWord(t, 'around', 'round', 'about'));
      if (arr === 'grid') grid = nums(ai < 0 ? c : c.slice(0, ai)).map(t => t.v);
      if (ai >= 0) around = nums(c.slice(ai)).map(ctx.px);
      const ap = c.findIndex(t => isWord(t, 'apart')); if (ap > 0) gap = nums(c.slice(0, ap)).slice(-1).map(ctx.px);
      continue;
    }
    if (c.some(t => isWord(t, 'apart'))) { gap = nums(c).map(ctx.px); continue; }
    if (c.some(t => isWord(t, 'out')) && nums(c).length === 1) { out = ctx.px(nums(c)[0]); continue; }
    if (isWord(c[0], 'around', 'round') && nums(c).length === 2) { around = nums(c).map(ctx.px); continue; }
    if (isWord(c[0], 'from', 'starting') && nums(c).length === 2) { from = nums(c).map(ctx.px); continue; }
    if (isWord(c[0], 'at') && nums(c).length === 2) { at = nums(c).map(ctx.px); continue; }
    base.push(c);
  }
  const card = ctx.doc.card.rect, mid = [card[0] + card[2] / 2, card[1] + card[3] / 2];
  if (arr === 'grid' && grid?.length !== 2) ctx.err('a grid needs its columns and rows', 'e.g. "in a grid 8 by 5, 46 apart"');
  if (arr === 'grid' && grid[0] * grid[1] !== N) ctx.err(`a grid ${grid[0]} by ${grid[1]} holds ${grid[0] * grid[1]}, not ${N}`);
  if (arr === 'ring') { around ||= at || mid; if (out == null) ctx.err('how far out is the ring?', 'e.g. "in a ring around 540 560, 450 out"'); }
  if ((arr === 'row' || arr === 'column' || arr === 'grid') && !gap) ctx.err('how far apart?', 'e.g. "46 apart"');
  const start = from || at || mid, gx = gap?.[0] ?? 0, gy = gap?.[1] ?? gx;
  const bigAt = base.findIndex(c => c.length === 2 && c[0].t === 'num' && isWord(c[1], 'big'));
  if (dBig != null && bigAt < 0) ctx.err('"bigger than the last" needs a starting size', 'e.g. "the first 70 big, each 70 bigger than the last"');
  const members = [];
  for (let k = 0; k < N; k++) {
    const n = `${name}-${k + 1}`;
    const pos = arr === 'row' ? [start[0] + k * gx, start[1]] : arr === 'column' ? [start[0], start[1] + k * gy] : arr === 'grid' ? [start[0] + (k % grid[0]) * gx, start[1] + Math.floor(k / grid[0]) * gy] : arr === 'ring' ? [around[0], around[1] - out] : at;
    const parts = base.map((c, bi) => bi === bigAt && dBig != null ? `${r2(ctx.px(c[0]) + k * dBig)} big` : txt(c));
    if (pos) parts.push(`at ${r2(pos[0])} ${r2(pos[1])}`);
    ctx.run(`draw a ${kind} called ${n}${parts.map(p => ', ' + p).join('')}.`, 'let');
    if (!ctx.doc.layers[n]) return;                       // the first one failed; its error says why
    if (fBig != null && k) ctx.run(`scale the ${n} by ${r2(Math.pow(fBig, k) * 1000) / 1000}.`, 'let');
    if (dTurn != null && k) ctx.run(`turn the ${n} ${r2(k * dTurn)} degrees.`, 'let');
    if (arr === 'ring' && k) ctx.run(`turn the ${n} ${r2(k * 360 / N)} degrees, around ${around[0]} ${around[1]}.`, 'let');
    members.push(n);
  }
  // the plain name means all of them; it sits under its members so one of them can be made different
  const Ls = members.map(m => ctx.doc.layers[m]);
  if (Ls.every(L => L.shapes)) {
    ctx.addLayer(name, groupOf(Ls.flatMap(L => L.shapes.map(sh => ({ ...sh }))), { parts: members }));
    const all = ctx.doc.layers, keys = Object.keys(all).filter(k => k !== name), at0 = keys.indexOf(members[0]);
    const re = {}; keys.forEach((k, j) => { if (j === at0) re[name] = all[name]; re[k] = all[k]; });
    for (const k of Object.keys(all)) delete all[k]; Object.assign(all, re);
  }
  (ctx.sets ||= new Map()).set(name, members);
  ctx.it = name;
}

const DOC_KINDS = ['canvas', 'stage', 'video', 'card'], OBJECT_KINDS = ['card', 'paper', 'piece', 'plate', 'sheet', 'sticker'];
function there(ctx, toks, s) {
  let t = dropArticles(toks), N = null;
  if (t[0]?.t === 'num') { N = t[0].v; t = t.slice(1); }
  const flat = isWord(t[0], 'flat', 'unlit'); if (flat) t = t.slice(1);
  const started = !!ctx.doc.canvas || ctx.doc.name !== 'untitled';
  if (isWord(t[0], ...DOC_KINDS) && !(started && ctx.doc.kind === 'stage')) {
    if (started) ctx.err('this piece has already been started', 'one "Let there be a canvas …" per piece');
    ctx.english = true;
    if (!ctx.layerSide) { ctx.layerSide = new Map(); const add = ctx.addLayer; ctx.addLayer = (name, layer) => { ctx.layerSide.set(name, ctx.side || 'front'); return add(name, layer); }; }
    return ctx.reg.verbs.get('create').run(ctx, [...t, ...(flat ? [{ t: ',' }, { t: 'word', v: 'flat', raw: 'flat' }] : [])], s);
  }
  if (!started) ctx.err('start with the piece itself', 'e.g. "Let there be a flat canvas called poster, 1080 by 1350."');
  if (ctx.doc.kind === 'stage' && isWord(t[0], ...OBJECT_KINDS) && t.some(x => isWord(x, 'called', 'named'))) {
    // an object on the stage: "a card called ball, of cardstock, 200 by 200, at 200 300"
    const fixed = t.map((x, k) => isWord(x, 'of') && t[k + 1]?.t === 'word' ? { ...x, v: 'from', raw: 'from' } : x).filter((x, k, a) => !(x.t === ',' && isWord(a[k + 1], 'from')));
    return ctx.reg.verbs.get('element').run(ctx, fixed, s);
  }
  if (isWord(t[0], 'words', 'text', 'word') && t.some(x => x.t === 'str')) return ctx.reg.verbs.get('write').run(ctx, t.slice(1), s);
  // a drawn thing, or several
  let g = ctx.reg.match(ctx.reg.generators, t, 0, 3), kind = g?.entry.name, plural = false;
  for (const f of [(w) => w.replace(/ies$/, 'y'), (w) => w.replace(/es$/, ''), (w) => w.replace(/s$/, '')]) {
    if (t[0]?.t !== 'word') break;
    const w = f(t[0].v); if (w === t[0].v || !ctx.reg.generators.has(w)) continue;
    if (!g || N != null) { g = { n: 1 }; kind = w; plural = true; }
    break;
  }
  if (!g) { const w = t[0]?.t === 'word' ? t[0].v : txt(t.slice(0, 1)); ctx.err(`I don't know how to make "${w}"`, ctx.suggest(w, [...ctx.reg.generators.keys(), ...DOC_KINDS]) || 'e.g. a circle, a rectangle, a star, a heart, a path, a canvas'); }
  if (N != null && N !== 1 || plural) return many(ctx, N ?? 2, kind, t.slice(g.n));
  return ctx.reg.verbs.get('draw').run(ctx, N === 1 ? toks.filter(x => x !== toks.find(y => y.t === 'num')) : toks, s);
}

// ── the pack ────────────────────────────────────────────────────────────────────────────────────────────────────
export default function english(reg) {
  dictionary(reg);
  reg.finish(arrange);
  const old = { make: reg.verbs.get('make'), move: reg.verbs.get('move'), let: reg.verbs.get('let') };
  reg.verbList = reg.verbList.filter(v => v !== old.make);

  reg.verb({
    words: ['let'],
    help: 'Brings a thing into being: "Let there be a flat canvas called poster, 1080 by 1350." "Let there be a circle called sun, 330 big, at 800 330." Several at once, instead of a loop: "Let there be 9 circles called orbit, at 540 560, the first 70 big, each 70 bigger than the last.", "… in a row, 46 apart", "… in a grid 8 by 5, 46 apart, from 70 70", "… in a ring around 540 560, 450 out", "each turned 30 more". Afterwards "the orbits" means all of them, and "the third orbit", "the last orbit" or "every other orbit" picks some. Also names a value: "Let gold be #ffb347."',
    examples: ['Let there be a flat canvas called poster, 1080 by 1350.', 'Let there be a circle called sun, 330 big, at 800 330.', 'Let there be 12 triangles called ray, 46 by 150, in a ring around 540 560, 450 out.', 'Let gold be #ffb347.'],
    run(ctx, toks, s) {
      if (isWord(toks[0], 'there')) return there(ctx, toks.slice(isWord(toks[1], 'be', 'is', 'are') ? 2 : 1), s);
      const be = toks.findIndex(x => isWord(x, 'be', 'mean', 'equal'));
      if (be < 0 && old.let) return old.let.run(ctx, toks, s);      // "let the scrolls break the card edge"
      if (be < 1 || be === toks.length - 1) ctx.err('let what be what?', 'e.g. "Let there be a circle called sun, 330 big." or "Let gold be #ffb347."');
      const name = dropArticles(toks.slice(0, be)).filter(x => x.t === 'word').map(x => x.v).join('-');
      if (!name) ctx.err('the value needs a name', 'e.g. "Let gold be #ffb347."');
      if (ctx.reg.verbs.has(name) || ctx.reg.words.has(name)) ctx.err(`"${name}" already means something`, 'pick another name');
      ctx.vars.set(name, { value: toks.slice(be + 1) }); (ctx.lets ||= new Set()).add(name);
    },
  });

  const legacy = (ctx, t) => ctx.doc.kind === 'room' || isWord(t[0], 'zone') || ((isWord(t[0], ...OBJECT_KINDS)) && t.some(x => isWord(x, 'called', 'named')))
    || (t[0]?.t === 'word' && !ctx.doc.layers[ctx.resolve(t[0].v)] && !ctx.doc.elements?.[t[0].v] && (ctx.doc.zones[t[0].v] || t[0].v === 'window') && t[0].v !== 'card')
    || (isWord(t[0], 'it') && typeof ctx.it === 'string' && ctx.doc.zones[ctx.it] && !ctx.doc.layers[ctx.it] && !ctx.doc.elements?.[ctx.it] && ctx.it !== 'card');
  const things = (ctx, toks, verb) => {
    const r = readThings(ctx, toks, 0);
    if (!r.things.length) { const w = dropArticles(toks).find(x => x.t === 'word')?.v || '?'; ctx.err(`${verb} what? there is nothing called "${w}"`, ctx.suggest(w, ['card', ...Object.keys(ctx.doc.layers), ...Object.keys(ctx.doc.elements || {})]) || `here: ${known(ctx)}`); }
    return r;
  };
  reg.verb({
    words: ['make'],
    help: 'Applies a known word to a thing. A colour or material: "make the card #10131f", "make the title gold". An effect: glow, shadowed, outlined, frosted, grainy, vignetted. A state: grayscale, blurred 6, 40% see-through, uppercase. A transform: bigger, 780 wide, turned -24, flipped, line up on the left. A motion (video): float, pulse, sway, spin, fade in. Details follow as commas, and several words can share a sentence: "make the title gold, shadowed and uppercase." (Also shapes a zone: "make the window 756 by 1345.")',
    examples: ['make the card #10131f.', 'make the sun glow in #ffd98a, 90 wide.', 'make the title gold, shadowed and uppercase.', 'make the leaf 1.6 times bigger, turned -24.', 'make the badge float, 14 high, every 3 s.'],
    run(ctx, toks, s) {
      if (legacy(ctx, dropArticles(toks))) return old.make.run(ctx, toks, s);
      const { things: th, i } = things(ctx, toks, 'make');
      applyWords(ctx, th, toks.slice(i), 'make');
    },
  });
  reg.verb({
    words: ['give'],
    help: 'Gives a thing something it has: "give the title a shadow, 10 down, blur 14", "give the card the colour #10131f", "give the card a vignette of 0.35". Also sets one value: "give the title a size of 170", "give the glow a width of 90" (width, blur, strength, colour, opacity).',
    examples: ['give the title a shadow, 10 down, blur 14.', 'give the card a grain of 0.2.', 'give the glow a width of 90.'],
    run(ctx, toks, s) {
      const t = dropArticles(toks);
      if (legacy(ctx, t)) return old.make.run(ctx, toks, s);
      // "give the glow a width of 90": the glow of the thing we were just talking about
      const own = ctx.reg.match(ctx.reg.words, t, 0, 3);
      const r = own?.entry.slot && ctx.it && !thing(ctx, t[0].v) ? { things: [].concat(ctx.it).map(n => thing(ctx, n)).filter(Boolean), i: toks.indexOf(t[0]) } : things(ctx, toks, 'give');
      let p = toks.slice(r.i); while (isWord(p[0], 'a', 'an', 'the')) p = p.slice(1);
      if (setting(ctx, r.things, p)) return;
      applyWords(ctx, r.things, toks.slice(r.i), 'give');
    },
  });

  // move: to a place, or by a distance; with a time it travels
  const EASE = { bouncing: 'bounce', bounce: 'bounce', bouncy: 'bounce', elastic: 'elastic', springy: 'elastic', overshooting: 'overshoot', overshoot: 'overshoot', linear: 'linear', steadily: 'linear', 'ease-in': 'ease-in', 'ease-out': 'ease-out', 'slowing': 'ease-out', 'speeding': 'ease-in' };
  reg.verb({
    words: ['move'],
    help: 'Puts a thing somewhere else: "move the badge to 540 300", "move the badge 40 right, 20 down". With a time it travels there (an object in a video): "move the ball to 880 300 over 1.4 s, bouncing" (bouncing, elastic, overshooting, linear, ease-in, ease-out).',
    examples: ['move the badge to 540 300.', 'move the title 40 right, 20 down.', 'move the ball to 880 300, at 0.5 s, over 1.4 s, bouncing.'],
    run(ctx, toks, s) {
      const { things: th, i } = things(ctx, toks, 'move'), rest = toks.slice(i);
      const words = rest.filter(x => x.t === 'word').map(x => x.v);
      let to = after(rest, 'to', 2)?.map(ctx.px) || null, dx = 0, dy = 0, rel = false;
      for (let k = 0; k < rest.length; k++) {
        const d = rest[k]; if (!isWord(d, 'up', 'down', 'left', 'right')) continue;
        const n = rest[k - 1]?.t === 'num' ? rest[k - 1] : isWord(rest[k + 1], 'by') && rest[k + 2]?.t === 'num' ? rest[k + 2] : rest[k + 1]?.t === 'num' ? rest[k + 1] : null;
        if (!n) continue; const v = ctx.px(n); rel = true;
        if (d.v === 'up') dy -= v; else if (d.v === 'down') dy += v; else if (d.v === 'left') dx -= v; else dx += v;
      }
      if (!rel && after(rest, 'by', 2)) { [dx, dy] = after(rest, 'by', 2).map(ctx.px); rel = true; }
      if (!to && !rel) ctx.err('move it where?', 'e.g. "move the badge to 540 300." or "move the badge 40 right."');
      const at = after(rest, 'at') ?? ctx.when, over = after(rest, 'over'), timed = at != null || over != null, ease = words.map(w => EASE[w]).find(Boolean);
      for (const t of th) {
        if (t.el) {
          const cur = [...(t.el.moves || [])].sort((a, b) => a.t0 - b.t0).filter(k => k.to).at(-1)?.to || t.el.at;
          const goal = to || [cur[0] + dx, cur[1] + dy];
          if (timed) (t.el.moves ||= []).push({ t0: at ?? 0, dur: over ?? .6, ...(ease ? { ease } : {}), to: goal }); else t.el.at = goal;
        } else if (timed) ctx.err(`only an object on a stage can travel over time`, `"${t.name}" is drawn on a surface; without a time it moves at once`);
        else if (t.L?.kind === 'text' || t.L?.at) { const L = t.L, c = L.box ? [(L.box[0] + L.box[2]) / 2, (L.box[1] + L.box[3]) / 2] : L.at; const ddx = to ? to[0] - c[0] : dx, ddy = to ? to[1] - c[1] : dy; L.at = [r2(L.at[0] + ddx), r2(L.at[1] + ddy)]; if (L.kind === 'text') L.box = textBox(L); }
        else if (t.L?.shapes) say(ctx, t.side, to ? `shift the ${t.name} to ${to[0]} ${to[1]}.` : `shift the ${t.name} by ${dx} ${dy}.`);
        else ctx.err(`"${t.name}" can't be moved`);
      }
      ctx.it = th.length > 1 ? th.map(x => x.name) : th[0].name;
    },
  });

  // change: something about an object becomes different at a time, and can go back
  reg.verb({
    words: ['change'],
    help: 'A change over time, for an object in a video: "change the title to invisible over 0.5 s", "change the badge to 120% size for 0.5 s, then back", "change the tag to turned 20 over 1 s". States: visible, invisible, N% size, N times bigger, turned N. "for N s" holds it and returns; "then back" returns after a moment. Use "move" for place.',
    examples: ['change the title from invisible to visible over 0.5 s.', 'change the badge to 120% size for 0.5 s, then back.'],
    run(ctx, toks) {
      const { things: th, i } = things(ctx, toks, 'change'), rest = toks.slice(i);
      const words = rest.filter(x => x.t === 'word').map(x => x.v), has = (...w) => w.some(x => words.includes(x));
      const ti = rest.findIndex(x => isWord(x, 'to')), fi = rest.findIndex(x => isWord(x, 'from'));
      if (ti < 0) ctx.err('change it to what?', 'e.g. "change the title to invisible over 0.5 s."');
      const stateOf = (c) => {
        const n = c.find(x => x.t === 'num' && x.unit !== 's'), w = c.filter(x => x.t === 'word').map(x => x.v), is = (...k) => k.some(x => w.includes(x));
        if (is('invisible', 'hidden', 'gone')) return { alpha: 0 };
        if (is('visible', 'shown', 'seen')) return { alpha: 1 };
        if (is('turned', 'tilted', 'rotated') && n) return { turn: n.v };
        if (is('size', 'bigger', 'larger', 'big') && n) return { scale: n.unit === 'pct' ? (is('bigger', 'larger') ? 1 + n.v / 100 : n.v / 100) : n.v };
        if (is('smaller') && n) return { scale: n.unit === 'pct' ? 1 - n.v / 100 : 1 / n.v };
        if (is('normal', 'usual', 'original')) return { scale: 1, turn: 0 };
        if (c.some(x => x.t === 'color') || is('gradient')) ctx.err('colours cannot change over time yet', 'only whole objects change for now: visible, invisible, N% size, turned N');
        return null;
      };
      const stop = (c) => { const k = c.findIndex((x, j) => j > 0 && (x.t === ',' || isWord(x, 'over', 'for', 'at', 'then', 'to', 'from'))); return k < 0 ? c : c.slice(0, k); };
      const to = stateOf(stop(rest.slice(ti + 1))), from = fi >= 0 && fi < ti ? stateOf(rest.slice(fi + 1, ti)) : null;
      if (!to) ctx.err(`I don't know that state: "${txt(stop(rest.slice(ti + 1)))}"`, 'states: visible, invisible, N% size, N times bigger, turned N');
      const t0 = after(rest, 'at') ?? ctx.when ?? 0, dur = after(rest, 'over') ?? .5, hold = after(rest, 'for'), back = hold != null || has('back');
      for (const t of th) {
        if (!t.el) ctx.err('only an object on a stage can change over time for now', `"${t.name}" is drawn on a surface; objects: ${Object.keys(ctx.doc.elements || {}).join(', ') || 'none'}`);
        const e = t.el;
        if (to.alpha != null) {
          if (from && from.alpha === to.alpha) continue;
          (e.fades ||= []).push({ t0, dur, to: to.alpha });
          if (back) e.fades.push({ t0: t0 + dur + (hold ?? .5), dur, to: 1 - to.alpha });
        } else {
          const prev = [...(e.moves || [])].sort((a, b) => a.t0 - b.t0);
          const was = { scale: from?.scale ?? prev.filter(k => k.scale != null).at(-1)?.scale ?? 1, turn: from?.turn ?? prev.filter(k => k.turn != null).at(-1)?.turn ?? (e.turn || 0) };
          const key = { ...(to.scale != null ? { scale: to.scale } : {}), ...(to.turn != null ? { turn: to.turn } : {}) };
          (e.moves ||= []).push({ t0, dur, ...key });
          if (back) e.moves.push({ t0: t0 + dur + (hold ?? .3), dur, ...(to.scale != null ? { scale: was.scale } : {}), ...(to.turn != null ? { turn: was.turn } : {}) });
        }
      }
    },
  });

  // when: the rest of the sentence happens at that moment
  const TIMED = new Set(['move', 'change', 'glide', 'fade', 'bring', 'remove', 'reveal', 'slam', 'float', 'pulse', 'sway', 'turn', 'flip', 'caption', 'say', 'unveil']);
  reg.verb({
    words: ['when', 'once', 'after'],
    help: 'An event in a video: the rest of the sentence happens at that moment. Moments: "the video starts", "the video reaches 2 s" (or "after 2 s"), "the video ends", and what an object does: "the ball arrives" (its move ends), "the title appears", "the title leaves". Chain them, so nobody adds up seconds.',
    examples: ['When the video reaches 2 s, move the ball to 880 300 over 1.4 s, bouncing.', 'When the ball arrives, make the banner pulse.', 'When the title appears, change the badge to 120% size for 0.4 s, then back.'],
    run(ctx, toks, s) {
      if (!ctx.doc.video) ctx.err('events need a video', 'start with "Let there be a video called …, 1080 by 1080, 5 s long."');
      const ci = toks.findIndex(x => x.t === ','); if (ci < 0) ctx.err('when that happens, then what?', 'e.g. "When the ball arrives, make the banner pulse."');
      const cond = toks.slice(0, ci), w = cond.filter(x => x.t === 'word').map(x => x.v), is = (...k) => k.some(x => w.includes(x));
      const n = cond.find(x => x.t === 'num');
      let T = null;
      if (is('tapped', 'clicked', 'pressed', 'hovered', 'touched')) ctx.err('taps and hovers are not events yet', 'a video has no viewer input; use a time or what an object does');
      const r = readThings(ctx, cond, 0), th = r.things.find(x => x.el);
      if (th && is('arrives', 'lands', 'stops', 'settles', 'arrived')) { const mv = (th.el.moves || []).filter(k => k.to); if (!mv.length) ctx.err(`"${th.name}" has not been moved yet`, `write its "move … over …" sentence before this one`); T = Math.max(...mv.map(k => k.t0 + k.dur)); }
      else if (th && is('appears', 'appeared', 'enters', 'arrives')) { const f = (th.el.fades || []).filter(k => k.to === 1); T = f.length ? Math.max(...f.map(k => k.t0 + k.dur)) : th.el.enter ? th.el.enter.t0 + .6 : 0; }
      else if (th && is('leaves', 'disappears', 'vanishes', 'gone')) { const f = (th.el.fades || []).filter(k => k.to === 0); T = f.length ? Math.max(...f.map(k => k.t0 + k.dur)) : th.el.exit ? th.el.exit.t0 + .5 : null; if (T == null) ctx.err(`"${th.name}" never leaves`, 'make it fade out or remove it first'); }
      else if (n) T = n.v;
      else if (is('starts', 'begins', 'start')) T = 0;
      else if (is('ends', 'finishes', 'end')) T = ctx.doc.video.seconds;
      else ctx.err(`I don't know that moment: "${txt(cond)}"`, 'moments: the video starts, the video reaches 2 s, the video ends, <object> arrives, <object> appears, <object> leaves');
      let rest = s.text.slice(s.text.indexOf(',') + 1).trim().replace(/^then\s+/i, '').replace(/[.:]\s*$/, '');
      const first = rest.split(/\s+/)[0]?.toLowerCase();
      if (TIMED.has(first) && !/\bat\s+[\d.]+\s*(s|sec|secs|seconds?)\b/i.test(rest)) rest += `, at ${r2(T)} s`;
      const prev = ctx.when; ctx.when = r2(T);
      try { ctx.run(rest + '.', 'when'); } finally { ctx.when = prev; }
    },
  });
}
