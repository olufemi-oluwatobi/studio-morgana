// One build = compile + engine. Shared by the CLI, batch and the studio.
import fs from 'node:fs';
import path from 'node:path';
import { compile, loadEngines } from '../index.js';

let ENGINES = null;
export async function engines() { return (ENGINES ||= await loadEngines()); }

export async function buildSource(source, { engine = 'web', outDir, baseDir = '.', assetDirs = [], vars = {}, file = null, log = () => { } } = {}) {
  const t0 = Date.now();
  const r = compile(source, { baseDir, assetDirs, vars, file });
  const result = { ok: r.ok, diagnostics: r.diagnostics, doc: r.doc, engine, outDir, ms: { compile: Date.now() - t0 } };
  if (!r.ok) return result;
  const E = (await engines())[engine];
  if (!E) { result.ok = false; result.diagnostics.push({ level: 'error', line: 0, msg: `no engine called "${engine}"`, hint: `engines: ${Object.keys(await engines()).join(', ')}` }); return result; }
  if ((r.doc.kind === 'room') !== (engine === 'room')) { result.ok = false; result.diagnostics.push({ level: 'error', line: 0, msg: r.doc.kind === 'room' ? 'this is a room: build it with --engine room' : 'the room engine builds rooms; this file is a card' }); return result; }
  const sup = E.supports(r.doc);
  if (sup !== true) { result.ok = false; result.diagnostics.push({ level: 'error', line: 0, msg: `${engine}: ${sup}` }); return result; }
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'card.gtdoc.json'), JSON.stringify(r.doc, (k, v) => k === 'svg' && typeof v === 'string' && v.length > 400 ? `${v.slice(0, 400)}… (${v.length} chars)` : v, 1));
  const t1 = Date.now();
  try { result.output = await E.build(r.doc, { outDir, log }); }
  catch (e) { result.ok = false; result.diagnostics.push({ level: 'error', line: 0, msg: `${engine} failed`, hint: e.message }); }
  result.ms.build = Date.now() - t1;
  return result;
}

// CSV → rows (header row names the $variables). Quotes and commas inside quotes are handled.
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()));
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim().replace(/^\$/, '').toLowerCase(), (r[i] ?? '').trim()])));
}
