// compile(source) → { doc, diagnostics }
// The core only splits, reads, expands $variables and dispatches each statement to the verb that claims it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { split, group } from './split.js';
import { read, show } from './read.js';
import { newDoc, pxPerMm, areaRefs } from './doc.js';
import { closest } from './registry.js';

// v2 (docs/scene-ir.md): explicit kind, view split from the blank. v1 fields stay for the factory.
// Order 0.1: every document carries a stage and an elements table. A card or canvas is one element whose faces
// are the sides; a stage keeps its own elements. Added after parsing, so parse-time routing is unchanged.
function toV2(doc) {
  doc.gtdoc = 2;
  doc.kind ??= 'card';
  if (doc.card) doc.view = { bench: doc.card.bench, lights: doc.card.lights };
  doc.stage ??= { size: [doc.card.grid[0], doc.card.grid[1]], background: doc.card.bench };
  doc.elements ??= {};
  if (doc.kind !== 'stage' && doc.kind !== 'room') {
    const name = doc.kind === 'canvas' ? 'canvas' : 'card';
    doc.elements[name] = { order: 0, kind: name, faces: Object.keys(doc.sides), stock: doc.card.stock, size_mm: doc.card.size_mm };
  }
}

export class GTError extends Error { constructor(msg, hint) { super(msg); this.hint = hint; } }

export function compile(source, { registry, baseDir = '.', vars = {}, assetDirs = [], file = null } = {}) {
  const doc = newDoc();
  const diagnostics = [];
  const ctx = makeContext(doc, registry, diagnostics, baseDir, assetDirs);
  for (const [k, v] of Object.entries(vars)) ctx.vars.set(k.toLowerCase(), { value: toTokens(v) });
  if (file) doc.source = { file: path.basename(file) };
  ctx.run(source);
  for (const f of registry.finishers || []) { try { f(ctx); } catch (e) { if (!(e instanceof GTError)) throw e; diagnostics.push({ level: 'error', line: ctx.line, msg: e.message, hint: e.hint }); } }
  validate(ctx);
  toV2(doc);
  return { doc, diagnostics, ok: !diagnostics.some(d => d.level === 'error') };
}

