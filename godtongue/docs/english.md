# The plain-English layer

Seven words carry most sentences. The craft operations (emboss, engrave, plate, print, spray, …) keep their own first word.

| Word | Job | Example |
| --- | --- | --- |
| `Let` | Brings a thing into being, or names a value | `Let there be a circle called sun, 330 big, at 800 330.` · `Let navy be #1f3a5f.` |
| `Write` | Makes text | `Write "Golden Hour" called title in Lilita One, size 170.` |
| `Make` | Applies a known word to a thing | `Make the sun gold.` · `Make the title glow in #ffd98a, 40 wide.` |
| `Give` | Gives a thing something it has, or sets one value | `Give the title a shadow, 10 down.` · `Give the glow a width of 90.` |
| `Move` | Puts a thing somewhere else | `Move the badge to 540 300.` · `Move the ball to 880 300 over 1.4 s, bouncing.` |
| `Change` | A change over time | `Change the badge to 120% size for 0.5 s, then back.` |
| `When` | An event | `When the ball arrives, change the banner to visible over 0.4 s.` |

Examples: `examples/canvas/pattern-en.gt`, `examples/canvas/launch-en.gt`, `examples/video/events-en.gt`.

## Two ways a piece is put together

- A piece that starts with **`Let there be …`** arranges itself. What a thing was made belongs to the thing; things stack
  in the order they were let; each paints as shadow, glow, frost, colour, craft steps, adjustments, outline, inner shadow.
  The page's grain and vignette go over everything. The order of the sentences does not matter, and there is no `on the front.`
- A piece that starts with **`create …`** paints in sentence order, exactly as before. `make` and `give` work there too, and
  paint at once.

## Several things, without loops

```
Let there be 9 circles called orbit, at 540 560, the first 70 big, each 70 bigger than the last.
Let there be 12 triangles called ray, 46 by 150, in a ring around 540 560, 450 out.
Let there be 40 circles called dot, 7 big, in a grid 8 by 5, 46 apart, from 70 70.
```

Arrangements: `in a row`, `in a column`, `in a grid C by R` (with `N apart`, `from x y`), `in a ring around x y` (with `N out`).
Differences: `each N bigger than the last`, `each N% smaller`, `each turned N more`.
Afterwards `the orbits` is all of them; `the third orbit`, `the last orbit` and `every other orbit` pick some.

## Layout in words (`packs/layout.js`)

Things go in, under or beside other things, so nobody adds up coordinates.

| Say | What happens |
| --- | --- |
| `Write "NEW!" in the sticker.` | centred inside it (a lone shape such as a triangle is centred by eye, not by its box) |
| `… in the cover, at the bottom left, 120 in.` · `… at the top left of the cover` | at a corner or side of it, inset |
| `Write "url" at the bottom right.` | the same, on the page, inside its margin |
| `… under the heading, 40 apart.` · `… above …` | below or above it; lined up with a left- or right-aligned heading, else centred; `lined up on the right`, `centred` choose |
| `… beside the play, 16 apart.` · `… left of …` | next to it, on its middle (words beside words share a baseline) |
| `Let there be a triangle called icon, 22 big, pointing right, in the play.` | turned first, then placed (`pointing up/down/left/right`, or `turned 30`) |
| `Move the badge under the title, 20 apart.` | the same words move a thing that exists |
| `Let the margin be 120.` · `Let the gap be 24.` | the page margin, and the gap when none is said |
| `Let text be in Jost, size 26, aligned left.` | every `Write` starts from this |
| `Let a heading be Martian Mono, size 26, tracking 6, brass.` · `Write "01 COLOUR" as a heading.` | a named text style: its font, its settings and its looks (colour, shadow …) |
| `Write "Oxblood", "Midnight", "Forest" in each swatch, at the bottom left, 20 in.` | one label per thing; they are `the swatch-labels` |
| `Make the swatch-labels readable, bone or ink.` | whichever of the two reads best on what ends up under each |
| `Let there be a table called playlist, 1436 by 448, at 800 650, 8 rows, columns at 28, 78, 818 and 1398 right, in Jost, size 24.` | a table: row backgrounds `the playlist-rows`; columns from its left edge, `right` aligns a column |
| `Write "1", "Lanterns", "Vesper Lane", "4:07" in the next row of the playlist.` | a row (`the next row`, `the third row`, `row 3`); its words are `the third playlist-words`, every cell `the playlist-words`, a column `the playlist-column-4` |

Examples: `examples/canvas/layout-en.gt`, and the proof pieces `examples/proof/brand-guide.gt` (one fixed position) and
`examples/proof/player-skin.gt` (four).

## Adding a word

`make` and `give` know a word because it is in the dictionary. One entry adds it everywhere (both verbs, the errors'
suggestions, `gt reference`, and the model's guide):

```js
reg.word({
  words: ['glow', 'glowing'], kind: 'effect',          // effect | colour | state | transform | motion
  help: 'Light round the thing.', example: 'Make the sun glow in #ffd98a, 90 wide.',
  apply(ctx, a) { a.slot('glow', { verb: 'glow', head: '', mods: a.mods.map(txt) }); },
});
```

`a.things` are the things named, `a.rest` the words after the known word, `a.mods` the comma details, `a.lead` any number
before it ("1.6 times bigger"). `a.slot(name, sentence)` gives the thing a look in a named place of its stack;
`a.fillMod(text)` adds a detail to its colour. A transform or motion acts at once instead. `reg.finish(fn)` runs after
the last sentence. The whole layer is `packs/english.js`.

## Not done

- `Change` works on whole objects in a video (visible, size, turn). A colour, blur or any effect value cannot change over time yet.
- `When` knows times and what objects do. Taps and hovers are refused: a rendered video has no viewer input.
- Moments resolve in sentence order: `When the ball arrives` must come after the sentence that moves the ball.
- A converter from old sources to this style is not written. Old sources keep working unchanged.
- Text on an arc covers half a circle at most; plurals cannot vary one dimension (bars of different heights).
- A thing cannot be called `a`, `an`, `the` or `it` (they are read as articles), nor `ring`, `outline`, `edge`, `halo`.
