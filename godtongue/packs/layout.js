// Pack: layout in plain words, so nobody adds up coordinates.
//
//   placing      Write "NEW!" in the sticker.  Write "Oxblood" in the first swatch, at the bottom left, 20 in.
//                Let there be a rectangle called img, 440 by 380, under the heading, 40 apart.
//                Write "studiomorgana.xyz" at the bottom right.  (the page, inside its margin)
//                Move the badge beside the title, 24 apart.
//                in / inside / on · under / below · above · beside / right of / left of · at the top left (of …)
//                Shapes centred in shapes are centred by eye: a triangle sits where it looks centred, not where its box is.
//   styles       Let a heading be Martian Mono, size 26, tracking 6, brass, aligned left.   Write "01 COLOUR" as a heading.
//   defaults     Let the margin be 120.   Let text be aligned left.   (every Write starts from "text")
//   labels       Write "Oxblood", "Midnight", "Forest" under the swatches, 20 apart.   (one each; called swatch-label)
//   readable     Make the label readable.   Make the labels readable, bone or ink.   (light or dark, for what is under it)
//   tables       Let there be a table called playlist, 1436 by 448, at 800 650, 8 rows, columns at 28, 78, 818 and 1398 right,
//                in Jost, size 24.
//                Write "1", "Lanterns", "Vesper Lane", "4:07" in the next row of the playlist.
//                Then: the playlist-rows (the row backgrounds), the playlist-words (every cell), the third playlist-words
//                (row 3's cells), the playlist-column-4 (a column's cells).
import { isWord, readMods, num } from '../core/phrases.js';
import { thing, readThings, members, looksOf, applyWords, say, txt } from './english.js';
import { textBox } from './text.js';
import { bbox, element as groupOf } from './shapes.js';
import { read } from '../core/read.js';

const r1 = (v) => Math.round(v * 10) / 10;
const H = new Set(['left', 'right', 'centre', 'center', 'middle', 'top', 'bottom']);
const PREP = { in: 'in', inside: 'in', on: 'in', onto: 'in', within: 'in', under: 'below', below: 'below', beneath: 'below', underneath: 'below', above: 'above', over: 'above', beside: 'right', next: 'right' };
const SHAPES = new Set(['circle', 'ellipse', 'rectangle', 'star', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'heart', 'arrow', 'bubble', 'shape', 'line', 'curve', 'path', 'spiral']);
const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth'];
const splitC = (toks) => { const out = [[]]; for (const t of toks) { if (t.t === ',') out.push([]); else out.at(-1).push(t); } return out; };
const join = (cl) => cl.flatMap((c, k) => k ? [{ t: ',' }, ...c] : c);

// ── boxes: where a thing is ─────────────────────────────────────────────────────────────────────────────────────────
export function boxOf(ctx, th) {
  if (th.el) { const [w, h] = th.el.size, s = th.el.scale || 1; return [th.el.at[0] - w * s / 2, th.el.at[1] - h * s / 2, th.el.at[0] + w * s / 2, th.el.at[1] + h * s / 2]; }
  if (th.ref === 'card' || th.name === 'card') { const r = ctx.doc.card.rect; return [r[0], r[1], r[0] + r[2], r[1] + r[3]]; }
  if (th.L?.shapes?.length) return bbox(th.L.shapes);
  if (th.L?.box) return th.L.box;
  if (th.L?.kind === 'signature') { const [x, y] = th.L.center; return [x - th.L.max_width / 2, y - th.L.size / 2, x + th.L.max_width / 2, y + th.L.size / 2]; }
  if (th.zone) { const r = ctx.doc.zones[th.name].rect; return [r[0], r[1], r[0] + r[2], r[1] + r[3]]; }
  return null;
}
const union = (bs) => bs.filter(Boolean).reduce((a, b) => a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b, null);
function nudge(ctx, th, dx, dy) {
  if (!dx && !dy) return;
  if (th.el) { th.el.at = [r1(th.el.at[0] + dx), r1(th.el.at[1] + dy)]; return; }
  const L = th.L; if (!L) return;
  if (L.shapes) { say(ctx, th.side, `shift the ${th.name} by ${r1(dx)} ${r1(dy)}.`); return; }
  if (L.kind === 'text') { L.at = [r1(L.at[0] + dx), r1(L.at[1] + dy)]; L.box = textBox(L); return; }
  if (L.center) L.center = [r1(L.center[0] + dx), r1(L.center[1] + dy)];
}
// where a single closed shape looks centred: halfway between its box centre and its centre of area
function optical(th) {
  const sh = th.L?.shapes; if (!sh || sh.length !== 1 || !sh[0].closed || sh[0].paint === 'stroke') return null;
  const P = sh[0].pts; let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) { const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], c = x0 * y1 - x1 * y0; A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
  if (Math.abs(A) < 1e-6) return null;
  const b = bbox(sh); return [(cx / (3 * A) - (b[0] + b[2]) / 2) / 2, (cy / (3 * A) - (b[1] + b[3]) / 2) / 2];
}

