// Furniture recipes. Each piece is built round its own centre on the floor:
// x along its length, y up, z towards its front. add(mesh, material, part) collects the parts.
import { roundedBox, cylinder, ellipsoid, drape, box, merge, translate, rotateX, rotateY, rotateZ } from './mesh.js';

const at = (m, x, y, z) => translate(m, [x, y, z]);

// a small seeded random, so the same file always gives the same books and leaves
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s >>>= 0) / 4294967296)); }

function upholstered(p, add, { arm, seats, backH = 0.42 }) {
  const L = p.length, D = p.depth, u = L / 2, v = D / 2, mat = p.material, legs = p.legs || 'walnut';
  add(at(roundedBox(L, 0.22, D, 0.03, 4), 0, 0.19, 0), mat, 'plinth');                              // 0.08 → 0.30
  for (const sx of [-1, 1]) add(at(roundedBox(arm, 0.36, D, 0.06, 6), sx * (u - arm / 2), 0.46, 0), mat, 'arm');   // to 0.64
  add(at(roundedBox(L - 0.02, backH, 0.2, 0.06, 6), 0, 0.30 + backH / 2, -v + 0.1), mat, 'back');
  const inner = L - 2 * arm, cw = inner / seats, sd = D - 0.2;
  for (let k = 0; k < seats; k++) {
    const x = -inner / 2 + cw * (k + 0.5);
    add(at(roundedBox(cw - 0.012, 0.16, sd - 0.02, 0.05, 6, 0.012), x, 0.38, -v + 0.2 + sd / 2), mat, 'seat');
    add(at(rotateX(roundedBox(cw - 0.012, 0.40, 0.15, 0.06, 6, 0.018), -12), x, 0.68, -v + 0.27), mat, 'cushion');
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(at(cylinder(0.022, 0.016, 0, 0.08, 14), sx * (u - 0.07), 0, sz * (v - 0.07)), legs, 'leg');
}

export const PIECES = {
  sofa(p, add) { upholstered(p, add, { arm: 0.18, seats: p.length >= 1.9 ? 3 : 2 }); },
  armchair(p, add) { upholstered(p, add, { arm: 0.14, seats: 1, backH: 0.48 }); },

  'coffee-table'(p, add) {
    const L = p.length, D = p.depth, h = p.height, s0 = p.standsOn || 0;
    add(at(roundedBox(L, 0.04, D, 0.012, 3), 0, h - 0.02, 0), p.material, 'top');
    add(at(roundedBox(L - 0.12, 0.02, D - 0.12, 0.006, 2), 0, s0 + 0.14, 0), p.material, 'shelf');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(at(cylinder(0.016, 0.016, s0, h - 0.04, 14), sx * (L / 2 - 0.05), 0, sz * (D / 2 - 0.05)), p.legs || 'brass', 'leg');
  },

  'side-table'(p, add) {
    const r = p.length / 2, h = p.height;
    add(cylinder(r, r, h - 0.03, h, 32), p.material, 'top');
    add(cylinder(0.018, 0.018, 0.02, h - 0.03, 14), p.legs || 'brass', 'stem');
    add(cylinder(r * 0.6, r * 0.6, 0, 0.02, 28), p.legs || 'brass', 'foot');
  },

  rug(p, add) { add(box(-p.length / 2, p.length / 2, 0, p.thickness, -p.depth / 2, p.depth / 2), p.material, 'rug'); },

  art(p, add) {
    const L = p.length, T = p.tall, c = p.centreHeight, d = p.depth;
    add(box(-L / 2, L / 2, c - T / 2, c + T / 2, -d / 2, d / 2), p.frame || 'black', 'frame');
    add(box(-L / 2 + 0.03, L / 2 - 0.03, c - T / 2 + 0.03, c + T / 2 - 0.03, -d / 2, d / 2 + 0.002), p.material, 'canvas');
  },

  bookshelf(p, add) {
    const L = p.length, D = p.depth, H = p.height, t = 0.025, rows = Math.max(3, Math.round(H / 0.36)), mat = p.material;
    add(box(-L / 2, -L / 2 + t, 0, H, -D / 2, D / 2), mat, 'side');
    add(box(L / 2 - t, L / 2, 0, H, -D / 2, D / 2), mat, 'side');
    add(box(-L / 2, L / 2, 0, 0.06, -D / 2, D / 2 - 0.02), mat, 'kick');
    add(box(-L / 2 + t, L / 2 - t, 0, H, -D / 2, -D / 2 + 0.012), mat, 'back');
    const R = rng(p.seed), pal = ['book-red', 'book-cream', 'book-blue', 'book-green', 'book-ochre', 'charcoal', 'book-cream', 'linen'];
    const gap = (H - 0.06 - t) / rows;
    for (let k = 0; k <= rows; k++) {
      const y = 0.06 + k * gap;
      add(box(-L / 2 + t, L / 2 - t, y, y + t, -D / 2 + 0.012, D / 2), mat, 'shelf');
      if (k === rows) break;
      let x = -L / 2 + t + 0.01; const end = L / 2 - t - 0.01;
      const stop = R() < 0.35 ? x + (end - x) * (0.4 + R() * 0.4) : end;   // some shelves half full
      while (x < stop) {
        const w = 0.018 + R() * 0.035, h = Math.min(gap - t - 0.03, 0.17 + R() * 0.13), dd = D - 0.06 - R() * 0.05;
        if (x + w > stop) break;
        add(box(x, x + w, y + t, y + t + h, -D / 2 + 0.02, -D / 2 + 0.02 + dd), pal[Math.floor(R() * pal.length)], 'book');
        x += w + (R() < 0.1 ? 0.04 : 0.002);
      }
      if (R() < 0.5 && stop < end - 0.15) add(at(ellipsoid(0.06, 0.06, 0.06, 10), (stop + end) / 2, y + t + 0.06, 0), 'ceramic', 'vase');
    }
  },

  plant(p, add) {
    const R = rng(p.seed), h = p.height;
    add(cylinder(0.11, 0.15, 0, 0.34, 28), p.pot || 'terracotta', 'pot');
    add(cylinder(0.135, 0.135, 0.30, 0.31, 28, true), 'soil', 'soil');
    const n = 28;
    for (let k = 0; k < n; k++) {
      const yaw = k * 137.5 + R() * 20, t = 6 + R() * 30, lift = 5 + R() * 45, len = 0.2 + R() * 0.16;
      const L = 0.08 + (h - 0.55) * (0.35 + 0.65 * k / n), rad = Math.PI / 180;
      add(at(rotateY(rotateZ(cylinder(0.004, 0.003, 0, L, 6, false), -t), yaw), 0, 0.30, 0), 'leaf-green', 'stem');
      const tip = [Math.cos(yaw * rad) * Math.sin(t * rad) * L, 0.30 + Math.cos(t * rad) * L, -Math.sin(yaw * rad) * Math.sin(t * rad) * L];
      const leaf = rotateY(rotateZ(at(ellipsoid(len / 2, 0.005, len * 0.24, 10), len / 2, 0, 0), lift), yaw);
      add(at(leaf, ...tip), 'leaf-green', 'leaf');
    }
  },

  'floor-lamp'(p, add) {
    add(cylinder(0.14, 0.13, 0, 0.025, 28), p.legs || 'brass', 'base');
    add(cylinder(0.011, 0.011, 0.025, 1.38, 12, false), p.legs || 'brass', 'pole');
    add(cylinder(0.22, 0.16, 1.32, 1.6, 36, false), p.material, 'shade');
    p.lights.push({ x: 0, y: 1.45, z: 0, radius: 0.045, mat: 'bulb-lamp' });
  },

  pendant(p, add) {
    const r = p.radius, ceil = p.ceiling, rel = (y) => y;
    add(cylinder(0.06, 0.06, ceil - 0.025, ceil, 24), 'brass', 'canopy');
    add(cylinder(0.004, 0.004, rel(p.height + r * 0.9), ceil - 0.025, 8, false), 'cord-black', 'cord');
    add(cylinder(0.022, 0.022, p.height + r * 0.85, p.height + r + 0.035, 16), 'brass', 'cap');
    p.lights.push({ x: 0, y: p.height, z: 0, radius: r, mat: 'bulb-warm' });
  },

  curtains(p, add) {
    // p.length = window width; hung on a rod above the window, one panel each side, gathered open
    const w = p.length, top = p.top, drop = top - 0.01, rodY = top + 0.03, half = w / 2 + 0.3;
    add(at(rotateZ(cylinder(0.012, 0.012, -half - 0.05, half + 0.05, 12), 90), 0, rodY, 0.02), p.legs || 'brass', 'rod');
    const panel = (sx) => at(drape(0.55, drop, 5, 0.035), sx * (w / 2 + 0.05), top, 0.05);
    add(panel(-1), p.material, 'panel'); add(panel(1), p.material, 'panel');
  },
};
export { merge };
