// Shared phrase readers. Packs use these so every verb and generator reads modifiers the same way,
// and a new generator gets its sentence grammar for free.
import { show } from './read.js';

export const ARTICLES = new Set(['a', 'an', 'the']);
export const PREPS = new Set(['along', 'around', 'inside', 'across', 'at', 'from', 'to', 'over', 'on', 'in',
  'within', 'between', 'for', 'under', 'near', 'into', 'onto', 'behind', 'above', 'below', 'through']);
const AREA_STOPS = new Set(['with', 'in', 'at', 'to', 'from', 'and', 'plus', 'except', 'but', 'minus', 'without',
  'where', 'within', 'inside', 'by', 'grown', 'called', 'using', 'as', 'on', 'onto', 'into']);

export const isWord = (t, ...w) => t && t.t === 'word' && (w.length === 0 || w.includes(t.v));
export const dropArticles = (toks) => toks.filter(t => !(t.t === 'word' && ARTICLES.has(t.v)));

export function clauses(toks) {
  const out = [[]];
  for (const t of toks) { if (t.t === ',') out.push([]); else out.at(-1).push(t); }
  return out.filter(c => c.length);
}

// a name made of one or more words: "gold rims" → "gold-rims"
export function readName(toks, i, stops = AREA_STOPS) {
  const ws = [];
  while (i < toks.length && toks[i].t === 'word' && !stops.has(toks[i].v)) ws.push(toks[i++].v);
  return { name: ws.join('-'), i };
}

// One modifier clause → merged into mods. Values are kept as tokens (handlers convert units).
//   38 apart · 0.8 mm thick · 756 by 1345 · 1 of 100 · size 58 · tilted -6 degrees · leaves every 38
//   along the frame · at 620 1478 · focused at 0.5 0.2 · with gold rims · without blossoms
//   leaving a gap at the top · clear of the corners and the middles · called studs · centred
export function readClause(c, mods) {
  c = dropArticles(c);
  if (!c.length) return mods;
  const [a, b, d] = c;
  if (isWord(a, 'called', 'named') && c[1]?.t === 'str') { mods.name = c[1].v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return c.length > 2 ? readClause(c.slice(2), mods) : mods; }
  if (isWord(a, 'called', 'named')) {
    const r = readName(c, 1, new Set([...PREPS, 'with', 'without', 'leaving', 'clear']));
    mods.name = r.name;
    return r.i < c.length ? readClause(c.slice(r.i), mods) : mods;
  }
  if (a.t === 'num') {
    if (isWord(b, 'by', 'x') && c[2]?.t === 'num') { mods.size = [a, c[2]]; if (c[3]?.t === 'word') mods[c[3].v] = [a, c[2]]; return mods; }
    if (isWord(b, 'of') && c[2]?.t === 'num') { mods.of = [a, c[2]]; return mods; }
    if (b?.t === 'word') { mods[b.v] = a; if (c.length > 2) readClause(c.slice(2), mods); return mods; }
    (mods._nums ||= []).push(...c.filter(t => t.t === 'num')); return mods;
  }
  if (a.t === 'word') {
    if (PREPS.has(a.v)) { mods[a.v] = prepValue(c.slice(1)); return mods; }
    if (a.v === 'with' || a.v === 'without') {
      const rest = c.slice(1);
      for (const part of splitAnd(rest)) {
        const words = part.filter(t => t.t === 'word').map(t => t.v), nums = part.filter(t => t.t !== 'word');
        if (!words.length) continue;
        const key = words.at(-1);
        if (a.v === 'without') { mods[key] = false; continue; }
        // "with leaves every 38" → leavesEvery; "with gold rims" → rims: 'gold'; "with blossoms" → true
        const ev = part.findIndex(t => isWord(t, 'every'));
        if (ev > 0) { mods[part[ev - 1].v + 'Every'] = part[ev + 1]; mods[part[ev - 1].v] ??= true; continue; }
        mods[key] = words.length > 1 ? words.slice(0, -1).join('-') : (nums[0] || true);
      }
      return mods;
    }
    if (a.v === 'leaving' || (a.v === 'gap')) {
      const at = c.findIndex(t => isWord(t, 'at'));
      const side = at >= 0 ? c.slice(at + 1).filter(t => t.t === 'word').map(t => t.v) : ['top'];
      mods.gap = side.join('-'); const n = c.find(t => t.t === 'num'); if (n) mods.gapSize = n; return mods;
    }
    if (a.v === 'clear' && isWord(b, 'of')) {
      mods.clear = splitAnd(c.slice(2)).map(p => p.filter(t => t.t === 'word').map(t => t.v).join('-'));
      const n = c.find(t => t.t === 'num'); if (n) mods.clearBy = n; return mods;
    }
    if (isWord(b, 'every') && d) { mods[a.v + 'Every'] = d; return mods; }
    if (b?.t === 'num' || b?.t === 'color' || b?.t === 'str' || b?.t === 'asset') {
      const vals = c.slice(1).filter(t => t.t !== 'word');
      mods[a.v] = vals.length > 1 ? vals : vals[0]; return mods;
    }
    if (b && PREPS.has(b.v) && c.length > 2) { mods[a.v] = prepValue(c.slice(2)); return mods; }   // focused at 0.5 0.2
    for (const t of c) if (t.t === 'word') (mods._flags ||= new Set()).add(t.v);
    (mods._phrases ||= []).push(c.filter(t => t.t === 'word').map(t => t.v).join(' '));
    return mods;
  }
  (mods._extra ||= []).push(...c);
  return mods;
}
function prepValue(rest) {
  rest = dropArticles(rest);
  if (rest.length && rest.every(t => t.t === 'num')) return rest.length === 1 ? rest[0] : rest;
  if (rest.length === 1 && rest[0].t !== 'word') return rest[0];
  if (rest.every(t => t.t === 'word')) return rest.map(t => t.v).join('-');
  return rest;
}
function splitAnd(toks) {
  const out = [[]];
  for (const t of toks) { if (isWord(t, 'and')) out.push([]); else out.at(-1).push(t); }
  return out.filter(p => p.length);
}

