// Text pack: words set in a font, and script signatures fitted to a spot.
import { readMods, isWord, num } from '../core/phrases.js';

export default function text(reg) {
  function parse(ctx, toks, kind) {
    const s = toks.find(t => t.t === 'str');
    if (!s) ctx.err(`${kind === 'signature' ? 'sign' : 'write'} what? put the words in quotes`, kind === 'signature' ? 'e.g. sign "Marilyn".' : 'e.g. write "fancard".');
    let rest = toks.slice(toks.indexOf(s) + 1), called = null;
    if (isWord(rest[0], 'called', 'named') && rest[1]?.t === 'word') { called = rest[1].v; rest = rest.slice(2); }
    // font: "in Bodoni Moda italic" up to the first comma
    let font = null, k = 0;
    if (isWord(rest[0], 'in')) {
      const ws = []; k = 1;
      while (k < rest.length && rest[k].t !== ',') ws.push(rest[k++]);
      font = { family: [], weight: 400, style: 'normal' };
      for (const w of ws) {
        if (w.t === 'num') font.weight = w.v;
        else if (w.v === 'italic') font.style = 'italic';
        else if (w.v === 'bold') font.weight = 700;
        else if (w.v === 'light') font.weight = 300;
        else if (w.v === 'regular') font.weight = 400;
        else font.family.push(w.raw);
      }
      font.family = font.family.join(' ');
    }
    let name = null;
    const pre = toks.slice(0, toks.indexOf(s));
    const c = pre.findIndex(t => isWord(t, 'called')); if (c >= 0) name = pre[c + 1]?.v;
    const mods = readMods(rest.slice(k));
    name = mods.name || called || name || slug(s.v);
    if (called) mods.name = called;
    return { text: s.v, font, mods, name };
  }

  reg.verb({
    words: ['write', 'type', 'letter'],
    help: 'Set words in a font. Defaults: Bodoni Moda, size 48, centred. Several lines: put \\n in the words, or wrap with "600 wide"; "leading 1.2" sets the line spacing; "aligned left" or "aligned right"; "uppercase"; "tracking 4". "curved 400" sets the words on an arc of that radius (negative curves the other way).',
    examples: ['write "Summer\\nSale" called title in Lilita One, at 540 500, size 160, leading 0.95.', 'write "A long line that wraps" called body in Jost, at 120 900, size 40, 600 wide, aligned left.', 'write "LIMITED EDITION" called arc in Jost, at 540 300, size 44, curved 320, tracking 6.', 'write "fancard" called wordmark in Bodoni Moda italic, at 620 230, size 58.'],
    run(ctx, toks) {
      const { text, font, mods, name } = parse(ctx, toks, 'text');
      const card = ctx.doc.card.rect;
      const size = mods.size ? ctx.px(mods.size) : 48, track = mods.tracking ? num(mods.tracking) : 0;
      const fl = (...w) => w.some(x => mods._flags?.has(x));
      let body = fl('uppercase', 'caps', 'capitals') ? text.toUpperCase() : fl('lowercase') ? text.toLowerCase() : text;
      // lines: "\n" (or a real line break) in the words, and wrapping to a width ("600 wide")
      let lines = body.split(/\\n|\n/).map(l => l.trim());
      if (mods.wide != null) lines = lines.flatMap(l => wrap(l, ctx.px(mods.wide), size, track));
      const align = fl('left') ? 'left' : fl('right') ? 'right' : 'center';
      const extra = {};
      if (lines.length > 1) { extra.lines = lines; extra.leading = num(mods.leading ?? mods['line-height'], 1.15); }
      if (align !== 'center') extra.align = align;
      if (mods.curved != null || mods.curve != null) extra.curve = ctx.px(mods.curved ?? mods.curve);
      ctx.addLayer(name, {
        kind: 'text', text: lines.join(' '), font: font || { family: 'Bodoni Moda', weight: 400, style: 'normal' },
        at: Array.isArray(mods.at) ? mods.at.map(ctx.px) : [card[0] + card[2] / 2, card[1] + card[3] / 2],
        size, track, ...extra,
      });
    },
  });

  reg.verb({
    words: ['sign'],
    help: 'A script signature fitted to a spot. Defaults: Herr Von Muellerhoff, 620 wide, size 250, near the bottom.',
    examples: ['sign "Marilyn" in Herr Von Muellerhoff, at 620 1478, 620 wide, size 250, tilted -6.', 'sign $name called back-signature, at 620 900.'],
    run(ctx, toks) {
      const { text, font, mods, name } = parse(ctx, toks, 'signature');
      const card = ctx.doc.card.rect;
      const nm = toks.some(t => isWord(t, 'called')) || mods.name ? name : (ctx.doc.layers.signature ? `signature-${ctx.side || 'front'}` : 'signature');
      ctx.addLayer(nm, {
        kind: 'signature', text, font: font || { family: 'Herr Von Muellerhoff', weight: 400, style: 'normal' },
        center: Array.isArray(mods.at) ? mods.at.map(ctx.px) : [card[0] + card[2] / 2, card[1] + card[3] * 0.84],
        max_width: mods.wide ? ctx.px(mods.wide) : 620, size: mods.size ? ctx.px(mods.size) : 250,
        rotate_deg: num(mods.tilted ?? mods.rotated, -6),
      });
      ctx.doc.card.title ??= text;
    },
  });
}
// Wrapping without the font at hand: widths are estimated from the kind of letter, so lines break a little early or
// late in very wide or very narrow faces. Good enough to set a paragraph; exact fitting needs the font's metrics.
const charW = (c) => c === ' ' ? .28 : /[iljtf.,:;'!|]/.test(c) ? .3 : /[mwMW@]/.test(c) ? .86 : /[A-Z]/.test(c) ? .66 : /[0-9]/.test(c) ? .56 : .52;
export const textWidth = (s, size, track = 0) => [...s].reduce((a, c) => a + charW(c) * size + track, 0);
function wrap(line, max, size, track) {
  const out = []; let cur = '';
  for (const w of line.split(/\s+/)) {
    const next = cur ? cur + ' ' + w : w;
    if (cur && textWidth(next, size, track) > max) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'text';
