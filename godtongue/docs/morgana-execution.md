# Studio Morgana: execution plan (infrastructure)

Goal: a web godtongue renderer that turns any `.gt` piece into a finished graphic fast enough to generate,
edit and export like Canva, with materials, surfaces and light Canva cannot do.
Background and the customer: the "Morgana: First Principles" doc.

## Phases

| Phase | Work | Exit criteria | Status |
| --- | --- | --- | --- |
| P0 | Scene IR v2 spec; card IR goldens; factory reference renders | Spec written; 7 card goldens and refs in repo; tests green | Done |
| P1 | `web` engine: masks, op passes, live lighting, on the GPU | Height and material maps match the factory's exactly (within rounding); lit look within a visual threshold of `golden/refs/`; 1240x1829 rebuild < 300 ms; 60 fps tilt | Thin slice done |
| P2 | Incremental rebuilds; in-browser export (PNG, PDF, MP4, GIF) | One-line edit < 100 ms; video export without the server | |
| P3 | Effects library; pattern packs in JS (`canvas` word already landed) | Five non-card briefs built only in `.gt` | |
| P4 | Cut-out stack (runs alongside P1) | Hard-image set passes; Goku cut-out clean | |
| P5 | Generation loop: inputs to N rendered `.gt` variants | Photo + prompt + reference gives 4 valid variants < 30 s | |

## P0 tasks

- [x] Commit the codebase (godtongue, fancard-studio, rooms)
- [x] Card IR goldens: `test/golden-cards.json`, 7 cards, checked by `node test/run.js`
- [x] Factory reference renders: `golden/make-refs.sh` writes `golden/refs/<card>-<side>.webp`
- [x] Scene IR spec: `docs/scene-ir.md`
- [x] Compiler emits v2: `gtdoc: 2`, `kind`, `view` (v1 fields kept for the factory; `canvas` comes with the P3 word)
- [x] `span` provenance on every layer and step: `[line, col, length]`
- [x] Brief set for Test 1: `briefs/briefs.csv`, 20 briefs (photos and references to source, except Goku)

## P1 design notes

- WebGPU first, WebGL2 fallback.
- Pipeline per face: masks (OffscreenCanvas, real fonts) → op passes into textures (height, material id,
  material params, coat) → distance fields by jump flooding for `grown by`, outlines and bevels → PBR lighting
  with an environment map and a key light.
- Parity harness: headless Chromium renders each golden with the `web` engine and diffs against
  `golden/refs/` (mean and 99th-percentile error per face).
- The factory stays as the reference, not the production path.

## P1 thin slice (done)

- `engines/web.js` + `web/runtime.js`: IR to a self-contained page. Per-step SVG masks are composited on 2D
  canvases into five maps (colour, metal/rough/coat, height up, height down, flakes); one WebGL2 pass lights them
  each frame with a procedural studio. `node web/shot.cjs <index.html> <out.png> [side]` checks it headless.
- Covers plate, foil, enamel, emboss, deboss, engrave, etch, print, illustrate, gloss, glitter, candy, matte.
- Measured in headless Chromium on software GL (a floor, not a target machine): full build 1.0 to 5.4 s per face
  (Bride 6 steps, Marilyn 24 steps); the lit frame itself is one cheap pass.
- Known gaps against the factory: enamel is paler, fine embossed gold lines read dull, signatures are stretched
  to their max width, glitter is crude, no pearl/chameleon/holo/crystal, no brushed anisotropy.

## P1 remaining

- Move map building from 2D canvas to GPU passes. Profiled on Goku (headless, software GL): blur is not the cost
  (2.07 s with, 1.90 s without); rasterising the SVG masks is (about 2.0 s when forced up front), compositing about
  0.7 s. Tried rasterising each layer once and building masks by canvas stamping: no faster in software and
  worse outlines, so reverted. Next attempt: rasterise layers once, then union, minus, within and "grown by"
  as WebGL passes (jump-flood distance field), never 2D canvas. Must be measured on a real GPU, not headless.
- Parity harness on maps: export the factory's height and material maps and diff them, not the lit pictures.
- Material response tuning against `golden/refs/`; signature fitting; missing sprays and finishes.
- WebGPU path, WebGL2 kept as fallback.

## Decisions (defaults taken, change if needed)

1. WebGPU first, WebGL2 fallback.
2. The factory stays only as the reference the web engine is tested against.
