# Where godtongue stands against Canva, Photoshop and Illustrator

State at 13 Nov 2026, after three rounds (twenty features, then a close-out). Each line is a thing those tools do;
"yes" means there is a word for it, tested in `test/run.js`, with an example in `examples/canvas/` or `examples/video/`.
The words are in `docs/properties.md`. This list is the starting point for changes to the language itself.

## Canva (layout, type, photos, quick effects)

| Thing | State | How |
| --- | --- | --- |
| Any-size page, exact colours | yes | `create a canvas …, flat.` |
| Solid, gradient and see-through fills | yes | `enamel … in a gradient …`, `40% opacity` |
| Text: fonts, size, tracking, several lines, alignment, leading | yes | `write …` |
| Text: exact wrapping and fit-to-width | yes | `880 wide`, `fit 780` (measured in the font) |
| Text: on an arc, tilted, outlined, shadowed | yes | `curved`, `turned`, `stroke`, `shadow` |
| Shapes: rectangle, circle, ellipse, star, polygons, heart, arrow, bubble, line, curve | yes | `draw a …` |
| Photos in any shape (frames), with filters and duotone | yes | `print @photo.jpg in the <shape>, …` |
| Frosted glass, grain, vignette | yes | `adjust`, `grain`, `vignette` |
| Align, distribute, grids | yes | `align`, `distribute`, `copy … rows` |
| Entrance and exit animations, looping motion | yes | `bring in …, popping`, `float`, `pulse`, `sway` |
| Fonts beyond the 15 built in; uploading a font | no | needs a font loader and its measurements |
| Text: underline, highlight box, bullet lists, mixed styles in one line | no | one style per `write` |
| Multi-page pieces (decks, carousels) | no | one page per source |
| Background remover | no | needs a cut-out model |
| Drag, resize and type on the canvas | no | the editor is source plus a command box; every layer already records its line |
| Templates and brand kits | no | styles exist (`use the … style`) but there is no library |

## Photoshop (effects and compositing)

| Thing | State | How |
| --- | --- | --- |
| Drop shadow, inner shadow, outer glow, stroke | yes | `shadow`, `shadow …, inside`, `glow`, `stroke … in` |
| Bevel and emboss, as real relief with real light | yes, beyond | `emboss`, `engrave`, `deboss` (not on a `flat` piece) |
| Gradient overlay, colour overlay, opacity, 15 blend modes | yes | `enamel …, multiply` |
| Adjustment layers: blur, brightness, contrast, saturation, hue, grayscale, sepia, invert | yes | `adjust the <area>, …` |
| Clipping to a shape; feathered edges | yes | `within`, `feathered 20` |
| Duotone, grain, vignette | yes | |
| Inner glow, satin, pattern overlay | no | |
| Curves, levels, selective colour | no | only the simple adjustments above |
| Masks painted by hand; selections; cut-outs | no | areas are shapes, text and their combinations |
| Smart filters beyond blur (liquify, sharpen, distort) | no | |
| Effects that change over time | no | effects are fixed; only whole objects move |

## Illustrator (vector drawing)

| Thing | State | How |
| --- | --- | --- |
| Shapes, lines, smooth curves through points | yes | `draw a shape/line/curve … from … through … to …` |
| Any SVG path, placed, scaled and turned; SVG files | yes | `draw a path called x, "M…", at …`, `draw @sketch.svg` |
| Move, turn, scale, flip, mirror, group, dash, hollow | yes | |
| Combining shapes: union, minus, intersect, offset | yes, per step | `the a and the b`, `except`, `where it meets`, `grown by` |
| Repeats: ring, row, grid, and loops with sums | yes | `copy …`, `repeat N times as: … end.` |
| Reusable symbols with settings | yes | `define a rose with $size 60 as: … end.`, `place a rose …` |
| Vector export | partly | `--engine svg`, and SVG in the app's Export menu: fills, gradients, shadows, glows, photos, text. Shapes are exported through masks, not as plain editable paths |
| Combined shapes kept as a new shape (pathfinder results you can reuse) | no | combinations exist only inside a step's area |
| Gradients and patterns on strokes; variable-width strokes; arrowheads on lines | no | |
| Editing a path point by point; nested loops; conditions; lists | no | the logic core has sums, variables, definitions and one level of `repeat` |
| Blends, meshes, perspective | no | |

## Things in the language that got in the way

The plain-English layer (`docs/english.md`) answers 2, 3, 5, 6 and the loop part of 7 for pieces that start with "Let there be"; 4 is fixed on flat pieces; 1, 8, 9 (beyond whole objects) and 10 are open.

Found while building these; they are candidates for the next round of language changes.

1. A layer cannot be named `ring`, `outline`, `edge` or `halo` (they mean "the outline of" in an area), and the error does not say so.
2. `inside` and `within` are area words, so "shadow the panel, inside" works only because the shadow verb looks for it.
3. Colour is always called `enamel`, even on a flat poster. `fill`, `colour` and `paint` are aliases, but the guide and examples teach `enamel`.
4. On paper and card objects colour multiplies (white is invisible); on a canvas it covers. The same sentence gives different results.
5. Effects depend on statement order (a shadow before its shape, an inner shadow after), and nothing warns when the order is wrong.
6. `stroke` means two things: draw a shape as a line (no colour given) or outline an area (colour given).
7. Blocks do not nest (`repeat` inside `repeat`, or inside `define`), and a block must open with `as:`.
8. A text layer has one style; there is no way to style a word inside a line.
9. Timing words exist only for whole objects (`glide`, `fade`, `float`) and for reveals; a step's own numbers (opacity, blur, colour) cannot change over time.
10. A flat piece ignores relief and metal silently; a mixed piece (flat page, one chrome headline) is not possible yet.
