// One SVG drawing → one godtongue stamp. Pure JavaScript with no DOM, so the browser (admin library page)
// and Node (bulk runs) share it. Output: the godtongue definition, the parts it made, and a small preview SVG.
//
// What it keeps: every filled outline, holes included (they are outlines too), curves flattened to straight
// sides, transforms applied. What it drops: strokes, unfilled shapes, a full-canvas background.
// Disjoint pieces of one drawing become separate parts (so each can be coloured on its own); touching or
// nested outlines stay in one part.

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
const SIZE = 200;              // the stamp's own box, centred on 0 0, in godtongue pixels
const INK = '#1d1b2e';         // default colour of every part; recolour per piece

// ---- path data ------------------------------------------------------------------------------------------

function parsePath(d) {
  const subs = [];             // { pts: [[x,y]…], closed: bool }
  let cur = null, cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  let ctrl = null;             // last curve's control point, { t: 'C'|'Q', x, y }, for S and T
  let i = 0;
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => {
    ws(); NUM.lastIndex = i; const m = NUM.exec(d);
    if (!m) throw new Error(`number expected at ${i}`);
    i += m[0].length; return +m[0];
  };
  const flag = () => { ws(); const c = d[i]; if (c !== '0' && c !== '1') throw new Error('arc flag expected'); i++; return c === '1'; };
  const line = (px, py) => {
    if (!cur) { cur = { pts: [[x, y]], closed: false }; subs.push(cur); }
    cur.pts.push([px, py]); x = px; y = py;
  };
  const cubic = (x1, y1, x2, y2, px, py) => {
    const len = Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(px - x2, py - y2);
    const n = Math.max(3, Math.min(48, Math.ceil(len / 6)));
    const [x0, y0] = [x, y];
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      line(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * px,
           u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * py);
    }
    ctrl = { t: 'C', x: x2, y: y2 };
  };
  const quad = (x1, y1, px, py) => {
    const len = Math.hypot(x1 - x, y1 - y) + Math.hypot(px - x1, py - y1);
    const n = Math.max(3, Math.min(40, Math.ceil(len / 6)));
    const [x0, y0] = [x, y];
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      line(u * u * x0 + 2 * u * t * x1 + t * t * px, u * u * y0 + 2 * u * t * y1 + t * t * py);
    }
    ctrl = { t: 'Q', x: x1, y: y1 };
  };
  const arc = (rx, ry, phi, fa, fs, px, py) => {
    if (x === px && y === py) return;
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) return line(px, py);
    const cp = Math.cos(phi * Math.PI / 180), sp = Math.sin(phi * Math.PI / 180);
    const dx = (x - px) / 2, dy = (y - py) / 2;
    const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let co = Math.sqrt(Math.max(0, num2 / den));
    if (fa === fs) co = -co;
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = cp * cxp - sp * cyp + (x + px) / 2, cy = sp * cxp + cp * cyp + (y + py) / 2;
    const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(dt) / (Math.PI / 24)));
    for (let k = 1; k <= n; k++) {
      const t = t1 + dt * k / n;
      line(cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp);
    }
    ctrl = null;
  };

  for (;;) {
    ws();
    if (i >= d.length) break;
    if (/[A-Za-z]/.test(d[i])) cmd = d[i++];
    else if (!cmd || cmd === 'Z' || cmd === 'z') throw new Error('path data needs a command before the numbers');
    const rel = cmd !== cmd.toUpperCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    const prev = ctrl;
    if (C !== 'C' && C !== 'S' && C !== 'Q' && C !== 'T') ctrl = null;
    if (C === 'Z') { if (cur) cur.closed = true; cur = null; x = sx; y = sy; ctrl = null; cmd = ''; continue; }
    if (C === 'M') {
      const px = num() + ox, py = num() + oy;
      cur = { pts: [[px, py]], closed: false }; subs.push(cur);
      x = sx = px; y = sy = py;
      cmd = rel ? 'l' : 'L';                        // further pairs after a move are lines
      continue;
    }
    if (C === 'L') line(num() + ox, num() + oy);
    else if (C === 'H') line(num() + ox, y);
    else if (C === 'V') line(x, num() + oy);
    else if (C === 'C') { const a = num() + ox, b = num() + oy, c = num() + ox, e = num() + oy, px = num() + ox, py = num() + oy; cubic(a, b, c, e, px, py); }
    else if (C === 'S') {
      const [a, b] = prev && prev.t === 'C' ? [2 * x - prev.x, 2 * y - prev.y] : [x, y];
      const c = num() + ox, e = num() + oy, px = num() + ox, py = num() + oy;
      cubic(a, b, c, e, px, py);
    }
    else if (C === 'Q') { const a = num() + ox, b = num() + oy, px = num() + ox, py = num() + oy; quad(a, b, px, py); }
    else if (C === 'T') {
      const [a, b] = prev && prev.t === 'Q' ? [2 * x - prev.x, 2 * y - prev.y] : [x, y];
      const px = num() + ox, py = num() + oy;
      quad(a, b, px, py);
    }
    else if (C === 'A') { const rx = num(), ry = num(), phi = num(), fa = flag(), fs = flag(), px = num() + ox, py = num() + oy; arc(rx, ry, phi, fa, fs, px, py); }
    else throw new Error(`unknown path command ${cmd}`);
  }
  return subs.filter((s) => s.pts.length > 1);
}

