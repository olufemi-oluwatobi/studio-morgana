# Godtongue

A plain-English language for manufacturing fancards. Write a card as a recipe, one statement per full stop, and an engine builds it.

```
create a card called marilyn, seed 19260601.
use the studded bezel style.

on the front.
use $studded-finish.
print @marilyn.jpg in the window, focused at 0.5 0.2.
write "fancard" called wordmark in Bodoni Moda italic, at 620 230, size 58.
sign "Marilyn" at 620 1478.
use $gild on the wordmark and the signature.
```

That file is about 150 tokens. The same card in v1 was a manifest plus an art script of about 7,200 tokens.

## Run it

Node 18 or later, no npm packages.

| Command | What it does |
|---|---|
| `node studio/server.js` | the studio at http://localhost:4400: editor, Run, engine picker, drawing pad, reference |
| `node bin/gt.js build card.gt --engine svg-preview` | build one card (`--engine fancard-py` for the physical render) |
| `node bin/gt.js batch template.gt cards.csv` | one card per row; each column becomes a `$variable` |
| `node bin/gt.js check card.gt` | compile only and list problems |
| `node bin/gt.js engines` / `reference` | list engines / every verb, generator and style |
| `node test/run.js` | language tests |

The `fancard-py` engine needs the v1 factory. By default it looks in `../fancard-complete/fancard-studio`. Set `FANCARD_HOME`, or write `godtongue.config.json` with `{ "fancardHome": "/path/to/fancard-studio" }`.

## How it fits together

```
card.gt → core (split, read, $ and @, dispatch) → Card Document (JSON) → engine → output
             packs/ plug in verbs, generators, materials, styles      engines/ are swappable
```

- **core/** splits statements, reads words and numbers with units, expands `$variables` and dispatches each statement to the verb that claims it. It names no verb, material or generator itself.
- **packs/** are plug-ins. Each registers verbs, generators, materials, colours or styles. Add a file and list it in `index.js`.
- **styles/** are `.gt` files written in godtongue. `studded-bezel.gt` becomes `use the studded bezel style.`
- **engines/** each read the Card Document: `svg-preview` (instant, pure JS) and `fancard-py` (calls the locked v1 factory). Drop in another file with `{ name, label, describe, supports, build }` and it appears in the studio.

## The language

**Statements** end with a full stop. `0.8 mm` and `@photo.jpg` don't end a statement. Comments start with `--` or `//`.

**"it"** is the last thing named. `on the front.` and `on the back.` choose the side for the following steps.

**Variables and recipes**
```
define $chrome as mirror chrome.
define $finish as:
  plate it with $chrome.
  outline it in niello, 6 wide.
end.
use $finish on the frame and the scrolls.
```

**Images** are the only outside files: `@photo.jpg`, or a drawing `@sketch-1.svg`.

**Modifiers** come after commas and read the same for every verb and generator:

| Form | Example |
|---|---|
| number then word | `38 apart`, `0.16 mm high`, `24 big`, `88 in` |
| word then number | `size 58`, `density 0.7`, `flakes 110 µm`, `tilted -6` |
| place | `along the frame`, `around the window`, `at 620 1478`, `inside the strip` |
| repeats | `leaves every 114`, `with blossoms every 228` |
| switches | `without the crest`, `leaving a gap at the top`, `clear of the corners and the middles` |
| name | `called studs` |

**Areas** say where a step happens:

| Phrase | Meaning |
|---|---|
| `the frame and the studs` | both |
| `the outline of the frame by 6` | a 6 px ring round it |
| `the vine grown by 5` | the vine, 5 px bigger |
| `the card except the window` | subtract |
| `the rays where it meets the window` | intersect |

### Verbs

| Verb | Example |
|---|---|
| create | `create a card called oxana from stainless, 0.8 mm thick, edition 1 of 100.` |
| set | `set the bench to #0e0f12.` · `set the title to "Oxana".` |
| make | `make the window 756 by 1345, at 242 242, corners 9.` |
| define · use | see above; `use the studded bezel style.` |
| on · let | `on the back.` · `let the scrolls break the card edge.` |
| draw · set · grow · fill | `draw a bezel called frame.` · `set studs along the frame, 38 apart.` · `fill the strip with crosshatch.` |
| plate · foil | `plate the frame with chrome.` · `foil the rays with silk holo.` |
| engrave · enamel · inlay · outline | `inlay the vine with ivory.` · `outline the frame, 6 wide.` |
| emboss · deboss · etch | `emboss the studs, 0.24 mm high, soft 1.` |
| spray | `spray it with glitter in pale gold and deep gold, flakes 110 µm, density 0.7.` |
| print · illustrate | `print @photo.jpg in the window.` · `illustrate @poster.jpg in the window, 16 colours.` |
| write · sign | `write "fancard" in Bodoni Moda italic, at 620 230, size 58.` · `sign $name at 620 1478.` |

### Generators

bezel, rule, band, ironwork, studs, jewels, rims, beads, vine, dots, crosshatch, damask, rays, plus `draw a path …` and `draw @sketch.svg …`. Each one lists its settings in the studio's Reference tab.

## Batch production

```
node bin/gt.js batch examples/batch/template.gt examples/batch/cards.csv --engine fancard-py
```

`cards.csv` has a header row such as `id,name,photo`. Each row builds one card, with `$id`, `$name` and `$photo` filled in, and no AI is involved.

## Extending

- **New generator:** in a pack, `reg.generator({ name, words, help, params, run(ctx, mods, name) })` returning `{ kind: 'vector', svg, path?, points?, clip? }`. It gets the shared modifier grammar for free.
- **New verb:** `reg.verb({ words, help, examples, run(ctx, toks) })`. Use `readArea`, `readMaterial` and `readMods` from `core/phrases.js`.
- **New engine:** a file in `engines/` exporting `{ name, label, describe, supports(doc), build(doc, { outDir, log }) }`.
- **New style:** a `.gt` file in `styles/`.
