// The Card Document: the only contract between the language and the engines.
// Plain JSON. Engines read it; they never see godtongue text.
export const GTDOC_VERSION = 1;

export function newDoc() {
  return {
    gtdoc: GTDOC_VERSION,
    name: 'untitled',
    id: 'godtongue/untitled',
    card: {
      size_mm: [54, 83.43], grid: [1240, 1829], rect: [80, 80, 1080, 1669], r: 54,
      stock: 'stainless', thickness_mm: 0.8, brush_deg: 0, seed: 1,
      edition: { no: 1, of: 1, set: 1 }, title: null, bench: '#0e0f12', lights: [-1, 0, 1],
    },
    zones: {
      card: { rect: [80, 80, 1080, 1669], r: 54 },
      window: { rect: [242, 242, 756, 1345], r: 9 },
    },
    materials: {},       // name → { type: 'metal', finish, polish } | { type: 'enamel', hex, process }
    layers: {},          // name → { kind: 'vector'|'text'|'signature', ... , line }
    sides: {},           // front/back → { silhouette: [], steps: [ { op, area, material?, params, image?, line } ] }
    assets: {},          // key → { path, sha256 }
  };
}

// px per mm on the card grid (card body width in px / card width in mm)
export const pxPerMm = (doc) => doc.card.rect[2] / doc.card.size_mm[0];

// Area AST → list of referenced names (for validation and for engines)
export function areaRefs(area) {
  if (!area) return [];
  return [...area.terms, ...(area.minus || []), ...(area.within || [])].map(t => t.ref);
}