export function readMods(toks) {
  const mods = {};
  for (const c of clauses(toks)) readClause(c, mods);
  return mods;
}

export const flag = (mods, ...w) => w.some(x => mods._flags?.has(x));

// ── Areas ──────────────────────────────────────────────────────────────────────
//   it · the card · frame and studs · the outline of frame by 6 · vine grown by 5
//   the card except the window and the studs · rays where it meets the window
// → { terms: [{ref, mod, r}], minus: [...], within: [...] }
export function readArea(ctx, toks, i = 0) {
  const area = { terms: [], minus: [], within: [] };
  let mode = 'terms';
  const term = () => {
    while (isWord(toks[i], 'the', 'a', 'an', 'all', 'of')) i++;
    let mod = null, r = null;
    if (isWord(toks[i], 'outline', 'edge', 'halo', 'ring')) { mod = 'halo'; i++; if (isWord(toks[i], 'of')) i++; while (isWord(toks[i], 'the')) i++; }
    if (isWord(toks[i], 'its', 'their')) {           // "its petals" = the petals of whatever "it" is (a placed object)
      i++; const owners = [].concat(ctx.it || []); if (!owners.length) finish(null, mod);
      const { name, i: j } = readName(toks, i); if (!name) ctx.err('its what?'); i = j;
      const first = finish(ctx.resolve(`${owners[0]}-${name}`), mod);
      return [first, ...owners.slice(1).map(o => ({ ...first, ref: ctx.resolve(`${o}-${name}`) }))];
    }
    if (isWord(toks[i], 'it', 'them')) {
      i++; const refs = [].concat(ctx.it || []);
      if (!refs.length) finish(null, mod);
      const first = finish(refs[0], mod);
      return [first, ...refs.slice(1).map(r => ({ ...first, ref: r }))];
    }
    const { name, i: j } = readName(toks, i); if (!name) return null; i = j;
    return finish(ctx.resolve(name), mod);
    function finish(ref, mod) {
      if (!ref) ctx.err('"it" has nothing to point at yet', 'name a layer first, e.g. "draw a bezel called frame."');
      if (isWord(toks[i], 'grown')) { mod = 'grow'; i++; }
      if (isWord(toks[i], 'by') && toks[i + 1]?.t === 'num') { r = ctx.px(toks[i + 1]); i += 2; mod ||= 'grow'; }
      if (mod && r == null) r = mod === 'halo' ? 6 : 5;
      return { ref, mod, r };
    }
  };
  while (i < toks.length) {
    const t = toks[i];
    if (isWord(t, 'and', 'plus')) { i++; continue; }
    if (isWord(t, 'except', 'minus', 'without') || (isWord(t, 'but') && isWord(toks[i + 1], 'not'))) { mode = 'minus'; i += isWord(t, 'but') ? 2 : 1; continue; }
    if (isWord(t, 'where')) { mode = 'within'; i++; while (isWord(toks[i], 'it', 'they', 'meets', 'meet', 'overlaps', 'overlap')) i++; continue; }
    if (isWord(t, 'within', 'inside')) { mode = 'within'; i++; continue; }
    if (t.t !== 'word' || ['with', 'in', 'at', 'to', 'from', 'called', 'using', 'on', 'onto'].includes(t.v)) break;
    const tm = term(); if (!tm) break;
    area[mode].push(...[].concat(tm));
  }
  if (!area.terms.length) ctx.err('which area? name a layer, a zone, "it" or "the card"', 'e.g. "plate the frame with $chrome."');
  return { area, i };
}

