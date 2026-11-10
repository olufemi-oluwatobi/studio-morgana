// Shapes pack: the elements and manipulations every design is built from.
// Elements:      circle, ellipse, rectangle, star, spiral, shape (straight sides), line, curve (smooth, through points)
// Manipulations: move, turn, scale, mirror, flip, copy, hollow, fill, dash, group
// Objects:       "define a rose with $size 60 as: … end." then "place a rose at 620 900, size 90."
// An element is a layer whose geometry is kept as points, so every manipulation works on every element.
import { readMods, readName, isWord, dropArticles, num, flag, PREPS } from '../core/phrases.js';
import { placeCard, flipElement } from './elements.js';

const TAU = Math.PI * 2;
const r1 = (v) => Math.round(v * 10) / 10;

// ── geometry ──────────────────────────────────────────────────────────────────
const ellipse = (cx, cy, rx, ry, n = 96) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * TAU) * rx, cy + Math.sin(i / n * TAU) * ry]);
function rectangle(cx, cy, w, h, r = 0) {
  r = Math.min(r, w / 2, h / 2);
  if (r <= 0) return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
  const pts = [], k = 12;
  for (const [ox, oy, a0] of [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]])
    for (let i = 0; i <= k; i++) { const a = a0 + i / k * Math.PI / 2; pts.push([cx + ox + Math.cos(a) * r, cy + oy + Math.sin(a) * r]); }
  return pts;
}
const star = (cx, cy, n, R, r) => Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + i / (n * 2) * TAU, q = i % 2 ? r : R; return [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; });
function spiral(cx, cy, R, turns) { const n = Math.ceil(80 * turns), o = []; for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * TAU; o.push([cx + Math.cos(a) * R * (1 - t * .85), cy + Math.sin(a) * R * (1 - t * .85)]); } return o.reverse(); }
function smooth(P, closed, k = 14) {              // Catmull-Rom through every point
  if (P.length < 3) return P;
  const o = [], n = P.length, at = (i) => closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      o.push([0, 1].map(d => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  if (!closed) o.push(P.at(-1));
  return o;
}
export function bbox(shapes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
const centre = (shapes) => { const [x0, y0, x1, y1] = bbox(shapes); return [(x0 + x1) / 2, (y0 + y1) / 2]; };
const mapShapes = (shapes, f, ws = 1) => shapes.map(s => ({ ...s, pts: s.pts.map(f), width: s.width != null ? s.width * ws : s.width }));
const T = {
  move: (dx, dy) => ([x, y]) => [x + dx, y + dy],
  turn: (deg, [px, py]) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return ([x, y]) => [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c]; },
  scale: (k, [px, py], ky = k) => ([x, y]) => [px + (x - px) * k, py + (y - py) * ky],
  flipX: (ax) => ([x, y]) => [2 * ax - x, y],
  flipY: (ay) => ([x, y]) => [x, 2 * ay - y],
};
export function svgOf(shapes) {
  return shapes.map(s => {
    const d = 'M' + s.pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' L') + (s.closed ? ' Z' : '');
    return s.paint === 'stroke'
      ? `<path d="${d}" fill="none" stroke="#fff" stroke-width="${r1(s.width || 3)}" stroke-linecap="round" stroke-linejoin="round"${s.dash ? ` stroke-dasharray="${s.dash.join(' ')}"` : ''}/>`
      : `<path d="${d}" fill="#fff" fill-rule="nonzero"/>`;
  }).join('');
}
export function element(shapes, extra = {}) {
  const L = { kind: 'vector', shapes, generator: 'element', ...extra };
  return refresh(L);
}
function refresh(L) {
  L.svg = svgOf(L.shapes);
  const b = bbox(L.shapes);
  if (isFinite(b[0])) { L.path = { rect: b, r: 0 }; L.clip = L.shapes.filter(s => s.closed && s.paint !== 'stroke').map(s => 'M' + s.pts.map(p => p.map(r1).join(',')).join(' L') + ' Z').join(' ') || undefined; }
  return L;
}

// ── reading points and targets ────────────────────────────────────────────────
// "from 0 0 to 100 0 through 50 -40 to …" → { pts, through: [bool…] }
function readPoints(ctx, toks) {
  const out = [], smoothAt = [];
  let i = toks.findIndex(t => isWord(t, 'from')); if (i < 0) return null;
  let kind = 'from';
  while (i < toks.length) {
    if (isWord(toks[i], 'from', 'to', 'through', 'via')) { kind = toks[i].v; i++; continue; }
    if (toks[i].t === 'num' && toks[i + 1]?.t === 'num') { out.push([ctx.px(toks[i]), ctx.px(toks[i + 1])]); smoothAt.push(kind === 'through' || kind === 'via'); i += 2; continue; }
    if (toks[i].t === ',' || (toks[i].t === 'word' && !PREPS.has(toks[i].v))) break;
    i++;
  }
  return { pts: out, smooth: smoothAt.some(Boolean) };
}
// one or more element names: "the petal", "it", "the petals and the bud", "everything"
const TARGET_STOPS = new Set([...PREPS, 'by', 'called', 'as', 'with', 'up', 'down', 'left', 'right', 'upside', 'horizontally', 'vertically', 'apart', 'times']);
export function targets(ctx, toks, i = 0, stop = TARGET_STOPS) {
  const names = [];
  while (i < toks.length) {
    while (isWord(toks[i], 'the', 'a', 'an', 'and')) i++;
    if (isWord(toks[i], 'it', 'them')) { names.push(...[].concat(ctx.it || [])); i++; continue; }
    if (isWord(toks[i], 'everything', 'all')) { names.push(...(ctx.scope ? [...ctx.scope] : Object.keys(ctx.doc.layers).filter(n => ctx.doc.layers[n].shapes))); i++; continue; }
    if (toks[i]?.t !== 'word' || stop.has(toks[i].v)) break;
    const r = readName(toks, i, new Set([...stop, 'and'])); if (!r.name) break;
    names.push(resolve(ctx, r.name)); i = r.i;
  }
  if (!names.length) ctx.err('which element?', 'name it, or say "it"');
  return { names, i };
}
function resolve(ctx, name) {
  const L = ctx.doc.layers;
  for (const n of [name, name.replace(/ies$/, 'y'), name.replace(/es$/, ''), name.replace(/s$/, '')]) if (L[n]) return n;
  ctx.err(`there is no element called "${name}"`, ctx.suggest(name, Object.keys(L)) || 'draw it first');
}
const layerOf = (ctx, n) => { const L = ctx.doc.layers[n]; if (!L.shapes) ctx.err(`"${n}" is a ${L.generator || L.kind}, not an element you can reshape`); return L; };
const pivot = (ctx, mods, shapes) => Array.isArray(mods.around) ? mods.around.map(ctx.px) : (mods.in === 'place' || flag(mods, 'place') || ctx.inDefinition === false ? centre(shapes) : [0, 0]);   // "in place" = round its own centre
const deg = (t) => t?.t === 'num' ? t.v : null;

export default function shapes(reg) {
  // ── elements ────────────────────────────────────────────────────────────────
  const at = (ctx, m) => Array.isArray(m.at) ? m.at.map(ctx.px) : (ctx.inDefinition ? [0, 0] : [ctx.doc.card.rect[0] + ctx.doc.card.rect[2] / 2, ctx.doc.card.rect[1] + ctx.doc.card.rect[3] / 2]);
  const paintOf = (ctx, m) => (flag(m, 'hollow', 'outlined', 'stroked') || m.hollow != null) ? { paint: 'stroke', width: m.wide != null ? ctx.px(m.wide) : (m.hollow?.t === 'num' ? ctx.px(m.hollow) : 3) } : { paint: 'fill' };
  const el = (name, words, help, params, make) => reg.generator({ name, words, help, params, element: true, run: (ctx, m, nm, rest) => element(make(ctx, m, rest)) });

  el('circle', ['circles', 'dot', 'disc'], 'A circle. "40 big" is its radius.', { big: 20, at: '0 0' },
    (ctx, m) => { const [x, y] = at(ctx, m), r = m.big != null ? ctx.px(m.big) : m.wide != null ? ctx.px(m.wide) / 2 : 20; return [{ pts: ellipse(x, y, r, r), closed: true, ...paintOf(ctx, m.wide != null && !flag(m, 'hollow') ? { ...m, wide: undefined } : m) }]; });
  el('ellipse', ['ellipses', 'oval'], 'An ellipse, "W by H".', { size: '40 by 70', at: '0 0' },
    (ctx, m) => { const [x, y] = at(ctx, m), [w, h] = m.size ? m.size.map(ctx.px) : [40, 70]; return [{ pts: ellipse(x, y, w / 2, h / 2), closed: true, ...paintOf(ctx, m) }]; });
  el('rectangle', ['rect', 'square', 'box', 'rectangles'], 'A rectangle, "W by H", optional "corners 10".', { size: '100 by 60', corners: 0, at: '0 0' },
    (ctx, m) => { const [x, y] = at(ctx, m), [w, h] = m.size ? m.size.map(ctx.px) : [100, m.big ? ctx.px(m.big) : 60]; return [{ pts: rectangle(x, y, w, h, m.corners != null ? ctx.px(m.corners) : 0), closed: true, ...paintOf(ctx, m) }]; });
  el('star', ['stars', 'sparkle', 'sparkles'], 'A star: "5 points, 40 big, 16 inner".', { points: 5, big: 40, inner: 16, at: '0 0' },
    (ctx, m) => { const [x, y] = at(ctx, m), R = m.big != null ? ctx.px(m.big) : 40; return [{ pts: star(x, y, num(m.points, 5), R, m.inner != null ? ctx.px(m.inner) : R * .4), closed: true, ...paintOf(ctx, m) }]; });
  el('spiral', ['spirals', 'curl', 'swirl'], 'A spiral: "20 big, 1.5 turns". Drawn as a line.', { big: 20, turns: 1.5, wide: 3 },
    (ctx, m) => { const [x, y] = at(ctx, m); return [{ pts: spiral(x, y, m.big != null ? ctx.px(m.big) : 20, num(m.turns, 1.5)), closed: false, paint: 'stroke', width: m.wide != null ? ctx.px(m.wide) : 3 }]; });
  el('shape', ['polygon', 'outline shape'], 'A closed shape with straight sides: "from 0 0 to 100 0 to 50 80". Use "through" for smooth corners.', { from: 'points' },
    (ctx, m, rest) => { const P = readPoints(ctx, rest); if (!P || P.pts.length < 3) ctx.err('a shape needs at least three points', 'e.g. from 0 0 to 100 0 to 50 80'); return [{ pts: P.smooth ? smooth(P.pts, true) : P.pts, closed: true, ...paintOf(ctx, m) }]; });
  el('line', ['lines', 'stroke'], 'A straight line through points: "from 0 0 to 100 0, 4 wide".', { from: 'points', wide: 3 },
    (ctx, m, rest) => { const P = readPoints(ctx, rest); if (!P || P.pts.length < 2) ctx.err('a line needs two points', 'e.g. from 0 0 to 100 0'); return [{ pts: P.pts, closed: false, paint: 'stroke', width: m.wide != null ? ctx.px(m.wide) : 3 }]; });
  el('curve', ['curves', 'arc', 'wave'], 'A smooth curve through points: "from 0 0 through 40 -30 to 80 0". Add "closed" for a closed shape.', { from: 'points', wide: 3 },
    (ctx, m, rest) => {
      const P = readPoints(ctx, rest); if (!P || P.pts.length < 2) ctx.err('a curve needs points', 'e.g. from 0 0 through 40 -30 to 80 0');
      const closed = flag(m, 'closed', 'filled');
      return [{ pts: smooth(P.pts, closed), closed, ...(closed && !flag(m, 'hollow') ? { paint: 'fill' } : { paint: 'stroke', width: m.wide != null ? ctx.px(m.wide) : 3 }) }];
    });

  // ── manipulations ─────────────────────────────────────────────────────────
  const each = (ctx, toks, fn) => {
    const t = dropArticles(toks); const { names, i } = targets(ctx, t);
    const mods = readMods(t.slice(i));
    for (const n of names) { const L = layerOf(ctx, n); fn(L, mods, t.slice(i), n); refresh(L); }
    ctx.it = names.length > 1 ? names : names[0];
    return mods;
  };
  reg.verb({
    words: ['move', 'shift', 'slide'], help: 'Move elements: "to 620 900" (its centre), "by 10 -20", or "up by 40".',
    examples: ['move the petal up by 24.', 'move it to 620 900.', 'move the tail by -300 30.'],
    run(ctx, toks) {
      each(ctx, toks, (L, m, rest) => {
        let dx = 0, dy = 0; const dir = rest.find(t => isWord(t, 'up', 'down', 'left', 'right'));
        if (dir) { const n = ctx.px(rest.find(t => t.t === 'num') || { t: 'num', v: 0 }); ({ up: () => dy = -n, down: () => dy = n, left: () => dx = -n, right: () => dx = n })[dir.v](); }
        else if (Array.isArray(m.to)) { const [x, y] = m.to.map(ctx.px), [cx, cy] = centre(L.shapes); dx = x - cx; dy = y - cy; }
        else if (Array.isArray(m.by)) [dx, dy] = m.by.map(ctx.px);
        else ctx.err('move it where?', 'e.g. "move it up by 20", "move it to 620 900" or "move it by 10 -20"');
        L.shapes = mapShapes(L.shapes, T.move(dx, dy));
      });
    },
  });
  reg.verb({
    words: ['turn', 'rotate', 'spin', 'tilt'], help: 'Turn elements by degrees, round their centre (inside a definition: round 0 0) or "around x y".',
    examples: ['turn the plane 35 degrees.', 'turn the petal 72 degrees around 0 0.'],
    run(ctx, toks) {
      each(ctx, toks, (L, m, rest) => {
        const a = deg(rest.find(t => t.t === 'num')); if (a == null) ctx.err('turn it how far?', 'e.g. "turn it 30 degrees"');
        L.shapes = mapShapes(L.shapes, T.turn(a, pivot(ctx, m, L.shapes)));
      });
    },
  });
  reg.verb({
    words: ['scale', 'resize', 'grow-by', 'shrink'], help: 'Scale elements: "by 0.6", or "by 1.2 0.8" for width and height separately.',
    examples: ['scale the petals by 0.6.', 'scale it by 1.5 around 620 900.'],
    run(ctx, toks) {
      each(ctx, toks, (L, m) => {
        const k = [].concat(m.by ?? m._nums ?? []).map(x => num(x)); if (!k.length) ctx.err('scale it by how much?', 'e.g. "scale it by 0.6"');
        L.shapes = mapShapes(L.shapes, T.scale(k[0], pivot(ctx, m, L.shapes), k[1] ?? k[0]), Math.sqrt(Math.abs(k[0] * (k[1] ?? k[0]))));
      });
    },
  });
  reg.verb({
    words: ['flip'], help: 'Flip elements in place: left to right, or "upside down".',
    examples: ['flip the wing.', 'flip it upside down.'],
    run(ctx, toks) {
      if (flipElement(ctx, toks)) return;   // a placed card turns over in time
      each(ctx, toks, (L, m) => {
        const [cx, cy] = pivot(ctx, m, L.shapes);
        L.shapes = mapShapes(L.shapes, flag(m, 'upside', 'vertically', 'over') ? T.flipY(cy) : T.flipX(cx));
      });
    },
  });
  reg.verb({
    words: ['mirror'], help: 'Add a mirror image, making the element symmetric: across a vertical line (default) or "horizontally". "at 620" sets the line.',
    examples: ['mirror the wing.', 'mirror the tail at 0.', 'mirror the leaf horizontally.'],
    run(ctx, toks) {
      each(ctx, toks, (L, m) => {
        const horiz = flag(m, 'horizontally', 'vertically-down', 'top', 'bottom');
        const p = m.at != null ? (Array.isArray(m.at) ? m.at.map(ctx.px) : [ctx.px(m.at), ctx.px(m.at)]) : pivot(ctx, m, L.shapes);
        L.shapes = [...L.shapes, ...mapShapes(L.shapes, horiz ? T.flipY(p[1]) : T.flipX(p[0])).map(s => ({ ...s, pts: [...s.pts].reverse() }))];
      });
    },
  });
  reg.verb({
    words: ['copy', 'repeat', 'duplicate'], help: 'Copy elements: "5 times around 0 0" (a ring), "4 times, 120 apart" (a row), or once with changes ("scale 0.6, turn 36, called inner").',
    examples: ['copy the petal 5 times around 0 0.', 'copy the petals, scale 0.6, turn 36, called inner-petals.', 'copy the star 4 times, 90 apart.'],
    run(ctx, toks) {
      const t = dropArticles(toks), { names, i } = targets(ctx, t);
      let rest = t.slice(i), times = null;
      if (rest[0]?.t === 'num' && isWord(rest[1], 'times')) { times = rest[0].v; rest = rest.slice(2); }
      const m = readMods(rest);
      for (const n of names) {
        const L = layerOf(ctx, n), base = L.shapes;
        if (times && m.around != null) {           // ring
          const p = pivot(ctx, m, base); L.shapes = [];
          for (let k = 0; k < times; k++) L.shapes.push(...mapShapes(base, T.turn(k * 360 / times, p)));
          refresh(L); ctx.it = n; continue;
        }
        if (times) {                                // row
          const step = m.apart != null ? ctx.px(m.apart) : (bbox(base)[2] - bbox(base)[0]) * 1.2, down = flag(m, 'down', 'downwards', 'vertically');
          L.shapes = []; for (let k = 0; k < times; k++) L.shapes.push(...mapShapes(base, T.move(down ? 0 : k * step, down ? k * step : 0)));
          refresh(L); ctx.it = n; continue;
        }
        let s = base.map(x => ({ ...x }));           // one changed copy, a new element
        const p = pivot(ctx, m, s);
        if (m.scale != null) { const k = num(m.scale); s = mapShapes(s, T.scale(k, p), k); }
        if (m.turn != null || m.turned != null) s = mapShapes(s, T.turn(num(m.turn ?? m.turned), p));
        if (Array.isArray(m.by)) { const [dx, dy] = m.by.map(ctx.px); s = mapShapes(s, T.move(dx, dy)); }
        if (flag(m, 'hollow') || m.hollow != null) s = s.map(x => ({ ...x, paint: 'stroke', width: m.wide != null ? ctx.px(m.wide) : (m.hollow?.t === 'num' ? ctx.px(m.hollow) : 3) }));
        let name = m.name || `${n}-2`; for (let k = 3; !m.name && ctx.doc.layers[name]; k++) name = `${n}-${k}`;
        ctx.addLayer(name, element(s));
      }
    },
  });
  reg.verb({
    words: ['hollow', 'stroke'], help: 'Draw elements as lines instead of solid: "4 wide".',
    examples: ['hollow the petals, 3 wide.'],
    run(ctx, toks) { each(ctx, toks, (L, m) => { L.shapes = L.shapes.map(s => ({ ...s, paint: 'stroke', width: m.wide != null ? ctx.px(m.wide) : 3 })); }); },
  });
  reg.verb({
    words: ['solidify', 'make-solid'], help: '(the opposite of hollow; also "fill it.")', examples: ['solidify the rose.', 'fill it.'],
    run(ctx, toks) { each(ctx, toks, (L) => { L.shapes = L.shapes.map(s => ({ ...s, paint: s.closed ? 'fill' : s.paint })); }); },
  });
  reg.verb({
    words: ['dash'], help: 'Turn lines into dashes: "18 on 12 off".',
    examples: ['dash the trail, 18 on 12 off.'],
    run(ctx, toks) { each(ctx, toks, (L, m) => { L.shapes = L.shapes.map(s => ({ ...s, paint: 'stroke', width: s.width || 3, dash: [m.on != null ? ctx.px(m.on) : 16, m.off != null ? ctx.px(m.off) : 12] })); }); },
  });
  reg.verb({
    words: ['group', 'join', 'combine'], help: 'Gather elements into one: "group the wings and the keel as plane."',
    examples: ['group the wings and the keel as plane.'],
    run(ctx, toks) {
      const t = dropArticles(toks), { names, i } = targets(ctx, t, 0, new Set([...PREPS, 'as', 'called', 'into']));
      const nm = readName(t, i + 1, new Set()).name || 'group';
      ctx.addLayer(nm, element(names.flatMap(n => layerOf(ctx, n).shapes.map(s => ({ ...s })))));
    },
  });

  // ── objects: define once, place many ──────────────────────────────────────
  reg.verb({
    words: ['place', 'put', 'stamp'],
    help: 'Place a defined object (see "define a … as:"), with its settings: "place a rose at 620 900, size 90, petals 7, turned 15." Several: "place 3 roses from 300 1300, 160 apart."',
    examples: ['place a rose called big-rose at 620 1250, size 120, turned 10.', 'place 3 roses from 380 1500, 240 apart, size 50.'],
    run(ctx, toks, s) {
      const t = dropArticles(toks); let count = 1;
      if (isWord(t[0], 'card', 'canvas')) return placeCard(ctx, toks);   // a card file on a stage
      if (t[0]?.t === 'num') count = t.shift().v;
      const words = []; let k = 0; while (t[k]?.t === 'word' && !['called', 'named', ...PREPS].includes(t[k].v)) words.push(t[k++].v);
      let obj = null, used = 0;
      for (let n = words.length; n >= 1 && !obj; n--) for (const cand of [words.slice(0, n).join('-'), words.slice(0, n).join('-').replace(/s$/, '')]) if (ctx.objects.has(cand)) { obj = ctx.objects.get(cand); used = n; break; }
      if (!obj) {
        if (ctx.reg.match(ctx.reg.generators, t, 0, 3)) return ctx.reg.verbs.get('draw').run(ctx, toks, s);
        ctx.err(`nothing called "${words.join(' ')}" is defined`, ctx.suggest(words.join('-'), [...ctx.objects.keys()]) || 'define it first: "define a rose with $size 60 as: … end."');
      }
      const m = readMods(t.slice(used));
      const base = Array.isArray(m.from) ? m.from.map(ctx.px) : Array.isArray(m.at) ? m.at.map(ctx.px) : at(ctx, {});
      const step = m.apart != null ? ctx.px(m.apart) : 200;
      const names = [];
      for (let c = 0; c < count; c++) {
        let name = m.name ? (count > 1 ? `${m.name}-${c + 1}` : m.name) : obj.name;
        for (let q = 2; !m.name && ctx.doc.layers[name]; q++) name = `${obj.name}-${q}`;
        place(ctx, obj, m, name, [base[0] + (flag(m, 'down', 'vertically') ? 0 : c * step), base[1] + (flag(m, 'down', 'vertically') ? c * step : 0)]);
        names.push(name);
      }
      ctx.it = names.length > 1 ? names : names[0];
    },
  });
}

// run an object's recipe in its own space round 0 0, then turn, scale and move the result into place
function place(ctx, obj, m, name, [x, y]) {
  const saved = new Map(), before = new Set(Object.keys(ctx.doc.layers));
  for (const p of obj.params) {
    saved.set(p.name, ctx.vars.get(p.name));
    const v = m[p.name] ?? m[p.name.replace(/s$/, '')];
    ctx.vars.set(p.name, { value: v == null ? p.value : [].concat(v).map(t => (t.t ? t : { t: 'num', v: t, unit: null })) });
  }
  const wasIn = ctx.inDefinition, wasIt = ctx.it, wasScope = ctx.scope;
  ctx.inDefinition = true; ctx.scope = null;
  try { ctx.run(obj.body, `${obj.name}`); }
  finally { for (const [k, v] of saved) v ? ctx.vars.set(k, v) : ctx.vars.delete(k); ctx.inDefinition = wasIn; ctx.scope = wasScope; ctx.it = wasIt; }
  const fresh = Object.keys(ctx.doc.layers).filter(n => !before.has(n));
  if (!fresh.length) ctx.err(`"${obj.name}" drew nothing`);
  const turn = num(m.turned ?? m.turn ?? m.rotated, 0), k = num(m.scaled, 1), flip = flag(m, 'mirrored', 'flipped');
  const fx = (p) => { let q = p; if (flip) q = [-q[0], q[1]]; q = T.scale(k, [0, 0])(q); q = T.turn(turn, [0, 0])(q); return [q[0] + x, q[1] + y]; };
  const all = [];
  for (const n of fresh) {
    const L = ctx.doc.layers[n]; delete ctx.doc.layers[n];
    if (L.shapes) { L.shapes = mapShapes(L.shapes, fx, k); refresh(L); all.push(...L.shapes.map(s => ({ ...s }))); }
    else if (L.kind === 'text' || L.kind === 'signature') { const key = L.at ? 'at' : 'center'; L[key] = fx(L[key]); }
    ctx.doc.layers[`${name}-${n}`] = L;
  }
  ctx.addLayer(name, element(all, { object: obj.name, parts: fresh.map(n => `${name}-${n}`) }));
}
