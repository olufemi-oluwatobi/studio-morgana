// Engine: web (Morgana P1, thin slice). Scene IR → one self-contained page that builds the height and material
// maps in the browser (2D canvas compositing of per-step masks) and lights them live in WebGL2.
// Covers: plate, foil, enamel, emboss, deboss, engrave, etch, print, illustrate, spray gloss/glitter/metalflake/candy/matte.
// Not yet: pearl and chameleon sprays, holo and crystal finishes, brushed anisotropy, WebGPU path, incremental rebuilds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fontFile } from '../core/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const STOCK = { brass: '#b8923f', stainless: '#b9bdc2', aluminium: '#c9ccd1', titanium: '#8f8a83', 'anodized-navy': '#17225e', 'anodized-midnight': '#0a1458', 'anodized-black': '#1c1e23' };
const mixHex = (a, b, t = .5) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

// one SVG per step: the step's area in white on transparent, carrying only the layers and fonts it uses
function maskSvg(doc, area) {
  const [W, H] = doc.card.grid, defs = [], filters = new Set(), fonts = new Map();
  const refs = [...area.terms, ...(area.minus || []), ...(area.within || [])];
  for (const name of new Set(refs.map(t => t.ref))) {
    const L = doc.layers[name], z = doc.zones[name];
    if (L?.font) { const f = fontFile(L.font.family, L.font.weight, L.font.style); if (f) fonts.set(f, `@font-face{font-family:"${L.font.family}";font-weight:${L.font.weight};font-style:${L.font.style};src:url(data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}) format("woff2")}`); }
    if (L?.kind === 'vector') defs.push(`<g id="L-${name}">${L.svg}</g>`);
    else if (L?.kind === 'text') defs.push(`<text id="L-${name}" x="${L.at[0]}" y="${L.at[1]}" font-family="${esc(L.font.family)}, serif" font-weight="${L.font.weight}" font-style="${L.font.style}" font-size="${L.size}" text-anchor="middle" letter-spacing="${L.track || 0}" fill="#fff">${esc(L.text)}</text>`);
    else if (L?.kind === 'signature') defs.push(`<text id="L-${name}" transform="translate(${L.center[0]} ${L.center[1]}) rotate(${L.rotate_deg})" font-family="${esc(L.font.family)}, cursive" font-size="${L.size}" textLength="${L.max_width}" lengthAdjust="spacingAndGlyphs" text-anchor="middle" fill="#fff">${esc(L.text)}</text>`);
    else if (z?.rect) defs.push(`<rect id="L-${name}" x="${z.rect[0]}" y="${z.rect[1]}" width="${z.rect[2]}" height="${z.rect[3]}" rx="${z.r || 0}" fill="#fff"/>`);
  }
  const flat = (id, v) => { if (!filters.has(id)) { filters.add(id); defs.push(`<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 1 0"/></filter>`); } return id; };
  const grow = (r, v) => { const id = `g${v}_${String(r).replace('.', '_')}`; if (!filters.has(id)) { filters.add(id); defs.push(`<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feMorphology operator="dilate" radius="${r}"/><feColorMatrix values="0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 1 0"/></filter>`); } return id; };
  const shape = (t, v) => t.mod === 'halo'
    ? `<use href="#L-${t.ref}" filter="url(#${grow(t.r, v)})"/><use href="#L-${t.ref}" filter="url(#${flat('f' + (1 - v), 1 - v)})"/>`
    : `<use href="#L-${t.ref}" filter="url(#${t.mod ? grow(t.r, v) : flat('f' + v, v)})"/>`;
  let inner = area.terms.map(t => shape(t, 1)).join('') + (area.minus || []).map(t => shape(t, 0)).join('');
  if (area.within?.length) { defs.push(`<mask id="w" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${area.within.map(t => shape(t, 1)).join('')}</mask>`); inner = `<g mask="url(#w)">${inner}</g>`; }
  defs.push(`<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${inner}</mask>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${fonts.size ? `<style>${[...fonts.values()].join('')}</style>` : ''}<defs>${defs.join('')}</defs><rect width="${W}" height="${H}" fill="#fff" mask="url(#m)"/></svg>`;
}

export function toScene(doc) {
  const c = doc.card, pxmm = c.rect[2] / c.size_mm[0];
  const mat = (key) => {
    const m = doc.materials[key] || {};
    if (m.type === 'enamel') return { metal: 0, rough: m.process === 'niello-inlay' ? .35 : .2, color: m.hex };
    const hi = m.preview?.hi || '#dddddd', lo = m.preview?.lo || '#777777';
    return { metal: 1, rough: m.polish === 'mirror' ? .05 : m.polish === 'satin' ? .22 : .32, color: mixHex(hi, lo, .3) };
  };
  const unsupported = new Set();
  const sides = {};
  for (const [side, S] of Object.entries(doc.sides)) {
    sides[side] = S.steps.map(s => {
      const out = { op: s.op, line: s.line, params: s.params || {}, kind: s.kind, mask: 'data:image/svg+xml;base64,' + Buffer.from(maskSvg(doc, s.area)).toString('base64') };
      if (s.material) out.mat = mat(s.material);
      if (s.image) { const a = doc.assets[s.image.asset], z = doc.zones[s.image.zone] || doc.zones.window; out.image = { src: `data:${MIME[a.path.split('.').pop().toLowerCase()]};base64,${fs.readFileSync(a.path).toString('base64')}`, rect: z.rect, focus: s.image.focus || [.5, .5], onFoil: !!s.on_foil }; }
      if (s.op === 'spray' && !['gloss', 'glitter', 'metalflake', 'candy', 'matte'].includes(s.kind)) unsupported.add(`spray ${s.kind}`);
      return out;
    });
  }
  for (const m of Object.values(doc.materials)) if (m.finish?.startsWith('holo') || m.finish === 'crystal') unsupported.add(m.finish);
  return { name: doc.name, kind: doc.kind, W: c.grid[0], H: c.grid[1], rect: c.rect, r: c.r, pxmm, bench: doc.view?.bench || c.bench,
    stock: { color: STOCK[c.stock] || STOCK.stainless, rough: .28 }, sides, unsupported: [...unsupported] };
}

export default {
  name: 'web',
  label: 'Web renderer (live light, WebGL2)',
  describe: 'Builds height and material maps in the browser and lights them live. Thin slice of Morgana P1.',
  supports: (doc) => doc.kind === 'room' ? 'rooms use the room engine' : true,
  async build(doc, { outDir, log }) {
    fs.mkdirSync(outDir, { recursive: true });
    const scene = toScene(doc);
    if (scene.unsupported.length) log?.(`web engine: not yet supported, skipped: ${scene.unsupported.join(', ')}`);
    const runtime = fs.readFileSync(path.join(HERE, '..', 'web', 'runtime.js'), 'utf8');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.name)}</title>
<style>html,body{margin:0;height:100%;background:${scene.bench};overflow:hidden;perspective:2600px;font:12px system-ui,sans-serif;color:#9aa0a8}canvas{display:block;margin:auto;height:100vh;max-width:100vw;object-fit:contain;touch-action:none;backface-visibility:visible;will-change:transform}#hud{position:fixed;left:12px;bottom:10px}button{position:fixed;right:12px;bottom:10px;font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #444;background:#1b1d22;color:#ddd}</style></head>
<body><canvas id="gl"></canvas><div id="hud"></div><button id="flip" hidden>Flip</button>
<script>window.SCENE=${JSON.stringify(scene)};</script><script>${runtime}</script></body></html>`;
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    return { entry: 'index.html', files: ['index.html'] };
  },
};
