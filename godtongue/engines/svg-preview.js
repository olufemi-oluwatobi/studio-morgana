// Engine: instant flat preview in pure JS. Draws each side as SVG with gradient metals, enamel colours,
// masks for every area, the printed photo and spray coats. For drafting; the physical look comes from fancard-py.
import fs from 'node:fs';
import path from 'node:path';
import { fontFile } from '../core/config.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const dataUri = (doc) => (k) => `data:${MIME[k.split('.').pop().toLowerCase()] || 'application/octet-stream'};base64,${fs.readFileSync(doc.assets[k].path).toString('base64')}`;

export function renderSide(doc, side, { assetHref = dataUri(doc), embedFonts = true } = {}) {   // self-contained: photos and fonts are embedded
  const c = doc.card, [W, H] = c.grid, [cx, cy, cw, ch] = c.rect, S = doc.sides[side] || { steps: [], silhouette: [] };
  const defs = [], body = [], filters = new Set();
  const used = new Set(S.steps.flatMap(s => areaRefs(s.area)).concat(S.silhouette));
  // fonts
  if (embedFonts) {
    const faces = new Map();
    for (const L of Object.values(doc.layers)) if (L.font) {
      const f = fontFile(L.font.family, L.font.weight, L.font.style);
      if (f) faces.set(`${L.font.family}|${L.font.weight}|${L.font.style}`, `@font-face{font-family:"${L.font.family}";font-weight:${L.font.weight};font-style:${L.font.style};src:url(data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}) format("woff2")}`);
    }
    if (faces.size) defs.push(`<style>${[...faces.values()].join('')}</style>`);
  }
  defs.push(`<filter id="white" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter>`,
    `<filter id="black" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB"><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0"/></filter>`);
  const grow = (r, col) => { const id = `g${col}${String(r).replace('.', '_')}`; if (!filters.has(id)) { filters.add(id); defs.push(`<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feMorphology operator="dilate" radius="${r}"/><feColorMatrix values="0 0 0 0 ${col === 'w' ? 1 : 0} 0 0 0 0 ${col === 'w' ? 1 : 0} 0 0 0 0 ${col === 'w' ? 1 : 0} 0 0 0 1 0"/></filter>`); } return id; };
  // layers and zones as reusable shapes
  for (const [name, L] of Object.entries(doc.layers)) {
    if (L.kind === 'vector') defs.push(`<g id="L-${name}">${L.svg}</g>`);
    else if (L.kind === 'text') defs.push(`<text id="L-${name}" x="${L.at[0]}" y="${L.at[1]}" font-family="${esc(L.font.family)}, serif" font-weight="${L.font.weight}" font-style="${L.font.style}" font-size="${L.size}" text-anchor="middle" letter-spacing="${L.track || 0}" fill="#fff">${esc(L.text)}</text>`);
    else if (L.kind === 'signature') defs.push(`<text id="L-${name}" transform="translate(${L.center[0]} ${L.center[1]}) rotate(${L.rotate_deg})" font-family="${esc(L.font.family)}, cursive" font-size="${L.size * 0.62}" text-anchor="middle" fill="#fff">${esc(L.text)}</text>`);
  }
  for (const [name, z] of Object.entries(doc.zones)) if (z.rect) defs.push(`<rect id="Z-${name}" x="${z.rect[0]}" y="${z.rect[1]}" width="${z.rect[2]}" height="${z.rect[3]}" rx="${z.r || 0}" fill="#fff"/>`);
  const href = (ref) => doc.layers[ref] ? `#L-${ref}` : `#Z-${ref}`;
  const shape = (t, col) => {
    const f = t.mod ? grow(t.r, col) : (col === 'w' ? 'white' : 'black');
    if (t.mod === 'halo') return `<use href="${href(t.ref)}" filter="url(#${grow(t.r, col)})"/><use href="${href(t.ref)}" filter="url(#${col === 'w' ? 'black' : 'white'})"/>`;
    return `<use href="${href(t.ref)}" filter="url(#${f})"/>`;
  };
  let mi = 0;
  const mask = (area) => {
    const id = `m${mi++}`;
    let inner = area.terms.map(t => shape(t, 'w')).join('') + (area.minus || []).map(t => shape(t, 'b')).join('');
    if (area.within?.length) {
      defs.push(`<mask id="${id}w" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${area.within.map(t => shape(t, 'w')).join('')}</mask>`);
      inner = `<g mask="url(#${id}w)">${inner}</g>`;
    }
    defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">${inner}</mask>`);
    return id;
  };
  // materials as sheet-wide gradients
  const grads = new Set();
  const paint = (key) => {
    const m = doc.materials[key] || {};
    if (m.type === 'enamel') return m.hex;
    const id = `p-${key}`;
    if (!grads.has(id)) {
      grads.add(id);
      const hi = m.preview?.hi || '#dddddd', lo = m.preview?.lo || '#777777';
      if (m.finish?.startsWith('holo')) defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}">${['#ff9ad5', '#ffe29a', '#a8ffb0', '#9ad9ff', '#c9a8ff', '#ff9ad5', '#ffe29a'].map((s, i) => `<stop offset="${i / 6}" stop-color="${s}"/>`).join('')}</linearGradient>`);
      else if (m.finish === 'crystal') defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${W * .4}" cy="${H * .3}" r="${W * .9}"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#dfe9f5"/><stop offset=".7" stop-color="#ffffff"/><stop offset="1" stop-color="#a8b8cc"/></radialGradient>`);
      else defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}"><stop offset="0" stop-color="${lo}"/><stop offset=".28" stop-color="${hi}"/><stop offset=".46" stop-color="${lo}"/><stop offset=".62" stop-color="${hi}"/><stop offset=".8" stop-color="${mix(hi, lo)}"/><stop offset="1" stop-color="${lo}"/></linearGradient>`);
    }
    return `url(#${id})`;
  };
  const full = (fill, id, extra = '') => `<rect x="0" y="0" width="${W}" height="${H}" fill="${fill}" mask="url(#${id})" ${extra}/>`;

  // the blank
  const stock = { brass: ['#d9b56a', '#7a5a26'], stainless: ['#d8dcdf', '#6e7479'], aluminium: ['#e3e5e8', '#8a8f96'], titanium: ['#b7b2aa', '#5d5a55'], 'anodized-navy': ['#1d2c78', '#060b2a'], 'anodized-midnight': ['#0b1a78', '#010312'], 'anodized-black': ['#3a3d44', '#0a0b0e'] }[c.stock] || ['#d8dcdf', '#6e7479'];
  defs.push(`<linearGradient id="stock" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}"><stop offset="0" stop-color="${stock[1]}"/><stop offset=".4" stop-color="${stock[0]}"/><stop offset="1" stop-color="${stock[1]}"/></linearGradient>`,
    `<linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>`);
  defs.push(`<mask id="cardmask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${c.r}" fill="#fff"/>${S.silhouette.map(n => `<use href="#L-${n}" filter="url(#white)"/>`).join('')}</mask>`);
  body.push(`<rect width="${W}" height="${H}" fill="${c.bench}"/>`, `<g mask="url(#cardmask)"><rect width="${W}" height="${H}" fill="url(#stock)"/>`);

  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const s of S.steps) {
    const id = mask(s.area);
    switch (s.op) {
      case 'plate': case 'foil': body.push(full(paint(s.material), id)); break;
      case 'enamel': body.push(full(paint(s.material), id)); break;
      case 'engrave': body.push(full('#000', id, 'opacity=".42"')); break;
      case 'deboss': body.push(full('#000', id, 'opacity=".18"')); break;
      case 'etch': body.push(full('#fff', id, 'opacity=".22"')); break;
      case 'emboss': body.push(`<g transform="translate(4 5)">${full('#000', id, 'opacity=".45"')}</g>`); break;
      case 'print': case 'illustrate': {
        const z = doc.zones[s.image.zone] || doc.zones.window, [x, y, w, h] = z.rect, fy = s.image.focus?.[1] ?? .5, fx = s.image.focus?.[0] ?? .5;
        const al = `x${fx < .34 ? 'Min' : fx > .66 ? 'Max' : 'Mid'}Y${fy < .34 ? 'Min' : fy > .66 ? 'Max' : 'Mid'}`;
        body.push(`<image href="${esc(assetHref(s.image.asset))}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${al} slice" mask="url(#${id})"${s.on_foil ? ' style="mix-blend-mode:multiply"' : ''}/>`);
        break;
      }
      case 'spray': {
        const p = s.params || {}, cols = [].concat(p.color || []);
        if (s.kind === 'gloss') body.push(full('url(#sheen)', id, 'opacity=".55"'));
        else if (s.kind === 'glitter' || s.kind === 'metalflake') {
          const pid = `fl${mi}`, size = Math.max(3, (p.flake_um || 220) / 50), list = cols.length ? cols : ['#e8e8ee', '#ffffff', '#b8bcc4'];
          let dots = ''; for (let k = 0; k < 90; k++) dots += `<rect x="${(rnd() * 60).toFixed(1)}" y="${(rnd() * 60).toFixed(1)}" width="${size}" height="${size}" transform="rotate(${(rnd() * 90).toFixed(0)} 30 30)" fill="${list[k % list.length]}" opacity="${(.5 + rnd() * .5).toFixed(2)}"/>`;
          defs.push(`<pattern id="${pid}" width="60" height="60" patternUnits="userSpaceOnUse">${dots}</pattern>`);
          body.push(full(`url(#${pid})`, id, `opacity="${Math.min(1, (p.density ?? .35) + .35)}"`));
        } else if (s.kind === 'pearl' || s.kind === 'chameleon') {
          const pid = `pf${mi}`, flop = p.flop || (s.kind === 'pearl' ? ['#ffd9e8', '#d8e8ff', '#fff2cc'] : ['#4b1f7a', '#0f7a6a', '#c9a227', '#9b2a4a']);
          defs.push(`<linearGradient id="${pid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}">${flop.map((f, k) => `<stop offset="${k / (flop.length - 1)}" stop-color="${f}"/>`).join('')}</linearGradient>`);
          body.push(full(`url(#${pid})`, id, `opacity="${p.opacity ?? (s.kind === 'pearl' ? .35 : .8)}"`));
        } else if (s.kind === 'candy') body.push(full(cols[0] || '#c4121e', id, 'opacity=".55" style="mix-blend-mode:multiply"'));
        else if (s.kind === 'matte') body.push(full('#808080', id, 'opacity=".15"'));
        break;
      }
    }
  }
  body.push(`<rect x="${cx + 1.5}" y="${cy + 1.5}" width="${cw - 3}" height="${ch - 3}" rx="${c.r}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3"/></g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
}
function areaRefs(a) { return a ? [...a.terms, ...(a.minus || []), ...(a.within || [])].map(t => t.ref) : []; }
function mix(a, b) { const p = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return '#' + x.map((v, i) => Math.round((v + y[i]) / 2).toString(16).padStart(2, '0')).join(''); }

export default {
  name: 'svg-preview',
  label: 'SVG preview · instant',
  describe: 'Pure JS, under a second. Flat metals and enamel, masks, photo and sprays. For drafting.',
  supports() { return true; },
  async build(doc, { outDir, log = () => { } }) {
    const sides = Object.keys(doc.sides).length ? Object.keys(doc.sides) : ['front'];
    const files = [];
    for (const s of sides) { fs.writeFileSync(path.join(outDir, `${s}.svg`), renderSide(doc, s)); files.push(`${s}.svg`); }
    const [W, H] = doc.card.grid;
    fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.card.title || doc.name)} · preview</title>
<style>body{margin:0;background:${doc.card.bench};display:flex;flex-wrap:wrap;gap:24px;justify-content:center;align-items:flex-start;padding:24px;font:12px system-ui;color:#9aa}figure{margin:0;text-align:center}img{width:min(42vw,420px);aspect-ratio:${W}/${H};display:block}figcaption{margin-top:8px;letter-spacing:.14em;text-transform:uppercase}</style>
${sides.map(s => `<figure><img src="${s}.svg" alt="${s}"><figcaption>${s}</figcaption></figure>`).join('')}`);
    log(`drew ${sides.join(' + ')} as SVG`);
    return { entry: 'index.html', previews: Object.fromEntries(sides.map(s => [s, `${s}.svg`])), files: ['index.html', ...files] };
  },
};
