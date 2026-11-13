// The registry: everything godtongue knows lives here, added by packs.
// A pack is a function (reg) => void. The core never names a verb, material or generator itself.
//
//   reg.verb({ words: ['plate'], help, examples, run(ctx, toks, stmt) })
//   reg.generator({ name: 'studs', words: ['studs', 'stud'], help, defaults, run(ctx, params) → layer })
//   reg.material({ name: 'mirror-chrome', words: ['mirror chrome', 'chrome'], type: 'metal', preview: {...} })
//   reg.color('ivory', '#efe6d8')
//   reg.style({ name: 'studded-bezel', words: ['studded bezel'], source: '<godtongue text>' })
export class Registry {
  constructor() {
    this.verbs = new Map(); this.verbList = [];
    this.generators = new Map(); this.genList = [];
    this.materials = new Map(); this.matList = [];
    this.colors = new Map();
    this.styles = new Map(); this.styleList = [];
    this.words = new Map(); this.wordList = [];       // what "make" and "give" can apply: effects, states, transforms, motions
    this.finishers = [];                              // run once after the last statement
  }
  use(pack) { pack(this); return this; }
  verb(v) { this.verbList.push(v); for (const w of v.words) this.verbs.set(w, v); }
  generator(g) { this.genList.push(g); for (const w of [g.name, ...(g.words || [])]) this.generators.set(w, g); }
  material(m) { this.matList.push(m); for (const w of [m.name, ...(m.words || [])]) this.materials.set(w, m); }
  color(name, hex) { this.colors.set(name, hex); }
  // reg.word({ words: ['glow', 'glowing'], kind: 'effect', help, example, apply(ctx, a) }): a known word for "make the x glow"
  word(w) { this.wordList.push(w); for (const k of w.words) this.words.set(k, w); }
  finish(fn) { this.finishers.push(fn); }
  style(s) { this.styleList.push(s); for (const w of [s.name, ...(s.words || [])]) this.styles.set(w, s); }

  // multi-word lookup: longest phrase of words from the start of toks that names an entry
  match(map, toks, from = 0, max = 4) {
    for (let n = Math.min(max, toks.length - from); n >= 1; n--) {
      const ws = toks.slice(from, from + n);
      if (!ws.every(t => t.t === 'word' || t.t === 'num')) continue;
      const key = ws.map(t => t.t === 'num' ? String(t.v) : t.v).join(' ');
      if (map.has(key)) return { entry: map.get(key), n, key };
      const dashed = key.replace(/ /g, '-');
      if (map.has(dashed)) return { entry: map.get(dashed), n, key: dashed };
    }
    return null;
  }

  reference() {      // self-documentation for the studio and `gt reference`
    return {
      verbs: this.verbList.map(v => ({ words: v.words, help: v.help, examples: v.examples || [] })),
      generators: this.genList.map(g => ({ name: g.name, words: g.words || [], help: g.help, params: g.params || {} })),
      materials: this.matList.map(m => ({ name: m.name, words: m.words || [], type: m.type })),
      colors: [...this.colors.entries()].map(([name, hex]) => ({ name, hex })),
      styles: this.styleList.map(s => ({ name: s.name, words: s.words || [], help: s.help })),
      words: this.wordList.map(w => ({ words: w.words, kind: w.kind, help: w.help, example: w.example })),
    };
  }
}

export function closest(word, options) {   // "did you mean …"
  let best = null, bd = Infinity;
  for (const o of options) {
    const d = lev(word, o);
    if (d < bd) { bd = d; best = o; }
  }
  return bd <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}
function lev(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
