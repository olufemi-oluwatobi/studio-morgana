// Assembles the browser studio page: recorded files + compiler bundle + editor UI → tools/studio/studio.html
// Rebuild: node tools/studio/record.mjs && node tools/studio/bundle.mjs && node tools/studio/page.mjs
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const vfs = fs.readFileSync(path.join(here, 'vfs.json'), 'utf8');
const bundle = fs.readFileSync(path.join(here, 'gt-bundle.js'), 'utf8').replaceAll('</script', '<\\/script');

const html = `<title>Godtongue Studio</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: a workbench. Toolbar on top, the godtongue source on the left, the lit render on the right. */
:root {
  --bg: #f3f1ee; --panel: #ffffff; --ink: #1c1b1a; --muted: #6d6863; --line: #dcd7d1;
  --accent: #a8141d; --ok: #2f7a4a; --warn: #9a6b00; --err: #b3261e; --stage: #0e0f12;
  --display: "Space Grotesk", system-ui, sans-serif; --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #141312; --panel: #1c1b19; --ink: #ece8e3; --muted: #9b958e; --line: #34312d;
  --accent: #e0484f; --ok: #5fbf83; --warn: #e3b341; --err: #ff7b72; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #141312; --panel: #1c1b19; --ink: #ece8e3; --muted: #9b958e; --line: #34312d;
  --accent: #e0484f; --ok: #5fbf83; --warn: #e3b341; --err: #ff7b72; color-scheme: dark }
html, body { height: 100%; }
body { background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, sans-serif; display: flex; flex-direction: column;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 12px; gap: 12px; box-sizing: border-box; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
h1 { font: 700 18px/1 var(--display); margin: 0; letter-spacing: -.01em; }
h1 span { color: var(--accent); }
select, button { font: 500 13px var(--display); border-radius: 6px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); padding: 7px 10px; }
select { min-width: 0; max-width: 100%; }
button { cursor: pointer; }
button.run { background: var(--accent); border-color: var(--accent); color: #fff; padding-inline: 16px; }
button:focus-visible, select:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.status { font: 12px var(--mono); color: var(--muted); margin-left: auto; }
.status.ok { color: var(--ok); } .status.err { color: var(--err); } .status.busy { color: var(--warn); }
main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 12px; }
.pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.pane h2 { margin: 0; padding: 8px 12px; font: 500 11px var(--display); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); border-bottom: 1px solid var(--line); display: flex; gap: 8px; }
.pane h2 .file { text-transform: none; letter-spacing: 0; font-family: var(--mono); margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
textarea { flex: 1; min-height: 0; resize: none; border: 0; padding: 12px; background: transparent; color: var(--ink); font: 13px/1.6 var(--mono); tab-size: 2; white-space: pre; overflow: auto; }
.diag { max-height: 30%; overflow: auto; border-top: 1px solid var(--line); font: 12px/1.5 var(--mono); }
.diag:empty { display: none; }
.diag div { padding: 6px 12px; border-bottom: 1px solid var(--line); }
.diag .error { color: var(--err); } .diag .warning { color: var(--warn); } .diag .hint { color: var(--muted); display: block; }
.preview { background: var(--stage); }
iframe { flex: 1; width: 100%; border: 0; background: var(--stage); }
.empty { color: #9aa0a8; font: 13px var(--mono); padding: 24px; }
@media (max-width: 760px) { main { grid-template-columns: 1fr; grid-template-rows: minmax(260px, 1fr) minmax(420px, 1.4fr); } body { height: auto; min-height: 100%; } }
</style>
<header>
  <h1>Godtongue <span>Studio</span></h1>
  <label for="sample" class="status" style="margin:0">Sample</label>
  <select id="sample"></select>
  <button class="run" id="run" title="Run (Ctrl or Cmd + Enter)">Run</button>
  <button id="reset">Reset sample</button>
  <span class="status" id="status">Loading the compiler…</span>
</header>
<main>
  <section class="pane">
    <h2>Godtongue <span class="file" id="file"></span></h2>
    <textarea id="src" spellcheck="false" aria-label="Godtongue source"></textarea>
    <div class="diag" id="diag" aria-live="polite"></div>
  </section>
  <section class="pane preview">
    <h2>Render <span class="file" id="info"></span></h2>
    <iframe id="out" title="Render"></iframe>
  </section>
</main>
<script>window.__GT_VFS = ${vfs};</script>
<script>${bundle}</script>
<script>
(() => {
  const V = window.__GT_VFS, $ = (id) => document.getElementById(id);
  const sel = $('sample'), src = $('src'), status = $('status'), diag = $('diag'), out = $('out');
  const edits = new Map();
  const abs = (rel) => V.root + '/examples/' + rel;
  const groups = {};
  for (const [g, rel] of V.samples) (groups[g] ||= []).push(rel);
  for (const [g, list] of Object.entries(groups)) {
    const og = document.createElement('optgroup'); og.label = g;
    for (const rel of list) { const o = document.createElement('option'); o.value = rel; o.textContent = rel.replace(/\\.gt$/, ''); og.appendChild(o); }
    sel.appendChild(og);
  }
  const say = (text, kind) => { status.textContent = text; status.className = 'status ' + (kind || ''); };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const show = (rel) => {
    src.value = edits.has(rel) ? edits.get(rel) : GTStudio.read(abs(rel));
    $('file').textContent = 'examples/' + rel;
  };
  let busy = false;
  async function run() {
    if (busy) return; busy = true;
    const rel = sel.value; edits.set(rel, src.value);
    say('Compiling…', 'busy');
    await new Promise((r) => setTimeout(r, 20));
    const r = await GTStudio.run(src.value, abs(rel));
    diag.innerHTML = (r.diagnostics || []).map((d) => '<div class="' + d.level + '">' + (d.line ? 'line ' + d.line + ': ' : '') + esc(d.msg) + (d.hint ? '<span class="hint">' + esc(d.hint) + '</span>' : '') + '</div>').join('')
      + (r.logs || []).map((l) => '<div class="warning">' + esc(l) + '</div>').join('');
    if (r.ok) { out.srcdoc = r.html; say('Compiled in ' + Math.round(r.ms) + ' ms · rendering', 'ok'); $('info').textContent = rel.replace(/\\.gt$/, ''); }
    else say('Not compiled: see the message under the source', 'err');
    busy = false;
  }
  sel.onchange = () => { show(sel.value); run(); };
  $('run').onclick = run;
  $('reset').onclick = () => { edits.delete(sel.value); show(sel.value); run(); };
  src.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
    if (e.key === 'Tab') { e.preventDefault(); const s = src.selectionStart; src.setRangeText('  ', s, src.selectionEnd, 'end'); }
  });
  sel.value = 'goku/goku.gt'; show(sel.value); run();
})();
</script>
`;
fs.writeFileSync(path.join(here, 'studio.html'), html);
console.log('studio.html', (html.length / 1e6).toFixed(1), 'MB');
