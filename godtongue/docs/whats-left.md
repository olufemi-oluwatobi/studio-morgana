# What's left

State at 11 Nov 2026, branch `morgana-p0`. Read this with `docs/morgana-execution.md` (the order sheet) and `docs/studio-api.md` (the API).

## Done

- **Step 0 (0.1 to 0.5):** one renderer (`web/engine.js`), cards placed on a stage, timed flips, golden frames (`test/web.js`), the web engine is the default, the v1 factory is frozen as reference.
- **Browser studio** (`tools/studio/`): 13 samples; rebuild steps in `README.md`. `studio.html` is self-contained.
- **Studio design:** the main flow canvas, in `design/studio-main-flow/project/`. Wall (masonry, tabs, sticky header, prompt with references, light and dark), card with AI edit, card with human edit, and phone versions of each. Drag a card to Remove, New card or Edit.
- **API spec:** `docs/studio-api.md`, including drag and drop.

## Not done, in order

1. **Step 1, logic core.** Lists and `for each`, `repeat N times`, expressions in any number slot, parameterised definitions, seeded random, `lib/patterns.gt` and `lib/charts.gt`. Proof: the Goku ornament and the mean-reversion chart rebuilt from `lib/` only, so `examples/goku/*.py` can be retired.
2. **Steps 2 to 7** of the order sheet. Not started.
3. **Studio API, compiler side.** `doc.parts` (numbered parts with a statement span and an anchor point for each pin), the patch helper that replaces a part's lines, the `POST /api/cards/:id/edit` path, and a render with no debug label.
4. **Engine debts.**
   - Two lighting models (held cards and stage) should become one.
   - A card should be a real element record, not a pointer.
   - Pearl and crystal sprays are still skipped.
   - The execution table says golden tolerance is 2%; the code uses 0.1% (`TOL` in `test/web.js`). Fix the table.
5. **Renders for the wall.** Renders still carry the dark bench, so the wall uses cropped images. The compiler needs a tight-crop output.
6. **Studio gaps.** No image or font upload; rooms do not run in the studio.
7. **Design gaps.** The hosted canvas uses pre-rendered images, not live renders, and no design system is attached. The Goku sample still depends on Python art scripts.
8. **Sound.** Deferred to the end.
9. **Git remote.** Not pushed. No GitHub account is linked.
