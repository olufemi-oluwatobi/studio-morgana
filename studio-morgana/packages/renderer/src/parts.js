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
