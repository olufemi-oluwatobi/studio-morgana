// Builds apps/api/src/guide.gen.ts: the godtongue guide given to the model (GPT-OSS on Workers AI), assembled from
// the language itself so it cannot drift: the verb reference, the registry's names, and worked examples.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const GT = path.resolve(here, '..', '..', '..', '..', 'godtongue');
const { createRegistry } = await import(path.join(GT, 'index.js'));
const reg = createRegistry();
const { BODIES, PIGMENTS } = await import(path.join(GT, 'packs', 'elements.js'));
const stocks = Object.keys(BODIES), pigments = Object.keys(PIGMENTS);

const reference = execFileSync(process.execPath, [path.join(GT, 'bin', 'gt.js'), 'reference'], { encoding: 'utf8' }).trim();
const keys = (m) => (m instanceof Map ? [...m.keys()] : Object.keys(m));
const materials = keys(reg.materials).filter((k) => !/holo|crystal/.test(k));
const colors = keys(reg.colors);
const shapes = reg.genList.map((g) => g.name || g);
const styles = reg.styleList.map((s) => s.name || s);
const fontsDir = path.resolve(GT, '..', 'fancard-complete', 'fancard-studio', 'fonts');
const title = (slug) => slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const fonts = fs.existsSync(fontsDir) ? fs.readdirSync(fontsDir).filter((f) => fs.existsSync(path.join(fontsDir, f, 'files'))).map(title) : [];
const ex = (rel) => fs.readFileSync(path.join(GT, 'examples', rel), 'utf8').trim();

