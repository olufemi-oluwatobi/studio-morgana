// Shows the generation flow for one brief: what the model sees at each step, what it wrote, and what code made.
//   node scripts/show-flow.mjs --brief "…" --n 2 [--format tiktok] --out dir   writes step 1's prompt (taste.txt)
//   … --replies replies.json                                                  runs the flow with those replies
// replies.json: { "taste": "<sheet>", "spec": [["<option 1's spec sheet>", "<its writer reply>"], …] }. Without "spec" it
// writes step 2's prompts (spec-N.txt); each run also writes the writer's prompt for an option that needs one (write-N.txt). Stamps come from --base's library.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(arg('out', 'flow')), n = Number(arg('n', 2)), prompt = arg('brief');
if (!prompt) { console.error('needs --brief'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const entry = path.join(os.tmpdir(), 'morgana-flow-entry.ts');
fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(here, '..', 'src', 'wizard', 'taste.ts'))};\nexport * from ${JSON.stringify(path.join(here, '..', 'src', 'taste', 'fill.ts'))};\nexport { TASTE } from ${JSON.stringify(path.join(here, '..', 'src', 'taste.gen.ts'))};\nexport { stampsFor } from ${JSON.stringify(path.join(here, '..', 'src', 'library.ts'))};\n`);
const bundle = path.join(os.tmpdir(), 'morgana-flow.mjs');
await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error' });
const F = await import(pathToFileURL(bundle).href + '?' + Date.now());

const brief = { prompt, refs: [], images: [], looksLike: [], assets: [] };
const base = arg('base', 'http://localhost:8787');
const library = await fetch(base + '/api/library').then((r) => r.json()).then((j) => j.stamps).catch(() => []);
const stamps = F.stampsFor(library, [{ name: 'brief', what: prompt }], 12);
const fmt = arg('format');
const pre = F.filterBook(F.TASTE, { format: fmt ? F.TASTE.formats.find((f) => f.id === fmt) : F.detectFormat(prompt, F.TASTE.formats), brief: prompt });
fs.writeFileSync(path.join(out, 'taste.txt'), F.tastePrompt(brief, n, pre.book, { format: fmt ? F.TASTE.formats.find((f) => f.id === fmt) : F.detectFormat(prompt, F.TASTE.formats), notes: pre.notes }));
console.log(`step 1 prompt → ${path.join(out, 'taste.txt')} (${stamps.length} stamps fit the brief: ${stamps.map((s) => s.slug).join(', ')})`);

const repliesFile = arg('replies');
if (!repliesFile) process.exit(0);
const replies = JSON.parse(fs.readFileSync(repliesFile, 'utf8'));
const asked = [];
const models = (queue) => ({ names: { reader: 'stand-in', writer: 'stand-in' }, read: async (a) => { asked.push(a.prompt); return queue.shift() ?? '{}'; }, write: async (a) => { asked.push(a.prompt); return queue.shift() ?? '{}'; } });
const chose = await F.chooseFromBook(models([replies.taste]), brief, n, { format: fmt });
for (let i = 0; i < n; i++) fs.writeFileSync(path.join(out, `spec-${i + 1}.txt`), F.specPrompt(brief, chose.picks[i], F.chosenOf(F.TASTE, chose.picks[i], chose.format), stamps, { i, n }));
if (!replies.spec) { console.log(`picks: ${chose.picks.map((p) => `${p.template} · ${p.palette} · ${p.type} · ${p.spacing}`).join(' | ')}; step 2 prompts → spec-N.txt`); process.exit(0); }
const result = { brief: prompt, format: chose.format, taste: chose.trace, picks: chose.picks, options: [] };
for (let i = 0; i < n; i++) {
  const made = await F.makeFromBook(models([].concat(replies.spec[i] ?? [])), { brief, pick: chose.picks[i], format: chose.format, i, n, files: {}, rounds: 1, stamps });
  const w = made.trace.find((t) => t.step === 'write' && t.sees);
  if (w) fs.writeFileSync(path.join(out, `write-${i + 1}.txt`), w.sees);
  fs.writeFileSync(path.join(out, `option-${i + 1}.gt`), made.source);
  result.options.push({ pick: chose.picks[i], ok: made.ok, wrote: made.wrote, spec: made.spec, trace: made.trace, source: made.source });
  console.log(`option ${i + 1}: ${made.ok ? 'compiles' : 'does not compile'}; ${made.trace.map((t) => `${t.step} (${t.by}): ${t.note}`).join(' | ')}`);
}
fs.writeFileSync(path.join(out, 'flow.json'), JSON.stringify(result, null, 1));
console.log('→ ' + path.join(out, 'flow.json'));
