# Fancard Studio

Parametric metal fan-card engine. One YAML manifest → interactive card page, review stills, and per-operation production plates.

## Requirements
- Python 3.10+: `pip install numpy scipy pillow pyyaml potracer`
- Node 18+: `npm i playwright` (Chromium is used to draw masks with real fonts)
- Fonts: bundled in `fonts/` (@fontsource woff2, OFL). Override with `FANCARD_FONTS=/path/to/@fontsource`.

## Build
```
python3 fancard.py MANIFEST [--patch PATCH ...] [--set path=value ...] [--out DIR] [--keep-masks]
```
| Flag | Effect |
|---|---|
| `--patch FILE` | deep-merge a patch manifest on top (repeatable; a different `kind` replaces a component) |
| `--set a.b.c=value` | override one value (repeatable) |
| `--out DIR` | output root (default `out/`) |
| `--keep-masks` | also write every drawn mask to `out/<id>/masks/` |

Output in `out/<id with / → __>/`:
| File | What |
|---|---|
| `card.html` | self-contained tilt + flip card; each side baked under 3 lights (−1, 0, 1) as WebP, cross-faded on tilt |
| `preview-front.png`, `preview-back.png` | centre-light stills |
| `production/` | one plate PNG per op + `production.json` (op list, metals, depths) |
| `resolved.card.yaml` | the manifest after patches/sets, as built |

Build time ≈ 30–40 s per card.

## Pipeline
1. **load**: manifest ← patches ← `--set`; `{edition.no:03}`-style tokens filled from the manifest.
2. **masks**: every component is drawn white-on-transparent in Chromium canvas (`MASKS_JS`, run via `node masks.js spec.json dir`). Components can emit sub-masks (`name-holes`, `name-stones`, …).
3. **ops**: each side's ops run in order, building a height map and a stack of material layers (`run_side`).
4. **light**: height → normals → each layer shaded by its process (`shade_metal`, `shade_enamel`, `shade_holo`, `shade_mirror`, `shade_glass`, `shade_frost`, `shade_crystal`, `shade_stock`) under 3 light angles.
5. **template**: baked images + photo go into `TEMPLATE` (card shell HTML/CSS/JS).

## Manifest (v0.2)
```yaml
fancard: 0.2
id: name/set-01               # output folder: name__set-01
template: rose-field@1        # label only; pin generator versions here
seed: 20261107
edition: { "no": 1, of: 100, set: 1 }   # quote "no" (bare no = YAML false)
creator: { name: ..., handle: ... }
blank:  { stock: stainless, thickness_mm: 0.8, size_mm: [54, 83.43], grid: [1080, 1669] }
zones:  { card: {rect, r}, window: {rect, r, arch?}, sig-front: {center, max_width, size, rotate_deg, overlay} }
tokens: { enamel: {...}, metal: {...}, type: {...}, filter: {...} }
components: { <name>: { kind, place?: {at: zone}, params | items } }
sides:  { front: { ops: [...] }, back: { ops: [...] } }
render: { lights: [-1, 0, 1], bench: "#hex" }
produce: { separations: per-op }
```

### Mask expressions (op `mask:`)
| Form | Meaning |
|---|---|
| `name` | component mask (components beat zones on a name clash); `card`/`full` = whole blank |
| `name-sub` | a component's sub-mask (e.g. `filigree-holes`, `field-p2`) |
| `[a, b]` | union |
| `-name` | subtract |
| `"&name"` | intersect (quote it: bare `&` is YAML anchor syntax) |
| `"grow(name,r)"` | dilate by r px (quote it) |
| `"halo(name,r)"` | soft ring around name |
| `place: { comp: zone }` | draw a placeable component (e.g. signature) in a given zone |

### Ops
| op | params | Effect |
|---|---|---|
| `brush` | `angle_deg` | lays the blank stock with brushed grain |
| `plate` | `metal` | electroplate/PVD a metal token onto the mask |
| `foil` | `metal`, `emboss` | hot-foil (metal/holo) with optional raise |
| `engrave` | `depth_mm` | cut into the surface |
| `enamel` | `color` | fill (follows the last engrave depth) |
| `emboss` | `height_mm`, `soft` | raise; additive (stack for sculpted relief) |
| `deboss` | `height_mm` | press down |
| `etch` | none | frost/matte |
| `print` | `image: {src, focus, zoom?, bake?, filters}` | UV print a photo into the mask; `bake: true` for secondary prints (knockout off by default) |

### Materials
- **Metals** (`finish`, `polish: mirror|satin`): gold-24k, gold-yellow, rose-gold, silver, copper, gunmetal, black-chrome, pvd-blue-titanium, pvd-purple, yellow-foil, lime-foil, orange-foil, ruby, garnet, oxblood
- **Holo foils**: holo-rainbow, holo-rose, holo-ice, holo-gold
- **Mirrors**: mirror-chrome, mirror-gold, mirror-black, mirror-rose
- **Glass blanks**: glass-clear, glass-smoke, glass-rose
- **Crystal**: `finish: crystal`, optional `tint: "#hex"` (coloured stones)
- **Stocks (blank)**: brass, stainless, aluminium, titanium, anodized-navy, anodized-midnight, anodized-black
- **Enamel**: `{ name, hex, process: soft-enamel | glow-enamel }`

