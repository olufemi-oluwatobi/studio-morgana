# Scene IR (gtdoc)

The scene IR is the only contract between godtongue and the renderers. The compiler writes it; every engine
(`svg-preview`, `fancard-py`, `room`, and the coming `web` engine) reads it and never sees godtongue text.
It is plain JSON, deterministic for a given source, seed and asset set.

Status: **v2 is live** for `gtdoc`, `kind`, `view` and `span`; `canvas`, `faces` and the v2 layer kinds and ops land with P3. v2 is a
superset: a v1 document is a v2 document with `kind: "card"`.

## Top level

| Field | v1 | v2 | Meaning |
| --- | --- | --- | --- |
| `gtdoc` | 1 | 2 | Format version |
| `kind` | card, room | card, canvas, room | What is being made |
| `name`, `id` | yes | yes | `id` = `godtongue/<name>` |
| `card` | yes | kept for cards | Card blank: size in mm, grid, body rect, corner radius, stock, thickness, brush angle, seed, edition |
| `canvas` | — | new | Any artboard: `size_px`, optional `size_mm` and `dpi`, `bleed`, `safe`, `background`, `r`, `seed` |
| `view` | in `card` | new | How it is shown, not what it is: `bench` colour, `lights`, camera for tilt |
| `zones` | yes | yes | Named rects with corner radius (`card`, `window`, user zones) |
| `materials` | yes | yes | Name to material: metal (finish, polish), enamel (hex, process), later paper, ink, film |
| `layers` | yes | yes | Name to drawable: see Layers |
| `sides` | front, back | front, back | Each face holds `steps`. A stage element names its own side. A placed card's faces live in its own document |
| `assets` | yes | yes | Key to `{ path, sha256 }`; v2 adds `w`, `h`, `mime` |
| `stage` | — | every document (order 0.1) | `size`, `background`. Cards and canvases carry a default stage of the same size |
| `elements` | — | every document (order 0.1) | Name to element. A card or canvas is one element `card` (or `canvas`) whose `faces` are its sides. A stage element has its own body, outline, faces, placement (`at`, `turn`, `scale`), `moves`, `enter`, `exit` and `flips`. A placed card (`place a card called X from @file.gt`) carries its compiled document in `card` |
| `room` | rooms only | rooms only | Room document (see `rooms/build.js`) |

## Layers

A layer is something drawn into a mask. Every layer carries `line`, the source line that made it.

| Kind | v1 | Fields |
| --- | --- | --- |
| `vector` | yes | `svg` group on the grid (generators, `@file.svg` art) |
| `text` | yes | `text`, `font` (family, weight, style), position, size, alignment |
| `signature` | yes | `text`, script `font`, `center`, `max_width`, `size`, `rotate_deg` |
| `image` | v2 | `asset`, placement rect, `focus`, crop |
| `cutout` | v2 | `asset`, `model`, refinement params; output is an alpha mask |
| `pattern` | v2 | `generator` (seigaiha, guilloche, rays…), params, clip zone |

## Steps

A face is an ordered list of steps. Order matters: each step reads the result of the ones before it.

```json
{ "op": "engrave", "area": { "terms": [{ "ref": "lore", "mod": null, "r": null }], "minus": [], "within": [] },
  "params": { "depth_mm": 0.05 }, "line": 32 }
```

- `area` is the selection: union of `terms` (each may be `grown by r`), minus `minus`, clipped to `within`.
- v1 ops: `enamel`, `plate`, `foil`, `engrave`, `emboss`, `deboss`, `etch`, `print`, `illustrate`, `spray`
  (gloss, candy, glitter, metalflake, pearl, chameleon, matte), `inlay`, `outline`.
- v2 ops (P3): `adjust`, `filter`, `shadow`, `glow`, `blur`, `texture` (grain, grunge, halftone, riso), `cutout`.

## One renderer (order 0.2)

The web engine draws every document the same way: a list of elements, each with faces, each face built in its own maps and
lit once. A card is held, so its surface turns with the hand (`held: true`). A stage element is flat and lit by a moving
light. A card flips about its vertical axis (the hand flips it, or a timed `flip` does in a video). `web/runtime.js` is gone.

## What every renderer must produce

From the steps, a renderer builds per face: a **height** field, a **material stack** (which material is on top
at each pixel, with its params) and **coat** data (sprays, gloss). Lighting turns those into pixels. The
factory bakes three lit images; the web engine lights live. Both must agree with the reference renders in
`golden/refs/` within the P1 tolerance.

## Provenance (the edit model)

Every layer and step carries `line` and `span` `[line, col, length]` of the statement that made it. A click on a pixel resolves to the
top layer and step there, and from them to the exact source text, so an edit in the UI is an edit to one line.

## Rules

1. Deterministic: same source, seed and assets give byte-identical JSON (checked by `test/golden-cards.json`).
2. Engines never read godtongue text, and never change the IR.
3. A new word adds IR fields or ops; it never changes the meaning of existing ones without a version bump.
