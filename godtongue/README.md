# Godtongue (Studio Morgana, branch `morgana-p0`)

Godtongue is a plain-English language for making graphics. You write a short recipe, one statement per full stop, and the compiler turns it into a scene. Engines draw the scene: a web engine (WebGL, the default), a pure-JS SVG preview, and two engines for the older fancard factory and rooms.

```
create a card called hello.
draw a bezel called frame.
on the front.
plate the card with black mirror.
plate the frame with chrome.
sign "Hello" at 620 900.
plate the signature with gold.
```

That is `examples/hello.gt`. Build it with `node bin/gt.js build examples/hello.gt` and open the `index.html` it writes.

This repository is the working code for the Studio Morgana effort. It holds:

- the godtongue compiler (`core/`, `packs/`, `index.js`);
- the scene format it writes, documented in `docs/scene-ir.md`;
- the web engine and its single WebGL runtime (`engines/web.js`, `web/engine.js`);
- the browser studio, a page where you edit `.gt` and press Run (`tools/studio/`);
- tests and golden images (`test/`, `golden/`);
- examples, from a single card to two videos (`examples/`).

## Status

- **Step 0 is done:** one renderer, cards placed on a stage, timed flips, deterministic golden frames, and the browser studio.
- **Step 1 (logic core) is not started:** lists, loops, expressions, seeded random, and a `lib/` of patterns and charts.
- **Steps 2 to 7** are planned in `docs/morgana-execution.md`.
- **Known gaps:**
  - the Goku sample still uses Python art scripts in `examples/goku/` (`goku_art.py`, `goku_fire.py`, `trace_*.py`); Step 1 replaces them;
  - two lighting models remain (held cards and stage), to be merged into one;
  - the studio can only use the files recorded in it (the samples and their neighbours), not new uploads;
  - rooms do not run in the studio yet;
  - sound is deferred to the end.

## Requirements

- Node.js. Version 22 is what the tests were run on. `package.json` says 18 or later.
- Google Chrome or Chromium, only for the golden-frame tests and for video export. Playwright is used for both.
- `ffmpeg`, only for `web/video.cjs` (MP4 export).
- npm, only for the studio build (`tools/studio`). The compiler itself has no npm dependencies.

## Quick start

```
node test/run.js                    # 79 language and IR tests, a few seconds
node bin/gt.js build examples/hello.gt
node bin/gt.js check examples/hello.gt
node bin/gt.js engines              # list the engines
node bin/gt.js reference            # every verb, generator and style
```

`node bin/gt.js build` uses the `web` engine by default. Use `--engine svg-preview` for the pure-JS preview, and `--out <dir>` to choose the output folder.

### Golden frames (slow)

```
node test/web.js                    # renders 9 frames in a headless browser and compares them with golden/web/
BLESS=1 node test/web.js            # rewrite the goldens after an intended visual change, and say so in the commit
```

The tolerance is 0.1% mean error per pixel. Run-to-run noise is about 0.05%.

### The browser studio

The studio is generated, so it is not stored in git. To rebuild it:

```
cd tools/studio
npm install
node record.mjs     # records every file the 13 samples read into vfs.json (needs out/, so it builds them first)
node bundle.mjs     # bundles the compiler and engine into gt-bundle.js
node page.mjs       # writes studio.html
```

Open `tools/studio/studio.html` in a browser. Pick a sample, edit the godtongue on the left, and press Run (or Ctrl/Cmd + Enter). The render appears on the right. The studio runs entirely in the browser; the only network request is for the fonts.

`studio.html` is self-contained once built, so you can copy that single file to another machine and open it. Other studio files (`record.mjs`, `bundle.mjs`, `page.mjs`, `shim-*.js`, `entry.js`) are the build.

## Layout

| Path | What it is |
|---|---|
| `bin/gt.js` | command line: `build`, `batch`, `check`, `engines`, `reference` |
| `index.js` | the public entry: `compile`, `createRegistry` |
| `core/` | the compiler: split statements, read words and units, expand `$variables`, dispatch verbs |
| `packs/` | verbs and generators, each a plug-in (`card`, `elements`, `shapes`, `room`, …) |
| `engines/` | `web.js` (default), `svg-preview.js`, `fancard-py.js` (reference only), `room.js` |
| `web/` | the browser runtime (`engine.js`), capture and video tools (`capture.cjs`, `video.cjs`) |
| `tools/studio/` | the studio build and its page |
| `examples/` | samples: `hello.gt`, the Goku card, `stage/`, `video/`, `canvas/`, `rooms/` |
| `test/` | `run.js` (language tests), `web.js` (golden frames) |
| `golden/` | expected outputs for the tests |
| `styles/`, `cards/`, `briefs/` | reusable styles and earlier briefs |
| `rooms/` | the room pipeline (Python renderers and a 3D viewer), not used by the web engine |
| `docs/` | `morgana-execution.md` (the plan and progress), `scene-ir.md` (the scene format), `properties.md` (the words), `README-v1.md` (the first README) |

## The language in brief

- **Statements** end with a full stop. Comments start with `--` or `//`.
- **"it"** means the last thing named. `on the front.` and `on the back.` choose the side for the steps that follow.
- **Variables and recipes:** `define $finish as: … end.`, then `use $finish on the frame.`
- **Images** come from files next to the source: `print @photo.jpg in the window.`
- **Stages and cards:** `place a card called ticket from @ticket.gt at 540 900, scale 0.6.` and `flip the card …` with a timing.
- **Video:** a stage can carry a `timeline` with reveals, camera moves and captions; `web/video.cjs` exports it to MP4.

`docs/properties.md` lists every word the language accepts, and `node bin/gt.js reference` prints the verbs with their examples.

## Where to read next

- `docs/morgana-execution.md`: the order sheet, what is done, and the decisions taken.
- `docs/scene-ir.md`: the scene format every engine reads.
- `docs/properties.md`: the words and what can be animated.

## Git and the three folders

The git repository is one level up, in the folder that holds this project. It has three folders side by side:

```
src/
  godtongue/          this project (the compiler, web engine, studio, tests)
  fancard-complete/   the v1 fancard factory; the fancard-py engine calls it (reference only)
  room/               the room pipeline's data and page builder (build_page.py, acc_*.json)
```

Keep all three together. From a fresh clone of the bundle, the paths above work as they are.

Branch `morgana-p0` is the working branch, with 15 commits from the first fancard factory commit (`b234ea0`) to the current head. To load the repo elsewhere:

```
git clone godtongue-morgana-p0.bundle src -b morgana-p0
cd src/godtongue && node test/run.js
```

The `.zip` has the same folders at the top level, for a copy without git history. It does not include generated output (`out/`, the studio build), which the commands above recreate.
