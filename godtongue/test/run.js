// godtongue tests: good cards compile, broken cards fail with a clear message on the right line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, createRegistry } from '../index.js';
import { toScene } from '../engines/web.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ex = path.join(ROOT, 'examples');
let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + info}`); };

// good cards
for (const f of ['hello.gt', 'marilyn.gt']) {
  const r = compile(fs.readFileSync(path.join(ex, f), 'utf8'), { baseDir: ex });
  ok(`compiles ${f}`, r.ok, JSON.stringify(r.diagnostics));
}
const tpl = fs.readFileSync(path.join(ex, 'batch', 'template.gt'), 'utf8');
const rb = compile(tpl, { baseDir: path.join(ex, 'batch'), vars: { id: 'oxana', name: 'Oxana', photo: 'oxana.jpg' } });
ok('batch template with $id $name $photo', rb.ok && rb.doc.layers.signature.text === 'Oxana' && rb.doc.id === 'godtongue/oxana', JSON.stringify(rb.diagnostics));

// broken cards: [name, source, expected line, words the message or hint must contain]
const B = 'create a card called t.\ndraw a bezel called frame.\non the front.\n';
const cases = [
  ['unknown verb', B + 'plait the card with chrome.', 4, 'did you mean "plate"'],
  ['unknown material', B + 'plate the frame with chrom.', 4, 'chrome'],
  ['undefined variable', B + 'plate the frame with $gild.', 4, '$gild is not defined'],
  ['missing image', B + 'print @nobody.jpg in the window.', 4, "can't find @nobody.jpg"],
  ['unknown layer', B + 'plate the fram with chrome.', 4, 'did you mean "frame"'],
  ['recipe never closed', B + 'define $x as:\n plate it with gold.', 4, 'end.'],
  ['"it" before anything', 'on the front.\nplate it with chrome.', 2, 'nothing to point at'],
  ['unknown style', B + 'use the fluffy style.', 4, 'no style called'],
  ['unknown spray', B + 'spray the frame with sparkles.', 4, 'unknown spray'],
  ['enamel needs a colour', B + 'enamel the frame in chrome.', 4, 'is a metal'],
  ['plate needs a metal', B + 'plate the frame with ivory.', 4, 'plating needs a metal'],
  ['unknown generator', 'create a card called t.\ndraw a unicorn called u.', 2, 'nothing called "unicorn"'],
  ['wrong side', B + 'on the edge.', 4, 'front or on the back'],
  ['unknown stock', 'create a card called t from plastic.', 1, 'not a blank stock'],
  ['studs on nothing', 'create a card called t.\nset studs along the moon.', 2, 'no outline to follow'],
];
for (const [name, src, line, words] of cases) {
  const r = compile(src, { baseDir: ex });
  const d = r.diagnostics.find(x => x.level === 'error');
  const text = d ? `${d.msg} ${d.hint || ''}` : '';
  ok(`fails clearly: ${name}`, !r.ok && d.line === line && text.includes(words), `got line ${d?.line}: ${text}`);
}
// geometry: arithmetic, elements, manipulations, definitions
{
  const r = compile(fs.readFileSync(path.join(ex, 'rose-and-plane.gt'), 'utf8'), { baseDir: ex });
  ok('compiles rose-and-plane.gt', r.ok, JSON.stringify(r.diagnostics));
  ok('a rose ring has 5 petals; "petals 6" gives 6', r.doc.layers['big-rose-petal']?.shapes.length === 5 && r.doc.layers['small-rose-1-petal']?.shapes.length === 6);
  ok('"place 2 roses" makes small-rose-1 and small-rose-2', !!r.doc.layers['small-rose-1'] && !!r.doc.layers['small-rose-2']);
  ok('"mirror the leaf" doubles it', r.doc.layers['big-rose-leaf']?.shapes.length === 2);
  ok('"its petal" finds big-rose-petal', r.doc.sides.front.steps.some(st => st.area.terms.some(t => t.ref === 'big-rose-petal')));
  const t = compile('create a card called t.\ndefine $a as 10.\ndraw a circle called c, $a * 2 + 5 big, at 100 100.\nmove c by -$a 0.', { baseDir: ex });
  const b = t.doc.layers.c && require_bbox(t.doc.layers.c);
  ok('arithmetic: $a * 2 + 5 = 25, -$a moves left', t.ok && Math.round(b[2] - b[0]) === 50 && Math.round((b[0] + b[2]) / 2) === 90, JSON.stringify(t.diagnostics) + JSON.stringify(b));
  const sq = compile('create a card called t.\ndraw a rectangle called r, 100 by 50, at 0 0.\nturn r 90 degrees.', { baseDir: ex });
  const q = require_bbox(sq.doc.layers.r);
  ok('turn 90 degrees swaps width and height', Math.round(q[2] - q[0]) === 50 && Math.round(q[3] - q[1]) === 100);
}
function require_bbox(L) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const s of L.shapes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; }
const G = 'create a card called t.\n';
for (const [name, src, line, words] of [
  ['place something undefined', G + 'place a tulip at 100 100.', 2, 'nothing called "tulip"'],
  ['definition without its recipe', G + 'define a tulip with $size 10.', 2, 'needs its recipe'],
  ['finishing inside a definition', G + 'define a dot as:\n  draw a circle called c.\n  plate c with gold.\nend.\nplace a dot.', 6, 'a definition only draws'],
  ['move without a where', G + 'draw a circle called c.\nmove c.', 3, 'move it where'],
  ['a shape with two points', G + 'draw a shape called s from 0 0 to 10 10.', 2, 'at least three points'],
  ['an open bracket', G + 'draw a circle called c, (10 + 2 big.', 2, 'bracket is not closed'],
]) {
  const r = compile(src, { baseDir: ex }), d = r.diagnostics.find(x => x.level === 'error'), text = d ? `${d.msg} ${d.hint || ''}` : '';
  ok(`fails clearly: ${name}`, !r.ok && d.line === line && text.includes(words), `got line ${d?.line}: ${text}`);
}
// several problems are all reported, not just the first
const many = compile(B + 'plait it.\nplate the fram with chrome.\nspray the frame with fizz.', { baseDir: ex });
ok('reports every problem in one run', many.diagnostics.filter(d => d.level === 'error').length === 3, JSON.stringify(many.diagnostics.map(d => d.msg)));

// ── rooms
{
  const { buildScene } = await import('../rooms/build.js');
  const crypto = await import('node:crypto');
  const golden = path.join(ROOT, 'test', 'golden-rooms.json');
  const G = fs.existsSync(golden) ? JSON.parse(fs.readFileSync(golden, 'utf8')) : {};
  const rx = path.join(ex, 'rooms');
  for (const f of fs.readdirSync(rx).filter(f => f.endsWith('.gt'))) {
    const r = compile(fs.readFileSync(path.join(rx, f), 'utf8'), { baseDir: rx, file: f });
    ok(`room compiles ${f}`, r.ok && r.doc.kind === 'room', JSON.stringify(r.diagnostics));
    if (!r.ok) continue;
    const hash = crypto.createHash('sha256').update(JSON.stringify(buildScene(r.doc.room))).digest('hex').slice(0, 16);
    if (process.env.BLESS) G[f] = hash;
    ok(`room scene unchanged ${f}`, G[f] === hash, `golden ${G[f]} now ${hash} (run with BLESS=1 if the change is intended)`);
  }
  if (process.env.BLESS) fs.writeFileSync(golden, JSON.stringify(G, null, 1));
  // card IR goldens: the compiled document every renderer reads (asset paths dropped, content hashes kept)
  const cgold = path.join(ROOT, 'test', 'golden-cards.json');
  const CG = fs.existsSync(cgold) ? JSON.parse(fs.readFileSync(cgold, 'utf8')) : {};
  const CARDS = ['hello.gt', 'marilyn.gt', 'rose-and-plane.gt', 'lounge-card.gt', 'the-bride.gt', 'the-bride-v10.gt', 'goku/goku.gt'];
  const strip = (k, v) => (k === 'path' || k === 'file' || k === 'baseDir') ? undefined : v;
  for (const f of CARDS) {
    const fp = path.join(ex, f);
    const r = compile(fs.readFileSync(fp, 'utf8'), { baseDir: path.dirname(fp) });
    if (!r.ok) { ok(`card compiles ${f}`, false, JSON.stringify(r.diagnostics)); continue; }
    const hash = crypto.createHash('sha256').update(JSON.stringify(r.doc, strip)).digest('hex').slice(0, 16);
    if (process.env.BLESS) CG[f] = hash;
    ok(`card IR unchanged ${f}`, CG[f] === hash, `golden ${CG[f]} now ${hash} (run with BLESS=1 if the change is intended)`);
    // order 0.1: every document has a stage and an elements table; a card is one element with its faces
    const el = r.doc.elements?.card;
    ok(`element table ${f}`, !!r.doc.stage && !!el && el.faces.join() === Object.keys(r.doc.sides).join(), 'card must be one element whose faces are its sides');
  }
  if (process.env.BLESS) fs.writeFileSync(cgold, JSON.stringify(CG, null, 1));
  // canvas word and the web engine's scene
  { const cp = path.join(ex, 'canvas', 'post.gt'); const r = compile(fs.readFileSync(cp, 'utf8'), { baseDir: path.dirname(cp) });
    ok('canvas: any size, whole grid is the body', r.ok && r.doc.kind === 'canvas' && r.doc.card.grid.join() === '1080,1350' && r.doc.card.rect.join() === '0,0,1080,1350', JSON.stringify(r.diagnostics));
    const { toScene } = await import('../engines/web.js');
    const sc = toScene(r.doc);
    { const F = sc.elements[0].faces.front; ok('web scene: one mask per step, materials resolved', F.length === r.doc.sides.front.steps.length && F.every(s => s.mask.startsWith('data:image/svg+xml')) && F.find(s => s.op === 'plate').mat.metal === 1); }
    // design effects: gradients, opacity and blend, shadow, glow, photo adjustments and frames, text layout, placed paths
    { const fp = path.join(ex, 'canvas', 'effects.gt'); const fr = compile(fs.readFileSync(fp, 'utf8'), { baseDir: path.dirname(fp) });
      const st = fr.ok ? fr.doc.sides.front.steps : [], by = (op, n = 0) => st.filter(x => x.op === op)[n];
      ok('effects poster compiles', fr.ok, JSON.stringify(fr.diagnostics));
      ok('gradient: stops, angle, radial', fr.ok && by('enamel').params.gradient.stops.length === 3 && by('enamel').params.gradient.angle === 80 && by('enamel', 1).params.gradient.radial === true);
      ok('opacity and blend mode', fr.ok && by('enamel', 2).params.opacity === .85 && by('enamel', 2).params.blend === 'multiply');
      ok('shadow: offsets, blur, colour, opacity', fr.ok && by('shadow', 1).params.dx === 6 && by('shadow', 1).params.dy === 10 && by('shadow', 1).params.blur === 14 && by('shadow', 1).params.color === '#2a0a3a' && by('shadow', 1).params.opacity === .6);
      ok('glow: colour, width, strength', fr.ok && by('glow').params.color === '#ffd98a' && by('glow').params.blur === 90 && by('glow').params.strength === 2);
      ok('photo: fills its shape, with adjustments', fr.ok && by('print').image.rect.join() === '60,140,380,380' && by('print').image.filter === 'contrast(1.25) grayscale(1)');
      const L = fr.ok ? fr.doc.layers : {};
      ok('text: lines, leading, alignment', fr.ok && L.title.lines.join('|') === 'Golden|Hour' && L.title.leading === .92 && L.title.align === 'left');
      ok('text: wraps to a width', fr.ok && L.body.lines.length >= 3 && L.body.lines.join(' ') === L.body.text);
      ok('text: on an arc', fr.ok && L.arc.curve === 222);
      ok('path: placed, scaled and turned', fr.ok && /translate\(720 640\) rotate\(-24\) scale\(1.6\)/.test(L.leaf.svg));
      const { maskSvg } = await import('../engines/web.js');
      ok('text masks: tspans per line, textPath on an arc', fr.ok && (maskSvg(fr.doc, { terms: [{ ref: 'title' }] }).match(/<tspan/g) || []).length === 2 && /<textPath/.test(maskSvg(fr.doc, { terms: [{ ref: 'arc' }] })));
      const vp = path.join(ex, 'video', 'fade-ease.gt'); const vr = compile(fs.readFileSync(vp, 'utf8'), { baseDir: path.dirname(vp) });
      ok('motion: fades and easing', vr.ok && vr.doc.elements.title.fades.map(f => f.to).join() === '1,0' && vr.doc.elements.ball.moves[0].ease === 'bounce', JSON.stringify(vr.diagnostics));
      const bad = compile('create a canvas called x, 100 by 100.\non the front.\nenamel the card in a gradient from #ffffff.', {});
      ok('a gradient with one colour is explained', !bad.ok && bad.diagnostics.some(d => /two colours/.test(d.msg)));
    }
    // the second ten: measured text, fit, turn, stroke, inner shadow, adjust, duotone, grain, shapes, align, distribute, grid, motion presets
    { const fp = path.join(ex, 'canvas', 'launch.gt'); const fr = compile(fs.readFileSync(fp, 'utf8'), { baseDir: path.dirname(fp) });
      ok('launch poster compiles', fr.ok, JSON.stringify(fr.diagnostics));
      const L = fr.ok ? fr.doc.layers : {}, st = fr.ok ? fr.doc.sides.front.steps : [], by = (op, n = 0) => st.filter(x => x.op === op)[n];
      const { textWidth } = await import('../packs/text.js');
      const jost = { family: 'Jost', weight: 400, style: 'normal' };
      ok('text is measured in its font', Math.abs(textWidth('Hello', 1000, 0, jost) - textWidth('Hello', 1000, 0, null)) > 1 && textWidth('iiii', 100, 0, jost) < textWidth('MMMM', 100, 0, jost));
      ok('wrapped lines fit the width', fr.ok && L.body.lines.length === 2 && L.body.lines.every(l => textWidth(l, 30, 0, jost) <= 880));
      ok('fit: the longest line is as wide as asked', fr.ok && Math.abs(textWidth('LAUNCH DAY', L.title.size, 0, L.title.font) - 780) < 2);
      ok('text can be turned', fr.ok && L.new.turn === -6);
      ok('align left: both boxes share an edge', fr.ok && Math.abs(L.title.box[0] - L.when.box[0]) < .2);
      const mid = (n) => { const ys = L[n].shapes.flatMap(sh => sh.pts.map(q => q[1])); return (Math.min(...ys) + Math.max(...ys)) / 2; }, bx = (n) => { const xs = L[n].shapes.flatMap(sh => sh.pts.map(q => q[0])); return [Math.min(...xs), Math.max(...xs)]; };
      ok('align middle', fr.ok && ['two', 'three', 'four'].every(n => Math.abs(mid(n) - mid('one')) < .2));
      ok('distribute: equal gaps', fr.ok && Math.abs((bx('two')[0] - bx('one')[1]) - (bx('four')[0] - bx('three')[1])) < .2 && Math.abs((bx('three')[0] - bx('two')[1]) - (bx('two')[0] - bx('one')[1])) < .2);
      ok('grid of copies', fr.ok && L.dot.shapes.length === 40);
      ok('new shapes', fr.ok && L.one.shapes[0].pts.length > 6 && L.tag.shapes.length === 2 && L.four.shapes[0].pts.length === 7);
      ok('flat stroke is a ring outside the area', fr.ok && st.some(x => x.op === 'enamel' && x.area.terms[0].ref === 'title' && x.area.terms[0].mod === 'halo' && x.area.terms[0].r === 8));
      ok('inner shadow, adjust, grain, duotone', fr.ok && by('inshadow').params.blur === 10 && by('adjust').params.filter === 'blur(18px) brightness(1.15)' && by('grain').params.amount === .22 && by('print').image.duotone.join() === '#1b1145,#ff9a5a');
      ok('"stroke the petal, 3 wide" still hollows a shape', compile('create a canvas called x, 100 by 100.\ndraw a circle called c, 20 big, at 50 50.\nstroke the c, 3 wide.', {}).doc.layers.c.shapes[0].paint === 'stroke');
      const vp = path.join(ex, 'video', 'presets.gt'); const vr = compile(fs.readFileSync(vp, 'utf8'), { baseDir: path.dirname(vp) }), E = vr.doc.elements;
      ok('motion presets: entrances, exits, loops', vr.ok && E.badge.enter.style === 'pop' && E.wheel.enter.style === 'rise' && E.tag.enter.style === 'zoom' && E.banner.exit.style === 'shrink' && E.wheel.loops[0].kind === 'spin' && E.wheel.loops[0].period === 3 && E.badge.loops[0].amp === 16 && E.tag.loops[0].amp === 8, JSON.stringify(vr.diagnostics));
    }
    // close-out: flat mode, loops, feather, vignette, vector export
    { const fp = path.join(ex, 'canvas', 'pattern.gt'); const fr = compile(fs.readFileSync(fp, 'utf8'), { baseDir: path.dirname(fp) });
      ok('flat loop poster compiles', fr.ok, JSON.stringify(fr.diagnostics));
      const L = fr.ok ? fr.doc.layers : {}, st = fr.ok ? fr.doc.sides.front.steps : [];
      ok('repeat: numbered layers and one name for all', fr.ok && !!L['orbit-9'] && !L['orbit-10'] && L.orbit.shapes.length === 9 && L.ray.shapes.length === 12);
      ok('repeat: $n and $i feed sums', fr.ok && Math.abs(Math.max(...L['orbit-3'].shapes[0].pts.map(q => q[0])) - (540 + 210)) < .5 && L['orbit-3'].shapes[0].width === 5);
      ok('repeat: $n does not leak', !compile('create a canvas called x, 100 by 100.\nrepeat 2 times as:\n draw a circle called c, 10 big.\nend.\ndraw a circle called d, $n big.', {}).ok);
      const { toScene } = await import('../engines/web.js'), sc = toScene(fr.doc);
      ok('flat: the scene says so, on a white unlit body', fr.ok && fr.doc.canvas.flat === true && sc.elements[0].flat === true && sc.elements[0].body.color === '#ffffff');
      ok('lit canvases are unchanged', !toScene(compile(fs.readFileSync(path.join(ex, 'canvas', 'post.gt'), 'utf8'), { baseDir: path.join(ex, 'canvas') }).doc).elements[0].flat);
      ok('feather and vignette', fr.ok && st.find(x => x.params?.feather)?.params.feather === 6 && st.find(x => x.op === 'vignette').params.amount === .35 && st.find(x => x.op === 'vignette').params.color === '#1f3a5f');
      const { toSvg } = await import('../engines/svg.js'), svg = fr.ok ? toSvg(fr.doc) : '';
      ok('vector export: one svg, gradients, text as text, unique ids', /^<svg /.test(svg) && /<radialGradient/.test(svg) && /RADIAL<\/text>/.test(svg) && new Set(svg.match(/ id="[^"]+"/g)).size === svg.match(/ id="[^"]+"/g).length);
      const l2 = compile(fs.readFileSync(path.join(ex, 'canvas', 'launch.gt'), 'utf8'), { baseDir: path.join(ex, 'canvas') }), s2 = toSvg(l2.doc);
      ok('vector export: photo embedded, what is left out is listed', /<image href="data:image\/jpeg/.test(s2) && /left out[^>]*adjust/.test(s2) && /left out[^>]*grain/.test(s2));
    }
    // element model: bodies, layering, paint
    const sp = path.join(ex, 'stage', 'three-bodies.gt'); const st = compile(fs.readFileSync(sp, 'utf8'), { baseDir: path.dirname(sp) });
    ok('stage compiles with four elements', st.ok && st.doc.kind === 'stage' && Object.keys(st.doc.elements).join() === 'memo,ticket,plaque,swatch', JSON.stringify(st.diagnostics));
    ok('bodies: paper, card stock, metal', st.ok && st.doc.elements.memo.body.family === 'paper' && st.doc.elements.ticket.body.family === 'card' && st.doc.elements.plaque.body.family === 'metal' && st.doc.elements.memo.edge.style === 'torn');
    ok('layering: send behind', st.ok && st.doc.elements.swatch.order < st.doc.elements.plaque.order && st.doc.elements.swatch.order > st.doc.elements.ticket.order);
    const { mixPigments } = await import('../packs/elements.js');
    const g = mixPigments([{ pigment: 'phthalo blue', amount: 1 }, { pigment: 'hansa yellow', amount: 2 }]), gv = [1, 3, 5].map(i => parseInt(g.slice(i, i + 2), 16));
    ok(`paint: blue and yellow make green (${g})`, gv[1] > gv[0] && gv[1] > gv[2]);
    ok('spray with a paint records gun settings', st.ok && st.doc.sides.swatch.steps[0].kind === 'paint' && st.doc.sides.swatch.steps[0].params.passes === 2 && st.doc.sides.swatch.steps[1].params.soft === true);
    // motion words
    const mp = path.join(ex, 'video', 'mean-reversion.gt'); const mv = compile(fs.readFileSync(mp, 'utf8'), { baseDir: path.dirname(mp) });
    ok('video: 24 s timeline compiles', mv.ok && mv.doc.video.seconds === 24, JSON.stringify(mv.diagnostics?.slice(0, 2)));
    ok('motion: enter, slam, remove', mv.ok && mv.doc.elements.chart.enter.from === 'right' && mv.doc.elements['sell-stamp'].enter.style === 'slam' && mv.doc.elements.chart.exit.t0 === 16.2);
    ok('motion: reveals, camera, captions', mv.ok && mv.doc.timeline.reveals.price.dur === 2.6 && mv.doc.timeline.camera.length === 3 && mv.doc.timeline.captions.length === 8 && mv.doc.timeline.captions[0].marks[0].text === 'snap back');
    ok('ink body for stamps', mv.ok && mv.doc.elements['sell-stamp'].body.family === 'ink');
    const bad = compile('create a canvas called x.', { baseDir: ex });
    ok('canvas needs a size', !bad.ok && /needs a size/.test(bad.diagnostics[0].msg)); }
  const L = compile(fs.readFileSync(path.join(rx, 'lagos-lounge.gt'), 'utf8'), { baseDir: rx });
  const R = L.doc.room;
  ok('lounge: shots, panorama and walk', R.shots.length === 8 && R.panoramas.length === 1 && R.walks.length === 1, JSON.stringify([R.shots.length, R.panoramas?.length, R.walks?.length]));
  ok('coffee table sits 0.42 m from the sofa', (() => { const s = R.pieces.find(p => p.kind === 'sofa'), t = R.pieces.find(p => p.kind === 'coffee-table'); return Math.abs((t.at[0] - t.depth / 2) - (s.at[0] + s.depth / 2) - 0.42) < 1e-9; })());
  ok('preset: north wall is shot straight on', (() => { const s = R.shots.find(x => x.name === 'north-wall'); return s.from3[0] === s.at3[0] && s.at3[2] === R.size[1]; })());
  const RB = 'create a room called t, 4 by 3, 2.6 high.\n';
  const rcases = [
    ['piece with nowhere to go', RB + 'place a sofa in linen.', 2, 'where does the sofa go'],
    ['window with no wall', RB + 'cut a window, 1.2 wide.', 2, 'which wall'],
    ['window off the end of a wall', RB + 'cut a window in the north wall, 1.5 wide, at 3.6.', 2, 'runs off the north wall'],
    ['unknown room material', RB + 'make the floor oakk.', 2, 'did you mean "oak"'],
    ['reference to a missing piece', RB + 'place a coffee table in front of the sofa.', 2, 'no "sofa" in the room'],
    ['walk with no end', RB + 'walk from 1 1, 5 seconds.', 2, 'start and an end'],
  ];
  for (const [name, src, line, words] of rcases) {
    const r = compile(src, {}); const d = r.diagnostics.find(x => x.level === 'error');
    ok(`room error: ${name}`, d && d.line === line && `${d.msg} ${d.hint || ''}`.includes(words), JSON.stringify(d));
  }
  const card = compile('create a card called c.\ndraw a bezel called frame.\non the front.\nplate the frame with chrome.', {});
  ok('cards still own "create", "place" and "make"', card.ok && !card.doc.room, JSON.stringify(card.diagnostics));
}

// a card on a stage (orders 0.2 and 0.3): one renderer, placed cards are elements with their own faces
{
  const dp = path.join(ex, 'stage', 'card-on-desk.gt');
  const cd = compile(fs.readFileSync(dp, 'utf8'), { baseDir: path.dirname(dp) });
  ok('stage places a card file', cd.ok, JSON.stringify(cd.diagnostics));
  const t = cd.doc.elements.ticket;
  ok('placed card: two faces, scale 0.7, one flip at 1.2 s', !!t && t.faces.join() === 'front,back' && t.scale === 0.7 && t.flips?.length === 1 && t.flips[0].t0 === 1.2, JSON.stringify(t && { faces: t.faces, scale: t.scale, flips: t.flips }));
  const tk = toScene(cd.doc).elements.find(e => e.name === 'ticket');
  ok('placed card: its own faces and metal body in the scene', !!tk && tk.faces.back.length > 0 && tk.body.family === 'metal' && tk.card === undefined, JSON.stringify(tk && Object.keys(tk)));
  const missing = compile('create a stage called s, 600 by 600.\nplace a card called x from @nothere.gt at 1 1.', { baseDir: ex });
  ok('placing a missing file says so', !missing.ok && missing.diagnostics.some(d => /no file/.test(d.msg)), JSON.stringify(missing.diagnostics));
  const offStage = compile('create a card called c.\nplace a card called x from @hello.gt at 1 1.', { baseDir: ex });
  ok('cards are placed only on a stage', !offStage.ok && offStage.diagnostics.some(d => /stage/.test(d.msg)), JSON.stringify(offStage.diagnostics));
  ok('0.2: the web engine is the one runtime', !fs.existsSync(path.join(ROOT, 'web', 'runtime.js')) && fs.existsSync(path.join(ROOT, 'web', 'engine.js')));
}

// R3: every word ships help and an example
{
  const reg = createRegistry();
  const missing = reg.verbList.filter(v => !v.help || !(v.examples && v.examples.length)).map(v => v.words[0]);
  ok('every verb has help and an example', missing.length === 0, 'missing: ' + missing.join(', '));
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