// ── reading a placement out of a sentence ───────────────────────────────────────────────────────────────────────────
// returns the sentence without it, and what it said: { mode, targets, h, v, inset, gap, cross, each, row }
export function takePlacement(ctx, toks, opts = {}) {
  const cl = splitC(toks); let place = null;
  const anchorOf = (ws, p) => { for (const w of ws) { if (w === 'top' || w === 'bottom') p.v = w; else if (w === 'left' || w === 'right') p.h = w; else if (['centre', 'center', 'middle'].includes(w)) { p.c = true; } } };
  for (let ci = 0; ci < cl.length && !place; ci++) {
    const c = cl[ci];
    for (let i = 0; i < c.length; i++) {
      const w = c[i]?.t === 'word' ? c[i].v : null; if (!w) continue;
      let mode = PREP[w], j = i + 1;
      if (w === 'next' && isWord(c[j], 'to')) j++;
      else if (w === 'next') mode = null;
      if ((w === 'to' && isWord(c[i + 1], 'the') && isWord(c[i + 2], 'right', 'left') && isWord(c[i + 3], 'of')) ) { mode = c[i + 2].v; j = i + 4; }
      if ((w === 'right' || w === 'left') && isWord(c[i + 1], 'of') && (i === 0 || !isWord(c[i - 1], 'the'))) { mode = w; j = i + 2; }
      const p = { h: null, v: null, c: false };
      const leads = i === 0 || c[i - 1]?.t === 'str' || isWord(c[i - 2], 'called');   // "leaving a gap at the top" is not a place
      if (w === 'at' && leads && isWord(c[i + 1], 'the') && c[i + 2]?.t === 'word' && H.has(c[i + 2].v)) {
        let k = i + 2; const ws = []; while (c[k]?.t === 'word' && H.has(c[k].v)) ws.push(c[k++].v); anchorOf(ws, p);
        let targets = [thing(ctx, 'card')];
        if (isWord(c[k], 'of')) { const r = readThings(ctx, c, k + 1); if (!r.things.length) continue; targets = r.things; k = r.i; }
        place = { mode: 'in', targets, ...p, start: i, end: k, ci }; break;
      }
      if (!mode || (opts.noIn && mode === 'in')) continue;
      // tables: "in the next row of the playlist", "in the third row of the playlist", "in row 3 of the playlist"
      let k = j; while (isWord(c[k], 'the', 'a')) k++;
      const ordW = c[k]?.t === 'word' && (ORD.includes(c[k].v) || c[k].v === 'next' || c[k].v === 'last') ? c[k].v : null;
      if (mode === 'in' && (ordW && isWord(c[k + 1], 'row') || isWord(c[k], 'row'))) {
        let idx = ordW, m = k + (ordW ? 2 : 1); if (!ordW && c[m]?.t === 'num') { idx = c[m].v; m++; }
        if (isWord(c[m], 'of')) { m++; while (isWord(c[m], 'the')) m++; const tn = c[m]?.v; if (ctx.tables?.[tn]) { place = { row: { table: tn, idx }, start: i, end: m + 1, ci }; break; } }
      }
      const each = isWord(c[j], 'each', 'every') && !isWord(c[j + 1], 'other');
      const r = readThings(ctx, c, each ? j + 1 : j); if (!r.things.length) continue;
      // "in the window" and "in the card" are the older words' own (a pattern drawn inside a zone): only things are places
      if (mode === 'in' && r.things.some(th => th.zone || th.name === 'card')) continue;
      let targets = [...r.things], absorb = 0;
      // a list that runs on past commas: "under the aa-display, the aa-body and the aa-mono"
      while (r.i >= c.length && cl[ci + 1 + absorb]) {
        const nx = cl[ci + 1 + absorb], st = isWord(nx[0], 'and') ? 1 : 0, r2 = readThings(ctx, nx, st);
        if (r2.things.length && r2.i === nx.length) { targets.push(...r2.things); absorb++; } else break;
      }
      let setName = null;
      if (each) { const raw = c.slice(j + 1, r.i).filter(t => t.t === 'word' && !isWord(t, 'the')).map(t => t.v).join('-'); setName = ctx.sets?.has(raw) ? raw : ctx.resolve(raw); targets = members(ctx, setName) || targets; }
      place = { mode, targets, each, setName, absorb, ...p, start: i, end: r.i, ci };
      // "in the cover, at the top left" or "at the top left of the cover" inside the same clause
      for (let m = r.i; m < c.length; m++) if (c[m]?.t === 'word' && H.has(c[m].v)) { anchorOf([c[m].v], place); place.end = m + 1; }
      break;
    }
  }
  if (!place) return { toks, place: null };
  const c = cl[place.ci]; cl[place.ci] = [...c.slice(0, place.start), ...c.slice(place.end)];
  for (let k = 1; k <= (place.absorb || 0); k++) cl[place.ci + k] = [];
  // the details that belong to it: "20 in", "40 apart", "at the bottom left", "centred", "aligned to the left edges"
  for (let ci = place.ci + 1; ci < cl.length; ci++) {      // only what follows it: "in a row, 180 apart" before it is the row's
    const q = cl[ci], ws = q.filter(t => t.t === 'word').map(t => t.v), n = q.find(t => t.t === 'num');
    if (n && q.length <= 4 && ws.length && ws.every(w => ['in', 'inset', 'from', 'the', 'edge', 'edges', 'margin'].includes(w)) && ws.some(w => w === 'in' || w === 'inset' || w === 'edge' || w === 'edges')) { place.inset = ctx.px(n); cl[ci] = []; continue; }
    if (n && q.length <= 3 && ws.some(w => ['apart', 'away', 'gap', 'below', 'above', 'between'].includes(w)) && ws.every(w => ['apart', 'away', 'gap', 'of'].includes(w))) { place.gap = ctx.px(n); cl[ci] = []; continue; }
    if (isWord(q[0], 'at') && isWord(q[1], 'the') && q.slice(2).every(t => t.t === 'word' && H.has(t.v))) { anchorOf(q.slice(2).map(t => t.v), place); cl[ci] = []; continue; }
    if (q.length === 1 && isWord(q[0], 'centred', 'centered')) { place.cross = 'center'; cl[ci] = []; continue; }
    if (isWord(q[0], 'lined') && isWord(q[1], 'up')) { const w2 = ws.find(w => ['left', 'right', 'centre', 'center'].includes(w)); place.cross = w2 === 'centre' ? 'center' : w2; cl[ci] = []; }
  }
  return { toks: join(cl.filter((q, k) => q.length || k === 0)), place };
}

