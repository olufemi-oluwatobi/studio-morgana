// Wordle, played on a godtongue skin. Loaded by the `game` engine after web/engine.js, which draws and lights the skin.
// Reads window.GAME (doc.game with rects in grid px) and window.WORDS (one 5-letter word a line).
// Everything here is placed in grid px inside #game, which is scaled with the canvas, so it sits on the drawn things.
// Talks to the page around it (an iframe's parent) with postMessage: { source: 'gt-game', type, ... }.
(() => {
  const G = window.GAME, V = G.values, ROWS = V.tries, N = 5;
  const WORDS = new Set(window.WORDS.split('\n'));
  const root = document.getElementById('game');
  const post = (type, data = {}) => { try { parent.postMessage({ source: 'gt-game', game: G.kind, id: G.id, type, ...data }, '*'); } catch { } };

  // ---------- looks → CSS ----------
  const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const rgb = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => rgb(hex(h).map(v => k > 0 ? v + (255 - v) * k : v * (1 + k)));
  const lum = (h) => { const [r, g, b] = hex(h).map(v => v / 255); return .2126 * r + .7152 * g + .0722 * b; };
  const DEF = {
    tile: { face: '#1b1a17', ink: '#f3ead6', font: 'Jost', corners: 6, relief: 'sunk', glow: false },
    'tile.typed': {}, 'tile.empty': {},
    'tile.correct': { face: '#2f8f6b', ink: '#ffffff' }, 'tile.present': { face: '#d9a441', ink: '#1b1a17' }, 'tile.absent': { face: '#4a4640', ink: '#d8d2c6' },
    key: { face: '#e9e2d0', ink: '#2b2118', font: 'Jost', corners: 8, relief: 'raised' },
    readout: { ink: '#ffffff', font: 'Jost' }, 'readout.urgent': { ink: '#ff3b30' },
    'key.correct': { face: '#2f8f6b', ink: '#ffffff' }, 'key.present': { face: '#d9a441', ink: '#1b1a17' }, 'key.absent': { face: '#5a554d', ink: '#cfc8ba' },
  };
  const lookOf = (part, state) => ({ ...DEF[part], ...(G.looks[part] || {}), ...(state ? { ...DEF[`${part}.${state}`], ...(G.looks[`${part}.${state}`] || {}) } : {}) });
  const css = (L) => {
    const glow = L.glow ? `0 0 3px ${L.ink}, 0 0 14px ${L.ink}aa, 0 0 28px ${L.ink}55` : 'none';
    const font = `color:${L.ink};font-family:"${L.font}",system-ui,sans-serif;text-shadow:${glow};${L.size ? `font-size:${L.size}px;` : ''}`;
    if (!L.face) return font;                                     // a readout: letters only
    const f = L.face, lo = L.faceLo, ol = L.outline ? `border:${L.outlineWidth ?? 4}px solid ${L.outline};` : 'border:0;';
    const bg = (L.relief === 'flat' || L.outline) && !L.metal ? f : L.metal || lo ? `linear-gradient(160deg, ${shade(f, .25)} 0%, ${f} 35%, ${lo || shade(f, -.35)} 100%)` : `linear-gradient(180deg, ${shade(f, .08)} 0%, ${f} 55%, ${shade(f, -.12)} 100%)`;
    const hard = L.outline || shade(f, -.45);
    const relief = L.relief === 'raised' ? (L.outline ? `0 5px 0 ${hard}` : `0 4px 0 ${hard}, 0 6px 10px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,${lum(f) > .5 ? .7 : .25})`)
      : L.relief === 'sunk' ? `inset 0 3px 7px rgba(0,0,0,.55), inset 0 -1px 0 rgba(255,255,255,.08), 0 1px 0 rgba(255,255,255,.12)` : 'none';
    return `background:${bg};${ol}box-sizing:border-box;${font}border-radius:${L.corners}px;box-shadow:${relief};`;
  };
  let sheet = '';
  for (const part of ['tile', 'key', 'readout']) {
    sheet += `.${part}{${css(lookOf(part))}}\n`;
    for (const st of ['empty', 'typed', 'correct', 'present', 'absent', 'urgent']) if (DEF[`${part}.${st}`]) sheet += `.${part}.${st}{${css(lookOf(part, st))}}\n`;
  }
  const style = document.createElement('style'); style.textContent = sheet; document.head.appendChild(style);

  // ---------- layout: the board in its rect, the keyboard in its rect ----------
  const place = (el, [x, y, w, h]) => Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  const B = G.rects.board, pad = Math.min(B[2], B[3]) * .045;
  const gap = Math.min((B[2] - 2 * pad) / (N * 9), (B[3] - 2 * pad) / (ROWS * 9));
  const cell = Math.min((B[2] - 2 * pad - gap * (N - 1)) / N, (B[3] - 2 * pad - gap * (ROWS - 1) - gap * 2) / ROWS);
  const board = document.createElement('div'); board.className = 'board'; place(board, B); root.appendChild(board);
  const grid = document.createElement('div'); grid.className = 'grid';
  Object.assign(grid.style, { gridTemplateColumns: `repeat(${N}, ${cell}px)`, gridAutoRows: cell + 'px', gap: gap + 'px', fontSize: cell * .55 + 'px' });
  board.appendChild(grid);
  const msg = document.createElement('div'); msg.className = 'msg'; msg.style.fontSize = Math.max(18, cell * .3) + 'px'; board.appendChild(msg);
  const tiles = [];
  for (let r = 0; r < ROWS; r++) { const row = []; for (let c = 0; c < N; c++) { const t = document.createElement('div'); t.className = 'tile empty'; t.style.setProperty('--d', `${c * 220}ms`); grid.appendChild(t); row.push(t); } tiles.push(row); }

  const keys = {};
  if (G.rects.keyboard) {
    const K = G.rects.keyboard, kb = document.createElement('div'); kb.className = 'keyboard'; place(kb, K); root.appendChild(kb);
    const rows = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'], kg = K[2] * .012, kh = (K[3] - kg * 4) / 3, kw = (K[2] - kg * 11) / 10;
    Object.assign(kb.style, { padding: kg + 'px', gap: kg + 'px', fontSize: Math.min(kh, kw) * .42 + 'px' });
    for (const r of rows) {
      const row = document.createElement('div'); row.className = 'krow'; row.style.gap = kg + 'px'; row.style.height = kh + 'px';
      for (const ch of r) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'key';
        const name = ch === '+' ? 'enter' : ch === '-' ? 'back' : ch;
        b.textContent = ch === '+' ? 'ENTER' : ch === '-' ? '⌫' : ch.toUpperCase();
        b.setAttribute('aria-label', name === 'back' ? 'delete' : name);
        b.style.width = (ch === '+' || ch === '-' ? kw * 1.5 + kg / 2 : kw) + 'px';
        if (ch === '+' || ch === '-') b.style.fontSize = '.62em';
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); press(name); });
        row.appendChild(b); keys[name] = b;
      }
      kb.appendChild(row);
    }
  }

  // readouts: words the game keeps up to date, each on the drawn thing the skin put it on
  const outs = {};
  for (const [name, R] of Object.entries(G.rects.shows || {})) {
    const o = document.createElement('div'); o.className = 'readout'; o.dataset.readout = name; place(o, R);
    if (!lookOf('readout').size) o.style.fontSize = Math.round(R[3] * .62) + 'px';
    root.appendChild(o); outs[name] = o;
  }
  const put = (name, v, cls) => { const o = outs[name]; if (!o) return; o.textContent = v; o.className = 'readout' + (cls ? ' ' + cls : ''); };

  // ---------- the game ----------
  const store = `gt-${G.kind}:${G.id}:${V.word.length}${[...V.word].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 99991, 7)}`;
  let guesses = [], cur = '', over = null, busy = false, power = true, ms = 0, ticking = false, lastTick = 0;
  try { const s = JSON.parse(localStorage.getItem(store) || 'null'); if (s?.guesses) guesses = s.guesses.filter(g => g.length === N).slice(0, ROWS); if (s?.ms) ms = s.ms; } catch { }

  // the series' stats: played, wins, streak, best (fewest tries, then fastest)
  const statsKey = `gt-${G.kind}-stats:${V.series || G.id}`;
  let stats = { played: 0, wins: 0, streak: 0, best: null, done: [] };
  try { stats = { ...stats, ...JSON.parse(localStorage.getItem(statsKey) || '{}') }; } catch { }
  const clock = (t) => { const s = Math.max(0, Math.ceil(t / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const showStats = () => {
    put('best', stats.best ? `${stats.best.tries}/${ROWS}` : '–');
    put('streak', String(stats.streak)); put('played', String(stats.played)); put('wins', String(stats.wins));
    put('tries', String(ROWS - guesses.length));
  };
  const showTime = () => {
    if (V.time) { const left = V.time * 1000 - ms; put('timer', clock(left), left <= 10000 && !over ? 'urgent' : ''); }
    else put('timer', clock(ms));
  };
  const record = (won) => {
    if (stats.done.includes(store)) return;
    stats.done = [...stats.done.slice(-199), store]; stats.played++;
    if (won) {
      stats.wins++; stats.streak++;
      const b = stats.best; if (!b || guesses.length < b.tries || (guesses.length === b.tries && ms < b.ms)) stats.best = { tries: guesses.length, ms };
    } else stats.streak = 0;
    try { localStorage.setItem(statsKey, JSON.stringify(stats)); } catch { }
  };
  const tick = () => {
    if (!ticking) return;
    const now = performance.now(); ms += now - lastTick; lastTick = now;
    if (V.time && ms >= V.time * 1000) { ms = V.time * 1000; ticking = false; showTime(); save(); return timeUp(); }
    showTime(); setTimeout(tick, 250);
  };
  const startClock = () => { if (ticking || over || (!V.time && !V.countUp)) return; ticking = true; lastTick = performance.now(); tick(); };
  const stopClock = () => { if (ticking) { ms += performance.now() - lastTick; ticking = false; } save(); };

  // scoring: greens first, then yellows only as many times as the letter is left in the word
  const score = (guess, word) => {
    const out = Array(N).fill('absent'), left = {};
    for (let i = 0; i < N; i++) guess[i] === word[i] ? (out[i] = 'correct') : (left[word[i]] = (left[word[i]] || 0) + 1);
    for (let i = 0; i < N; i++) if (out[i] !== 'correct' && left[guess[i]]) { out[i] = 'present'; left[guess[i]]--; }
    return out;
  };
  const RANK = { absent: 1, present: 2, correct: 3 };
  const paintKeys = () => {
    const best = {};
    for (const g of guesses) score(g, V.word).forEach((s, i) => { if (!best[g[i]] || RANK[s] > RANK[best[g[i]]]) best[g[i]] = s; });
    for (const [k, b] of Object.entries(keys)) b.className = 'key' + (best[k] ? ' ' + best[k] : '');
  };
  const say = (text, ms = 0) => { msg.textContent = text; msg.classList.add('on'); clearTimeout(say.t); if (ms) say.t = setTimeout(() => msg.classList.remove('on'), ms); };
  const save = () => { try { localStorage.setItem(store, JSON.stringify({ guesses, ms: Math.round(ms) })); } catch { } };
  const share = () => guesses.map(g => score(g, V.word).map(s => ({ correct: '🟩', present: '🟨', absent: '⬛' })[s]).join('')).join('\n');
  const finish = (won, quiet, why) => {
    over = won ? 'won' : 'lost'; stopClock(); record(won); showStats(); showTime();
    const ev = why === 'timeout' && G.says.timeout ? 'timeout' : over;
    const text = G.says[ev] || (won ? ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'][Math.min(guesses.length - 1, 5)] : why === 'timeout' ? `Time! It was ${V.word.toUpperCase()}` : V.word.toUpperCase());
    say(text);
    if (!quiet) {
      post(over, { tries: guesses.length, of: ROWS, grid: share(), ms: Math.round(ms), ...(why ? { reason: why } : {}) });
      if (G.says[ev]) post('said', { event: ev, text: G.says[ev] });
    }
  };
  function timeUp() { if (!over) { busy = false; finish(false, false, 'timeout'); } }
  const showRow = (r, word, animate) => {
    const res = score(word, V.word);
    tiles[r].forEach((t, i) => {
      t.textContent = word[i].toUpperCase();
      if (animate) { t.classList.add('flip'); setTimeout(() => { t.className = 'tile ' + res[i] + ' flip'; }, i * 220 + 250); }
      else t.className = 'tile ' + res[i];
    });
  };
  const drawCur = () => { const r = guesses.length; if (r >= ROWS) return; tiles[r].forEach((t, i) => { t.textContent = (cur[i] || '').toUpperCase(); t.className = 'tile ' + (cur[i] ? 'typed' : 'empty'); }); };
  const shake = () => { const r = tiles[guesses.length]; r.forEach(t => { t.classList.remove('shake'); void t.offsetWidth; t.classList.add('shake'); }); };

  function press(k) {
    if (over || busy || !power) return;
    startClock();
    if (k === 'back') { cur = cur.slice(0, -1); return drawCur(); }
    if (k === 'enter') {
      if (cur.length < N) { shake(); return say('Not enough letters', 1200); }
      if (!WORDS.has(cur) && cur !== V.word) { shake(); return say('Not in word list', 1200); }
      const r = guesses.length, word = cur; guesses.push(word); cur = ''; save(); busy = true;
      showRow(r, word, true);
      post('guessed', { row: r + 1, of: ROWS, result: score(word, V.word) });
      setTimeout(() => {
        busy = false; paintKeys(); showStats();
        if (over) return;
        if (word === V.word) finish(true); else if (guesses.length >= ROWS) finish(false);
      }, N * 220 + 520);
      return;
    }
    if (/^[a-z]$/.test(k) && cur.length < N) { cur += k; drawCur(); const t = tiles[guesses.length][cur.length - 1]; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
  }
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key === 'Enter' ? 'enter' : e.key === 'Backspace' ? 'back' : e.key.toLowerCase();
    if (k === 'enter' || k === 'back' || /^[a-z]$/.test(k)) { e.preventDefault(); press(k); }
  });

  // ---------- the panel's own controls: light and power ----------
  let light = [-.3, -.2];
  const setLight = (xy) => { light = xy; window.__gt?.setTilt(xy[0], xy[1]); if (dialMark) dialMark.style.transform = `rotate(${Math.atan2(xy[1], xy[0]) * 180 / Math.PI + 90}deg)`; post('control', { control: 'light', value: xy }); };
  const setPower = (on) => { power = on; root.classList.toggle('off', !on); if (!on) stopClock(); else if (guesses.length || cur) startClock(); if (led) led.classList.toggle('on', on); post('control', { control: 'power', value: on }); };
  let dialMark = null, led = null;
  if (G.rects.light) {
    const d = document.createElement('button'); d.type = 'button'; d.className = 'control dial'; d.setAttribute('aria-label', 'light'); place(d, G.rects.light);
    dialMark = document.createElement('i'); d.appendChild(dialMark); root.appendChild(d);
    const at = (e) => { const r = d.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2), m = Math.hypot(x, y) || 1; setLight([x / m * .6, y / m * .45]); };
    d.addEventListener('pointerdown', (e) => { d.setPointerCapture(e.pointerId); at(e); });
    d.addEventListener('pointermove', (e) => { if (e.buttons) at(e); });
  }
  if (G.rects.power) {
    const s = document.createElement('button'); s.type = 'button'; s.className = 'control switch'; s.setAttribute('aria-label', 'power'); place(s, G.rects.power);
    led = document.createElement('i'); led.className = 'on'; s.appendChild(led); root.appendChild(s);
    s.addEventListener('click', () => setPower(!power));
  }

  // ---------- the page around it ----------
  addEventListener('message', (e) => {
    const m = e.data; if (!m || m.source === 'gt-game') return;
    if (m.type === 'set' && Array.isArray(m.light)) setLight(m.light);
    if (m.type === 'set' && typeof m.power === 'boolean') setPower(m.power);
    if (m.type === 'reset') { try { localStorage.removeItem(store); } catch { } location.reload(); }
  });

  // ---------- start ----------
  guesses.forEach((g, r) => showRow(r, g, false)); paintKeys(); drawCur(); showStats(); showTime();
  addEventListener('pagehide', stopClock); document.addEventListener('visibilitychange', () => { if (document.hidden) stopClock(); });
  if (guesses.includes(V.word)) finish(true, true); else if (guesses.length >= ROWS) finish(false, true);
  const ready = () => { if (window.__gt) { if (G.rects.light) setLight(light); post('ready', { rows: ROWS, letters: N, played: guesses.length, over }); } else setTimeout(ready, 60); };
  ready();
  if (!over) post('started');
  if (!over && G.says.started) say(G.says.started, 2600);
})();
