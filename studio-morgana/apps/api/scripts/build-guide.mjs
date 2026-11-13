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
2. The first statement creates the piece. Every statement ends with a full stop. Comments start with "--".
3. Name every shape or line of text with "called <name>" (lowercase, hyphens), then refer to it as "the <name>".
4. Use only the materials, colours, fonts, shapes and verbs listed below. Colours may also be hex: #a8141d.
5. Keep sources short and deliberate: 8 to 40 statements. Prefer strong material contrast and a clear focal point.
6. Do not use holo finishes, crystal, pearl, or rooms: the renderer does not draw them yet.
7. Images: only print images whose @names you are given ("print @name.jpg in the window."). Never invent files.
8. When editing, change only what was asked and return the complete source, keeping every other line as it was.

# Flat design (posters, posts, social graphics)
On a canvas, colour is "enamel": it also takes gradients, opacity and blend modes. Use these freely for modern graphic design:
- Gradient: "enamel the card in a gradient from #1b1145 to #c2334d to #ffb347, angled 80." (0 = left to right, 90 = top to
  bottom) or "enamel the sun in a radial gradient from #fff6c9 to #ffb347."
- Opacity and blend: "enamel the panel in #ffffff, 16% opacity." "enamel the leaf in #0e6b4f, 85% opacity, multiply."
- Drop shadow and glow, written BEFORE the step that colours the same shape: "shadow the title, 10 down, blur 14, 60% opacity."
  "glow the sun in #ffd98a, 90 wide, strength 2."
- Text: several lines with \\n inside the quotes, "leading 0.95", "aligned left" or "aligned right" (then "at" is the left or
  right edge), "600 wide" wraps a paragraph, "uppercase", "tracking 6", and "curved 220" sets words on an arc.
- A photo fills the shape it is printed in: "draw a circle called portrait, 190 big, at 250 330." then
  "print @photo.jpg in the portrait, grayscale, contrast 1.2." Adjustments: blurred N, brightness N, contrast N, saturation N,
  hue N, grayscale, sepia, inverted.
- Any outline as an SVG path: "draw a path called leaf, "M0 0 C40 -70 130 -70 170 0 C130 70 40 70 0 0 Z", at 720 640, scale 1.6, turned -24."
- Steps paint in order, like layers from the bottom up: background first, then shadows, then the shapes, then text on top.
- In a video: "fade in the title at 1 s, over 0.5 s.", "fade out the title at 4 s, over 0.4 s." and easing on a glide
  ("…, over 1.2 s, bounce": linear, ease-in, ease-out, overshoot, bounce, elastic).

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
## A poster with gradients, shadows, a glow, laid-out text, a path and a photo in a circle (it was given @marilyn.jpg)
\`\`\`gt
${ex('canvas/effects.gt')}
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
