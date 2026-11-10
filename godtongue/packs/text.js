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
    help: 'Set words in a font. Defaults: Bodoni Moda, size 48, centred.',
    examples: ['write "fancard" called wordmark in Bodoni Moda italic, at 620 230, size 58.'],
    run(ctx, toks) {
      const { text, font, mods, name } = parse(ctx, toks, 'text');
      const card = ctx.doc.card.rect;
      ctx.addLayer(name, {
        kind: 'text', text, font: font || { family: 'Bodoni Moda', weight: 400, style: 'normal' },
        at: Array.isArray(mods.at) ? mods.at.map(ctx.px) : [card[0] + card[2] / 2, card[1] + card[3] / 2],
        size: mods.size ? ctx.px(mods.size) : 48, track: mods.tracking ? num(mods.tracking) : 0,
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
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'text';
