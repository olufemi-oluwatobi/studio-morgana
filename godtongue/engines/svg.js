// Engine: svg (vector export). A flat reading of a card or canvas as one SVG file: every colour step becomes a
// filled shape (flat or gradient, with opacity, blend mode and feather), shadows and glows become blurred copies,
// photos are embedded and clipped to their shapes. Text stays text (with its font inside the file).
// What has no flat meaning is left out and listed in a comment at the top: relief (emboss, engrave, deboss, etch),
// sprays, grain, adjustment layers and inner shadows. Stages and videos are not exported; use the web engine.
import fs from 'node:fs';
import path from 'node:path';
import { maskSvg } from './web.js';

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
const STOCK = { brass: '#b8923f', stainless: '#b9bdc2', aluminium: '#c9ccd1', titanium: '#8f8a83', 'anodized-navy': '#17225e', 'anodized-midnight': '#0a1458', 'anodized-black': '#1c1e23' };
const mix = (a, b, t = .5) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const r1 = (v) => Math.round(v * 10) / 10;

export function toSvg(doc, { side = 'front' } = {}) {
  if (doc.kind === 'stage' || doc.kind === 'room') throw new Error('only cards and canvases export as SVG');
  const [W, H] = doc.card.grid, steps = doc.sides[side]?.steps || [], flat = !!doc.canvas?.flat;
  const fonts = new Set(), defs = [], body = [], skipped = new Set();
  const colour = (key) => { const m = doc.materials[key] || {}; return m.hex || mix(m.preview?.hi || '#dddddd', m.preview?.lo || '#777777', .3); };
  // the box an area covers, for gradients: shapes, text, zones, else the whole piece
  const boxOf = (area) => {
    let b = null;
    for (const t of area.terms) {
      const L = doc.layers[t.ref], z = doc.zones[t.ref]; let q = null;
      if (L?.shapes?.length) { const xs = L.shapes.flatMap(s => s.pts.map(p => p[0])), ys = L.shapes.flatMap(s => s.pts.map(p => p[1])); q = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
      else if (L?.box) q = L.box; else if (z?.rect) q = [z.rect[0], z.rect[1], z.rect[0] + z.rect[2], z.rect[1] + z.rect[3]];
      if (!q) return [0, 0, W, H];
      b = b ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : q;
    }
    return b ? [b[0], b[1], b[2] - b[0], b[3] - b[1]] : [0, 0, W, H];
  };
  const blurs = new Set(), blur = (px) => { const id = `b${String(r1(px)).replace('.', '_')}`; if (!blurs.has(id)) { blurs.add(id); defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${r1(px)}"/></filter>`); } return id; };
  body.push(`<rect width="${W}" height="${H}" fill="${flat ? '#ffffff' : STOCK[doc.card.stock] || STOCK.stainless}"/>`);
  steps.forEach((s, i) => {
    const p = s.params || {}, ns = `s${i}-`;
    const paints = ['enamel', 'plate', 'foil', 'inlay', 'shadow', 'glow', 'print', 'vignette'].includes(s.op) || (s.op === 'spray' && s.kind === 'candy');
    if (!paints) { skipped.add(s.op === 'spray' ? `spray ${s.kind}` : s.op); return; }
    // the step's mask, with its ids made unique to this step
    let m = maskSvg(doc, s.area).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    m = m.replace(/<style>([\s\S]*?)<\/style>/, (_, css) => { for (const f of css.match(/@font-face\{[^}]*\}/g) || []) fonts.add(f); return ''; });
    m = m.replace(/<rect width="\d+" height="\d+" fill="#fff" mask="url\(#m\)"\/>$/, '');
    defs.push(m.replace(/^<defs>|<\/defs>$/g, '').replace(/id="/g, `id="${ns}`).replace(/url\(#/g, `url(#${ns}`).replace(/href="#/g, `href="#${ns}`));
    const mask = `mask="url(#${ns}m)"`, look = `${p.opacity != null && p.opacity < 1 ? ` opacity="${p.opacity}"` : ''}${p.blend ? ` style="mix-blend-mode:${p.blend}"` : ''}`;
    const soft = (inner, px) => px ? `<g filter="url(#${blur(px)})">${inner}</g>` : inner;
    const rect = (fill) => `<rect width="${W}" height="${H}" fill="${fill}" ${mask}/>`;
    if (s.op === 'shadow') { body.push(`<g opacity="${p.opacity ?? .45}" transform="translate(${p.dx || 0} ${p.dy ?? 10})" filter="url(#${blur((p.blur ?? 18) / 2)})">${rect(p.color || '#000000')}</g>`); return; }
    if (s.op === 'glow') { for (let k = 0; k < (p.strength || 1); k++) body.push(`<g style="mix-blend-mode:${p.blend || 'screen'}" filter="url(#${blur((p.blur ?? 30) / 2)})">${rect(p.color || '#ffffff')}</g>`); return; }
    if (s.op === 'print') {
      const a = doc.assets[s.image.asset], z = doc.zones[s.image.zone] || doc.zones.window, [x, y, w, h] = s.image.rect || z.rect, f = s.image.focus || [.5, .5];
      const al = (v) => v < .34 ? 'Min' : v > .66 ? 'Max' : 'Mid';
      const src = `data:${MIME[a.path.split('.').pop().toLowerCase()]};base64,${fs.readFileSync(a.path).toString('base64')}`;
      let duo = '';
      if (s.image.duotone) {               // shadows take the first colour, highlights the second
        const [A, B] = s.image.duotone.map(hx => [1, 3, 5].map(j => r1(parseInt(hx.slice(j, j + 2), 16) / 255 * 1000) / 1000));
        defs.push(`<filter id="${ns}duo" color-interpolation-filters="sRGB"><feColorMatrix values=".299 .587 .114 0 0 .299 .587 .114 0 0 .299 .587 .114 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="${A[0]} ${B[0]}"/><feFuncG type="table" tableValues="${A[1]} ${B[1]}"/><feFuncB type="table" tableValues="${A[2]} ${B[2]}"/></feComponentTransfer></filter>`);
        duo = ` filter="url(#${ns}duo)"`;
      }
      body.push(`<g ${mask}${look}><image href="${src}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="x${al(f[0])}Y${al(f[1])} slice"${duo}${s.image.filter ? ` style="filter:${s.image.filter}"` : ''}/></g>`); return;
    }
    let fill = s.material ? colour(s.material) : [].concat(p.color || '#000000')[0];
    const [bx, by, bw, bh] = boxOf(s.area), cx = bx + bw / 2, cy = by + bh / 2;
    if (s.op === 'vignette') {
      defs.push(`<radialGradient id="${ns}g" gradientUnits="userSpaceOnUse" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.hypot(bw, bh) * .56)}"><stop offset="0.5" stop-color="${p.color || '#000000'}" stop-opacity="0"/><stop offset="1" stop-color="${p.color || '#000000'}"/></radialGradient>`);
      body.push(`<g opacity="${p.amount ?? .5}">${rect(`url(#${ns}g)`)}</g>`); return;
    }
    if (p.gradient) {
      const g = p.gradient, stops = g.stops.map((c, k) => `<stop offset="${g.stops.length > 1 ? r1(k / (g.stops.length - 1) * 100) : 0}%" stop-color="${c}"/>`).join('');
      if (g.radial) defs.push(`<radialGradient id="${ns}g" gradientUnits="userSpaceOnUse" cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.hypot(bw, bh) / 2)}">${stops}</radialGradient>`);
      else { const a = (g.angle ?? 90) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), half = (Math.abs(ux) * bw + Math.abs(uy) * bh) / 2;
        defs.push(`<linearGradient id="${ns}g" gradientUnits="userSpaceOnUse" x1="${r1(cx - ux * half)}" y1="${r1(cy - uy * half)}" x2="${r1(cx + ux * half)}" y2="${r1(cy + uy * half)}">${stops}</linearGradient>`); }
      fill = `url(#${ns}g)`;
    }
    body.push(`<g${look}>${soft(rect(fill), (p.feather || 0) / 2)}</g>`);
  });
  const note = skipped.size ? `<!-- left out (no flat equivalent): ${[...skipped].join(', ')} -->` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${note}${fonts.size ? `<style>${[...fonts].join('')}</style>` : ''}<defs>${defs.join('')}</defs>${body.join('')}</svg>`;
}

export default {
  name: 'svg',
  label: 'Vector export (SVG)',
  describe: 'One SVG file of a card or canvas: flat colours, gradients, shadows, glows, photos and text. Relief and sprays are left out.',
  supports: (doc) => doc.kind === 'stage' || doc.kind === 'room' ? 'only cards and canvases export as SVG' : true,
  async build(doc, { outDir }) {
    fs.mkdirSync(outDir, { recursive: true });
    const file = `${doc.name || 'piece'}.svg`;
    fs.writeFileSync(path.join(outDir, file), toSvg(doc));
    return { entry: file, files: [file] };
  },
};
