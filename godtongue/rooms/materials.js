// Room materials: linear RGB base colour, roughness, metal flag. Names are what you write after "in" or "make … ".
// Any #hex or card colour name also works and becomes a matte paint.
export const ROOM_MATERIALS = {
  'oak':            { base: [0.42, 0.27, 0.15], rough: 0.6, texture: { kind: 'planks', tile: 2.56, plank: 0.16 }, sheen: 0.3 },
  'walnut-floor':   { base: [0.20, 0.10, 0.05], rough: 0.6, texture: { kind: 'planks', tile: 2.56, plank: 0.14 }, sheen: 0.3 },
  'pale-oak':       { base: [0.55, 0.42, 0.28], rough: 0.6, texture: { kind: 'planks', tile: 2.56, plank: 0.19 }, sheen: 0.3 },
  'walnut':         { base: [0.22, 0.11, 0.06], rough: 1.0 },
  'brass':          { base: [0.91, 0.78, 0.42], rough: 0.3, metal: true },
  'chrome':         { base: [0.55, 0.56, 0.55], rough: 0.15, metal: true },
  'warm-white':     { base: [0.78, 0.74, 0.68], rough: 1.0 },
  'ceiling-white':  { base: [0.82, 0.81, 0.79], rough: 1.0 },
  'skirting-white': { base: [0.86, 0.85, 0.82], rough: 1.0 },
  'black':          { base: [0.05, 0.05, 0.05], rough: 1.0 },
  'cord-black':     { base: [0.03, 0.03, 0.03], rough: 1.0 },
  'terracotta':     { base: [0.52, 0.20, 0.13], rough: 1.0 },
  'green-velvet':   { base: [0.07, 0.20, 0.15], rough: 1.0 },
  'navy':           { base: [0.08, 0.15, 0.33], rough: 1.0 },
  'linen':          { base: [0.62, 0.57, 0.48], rough: 1.0 },
  'charcoal':       { base: [0.06, 0.06, 0.065], rough: 1.0 },
  'ceramic':        { base: [0.80, 0.78, 0.72], rough: 1.0 },
  'soil':           { base: [0.04, 0.03, 0.02], rough: 1.0 },
  'leaf-green':     { base: [0.07, 0.21, 0.05], rough: 1.0 },
  'book-red':       { base: [0.36, 0.06, 0.05], rough: 1.0 },
  'book-cream':     { base: [0.70, 0.64, 0.52], rough: 1.0 },
  'book-blue':      { base: [0.06, 0.10, 0.22], rough: 1.0 },
  'book-green':     { base: [0.08, 0.17, 0.11], rough: 1.0 },
  'book-ochre':     { base: [0.55, 0.33, 0.08], rough: 1.0 },
  'boucle':         { base: [0.72, 0.68, 0.60], rough: 1.0 },
  'sage':           { base: [0.25, 0.30, 0.22], rough: 1.0 },
};
export const ALIASES = { 'velvet green': 'green-velvet', 'white': 'warm-white', 'plaster': 'warm-white' };

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export function hexToLinear(hex) {
  let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => Math.round(srgbToLinear(parseInt(h.slice(i, i + 2), 16) / 255) * 1000) / 1000);
}
