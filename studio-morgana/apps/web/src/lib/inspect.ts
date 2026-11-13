// What is under the pointer in the godtongue source: an error, a word of the language, a named thing, a colour, a file.
// Pure functions: the editor gives them the line, the column and what the compiler last said; they say what to show.
import type { Diagnostic, Elem, RefWord, Reference } from '../render/compiler';

export type Hit =
  | { k: 'diag'; d: Diagnostic }
  | { k: 'word'; entry: RefWord; kind: string; label: string }
  | { k: 'elem'; e: Elem }
  | { k: 'set'; name: string; members: Elem[] }
  | { k: 'piece' }
  | { k: 'color'; hex: string; name?: string }
  | { k: 'file'; name: string };
export interface Found { hit: Hit; from: number; to: number; key: string }   // from/to: columns on the line, 0-based, to exclusive

export interface Index { phrases: Map<string, { entry: RefWord; kind: string }> }
const norm = (s: string) => s.toLowerCase().replace(/[-\s]+/g, ' ').trim();

// every phrase the language knows, by what it is (the first listing wins: a verb beats a word beats a colour)
export function indexOf(ref: Reference): Index {
  const phrases = new Map<string, { entry: RefWord; kind: string }>();
  const add = (list: RefWord[] | undefined, kind: (w: RefWord) => string) => {
    for (const w of list || []) for (const p of w.words || []) { const k = norm(p); if (k && !phrases.has(k)) phrases.set(k, { entry: w, kind: kind(w) }); }
  };
  add(ref.verbs, () => 'verb');
  add(ref.words, (w) => w.kind || 'word');
  add(ref.generators, () => 'shape');
  add(ref.materials, () => 'material');
  add(ref.styles, () => 'style');
  for (const c of ref.colors) { const k = norm(c.name); if (!phrases.has(k)) phrases.set(k, { entry: { words: [c.name], hex: c.hex }, kind: 'colour' }); }
  return { phrases };
}

// the line with strings and comments blanked, so words inside them are not read as language
function masked(text: string): string {
  return text.replace(/--.*$/, (m) => ' '.repeat(m.length)).replace(/"[^"]*"?/g, (m) => ' '.repeat(m.length));
}
const WORD = /[A-Za-z][\w'’-]*/g;
const CARD = new Set(['card', 'canvas', 'page', 'poster', 'stage']);
const setCandidates = (w: string) => [w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, '')];

export interface Ctx { diags: Diagnostic[]; elements: Record<string, Elem> | null; index: Index | null; files: string[] }

export function hitAt(line: number, text: string, col: number, ctx: Ctx): Found | null {
  if (col < 0 || col >= text.length) return null;
  // an error on this word beats everything
  for (const d of ctx.diags) {
    const r = d.range;
    if (r && r.line === line && col >= r.col - 1 && col < r.col - 1 + Math.max(1, r.len)) return { hit: { k: 'diag', d }, from: r.col - 1, to: r.col - 1 + Math.max(1, r.len), key: `d${line}:${r.col}` };
  }
  const m = masked(text);
  if (m[col] === ' ' && text[col] !== ' ') return null;                  // inside a string or a comment
  for (const x of m.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (col >= x.index! && col < x.index! + x[0].length) return { hit: { k: 'color', hex: x[0] }, from: x.index!, to: x.index! + x[0].length, key: 'h' + x[0] + x.index };
  for (const x of m.matchAll(/@[\w./-]+/g)) if (col >= x.index! && col < x.index! + x[0].length && ctx.files.includes(x[0].slice(1))) return { hit: { k: 'file', name: x[0].slice(1) }, from: x.index!, to: x.index! + x[0].length, key: 'f' + x[0] };
  const words = [...m.matchAll(WORD)].map((x) => ({ t: x[0], from: x.index!, to: x.index! + x[0].length }));
  const wi = words.findIndex((w) => col >= w.from && col < w.to);
  if (wi < 0) return null;
  const w = words[wi], lw = w.t.toLowerCase().replace(/['’]s$/, '');
  const els = ctx.elements;
  if (els) {
    if (els[lw]) return { hit: { k: 'elem', e: els[lw] }, from: w.from, to: w.to, key: 'e' + lw };
    if (CARD.has(lw)) return { hit: { k: 'piece' }, from: w.from, to: w.to, key: 'piece' };
    for (const c of setCandidates(lw)) {
      const re = new RegExp('^' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-\\d+$');
      const ms = Object.values(els).filter((e) => re.test(e.name));
      if (ms.length > 1) return { hit: { k: 'set', name: c, members: ms }, from: w.from, to: w.to, key: 's' + c };
    }
  }
  // a phrase of the language that covers this word: the longest one
  if (ctx.index) {
    let best: { n: number; s: number; v: { entry: RefWord; kind: string } } | null = null;
    for (let s = Math.max(0, wi - 3); s <= wi; s++) {
      for (let n = Math.min(4, words.length - s); n >= wi - s + 1; n--) {
        const run = words.slice(s, s + n);
        if (!run.every((x, i) => i === 0 || /^ +$/.test(text.slice(run[i - 1].to, x.from)))) continue;   // only words with plain spaces between
        const v = ctx.index.phrases.get(norm(run.map((x) => x.t).join(' ')));
        if (v && (!best || n > best.n)) best = { n, s, v };
        if (v) break;
      }
    }
    if (best) { const a = words[best.s], b = words[best.s + best.n - 1]; return { hit: { k: 'word', entry: best.v.entry, kind: best.v.kind, label: text.slice(a.from, b.to) }, from: a.from, to: b.to, key: `w${line}:${a.from}` }; }
  }
  return null;
}

// the thing under a point of the picture (piece pixels): the smallest box that holds it
export function elementAt(els: Record<string, Elem> | null, x: number, y: number): Elem | null {
  if (!els) return null;
  let best: Elem | null = null, area = Infinity;
  for (const e of Object.values(els)) {
    const [a, b, c, d] = e.box;
    if (x < a || x > c || y < b || y > d) continue;
    const ar = (c - a) * (d - b);
    if (ar < area) { area = ar; best = e; }
  }
  return best;
}

export const unionBox = (es: Elem[]): [number, number, number, number] => [Math.min(...es.map((e) => e.box[0])), Math.min(...es.map((e) => e.box[1])), Math.max(...es.map((e) => e.box[2])), Math.max(...es.map((e) => e.box[3]))];
