# Studio Morgana: execution plan (infrastructure)

Goal: a web godtongue renderer that turns any `.gt` piece into a finished graphic fast enough to generate,
edit and export like Canva, with materials, surfaces and light Canva cannot do.
Background and the customer: the "Morgana: First Principles" doc.

## Phases

| Phase | Work | Exit criteria | Status |
| --- | --- | --- | --- |
| P0 | Scene IR v2 spec; card IR goldens; factory reference renders | Spec written; 7 card goldens and refs in repo; tests green | In progress |
| P1 | `web` engine: masks, op passes, live lighting, on the GPU | All 7 golden cards match refs within tolerance; 1240x1829 rebuild < 300 ms; 60 fps tilt | Next |
| P2 | Incremental rebuilds; in-browser export (PNG, PDF, MP4, GIF) | One-line edit < 100 ms; video export without the server | |
| P3 | `canvas` word; effects library; pattern packs in JS | Five non-card briefs built only in `.gt` | |
| P4 | Cut-out stack (runs alongside P1) | Hard-image set passes; Goku cut-out clean | |
| P5 | Generation loop: inputs to N rendered `.gt` variants | Photo + prompt + reference gives 4 valid variants < 30 s | |

## P0 tasks

- [x] Commit the codebase (godtongue, fancard-studio, rooms)
- [x] Card IR goldens: `test/golden-cards.json`, 7 cards, checked by `node test/run.js`
- [x] Factory reference renders: `golden/make-refs.sh` writes `golden/refs/<card>-<side>.webp`
- [x] Scene IR spec: `docs/scene-ir.md`
- [ ] Add `kind`, `view` and `canvas` to the compiler output (v2), keeping v1 cards byte-identical in meaning
- [ ] Add `span` provenance to layers and steps
- [ ] Brief set for Test 1: 20 briefs (photo, prompt, reference) in `briefs/`

## P1 design notes

- WebGPU first, WebGL2 fallback.
- Pipeline per face: masks (OffscreenCanvas, real fonts) → op passes into textures (height, material id,
  material params, coat) → distance fields by jump flooding for `grown by`, outlines and bevels → PBR lighting
  with an environment map and a key light.
- Parity harness: headless Chromium renders each golden with the `web` engine and diffs against
  `golden/refs/` (mean and 99th-percentile error per face).
- The factory stays as the reference, not the production path.

## Decisions still open

1. WebGPU first with WebGL2 fallback, or WebGL2 only.
2. Retire the factory once P1 passes, or keep it for offline renders.
