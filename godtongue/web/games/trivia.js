// Trivia, played on a godtongue skin. Loaded by the `game` engine after web/engine.js, which draws and lights the skin.
// Reads window.GAME (doc.game with rects in grid px). One question at a time on the board, four answers under it, one clock.
// Server mode ("Let the questions be kept by the server."): window.GAME_API holds the questions and scores each answer:
//   POST start   → { questions: [{ q, options }], moves: [{ n, pick, right }], ms, closed }
//   POST guess   { n, pick } → { right, status }          status: playing | won | lost | timeout
//   POST timeout → { status }
// Talks to the page around it with postMessage, like wordle: ready, started, guessed, won, lost, said, control.
(() => {
  const G = window.GAME, V = G.values;
  const root = document.getElementById('game');
  const post = (type, data = {}) => { try { parent.postMessage({ source: 'gt-game', game: G.kind, id: G.id, type, ...data }, '*'); } catch { } };

  // ---------- looks → CSS ----------
  const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const rgb = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => rgb(hex(h).map(v => k > 0 ? v + (255 - v) * k : v * (1 + k)));
  const DEF = {
    question: { ink: '#ffffff', font: 'Jost' },
    answer: { face: '#ffffff', ink: '#050515', font: 'Jost', corners: 14, relief: 'raised' },
    'answer.chosen': { face: '#d0bcff' }, 'answer.correct': { face: '#14a86a', ink: '#ffffff' }, 'answer.wrong': { face: '#e5484d', ink: '#ffffff' },
    readout: { ink: '#ffffff', font: 'Jost' }, 'readout.urgent': { ink: '#ff3b30' },
  };
  const lookOf = (part, state) => ({ ...DEF[part], ...(G.looks[part] || {}), ...(state ? { ...DEF[`${part}.${state}`], ...(G.looks[`${part}.${state}`] || {}) } : {}) });
  const css = (L) => {
    const glow = L.glow ? `0 0 3px ${L.ink}, 0 0 14px ${L.ink}aa` : 'none';
    const font = `color:${L.ink};font-family:"${L.font}",system-ui,sans-serif;text-shadow:${glow};${L.size ? `font-size:${L.size}px;` : ''}`;
    if (!L.face) return font;
    const f = L.face, ol = L.outline ? `border:${L.outlineWidth ?? 4}px solid ${L.outline};` : 'border:0;';
    const bg = L.relief === 'flat' || L.outline ? f : `linear-gradient(180deg, ${shade(f, .08)} 0%, ${f} 55%, ${shade(f, -.1)} 100%)`;
    const hard = L.outline || shade(f, -.4);
    const relief = L.relief === 'raised' ? `0 5px 0 ${hard}` : L.relief === 'sunk' ? 'inset 0 3px 7px rgba(0,0,0,.45)' : 'none';
    return `background:${bg};${ol}box-sizing:border-box;${font}border-radius:${L.corners ?? 12}px;box-shadow:${relief};`;
  };
  let sheet = `.question{${css(lookOf('question'))}}\n.answer{${css(lookOf('answer'))}}\n.readout{${css(lookOf('readout'))}}\n.readout.urgent{${css(lookOf('readout', 'urgent'))}}\n`;
  for (const st of ['chosen', 'correct', 'wrong']) sheet += `.answer.${st}{${css(lookOf('answer', st))}}\n`;
  sheet += `.tq{display:flex;flex-direction:column;justify-content:center;gap:.5em;text-align:center;line-height:1.2;font-weight:700;padding:0 4%;box-sizing:border-box}
.tq small{font-size:.42em;letter-spacing:.2em;opacity:.75;font-weight:700}
.tans{display:flex;flex-direction:column;justify-content:space-evenly;box-sizing:border-box}
.answer{width:100%;font-weight:700;font-size:inherit;line-height:1.15;cursor:pointer;padding:0 5%;text-align:center;transition:transform .06s,background .2s}
.answer:active{transform:translateY(3px)}
.answer[disabled]{cursor:default}
.tfill{position:absolute;left:0;bottom:0;height:6px;background:currentColor;opacity:.6;transition:width .25s linear}
.answer.pulse{animation:pulse .45s}
@keyframes pulse{30%{transform:scale(1.04)}}`;
  const style = document.createElement('style'); style.textContent = sheet; document.head.appendChild(style);

  // ---------- layout: the question in the top of the board, the answers under it ----------
  const place = (el, [x, y, w, h]) => Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  const B = G.rects.board, pad = Math.min(B[2], B[3]) * .05;
  const qBox = [B[0] + pad, B[1] + pad, B[2] - 2 * pad, (B[3] - 2 * pad) * .36];
  const aBox = [B[0] + pad, qBox[1] + qBox[3] + pad * .5, B[2] - 2 * pad, (B[3] - 2 * pad) * .64 - pad * .5];
  const qEl = document.createElement('div'); qEl.className = 'question tq'; place(qEl, qBox); root.appendChild(qEl);
  const qSize = Math.min(qBox[2] / 14, qBox[3] / 4.2);
  qEl.style.fontSize = qSize + 'px';
  const aWrap = document.createElement('div'); aWrap.className = 'tans'; place(aWrap, aBox); root.appendChild(aWrap);
  const aH = aBox[3] / 4.6;
  aWrap.style.fontSize = Math.min(aH * .36, aBox[2] / 18) + 'px';
  const btns = [0, 1, 2, 3].map((i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'answer'; b.style.height = aH + 'px';
    b.addEventListener('click', () => pick(i)); aWrap.appendChild(b); return b;
  });
  const msg = document.createElement('div'); msg.className = 'msg';
  root.appendChild(msg);
  Object.assign(msg.style, { left: aBox[0] + 'px', top: aBox[1] + aBox[3] - qSize * 1.6 + 'px', bottom: 'auto', width: aBox[2] + 'px', maxWidth: 'none', margin: 0, boxSizing: 'border-box', fontSize: Math.max(18, qSize * .5) + 'px' });
  const sum = document.createElement('div'); sum.className = 'question tq'; sum.hidden = true; place(sum, [aBox[0], aBox[1], aBox[2], aBox[3] * .6]); sum.style.background = 'none'; sum.style.boxShadow = 'none'; sum.style.fontSize = qSize * 1.1 + 'px'; sum.style.letterSpacing = '.12em'; root.appendChild(sum);

  const outs = {};
  for (const [name, R] of Object.entries(G.rects.shows || {})) {
    const o = document.createElement('div'); o.className = 'readout'; place(o, R);
    if (!lookOf('readout').size) o.style.fontSize = Math.round(R[3] * .62) + 'px';
    Object.assign(o.style, { display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' });
    root.appendChild(o); outs[name] = o;
  }
  const put = (name, v, cls) => { const o = outs[name]; if (!o) return; o.textContent = v; o.className = 'readout' + (cls ? ' ' + cls : ''); };
  const say = (text, ms = 0) => { msg.textContent = text; msg.classList.add('on'); clearTimeout(say.t); if (ms) say.t = setTimeout(() => msg.classList.remove('on'), ms); };

  // ---------- the questions ----------
  // local: the right answer is written first; shuffle the options the same way every time for this piece
  const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const shuffle = (arr, rnd) => { const a = arr.map((x, i) => [x, i]); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const API = V.server ? window.GAME_API : null;
  const call = async (path, body) => {
    const r = await fetch(`${API}/${path}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'the game could not reach the server'), j); return j;
  };
  let Q = [], rights = [];
  if (!API) {
    const rnd = seeded([...String(G.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1);
    for (const x of V.questions || []) { const s = shuffle(x.options, rnd); Q.push({ q: x.q, options: s.map(([o]) => o) }); rights.push(s.findIndex(([, i]) => i === 0)); }
  }
  const store = `gt-${G.kind}:${G.id}:${API ? 'server' : (V.questions || []).length}`;
  let moves = [], over = null, busy = false, power = true, ms = 0, ticking = false, lastTick = 0, closed = false, started = false;
  try { const s = JSON.parse(localStorage.getItem(store) || 'null'); if (!API && Array.isArray(s?.moves)) moves = s.moves; if (s?.ms) ms = s.ms; } catch { }
  const correct = () => moves.filter(m => m.pick === m.right).length;

  // ---------- stats and the clock ----------
  const statsKey = `gt-${G.kind}-stats:${V.series || G.id}`;
  let stats = { played: 0, wins: 0, streak: 0, best: null, done: [] };
  try { stats = { ...stats, ...JSON.parse(localStorage.getItem(statsKey) || '{}') }; } catch { }
  const clock = (t) => { const s = Math.max(0, Math.ceil(t / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const showStats = () => {
    put('score', `${correct()}/${Q.length || '–'}`); put('progress', `${Math.min(moves.length + (over ? 0 : 1), Q.length)}/${Q.length || '–'}`);
    put('best', stats.best ? `${stats.best.correct}/${Q.length}` : '–'); put('streak', String(stats.streak)); put('played', String(stats.played)); put('wins', String(stats.wins));
  };
  const showTime = () => { if (V.time) { const left = V.time * 1000 - ms; put('timer', clock(left), left <= 10000 && !over ? 'urgent' : ''); } else put('timer', clock(ms)); };
  const save = () => { try { localStorage.setItem(store, JSON.stringify({ moves, ms: Math.round(ms) })); } catch { } };
  const tick = () => {
    if (!ticking) return;
    const now = performance.now(); ms += now - lastTick; lastTick = now;
    if (V.time && ms >= V.time * 1000) { ms = V.time * 1000; ticking = false; showTime(); save(); return timeUp(); }
    showTime(); setTimeout(tick, 250);
  };
  const startClock = () => { if (ticking || over) return; ticking = true; lastTick = performance.now(); tick(); };
  const stopClock = () => { if (ticking) { ms += performance.now() - lastTick; ticking = false; } save(); };
  const record = (won) => {
    if (stats.done.includes(store)) return;
    stats.done = [...stats.done.slice(-199), store]; stats.played++;
    if (won) { stats.wins++; stats.streak++; const b = stats.best, c = correct(); if (!b || c > b.correct || (c === b.correct && ms < b.ms)) stats.best = { correct: c, ms }; }
    else stats.streak = 0;
    try { localStorage.setItem(statsKey, JSON.stringify(stats)); } catch { }
  };

  // ---------- one question on the board ----------
  const show = (n) => {
    const x = Q[n]; if (!x) return;
    qEl.innerHTML = `<small>QUESTION ${n + 1} OF ${Q.length}</small><span></span>`;
    qEl.lastChild.textContent = x.q;
    btns.forEach((b, i) => { b.hidden = i >= x.options.length; b.textContent = x.options[i] || ''; b.className = 'answer'; b.disabled = false; });
    showStats();
  };
  const reveal = (n, pickI, rightI) => btns.forEach((b, i) => { b.disabled = true; b.className = 'answer' + (i === rightI ? ' correct' : i === pickI ? ' wrong' : ''); });
  const grid = () => moves.map(m => (m.pick === m.right ? '🟩' : '🟥')).join('');
  const finish = (status, quiet) => {
    over = status === 'won' ? 'won' : 'lost'; stopClock(); record(over === 'won'); showStats(); showTime();
    const c = correct(), ev = status === 'timeout' && G.says.timeout ? 'timeout' : over;
    btns.forEach(b => { b.disabled = true; });
    qEl.innerHTML = `<small>${status === 'closed' ? 'THIS CONTEST HAS CLOSED' : status === 'timeout' ? 'TIME' : 'DONE'}</small><span></span>`;
    qEl.lastChild.textContent = `${c} of ${Q.length} right`;
    btns.forEach(b => { b.hidden = true; });
    sum.hidden = false; sum.textContent = grid();
    if (G.says[ev]) say(G.says[ev]);
    if (!quiet) {
      post(over, { tries: c, of: Q.length, correct: c, grid: grid(), ms: Math.round(ms), ...(status === 'timeout' ? { reason: 'timeout' } : {}) });
      if (G.says[ev]) post('said', { event: ev, text: G.says[ev] });
    }
  };
  function timeUp() { if (!over) { busy = false; if (API) call('timeout').catch(() => { }); finish('timeout'); } }

  function pick(i) {
    if (over || busy || !power) return;
    const n = moves.length; if (n >= Q.length) return;
    startClock(); busy = true;
    btns[i].className = 'answer chosen pulse';
    const scored = API ? call('guess', { n, pick: i })
      : Promise.resolve({ right: rights[n], status: n + 1 >= Q.length ? ((correct() + (i === rights[n] ? 1 : 0)) > 0 ? 'won' : 'lost') : 'playing' });
    scored.then((j) => {
      if (j.status === 'timeout') { busy = false; return finish('timeout'); }
      moves.push({ n, pick: i, right: j.right }); save();
      reveal(n, i, j.right);
      post('guessed', { row: n + 1, of: Q.length, result: i === j.right ? 'correct' : 'wrong' });
      showStats();
      setTimeout(() => {
        busy = false;
        if (over) return;
        if (j.status === 'won' || j.status === 'lost') finish(j.status); else show(moves.length);
      }, 900);
    }).catch((e) => {
      busy = false; btns[i].className = 'answer';
      if (e.code === 'closed') { closed = true; return finish('closed', true); }
      say(e.message || 'Try again', 1800);
    });
  }
  addEventListener('keydown', (e) => { const k = '1234abcd'.indexOf(e.key.toLowerCase()); if (k >= 0 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); pick(k % 4); } });

  // ---------- the panel's own controls: light and power ----------
  let light = [-.3, -.2], dialMark = null, led = null;
  const setLight = (xy) => { light = xy; window.__gt?.setTilt(xy[0], xy[1]); if (dialMark) dialMark.style.transform = `rotate(${Math.atan2(xy[1], xy[0]) * 180 / Math.PI + 90}deg)`; post('control', { control: 'light', value: xy }); };
  const setPower = (on) => { power = on; root.classList.toggle('off', !on); if (!on) stopClock(); else if (started && !over) startClock(); if (led) led.classList.toggle('on', on); post('control', { control: 'power', value: on }); };
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
  addEventListener('message', (e) => {
    const m = e.data; if (!m || m.source === 'gt-game') return;
    if (m.type === 'set' && Array.isArray(m.light)) setLight(m.light);
    if (m.type === 'set' && typeof m.power === 'boolean') setPower(m.power);
    if (m.type === 'reset') { try { localStorage.removeItem(store); } catch { } location.reload(); }
  });

  // ---------- start ----------
  const begin = (status) => {
    started = true; showTime();
    if (closed) return finish('closed', true);
    if (status === 'won' || status === 'lost' || status === 'timeout') return finish(status, true);
    if (!API && moves.length >= Q.length && Q.length) return finish(correct() > 0 ? 'won' : 'lost', true);
    if (!Q.length) { qEl.textContent = 'No questions yet'; btns.forEach(b => { b.hidden = true; }); return; }
    show(moves.length);
    if (moves.length) startClock();
    post('started');
    if (G.says.started) say(G.says.started, 2600);
  };
  addEventListener('pagehide', stopClock); document.addEventListener('visibilitychange', () => { if (document.hidden) stopClock(); });
  const ready = () => { if (window.__gt) { if (G.rects.light) setLight(light); post('ready', { rows: Q.length, played: moves.length, over }); } else setTimeout(ready, 60); };
  ready();
  if (API) {
    busy = true; qEl.textContent = '…';
    call('start').then((j) => {
      busy = false; closed = !!j.closed;
      Q = j.questions || []; moves = (j.moves || []).map(m => ({ n: m.n, pick: m.pick, right: m.right }));
      if (typeof j.ms === 'number') ms = Math.max(ms, j.ms);
      begin(j.status);
    }).catch((e) => { busy = false; say(e.message || 'The game could not start', 4000); });
  } else begin();
})();
