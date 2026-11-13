// The "how to say it" phrases in core/catalogue.js that the older verbs and settings rely on, compiled and checked.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { compile } = await import(path.join(ROOT, 'index.js'));
const C = 'Let there be a flat canvas called x, 400 by 400.\n', V = 'Let there be a flat video called v, 400 by 400, on #111111, 4 s long, fps 24.\nLet there be a card called ball, of kraft, in #c9a27a, 100 by 100, torn top edge, aged 0.4, up 3 mm, 2 mm thick, at 100 100.\n';
const T = [
  ['fps', V, (d) => d.video.fps === 24],
  ['object stock tint/edge/aged/up/thick', V, (d) => d.elements.ball.body.color === '#c9a27a' && d.elements.ball.edge.style === 'torn' && d.elements.ball.edge.side === 'top' && d.elements.ball.aged === .4 && d.elements.ball.body.thick_mm === 2],

  ['bring in popping', V + 'bring in the ball at 0.2 s, popping.', (d) => d.elements.ball.enter.style === 'pop'],
  ['camera', V + 'glide the camera to 200 200, zoom 1.2, at 1 s, over 0.5 s.', (d) => d.timeline.camera[0].zoom === 1.2],
  ['caption', V + 'caption "hello there" at 1 s, for 2 s, "there" in #e94f37.', (d) => d.timeline.captions.length === 1],
  ['caption style', V + 'style the captions in Jost, size 62, #1d1b18, at 360.', (d) => d.timeline.captionStyle.size === 62],
  ['set bench/seed/edition/title/lights/brush', 'create a card called c from stainless.\nset the bench to #0e0f12.\nset the seed to 7.\nset the edition to 1 of 100.\nset the title to "M".\nset the lights to -1 0 1.\nset the brush to 30.', (d) => d.card.seed === 7 && d.card.edition.of === 100 && d.card.brush_deg === 30],
  ['card thick', 'Let there be a card called c from brass, 1.2 mm thick.', (d) => d.card.thickness_mm === 1.2 && d.card.stock === 'brass'],
  ['zone', 'create a card called c from stainless.\nmake the window 756 by 1345, at 242 242, corners 9.', (d) => d.zones.window.r === 9],
  ['emboss soft / engrave / deboss / etch', 'Let there be a card called c from stainless.\nLet there be a circle called d, 100 big, at 600 900.\nEmboss the d, 0.3 mm high, soft 0.7.\nEngrave the d, 0.06 mm deep.\nDeboss the d, 0.05 mm deep.\nEtch the d.', (d) => d.sides.front.steps.some(s => s.op === 'deboss' && s.params.depth_mm === .05) && d.sides.front.steps.some(s => s.op === 'emboss' && s.params.soft === .7 && s.params.height_mm === .3) && d.sides.front.steps.some(s => s.op === 'engrave' && s.params.depth_mm === .06)],
  ['foil raised', 'Let there be a card called c from stainless.\nLet there be a circle called d, 100 big, at 600 900.\nfoil the d with gold, raised 0.8.', (d) => d.sides.front.steps.some(s => s.op === 'foil' && s.params.emboss === .8)],
  ['inlay niello', 'create a card called c from stainless.\ndraw a circle called d, 100 big, at 600 900.\non the front.\ninlay the d with niello.', (d) => d.sides.front.steps.some(s => s.op === 'enamel' || s.op === 'inlay')],
  ['spray gloss', 'create a card called c from stainless.\non the front.\nspray the window with gloss, 30 µm thick.', (d) => d.sides.front.steps.some(s => s.op === 'spray' && s.params.thickness_um === 30)],
  ['spray glitter', 'create a card called c from stainless.\non the front.\nspray the window with glitter in pale gold and deep gold, flakes 110 µm, density 0.7.', (d) => d.sides.front.steps.some(s => s.kind === 'glitter' && s.params.density === .7)],
  ['grain coarse', C + 'grain the card, 0.2, coarse.', (d) => d.sides.front.steps.some(s => s.op === 'grain' && s.params.size === 2)],
  ['adjust hue/opacity', C + 'adjust the card, hue 40, 50% opacity.', (d) => d.sides.front.steps.some(s => s.op === 'adjust' && /hue/.test(s.params.filter) && s.params.opacity === .5)],
  ['exclusion blend', C + 'Make the card #ff0000, exclusion.', (d) => d.sides.front.steps.some(s => s.params.blend === 'exclusion')],
  ['dash', C + 'Let there be a line called r, from 10 10 to 300 10.\ndash the r, 18 on 12 off.', (d) => !!d.layers.r.shapes[0].dash],
  ['minus / within', C + 'Let there be a circle called p, 100 big, at 200 200.\nLet there be a circle called q, 50 big, at 200 200.\nenamel the p except the q in #ff0000.', (d) => d.sides.front.steps.some(s => s.area.minus?.length)],
  ['grown', C + 'Let there be a circle called p, 100 big, at 200 200.\nenamel the p grown by 5 in #ff0000.', (d) => d.sides.front.steps.some(s => s.area.terms[0].mod === 'grow')],
  ['sign', 'create a card called c from stainless.\nsign "Marilyn" in Herr Von Muellerhoff, at 620 1478, 620 wide, size 250, tilted -6.', (d) => Object.values(d.layers).some(l => l.kind === 'signature')],
  ['print on foil', 'create a card called c from stainless.\non the front.\nprint @marilyn.jpg in the window, on foil.', (d) => d.sides.front.steps.some(s => s.on_foil || s.image?.onFoil)],
  ['mix paint', 'create a card called c from stainless.\nmix a paint called teal from 2 parts phthalo blue and 1 part titanium white, gloss.', (d) => d.materials.teal?.finish === 'gloss'],
  ['satin gold', C + 'Let there be a circle called p, 100 big, at 200 200.\nMake the p mirror gold.', (d) => true],
];
export function check() {
  return T.map(([name, src, f]) => { const r = compile(src, { baseDir: path.join(ROOT, 'examples') }); let ok = false; try { ok = r.ok && f(r.doc); } catch {} return { name, ok, errors: r.ok ? [] : r.diagnostics.filter(d => d.level === 'error').map(d => d.msg) }; });
}