// ---- the drawing: elements → polygons --------------------------------------------------------------------

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function matrixOf(t) {
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  for (const m0 of (t || '').matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    const v = m0[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let k;
    if (m0[1] === 'matrix') k = v;
    else if (m0[1] === 'translate') k = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (m0[1] === 'scale') k = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    else { const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); k = [c, s, -s, c, 0, 0]; }
    m = mul(m, k);
  }
  return m;
}

function ellipsePts(cx, cy, rx, ry) {
  const pts = [], n = 40;
  for (let k = 0; k < n; k++) { const t = (k / n) * 2 * Math.PI; pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
  return pts;
}

// returns [{ pts, closed }] in the drawing's own units, transforms applied
function collect(svg) {
  const vb = (svg.match(/viewBox\s*=\s*"([^"]+)"/) || [])[1];
  let view;
  if (vb) { const v = vb.trim().split(/[\s,]+/).map(Number); view = { x: v[0], y: v[1], w: v[2], h: v[3] }; }
  else {
    const w = +(svg.match(/\bwidth\s*=\s*"([\d.]+)/) || [])[1] || 512, h = +(svg.match(/\bheight\s*=\s*"([\d.]+)/) || [])[1] || 512;
    view = { x: 0, y: 0, w, h };
  }
  const subs = [], notes = [];
  const tags = svg.match(/<(path|rect|circle|ellipse|polygon|polyline)\b[^>]*>/g) || [];
  for (const tag of tags) {
    const a = attrs(tag);
    if (a.fill === 'none' || a.display === 'none' || a.opacity === '0' || /fill\s*:\s*none/.test(a.style || '')) continue;
    const m = matrixOf(a.transform), ap = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    let rings = [];
    if (tag.startsWith('<path')) {
      try { rings = parsePath(a.d || '').map((s) => ({ pts: s.pts.map(([x, y]) => ap(x, y)), closed: true })); }
      catch (e) { notes.push(`skipped a path: ${e.message}`); continue; }
    } else if (tag.startsWith('<rect')) {
      const x = +a.x || 0, y = +a.y || 0, w = +a.width || 0, h = +a.height || 0;
      rings = [{ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([p, q]) => ap(p, q)), closed: true }];
    } else if (tag.startsWith('<circle')) {
      rings = [{ pts: ellipsePts(+a.cx || 0, +a.cy || 0, +a.r || 0, +a.r || 0).map(([p, q]) => ap(p, q)), closed: true }];
    } else if (tag.startsWith('<ellipse')) {
      rings = [{ pts: ellipsePts(+a.cx || 0, +a.cy || 0, +a.rx || 0, +a.ry || 0).map(([p, q]) => ap(p, q)), closed: true }];
    } else {
      const nums = (a.points || '').trim().split(/[\s,]+/).map(Number);
      const pts = []; for (let k = 0; k + 1 < nums.length; k += 2) pts.push(ap(nums[k], nums[k + 1]));
      rings = [{ pts, closed: true }];
    }
    subs.push(...rings);
  }
  // a background that covers the whole canvas is not part of the drawing
  const kept = subs.filter((s) => {
    if (s.pts.length > 5) return true;
    const b = bbox(s.pts);
    return !(b.w >= view.w * 0.95 && b.h >= view.h * 0.95);
  });
  return { view, subs: kept, notes };
}

// ---- geometry --------------------------------------------------------------------------------------------

function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function area(pts) {
  let s = 0;
  for (let k = 0; k < pts.length; k++) { const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2;
}

function inside(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function crosses(A, B) {
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i], a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b1 = B[j], b2 = B[(j + 1) % B.length];
      const d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0]);
      if (d === 0) continue;
      const t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d;
      const u = ((b1[0] - a1[0]) * (a2[1] - a1[1]) - (b1[1] - a1[1]) * (a2[0] - a1[0])) / d;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
    }
  }
  return false;
}

function overlapBox(a, b) { return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h; }

function touching(A, B) {
  if (!overlapBox(bbox(A.pts), bbox(B.pts))) return false;
  return crosses(A.pts, B.pts) || inside(A.pts[0], B.pts) || inside(B.pts[0], A.pts);
}

