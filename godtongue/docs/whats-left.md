# What's left

State at 12 Nov 2026, branch `morgana-p0`. Read this with `docs/morgana-execution.md` (the order sheet) and `../studio-morgana/README.md` (the app).

## Done

- **Step 0 (0.1 to 0.5):** one renderer (`web/engine.js`), cards placed on a stage, timed flips, golden frames (`test/web.js`), the web engine is the default, the v1 factory is frozen as reference.
- **Studio Morgana, the app** (`../studio-morgana`): wall and editor, sign-in, one Cloudflare Worker (D1, R2, Workers AI GPT-OSS, Resend set up but off). Rendering runs in the browser through this engine: posters, part pins and MP4 video (WebCodecs), with no server renderer.
- **Engine additions for the app:** `__gt.draw(t, { bare })` (a cut-out with no background, cast shadow or edge band), `__gt.dispose()`, and `maskSvg` exported for part positions. The golden frames are unchanged.
- **Browser studio** (`tools/studio/`): 13 samples. Superseded by the app, but kept as a single-file tool.
- **Design canvas** (`design/studio-main-flow/project/`) and the first API spec (`docs/studio-api.md`). The app's README is now the reference for the API.

- **Design features (13 Nov):** twenty Canva, Photoshop and Illustrator basics plus a close-out (flat mode, loops, feather, vignette, vector export). What is covered and what is not: `docs/parity.md`.

## Not done, in order

1. **Step 1, logic core.** Lists and `for each`, `repeat N times`, expressions in any number slot, parameterised definitions, seeded random, `lib/patterns.gt` and `lib/charts.gt`. Proof: the Goku ornament and the mean-reversion chart rebuilt from `lib/` only, so `examples/goku/*.py` can be retired. The model writes better pieces once `lib/` exists.
2. **Steps 2 to 7** of the order sheet. Not started.
3. **Back faces in the editor.** Cards' backs compile and are listed as parts, but the editor shows the front only.
4. **Engine debts.**
   - Two lighting models (held cards and stage) should become one.
   - A card should be a real element record, not a pointer.
   - Pearl and crystal sprays and holo finishes are still skipped.
   - The execution table says golden tolerance is 2%; the code uses 0.1% (`TOL` in `test/web.js`). Fix the table.
5. **Video speed.** Encoding renders every frame in the browser. That is fine with a graphics card, but about 0.6 s a frame with software graphics.
6. **Rooms** do not render in the web engine.
7. **Sound.** Deferred to the end.
8. **Deploy.** The app runs locally (`wrangler dev --env offline`); it needs a Cloudflare account to deploy and to use Workers AI. Git is not pushed; no GitHub account is linked.