// move what was just made (or named) to its place
export function placeThings(ctx, news, place) {
  if (!news.length) return;
  const B = union(news.map(th => boxOf(ctx, th))); if (!B) return;
  const page = place.targets.length === 1 && place.targets[0].ref === 'card' && place.targets[0].name === 'card';
  const T = union(place.targets.map(th => boxOf(ctx, th)));
  if (!T) ctx.err('that has no size to place things by');
  const inset = place.inset ?? (page ? (ctx.margin ?? 0) : 0), gap = place.gap ?? (ctx.gap ?? 24);
  const texts = news.every(th => th.L?.kind === 'text'), al = texts ? news[0].L.align || 'center' : 'center';
  // under or above a left-aligned heading means lined up on its left edge; otherwise the new thing's own alignment, else centred
  const tAl = place.targets.length === 1 && place.targets[0].L?.kind === 'text' ? place.targets[0].L.align || 'center' : null;
  const cross = place.cross || (place.h === 'left' || place.h === 'right' ? place.h : tAl && tAl !== 'center' ? tAl : texts ? (al === 'left' ? 'left' : al === 'right' ? 'right' : 'center') : 'center');
  let dx = 0, dy = 0;
  const cx = (b) => (b[0] + b[2]) / 2, cy = (b) => (b[1] + b[3]) / 2;
  // under a band that runs edge to edge, things line up with the page margin rather than the edge itself
  const card = ctx.doc.card.rect, m = ctx.margin ?? 0;
  const edgeL = place.mode !== 'in' && T[0] <= card[0] + 1 ? m : 0, edgeR = place.mode !== 'in' && T[2] >= card[0] + card[2] - 1 ? m : 0;
  const alignX = (how) => how === 'left' ? T[0] + (place.mode === 'in' ? inset : edgeL) - B[0] : how === 'right' ? T[2] - (place.mode === 'in' ? inset : edgeR) - B[2] : cx(T) - cx(B);
  const alignY = (how) => how === 'top' ? T[1] + (place.mode === 'in' ? inset : 0) - B[1] : how === 'bottom' ? T[3] - (place.mode === 'in' ? inset : 0) - B[3] : cy(T) - cy(B);
  if (place.mode === 'in') {
    dx = alignX(place.h || (page && texts && !place.c && al !== 'center' ? al : 'center'));
    dy = alignY(place.v || 'middle');
    // centred by eye: a lone triangle, arrow or star sits where it looks centred
    if (news.length === 1 && !place.h && !place.v) { const o = optical(news[0]); if (o) { dx -= o[0]; dy -= o[1]; } }
  } else if (place.mode === 'below' || place.mode === 'above') {
    dy = place.mode === 'below' ? T[3] + gap - B[1] : T[1] - gap - B[3];
    dx = alignX(cross);
  } else {
    dx = place.mode === 'right' ? T[2] + gap - B[0] : T[0] - gap - B[2];
    // words beside words share a baseline; anything else is centred on the middle
    const tt = place.targets.length === 1 && place.targets[0].L?.kind === 'text' ? place.targets[0].L : null;
    dy = !place.v && tt && texts && news.length === 1 && !tt.lines && !news[0].L.lines ? tt.at[1] - news[0].L.at[1] : alignY(place.v || 'middle');
  }
  for (const th of news) nudge(ctx, th, dx, dy);
}

