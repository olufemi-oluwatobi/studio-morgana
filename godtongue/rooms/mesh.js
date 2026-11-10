// Small triangle-mesh kit for furniture. A mesh is { p: [x,y,z,…], n: [nx,ny,nz,…], i: [a,b,c,…] }.
// Local frame: x = along the piece's length, y = up, z = towards its front.
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };

export function merge(...ms) {
  const out = { p: [], n: [], i: [] };
  for (const m of ms) { const o = out.p.length / 3; out.p.push(...m.p); out.n.push(...m.n); out.i.push(...m.i.map(k => k + o)); }
  return out;
}

// apply a 4x3 affine map: f(point) → point, g(normal) → normal
export function transform(m, f, g, flip = false) {
  const p = [], n = [];
  for (let k = 0; k < m.p.length; k += 3) { p.push(...f([m.p[k], m.p[k + 1], m.p[k + 2]])); n.push(...norm(g([m.n[k], m.n[k + 1], m.n[k + 2]]))); }
  const i = flip ? m.i.map((_, k) => m.i[k - (k % 3) + [0, 2, 1][k % 3]]) : m.i.slice();
  return { p, n, i };
}
export const translate = (m, [x, y, z]) => transform(m, q => [q[0] + x, q[1] + y, q[2] + z], v => v);
export const rotateX = (m, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const r = q => [q[0], c * q[1] - s * q[2], s * q[1] + c * q[2]]; return transform(m, r, r); };
export const rotateZ = (m, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const r = q => [c * q[0] - s * q[1], s * q[0] + c * q[1], q[2]]; return transform(m, r, r); };
export const scale = (m, [x, y, z]) => transform(m, q => [q[0] * x, q[1] * y, q[2] * z], v => [v[0] / x, v[1] / y, v[2] / z]);
// plain box with flat faces, from corner ranges
export function box(x0, x1, y0, y1, z0, z1) {
  const m = { p: [], n: [], i: [] };
  const F = [[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]]];
  for (const [a, b, c, d, n] of F) { const o = m.p.length / 3; m.p.push(...a, ...b, ...c, ...d); m.n.push(...n, ...n, ...n, ...n); m.i.push(o, o + 1, o + 2, o, o + 2, o + 3); }
  return m;
}
export const rotateY = (m, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const r = q => [c * q[0] + s * q[2], q[1], -s * q[0] + c * q[2]]; return transform(m, r, r); };

// Rounded box centred on the origin: every point of a subdivided cube is pulled onto the box of radius r.
export function roundedBox(w, h, d, r = 0.03, seg = 6, puff = 0) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const hx = w / 2, hy = h / 2, hz = d / 2, ix = hx - r, iy = hy - r, iz = hz - r;
  const m = { p: [], n: [], i: [] };
  const N = seg * 2 + 2;                     // grid steps per face edge: dense near the rounded edges
  const t = (k) => { const s = k / N * 2 - 1; return Math.sign(s) * Math.pow(Math.abs(s), 0.6); };
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1]];
  const H = [hx, hy, hz], I = [ix, iy, iz];
  for (const [a, b, c, sgn] of faces) {
    const base = m.p.length / 3;
    for (let u = 0; u <= N; u++) for (let v = 0; v <= N; v++) {
      const q = [0, 0, 0]; q[a] = t(u) * H[a]; q[b] = t(v) * H[b]; q[c] = sgn * H[c];
      const inner = q.map((x, k) => Math.max(-I[k], Math.min(I[k], x)));
      let nrm = norm(q.map((x, k) => x - inner[k]));
      if (nrm.every(x => x === 0)) nrm = [0, 0, 0].map((_, k) => k === c ? sgn : 0);
      const pt = inner.map((x, k) => x + nrm[k] * r);
      if (puff) {                            // cushions: a soft crown on the big faces
        const fu = Math.max(0, 1 - Math.pow(Math.abs(q[a]) / H[a], 2)), fv = Math.max(0, 1 - Math.pow(Math.abs(q[b]) / H[b], 2));
        pt[c] += sgn * puff * fu * fv;
      }
      m.p.push(...pt); m.n.push(...nrm);
    }
    for (let u = 0; u < N; u++) for (let v = 0; v < N; v++) {
      const k = base + u * (N + 1) + v, a1 = k + 1, b1 = k + N + 1, c1 = k + N + 2;
      m.i.push(k, b1, a1, a1, b1, c1);       // winding is not relied on: room meshes render two-sided with smooth normals
    }
  }
  return m;
}

// Cylinder or tapered leg along y from y0 to y1, radius r0 at the bottom and r1 at the top, with caps.
export function cylinder(r0, r1, y0, y1, seg = 20, caps = true) {
  const m = { p: [], n: [], i: [] };
  const slope = (r0 - r1) / (y1 - y0);
  for (let k = 0; k <= seg; k++) {
    const a = k / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), nn = norm([c, slope, s]);
    m.p.push(r0 * c, y0, r0 * s, r1 * c, y1, r1 * s); m.n.push(...nn, ...nn);
  }
  for (let k = 0; k < seg; k++) { const b = k * 2; m.i.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  if (caps) for (const [y, r, up] of [[y0, r0, -1], [y1, r1, 1]]) {
    if (r <= 0) continue;
    const c0 = m.p.length / 3; m.p.push(0, y, 0); m.n.push(0, up, 0);
    for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2; m.p.push(r * Math.cos(a), y, r * Math.sin(a)); m.n.push(0, up, 0); }
    for (let k = 0; k < seg; k++) up > 0 ? m.i.push(c0, c0 + k + 2, c0 + k + 1) : m.i.push(c0, c0 + k + 1, c0 + k + 2);
  }
  return m;
}

// Ellipsoid centred on the origin (leaves, globes)
export function ellipsoid(rx, ry, rz, seg = 16) {
  const m = { p: [], n: [], i: [] };
  for (let a = 0; a <= seg; a++) for (let b = 0; b <= seg * 2; b++) {
    const th = a / seg * Math.PI, ph = b / (seg * 2) * Math.PI * 2;
    const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
    m.p.push(rx * x, ry * y, rz * z); m.n.push(...norm([x / rx, y / ry, z / rz]));
  }
  const R = seg * 2 + 1;
  for (let a = 0; a < seg; a++) for (let b = 0; b < seg * 2; b++) { const k = a * R + b; m.i.push(k, k + 1, k + R, k + 1, k + R + 1, k + R); }
  return m;
}

// Hanging fabric: a sheet in the x-y plane with vertical folds, hanging from y = top down to y = top - h.
export function drape(w, h, folds = 6, depth = 0.05, seg = 80) {
  const m = { p: [], n: [], i: [] }, rows = 8;
  for (let a = 0; a <= seg; a++) for (let b = 0; b <= rows; b++) {
    const x = (a / seg - 0.5) * w, y = -b / rows * h, ph = a / seg * folds * Math.PI * 2;
    const z = Math.sin(ph) * depth * (0.8 + 0.2 * b / rows), dz = Math.cos(ph) * depth * folds * Math.PI * 2 / w;
    m.p.push(x, y, z); m.n.push(...norm([-dz, 0, 1]));
  }
  const R = rows + 1;
  for (let a = 0; a < seg; a++) for (let b = 0; b < rows; b++) { const k = a * R + b; m.i.push(k, k + R, k + 1, k + 1, k + R, k + R + 1); }
  return m;
}