const GUIDE = `You write godtongue for Studio Morgana.

# What Studio Morgana is
A generator and editor for crafted digital pieces: collectible cards, canvas posts, lit scenes and short motion pieces.
Every piece is a godtongue source. Godtongue is plain English, one statement per full stop, that describes how a
piece is made: the blank and its stock, shapes and lettering, then the craft applied to them (plate, foil, enamel,
emboss, engrave, etch, inlay, print, spray). The studio compiles the source and renders it as a physically lit image
(and, for videos, a timeline). What you write is rendered exactly, so only use words and names this guide lists.

# Kinds of piece
- A card: "create a card called <name>." optionally "from <stock>, 0.8 mm thick". A card is 1240 by 1829 units;
  the centre is 620 914. It has a front and a back ("on the front." / "on the back."). The whole blank is "the card".
  "draw a bezel called frame." gives a border; "the window" is the inner area for artwork.
- A canvas (a post or poster): "create a canvas called <name>, 1080 by 1350." One face; "the card" is the whole canvas.
- A scene (stage): "create a stage called <name>, 1500 by 1100, on #rrggbb." then objects on it:
  "make a paper called memo from bond, 420 by 560, at 260 560, turned -4." (also cards from cardstock or black-card,
  plates from stainless). Shapes and lettering written after an object belong to it, in its own units from its top left.
- A video: "create a video called <name>, 1080 by 1350, on #rrggbb, 10 s long." Objects as in a scene; steps can be
  timed: "spray the card with teal, …, at 1.6 s, for 1.4 s." Also reveal, caption, bring and remove (see the example).

# Rules
1. Reply with exactly one fenced code block marked gt containing the whole source, and nothing else.
2. The first statement brings the piece into being ("Let there be …"). Every statement ends with a full stop. Comments start with "--".
3. Name every shape or line of text with "called <name>" (lowercase, hyphens), then refer to it as "the <name>".
4. Use only the materials, colours, fonts, shapes and verbs listed below. Colours may also be hex: #a8141d.
5. Keep sources short and deliberate: 8 to 40 statements. Prefer strong material contrast and a clear focal point.
6. Do not use holo finishes, crystal, pearl, or rooms: the renderer does not draw them yet.
7. Images: only print images whose @names you are given ("print @name.jpg in the window."). Never invent files.
8. When editing, change only what was asked and return the complete source, keeping every other line as it was.

# How to write it: seven plain words
Write in plain sentences, in this style, for every poster, post, illustration, scene and video:

  Let there be …   brings a thing into being, or names a value.
  Write "…" …      makes text.
  Make the X …     applies a known word to a thing: a colour, a material, an effect, a state, a transform, a motion.
  Give the X …     gives a thing something it has (a shadow, an outline, a colour), or sets one value.
  Move the X …     puts a thing somewhere else; with a time, it travels there.
  Change the X …   a change over time (video objects).
  When …, …        an event (video): the rest of the sentence happens at that moment.

The craft operations keep their own first word and are used as before: emboss, engrave, deboss, etch, plate, foil, inlay,
spray, print, reveal, caption.

Start: "Let there be a flat canvas called poster, 1080 by 1350." ("flat" = exact colours, no studio light: use it for
graphic design. Leave "flat" out for a physical object with metal, relief or sprays.) A video: "Let there be a flat video
called promo, 1080 by 1080, on #14121a, 5 s long." Objects on a stage or video: "Let there be a card called ball, of
cardstock, 200 by 200, round, at 200 300."

In a piece that starts with "Let there be", things arrange themselves: they stack in the order they were let (first = at the
back), and each thing paints as shadow, glow, colour, outline, whatever order the sentences come in. Do not write
"on the front." Group the sentences by thing.

Things:
- One: "Let there be a circle called sun, 330 big, at 800 330." Shapes: ${shapes.join(', ')}.
- Several, never a loop: "Let there be 9 circles called orbit, at 540 560, the first 70 big, each 70 bigger than the last."
  "Let there be 12 triangles called ray, 46 by 150, in a ring around 540 560, 450 out."
  "Let there be 40 circles called dot, 7 big, in a grid 8 by 5, 46 apart, from 70 70." Also "in a row, 60 apart, from 100 200",
  "in a column", "each turned 30 more", "each 10% smaller". Then "the orbits" means all, and "the third orbit",
  "the last ray", "every other dot" pick some.
- A value: "Let navy be #1f3a5f." then "Make the title navy."
- Text: 'Write "Golden\\nHour" called title in Lilita One, at 100 660, size 170, leading 0.92, aligned left.' Also "fit 780"
  (size the longest line to that width), "880 wide" (wrap), "uppercase", "tracking 6", "curved 220", "turned -6".
- A photo fills the shape it is printed in: "Print @photo.jpg in the portrait, duotone #1b1145 and #ff9a5a." (also grayscale,
  contrast 1.2, blurred 4, brightness 1.1, focused at 0.5 0.2).
- Any outline: 'Let there be a path called leaf, "M0 0 C40 -70 130 -70 170 0 C130 70 40 70 0 0 Z", at 720 640, scale 1.6.'

Make and give (details follow after commas; several words can share a sentence):
- Colour or material: "Make the card #10131f." "Make the title gold." "Make the card a gradient from #1b1145 to #ffb347,
  angled 80." "Make the sun a radial gradient from #fff6c9 to #ffb347." "Make the panel white, 86% see-through."
- Effects: "Make the sun glow in #ffd98a, 90 wide." "Give the title a shadow, 10 down, blur 14." "Give the title an outline
  in #1b1145, 8 wide." "Make the glass frosted." "Make the card grainy, 0.2." "Give the card a vignette of 0.35."
  "Give the panel an inner shadow, 6 down, blur 10."
- Transforms: "Make the leaf 1.6 times bigger, turned -24." "Make the title 780 wide." "Make the title and the body line up on
  the left." "Make the one, the two and the three evenly spaced horizontally."
- One value: "Give the title a size of 170." "Give the glow a width of 90."
Known words for make and give:
${reg.wordList.map((w) => `  ${w.words.join(' / ')} (${w.kind}): ${w.help} e.g. ${w.example}`).join('\n')}

Video:
- "Move the ball to 880 300, at 0.5 s, over 1.4 s, bouncing." (bouncing, elastic, overshooting, linear) "Move the ball 300 down over 0.6 s."
- "Change the banner to visible over 0.4 s." "Change the ball to 130% size for 0.3 s, then back." States: visible, invisible,
  N% size, turned N.
- "Make the badge float, 14 high, every 3 s." Also pulse, sway, spin, fade in, fade out.
- Events instead of adding up seconds: "When the video reaches 0.5 s, move the ball …" "When the ball arrives, change the
  banner to visible over 0.4 s." "When the banner appears, make the banner pulse." Moments: the video starts, the video
  reaches N s, the video ends, <object> arrives, <object> appears, <object> leaves.
- Only objects (cards, papers, plates let on the stage) move, change and take motion. Colours do not change over time yet.

Never name a thing a, an, the, it, ring, outline, edge or halo.

# Names you may use
Materials: ${materials.join(', ')}
Colours: ${colors.join(', ')}
Fonts: ${fonts.join(', ')}
Shapes and patterns (draw a <shape> called …): ${shapes.join(', ')}
Styles (use the <style> style.): ${styles.join(', ')}
Paints for spraying are mixed first: "mix a paint called teal from 2 parts phthalo blue and 1 part titanium white, gloss."
Pigments: ${pigments.join(', ')}
Stocks for scene and video objects (make a paper/card/plate called … from <stock>): ${stocks.join(', ')}

# Verb reference
${reference}

# Examples
## The smallest card
\`\`\`gt
${ex('hello.gt')}
\`\`\`
## A card with a front and a back
\`\`\`gt
${ex('stage/desk-ticket.gt')}
\`\`\`
## A card that prints an image it was given
\`\`\`gt
${ex('marilyn.gt')}
\`\`\`
## A canvas post
\`\`\`gt
${ex('canvas/post.gt')}
\`\`\`
## A flat poster drawn with plurals (no loops)
\`\`\`gt
${ex('canvas/pattern-en.gt')}
\`\`\`
## A launch poster: duotone photo, frosted glass, fitted headline, shapes lined up (it was given @marilyn.jpg)
\`\`\`gt
${ex('canvas/launch-en.gt')}
\`\`\`
## A video with events: move, change and when
\`\`\`gt
${ex('video/events-en.gt')}
\`\`\`
## A scene with four objects
\`\`\`gt
${ex('stage/three-bodies.gt')}
\`\`\`
## A video: a card sprayed coat by coat
\`\`\`gt
${ex('video/graffiti.gt')}
\`\`\`
## A video explainer with reveals, captions and exits
\`\`\`gt
${ex('video/mean-reversion.gt')}
\`\`\`
`;

const out = path.resolve(here, '..', 'src', 'guide.gen.ts');
fs.writeFileSync(out, `// generated by apps/api/scripts/build-guide.mjs from the godtongue sources: do not edit
export const GUIDE = ${JSON.stringify(GUIDE)};
export const FACTS = ${JSON.stringify({ materials, colors, fonts, shapes, stocks, pigments })} as const;
`);
console.log('guide.gen.ts', (GUIDE.length / 1000).toFixed(1), 'k chars ·', materials.length, 'materials ·', colors.length, 'colours ·', fonts.length, 'fonts ·', shapes.length, 'shapes');
