// Elements pack (Morgana element model, docs: "Morgana: The Element Model").
// An element is an object on a stage: outline + body + surface + content. Paper, card stock and metal are
// body presets, not different kinds of thing. Paints are mixed from pigments with Kubelka-Munk, so blue and
// yellow make green, and sprayed with a gun that has real settings.
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../core/compile.js';
import { readMods, readName, isWord, dropArticles, num, flag } from '../core/phrases.js';

// ── bodies: physical presets every element starts from (any property can be overridden) ─────────────
export const BODIES = {
  bond:        { family: 'paper', color: '#f3efe4', metal: 0, rough: .92, thick_mm: .10, fibres: .45, edge: 'clean' },
  newsprint:   { family: 'paper', color: '#e7e0cf', metal: 0, rough: .95, thick_mm: .08, fibres: .8, edge: 'clean' },
  kraft:       { family: 'paper', color: '#b88f60', metal: 0, rough: .95, thick_mm: .15, fibres: 1, edge: 'clean' },
  cardstock:   { family: 'card', color: '#f7f4ee', metal: 0, rough: .7, thick_mm: .45, fibres: .15, edge: 'clean' },
  'black-card':{ family: 'card', color: '#1d1d1f', metal: 0, rough: .6, thick_mm: .45, fibres: .1, edge: 'clean' },
  stainless:   { family: 'metal', color: '#b9bdc2', metal: 1, rough: .26, thick_mm: .8, fibres: 0, edge: 'bevel' },
  brass:       { family: 'metal', color: '#c9a24a', metal: 1, rough: .22, thick_mm: 1.2, fibres: 0, edge: 'bevel' },
  gold:        { family: 'metal', color: '#e2b65a', metal: 1, rough: .16, thick_mm: 1.0, fibres: 0, edge: 'bevel' },
  copper:      { family: 'metal', color: '#c4744a', metal: 1, rough: .24, thick_mm: 1.0, fibres: 0, edge: 'bevel' },
  ink:         { family: 'ink', color: 'none', metal: 0, rough: .9, thick_mm: 0, fibres: 0, edge: 'clean' },
  acrylic:     { family: 'plastic', color: '#eef2f5', metal: 0, rough: .06, thick_mm: 2.0, fibres: 0, edge: 'polished' },
};
const BODY_ALIAS = { paper: 'bond', 'bond-paper': 'bond', card: 'cardstock', 'card-stock': 'cardstock', steel: 'stainless', 'stainless-steel': 'stainless', plastic: 'acrylic' };

