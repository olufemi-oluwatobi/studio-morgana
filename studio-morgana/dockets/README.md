# Dockets

A docket is one look we can make well, written down so a model can make it too: what it is, when to use it, how it is
built, and a finished example in godtongue with its render. The generator reads a short index of every docket, picks
the ones that fit a brief, and the writer gets those dockets in full.

Inspiration (Pinterest and the like) is studied, not copied: a docket records how a design works (grid, type, palette,
treatment, the signature move) and its example is our own piece built on that structure, with our own words and images.

## Layout

    dockets/<niche>/<id>/
      docket.md     the docket (format below)
      piece.gt      our example, which must compile (the build checks it)
      render.png    the example as drawn (for people; the model reads the words)

Niches: `canvas` (posts, posters, covers, flat graphic pieces) first, then `business` (cards, letterheads, brand pages).

`npm run build:dockets` checks every example and writes `apps/api/src/dockets.gen.ts` (part of `npm run build`).

## docket.md

The header lines, then the sections. Every section is short and concrete: numbers, hex, font names, positions.

    name: Swiss type poster
    niche: canvas
    kinds: poster, event post, announcement
    size: 1080 by 1350 (works from 4:5 to 2:3)
    tags: typographic, grid, bold, minimal, two-colour
    use when: one strong phrase carries the piece; events, talks, launches; no photo needed

    ## Look            what you see, in two or three sentences
    ## Grid            margins, columns, where each thing sits (in proportions as well as pixels)
    ## Type            each role: font, size as a share of the width, case, tracking, alignment
    ## Palette         the roles (ground, ink, accent) and 2–3 tested palettes in hex
    ## Image           how a photo is treated, if there is one
    ## Materials       where light and material go (or why this one stays flat)
    ## Signature       the one move that makes it this look
    ## Don't           the mistakes that kill it
    ## Slots           what changes per brief, and what never does
    ## How we did it   the example, walked through by line