// Ramer–Douglas–Peucker for a closed ring: cut it at its first point and the point farthest from it, simplify both halves
function simplify(pts, eps) {
  // drop repeated points (a closed path often ends on its first point)
  const p = pts.filter((q, k) => k === 0 || Math.hypot(q[0] - pts[k - 1][0], q[1] - pts[k - 1][1]) > 1e-6);
  if (p.length > 1 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) <= 1e-6) p.pop();
  if (p.length < 4) return p;
  const ring = [...p, p[0]];
  const far = (() => { let best = 0, bd = -1; for (let k = 1; k < p.length; k++) { const d = Math.hypot(p[k][0] - p[0][0], p[k][1] - p[0][1]); if (d > bd) { bd = d; best = k; } } return best; })();
  const keep = new Uint8Array(ring.length);
  keep[0] = 1; keep[far] = 1; keep[ring.length - 1] = 1;
  const rec = (a, b) => {
    let max = 0, idx = -1;
    const [x1, y1] = ring[a], [x2, y2] = ring[b];
    const L = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    for (let k = a + 1; k < b; k++) {
      const [x, y] = ring[k];
      const d = Math.abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / L;
      if (d > max) { max = d; idx = k; }
    }
    if (max > eps && idx > 0) { keep[idx] = 1; rec(a, idx); rec(idx, b); }
  };
  rec(0, far); rec(far, ring.length - 1);
  return ring.slice(0, -1).filter((_, k) => keep[k]);
}

// ---- the stamp -------------------------------------------------------------------------------------------

const fmt = (v) => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? '0' : String(r); };
const dataOf = (pts) => {
  const [head, ...rest] = pts;
  return `from ${fmt(head[0])} ${fmt(head[1])}` + rest.map(([x, y]) => ` to ${fmt(x)} ${fmt(y)}`).join('');
};

/**
 * svgToStamp(svg, { name }) → { ok, gt, name, parts: [{ name, area }], svg, notes }
 * name becomes the definition's word, e.g. "house" → "define a house as: … end."
 */
export function svgToStamp(svg, { name } = {}) {
  const notes = [];
  if (!name || !/^[a-z][a-z0-9-]{0,39}$/.test(name)) return { ok: false, notes: ['the name must be lowercase words joined by hyphens'] };
  let c;
  try { c = collect(svg); }
  catch (e) { return { ok: false, notes: [`could not read the drawing: ${e.message}`] }; }
  notes.push(...c.notes);
  if (!c.subs.length) return { ok: false, notes: [...notes, 'no filled shapes in this drawing'] };

  // to the stamp's own box, centred on 0 0
  const s = SIZE / Math.max(c.view.w, c.view.h);
  const cx = c.view.x + c.view.w / 2, cy = c.view.y + c.view.h / 2;
  const subs = c.subs.map((r) => ({ pts: r.pts.map(([x, y]) => [(x - cx) * s, (y - cy) * s]) }));
  for (const r of subs) r.pts = simplify(r.pts, 0.3);
  const usable = subs.filter((r) => r.pts.length >= 3 && area(r.pts) >= 1);
  if (!usable.length) return { ok: false, notes: [...notes, 'nothing left after tidying the outlines'] };

  // parts: outlines that touch or nest form one part; disjoint pieces are separate parts
  const parent = usable.map((_, k) => k);
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (let a = 0; a < usable.length; a++) for (let b = a + 1; b < usable.length; b++) {
    if (touching(usable[a], usable[b])) parent[find(a)] = find(b);
  }
  const groups = new Map();
  usable.forEach((r, k) => { const g = find(k); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
  const ordered = [...groups.values()]
    .map((rings) => ({ rings, area: rings.reduce((t, r) => t + area(r.pts), 0) }))
    .sort((p, q) => q.area - p.area);
  const partNames = ordered.map((_, k) => (k === 0 ? 'body' : `piece-${k + 1}`));
  if (ordered.length > 40) return { ok: false, notes: [...notes, `${ordered.length} separate pieces: too many for one stamp`] };

  const defs = [];
  ordered.forEach((p, k) => {
    const body = p.rings.map((r) => dataOf(r.pts)).join(', then ');
    defs.push(`  draw a shape called ${partNames[k]} ${body}.`);
    defs.push(`  make the ${partNames[k]} ${INK}.`);
  });
  const gt = `define a ${name} as:\n${defs.join('\n')}\nend.\n`;

  // preview: the same outlines, drawn the way godtongue draws them (even-odd fill)
  const pathData = ordered.flatMap((p) => p.rings.map((r) => 'M' + r.pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join('L') + 'Z')).join('');
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -110 220 220"><path fill="${INK}" fill-rule="evenodd" d="${pathData}"/></svg>`;

  return {
    ok: true,
    name,
    gt,
    parts: ordered.map((p, k) => ({ name: partNames[k], area: Math.round(p.area) })),
    svg: preview,
    notes,
  };
}