// ── pigments: masstone colour (sRGB) and scattering strength S. Mixing uses K/S per channel. ─────────────
export const PIGMENTS = {
  'titanium white': ['#f7f7f2', 3.0], 'zinc white': ['#f2f2ee', 1.5], 'carbon black': ['#161616', 1.0], 'ivory black': ['#1d1c1a', 1.0],
  'cadmium red': ['#d62d20', 1.2], 'cadmium orange': ['#f2711c', 1.1], 'cadmium yellow': ['#f5c400', 1.2], 'hansa yellow': ['#f6d21f', .7],
  'quinacridone magenta': ['#a2185b', .5], 'ultramarine blue': ['#1f3b9b', .8], 'phthalo blue': ['#0f2c6b', .4], 'phthalo green': ['#0a5a46', .4],
  'burnt sienna': ['#8a3b1e', 1.0], 'yellow ochre': ['#c99a3c', 1.1], 'raw umber': ['#5a4632', 1.0],
};
const lin = (c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
const srgb = (c) => c <= .0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - .055;
const hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const rgbHex = (r) => '#' + r.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
// Kubelka-Munk: K/S = (1-R)^2 / 2R per channel; a mix weights each pigment's K and S by its share; R back from K/S.
export function mixPigments(parts) {
  const out = [0, 1, 2].map(ch => {
    let K = 0, S = 0;
    for (const { pigment, amount } of parts) {
      const [hex, s] = PIGMENTS[pigment], R = Math.min(.999, Math.max(.001, lin(hexRgb(hex)[ch])));
      const ks = (1 - R) ** 2 / (2 * R);
      K += amount * ks * s; S += amount * s;
    }
    const ks = K / S;
    return srgb(1 + ks - Math.sqrt(ks * ks + 2 * ks));
  });
  return rgbHex(out);
}
export function findPigment(words) {
  const w = words.join(' ');
  if (PIGMENTS[w]) return w;
  if (w === 'white') return 'titanium white';
  if (w === 'black') return 'carbon black';
  return Object.keys(PIGMENTS).find(p => p.endsWith(' ' + w) || p.startsWith(w + ' ')) || null;
}
const FINISHES = ['gloss', 'satin', 'matte', 'metallic', 'pearl', 'candy'];

export default function elements(reg) {
  // make a paper called memo from bond, 760 by 1000, at 540 900, turned -3, 2 mm up, torn top edge.
  reg.verb({
    words: ['element'],
    help: '(internal) the element form of "make": make a paper | card | piece | plate | sheet called … from <body>, W by H, at X Y.',
    examples: ['make a paper called memo from bond, 760 by 1000, at 540 900, turned -3, torn top edge.'],
    run(ctx, toks) {
      const t = dropArticles(toks);
      const kind = t[0].v;
      const head = t.slice(1); const comma = head.findIndex(x => x.t === ',');
      const first = comma < 0 ? head : head.slice(0, comma), rest = comma < 0 ? [] : head.slice(comma + 1);
      const mods = readMods([...first.flatMap((x) => isWord(x, 'from') ? [{ t: ',' }, x] : [x]), { t: ',' }, ...rest]);
      const name = mods.name; if (!name) ctx.err(`name the ${kind}`, `e.g. "make a ${kind} called memo from bond, 760 by 1000, at 540 900."`);
      const bodyKey = String(mods.from || ({ paper: 'bond', sheet: 'bond', card: 'cardstock', piece: 'stainless', plate: 'stainless' }[kind] || 'bond')).replace(/ /g, '-');
      const key = BODY_ALIAS[bodyKey] || bodyKey;
      if (!BODIES[key]) ctx.err(`"${mods.from}" is not a body`, `bodies: ${Object.keys(BODIES).join(', ')}`);
      if (!mods.size) ctx.err(`how big is the ${kind}?`, 'e.g. "760 by 1000"');
      const [w, h] = mods.size.map(num);
      const at = mods.at ? [].concat(mods.at).map(num) : [ctx.doc.card.grid[0] / 2, ctx.doc.card.grid[1] / 2];
      const body = { preset: key, ...BODIES[key] };
      if (mods.thick) body.thick_mm = ctx.mm(mods.thick);
      if (mods.in) body.color = mods.in.v || mods.in;
      const ph = (mods._phrases || []).join(' | ');
      const edgeM = ph.match(/(torn|deckle|deckled|perforated|clean|bevel(?:led)?)(?: (top|bottom|left|right))?(?: edges?)?/);
      const edge = edgeM ? { style: edgeM[1].replace('deckled', 'deckle').replace('bevelled', 'bevel'), side: edgeM[2] || 'all' } : { style: body.edge, side: 'all' };
      const els = (ctx.doc.elements ||= {});
      els[name] = {
        kind, body, size: [w, h], at, turn: mods.turned != null ? num(mods.turned) : 0,
        up_mm: mods.up ? ctx.mm(mods.up) : (body.family === 'paper' ? .3 : body.family === 'metal' ? 1 : .5),
        outline: flag(mods, 'round', 'circle', 'disc') ? 'circle' : 'rect', corners: mods.corners != null ? num(mods.corners) : 0,
        edge, aged: mods.aged != null ? num(mods.aged) : 0, order: Object.keys(els).length, line: ctx.line,
      };
      // the element is also a zone in its own (local) coordinates, so "spray the memo …" works
      ctx.doc.zones[name] = { rect: [0, 0, w, h], r: els[name].outline === 'circle' ? Math.min(w, h) / 2 : els[name].corners };
      ctx.side = name; ctx.sideObj(name); ctx.it = name;
    },
  });

  // ── motion: elements come in, slam down, leave; layers reveal over time
  const secs = (t) => t == null ? null : Array.isArray(t) ? num(t[0]) : num(t);
  const timing = (toks) => { const m = readMods(toks); return { t0: secs(m.at), dur: secs(m.over) ?? secs(m.for), dir: [].concat(m.from || m.to || []).join('') || null, m }; };
  const element = (ctx, t, skip) => { const { name } = readName(t, 0, new Set([...skip, 'at', 'from', 'to', 'in', 'over'])); const els = ctx.doc.elements || {};
    const n = els[name] ? name : ctx.resolve?.(name); if (!els[n]) ctx.err(`no element "${name}"`, `elements: ${Object.keys(els).join(', ') || 'none'}`); return n; };
  reg.verb({
    words: ['slam'],
    help: 'Slam an element down onto the stage at a time, like a rubber stamp: "slam the sell-stamp in at 7 s."',
    examples: ['slam the sell-stamp in at 7 s.'],
    run(ctx, toks) { const t = dropArticles(toks), n = element(ctx, t, []); const { t0 } = timing(t.slice(t.findIndex(x => isWord(x, 'at')))); ctx.doc.elements[n].enter = { t0: t0 ?? 0, style: 'slam' }; },
  });
  reg.verb({
    words: ['remove'],
    help: 'Take an element off the stage at a time: "remove the title at 4 s, to the left."',
    examples: ['remove the title at 4 s, to the left.'],
    run(ctx, toks) { let t = dropArticles(toks); if (isWord(t[0], 'away', 'off', 'out')) t = t.slice(1); const n = element(ctx, t, ['away', 'off']);
      const { t0, dir } = timing(t.slice(t.findIndex(x => isWord(x, 'at')))); ctx.doc.elements[n].exit = { t0: t0 ?? 0, to: (dir || 'left').replace(/-/g, ' ') }; },
  });
  // move the chart to 540 700 at 9 s, over 0.6 s · move the camera to 700 600, zoom 1.2, at 9 s, over 0.5 s
  reg.verb({
    words: ['glide'],
    help: 'Move an element (or the camera) to a new place over time: "glide the chart to 540 700, turned 3, at 9 s, over 0.6 s." "glide the camera to 700 600, zoom 1.2, at 9 s, over 0.5 s."',
    examples: ['glide the camera to 700 600, zoom 1.2, at 9 s, over 0.5 s.'],
    run(ctx, toks) {
      const t = dropArticles(toks), cam = isWord(t[0], 'camera');
      const n = cam ? null : element(ctx, t, []);
      const ti = t.findIndex(x => isWord(x, 'to')), m = readMods(t.slice(ti));
      const to = [].concat(m.to || []).map(num).filter(v => v != null);
      const key = { t0: secs(m.at) ?? 0, dur: secs(m.over) ?? .6, ...(to.length === 2 ? { to } : {}), ...(m.zoom != null ? { zoom: num(m.zoom) } : {}), ...(m.turned != null ? { turn: num(m.turned) } : {}), ...(m.scale != null ? { scale: num(m.scale) } : {}) };
      if (cam) ((ctx.doc.timeline ||= { reveals: {} }).camera ||= []).push(key); else (ctx.doc.elements[n].moves ||= []).push(key);
    },
  });
  // caption "Two sigma above? Sell." at 9.6 s, for 3 s, "Sell" in #c8361f
  reg.verb({
    words: ['caption', 'say'],
    help: 'A caption that appears word by word: caption "TEXT" at T s, for D s, "keyword" in #colour.',
    examples: ['caption "Prices snap back." at 1 s, for 3 s, "snap back" in #c8361f.'],
    run(ctx, toks) {
      const str = toks.find(x => x.t === 'str'); if (!str) ctx.err('caption "TEXT" at T s, for D s');
      const rest = toks.slice(toks.indexOf(str) + 1), m = readMods(rest);
      const marks = []; for (let k = 0; k < rest.length; k++) if (rest[k].t === 'str' && isWord(rest[k + 1], 'in') && rest[k + 2]?.t === 'color') marks.push({ text: rest[k].v, color: rest[k + 2].v });
      ((ctx.doc.timeline ||= { reveals: {} }).captions ||= []).push({ text: str.v, t0: secs(m.at) ?? 0, dur: secs(m.for) ?? secs(m.over) ?? 3, marks, line: ctx.line });
    },
  });
  // caption style: set the captions to Bodoni Moda 64 in #1d1b18, at 1560
  reg.verb({
    words: ['style'],
    help: 'Caption style: "style the captions in Jost, size 62, #1d1b18, at 1560."',
    examples: ['style the captions in Jost, size 62, #1d1b18, at 1560.'],
    run(ctx, toks) {
      const t = dropArticles(toks); if (!isWord(t[0], 'captions', 'caption')) ctx.err('style the captions …');
      const m = readMods(t.slice(1)), fam = []; let k = t.findIndex(x => isWord(x, 'in')) + 1; while (k > 0 && t[k]?.t === 'word') fam.push(t[k++].v);
      const font = fam.length ? fam.map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : 'Jost';
      const col = t.find(x => x.t === 'color');
      (ctx.doc.timeline ||= { reveals: {} }).captionStyle = { font, size: m.size != null ? num(m.size) : 60, color: col?.v || '#1d1b18', y: m.at != null ? num(m.at) : null, weight: (m._flags?.has('bold') ? 700 : 500) };
    },
  });

  reg.verb({
    words: ['reveal', 'show'],
    help: 'Reveal a layer over time, as if drawn or written: "reveal the price at 5 s, over 3 s, from the left."',
    examples: ['reveal the price at 5 s, over 3 s, from the left.'],
    run(ctx, toks) {
      const t = dropArticles(toks), names = [];
      let i = 0; while (i < t.length && !isWord(t[i], 'at')) { if (t[i].t === 'word' && !isWord(t[i], 'and', 'the')) { const r = readName(t, i, new Set(['and', 'at'])); names.push(ctx.resolve(r.name) || r.name); i = r.i; } else i++; }
      const { t0, dur, dir } = timing(t.slice(i));
      const tl = (ctx.doc.timeline ||= { reveals: {} });
      const fade = t.some(x => isWord(x, 'fading', 'fade', 'faded'));
      for (const n of names) { if (!ctx.doc.layers[n]) ctx.err(`"${n}" is not a layer`); tl.reveals[n] = { t0: t0 ?? 0, dur: dur ?? .6, from: fade ? 'fade' : (dir || 'left').replace(/-/g, ' ') }; }
    },
  });

  // layering: bring the memo to the front · send the seal to the back · send the seal behind the memo
  reg.verb({
    words: ['bring', 'send'],
    help: 'Change stacking: "bring the memo to the front", "send the seal to the back", "send the seal behind the memo".',
    examples: ['bring the memo to the front.', 'send the seal behind the memo.'],
    run(ctx, toks) {
      const els = ctx.doc.elements || {}; let t = dropArticles(toks);
      if (isWord(t[0], 'in')) {                         // bring in the memo at 1 s, from the bottom
        t = dropArticles(t.slice(1)); const n = element(ctx, t, []); const { t0, dir } = timing(t.slice(t.findIndex(x => isWord(x, 'at'))));
        els[n].enter = { t0: t0 ?? 0, style: 'slide', from: (dir || 'bottom').replace(/-/g, ' ') }; return;
      }
      const { name } = readName(t, 0, new Set(['to', 'behind', 'in', 'above', 'over', 'under', 'below']));
      if (!els[name]) ctx.err(`no element "${name}"`, `elements: ${Object.keys(els).join(', ') || 'none yet'}`);
      const list = Object.keys(els).sort((a, b) => els[a].order - els[b].order).filter(k => k !== name);
      const rel = t.findIndex(x => isWord(x, 'behind', 'under', 'below', 'above', 'over'));
      if (rel >= 0) {
        const other = readName(t, rel + 1).name; if (!els[other]) ctx.err(`no element "${other}"`);
        list.splice(list.indexOf(other) + (isWord(t[rel], 'above', 'over') ? 1 : 0), 0, name);
      } else if (t.some(x => isWord(x, 'back', 'bottom'))) list.unshift(name);
      else list.push(name);
      list.forEach((k, i) => { els[k].order = i; });
    },
  });

  // mix a paint called sunset from 3 parts cadmium red and 1 part hansa yellow and a touch of white, satin.
  reg.verb({
    words: ['mix'],
    help: 'Mix a paint from pigments (Kubelka-Munk, like real paint): parts, "a touch of", "a little"; then a finish.',
    examples: ['mix a paint called leaf from 1 part phthalo blue and 2 parts hansa yellow, satin.'],
    run(ctx, toks) {
      const t = dropArticles(toks);
      if (!isWord(t[0], 'paint', 'colour', 'color')) ctx.err('mix a paint called … from …');
      const name = readName(t, isWord(t[1], 'called', 'named') ? 2 : 1, new Set(['from'])).name;
      const f = t.findIndex(x => isWord(x, 'from'));
      if (!name || f < 0) ctx.err('mix a paint called NAME from PIGMENTS', `pigments: ${Object.keys(PIGMENTS).join(', ')}`);
      const comma = t.findIndex((x, i) => i > f && x.t === ',');
      const list = t.slice(f + 1, comma < 0 ? undefined : comma), after = comma < 0 ? [] : t.slice(comma + 1);
      const groups = [[]]; for (const x of list) { if (isWord(x, 'and')) groups.push([]); else groups.at(-1).push(x); }
      const parts = groups.filter(g => g.length).map(g => {
        let amount = 1, words = g.filter(x => x.t === 'word').map(x => x.v);
        const n = g.find(x => x.t === 'num'); if (n) amount = n.v;
        if (words[0] === 'touch' || (words[0] === 'a' && words[1] === 'touch')) amount = .12;
        if (words.includes('little')) amount = .3;
        words = words.filter(w => !['a', 'touch', 'of', 'little', 'part', 'parts', 'some'].includes(w));
        const pigment = findPigment(words);
        if (!pigment) ctx.err(`unknown pigment "${words.join(' ')}"`, `pigments: ${Object.keys(PIGMENTS).join(', ')}`);
        return { pigment, amount };
      });
      const finish = after.map(x => x.v).find(v => FINISHES.includes(v)) || 'satin';
      ctx.doc.materials[name] = { type: 'paint', pigments: parts, hex: mixPigments(parts), finish };
    },
  });
}

// spray settings → params (used by the spray verb when the coat is a paint or a pigment)
export function sprayParams(ctx, mods) {
  const ph = [(mods._phrases || []).join(' '), typeof mods.sweeping === 'string' ? 'from the ' + mods.sweeping.replace(/-/g, ' ') : ''].join(' ');
  const nozzle = /fine/.test(ph) ? 'fine' : /coarse|spatter/.test(ph) ? 'coarse' : 'medium';
  const dir = /top to bottom|vertical|down/.test(ph) ? 'vertical' : /corner|from the/.test(ph) ? (ph.match(/(top|bottom) (left|right)/)?.[0] || 'top left') : 'horizontal';
  return {
    nozzle, sweep: dir,
    away_cm: mods.away ? (mods.away.unit === 'mm' ? mods.away.v / 10 : mods.away.v) : 20,
    passes: mods.passes != null ? num(mods.passes) : 1,
    pressure: mods.pressure != null ? num(mods.pressure) : 1,
    soft: /soft/.test(ph), wet: /wet/.test(ph), drips: mods.drips === true || /drip/.test(ph),
    ...(mods.at != null && !Array.isArray(mods.at) ? { t0: num(mods.at) } : {}), ...(mods.for != null ? { dur: num(mods.for) } : {}),
  };
}

// ── a card on a stage (order 0.3): a card file becomes one element with its own faces, layers and materials.
//   place a card called ticket from @ticket.gt at 540 900, scale 0.6.
//   flip the ticket at 1.5 s, over 0.8 s.
const secsOf = (v) => v == null ? null : Array.isArray(v) ? num(v[0]) : num(v);
export function placeCard(ctx, toks) {
  const t = dropArticles(toks), kind = t[0].v;
  if (ctx.doc.kind !== 'stage') ctx.err('cards go on a stage', 'start with "create a stage called …, 1080 by 1350." and place the card on it');
  const ci = t.findIndex(x => isWord(x, 'called', 'named'));
  if (ci < 0) ctx.err(`name the ${kind}`, `e.g. "place a ${kind} called ticket from @ticket.gt at 540 900, scale 0.6."`);
  const { name } = readName(t, ci + 1, new Set(['from']));
  const af = t.find(x => x.t === 'asset');
  if (!af) ctx.err(`which file is the ${kind} in?`, `e.g. "place a ${kind} called ${name} from @${name}.gt at 540 900."`);
  const file = path.resolve(ctx.baseDir || '.', af.v);
  if (!fs.existsSync(file)) ctx.err(`no file "${af.v}" next to this one`, 'a card file is a godtongue file of its own');
  const sub = compile(fs.readFileSync(file, 'utf8'), { registry: ctx.reg, baseDir: path.dirname(file) });
  if (!sub.ok) { const bad = sub.diagnostics.find(d => d.level === 'error'); ctx.err(`${af.v} has an error on line ${bad.line}: ${bad.msg}`, bad.hint); }
  if (!(['card', 'canvas'].includes(sub.doc.kind))) ctx.err(`${af.v} is not a card`, 'only a card or a canvas can be placed');
  const ati = t.findIndex(x => isWord(x, 'at'));
  if (ati < 0 || t[ati + 1]?.t !== 'num' || t[ati + 2]?.t !== 'num') ctx.err(`where does the ${name} go?`, 'e.g. "at 540 900"');
  const at = [t[ati + 1].v, t[ati + 2].v];
  const si = t.findIndex(x => isWord(x, 'scale'));
  const scale = si >= 0 && t[si + 1]?.t === 'num' ? t[si + 1].v : 1;
  const c = sub.doc.card, els = (ctx.doc.elements ||= {});
  els[name] = {
    kind: 'card', order: Object.keys(els).length, line: ctx.line, file: af.v, card: sub.doc,
    size: [...c.grid], rect: [...c.rect], corners: c.r, at, turn: 0, scale, up_mm: .3, held: false,
    stock: c.stock, thick_mm: c.thickness_mm, outline: 'rect', edge: { style: 'clean', side: 'all' }, aged: 0,
    faces: Object.keys(sub.doc.sides),
  };
  ctx.side = name; ctx.sideObj(name); ctx.it = name;
}

// "flip the ticket at 1.5 s, over 0.8 s." turns a placed card over; returns false when the name is not a card
export function flipElement(ctx, toks) {
  const t = dropArticles(toks), els = ctx.doc.elements || {};
  const { name, i } = readName(t, 0, new Set(['at', 'over', 'for']));
  const e = els[name];
  if (!e || !e.faces || e.faces.length < 2) return false;
  const m = readMods(t.slice(i));
  (e.flips ||= []).push({ t0: secsOf(m.at) ?? 0, dur: secsOf(m.over) ?? secsOf(m.for) ?? .8 });
  return true;
}