// what a sentence made: the layers and objects that were not there before it
const snapshot = (ctx) => ({ L: new Set(Object.keys(ctx.doc.layers)), E: new Set(Object.keys(ctx.doc.elements || {})) });
const made = (ctx, snap) => [
  ...Object.keys(ctx.doc.layers).filter(n => !snap.L.has(n)).map(n => thing(ctx, n)),
  ...Object.keys(ctx.doc.elements || {}).filter(n => !snap.E.has(n)).map(n => thing(ctx, n)),
].filter(Boolean);

// ── text styles and defaults ────────────────────────────────────────────────────────────────────────────────────────
const WRITE_KEYS = new Set(['size', 'tracking', 'leading', 'line-height', 'aligned', 'uppercase', 'lowercase', 'caps', 'capitals', 'wide', 'fit', 'curved', 'curve', 'turned', 'tilted']);
const keyOf = (c) => { const w = c.find(t => t.t === 'word'); if (!w) return null; if (w.v === 'aligned') return 'aligned'; if (isWord(c[0], 'at')) return 'at'; return w.v; };
// a style's clauses, sorted into the font, what Write takes, and what Make applies afterwards
function styleParts(ctx, toks) {
  const out = { font: null, write: [], make: [] };
  splitC(toks).filter(c => c.length).forEach((c, k) => {
    const key = keyOf(c);
    if (isWord(c[0], 'in') && !ctx.reg.colors.has(c[1]?.v) && c[1]?.t !== 'color') { out.font = c.slice(1); return; }
    if (k === 0 && c[0]?.t === 'word' && !WRITE_KEYS.has(key) && !findMakeWord(ctx, c)) { out.font = c; return; }
    if (WRITE_KEYS.has(key) || c.some(t => isWord(t, 'wide')) && c[0]?.t === 'num') out.write.push(c);
    else out.make.push(c);
  });
  return out;
}
const findMakeWord = (ctx, c) => c[0]?.t === 'color' || (c[0]?.t === 'word' && (ctx.reg.colors.has(c[0].v) || ctx.reg.words.has(c[0].v) || ctx.lets?.has(c[0].v) || ctx.reg.materials.has(c[0].v)));

