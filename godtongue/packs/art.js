// Art pack: vector generators (ported from the Marilyn v6 art script) and the verbs that call them.
// A generator returns a layer: { kind: 'vector', svg, path?, points?, clip? } and may return extra
// sub-layers ({ extra: { groove: layer } } → "<name>-groove").
//   path   { rect: [x0, y0, x1, y1], r }   something you can go "along" or "around"
//   points [[x, y, r], …]                  settings you can put rims or beads around
//   clip   'd'                             a filled shape other generators can fill "inside"
import fs from 'node:fs';
import { readMods, isWord, dropArticles, num, flag, readName } from '../core/phrases.js';

// ── geometry ──────────────────────────────────────────────────────────────────
const f1 = (v) => Math.round(v * 10) / 10;
export const rr = (x0, y0, x1, y1, r) => `M${f1(x0 + r)},${f1(y0)} H${f1(x1 - r)} Q${f1(x1)},${f1(y0)} ${f1(x1)},${f1(y0 + r)} V${f1(y1 - r)} Q${f1(x1)},${f1(y1)} ${f1(x1 - r)},${f1(y1)} H${f1(x0 + r)} Q${f1(x0)},${f1(y1)} ${f1(x0)},${f1(y1 - r)} V${f1(y0 + r)} Q${f1(x0)},${f1(y0)} ${f1(x0 + r)},${f1(y0)} Z`;
const pl = (pts) => 'M' + pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' L');
function bez(p0, p1, p2, p3, n = 60) {
  const o = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]]); }
  return o;
}
function spiral(end, prev, r0, turns = 1.35, n = 70, sign = 1) {
  let dx = end[0] - prev[0], dy = end[1] - prev[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  const cx = end[0] - dy * sign * r0, cy = end[1] + dx * sign * r0, a0 = Math.atan2(end[1] - cy, end[0] - cx), o = [];
  for (let i = 1; i <= n; i++) { const t = i / n; o.push([cx + Math.cos(a0 + sign * t * turns * 2 * Math.PI) * r0 * (1 - .78 * t), cy + Math.sin(a0 + sign * t * turns * 2 * Math.PI) * r0 * (1 - .78 * t)]); }
  return o;
}
function taper(pts, w0, wm, w1) {
  const n = pts.length, L = [], R = [];
  pts.forEach(([x, y], i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, t = i / (n - 1);
    const w = t <= .5 ? w0 + (wm - w0) * (t / .5) ** .7 : wm + (w1 - wm) * ((t - .5) / .5) ** 1.3;
    L.push([x - dy / l * w / 2, y + dx / l * w / 2]); R.push([x + dy / l * w / 2, y - dx / l * w / 2]);
  });
  return pl([...L, ...R.reverse()]) + ' Z';
}
function perim([x0, y0, x1, y1], step) {   // points round a rectangle with outward normals
  const o = [];
  for (const [[ax, ay], [bx, by]] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]) {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.floor(L / step));
    for (let i = 0; i < n; i++) o.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n, (by - ay) / L, -(bx - ax) / L]);
  }
  return o;
}
const inset = ([x0, y0, x1, y1], d) => [x0 + d, y0 + d, x1 - d, y1 - d];

