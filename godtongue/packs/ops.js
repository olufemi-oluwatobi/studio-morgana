// Manufacturing ops: each statement adds one or more steps to the current side, in order.
//   <op> <area> [with|in <material>] [, modifiers]
import { mixPigments, findPigment, sprayParams } from './elements.js';
import { readArea, readMaterial, readMods, readColors, isWord, dropArticles, clauses, num, flag } from '../core/phrases.js';

export default function ops(reg) {
  // split "<area> [with|in <material>] [extra words]" + ", clauses"
  function head(ctx, toks, { material = false, matWords = ['with', 'in', 'using'] } = {}) {
    const cs = []; let cur = [];
    for (const t of toks) { if (t.t === ',') { cs.push(cur); cur = []; } else cur.push(t); }
    cs.push(cur);
    const first = cs.shift();
    const { area, i } = readArea(ctx, first, 0);
    let j = i, mat = null;
    if (material && isWord(first[j], ...matWords)) { const r = readMaterial(ctx, first, j + 1); mat = r.material; j = r.i; }
    const extra = first.slice(j);
    const mods = readMods([...extra, ...cs.flatMap(c => [{ t: ',' }, ...c])]);
    return { area, mat, mods };
  }
  const matRef = (ctx, mat, want) => {               // store the material in the doc; return its name
    if (!mat) return null;
    if (mat.ref) return mat.ref;
    if (mat.type === 'color') {
      const key = 'c' + mat.hex.slice(1);
      ctx.doc.materials[key] ||= { type: 'enamel', hex: mat.hex, process: 'soft-enamel', name: mat.name || mat.hex };
      return key;
    }
    if (want === 'enamel' && mat.type !== 'enamel') ctx.err(`"${mat.name}" is a metal; enamel needs a colour or an enamel`, 'e.g. "enamel it in ivory" or "in #efe6d8"');
    if (want === 'metal' && mat.type === 'enamel') ctx.err(`"${mat.name}" is an enamel; plating needs a metal`, 'e.g. "plate it with chrome"');
    const key = mat.name;
    ctx.doc.materials[key] ||= mat.type === 'enamel' ? { type: 'enamel', hex: mat.hex, process: mat.process, name: mat.name }
      : { type: 'metal', finish: mat.finish, polish: mat.polish || 'mirror', preview: mat.preview };
    return key;
  };
  const step = (ctx, op, area, extra = {}) => ctx.addStep({ op, area, ...extra });
  // how a colour sits on what is under it: "60% opacity" or "opacity 0.6", and a blend mode ("multiply", "blended screen")
  const BLENDS = ['multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  const frac = (t, d = null) => t == null || t.t !== 'num' ? d : Math.max(0, Math.min(1, t.unit === 'pct' || t.v > 1 ? t.v / 100 : t.v));
  const look = (mods) => {
    const o = {}, op = frac(mods.opacity ?? mods.opaque), bl = BLENDS.find(b => flag(mods, b) || mods.blended === b || mods.blend === b);
    if (op != null) o.opacity = op; if (bl) o.blend = bl;
    return o;
  };

  reg.verb({
    words: ['plate', 'coat'],
    help: 'Electroplate or PVD a metal onto an area.',
    examples: ['plate the frame with chrome.', 'plate the card with black mirror.', 'plate it with $gold, satin.'],
    run(ctx, toks) {
      const { area, mat, mods } = head(ctx, toks, { material: true });
      if (!mat) ctx.err('plate it with what?', 'e.g. "plate the frame with chrome."');
      const m = matRef(ctx, mat.type === 'color' ? ctx.err('plating needs a metal, not a colour', 'did you mean "enamel"?') : mat, 'metal');
      if (flag(mods, 'satin')) ctx.doc.materials[m] = { ...ctx.doc.materials[m], polish: 'satin' };
      step(ctx, 'plate', area, { material: m });
    },
  });
  reg.verb({
    words: ['foil', 'hot-foil'],
    help: 'Hot-foil a metal or holo foil, slightly raised.',
    examples: ['foil the rays with silk holo.'],
    run(ctx, toks) {
      const { area, mat, mods } = head(ctx, toks, { material: true });
      step(ctx, 'foil', area, { material: matRef(ctx, mat, 'metal'), params: { emboss: num(mods.raised, 0.5) } });
    },
  });
  reg.verb({
    words: ['engrave', 'cut'],
    help: 'Cut into the surface. Depth in mm (default 0.04).',
    examples: ['engrave the vine, 0.04 mm deep.'],
    run(ctx, toks) { const { area, mods } = head(ctx, toks); step(ctx, 'engrave', area, { params: { depth_mm: ctx.mm(mods.deep, 0.04) } }); },
  });
  reg.verb({
    words: ['enamel', 'fill', 'colour', 'color', 'paint'],
    help: 'Fill an area with enamel colour (sits in the last engraving). A gradient: "in a gradient from #a to #b, angled 45" or "in a radial gradient from …". Add "60% opacity" or a blend mode (multiply, screen, overlay…). "fill … with crosshatch" draws a pattern instead.',
    examples: ['enamel the vine in ivory.', 'enamel it in #efe6d8.', 'enamel the card in a gradient from #0b1d51 to #e94f37, angled 45.', 'enamel the badge in #ffffff, 40% opacity, multiply.'],
    run(ctx, toks, s) {
      const gen = ctx.reg.match(ctx.reg.generators, dropArticles(toks).slice(dropArticles(toks).findIndex(t => isWord(t, 'with')) + 1), 0, 3);
      if (gen && toks.some(t => isWord(t, 'with'))) return ctx.reg.verbs.get('draw').run(ctx, toks, s, 'fill');
      if (!toks.some(t => isWord(t, 'in', 'with', 'using'))) return ctx.reg.verbs.get('solidify').run(ctx, toks, s);   // "fill it." = make it solid
      const gi = toks.findIndex(t => isWord(t, 'gradient'));
      if (gi > 0) {                                   // enamel the card in a gradient from #a to #b, angled 45 · …, radial
        let w = gi - 1; while (w > 0 && isWord(toks[w], 'a', 'an', 'the', 'linear', 'radial')) w--;
        if (!isWord(toks[w], 'in', 'with', 'using')) ctx.err('say "in a gradient from <colour> to <colour>"');
        const { area } = readArea(ctx, toks.slice(0, w));
        const after = toks.slice(gi + 1), ci = after.findIndex(t => t.t === ','), first = ci < 0 ? after : after.slice(0, ci);
        const stops = readColors(ctx, first.filter(t => !isWord(t, 'from', 'to', 'through', 'then', 'via')));
        if (stops.length < 2) ctx.err('a gradient needs at least two colours', 'e.g. "enamel the card in a gradient from #0b1d51 to #e94f37, angled 45."');
        const mods = readMods(ci < 0 ? [] : after.slice(ci + 1));
        const radial = toks.some(t => isWord(t, 'radial')) || flag(mods, 'radial');
        const gradient = { stops, angle: num(mods.angled ?? mods.angle ?? mods.turned, 90), ...(radial ? { radial: true } : {}) };
        return step(ctx, 'enamel', area, { material: matRef(ctx, { type: 'color', hex: stops[0] }, 'enamel'), params: { gradient, ...look(mods) } });
      }
      const { area, mat, mods } = head(ctx, toks, { material: true });
      if (!mat) ctx.err('enamel it in what colour?', 'e.g. "enamel the vine in ivory."');
      const lk = look(mods);
      step(ctx, 'enamel', area, { material: matRef(ctx, mat, 'enamel'), ...(Object.keys(lk).length ? { params: lk } : {}) });
    },
  });
  // photo-editor adjustments as one filter: blurred 6, brightness 1.2, contrast 1.1, saturation 0.5, hue 40, grayscale, sepia, inverted
  const filterOf = (ctx, mods) => {
    const fs = [], f = (k, css, d) => { if (mods[k] != null) fs.push(`${css}(${d(num(mods[k]))})`); };
    f('blurred', 'blur', () => ctx.px(mods.blurred) + 'px'); f('blur', 'blur', () => ctx.px(mods.blur) + 'px');
    f('brightness', 'brightness', v => v); f('contrast', 'contrast', v => v); f('saturation', 'saturate', v => v); f('hue', 'hue-rotate', v => v + 'deg');
    if (flag(mods, 'grayscale', 'greyscale', 'monochrome') || (flag(mods, 'black') && flag(mods, 'white'))) fs.push('grayscale(1)');
    if (flag(mods, 'sepia')) fs.push('sepia(1)');
    if (flag(mods, 'inverted', 'negative')) fs.push('invert(1)');
    return fs.join(' ');
  };
  reg.verb({
    words: ['adjust', 'filter'],
    help: 'An adjustment layer: changes everything already painted under an area. blurred 12 (frosted glass), brightness 1.1, contrast 1.2, saturation 0.6, hue 40, grayscale, sepia, inverted. Write it after the things it should change.',
    examples: ['adjust the panel, blurred 14, brightness 1.1.', 'adjust the card, grayscale, contrast 1.2.'],
    run(ctx, toks) {
      const { area, mods } = head(ctx, toks), filter = filterOf(ctx, mods);
      if (!filter) ctx.err('adjust it how?', 'e.g. "adjust the panel, blurred 14, brightness 1.1."');
      step(ctx, 'adjust', area, { params: { filter, ...look(mods) } });
    },
  });
  reg.verb({
    words: ['grain', 'noise'],
    help: 'Film grain over an area, for texture: an amount from 0 to 1 (default 0.25). "coarse" makes bigger grains.',
    examples: ['grain the card, 0.3.', 'grain the card, 0.2, coarse.'],
    run(ctx, toks) {
      const { area, mods } = head(ctx, toks);
      step(ctx, 'grain', area, { params: { amount: Math.max(0, Math.min(1, num((mods._nums || [])[0] ?? mods.amount, .25))), size: flag(mods, 'coarse') ? 2 : 1 } });
    },
  });
  reg.verb({
    words: ['stroke'],
    help: 'A flat outline round an area, outside its edge: "stroke the title in #ffffff, 6 wide." (Without a colour, "stroke the petal, 3 wide" draws a shape as a line, like "hollow".)',
    examples: ['stroke the title in #ffffff, 6 wide.', 'stroke the badge in gold, 10 wide, 80% opacity.'],
    run(ctx, toks, s) {
      if (!toks.some(t => isWord(t, 'in', 'with', 'using'))) return ctx.reg.verbs.get('hollow').run(ctx, toks, s);
      const { area, mat, mods } = head(ctx, toks, { material: true });
      if (!mat) ctx.err('stroke it in what colour?', 'e.g. "stroke the title in #ffffff, 6 wide."');
      const w = mods.wide != null ? ctx.px(mods.wide) : 4, lk = look(mods);
      const ring = { ...area, terms: area.terms.map(t => ({ ...t, mod: 'halo', r: w })) };
      const key = mat.type === 'color' || mat.type === 'enamel' ? matRef(ctx, mat, 'enamel') : matRef(ctx, mat, 'metal');
      step(ctx, mat.type === 'color' || mat.type === 'enamel' ? 'enamel' : 'plate', ring, { material: key, ...(Object.keys(lk).length ? { params: lk } : {}) });
    },
  });
  // ── effects that sit in the colour only: a soft shadow under an area, a glow round it
  const offsets = (ctx, m) => [(m.right != null ? ctx.px(m.right) : 0) - (m.left != null ? ctx.px(m.left) : 0), (m.down != null ? ctx.px(m.down) : 0) - (m.up != null ? ctx.px(m.up) : 0)];
  reg.verb({
    words: ['shadow'],
    help: 'A soft drop shadow under an area. Write it before the steps that colour the area, so the area sits on its shadow. Defaults: 10 down, blur 18, black, 45% opacity. Add "inside" for an inner shadow (written after the colour), which makes the area look cut in.',
    examples: ['shadow the headline, 14 down, 6 right, blur 24, in #000000, 50% opacity.', 'shadow the panel, inside, 6 down, blur 16, 50% opacity.'],
    run(ctx, toks) {
      const { area, mods } = head(ctx, toks);
      const col = [mods.in, mods.with].find(t => t?.t === 'color')?.v || '#000000';
      const has = ['down', 'up', 'left', 'right'].some(k => mods[k] != null), [dx, dy] = has ? offsets(ctx, mods) : [0, 10];
      const inner = flag(mods, 'inside', 'inner', 'inset') || mods.inside !== undefined;   // an inner shadow falls inside the area, from its edge
      step(ctx, inner ? 'inshadow' : 'shadow', area, { params: { dx, dy, blur: mods.blur != null ? ctx.px(mods.blur) : mods.soft != null ? ctx.px(mods.soft) : 18, color: col, opacity: look(mods).opacity ?? .45 } });
    },
  });
  reg.verb({
    words: ['glow'],
    help: 'A glow of light round an area (outer glow). Write it before the steps that colour the area. Defaults: white, 30 wide, strength 1.',
    examples: ['glow the headline in #ffd54a, 40 wide, strength 2.'],
    run(ctx, toks) {
      const { area, mat, mods } = head(ctx, toks, { material: true });
      step(ctx, 'glow', area, { params: { color: mat?.hex || '#ffffff', blur: mods.wide != null ? ctx.px(mods.wide) : 30, strength: Math.max(1, Math.min(4, Math.round(num(mods.strength, 1)))), ...look(mods) } });
    },
  });
  reg.verb({
    words: ['inlay'],
    help: 'Engrave and fill with enamel in one go.',
    examples: ['inlay the vine with ivory, 0.04 mm deep.'],
    run(ctx, toks) {
      const { area, mat, mods } = head(ctx, toks, { material: true });
      if (!mat) ctx.err('inlay it with what colour?');
      step(ctx, 'engrave', area, { params: { depth_mm: ctx.mm(mods.deep, 0.04) } });
      step(ctx, 'enamel', area, { material: matRef(ctx, mat, 'enamel') });
    },
  });
  reg.verb({
    words: ['outline'],
    help: 'Engrave a ring around an area and fill it (default niello, 6 wide).',
    examples: ['outline the frame in niello, 6 wide.', 'outline the signature, 9 wide.'],
    run(ctx, toks) {
      const { area, mat, mods } = head(ctx, toks, { material: true });
      const w = mods.wide != null ? ctx.px(mods.wide) : 6;
      const ring = { ...area, terms: area.terms.map(t => ({ ...t, mod: 'halo', r: w })) };
      const m = matRef(ctx, mat || { ...ctx.reg.materials.get('niello') }, 'enamel');
      step(ctx, 'engrave', ring, { params: { depth_mm: ctx.mm(mods.deep, 0.04) } });
      step(ctx, 'enamel', ring, { material: m });
    },
  });
  reg.verb({
    words: ['emboss', 'raise'],
    help: 'Raise an area. Height in mm (default 0.12); "soft 0.7" rounds it.',
    examples: ['emboss the frame, 0.16 mm high, soft 0.7.'],
    run(ctx, toks) {
      const { area, mods } = head(ctx, toks);
      step(ctx, 'emboss', area, { params: { height_mm: ctx.mm(mods.high ?? mods.tall, 0.12), soft: num(mods.soft, flag(mods, 'soft', 'softly') ? 0.7 : 0.9) } });
    },
  });
  reg.verb({
    words: ['deboss', 'press', 'sink'],
    help: 'Press an area down. Depth in mm (default 0.04).',
    examples: ['deboss the badge, 0.04 mm deep.'],
    run(ctx, toks) { const { area, mods } = head(ctx, toks); step(ctx, 'deboss', area, { params: { height_mm: ctx.mm(mods.deep, 0.04) } }); },
  });
  reg.verb({
    words: ['etch', 'frost'],
    help: 'Frost or matte-etch an area.',
    examples: ['etch the background.'],
    run(ctx, toks) { const { area } = head(ctx, toks); step(ctx, 'etch', area); },
  });

  const SPRAYS = { gloss: 'gloss', candy: 'candy', glitter: 'glitter', metalflake: 'metalflake', 'metal-flake': 'metalflake', flake: 'metalflake', pearl: 'pearl', chameleon: 'chameleon', matte: 'matte' };
  reg.verb({
    words: ['spray'],
    help: 'Spray a coat: gloss, candy, glitter, metalflake, pearl, chameleon or matte. "in" takes colours.',
    examples: ['spray the window with gloss, 30 µm thick.', 'spray the signature with glitter in pale gold and deep gold, flakes 110 µm, density 0.7.'],
    run(ctx, toks) {
      const w = toks.findIndex(t => isWord(t, 'with'));
      if (w < 0) ctx.err('spray it with what?', `kinds: ${Object.keys(SPRAYS).join(', ')}`);
      const { area } = readArea(ctx, toks.slice(0, w));
      const rest = toks.slice(w + 1);
      const kind = SPRAYS[rest[0]?.v] || SPRAYS[`${rest[0]?.v}-${rest[1]?.v}`];
      if (!kind) {                                     // a mixed paint, or a pigment straight from the tin
        const words = []; for (const x of rest) { if (x.t !== 'word' || x.t === ',') break; words.push(x.v); }
        let pname = null, paint = null;
        for (let n = Math.min(3, words.length); n > 0 && !paint; n--) {
          const w = words.slice(0, n).join('-'), m = ctx.doc.materials[w] || ctx.doc.materials[words.slice(0, n).join(' ')];
          if (m?.type === 'paint') { pname = w; paint = m; break; }
          const pg = findPigment(words.slice(0, n));
          if (pg) { pname = pg.replace(/ /g, '-'); paint = { type: 'paint', pigments: [{ pigment: pg, amount: 1 }], hex: mixPigments([{ pigment: pg, amount: 1 }]), finish: 'satin' }; ctx.doc.materials[pname] = paint; }
        }
        if (paint) {
          const ci = rest.findIndex(x => x.t === ',');
          const mods = readMods(ci < 0 ? [] : rest.slice(ci + 1));
          return step(ctx, 'spray', area, { kind: 'paint', material: pname, params: sprayParams(ctx, mods) });
        }
      }
      if (!kind) ctx.err(`unknown spray "${rest[0]?.v}"`, ctx.suggest(rest[0]?.v || '', Object.keys(SPRAYS)));
      const after = rest.slice(SPRAYS[rest[0]?.v] ? 1 : 2);
      const cs = clauses(after);
      const params = {};
      for (const c of cs) {
        if (isWord(c[0], 'in')) { const cols = readColors(ctx, c.slice(1)); if (cols.length) params.color = cols.length > 1 ? cols : cols[0]; continue; }
        const m = readMods(c);
        if (m.thick) params.thickness_um = m.thick.unit === 'mm' ? m.thick.v * 1000 : m.thick.v;
        if (m.flakes) params.flake_um = num(m.flakes);
        if (m.density != null) params.density = num(m.density);
        if (m.opacity != null) params.opacity = num(m.opacity);
        if (m.tint != null) params.tint = num(m.tint);
        if (m.overspray != null) params.overspray_px = ctx.px(m.overspray);
        if (m.flop) params.flop = readColors(ctx, [].concat(m.flop));
        if (m.holo != null || flag(m, 'holo', 'holographic')) params.holo = true;
      }
      step(ctx, 'spray', area, { kind, params });
    },
  });

  reg.verb({
    words: ['print'],
    help: 'Print a photo or illustration into an area (default: the window); printed in a shape, the photo fills that shape. Adjust it: duotone #1b1145 and #ffb347, blurred 6, brightness 1.2, contrast 1.1, saturation 0.5, hue 40, grayscale, sepia, inverted, 70% opacity, multiply. "on foil" prints see-through onto metal.',
    examples: ['print @photo.jpg in the badge, grayscale, contrast 1.2.', 'print @marilyn.jpg in the window, focused at 0.5 0.2.', 'print @star.png on foil, white under the figure.'],
    run(ctx, toks) {
      const a = toks.find(t => t.t === 'asset');
      if (!a) ctx.err('print which image?', 'e.g. "print @photo.jpg in the window."');
      const key = ctx.asset(a.v);
      const rest = toks.slice(toks.indexOf(a) + 1);
      let area = { terms: [{ ref: 'window', mod: null }], minus: [], within: [] }, j = 0;
      if (isWord(rest[0], 'in', 'into', 'over', 'across')) { const r = readArea(ctx, rest, 1); area = r.area; j = r.i; }
      const mods = readMods(rest.slice(j));
      const image = { asset: key, zone: area.terms[0]?.ref === 'window' || ctx.doc.zones[area.terms[0]?.ref] ? area.terms[0].ref : 'window' };
      if (mods.focused || mods.focus) image.focus = [].concat(mods.focused || mods.focus).map(x => num(x));
      if (mods.zoom) image.zoom = num(mods.zoom);
      // a photo fills the shape it is printed in (a frame): a circle, a star, a rounded rectangle
      const fl = ctx.doc.layers[area.terms[0]?.ref];
      if (fl?.shapes?.length) {
        const xs = fl.shapes.flatMap(sh => sh.pts.map(p => p[0])), ys = fl.shapes.flatMap(sh => sh.pts.map(p => p[1]));
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        image.rect = [x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0].map(v => Math.round(v * 10) / 10);
      }
      // adjustments, as in a photo editor
      const filter = filterOf(ctx, mods); if (filter) image.filter = filter;
      // duotone: shadows take the first colour, highlights the second
      if (mods.duotone != null) { const cols = [].concat(mods.duotone).filter(t => t?.t === 'color').map(t => t.v); if (cols.length < 2) ctx.err('duotone needs two colours', 'e.g. "duotone #1b1145 and #ffb347"'); image.duotone = cols.slice(0, 2); }
      const lk = look(mods);
      const extra = Object.keys(lk).length ? { params: lk } : {};
      if (flag(mods, 'foil') || mods.on === 'foil') {
        extra.on_foil = true;
        if (mods.white) extra.white = { terms: [{ ref: String(mods.white.under || mods.white).replace(/^under-/, ''), mod: null }], minus: [], within: [] };
      }
      step(ctx, 'print', area, { image, ...extra });
    },
  });

  reg.verb({
    words: ['illustrate'],
    help: 'Cloisonné: turn an illustration into flat enamel cells with metal wires.',
    examples: ['illustrate @mansion.jpg in the window, 16 colours.'],
    run(ctx, toks) {
      const a = toks.find(t => t.t === 'asset');
      if (!a) ctx.err('illustrate which image?');
      const key = ctx.asset(a.v);
      const rest = toks.slice(toks.indexOf(a) + 1);
      let area = { terms: [{ ref: 'window', mod: null }], minus: [], within: [] }, j = 0;
      if (isWord(rest[0], 'in', 'into')) { const r = readArea(ctx, rest, 1); area = r.area; j = r.i; }
      const m = readMods(rest.slice(j));
      step(ctx, 'illustrate', area, { image: { asset: key, zone: area.terms[0].ref }, params: { colors: num(m.colours ?? m.colors, 16), smooth: num(m.smooth, 1.7), line_lum: num(m.lines, 0.3), line_w: 5, wall_px: 0, depth_mm: 0.05 } });
    },
  });
}
