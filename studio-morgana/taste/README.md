# The taste book

Everything the generator may choose from. The model never designs: it picks from this book (step 1, taste), fills a
template's slots (step 2, spec), and code writes the godtongue (step 3, script).

- `palettes.json`   colour sets. Every palette fills the same four roles, so any palette fits any template:
                    `ground` (the background), `ink` (text and fine lines), `accent` (the loud colour, used big),
                    `second` (a support colour: a second ink, rules, image tints). Each role says its share and its use.
- `type.json`       type systems: a display face and a label face, each with weight, tracking (a fraction of the size,
                    so it scales), leading and case; and the sizes allowed (the scale).
- `spacing.json`    spacing systems: the side margin as a fraction of the width, and the line step for labels.
- `templates/<id>/` our designs. `template.gt` is godtongue with `{{…}}` holes; `template.json` says what each hole is:
                    the text slots (how many lines, how long), the sizes (which type role, how wide they may run),
                    the art (shapes, a library stamp or an uploaded image) and which type and spacing systems fit.

`{{…}}` holes: `c.<role>` a colour; `font.<role>`, `weight.<role>`; `size.<name>`, `track.<name>`; `lead.<role>`;
`margin`; `W`, `H`; `<slot>.<n>` a line of text; `art` the art block; and sums of these (`{{H - margin * 2}}`).

`npm -w @morgana/api run build:taste` checks every template filled with its defaults and with every palette and type
system it allows, and writes `apps/api/src/taste.gen.ts`. A template that does not compile stops the build.
