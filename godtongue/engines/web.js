// Engine: web (Morgana order 0.2: the one renderer). Compiled document → one self-contained page.
// Every document becomes a list of elements; each element has faces (a stage element has one, a card or canvas
// has front and back). The browser builds each face's maps (colour, material, height, silhouette, shadow, flakes)
// and lights them live in WebGL2. Runtime: web/engine.js.
// Covers: plate, foil, enamel, emboss, deboss, engrave, etch, print, illustrate, sprays (paint, gloss, matte,
// glitter, metal flake, candy), flip, elements, layers, motion, captions, video.
// Not yet: pearl and crystal sprays, holo finishes, brushed anisotropy (see docs/morgana-execution.md).
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
export function maskSvg(doc, area) {
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
  const flat = (id, v) => { if (!filters.has(id)) { filters.add(id); defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 1 0"/></filter>`); } return id; };
  const grow = (r, v) => { const id = `g${v}_${String(r).replace('.', '_')}`; if (!filters.has(id)) { filters.add(id); defs.push(`<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" color-interpolation-filters="sRGB"><feMorphology operator="dilate" radius="${r}"/><feColorMatrix values="0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 0 ${v} 0 0 0 1 0"/></filter>`); } return id; };
  const shape = (t, v) => t.mod === 'halo'
    ? `<use href="#L-${t.ref}" filter="url(#${grow(t.r, v)})"/><use href="#L-${t.ref}" filter="url(#${flat('f' + (1 - v), 1 - v)})"/>`
    : `<use href="#L-${t.ref}" filter="url(#${t.mod ? grow(t.r, v) : flat('f' + v, v)})"/>`;
  let inner = area.terms.map(t => shape(t, 1)).join('') + (area.minus || []).map(t => shape(t, 0)).join('');
  if (area.within?.length) { defs.push(`<mask id="w" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${area.within.map(t => shape(t, 1)).join('')}</mask>`); inner = `<g mask="url(#w)">${inner}</g>`; }
  defs.push(`<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${inner}</mask>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${fonts.size ? `<style>${[...fonts.values()].join('')}</style>` : ''}<defs>${defs.join('')}</defs><rect width="${W}" height="${H}" fill="#fff" mask="url(#m)"/></svg>`;
}

const cardBody = (card) => ({
  preset: card.stock, family: 'metal', color: STOCK[card.stock] || STOCK.stainless, metal: 1, rough: .28,
  thick_mm: card.thickness_mm, fibres: 0,
});

// a document's steps → what the runtime needs; d supplies the layers, zones, materials and assets they use
function faceSet(d, sides, unsupported) {
  const mat = (key) => {
    const m = d.materials[key] || {};
    if (m.type === 'enamel') return { metal: 0, rough: m.process === 'niello-inlay' ? .35 : .2, color: m.hex };
    if (m.type === 'paint') return { metal: m.finish === 'metallic' ? .6 : 0, rough: { gloss: .08, satin: .3, matte: .85, metallic: .3, pearl: .25, candy: .06 }[m.finish] ?? .3, color: m.hex, finish: m.finish };
    const hi = m.preview?.hi || '#dddddd', lo = m.preview?.lo || '#777777';
    return { metal: 1, rough: m.polish === 'mirror' ? .05 : m.polish === 'satin' ? .22 : .32, color: mixHex(hi, lo, .3) };
  };
  const stepOf = (s) => {
    const out = { op: s.op, line: s.line, params: s.params || {}, kind: s.kind, mask: 'data:image/svg+xml;base64,' + Buffer.from(maskSvg(d, s.area)).toString('base64') };
    if (s.material) out.mat = mat(s.material);
    if (s.image) { const a = d.assets[s.image.asset], z = d.zones[s.image.zone] || d.zones.window; out.image = { src: `data:${MIME[a.path.split('.').pop().toLowerCase()]};base64,${fs.readFileSync(a.path).toString('base64')}`, rect: z.rect, focus: s.image.focus || [.5, .5], onFoil: !!s.on_foil }; }
    if (s.op === 'spray' && !['gloss', 'glitter', 'metalflake', 'candy', 'matte', 'paint'].includes(s.kind)) unsupported.add(`spray ${s.kind}`);
    return out;
  };
  for (const m of Object.values(d.materials)) if (m.finish?.startsWith('holo') || m.finish === 'crystal') unsupported.add(m.finish);
  return Object.fromEntries(Object.entries(sides).map(([f, S]) => [f, S.steps.map(stepOf)]));
}

export function toScene(doc) {
  const c = doc.card, W = c.grid[0], H = c.grid[1], pxmm = c.rect[2] / c.size_mm[0];
  const unsupported = new Set();
  const tl = doc.timeline || {}, rv = tl.reveals || {};
  const cs = tl.captionStyle || { font: 'Jost', size: 60, color: '#1d1b18', y: null, weight: 500 };
  const ff = (tl.captions || []).length ? (fontFile(cs.font, cs.weight, 'normal') || fontFile(cs.font, 400, 'normal')) : null;
  const timeline = { camera: tl.camera || [], captions: tl.captions || [], captionStyle: { ...cs, src: ff ? 'data:font/woff2;base64,' + fs.readFileSync(ff).toString('base64') : null } };

  const elements = Object.entries(doc.elements).sort((a, b) => a[1].order - b[1].order).map(([name, e]) => {
    // a placed card carries its own document: its faces, layers and materials are that file's
    if (e.card) {
      const { card: sub, ...rest } = e;
      return { name, ...rest, body: cardBody(sub.card), faces: faceSet(sub, sub.sides, unsupported) };
    }
    if (doc.kind === 'stage') {
      // a stage element is one face: its own steps, with reveals timed from the layers it draws
      const src = doc.sides[name]?.steps || [];
      const steps = faceSet(doc, { front: { steps: src } }, unsupported).front;
      steps.forEach((st, k) => { const hit = src[k].area?.terms.map(x => rv[x.ref]).find(Boolean); if (hit) st.reveal = hit; });
      return { name, ...e, faces: { front: steps } };
    }
    // a card or canvas: the blank is its stock, sized to its body rectangle inside the grid; faces are its sides
    return {
      name, order: e.order, kind: e.kind, size: [W, H], rect: c.rect, at: [W / 2, H / 2], turn: 0, up_mm: 0,
      // a held blank is tilted by the hand (its surface turns); a stage element is lit by a moving light
      held: true, outline: 'rect', corners: c.r, aged: 0, edge: { style: 'clean', side: 'all' },
      body: cardBody(c), faces: faceSet(doc, Object.fromEntries(e.faces.map(f => [f, doc.sides[f]])), unsupported),
    };
  });
  for (const m of Object.values(doc.materials)) if (m.finish?.startsWith('holo') || m.finish === 'crystal') unsupported.add(m.finish);
  return {
    name: doc.name, kind: doc.kind === 'stage' ? 'stage' : 'card', video: doc.video || null, timeline,
    W, H, pxmm, bench: doc.stage?.background || c.bench, elements, unsupported: [...unsupported],
  };
}

export default {
  name: 'web',
  label: 'Web renderer (live light, WebGL2)',
  describe: 'Builds each face of each element in the browser and lights it live. One renderer for cards, canvases, stages and videos.',
  supports: (doc) => doc.kind === 'room' ? 'rooms use the room engine' : true,
  async build(doc, { outDir, log }) {
    fs.mkdirSync(outDir, { recursive: true });
    const scene = toScene(doc);
    if (scene.unsupported.length) log?.(`web engine: not yet supported, skipped: ${scene.unsupported.join(', ')}`);
    const runtime = fs.readFileSync(path.join(HERE, '..', 'web', 'engine.js'), 'utf8');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.name)}</title>
<style>[hidden]{display:none!important}html,body{margin:0;height:100%;background:${scene.bench};overflow:hidden;font:12px system-ui,sans-serif;color:#9aa0a8}canvas{display:block;margin:auto;height:100vh;max-width:100vw;object-fit:contain;touch-action:none}#hud{position:fixed;left:12px;bottom:10px}button{position:fixed;right:12px;bottom:10px;font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #444;background:#1b1d22;color:#ddd}</style></head>
<body><canvas id="gl"></canvas><div id="hud"></div><button id="flip" hidden>Flip</button><div id="bar" hidden style="position:fixed;left:50%;transform:translateX(-50%);bottom:34px;display:flex;gap:10px;align-items:center;background:#000a;padding:6px 12px;border-radius:8px"><button id="play" style="position:static">Pause</button><input id="scrub" type="range" min="0" max="1000" value="0" style="width:min(60vw,420px)"><span id="tc" style="min-width:52px;color:#ddd">0.0 s</span></div>
<script>window.SCENE=${JSON.stringify(scene)};</script><script>${runtime}</script></body></html>`;
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    return { entry: 'index.html', files: ['index.html'] };
  },
};
