// Game pack: a piece that plays. The piece is drawn as always (a lit canvas: the skin); these words put a game on it.
//
//   Play wordle on the screen, with the keyboard on the deck.     which game, and which drawn things it sits on
//   Let the word be "crane".  Let the tries be 6.                 the game's values are plain Let values ($word works)
//   Every tile is #1a1408, with #ffb347 letters, in Martian Mono, glowing.
//   A correct tile is #2f8f6b.  A present tile is #d9a441.  An absent tile is #3a3530.
//   Every key is ivory, with #2b2118 letters, raised.  A correct key is #2f8f6b.
//   Control the light with the dial.  Control the power with the switch.
//   When the game is won, say "Lunch is on us".
//
// What it writes: doc.game = { kind, board, keyboard, looks, controls, says, values } (docs/game-layer.md).
// The game itself runs in the browser (web/games/<kind>.js); the `game` engine sets it on the drawn skin.

const GAMES = {
  wordle: {
    parts: ['tile', 'key'],
    states: { tile: ['empty', 'typed', 'correct', 'present', 'absent'], key: ['correct', 'present', 'absent'] },
    events: ['won', 'lost', 'guessed', 'started'],
    values: {
      word: { need: true, check: (v) => /^[a-z]{5}$/.test(v) || 'the word must be 5 letters, a to z' },
      tries: { def: 6, check: (v) => (Number.isInteger(v) && v >= 1 && v <= 10) || 'tries must be a whole number from 1 to 10' },
    },
  },
};
const CONTROLS = ['light', 'power'];

const isWord = (t, ...w) => t?.t === 'word' && w.includes(t.v);
const art = (w) => (/^[aeiou]/.test(w) ? 'an' : 'a');
const txt = (toks) => toks.map(t => t.raw ?? (t.t === 'str' ? `"${t.v}"` : t.t === ',' ? ',' : t.v)).join(' ');

