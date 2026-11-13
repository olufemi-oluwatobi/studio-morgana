// Card pack: the card itself, zones, sides, variables, recipes and styles.
import { readMods, readName, readMaterial, readArea, isWord, dropArticles, flag, num } from '../core/phrases.js';
import { show } from '../core/read.js';

export default function card(reg) {
  reg.verb({
    words: ['create', 'start'],
    help: 'Start a card, or a canvas of any size. Everything after "called" names it; modifiers set the blank. Add "flat" to a canvas, stage or video for exact, unlit colours (graphic design); without it the piece is a lit physical surface.',
    examples: ['create a canvas called poster, 1080 by 1350, flat.', 'create a card called marilyn from stainless, 0.8 mm thick, seed 19260601.', 'create a canvas called post, 1080 by 1350.'],
    run(ctx, toks) {
      const t = dropArticles(toks);
      const isVideo = isWord(t[0], 'video'), isStage = isWord(t[0], 'stage') || isVideo, isCanvas = isWord(t[0], 'canvas') || isStage;
      if (!isWord(t[0], 'card') && !isCanvas) ctx.err('start with "create a card called …", "create a canvas called …, 1080 by 1350" or "create a stage called …, 1080 by 1350"');
      const head = t.slice(1); const comma = head.findIndex(x => x.t === ',');
      const first = comma < 0 ? head : head.slice(0, comma), rest = comma < 0 ? [] : head.slice(comma + 1);
      const mods = readMods([...first.flatMap((x, i) => isWord(x, 'from') ? [{ t: ',' }, x] : [x]), { t: ',' }, ...rest]);
      const c = ctx.doc.card;
      if (mods.name) { ctx.doc.name = mods.name; ctx.doc.id = `godtongue/${mods.name}`; c.title ??= null; }
      if (mods.from) {
        const m = ctx.reg.materials.get(String(mods.from).replace(/ /g, '-')) || ctx.reg.materials.get(String(mods.from).replace(/-/g, ' '));
        if (!m || m.type !== 'stock') ctx.err(`"${mods.from}" is not a blank stock`, 'stocks: stainless, brass, aluminium, titanium, anodized navy, anodized midnight, anodized black');
        c.stock = m.finish;
      }
      if (mods.thick) c.thickness_mm = ctx.mm(mods.thick);
      if (mods.seed) c.seed = num(mods.seed);
      if (mods.edition) c.edition.no = num(mods.edition);
      if (mods.of) { c.edition.no = num(mods.of[0]); c.edition.of = num(mods.of[1]); }
      c.seed = c.seed === 1 ? hash(ctx.doc.name) : c.seed;
      if (isCanvas) {                                   // any artboard: the whole grid is the body, no card blank
        if (!mods.size) ctx.err('a canvas needs a size', 'e.g. "create a canvas called post, 1080 by 1350."');
        const [w, h] = mods.size.map(num);
        ctx.doc.kind = isStage ? 'stage' : 'canvas';
        // "flat": colours are shown exactly as written, with no studio light (graphic design, not a lit object)
        ctx.doc.canvas = { size_px: [w, h], ...(flag(mods, 'flat', 'unlit') ? { flat: true } : {}) };
        if (isStage) { ctx.doc.stage = { size: [w, h], background: mods.on?.t === 'color' ? mods.on.v : (typeof mods.on === 'string' ? mods.on : '#d9d2c4') }; ctx.doc.elements = {}; }
        if (isVideo) ctx.doc.video = { seconds: mods.long ? num(mods.long) : 10, fps: mods.fps != null ? num(mods.fps) : 30 };
        c.grid = [w, h]; c.rect = [0, 0, w, h]; c.r = 0;
        c.size_mm = [w * 25.4 / 300, h * 25.4 / 300];   // 300 dpi unless told otherwise
        ctx.doc.zones.card = { rect: [0, 0, w, h], r: 0 };
        ctx.doc.zones.window = { rect: [0, 0, w, h], r: 0 };
      }
      ctx.it = 'card';
    },
  });

  reg.verb({
    words: ['set'],
    help: 'Set a card setting: seed, bench (background colour), edition, title, brush angle, lights.',
    examples: ['set the bench to #0e0f12.', 'set the edition to 1 of 100.', 'set the title to "Marilyn".'],
    run(ctx, toks, s) {
      const t = dropArticles(toks);
      // "set studs along …" is the generator verb; hand over when the next word is a generator
      const gen = ctx.reg.match(ctx.reg.generators, t, 0, 3);
      if (gen) return ctx.reg.verbs.get('draw').run(ctx, toks, s);
      const to = t.findIndex(x => isWord(x, 'to', 'as', 'is'));
      if (to < 0) ctx.err('set what to what?', 'e.g. "set the bench to #0e0f12."');
      const key = t.slice(0, to).filter(x => x.t === 'word').map(x => x.v).join('-'), val = t.slice(to + 1);
      const c = ctx.doc.card;
      if (key === 'seed') c.seed = num(val[0]);
      else if (key === 'bench' || key === 'background') c.bench = val[0]?.v;
      else if (key === 'title' || key === 'name') c.title = val[0]?.v;
      else if (key === 'edition') { c.edition.no = num(val[0]); const of = val.findIndex(x => isWord(x, 'of')); if (of > 0) c.edition.of = num(val[of + 1]); }
      else if (key === 'brush' || key === 'brush-angle' || key === 'grain') c.brush_deg = num(val[0]);
      else if (key === 'lights') c.lights = val.filter(x => x.t === 'num').map(x => x.v);
      else ctx.err(`unknown setting "${key}"`, ctx.suggest(key, ['seed', 'bench', 'title', 'edition', 'brush', 'lights']));
    },
  });

  reg.verb({
    words: ['make', 'give'],
    help: 'Shape a zone ("make the window 756 by 1345, at 242 242, corners 9.") or set the current subject ("make it oxblood.").',
    examples: ['make the window 756 by 1345, centred, corners 9.', 'make a zone called badge 200 by 80, at 520 1500.'],
    run(ctx, toks, s) {
      const t = dropArticles(toks);
      let name;
      if (isWord(t[0], 'zone')) { const m = readMods(t.slice(1)); name = m.name; return zone(ctx, name, m); }
      if (isWord(t[0], 'paper', 'piece', 'plate', 'sheet', 'sticker') || (isWord(t[0], 'card') && isWord(t[1], 'called', 'named'))) return ctx.reg.verbs.get('element').run(ctx, toks, s);
      if (isWord(t[0], 'it')) {
        const rest = t.slice(1);
        if (ctx.it && ctx.doc.zones[ctx.it] && ctx.it !== 'card') return zone(ctx, ctx.it, readMods(rest));
        // "make it oxblood" on a layer = plate it
        return ctx.reg.verbs.get('plate').run(ctx, [{ t: 'word', v: 'it' }, { t: 'word', v: 'with' }, ...rest], s);
      }
      const r = readName(t, 0, new Set()); name = r.name.split('-')[0];
      const rest = t.slice(1);
      if (ctx.doc.zones[name] || name === 'window') return zone(ctx, name, readMods(rest));
      if (ctx.doc.layers[name]) return ctx.reg.verbs.get('plate').run(ctx, [t[0], { t: 'word', v: 'with' }, ...rest], s);
      ctx.err(`make what? "${name}" is not a zone or layer`, 'e.g. "make the window 756 by 1345."');
    },
  });

  function zone(ctx, name, m) {
    if (!name) ctx.err('this zone needs a name', 'add "called <name>"');
    const card = ctx.doc.card.rect, z = ctx.doc.zones[name] || {};
    let [w, h] = m.size ? m.size.map(ctx.px) : (z.rect ? [z.rect[2], z.rect[3]] : [400, 400]);
    let x, y;
    if (m.at && Array.isArray(m.at)) [x, y] = m.at.map(ctx.px);
    else { x = card[0] + (card[2] - w) / 2; y = card[1] + (card[3] - h) / 2; }
    if (m.from && Array.isArray(m.from)) [x, y] = m.from.map(ctx.px);
    if (m.top != null) y = card[1] + ctx.px(m.top);
    const r = m.corners != null ? ctx.px(m.corners) : (z.r ?? 0);
    ctx.doc.zones[name] = { rect: [round(x), round(y), round(w), round(h)], r }; ctx.it = name;
  }

  reg.verb({
    words: ['define'],
    help: 'Name a value or a recipe. Values are pasted wherever $name appears; recipes run with "use".',
    examples: ['define $chrome as mirror chrome.', 'define $pitch as 38.', 'define $finish as:\n  plate it with $chrome.\n  outline it in niello, 6 wide.\nend.'],
    run(ctx, toks, s) {
      if (isWord(toks[0], 'a', 'an', 'the')) return defineObject(ctx, toks.slice(1), s);
      if (toks[0]?.t !== 'var') ctx.err('define needs a $name', 'e.g. "define $gold as gold 24k."');
      const name = toks[0].v;
      if (s.body) { ctx.vars.set(name, { recipe: s.body }); return; }
      const as = toks.findIndex(x => isWord(x, 'as', 'to', 'is', 'be'));
      if (as < 0) ctx.err(`define $${name} as what?`);
      const value = toks.slice(as + 1);
      if (!value.length) ctx.err(`$${name} is empty`);
      ctx.vars.set(name, { value });
    },
  });

  reg.verb({
    words: ['use', 'apply'],
    help: 'Run a recipe ($name) or a built-in style ("the studded bezel style").',
    examples: ['use $finish.', 'use the studded bezel style.'],
    run(ctx, toks) {
      const t = dropArticles(toks);
      if (t[0]?.t === 'var') {
        const v = ctx.vars.get(t[0].v);
        if (!v?.recipe) ctx.err(`$${t[0].v} is a value, not a recipe`);
        const prev = ctx.it;
        if (isWord(t[1], 'on', 'for')) ctx.it = readArea(ctx, t, 2).area.terms.map(x => x.ref);   // "use $gild on the wordmark and the signature"
        ctx.run(v.recipe, `$${t[0].v}`);
        ctx.it = prev; return;
      }
      const words = t.filter(x => x.t === 'word' && x.v !== 'style' && x.v !== 'look').map(x => x.v);
      const key = words.join(' ');
      const st = ctx.reg.styles.get(key) || ctx.reg.styles.get(words.join('-'));
      if (!st) ctx.err(`no style called "${key}"`, ctx.suggest(key, [...ctx.reg.styles.keys()]) || `styles: ${[...new Set(ctx.reg.styleList.map(x => x.name))].join(', ')}`);
      ctx.run(st.source, `style ${st.name}`);
    },
  });

  reg.verb({
    words: ['on'],
    help: 'Choose the side the following steps are made on.',
    examples: ['on the front.', 'on the back.'],
    run(ctx, toks) {
      const t = dropArticles(toks);
      const w = t[0]?.v;
      if (ctx.doc.elements?.[w] || ctx.doc.elements?.[ctx.resolve?.(w)]) { const n = ctx.doc.elements[w] ? w : ctx.resolve(w); ctx.side = n; ctx.sideObj(n); ctx.it = n; return; }
      if (w !== 'front' && w !== 'back') ctx.err('on the front or on the back?', ctx.doc.elements ? `or an element: ${Object.keys(ctx.doc.elements).join(', ')}` : undefined);
      ctx.side = w; ctx.sideObj(w);
    },
  });

  reg.verb({
    words: ['let'],
    help: 'Let a layer break out of the card outline (digital cards).',
    examples: ['let the frame break the card edge.'],
    run(ctx, toks) {
      const t = dropArticles(toks);
      const name = isWord(t[0], 'it') ? ctx.it : readName(t, 0, new Set(['break', 'breaks', 'cross', 'pass'])).name;
      if (!t.some(x => isWord(x, 'break', 'breaks', 'cross', 'pass'))) ctx.err('let it … what?', 'e.g. "let the frame break the card edge."');
      for (const side of ctx.side ? [ctx.side] : ['front', 'back']) {
        const so = ctx.sideObj(side); if (!so.silhouette.includes(name)) so.silhouette.push(name);
      }
    },
  });

  reg.verb({
    words: ['brush'],
    help: 'Brush the blank: the grain angle in degrees.',
    examples: ['brush the card at 35 degrees.'],
    run(ctx, toks) { const m = readMods(dropArticles(toks).slice(1)); ctx.doc.card.brush_deg = num(m.at, 0); },
  });
}

// "define a rose with $size 60 and $petals 5 as: … end." → an object that "place" draws
function defineObject(ctx, toks, s) {
  const words = []; let i = 0;
  while (toks[i]?.t === 'word' && !['with', 'as'].includes(toks[i].v)) words.push(toks[i++].v);
  const name = words.join('-');
  if (!name) ctx.err('define a what?', 'e.g. "define a rose with $size 60 as:"');
  if (!s.body) ctx.err(`"${name}" needs its recipe`, 'end the line with "as:", write the steps, then "end."');
  const params = [];
  if (isWord(toks[i], 'with')) {
    i++; let cur = null;
    for (; i < toks.length && !isWord(toks[i], 'as'); i++) {
      const t = toks[i];
      if (t.t === 'var') { cur = { name: t.v, value: [] }; params.push(cur); }
      else if (isWord(t, 'and') || t.t === ',') continue;
      else if (cur) cur.value.push(t);
    }
    for (const p of params) if (!p.value.length) ctx.err(`$${p.name} needs a starting value`, `e.g. "with $${p.name} 60"`);
  }
  ctx.objects.set(name, { name, params, body: s.body });
}

const round = (v) => Math.round(v * 10) / 10;
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h) % 99999999; }