// where a generator goes: a layer's path, a zone or the card, nudged in or out
function pathOf(ctx, ref, mods, dflt = 'card') {
  ref = ref || dflt;
  let rect, r = 0;
  const L = ctx.doc.layers[ref], Z = ctx.doc.zones[ref];
  if (L?.path) ({ rect, r } = { rect: [...L.path.rect], r: L.path.r });
  else if (Z) { const [x, y, w, h] = Z.rect; rect = [x, y, x + w, y + h]; r = Z.r || 0; }
  else ctx.err(`"${ref}" has no outline to follow`, `use a zone (card, window) or a bezel/rule/band layer${ctx.suggest(ref, [...Object.keys(ctx.doc.layers), ...Object.keys(ctx.doc.zones)]) ? '; ' + ctx.suggest(ref, [...Object.keys(ctx.doc.layers), ...Object.keys(ctx.doc.zones)]) : ''}`);
  let d = 0;
  if (mods.in != null && !Array.isArray(mods.in) && mods.in.t === 'num') d += ctx.px(mods.in);
  if (mods.out != null) d -= ctx.px(mods.out);
  if (d) { rect = inset(rect, d); r = Math.max(0, r - d / 2); }
  return { rect, r, ref };
}
const cardRect = (ctx) => { const [x, y, w, h] = ctx.doc.card.rect; return [x, y, x + w, y + h]; };
function gapTest(ctx, mods, rect) {          // "leaving a gap at the top [360]"
  if (!mods.gap) return () => false;
  const size = mods.gapSize ? ctx.px(mods.gapSize) : 360, cx = (rect[0] + rect[2]) / 2, cy = (rect[1] + rect[3]) / 2, tol = 40;
  const sides = String(mods.gap).split('-').filter(s => ['top', 'bottom', 'left', 'right'].includes(s));
  return (x, y) => sides.some(s =>
    (s === 'top' && y < rect[1] + tol && Math.abs(x - cx) < size / 2) || (s === 'bottom' && y > rect[3] - tol && Math.abs(x - cx) < size / 2) ||
    (s === 'left' && x < rect[0] + tol && Math.abs(y - cy) < size / 2) || (s === 'right' && x > rect[2] - tol && Math.abs(y - cy) < size / 2));
}