// ── readable colour: light or dark, for whatever is under the thing ────────────────────────────────────────────────
const lum = (hex) => { const h = (hex || '#000000').replace('#', '').slice(0, 6), c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
function colourOfLook(ctx, lk, side, ref) {
  const head = lk?.slots?.fill?.head || '';
  const hexes = head.match(/#[0-9a-f]{6}/gi);
  if (hexes) return hexes.length === 1 ? hexes[0] : '#' + [0, 2, 4].map(i => Math.round(hexes.reduce((a, h) => a + parseInt(h.slice(1 + i, 3 + i), 16), 0) / hexes.length).toString(16).padStart(2, '0')).join('');
  const w = head.replace(/^(in|with)\s+/, '').trim();
  if (w && ctx.reg.colors.has(w)) return ctx.reg.colors.get(w);
  const m = w && ctx.reg.materials.get(w); if (m?.hex) return m.hex; if (m?.preview) return m.preview.hi;
  // a photo underneath: assume it is darker than the middle
  if ((ctx.doc.sides[side]?.steps || []).some(s => s.op === 'print' && s.area.terms.some(t => t.ref === ref))) return '#3a3a3a';
  return null;
}
function resolveReadable(ctx) {
  for (const [side, looks] of ctx.looks || []) {
    const order = ['card', ...Object.keys(ctx.doc.layers)];
    for (const [ref, lk] of looks) {
      const rd = lk.slots.fill?.readable; if (!rd) continue;
      const me = thing(ctx, ref), b = me && boxOf(ctx, me); if (!b) continue;
      const pt = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      let bg = null;
      for (const o of order.slice(0, Math.max(1, order.indexOf(ref)))) {
        const th = thing(ctx, o), ob = th && boxOf(ctx, th); if (!ob || pt[0] < ob[0] || pt[0] > ob[2] || pt[1] < ob[1] || pt[1] > ob[3]) continue;
        const col = colourOfLook(ctx, looks.get(o), side, o); if (col) bg = col;
      }
      bg ||= ctx.doc.canvas?.flat ? '#ffffff' : '#b9bdc2';
      const pick = rd.choices.slice().sort((x, y) => contrast(y, bg) - contrast(x, bg))[0];
      lk.slots.fill = { ...lk.slots.fill, head: 'in ' + pick, readable: undefined };
    }
  }
}

// ── tables ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function makeTable(ctx, toks) {
  const ci = toks.findIndex(t => isWord(t, 'called', 'named')); if (ci < 0) ctx.err('name the table', 'e.g. "Let there be a table called playlist, 1436 by 448, at 800 650, 8 rows, columns at 28, 78, 818 and 1398 right."');
  const name = toks[ci + 1]?.v;
  const coli = toks.findIndex(t => isWord(t, 'columns', 'column'));
  if (coli < 0) ctx.err('where are the columns?', 'e.g. "columns at 28, 78, 818 and 1398 right" (from the table\'s left edge; "right" after a number aligns that column right)');
  const cols = []; let k = coli + 1; if (isWord(toks[k], 'at')) k++;
  for (; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'num') cols.push({ x: ctx.px(t), align: 'left' });
    else if (isWord(t, 'right', 'centred', 'centered', 'center', 'centre') && cols.length) cols.at(-1).align = t.v === 'right' ? 'right' : 'center';
    else if (t.t === ',' || isWord(t, 'and', 'aligned')) continue;
    else break;
  }
  const rest = [...toks.slice(0, coli), ...toks.slice(k)];
  const bi = rest.findIndex((t, j) => isWord(t, 'by') && rest[j - 1]?.t === 'num' && rest[j + 1]?.t === 'num');
  if (bi < 0) ctx.err('how big is the table?', 'e.g. "1436 by 448"');
  const ati = rest.findIndex((t, j) => isWord(t, 'at') && rest[j + 1]?.t === 'num' && rest[j + 2]?.t === 'num');
  const m = { at: ati >= 0 ? [rest[ati + 1], rest[ati + 2]] : null };
  const [w, h] = [rest[bi - 1], rest[bi + 1]].map(ctx.px), rows = rest.findIndex(t => isWord(t, 'rows')), nrows = rows > 0 && rest[rows - 1].t === 'num' ? rest[rows - 1].v : null;
  if (!nrows) ctx.err('how many rows?', 'e.g. "8 rows"');
  const at = Array.isArray(m.at) && m.at.length === 2 ? m.at.map(ctx.px) : [ctx.doc.card.rect[0] + ctx.doc.card.rect[2] / 2, ctx.doc.card.rect[1] + ctx.doc.card.rect[3] / 2];
  const fi = rest.findIndex((t, j) => isWord(t, 'in') && j > ci + 1), font = fi >= 0 ? splitC(rest.slice(fi + 1))[0] : null;
  const x0 = at[0] - w / 2, y0 = at[1] - h / 2, rh = h / nrows, rowsSet = [];
  for (let r = 0; r < nrows; r++) {
    const n = `${name}-row-${r + 1}`;
    ctx.run(`draw a rectangle called ${n}, ${r1(w)} by ${r1(rh)}, at ${r1(at[0])} ${r1(y0 + r * rh + rh / 2)}.`, 'table');
    rowsSet.push(n);
  }
  ctx.addLayer(`${name}-row`, groupOf(rowsSet.flatMap(n => ctx.doc.layers[n].shapes.map(s => ({ ...s }))), { parts: rowsSet }));
  const all = ctx.doc.layers, keys = Object.keys(all).filter(x => x !== `${name}-row`), at0 = keys.indexOf(rowsSet[0]);
  const re = {}; keys.forEach((x, j) => { if (j === at0) re[`${name}-row`] = all[`${name}-row`]; re[x] = all[x]; }); for (const x of Object.keys(all)) delete all[x]; Object.assign(all, re);
  (ctx.sets ||= new Map()).set(`${name}-row`, rowsSet);
  ctx.sets.set(`${name}-words`, []); cols.forEach((_, j) => ctx.sets.set(`${name}-column-${j + 1}`, []));
  (ctx.tables ||= {})[name] = { x0, y0, rh, nrows, cols, font: font ? txt(font) : null, size: m.size && rest.some(t => isWord(t, 'size')) ? null : null, next: 1, textSize: (() => { const si = rest.findIndex(t => isWord(t, 'size')); return si >= 0 && rest[si + 1]?.t === 'num' ? rest[si + 1].v : 24; })() };
  ctx.it = `${name}-row`;
}
function writeRow(ctx, strs, row, extra, orig, s) {
  const T = ctx.tables[row.table];
  let idx = row.idx === 'next' ? T.next : row.idx === 'last' ? T.nrows : typeof row.idx === 'number' ? row.idx : ORD.indexOf(row.idx) + 1;
  if (!(idx >= 1 && idx <= T.nrows)) ctx.err(`the ${row.table} has ${T.nrows} rows`);
  if (strs.length > T.cols.length) ctx.err(`the ${row.table} has ${T.cols.length} columns, and this row has ${strs.length} entries`);
  T.next = Math.max(T.next, idx + 1);
  const base = T.y0 + (idx - 1) * T.rh + T.rh / 2, cells = [];
  strs.forEach((str, j) => {
    const col = T.cols[j], n = `${row.table}-${idx}-${j + 1}`;
    const src = `"${str.replace(/"/g, '\\"')}" called ${n}${T.font ? ' in ' + T.font : ''}, at ${r1(T.x0 + col.x)} ${r1(base + T.textSize * .35)}, size ${T.textSize}${col.align !== 'center' ? ', aligned ' + col.align : ''}${extra ? ', ' + extra : ''}`;
    orig(ctx, read(src), s);
    cells.push(n); ctx.sets.get(`${row.table}-column-${j + 1}`).push(n);
  });
  ctx.sets.set(`${row.table}-words-${idx}`, cells);
  const all = ctx.sets.get(`${row.table}-words`); if (!all.includes(`${row.table}-words-${idx}`)) { all.push(`${row.table}-words-${idx}`); all.sort((a, b) => +a.split('-').pop() - +b.split('-').pop()); }
  ctx.it = cells;
}