function toTokens(v) {   // batch values: numbers, files, colours, text
  if (typeof v === 'number') return [{ t: 'num', v, unit: null }];
  const s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return [{ t: 'num', v: parseFloat(s), unit: null }];
  if (/^#[0-9a-f]{3,6}$/i.test(s)) return [{ t: 'color', v: s.toLowerCase() }];
  if (/\.(jpe?g|png|webp|svg|gif)$/i.test(s)) return [{ t: 'asset', v: s.replace(/^@/, '') }];
  return [{ t: 'str', v: s }];
}

function makeContext(doc, reg, diagnostics, baseDir, assetDirs) {
  const ctx = {
    doc, reg, baseDir, assetDirs, vars: new Map(), objects: new Map(), side: null, it: null, line: 0, depth: 0, _diag: diagnostics, inDefinition: false,
    err(msg, hint) { throw new GTError(msg, hint); },
    warn(msg, hint) { diagnostics.push({ level: 'warning', line: ctx.line, msg, hint }); },
    suggest(word, options) { const c = closest(word, options); return c ? `did you mean "${c}"?` : undefined; },
    px(t) {                               // geometry → grid px
      if (t == null) return null;
      if (typeof t === 'number') return t;
      if (t.t !== 'num') ctx.err(`expected a number, got ${show(t)}`);
      return t.unit === 'mm' ? t.v * pxPerMm(doc) : t.unit === 'um' ? t.v / 1000 * pxPerMm(doc) : t.v;
    },
    mm(t, d = null) {                     // depths and heights → mm
      if (t == null) return d;
      if (typeof t === 'number') return t;
      if (t.t !== 'num') ctx.err(`expected a number, got ${show(t)}`);
      return t.unit === 'um' ? t.v / 1000 : t.unit === 'px' ? t.v / pxPerMm(doc) : t.v;
    },
    materialsByName() { return new Map(Object.entries(doc.materials).map(([k, v]) => [k, v])); },
    addLayer(name, layer) {
      if (!name) ctx.err('this needs a name', 'add "called <name>"');
      if (doc.zones[name] && name !== 'window') ctx.warn(`"${name}" is also a zone; the layer wins`);
      doc.layers[name] = { ...layer, line: ctx.line, span: ctx.span }; ctx.it = name; return doc.layers[name];
    },
    layer(name) { return doc.layers[name]; },
    sideObj(side = ctx.side || 'front') { return (doc.sides[side] ||= { silhouette: [], steps: [] }); },
    addStep(step) {
      if (ctx.inDefinition) ctx.err('a definition only draws; finish it after placing it', 'e.g. after "place a rose called r." write "plate the r-petal with rose gold."');
      ctx.sideObj().steps.push({ ...step, line: ctx.line, span: ctx.span });
    },
    resolve(name) {                       // "petals" finds "petal"
      const L = doc.layers, Z = doc.zones;
      for (const n of [name, name.replace(/ies$/, 'y'), name.replace(/es$/, ''), name.replace(/s$/, '')]) if (L[n] || Z[n]) return n;
      // one of several: "third-orbit" finds "orbit-3", "last-ray" the last of the rays
      const o = name.match(/^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last)-(.+)$/);
      if (o) {
        const base = ctx.resolve(o[2]), set = ctx.sets?.get(base);
        if (set) { const k = o[1] === 'last' ? set.length - 1 : ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'].indexOf(o[1]); if (set[k]) return set[k]; ctx.err(`there are only ${set.length} of "${base}"`); }
      }
      return name;
    },
    asset(rel) {
      const tries = [path.resolve(baseDir, rel), ...assetDirs.map(d => path.resolve(d, rel))];
      const p = tries.find(f => fs.existsSync(f));
      if (!p) ctx.err(`can't find @${rel}`, `put it next to the .gt file${assetDirs.length ? ' or in ' + assetDirs.join(', ') : ''}`);
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      doc.assets[rel] = { path: p, sha256 }; return rel;
    },
    run(source, origin) {                 // compile more godtongue into this document (styles, recipes)
      if (++ctx.depth > 20) ctx.err('recipes call each other too deeply');
      const stmts = typeof source === 'string' ? group(split(source)) : source;
      for (const s of stmts) runStatement(ctx, s, origin);
      ctx.depth--;
    },
  };

  function runStatement(ctx, s, origin) {
    const prevLine = ctx.line;
    ctx.line = origin ? prevLine : s.line;
    if (!origin) ctx.span = [s.line, s.col, s.text.length];
    const where = origin ? { line: prevLine, via: origin } : { line: s.line, col: s.col };
    try {
      if (s.error) ctx.err(s.error);
      if (s.unterminated && !origin) ctx.warn('last statement has no full stop');
      let toks = read(s.text.replace(/:$/, ''));
      if (!toks.length) return;
      const isDefine = toks[0].t === 'word' && toks[0].v === 'define';
      if (!(isDefine && toks[1]?.t === 'word')) toks = fold(ctx, expand(ctx, toks, isDefine));   // object definitions keep their $settings unexpanded
      const hit = reg.match(reg.verbs, toks, 0, 3);
      if (!hit) {
        const w = toks[0].t === 'word' ? toks[0].v : show(toks[0]);
        ctx.err(`unknown verb "${w}"`, ctx.suggest(w, [...reg.verbs.keys()]) || 'see the reference panel for every verb');
      }
      hit.entry.run(ctx, toks.slice(hit.n), s);
    } catch (e) {
      if (!(e instanceof GTError)) { e.message = `internal: ${e.message}`; console.error(e); }
      diagnostics.push({ level: 'error', ...where, msg: e.message, hint: e.hint, statement: s.text });
    }
  }
  return ctx;
}

// $variables: values are substituted as tokens; recipes are left for "use".
function expand(ctx, toks, isDefine) {
  const out = [];
  toks.forEach((t, k) => {
    if (t.t !== 'var' || (isDefine && k === 1)) return out.push(t);
    const v = ctx.vars.get(t.v);
    if (!v) ctx.err(`$${t.v} is not defined`, ctx.suggest(t.v, [...ctx.vars.keys()]) ? `did you mean $${ctx.suggest(t.v, [...ctx.vars.keys()]).replace(/^did you mean "|"\?$/g, '')}?` : `add "define $${t.v} as ….", or pass it from a batch sheet`);
    if (v.recipe) out.push(t);
    else if (t.neg) {
      if (v.value.length !== 1 || v.value[0].t !== 'num') ctx.err(`-$${t.v} needs $${t.v} to be a number`);
      out.push({ ...v.value[0], v: -v.value[0].v });
    } else out.push(...v.value);
  });
  return out;
}

// Arithmetic: "$size * 0.5" → one number. Adjacent numbers without an operator stay separate ("at 10 20").
function fold(ctx, toks) {
  if (!toks.some(t => t.t === 'op' || t.t === '(')) return toks;
  const out = []; let i = 0;
  const atom = () => {
    const t = toks[i];
    if (t?.t === '(') { i++; const v = expr(); if (toks[i]?.t !== ')') ctx.err('a bracket is not closed'); i++; return v; }
    if (t?.t === 'op' && t.v === '-') { i++; const v = atom(); return { ...v, v: -v.v }; }
    if (t?.t !== 'num') ctx.err(`expected a number in the sum, got ${t ? show(t) : 'nothing'}`);
    i++; return { ...t };
  };
  const term = () => { let a = atom(); while (toks[i]?.t === 'op' && (toks[i].v === '*' || toks[i].v === '/')) { const op = toks[i++].v, b = atom(); if (op === '/' && b.v === 0) ctx.err('division by zero'); a = { ...a, v: op === '*' ? a.v * b.v : a.v / b.v, unit: a.unit || b.unit }; } return a; };
  const expr = () => { let a = term(); while (toks[i]?.t === 'op' && (toks[i].v === '+' || toks[i].v === '-')) { const op = toks[i++].v, b = term(); a = { ...a, v: op === '+' ? a.v + b.v : a.v - b.v, unit: a.unit || b.unit }; } return a; };
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === 'num' || t.t === '(') { const v = expr(); out.push({ ...v, v: Math.round(v.v * 1000) / 1000 }); }
    else if (t.t === 'op') ctx.err(`"${t.v}" needs a number before it`);
    else { out.push(t); i++; }
  }
  return out;
}

function validate(ctx) {
  const { doc } = ctx;
  for (const [side, s] of Object.entries(doc.sides)) {
    for (const st of s.steps) for (const r of areaRefs(st.area)) {
      if (doc.layers[r] || doc.zones[r]) continue;
      const opts = [...Object.keys(doc.layers), ...Object.keys(doc.zones)];
      ctx.line = st.line;
      const c = closest(r, opts);
      diagnosticsPush(ctx, { level: 'error', line: st.line, msg: `"${r}" is not a layer or a zone (${side})`, hint: c ? `did you mean "${c}"?` : `known: ${opts.join(', ')}` });
    }
    for (const n of s.silhouette) if (!doc.layers[n]) diagnosticsPush(ctx, { level: 'error', line: 0, msg: `silhouette: no layer "${n}"` });
  }
}
function diagnosticsPush(ctx, d) { ctx._diag ? ctx._diag.push(d) : null; }