export default function art(reg) {
  reg.generator({
    name: 'bezel', words: ['bar', 'border', 'bezels'],
    help: 'A heavy rounded bar round the card or a zone.',
    params: { around: 'card', in: '16 (from the card edge)', wide: 34, corners: 'follows the card' },
    run(ctx, m) {
      const base = m.around || m.along || 'card';
      const p = pathOf(ctx, base, { in: m.in ?? (m.out == null && base === 'card' ? 16 : null), out: m.out });
      const r = m.corners != null ? ctx.px(m.corners) : Math.max(8, p.r);
      const w = m.wide != null ? ctx.px(m.wide) : 34;
      return { kind: 'vector', svg: `<path d="${rr(...p.rect, r)}" fill="none" stroke="#fff" stroke-width="${w}"/>`, path: { rect: p.rect, r } };
    },
  });
  reg.generator({
    name: 'rule', words: ['keyline', 'line border', 'rules'],
    help: 'A thin line round the card or a zone.',
    params: { around: 'window', out: 0, wide: 4, corners: 'follows the zone' },
    run(ctx, m) {
      const p = pathOf(ctx, m.around || m.along, m, 'window');
      const r = m.corners != null ? ctx.px(m.corners) : Math.max(0, p.r);
      return { kind: 'vector', svg: `<path d="${rr(...p.rect, r)}" fill="none" stroke="#fff" stroke-width="${m.wide != null ? ctx.px(m.wide) : 4}"/>`, path: { rect: p.rect, r } };
    },
  });
  reg.generator({
    name: 'band', words: ['strip', 'bands'],
    help: 'A filled ring between two distances in from an outline; other patterns can fill inside it.',
    params: { around: 'card', from: 54, to: 126 },
    run(ctx, m) {
      const nums = [].concat(m.from ?? [], m.to ?? []).filter(t => t?.t === 'num');
      const [a, b] = nums.length >= 2 ? nums.map(ctx.px) : [54, 126];
      const p = pathOf(ctx, m.around || m.along, {}, 'card');
      const o = inset(p.rect, a), i = inset(p.rect, b);
      const d = `${rr(...o, Math.max(4, p.r - a / 2))} ${rr(...i, Math.max(4, p.r - b / 2))}`;
      return { kind: 'vector', svg: `<path d="${d}" fill="#fff" fill-rule="evenodd"/>`, clip: d, path: { rect: o, r: Math.max(4, p.r - a / 2) } };
    },
  });
  reg.generator({
    name: 'ironwork', words: ['scrolls', 'scrollwork', 'wrought iron'],
    help: 'Heavy tapered scrolls: corner hearts, side curls, crest and pendant. "without the crest", "without the sides" …',
    params: { around: 'card', weight: 1 },
    run(ctx, m) {
      const [dx0, dy0, dx1, dy1] = pathOf(ctx, m.around, {}, 'card').rect;
      const sx = (dx1 - dx0) / 1080, sy = (dy1 - dy0) / 1669, M = ([x, y]) => [dx0 + (x - 80) * sx, dy0 + (y - 80) * sy];
      const W = 1240, H = 1829, CX = 620, k = num(m.weight, 1);
      const strokes = [];
      const add4 = (pts, w0, wm, w1) => { for (const fx of [0, 1]) for (const fy of [0, 1]) strokes.push([pts.map(([x, y]) => M([fx ? W - x : x, fy ? H - y : y])), w0 * k, wm * k, w1 * k]); };
      const on = (w) => m[w] !== false;
      if (on('corners')) {
        const a = bez([360, 112], [250, 58], [140, 40], [92, 100]); add4([...a, ...spiral(a.at(-1), a.at(-3), 34, 1.35, 70, -1)], 12, 30, 9);
        const b = bez([112, 360], [58, 250], [40, 140], [100, 92]); add4([...b, ...spiral(b.at(-1), b.at(-3), 34, 1.35, 70, 1)], 12, 30, 9);
        add4(bez([210, 112], [190, 170], [150, 190], [112, 210]), 10, 16, 10);
      }
      if (on('sides')) {
        const s1 = bez([112, 700], [36, 760], [20, 860], [60, 914]); add4([...s1, ...spiral(s1.at(-1), s1.at(-3), 22, 1.2, 70, 1)], 12, 30, 6);
        const s2 = bez([112, 760], [170, 820], [176, 880], [150, 914]); add4([...s2, ...spiral(s2.at(-1), s2.at(-3), 16, 1.1, 70, -1)], 10, 16, 5);
      }
      const knobs = [];
      if (on('crest')) { const cr = bez([620, 112], [560, 150], [470, 150], [430, 104]); add4([...cr, ...spiral(cr.at(-1), cr.at(-3), 32, 1.4, 70, 1)], 26, 30, 9); }
      if (on('pendant')) for (const [y0, y1] of [[112, 6], [1717, 1823]]) { strokes.push([[[CX, y0], [CX, (y0 * 2 + y1) / 3], [CX, (y0 + y1 * 2) / 3], [CX, y1]].map(M), 30 * k, 26 * k, 3 * k]); knobs.push(M([CX, y0])); }
      const svg = strokes.map(([p, a, b, c]) => `<path d="${taper(p, a, b, c)}" fill="#fff"/>`).join('') + knobs.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(30 * k * sx)}" fill="#fff"/>`).join('');
      const groove = strokes.filter(s => s[2] >= 26 * k).map(([p]) => `<path d="${pl(p.slice(2, -6))}"/>`).join('');
      return { kind: 'vector', svg, extra: { groove: { kind: 'vector', svg: `<g fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round">${groove}</g>` } } };
    },
  });
  reg.generator({
    name: 'studs', words: ['stud', 'rhinestones', 'stones'],
    help: 'Round settings spaced along an outline. "clear of the corners and the middles" leaves room for ironwork.',
    params: { along: 'card', apart: 38, big: 11, clear: 'corners, middles' },
    run(ctx, m) {
      const p = pathOf(ctx, m.along || m.around, m, 'card'), [x0, y0, x1, y1] = p.rect;
      const step = m.apart != null ? ctx.px(m.apart) : 38, r = m.big != null ? ctx.px(m.big) : (m.size != null ? ctx.px(m.size) : 11);
      const C = cardRect(ctx), cx = (C[0] + C[2]) / 2, cy = (C[1] + C[3]) / 2, by = m.clearBy ? ctx.px(m.clearBy) : 320;
      const clear = new Set(m.clear || []);
      const gap = gapTest(ctx, m, p.rect);
      const pts = [];
      for (const [[ax, ay], [bx, byy]] of [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]]) {
        const L = Math.hypot(bx - ax, byy - ay), n = Math.max(1, Math.floor(L / step));
        for (let i = 0; i < n; i++) {
          const x = ax + (bx - ax) * i / n, y = ay + (byy - ay) * i / n;
          if (clear.has('corners') && (x < C[0] + by || x > C[2] - by) && (y < C[1] + by || y > C[3] - by)) continue;
          if (clear.has('middles') && ((Math.abs(y - cy) < 170 && (x < C[0] + 60 || x > C[2] - 60)) || (Math.abs(x - cx) < 150 && (y < C[1] + 80 || y > C[3] - 80)))) continue;
          if (gap(x, y)) continue;
          pts.push([x, y, r]);
        }
      }
      return { kind: 'vector', svg: pts.map(([x, y, rr_]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr_)}" fill="#fff"/>`).join(''), points: pts, path: { rect: p.rect, r: p.r } };
    },
  });
  reg.generator({
    name: 'jewels', words: ['jewel', 'gems', 'big stones'],
    help: 'Large stones at the corners and/or the middles of an outline.',
    params: { along: 'bezel or card', big: 24, at: 'corners and middles' },
    run(ctx, m) {
      const p = pathOf(ctx, m.along || m.around || m.of, m, 'card'), [x0, y0, x1, y1] = p.rect;
      const r = m.big != null ? ctx.px(m.big) : 24, where = String(m.at || 'corners-and-middles');
      const pts = [];
      if (where.includes('corner')) pts.push([x0, y0, r], [x1, y0, r], [x0, y1, r], [x1, y1, r]);
      if (where.includes('middle')) { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, q = r * .85; pts.push([cx, y0, q], [cx, y1, q], [x0, cy, q], [x1, cy, q]); }
      return { kind: 'vector', svg: pts.map(([x, y, rr_]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr_)}" fill="#fff"/>`).join(''), points: pts };
    },
  });
  reg.generator({
    name: 'rims', words: ['rim', 'collets', 'settings'],
    help: 'A ring under every stone of one or more layers ("around the studs and the jewels").',
    params: { around: 'studs', wide: 5 },
    run(ctx, m) {
      const refs = String(m.around || m.under || 'studs').split('-and-');
      const w = m.wide != null ? ctx.px(m.wide) : 5, pts = [];
      for (const ref of refs) {
        const L = ctx.doc.layers[ref];
        if (!L?.points) ctx.err(`"${ref}" has no stones to set rims around`, 'rims go around studs or jewels');
        pts.push(...L.points.map(([x, y, r]) => [x, y, r + w]));
      }
      return { kind: 'vector', svg: pts.map(([x, y, r]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#fff"/>`).join(''), points: pts };
    },
  });
  reg.generator({
    name: 'beads', words: ['bead'],
    help: 'Small beads between neighbouring stones of a layer.',
    params: { between: 'studs', big: 4.5 },
    run(ctx, m) {
      const ref = m.between || m.along || 'studs', L = ctx.doc.layers[ref];
      if (!L?.points) ctx.err(`"${ref}" has no stones to put beads between`);
      const r = m.big != null ? ctx.px(m.big) : 4.5, pts = L.points, o = [];
      for (let i = 0; i + 1 < pts.length; i++) { const [a, b] = [pts[i], pts[i + 1]]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 60) o.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, r]); }
      return { kind: 'vector', svg: o.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="#fff"/>`).join(''), points: o };
    },
  });
  reg.generator({
    name: 'vine', words: ['vines', 'rinceau', 'garland'],
    help: 'A waving vine with leaves and five-petal blossoms along an outline.',
    params: { along: 'card', in: 88, wave: 9, leavesEvery: 114, blossomsEvery: 228, gap: 'none' },
    run(ctx, m) {
      const p = pathOf(ctx, m.along || m.around, { ...m, in: m.in ?? ((m.along || m.around || 'card') === 'card' ? 88 : null) }, 'card');
      const P = perim(p.rect, 3), amp = m.wave != null ? ctx.px(m.wave) : 9, gap = gapTest(ctx, m, p.rect);
      const le = Math.max(4, Math.round((m.leavesEvery ? ctx.px(m.leavesEvery) : 114) / 3)), be = Math.max(4, Math.round((m.blossomsEvery ? ctx.px(m.blossomsEvery) : 228) / 3));
      const segs = []; let cur = [];
      const at = (i) => { const [x, y, nx, ny] = P[i]; const s = Math.sin(i * .055) * amp; return [x + nx * s, y + ny * s]; };
      P.forEach(([x, y], i) => { if (gap(x, y)) { if (cur.length) segs.push(cur); cur = []; return; } cur.push(at(i)); });
      if (cur.length) segs.push(cur);
      const parts = segs.map(s => `<path d="${pl(s)}"/>`);
      if (m.leaves !== false) for (let i = 30; i < P.length; i += le) {
        const [x, y, nx, ny] = P[i]; if (gap(x, y)) continue;
        const side = Math.floor(i / le) % 2 ? 1 : -1, [vx, vy] = at(i), tx = -ny, ty = nx;
        let dx = nx * side * .8 + tx * .6, dy = ny * side * .8 + ty * .6; const L_ = Math.hypot(dx, dy); dx /= L_; dy /= L_;
        const ex = vx + dx * 30, ey = vy + dy * 30, mx = (vx + ex) / 2, my = (vy + ey) / 2;
        parts.push(`<path d="M${f1(vx)},${f1(vy)} Q${f1(mx - dy * 11)},${f1(my + dx * 11)} ${f1(ex)},${f1(ey)} Q${f1(mx + dy * 11)},${f1(my - dx * 11)} ${f1(vx)},${f1(vy)} M${f1(vx + dx * 6)},${f1(vy + dy * 6)} L${f1(ex - dx * 6)},${f1(ey - dy * 6)}"/>`);
      }
      if (m.blossoms !== false) for (let i = 49; i < P.length; i += be) {
        const [x, y] = P[i]; if (gap(x, y)) continue;
        const [vx, vy] = at(i); let d = '';
        for (let k = 0; k < 5; k++) { const a = k / 5 * 2 * Math.PI + i; d += `M${f1(vx)},${f1(vy)} Q${f1(vx + Math.cos(a - .55) * 15)},${f1(vy + Math.sin(a - .55) * 15)} ${f1(vx + Math.cos(a) * 17)},${f1(vy + Math.sin(a) * 17)} Q${f1(vx + Math.cos(a + .55) * 15)},${f1(vy + Math.sin(a + .55) * 15)} ${f1(vx)},${f1(vy)} `; }
        parts.push(`<path d="${d}M${f1(vx + 3.5)},${f1(vy)} A3.5,3.5 0 1 1 ${f1(vx - 3.5)},${f1(vy)} A3.5,3.5 0 1 1 ${f1(vx + 3.5)},${f1(vy)}"/>`);
      }
      return { kind: 'vector', svg: `<g fill="none" stroke="#000" stroke-width="${m.wide != null ? ctx.px(m.wide) : 2.8}" stroke-linecap="round">${parts.join('')}</g>` };
    },
  });
  reg.generator({
    name: 'dots', words: ['dot row', 'dot rows', 'beading'],
    help: 'A row of dots along an outline ("in 60 120" for two rows).',
    params: { along: 'card', in: 60, apart: 13, big: 2.6 },
    run(ctx, m) {
      const rows = Array.isArray(m.in) ? m.in : [m.in ?? { t: 'num', v: 60, unit: null }];
      const step = m.apart != null ? ctx.px(m.apart) : 13, r = m.big != null ? ctx.px(m.big) : 2.6, o = [];
      for (const row of rows) {
        const p = pathOf(ctx, m.along || m.around, { in: row, out: m.out }, 'card'), gap = gapTest(ctx, m, p.rect);
        for (const [x, y] of perim(p.rect, step)) if (!gap(x, y)) o.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}"/>`);
      }
      return { kind: 'vector', svg: `<g fill="#000">${o.join('')}</g>` };
    },
  });
  reg.generator({
    name: 'crosshatch', words: ['hatch', 'hatching', 'cross hatch'],
    help: 'Fine diagonal crosshatch, clipped inside a band, zone or the card.',
    params: { inside: 'card', apart: 10, wide: 1.1 },
    run(ctx, m, name) {
      const step = m.apart != null ? ctx.px(m.apart) : 10, w = m.wide != null ? ctx.px(m.wide) : 1.1;
      const [W, H] = ctx.doc.card.grid, clip = clipOf(ctx, m.inside || 'card'), id = `${name}-clip`;
      const lines = []; for (let k = -H; k < W + H; k += step) lines.push(`M${k},0 L${k + H},${H}`, `M${k + H},0 L${k},${H}`);
      return { kind: 'vector', svg: `<clipPath id="${id}"><path fill-rule="evenodd" d="${clip}"/></clipPath><g clip-path="url(#${id})"><path d="${lines.join(' ')}" stroke="#000" stroke-width="${w}" fill="none"/></g>` };
    },
  });
  reg.generator({
    name: 'damask', words: ['filigree', 'brocade'],
    help: 'A mirror-symmetric scroll-and-leaf damask tiled on a half-drop grid, clipped inside an area.',
    params: { inside: 'card', apart: '190 by 240', wide: 2.6 },
    run(ctx, m, name) {
      const [cw, ch] = m.size ? m.size.map(ctx.px) : [190, 240], [W, H] = ctx.doc.card.grid, out = [];
      const motif = (cx, cy) => {
        for (const fx of [1, -1]) for (const fy of [1, -1]) {
          const T = (q) => q.map(([x, y]) => [cx + fx * x, cy + fy * y]);
          const sc = bez([0, -70], [34, -80], [68, -54], [54, -22]); out.push(pl(T([...sc, ...spiral(sc.at(-1), sc.at(-3), 15, 1.3, 70, -1)])));
          const s2 = bez([0, -38], [22, -40], [36, -22], [28, -6]); out.push(pl(T([...s2, ...spiral(s2.at(-1), s2.at(-3), 8, 1.2, 70, -1)])));
          out.push(pl(T(bez([0, -70], [14, -86], [10, -100], [0, -112], 20))) + ' ' + pl(T(bez([0, -112], [-10, -100], [-14, -86], [0, -70], 20))));
        }
        out.push(`M${cx},${cy - 24} L${cx + 14},${cy} L${cx},${cy + 24} L${cx - 14},${cy} Z`, `M${cx + 3.5},${cy} A3.5,3.5 0 1 1 ${cx - 3.5},${cy} A3.5,3.5 0 1 1 ${cx + 3.5},${cy}`);
      };
      let row = 0; for (let gy = 110; gy < H + ch; gy += ch, row++) for (let gx = 20 + (row % 2 ? cw / 2 : 0); gx < W + cw; gx += cw) motif(gx, gy);
      const id = `${name}-clip`, clip = clipOf(ctx, m.inside || 'card');
      return { kind: 'vector', svg: `<clipPath id="${id}"><path fill-rule="evenodd" d="${clip}"/></clipPath><g clip-path="url(#${id})" fill="none" stroke="#000" stroke-width="${m.wide != null ? ctx.px(m.wide) : 2.6}" stroke-linecap="round" stroke-linejoin="round"><path d="${out.join(' ')}"/></g>` };
    },
  });
  reg.generator({
    name: 'rays', words: ['sunburst', 'ray', 'sunrays'],
    help: 'Rays from the centre of a zone (or "from x y"), alternating thick and thin.',
    params: { count: 160, from: 'centre of the card', wide: 2.2 },
    run(ctx, m) {
      let c;
      if (Array.isArray(m.from)) c = m.from.map(ctx.px);
      else { const p = pathOf(ctx, typeof m.from === 'string' ? m.from : 'card', {}, 'card'); c = [(p.rect[0] + p.rect[2]) / 2, (p.rect[1] + p.rect[3]) / 2]; }
      const n = num(m.count, m._nums ? num(m._nums[0]) : 160), w = m.wide != null ? ctx.px(m.wide) : 2.2, r0 = 60, r1 = 900, o = [];
      for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; o.push(`<line x1="${f1(c[0] + Math.cos(a) * r0)}" y1="${f1(c[1] + Math.sin(a) * r0)}" x2="${f1(c[0] + Math.cos(a) * r1)}" y2="${f1(c[1] + Math.sin(a) * r1)}" stroke-width="${i % 2 ? w / 2 : w}"/>`); }
      return { kind: 'vector', svg: `<g stroke="#000" stroke-linecap="round">${o.join('')}</g>` };
    },
  });

  function clipOf(ctx, ref) {
    const L = ctx.doc.layers[ref];
    if (L?.clip) return L.clip;
    const p = pathOf(ctx, ref, {}, 'card');
    return rr(...p.rect, p.r);
  }

  // ── verbs that call generators ─────────────────────────────────────────────
  function drawRun(ctx, toks, s, mode) {
    let t = dropArticles(toks), pre = {};
    if (mode === 'fill' || (isWord(t[0], 'fill'))) {
      const w = t.findIndex(x => isWord(x, 'with'));
      pre.inside = readName(t, 0).name; t = t.slice(w + 1);
    }
    if (t[0]?.t === 'asset') return sketch(ctx, t);
    if (isWord(t[0], 'path')) return rawPath(ctx, t.slice(1));
    let count = null; if (t[0]?.t === 'num') count = t.shift();
    let hit = null, k = 0;
    for (; k < Math.min(3, t.length); k++) { hit = ctx.reg.match(ctx.reg.generators, t, k, 3); if (hit) break; }
    if (!hit) {
      const w = t.find(x => x.t === 'word')?.v || '';
      ctx.err(`nothing called "${w}" to draw`, ctx.suggest(w, [...ctx.reg.generators.keys()]) || `generators: ${ctx.reg.genList.map(g => g.name).join(', ')}`);
    }
    const g = hit.entry, mods = { ...pre, ...readMods(t.slice(k + hit.n)) };
    if (count) mods.count = count;
    let name = mods.name || g.name; if (!mods.name) { let n = 2; while (ctx.doc.layers[name]) name = `${g.name}-${n++}`; }
    const layer = g.run(ctx, mods, name, t.slice(k + hit.n));
    const { extra, ...main } = layer;
    ctx.addLayer(name, { ...main, generator: g.name });
    for (const [sub, l] of Object.entries(extra || {})) ctx.addLayer(`${name}-${sub}`, { ...l, generator: g.name });
    ctx.it = name;
  }
  function sketch(ctx, t) {
    const key = ctx.asset(t[0].v), m = readMods(t.slice(1));
    let svg = fs.readFileSync(ctx.doc.assets[key].path, 'utf8');
    svg = svg.replace(/<\?xml[^>]*>/, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    const at = Array.isArray(m.at) ? m.at.map(ctx.px) : [0, 0], sc = num(m.scaled ?? m.scale, 1);
    ctx.addLayer(m.name || key.replace(/\.\w+$/, '').replace(/[^\w-]/g, '-'), { kind: 'vector', svg: `<g transform="translate(${at[0]} ${at[1]}) scale(${sc})">${svg}</g>`, generator: 'sketch' });
  }
  function rawPath(ctx, t) {
    const s = t.find(x => x.t === 'str'); if (!s) ctx.err('a path needs its outline in quotes', 'e.g. draw a path called tag, "M100 100 L300 100 L200 260 Z", filled.');
    const m = readMods(t.filter(x => x !== s));
    const filled = !flag(m, 'stroked', 'outlined', 'lined');
    ctx.addLayer(m.name || 'path', { kind: 'vector', svg: filled ? `<path d="${s.v}" fill="#fff" fill-rule="evenodd"/>` : `<path d="${s.v}" fill="none" stroke="#000" stroke-width="${m.wide != null ? ctx.px(m.wide) : 4}" stroke-linecap="round"/>`, clip: filled ? s.v : undefined, generator: 'path' });
  }

  reg.verb({
    words: ['draw', 'grow', 'add', 'scatter', 'carve'],
    help: 'Draw a generator as a named layer: bezel, rule, band, ironwork, studs, jewels, rims, beads, vine, dots, crosshatch, damask, rays — or a path, or a drawing (@sketch.svg).',
    examples: ['draw a bezel called frame.', 'grow a vine along the card, 88 in, leaving a gap at the top.', 'draw @sketch-1.svg called heart.', 'draw a path called tag, "M100 100 L300 100 L200 260 Z".'],
    run: drawRun,
  });
}
