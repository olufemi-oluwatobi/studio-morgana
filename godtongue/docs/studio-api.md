# Studio API

The studio has one rule: **the `.gt` source is the card.** The wall, the detail page, the AI box and the parts panel are four ways of
reading and writing that one text. Every render is `compile(gt) → scene IR → web engine → image`, so everything on the wall is a
godtongue render, and every edit, by a person or by the AI, lands as a change to godtongue text that shows up as a diff.

Screens: `Wall` (masonry of full images, prompt box with references), `Card` (render with numbered parts, command box, parts list),
`Edit` (a part selected: material, sliders, the exact line it will write). See the design canvas "Godtongue Studio: main flow".

## Objects

| Object | Fields |
|---|---|
| `Project` | `id`, `name` |
| `Card` | `id`, `project`, `title`, `kind` (card, canvas, stage, video), `gt` (source text), `hash` (of source + assets), `sides`, `render` (`{side: {url, w, h}}`), `video?`, `updated` |
| `Part` | `n` (1, 2, 3, shown as P1, P2…), `id` (the godtongue name, e.g. `trim`), `label`, `side`, `summary` (e.g. `gold plate, emboss 0.12 mm`), `swatch`, `statements` (line spans in `gt`) |
| `Edit` | `id`, `card`, `by` (`human` or `ai`), `command?`, `gt_diff`, `status` (`planned`, `applied`, `undone`) |
| `Job` | `id`, `kind` (`generate`, `render`, `export`), `state`, `progress`, `result?` |

**Part numbers** are assigned once, by first appearance in the source, and stay with the part when the text moves. They are kept in the
card's `parts` map so "make p1 red" means the same thing tomorrow.

## Endpoints

```
GET    /api/wall?project=&cursor=         → { cards: [Card without gt], next }          the masonry
POST   /api/generate                      → { job }       { prompt, refs: [assetId], project, count, kind }
GET    /api/cards/:id                     → Card (with gt)
GET    /api/cards/:id/parts               → { parts: [Part] }                            numbered list for the pins and the panel
POST   /api/cards/:id/edit                → { edit, diagnostics, job }                   the one write path (below)
POST   /api/cards/:id/edits/:eid/apply    → Card         apply a planned AI edit
POST   /api/cards/:id/undo | /redo        → Card
GET    /api/cards/:id/render?side=&w=     → image        cached by `hash`; the same URL serves the wall tile
POST   /api/cards/:id/export              → { job }      { format: png | mp4 | gt | pdf }
POST   /api/assets                        → { id, url }  upload a reference, image or font
GET    /api/jobs/:id/events               → server-sent events: progress, then result
```

### The one write path: `POST /api/cards/:id/edit`

The body is exactly one of three forms. All three end as a godtongue diff plus a compile, so they behave the same afterwards.

| Form | Body | Who uses it |
|---|---|---|
| Words | `{ "command": "make p1 chrome", "selection": [1] }` | the command box; the AI resolves `p1` through `parts`, writes statements, returns a `planned` edit |
| Controls | `{ "ops": [{ "part": 1, "set": { "material": "chrome" } }] }` | the parts panel; each op maps to one statement (table below) |
| Source | `{ "gt": "…whole file…" }` | the Source tab |

Response: `{ edit: { gt_diff, status }, diagnostics: [{ line, msg, hint }], job }`. A `command` edit comes back `planned`: the studio shows
the line it would write ("Changes 1 part: P1 Trim, gold to chrome") with Apply and Not that. `ops` and `gt` edits apply at once, because the
person made the change directly. If the compile has errors the edit is refused and `diagnostics` carry the line and the valid names.

### Ops to godtongue

| Op | Writes |
|---|---|
| `{ part, set: { material } }` | `plate the <id> with <material>.` (or `enamel`, `foil`, per the part's verb) |
| `{ part, set: { color } }` | `enamel the <id> in <hex>.` / `inlay the <id> with <hex>.` |
| `{ part, set: { emboss_mm, soft } }` | `emboss the <id>, <n> mm high, soft <s>.` |
| `{ part, set: { size, at, tilt } }` | modifiers on the part's `write` or `sign` statement |
| `{ part, hide: true }` | comments the part's statements out with `--` (kept, not deleted) |
| `{ part, remove: true }` | deletes the part's statements |
| `{ add: { statement } }` | appends one statement on the chosen side |

Statements are replaced in place, on the part's own line span, so the rest of the file does not move and the diff stays one line.

### Dragging a card on the wall

Drag a tile and a tray appears with three drop zones. Dragging a tile out of the window counts as Remove.

| Drop on | Call | Result |
|---|---|---|
| Remove, or out of the window | `DELETE /api/cards/:id` (soft delete, kept 30 days) | tile leaves the wall; a toast offers Undo, which is `POST /api/cards/:id/restore` |
| New card | adds `{ asset: <card render>, source: card.id }` to the prompt's `refs` | the prompt panel opens with the card as a reference; `POST /api/generate` then takes `refs` |
| Edit | none; opens `/cards/:id` | the card page opens with the command box focused |

A card used as a reference is sent as its render plus its `.gt`, so the AI can read both the look and the source.

## How the AI writes godtongue

1. Input: the current `gt`, the `parts` list, the selection, the user's words, and the verb reference (`gt reference`: every verb with its help and examples).
2. Output: a patch to the `gt` text, not a new file. Edits are line-level.
3. The patch is compiled before it is shown. If it fails, the compiler's message goes back to the model once; if it still fails, the user sees the message and the edit is not planned.
4. `generate` writes a whole file from the prompt and the reference images (style notes taken from the references, not their pixels), compiles it, and renders `count` options as separate cards.

## Rendering

- The engine already runs in a browser (`tools/studio`, the `GTStudio` bundle), so the client can compile and preview at once while the server stores the card and renders the final image.
- The render URL is keyed by `hash`, so the wall tile, the detail view and the export read one cached image.
- Wall tiles are the render itself, with no overlay. Renders must come out without the debug HUD (the current golden frames show a small timing label in the bottom-left corner: remove it before the wall ships).
- Pins on the detail page come from `parts[].anchor` (a point inside the part on the rendered image, computed by the compiler from the part's mask), so the numbers sit on the part and move with the layout.

## What the compiler has to add

| Need | Where |
|---|---|
| `doc.parts`: ordered list with `id`, `side`, statement line spans, and an anchor point | `core/compile.js`, recorded as each named object is made |
| Stable part numbers across edits | a `parts` map stored beside the source |
| A `patch` helper: replace the lines of a part's statements | `core/` (pure text, no engine) |
| Render with no HUD | `web/engine.js` flag used by capture |

## Storage

A card is a folder: `card.gt`, its assets, `parts.json`, `edits.jsonl` (one line per edit, with the diff), and cached renders named by hash.
Undo is the edit log. Nothing else is stored, because the source is the card.