// ── the pack ───────────────────────────────────────────────────────────────────────────────────────────────────────
export default function layout(reg) {
  (reg.beforeArrange ||= []).push(resolveReadable);
  const more = (name, text, ex) => { const v = reg.verbs.get(name); v.help += ' ' + text; v.examples = [...(v.examples || []), ...ex]; };
  more('write', 'Placed by words: "in the sticker", "in the cover, at the bottom left, 120 in", "at the top right" (the page, inside the margin), "under the heading, 40 apart", "beside the play, 16 apart". "as a heading" uses a style made with "Let a heading be …". Several words at once give one label each: Write "a", "b" in each swatch. In a table: Write "1", "Lanterns" in the next row of the playlist.', ['Write "NEW!" called new in Lilita One, size 48, in the sticker.', 'Write "Oxblood", "Midnight", "Forest" in each swatch, at the bottom left, 20 in.']);
  more('let', 'Layout: "Let the margin be 120.", "Let text be in Jost, size 26, aligned left.", "Let a heading be Martian Mono, size 26, tracking 6, brass." Things can be placed when they are made ("…, under the heading, 40 apart", "…, pointing right, in the play"). A table: "Let there be a table called playlist, 1436 by 448, at 800 650, 8 rows, columns at 28, 78, 818 and 1398 right, in Jost, size 24."', ['Let the margin be 120.', 'Let a heading be Martian Mono, size 26, tracking 6, #c19a4b.', 'Let there be a triangle called icon, 22 big, pointing right, in the play.']);
  more('move', 'Or by words: "move the badge under the title, 20 apart", "move the badge in the panel, at the top right, 16 in".', ['move the badge beside the title, 24 apart.']);
  const wrap = (name, fn) => { const v = reg.verbs.get(name), orig = v.run.bind(v); v.run = (ctx, toks, s, ...more) => fn(ctx, toks, s, (c, t, ss) => orig(c, t, ss, ...more)); };

  reg.word({ words: ['readable', 'legible'], kind: 'colour', help: 'Light or dark, whichever reads best against what is under the thing. Give the two to choose from: "readable, bone or ink" (default white or near-black).', example: 'Make the labels readable, bone or ink.',
    apply(ctx, a) {
      if (!ctx.english) ctx.err('"readable" needs a piece that starts with "Let there be"', 'it looks at what ends up under the thing');
      const sub = (t) => t.t === 'word' && ctx.lets?.has(t.v) ? ctx.vars.get(t.v).value : [t];
      const cols = [...a.rest, ...a.mods.flat()].flatMap(sub).map(t => t.t === 'color' ? t.v : t.t === 'word' ? ctx.reg.colors.get(t.v) : null).filter(Boolean);
      const choices = cols.length >= 2 ? cols : ['#ffffff', '#111111'];
      a.mods.length = 0;
      a.slot('fill', { verb: 'enamel', head: 'in ' + choices[0], mods: [], readable: { choices } });
    }, greedy: true });

  // Write: styles, defaults, several labels at once, table rows, and placement
  wrap('write', (ctx, toks, s, orig) => {
    let { toks: t, place } = takePlacement(ctx, toks);
    // "as a heading"
    let style = null;
    const ai = t.findIndex((x, k) => isWord(x, 'as') && isWord(t[k + 1], 'a', 'an', 'the') && ctx.styles?.has(t[k + 2]?.v));
    if (ai >= 0) { style = ctx.styles.get(t[ai + 2].v); t = [...t.slice(0, ai), ...t.slice(ai + 3)]; }
    // "called x" may come in any clause: bring it next to the words
    { const ki = t.findIndex((x, k) => isWord(x, 'called', 'named') && t[k - 1]?.t !== 'str' && t[k + 1]?.t === 'word');
      if (ki > 0) { const nm = t.slice(ki, ki + 2), rest = [...t.slice(0, ki), ...t.slice(ki + 2)].filter((x, k, arr) => !(x.t === ',' && (arr[k + 1]?.t === ',' || k === arr.length - 1)));
        const lastStr = rest.reduce((m, x, k) => x.t === 'str' ? k : m, -1); t = [...rest.slice(0, lastStr + 1), ...nm, ...rest.slice(lastStr + 1)]; } }
    const strs = t.filter(x => x.t === 'str'), firstAfter = t.findIndex(x => x.t === 'str') + strs.length;
    // build one sentence's clauses: the default text style, then the named style, then what the writer said
    const layers = [ctx.styles?.get('text'), style].filter(Boolean).map(st => styleParts(ctx, st));
    const own = t.slice(t.lastIndexOf(strs.at(-1)) + 1);   // everything after the last of the words
    // own clauses: [called x] [in font], mods…
    const ownCl = splitC(own);
    const first = ownCl[0] || [];
    const writerKeys = new Set(ownCl.slice(1).map(keyOf).filter(Boolean));
    if (writerKeys.has('fit')) writerKeys.add('size');      // a fitted headline sizes itself
    if (writerKeys.has('size')) writerKeys.add('fit');
    const hasFont = first.some(x => isWord(x, 'in')) || ownCl.slice(1).some(c => isWord(c[0], 'in'));
    let font = null; for (const L of layers) if (L.font) font = L.font;
    const extra = []; for (const L of layers) for (const c of L.write) { const k = keyOf(c); if (!writerKeys.has(k)) { writerKeys.add(k); extra.push(c); } }
    const makes = layers.flatMap(L => L.make);
    const build = (str, nm) => {
      const f0 = first.filter(x => !(x.t === 'word' && x.v === 'called') && x !== first[first.findIndex(y => isWord(y, 'called')) + 1]);
      const called = first.findIndex(y => isWord(y, 'called'));
      const nameToks = nm ? [{ t: 'word', v: 'called', raw: 'called' }, { t: 'word', v: nm, raw: nm }] : called >= 0 ? first.slice(called, called + 2) : [];
      const fontToks = hasFont ? f0 : font ? [{ t: 'word', v: 'in', raw: 'in' }, ...font] : [];
      return [str, ...nameToks, ...fontToks, ...extra.flatMap(c => [{ t: ',' }, ...c]), ...ownCl.slice(1).flatMap(c => c.length ? [{ t: ',' }, ...c] : [])];
    };
    const style_make = (names) => { if (makes.length) applyWords(ctx, names.map(n => thing(ctx, n)).filter(Boolean), join(makes), 'make'); };
    if (place?.row) {
      const extraTxt = [...extra.filter(c => !['aligned', 'size', 'at'].includes(keyOf(c))), ...ownCl.slice(1).filter(c => c.length)].map(txt).join(', ');   // the table sets position, size and alignment
      writeRow(ctx, strs.map(x => x.v), place.row, extraTxt, (c, tk, ss) => orig(c, tk, ss), s); style_make([].concat(ctx.it)); return;
    }
    if (strs.length > 1) {
      // one label for each: Write "a", "b", "c" under the swatches
      if (!place) ctx.err('say where each goes', 'e.g. Write "Oxblood", "Midnight", "Forest" under the swatches, 20 apart.');
      const targets = place.targets.length === 1 ? (members(ctx, place.targets[0].name) || place.targets) : place.targets;
      if (targets.length !== strs.length) ctx.err(`${strs.length} labels for ${targets.length} things`, 'give one label for each');
      const called = first.findIndex(y => isWord(y, 'called')), base = called >= 0 ? first[called + 1].v : `${place.setName || place.targets[0].name}-label`;
      const names = [];
      strs.forEach((str, k) => {
        const nm = `${base}-${k + 1}`, snap = snapshot(ctx);
        orig(ctx, build(str, nm), s);
        placeThings(ctx, made(ctx, snap), { ...place, targets: [targets[k]] });
        names.push(nm);
      });
      (ctx.sets ||= new Map()).set(base, names);
      style_make(names); ctx.it = base; return;
    }
    const snap = snapshot(ctx);
    orig(ctx, build(strs[0], null), s);
    const news = made(ctx, snap);
    style_make(news.map(n => n.name));
    if (place) placeThings(ctx, news, place);
  });

  // Let there be …, and Let a style be …, Let the margin be …, Let text be …, Let there be a table …
  wrap('let', (ctx, toks, s, orig) => {
    if (isWord(toks[0], 'there')) {
      let k = isWord(toks[1], 'be', 'is', 'are') ? 2 : 1; while (isWord(toks[k], 'a', 'an')) k++;
      if (isWord(toks[k], 'table', 'list')) return makeTable(ctx, toks.slice(k + 1));
      // patterns (vine, dots, crosshatch, …) take "in the strip" as where they grow; plain shapes take it as where they go
      const g = ctx.reg.match(ctx.reg.generators, toks.filter(x => x.t === 'word' && !isWord(x, 'there', 'be', 'is', 'are', 'a', 'an')), 0, 3);
      const plain = !g || SHAPES.has(g.entry.name) || toks.some(x => x.t === 'str') || isWord(toks[k], 'card', 'paper', 'plate', 'sheet', 'piece', 'sticker');
      let { toks: t, place } = takePlacement(ctx, toks, { noIn: !plain });
      // "pointing right" or "turned 90" when it is made: turned first, then placed (so it is centred as it will be seen)
      let turn = null; const cl = splitC(t);
      for (let ci = 1; ci < cl.length; ci++) {
        const q = cl[ci];
        if (isWord(q[0], 'pointing', 'facing') && q[1]?.t === 'word') { const d = { up: 0, right: 90, down: 180, left: -90 }[q[1].v]; if (d == null) ctx.err('pointing which way?', 'up, down, left or right'); turn = { dir: q[1].v, d }; cl[ci] = []; }
        else if (isWord(q[0], 'turned', 'rotated', 'tilted') && q[1]?.t === 'num' && q.length === 2 + (isWord(q[2], 'degrees') ? 1 : 0)) { turn = { deg: q[1].v }; cl[ci] = []; }
      }
      t = join(cl.filter((q, k) => q.length || k === 0));
      const snap = snapshot(ctx); orig(ctx, t, s);
      const news = made(ctx, snap);
      if (turn) for (const th of news.filter(x => x.L?.shapes)) {
        // shapes point up when made, except an arrow, which points right
        const deg = turn.deg ?? (th.L.generator === 'arrow' ? turn.d - 90 : turn.d);
        if (deg) say(ctx, th.side, `turn the ${th.name} ${deg} degrees.`);
      }
      if (place) placeThings(ctx, news, place);
      return;
    }
    const be = toks.findIndex(x => isWord(x, 'be'));
    if (be > 0) {
      const art = isWord(toks[0], 'a', 'an'), the = isWord(toks[0], 'the'), name = toks.slice(art || the ? 1 : 0, be).filter(x => x.t === 'word').map(x => x.v).join('-');
      const val = toks.slice(be + 1);
      if (the && (name === 'margin' || name === 'margins')) { ctx.margin = ctx.px(val.find(x => x.t === 'num')); return; }
      if (the && (name === 'gap' || name === 'spacing')) { ctx.gap = ctx.px(val.find(x => x.t === 'num')); return; }
      if (['text', 'all-text', 'words', 'all-words', 'writing'].includes(name)) { (ctx.styles ||= new Map()).set('text', val); return; }
      if (art) { if (ctx.reg.verbs.has(name)) ctx.err(`"${name}" already means something`); (ctx.styles ||= new Map()).set(name, val); return; }
    }
    return orig(ctx, toks, s);
  });

  // draw (the older word, and what "Let there be" uses) and move take a placement too
  wrap('draw', (ctx, toks, s, orig) => {
    const { toks: t, place } = takePlacement(ctx, toks, { noIn: true });   // the older word keeps "in the strip" for patterns
    const snap = snapshot(ctx); orig(ctx, t, s);
    if (place) placeThings(ctx, made(ctx, snap), place);
  });
  wrap('move', (ctx, toks, s, orig) => {
    const r = readThings(ctx, toks, 0);
    if (r.things.length) { const { place } = takePlacement(ctx, toks.slice(r.i)); if (place && !place.row) { placeThings(ctx, r.things, place); ctx.it = r.things.length > 1 ? r.things.map(x => x.name) : r.things[0].name; return; } }
    return orig(ctx, toks, s);
  });
}
