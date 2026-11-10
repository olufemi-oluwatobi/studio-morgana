// Room document → scene (the shared format both renderers read).
// Room space: e = metres east of the west wall, n = metres north of the south wall, h = height.
// World space (renderers): x = W - e, y = h, z = n. Right-handed, so facing north, east is on your right.
import { ROOM_MATERIALS } from './materials.js';
import { PIECES } from './pieces.js';
import { transform, merge } from './mesh.js';
export const FACING = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] };
export const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

export function buildScene(room) {
  const [W, D, H] = room.size, T = room.wallT;
  const mats = { ...room.materials };
  const prims = [];
  const world = (e, h, n) => [W - e, h, n];
  // axis-aligned box from room-space ranges
  const box = (name, e0, e1, h0, h1, n0, n1, mat) => {
    const a = world(e0, h0, n0), b = world(e1, h1, n1);
    prims.push({ name, type: 'box', min: [Math.min(a[0], b[0]), h0, Math.min(n0, n1)].map(r3), max: [Math.max(a[0], b[0]), h1, Math.max(n0, n1)].map(r3), mat });
  };

  // ── shell
  box('floor-base', -T, W + T, -T, -0.0008, -T, D + T, 'black');
  // the visible floor is one quad with real-world UVs (metres), so textures like planks keep their true size
  { const c = [[0, 0], [W, 0], [W, D], [0, D]].map(([e, n]) => world(e, 0, n));
    prims.push({ name: 'floor', type: 'mesh', mat: room.floor, p: c.flat().map(r3), n: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], i: [0, 1, 2, 0, 2, 3], uv: [0, 0, W, 0, W, D, 0, D].map(r3) }); }
  box('ceiling', -T, W + T, H, H + T, -T, D + T, room.ceiling);
  for (const wall of ['north', 'south', 'east', 'west']) buildWall(wall);
  function buildWall(wall) {
    const ns = wall === 'north' || wall === 'south';
    const len = ns ? W : D;
    // thickness range across the wall, and the along-wall range (east/west walls run past the corners)
    const across = { north: [D, D + T], south: [-T, 0], east: [W, W + T], west: [-T, 0] }[wall];
    const [a0, a1] = ns ? [0, W] : [-T, D + T];
    const seg = (name, s0, s1, h0, h1) => {
      if (s1 - s0 < 1e-6 || h1 - h0 < 1e-6) return;
      if (ns) box(name, s0, s1, h0, h1, across[0], across[1], room.walls);
      else box(name, across[0], across[1], h0, h1, s0, s1, room.walls);
    };
    const ops = room.openings.filter(o => o.wall === wall).map(o => ({ ...o, s0: o.at - o.width / 2, s1: o.at + o.width / 2 })).sort((p, q) => p.s0 - q.s0);
    let cur = a0, k = 0;
    for (const o of ops) {
      seg(`wall-${wall}-${k++}`, cur, o.s0, 0, H);
      seg(`wall-${wall}-${k++}`, o.s0, o.s1, 0, o.sill);
      seg(`wall-${wall}-${k++}`, o.s0, o.s1, o.sill + o.height, H);
      cur = o.s1;
      buildOpening(o, wall, across, ns);
    }
    seg(`wall-${wall}-${k++}`, cur, a1, 0, H);
    void len;
  }

  function buildOpening(o, wall, across, ns) {
    const inward = { north: -1, south: 1, east: -1, west: 1 }[wall];      // direction into the room, along the wall normal (room space)
    const outerFace = inward < 0 ? across[1] : across[0];
    const at = (d) => outerFace - inward * d;                              // d metres beyond the outer face
    const along = (s0, s1, h0, h1, d0, d1, mat, name) => {
      const [c0, c1] = [at(d0), at(d1)].sort((p, q) => p - q);
      if (ns) box(name, s0, s1, h0, h1, c0, c1, mat); else box(name, c0, c1, h0, h1, s0, s1, mat);
    };
    if (o.kind === 'window') {
      // frame: one mullion and one transom, set into the reveal
      const mid = o.at, tr = o.sill + o.height * 0.72;
      along(mid - 0.03, mid + 0.03, o.sill, o.sill + o.height, -0.07, -0.03, room.frame, `${o.name}-mullion`);
      along(o.s0, o.s1, tr, tr + 0.05, -0.07, -0.03, room.frame, `${o.name}-transom`);
      // daylight: a one-sided panel 0.8 m outside, 1 m larger all round, facing into the room
      const g = 1.0, d = 0.8;                                  // far enough out that the reveal never sees it up close
      const s0 = o.s0 - g, s1 = o.s1 + g, h0 = o.sill - g, h1 = o.sill + o.height + g, c = at(d);
      const p = (s, h) => ns ? world(s, h, c) : world(c, h, s);
      const corner = p(s0, h0), up = [0, h1 - h0, 0], sideEnd = p(s1, h0);
      const side = sideEnd.map((v, i) => v - corner[i]);
      // normal = cross(u, v) must point into the room
      const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const inW = ns ? [0, 0, inward] : [-inward, 0, 0];
      let [u, v] = [up, side];
      if (cr(u, v).reduce((acc, x, i) => acc + x * inW[i], 0) < 0) [u, v] = [v, u];
      prims.push({ name: `${o.name}-daylight`, type: 'rect', corner: corner.map(r3), u: u.map(r3), v: v.map(r3), mat: 'daylight', view: room.view, upAxis: u[1] !== 0 ? 'u' : 'v', out: inW.map(x => -x) });
    } else if (o.kind === 'door') {
      // a closed door leaf set back in the opening, with a brass handle on the room side
      along(o.s0, o.s1, 0, o.height, 0.04, 0.08, o.material, `${o.name}-leaf`);
      const hs = o.s1 - 0.08;
      along(hs - 0.06, hs, 1.0, 1.03, -0.02 + (-0.0), 0.04, 'brass', `${o.name}-handle`);
    }
  }

  // ── skirting along every wall, broken at doors
  if (room.skirting) {
    const { height: sh, depth: sd, material } = room.skirting;
    const runs = { north: [0, W], south: [0, W], east: [0, D], west: [0, D] };
    for (const [wall, [r0, r1]] of Object.entries(runs)) {
      const doors = room.openings.filter(o => o.wall === wall && o.kind === 'door').map(o => [o.at - o.width / 2, o.at + o.width / 2]).sort((a, b) => a[0] - b[0]);
      let cur = r0, k = 0;
      const put = (s0, s1) => {
        if (s1 - s0 < 1e-6) return;
        const name = `skirting-${wall}-${k++}`;
        if (wall === 'north') box(name, s0, s1, 0, sh, D - sd, D, material);
        if (wall === 'south') box(name, s0, s1, 0, sh, 0, sd, material);
        if (wall === 'east') box(name, W - sd, W, 0, sh, s0, s1, material);
        if (wall === 'west') box(name, 0, sd, 0, sh, s0, s1, material);
      };
      for (const [d0, d1] of doors) { put(cur, d0); cur = d1; }
      put(cur, r1);
    }
  }

  // pieces stand on a rug when their whole footprint is on it
  const extent = (p) => { const ew = p.facing === 'north' || p.facing === 'south'; const [a, b] = ew ? [p.length, p.depth] : [p.depth, p.length]; return [p.at[0] - a / 2, p.at[0] + a / 2, p.at[1] - b / 2, p.at[1] + b / 2]; };
  for (const p of room.pieces) if (p.kind === 'coffee-table') {
    const f = extent(p);
    const rug = room.pieces.find(r => r.kind === 'rug' && (() => { const g = extent(r); return f[0] >= g[0] && f[1] <= g[1] && f[2] >= g[2] && f[3] <= g[3]; })());
    p.standsOn = rug ? rug.thickness : 0;
  }

  // ── furniture: each piece is a set of meshes in its own frame, turned to its facing (plus any extra turn) and moved into place
  for (const p of room.pieces) {
    const f0 = FACING[p.facing], tr = (p.turned || 0) * Math.PI / 180;
    const f = [f0[0] * Math.cos(tr) + f0[1] * Math.sin(tr), -f0[0] * Math.sin(tr) + f0[1] * Math.cos(tr)], r = [f[1], -f[0]];
    const toRoom = (x, z) => [p.at[0] + x * r[0] + z * f[0], p.at[1] + x * r[1] + z * f[1]];
    const pt = ([x, y, z]) => { const [e, n] = toRoom(x, z); return world(e, y, n); };
    const lin = ([x, y, z]) => { const a = pt([x, y, z]), o = pt([0, 0, 0]); return [a[0] - o[0], a[1] - o[1], a[2] - o[2]]; };
    const det = (() => { const X = lin([1, 0, 0]), Y = lin([0, 1, 0]), Z = lin([0, 0, 1]); return X[0] * (Y[1] * Z[2] - Y[2] * Z[1]) - X[1] * (Y[0] * Z[2] - Y[2] * Z[0]) + X[2] * (Y[0] * Z[1] - Y[1] * Z[0]); })();
    const groups = new Map();
    p.lights = [];
    PIECES[p.kind](p, (mesh, mat, part) => {
      const key = `${mat}`;
      const m = transform(mesh, pt, lin, det < 0);
      groups.set(key, groups.has(key) ? merge(groups.get(key), m) : m);
      void part;
    });
    for (const [mat, m] of groups) prims.push({ name: `${p.name}-${mat}`, type: 'mesh', mat, p: m.p.map(r4), n: m.n.map(r4), i: m.i });
    for (const L of p.lights) { const [e, n] = toRoom(L.x, L.z); prims.push({ name: `${p.name}-light`, type: 'sphere', center: world(e, L.y, n).map(r3), radius: L.radius, mat: L.mat }); }
    delete p.lights;
  }

  mats.daylight = { base: [0, 0, 0], emit: room.daylight };
  mats['bulb-warm'] ??= { base: [0, 0, 0], emit: room.bulb };
  mats['bulb-lamp'] ??= { base: [0, 0, 0], emit: room.bulb.map(v => v * 0.6) };
  for (const p of prims) if (!mats[p.mat]) {
    if (!ROOM_MATERIALS[p.mat]) throw new Error(`no material "${p.mat}" for ${p.name}`);
    mats[p.mat] = ROOM_MATERIALS[p.mat];
  }
  for (const k of Object.keys(mats)) if (!prims.some(p => p.mat === k)) delete mats[k];
  const shots = room.shots.map(s => ({ ...s, origin: world(...s.from3).map(r3), target: world(...s.at3).map(r3) }));
  const first = shots[0] || { origin: world(W / 2, 1.25, 0.3), target: world(W / 2, 1.1, D), lens: 28 };
  return {
    materials: mats, prims,
    camera: { origin: first.origin, target: first.target, focal_mm: first.lens || 28, width: room.width, height: room.height },
    shots: shots.map(s => ({ name: s.name, origin: s.origin, target: s.target, focal_mm: s.lens, aspect: s.aspect || 'landscape' })),
    walks: (room.walks || []).map(w => ({ name: w.name, seconds: w.seconds, points: w.points.map(([e, n]) => world(e, w.height, n).map(r3)), look: w.look ? world(...w.look).map(r3) : null })),
    panoramas: (room.panoramas || []).map(p => ({ name: p.name, origin: world(...p.at3).map(r3) })),
    bounces: room.bounces, exposure: room.exposure,
  };
}

const r3 = (x) => Math.round(x * 10000) / 10000;
const r4 = (x) => Math.round(x * 100000) / 100000;

