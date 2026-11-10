#!/usr/bin/env node
// gt: the godtongue command line.
//   gt build card.gt [--engine svg-preview|fancard-py] [--out out/]
//   gt batch template.gt sheet.csv [--engine …] [--out out/]     one card per row; columns become $variables
//   gt check card.gt                                             compile only, print problems
//   gt engines | gt reference
import fs from 'node:fs';
import path from 'node:path';
import { buildSource, engines, parseCSV } from '../core/build.js';
import { compile, createRegistry } from '../index.js';

const [cmd, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest.splice(i, 2)[1] : d; };
const engine = opt('engine', 'svg-preview'), outRoot = opt('out', 'out');
const say = (d) => console.log(`${d.level === 'error' ? '✗' : '!'} line ${d.line}${d.via ? ` (in ${d.via})` : ''}: ${d.msg}${d.hint ? `\n    ${d.hint}` : ''}`);

async function one(file, vars = {}, label = null) {
  const src = fs.readFileSync(file, 'utf8'), name = label || path.basename(file, '.gt');
  const r = await buildSource(src, { engine, outDir: path.resolve(outRoot, name), baseDir: path.dirname(path.resolve(file)), vars, file, log: (l) => process.env.GT_VERBOSE && console.log('  ' + l) });
  r.diagnostics.forEach(say);
  if (r.ok) console.log(`✓ ${name} · ${engine} · ${r.ms.compile + (r.ms.build || 0)} ms → ${path.join(r.outDir, r.output.entry)}`);
  return r.ok;
}

if (cmd === 'build') { process.exit((await one(rest[0])) ? 0 : 1); }
else if (cmd === 'batch') {
  const [tpl, sheet] = rest; const rows = parseCSV(fs.readFileSync(sheet, 'utf8'));
  let ok = 0;
  for (const [i, row] of rows.entries()) {
    const label = (row.id || row.name || `card-${i + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (await one(tpl, row, label)) ok++;
  }
  console.log(`${ok}/${rows.length} cards built`); process.exit(ok === rows.length ? 0 : 1);
}
else if (cmd === 'check') {
  const src = fs.readFileSync(rest[0], 'utf8'), r = compile(src, { baseDir: path.dirname(path.resolve(rest[0])) });
  r.diagnostics.forEach(say); console.log(r.ok ? `✓ ${Object.keys(r.doc.layers).length} layers, ${Object.values(r.doc.sides).reduce((a, s) => a + s.steps.length, 0)} steps` : '✗ not buildable');
  process.exit(r.ok ? 0 : 1);
}
else if (cmd === 'engines') { for (const e of Object.values(await engines())) console.log(`${e.name.padEnd(14)} ${e.label}\n${' '.repeat(15)}${e.describe}`); }
else if (cmd === 'reference') {
  const ref = createRegistry().reference();
  for (const v of ref.verbs) console.log(`${v.words.join(' / ')}\n  ${v.help}${v.examples.map(e => `\n    ${e}`).join('')}`);
  console.log('\ngenerators: ' + ref.generators.map(g => g.name).join(', '));
  console.log('styles: ' + ref.styles.map(s => s.name).join(', '));
}
else { console.log('usage: gt build card.gt [--engine e] [--out dir] | gt batch template.gt sheet.csv | gt check card.gt | gt engines | gt reference'); }