// ── Materials and colours ─────────────────────────────────────────────────────
// $var already expanded by the compiler. Accepts a registered material phrase, a colour name or #hex.
export function readMaterial(ctx, toks, i = 0) {
  while (isWord(toks[i], 'the', 'a', 'an')) i++;
  const t = toks[i];
  if (!t) ctx.err('which material?', 'e.g. "with mirror chrome" or "in #efe6d8"');
  if (t.t === 'color') return { material: { type: 'color', hex: t.v }, i: i + 1 };
  const own = ctx.reg.match(ctx.materialsByName(), toks, i, 4);
  if (own) return { material: { ...own.entry, ref: own.key }, i: i + own.n };
  const m = ctx.reg.match(ctx.reg.materials, toks, i, 4);
  if (m) return { material: { ...m.entry }, i: i + m.n };
  const c = ctx.reg.match(ctx.reg.colors, toks, i, 3);
  if (c) return { material: { type: 'color', hex: c.entry, name: c.key }, i: i + c.n };
  const word = t.t === 'word' ? t.v : show(t);
  ctx.err(`unknown material "${word}"`, ctx.suggest(word, [...ctx.reg.materials.keys(), ...ctx.reg.colors.keys()]));
}

export function readColors(ctx, toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'color') { out.push(t.v); continue; }
    const m = t.t === 'word' ? ctx.reg.match(ctx.reg.colors, toks, i, 3) : null;
    const e = !m && t.t === 'word' ? ctx.reg.match(ctx.reg.materials, toks, i, 3) : null;
    if (m) { out.push(m.entry); i += m.n - 1; }
    else if (e?.entry.hex) { out.push(e.entry.hex); i += e.n - 1; }
    else if (t.t === 'word' && !['and', 'or', 'with', 'in'].includes(t.v)) ctx.err(`unknown colour "${t.v}"`, ctx.suggest(t.v, [...ctx.reg.colors.keys()]) || 'use a colour name or #hex');
  }
  return out;
}

export const num = (t, d = null) => t == null ? d : t.t === 'num' ? t.v : (typeof t === 'number' ? t : d);