export default function game(reg) {
  const G = (ctx) => {
    if (!ctx.doc.game) ctx.err('there is no game on this piece yet', 'start with "Play wordle on the screen, with the keyboard on the deck."');
    return ctx.doc.game;
  };
  const layerOf = (ctx, name) => {
    const n = ctx.resolve(name);
    if (!ctx.doc.layers[n]) ctx.err(`there is nothing called "${name}" to put the game on`, ctx.suggest(name, Object.keys(ctx.doc.layers)) || 'draw it first, e.g. "Let there be a rectangle called screen, 900 by 760, at 540 620."');
    return n;
  };

  // Play wordle on the screen, with the keyboard on the deck.
  reg.verb({
    words: ['play'],
    help: 'Puts a game on the piece: which game, and which drawn things it sits on. "Play wordle on the screen, with the keyboard on the deck." The things must be drawn already (rectangles are best); the game fills them.',
    examples: ['Play wordle on the screen, with the keyboard on the deck.'],
    run(ctx, toks) {
      if (!ctx.doc.canvas) ctx.err('a game sits on a canvas', 'start with "Let there be a canvas called player, 1080 by 1920."');
      if (ctx.doc.game) ctx.err('this piece already plays a game', 'one "Play …" per piece');
      const kind = toks[0]?.t === 'word' ? toks[0].v : null;
      if (!GAMES[kind]) ctx.err(`I don't know the game "${kind ?? txt(toks.slice(0, 1))}"`, `games: ${Object.keys(GAMES).join(', ')}`);
      const on = (from) => { const i = toks.findIndex((t, k) => k >= from && isWord(t, 'on', 'in')); return i < 0 ? null : toks.slice(i + 1).find(t => t.t === 'word' && !isWord(t, 'the', 'a', 'an'))?.v; };
      const comma = toks.findIndex(t => t.t === ',');
      const boardName = on(1);
      if (!boardName || (comma >= 0 && toks.findIndex(t => isWord(t, 'on', 'in')) > comma)) ctx.err('play it on what?', 'e.g. "Play wordle on the screen."');
      const g = { kind, board: layerOf(ctx, boardName), keyboard: null, looks: {}, controls: {}, says: {}, values: {}, line: ctx.line, span: ctx.span };
      if (comma >= 0) {
        const rest = toks.slice(comma + 1);
        if (!isWord(rest.find(t => t.t === 'word' && !isWord(t, 'with', 'the')), 'keyboard', 'keys')) ctx.err(`I don't know "${txt(rest)}"`, 'e.g. ", with the keyboard on the deck"');
        const kb = rest.findIndex(t => isWord(t, 'on', 'in'));
        const name = rest.slice(kb + 1).find(t => t.t === 'word' && !isWord(t, 'the'))?.v;
        if (kb < 0 || !name) ctx.err('the keyboard goes on what?', 'e.g. ", with the keyboard on the deck"');
        g.keyboard = layerOf(ctx, name);
      }
      ctx.doc.game = g;
    },
  });

  // looks: "Every tile is …", "A correct tile is …", "Correct keys are …"
  const look = (part, state) => (ctx, toks) => {
    const g = G(ctx), spec = GAMES[g.kind];
    if (!spec.parts.includes(part)) ctx.err(`${g.kind} has no ${part}s`, `its parts: ${spec.parts.join(', ')}`);
    if (state && !spec.states[part].includes(state)) ctx.err(`a ${part} in ${g.kind} is never "${state}"`, `its states: ${spec.states[part].join(', ')}`);
    let t = toks; if (isWord(t[0], 'is', 'are', 'look', 'looks')) t = t.slice(1);
    if (!t.length) ctx.err(`what is ${state ? `${art(state)} ${state} ${part}` : `every ${part}`}?`, `e.g. "A correct ${part} is #2f8f6b, with white letters."`);
    const L = {}, parts = [[]];
    for (const x of t) x.t === ',' ? parts.push([]) : parts.at(-1).push(x);
    const colour = (x) => {
      if (x.t === 'color') return { hex: x.v };
      if (x.t !== 'word') return null;
      const named = ctx.vars.get(x.v)?.value;                 // "Let ink be #ffb347." then "with ink letters"
      if (named?.length === 1 && named[0].t !== 'str') return colour(named[0]);
      const m = ctx.reg.materials.get(x.v);
      if (m?.preview) return { hex: m.preview.hi, lo: m.preview.lo, metal: m.type !== 'enamel' };
      if (m?.hex) return { hex: m.hex };
      const c = ctx.reg.colors.get(x.v); return c ? { hex: c } : null;
    };
    for (const p of parts.filter(p => p.length)) {
      const w = p[0];
      if (isWord(w, 'with') && p.length >= 2) {
        const c = colour(p[1]); if (!c) ctx.err(`"${txt([p[1]])}" is not a colour`, 'e.g. "with #ffb347 letters" or "with white letters"');
        if (!isWord(p[2], 'letters', 'letter', 'text', 'ink')) ctx.err(`with ${txt([p[1]])} what?`, 'e.g. "with white letters"');
        L.ink = c.hex; continue;
      }
      if (isWord(w, 'in')) { L.font = p.slice(1).map(x => x.raw ?? x.v).join(' '); continue; }
      if (isWord(w, 'corners', 'rounded')) { const n = p.find(x => x.t === 'num'); if (!n) ctx.err('corners how round?', 'e.g. "corners 8"'); L.corners = n.v; continue; }
      if (isWord(w, 'glowing', 'lit', 'glows')) { L.glow = true; continue; }
      if (isWord(w, 'dark', 'unlit')) { L.glow = false; continue; }
      if (isWord(w, 'raised', 'sunk', 'sunken', 'flat')) { L.relief = w.v === 'sunken' ? 'sunk' : w.v; continue; }
      let c = colour(w);
      if (!c && p.length > 1) { const two = ctx.reg.materials.get(`${w.v} ${p[1].v}`); if (two?.preview) c = { hex: two.preview.hi, lo: two.preview.lo, metal: true }; }
      if (c) { L.face = c.hex; if (c.lo) L.faceLo = c.lo; if (c.metal) L.metal = true; continue; }
      ctx.err(`I don't know "${txt(p)}" for a ${part}`, 'say a colour or material, "with <colour> letters", "in <font>", "corners 8", "glowing", "raised" or "sunk"');
    }
    const key = state ? `${part}.${state}` : part;
    g.looks[key] = { ...(g.looks[key] || {}), ...L };
  };
  const forms = [];
  for (const spec of Object.values(GAMES)) for (const part of spec.parts) {
    forms.push([[`every ${part}`, `all ${part}s`], part, null]);
    for (const st of spec.states[part]) forms.push([[`${art(st)} ${st} ${part}`, `${st} ${part}s`, `every ${st} ${part}`], part, st]);
  }
  const seen = new Set();
  for (const [words, part, st] of forms) {
    const fresh = words.filter(w => !seen.has(w)); fresh.forEach(w => seen.add(w));
    if (fresh.length) reg.verb({ words: fresh, help: st ? `How ${art(st)} ${st} ${part} looks, over how every ${part} looks.` : `How every ${part} looks, before any state: a colour or material, "with <colour> letters", "in <font>", "corners 8", "glowing", "raised" or "sunk".`, examples: [st ? `${words[0][0].toUpperCase() + words[0].slice(1)} is #2f8f6b, with white letters.` : `Every ${part} is ivory, with #2b2118 letters, in Jost, raised.`], run: look(part, st) });
  }

  // Control the light with the dial.
  reg.verb({
    words: ['control'],
    help: 'Gives the panel a control: a drawn thing that changes the panel itself, not the game. "Control the light with the dial." (turn it, and the light moves across the whole skin) "Control the power with the switch." (the screen goes dark and back)',
    examples: ['Control the light with the dial.', 'Control the power with the switch.'],
    run(ctx, toks) {
      const g = G(ctx);
      const what = toks.find(t => t.t === 'word' && !isWord(t, 'the'))?.v;
      if (!CONTROLS.includes(what)) ctx.err(`I can't control "${what}"`, `controls: ${CONTROLS.join(', ')}`);
      const w = toks.findIndex(t => isWord(t, 'with', 'by'));
      const name = w < 0 ? null : toks.slice(w + 1).find(t => t.t === 'word' && !isWord(t, 'the'))?.v;
      if (!name) ctx.err(`control the ${what} with what?`, `e.g. "Control the ${what} with the ${what === 'light' ? 'dial' : 'switch'}."`);
      g.controls[what] = layerOf(ctx, name);
    },
  });

  // When the game is won, say "…".   (other "when"s keep their old meaning)
  const when = reg.verbs.get('when');
  const gameWhen = {
    ...when,
    run(ctx, toks, s) {
      const ci = toks.findIndex(t => t.t === ',');
      const cond = ci < 0 ? toks : toks.slice(0, ci);
      if (!cond.some(t => isWord(t, 'game'))) return when.run(ctx, toks, s);
      const g = G(ctx), spec = GAMES[g.kind];
      const ev = cond.find(t => t.t === 'word' && spec.events.includes(t.v))?.v
        ?? (cond.some(t => isWord(t, 'starts', 'begins')) ? 'started' : null);
      if (!ev) ctx.err(`I don't know that moment: "${txt(cond)}"`, `moments: ${spec.events.map(e => `the game is ${e}`).join(', ')}`);
      const rest = ci < 0 ? [] : toks.slice(ci + 1);
      if (!isWord(rest[0], 'say', 'show')) ctx.err('when that happens, then what?', `e.g. "When the game is ${ev}, say \\"…\\"."`);
      const str = rest.find(t => t.t === 'str');
      if (!str) ctx.err('say what?', 'put the words in quotes');
      g.says[ev] = str.v;
    },
  };
  reg.verbs.set('when', gameWhen); reg.verbs.set('once', gameWhen); reg.verbs.set('after', gameWhen);

  // when the piece is finished: the game's values come from Let lines (or $variables from a batch sheet)
  reg.finish((ctx) => {
    const g = ctx.doc.game; if (!g) return;
    ctx.line = g.line;
    const spec = GAMES[g.kind];
    for (const [name, v] of Object.entries(spec.values)) {
      const got = ctx.vars.get(name)?.value;
      let val = got?.length ? (got[0].t === 'num' ? got[0].v : String(got[0].v).toLowerCase()) : v.def;
      if (val == null) {
        if (v.need) ctx.err(`${g.kind} needs a ${name}`, `e.g. "Let the ${name} be \\"crane\\"."`);
        continue;
      }
      const ok = v.check(val); if (ok !== true) ctx.err(`the ${name} "${val}" won't do`, ok);
      g.values[name] = val;
    }
    if (!g.keyboard) ctx.warn('the game has no keyboard on the piece, so only a hardware keyboard can play it', 'add ", with the keyboard on the deck" to the Play sentence');
  });
}