### Photo filters (`print.image.filters`, applied in order)
| kind | params |
|---|---|
| `grade` | `preset`: amber-sepia, teal-cold, crimson, rose, night-blue, night-flash, pop, silver-noir, noir, none |
| `split-tone` | `shadows`, `highlights`, `amount` |
| `fade` | `amount`, `color` |
| `halation` | `threshold`, `radius`, `color`, `amount` |
| `halftone` | `cell`, `amount` |
| `vignette` | `amount` |
| `grain` | `amount`, `size`, `chroma` |
| `datestamp` | seven-segment LED date (`text`, position, colour) |

### Component kinds
| kind | Sub-masks | Notes |
|---|---|---|
| `shape.draw` | — | `items:` list of primitives (below) |
| `type.stack` | — | stacked lines of text in a zone |
| `type.signature` | — | script text fitted to a zone (`text`, `font`) |
| `frame.double-rule` | | double rule border |
| `frame.oval-cartouche`, `frame.oval-medallion` | | oval frames |
| `ornament.palmette-fan`, `ornament.palmette-finial` | | classical corner/finial ornaments |
| `ornament.art-deco-sunburst` | | deco corner rays |
| `ornament.acanthus-frame` | | acanthus scroll frame |
| `ornament.tiara-filigree` (v2) | `holes`, `stones` | crest, band, side chains, corner fans, swag; params `weight, spread, fan, chain, border, sag, pendant, crest, chains:false, corners:top` |
| `ornament.talon-fan` | `lace`, `stones` | stiletto claws with lace cut-outs: `talons: [[x, y, angle°, length, width, bend], ...]` |
| `ornament.thorn-rose` | `leaf`, `thorns`, `detail` | two weaving thorned vines round a zone + roses: `weight, off, amp, wave, thorn, thorn_len, thorn_w, leaf, leaf_len, roses: [[x, y, R, rot]], vine:false` |
| `ornament.rose-field` | `p1`, `p2`, `p3`, `leaf`, `detail`, `bed` | sculpted 4-layer roses packed edge to edge, leaves in gaps, recessed bed; `seed, rmin, rmax, count, pad, leaves, roses (explicit), base:false` |
| `border.wave-scroll` | | wave scroll border |
| `pattern.ogee`, `pattern.guilloche` | | fill patterns |
| `artwork` | per layer | external SVG layers: `src: art/x.svg, layers: { fill: "#relief", veins: "#ink" }` |

### `shape.draw` primitives
line, rect, circle, ellipse, text, para, ring-text, barcode, waves, sparkle, perforated, hatch, scatter, path, pixelart, dotline, seg7, grid3d, pixels, stone-ring, rosette

## Files
| Path | Purpose |
|---|---|
| `fancard.py` | engine (all of the above) |
| `art_trace.py` | ink PNGs → layered SVG for the `artwork` component: `python3 art_trace.py OUT.svg relief=fill.png ink=lines.png [--invert]` |
| `manifests/*.card.yaml` | cards; `*.patch.yaml` = variants |
| `art/` | acanthus round-trip test assets |
| `assets/` | photos used by manifests |
| `fonts/` | bundled @fontsource fonts |
| `backups/fancard.pre-*.py` | engine snapshots before talon, thorn-rose, rose-field changes |

## Cards
| Manifest | Look |
|---|---|
| `sienna-rae.card.yaml` (+ `jade-cobalt.patch`) | filigree oxblood; jade/blue-titanium variant |
| `tinsel-queen.card.yaml` | holo photocard / holo postcard back |
| `tinsel-queen.silver-acanthus.card.yaml` (+ artwork, mirror, glass patches) | silver acanthus; mirror and glass bases |
| `90s-camera.card.yaml` | navy anodized, lime glow enamel, night-flash, LCD datestamp |
| `prom-queen.card.yaml` | HUD mirror version (superseded) |
| `prom-queen.tiara.card.yaml` | tiara filigree on mirror chrome (approved). Signature is a placeholder |
| `talon-queen.card.yaml` | gold claws + tiara on pink mirror (draft) |
| `tirzee.card.yaml`, `tirzee-2.card.yaml` | rose-field |
| `vespers.card.yaml` | navy anodized, faceted holo crescent, silver line work, no photo |

## Known gaps
- Plates are screen resolution; factory needs vector or 1200 dpi output.
- Generators are not version-pinned in code: changing a kind changes every card that uses it.
- Glass and mirror bases need manufacturer confirmation.
- `fancard.py` is one file; split into engine / ornaments / primitives when it grows further.
