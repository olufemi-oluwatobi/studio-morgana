// Numbered parts of a compiled godtongue document (P1, P2, …), in the order they first appear in the source.
// A stage or video: its elements. A card or canvas: the named areas its steps work on, per face.
// Each part keeps its source lines (for the editor and the AI) and, on cards, a mask used to place its pin.
import { maskSvg } from '../../../../godtongue/engines/web.js';

const firstRef = (area) => area?.terms?.[0]?.ref;
const uniq = (xs) => [...new Set(xs)];

export function partsOf(doc) {
  const [W, H] = doc.card.grid;
  if (doc.kind === 'stage') {
    return Object.entries(doc.elements)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name, e], i) => {
        const steps = doc.sides[name]?.steps || [];
        const lines = uniq([e.line, ...steps.map((s) => s.line)].filter(Number.isFinite)).sort((a, b) => a - b);
        return {
          n: i + 1, name, face: 'front', kind: e.kind,
          ops: uniq(steps.map((s) => s.op)), lines,
          pin: e.at ? [e.at[0] / W, e.at[1] / H] : [0.5, 0.5],
        };
      });
  }
  const faces = Object.keys(doc.sides);
  const out = [], seen = new Map();
  for (const face of faces) {
    for (const s of doc.sides[face].steps || []) {
      const ref = firstRef(s.area);
      if (!ref) continue;
      const key = face + ':' + ref;
      let p = seen.get(key);
      if (!p) {
        p = { n: 0, name: ref, face, ops: [], lines: [], materials: [], mask: null };
        try { p.mask = maskSvg(doc, { terms: [{ ref, mod: null, r: null }], minus: [], within: [] }); } catch { p.mask = null; }
        seen.set(key, p); out.push(p);
      }
      p.ops.push(s.op);
      if (Number.isFinite(s.line)) p.lines.push(s.line);
      if (typeof s.material === 'string' && s.material) p.materials.push(s.material);
    }
  }
  out.forEach((p, i) => { p.n = i + 1; p.ops = uniq(p.ops); p.lines = uniq(p.lines).sort((a, b) => a - b); p.materials = uniq(p.materials); });
  return out;
}

// what a piece is, for the wall's tabs
export function categoryOf(doc) {
  if (doc.video) return 'videos';
  if (doc.kind === 'stage') return 'scenes';
  if (doc.kind === 'canvas') return 'posts';
  return 'cards';
}

// What the editor shows when the pointer rests on a name in the source (or on the thing in the picture): the box it
// covers in the piece's own pixels, what it is, and how it was made up. Layers of a canvas or card; elements of a stage.
const short = (v) => (typeof v === 'number' ? +v.toFixed(2) : v);
function lookOf(step, doc) {
  const p = step.params || {}, m = typeof step.material === 'string' ? doc.materials?.[step.material] : null;
  if (p.gradient) return { op: step.op, text: `${p.gradient.radial ? 'radial ' : ''}gradient ${p.gradient.stops.join(' → ')}`, css: gradientCss(p.gradient) };
  if (m?.hex && ['enamel', 'plate', 'foil', 'inlay'].includes(step.op)) return { op: step.op, text: m.hex, css: m.hex };
  if (step.op === 'print' || step.op === 'illustrate') return { op: step.op, text: step.op === 'print' ? 'a picture' : 'an illustration' };
  const kv = Object.entries(p).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k.replace(/_/g, ' ')} ${short(v)}`).join(', ');
  return { op: step.op, text: kv ? `${step.op}: ${kv}` : step.op, css: p.color && /^#/.test(p.color) ? p.color : undefined };
}
function gradientCss(g) {
  const st = g.stops.map((c, i) => `${c} ${Math.round(100 * i / Math.max(1, g.stops.length - 1))}%`).join(', ');
  return g.radial ? `radial-gradient(circle, ${st})` : `linear-gradient(${(g.angle ?? 90) + 90}deg, ${st})`;
}
export function elementsOf(doc) {
  const out = {};
  const steps = {};
  for (const side of Object.values(doc.sides || {})) for (const s of side.steps || []) { const r = s.area?.terms?.[0]?.ref; if (r) (steps[r] ||= []).push(s); }
  for (const [name, L] of Object.entries(doc.layers || {})) {
    const box = L.path?.rect || L.box; if (!box) continue;
    const looks = (steps[name] || []).map((s) => lookOf(s, doc));
    out[name] = {
      name, line: L.line ?? null, box: box.map((n) => Math.round(n * 10) / 10),
      kind: L.kind === 'text' ? 'text' : L.generator || L.kind || 'shape',
      text: L.kind === 'text' ? L.text : undefined, font: L.font ? `${L.font.family}${L.font.weight && L.font.weight !== 400 ? ' ' + L.font.weight : ''}${L.font.style === 'italic' ? ' italic' : ''}` : undefined, size: L.kind === 'text' ? L.size : undefined,
      fill: looks.find((l) => l.css && ['enamel', 'plate', 'foil', 'inlay'].includes(l.op))?.css,
      looks: looks.map((l) => l.text),
    };
  }
  if (doc.kind === 'stage') {
    for (const [name, e] of Object.entries(doc.elements || {})) {
      if (out[name] || !e.at) continue;
      const sz = e.size_px || [80, 80];
      out[name] = { name, line: e.line ?? null, kind: e.kind, box: [e.at[0] - sz[0] / 2, e.at[1] - sz[1] / 2, e.at[0] + sz[0] / 2, e.at[1] + sz[1] / 2], looks: (doc.sides[name]?.steps || []).map((s) => lookOf(s, doc).text) };
    }
  }
  return out;
}
