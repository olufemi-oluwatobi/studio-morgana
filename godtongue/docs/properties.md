# Properties and words (Morgana)

Every word a godtongue user can write. "Animatable" says whether the word can take a timed change (`change … to … over … s`)
once order 5.1 lands; until then the timed words are the ones marked "timed".

| Word | Example | Scope | Animatable | Status |
| --- | --- | --- | --- | --- |
| `create a card` | `create a card called hello from brass, 0.8 mm thick.` | document | no | done |
| `create a canvas` | `create a canvas called post, 1080 by 1350.` | document | no | done |
| `create a stage` | `create a stage called three-bodies, 1500 by 1100, on #cfc6b4.` | document | no | done |
| `create a video` | `create a video called desk, 1080 by 1350, on #c9b99a, 3 s long.` | document | no | done |
| `make a paper / card / piece / plate` | `make a paper called memo from bond, 760 by 1000, at 540 900.` | element | yes (`at`, `turned`) | done |
| `place a card` | `place a card called ticket from @desk-ticket.gt at 540 720, scale 0.7.` | element (on a stage) | yes (`scale`, `at` through moves) | done (order 0.3) |
| `flip` | `flip the ticket at 1.2 s, over 0.8 s.` | element with a back face | timed | done (order 0.3) |
| `flip` (layers) | `flip the wing upside down.` | layer | no | done (existing) |
| `bring … to the front`, `send … behind …` | `send the memo behind the ticket.` | element | no | done |
| `bring in`, `slam … in`, `remove … at T s` | `slam the plaque in at 0.8 s.` | element | timed | done |
| `glide … to x y` | `glide the memo to 300 400, turned 6, at 2 s, over 1 s.` | element | timed | done |
| `reveal … at T s` | `reveal the title at 1 s, over 0.5 s, from the left.` | layer | timed | done |
| `caption … at T s` | `caption "Quants" at 2 s, for 3 s.` | caption | timed | done |
| `spray … with` | `spray the card with glitter, 30 µm thick.` | step | timed (`at`, `for`) | done |
| `enamel … in a gradient` | `enamel the card in a gradient from #1b1145 to #ffb347, angled 80.` (or `in a radial gradient …`) | step | not yet | done |
| opacity and blend | `enamel the leaf in #0e6b4f, 85% opacity, multiply.` (multiply, screen, overlay, darken, lighten, soft-light, …) | step (enamel, print, glow) | not yet | done |
| `shadow` | `shadow the title, 10 down, 6 right, blur 14, in #2a0a3a, 60% opacity.` | step (write it before the colour) | not yet | done |
| `glow` | `glow the sun in #ffd98a, 90 wide, strength 2.` | step | not yet | done |
| photo adjustments | `print @photo.jpg in the window, grayscale, contrast 1.25, blurred 4, brightness 1.1, saturation 0.6, hue 40, sepia.` | step | not yet | done |
| photo in a shape | `print @photo.jpg in the portrait.` (any drawn shape: the photo fills it) | step | no | done |
| text lines and alignment | `write "Golden\nHour" …, leading 0.92, aligned left.` and `…, 780 wide` to wrap (widths are estimated, not measured) | layer | no | done |
| text on an arc | `write "LIMITED EDITION" …, curved 222, tracking 8.` (negative curves the other way) | layer | no | done |
| placed paths | `draw a path called leaf, "M0 0 C40 -70 …Z", at 720 640, scale 1.6, turned -24.` | layer | no | done |
| `fade in`, `fade out` | `fade in the title at 0.4 s, over 0.8 s.` | element | timed | done |
| easing | `glide the ball to 880 300, at 0.5 s, over 1.4 s, bounce.` (linear, ease-in, ease-out, overshoot, bounce, elastic) | element, camera | timed | done |
| measured text | wrapping (`880 wide`) uses each font's real widths (`core/font-metrics.js`, rebuilt by `node tools/font-metrics.cjs`) | layer | no | done |
| `fit` | `write "LAUNCH DAY" …, fit 780.` (the size that makes the longest line that wide) | layer | no | done |
| text `turned` | `write "NEW!" …, turned -6.` | layer | no | done |
| `stroke … in` | `stroke the title in #1b1145, 8 wide.` (a flat outline outside the edge) | step | not yet | done |
| inner shadow | `shadow the panel, inside, 6 down, blur 10, 45% opacity.` | step (after the colour) | not yet | done |
| `adjust` | `adjust the glass, blurred 18, brightness 1.15.` (an adjustment layer over what is beneath) | step | not yet | done |
| `duotone` | `print @photo.jpg in the photo, duotone #1b1145 and #ff9a5a.` | step | no | done |
| `grain` | `grain the card, 0.22.` | step | not yet | done |
| more shapes | triangle, diamond, pentagon, hexagon, octagon, heart, arrow, bubble | layer | no | done |
| `align`, `distribute` | `align the title and the when to the left.` `distribute the one, the two and the three horizontally.` | layers | no | done |
| grid of copies | `copy the dot 8 times, 46 apart, 5 rows.` | layer | no | done |
| entrances and exits | `bring in the badge at 0.2 s, popping.` (popping, rising, zooming, fading) · `remove the banner at 4.3 s, shrinking.` (shrinking, fading, sinking) | element | timed | done |
| looping motion | `float the badge, 16 high, every 2 s.` `pulse …, by 0.04, every 1.2 s.` `sway …, 8 degrees, every 1.5 s.` `turn the wheel, every 3 s.` | element | timed | done |
| `flat` | `create a canvas called poster, 1080 by 1350, flat.` (exact colours, no studio light; also on a stage or video) | document | no | done |
| `repeat … as:` | `repeat 9 times as: draw a circle called orbit, (70 * $n) big, at 540 560, hollow 3. end.` ($n counts from 1, $i from 0) | block | no | done |
| `feathered` | `enamel the core in #ffd166, feathered 6.` (also on `print`) | step | not yet | done |
| `vignette` | `vignette the card, 0.35, in #1f3a5f.` | step | not yet | done |
| vector export | `node bin/gt.js build poster.gt --engine svg` (cards and canvases; relief, sprays, grain, adjust and inner shadow are left out) | engine | no | done |

A layer cannot be called `ring`, `outline`, `edge` or `halo`: in an area those words mean "the outline of".
