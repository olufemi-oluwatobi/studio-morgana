// The taste book (/taste) → apps/api/src/taste.gen.ts. Every template is filled with its defaults in every palette,
// type system and spacing it takes, and compiled; one that does not compile stops the build.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { check } from '../src/gt/checker.gen.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', 'taste');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const out = path.join(os.tmpdir(), 'morgana-taste-fill.mjs');
await esbuild.build({ entryPoints: [path.join(here, '..', 'src', 'taste', 'fill.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
const { fillTemplate, defaultSpec, layoutIssues, fitPass, ROLES } = await import(pathToFileURL(out).href + '?' + Date.now());

const book = { palettes: read('palettes.json'), type: read('type.json'), spacing: read('spacing.json'), formats: read('formats.json'), templates: [] };
const bad = [];
const ids = (list, what) => { const seen = new Set(); for (const x of list) { if (!x.id || !x.description) bad.push(`${what} ${x.id ?? '?'}: needs an id and a description`); if (seen.has(x.id)) bad.push(`${what} ${x.id}: id used twice`); seen.add(x.id); } };
ids(book.palettes, 'palette'); ids(book.type, 'type system'); ids(book.spacing, 'spacing');
for (const f of book.formats) if (!f.id || !Array.isArray(f.size) || !f.safe || !f.description) bad.push(`format ${f.id ?? '?'}: needs an id, a size, a safe area and a description`);
for (const p of book.palettes) for (const r of ROLES) if (!/^#[0-9a-f]{6}$/i.test(p.roles?.[r]?.hex ?? '')) bad.push(`palette ${p.id}: role ${r} needs a #hex`);
// type must read: ink on the ground (4.5:1, the WCAG figure for text) and ink where it crosses the accent shape (2.5:1)
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
for (const p of book.palettes) {
  if (!p.roles?.ink?.hex) continue;
  const g = contrast(p.roles.ink.hex, p.roles.ground.hex), a = contrast(p.roles.ink.hex, p.roles.accent.hex);
  if (g < 4.5) bad.push(`palette ${p.id}: ink on ground is ${g.toFixed(2)}:1; text needs 4.5:1`);
  if (a < 2.5) bad.push(`palette ${p.id}: ink over the accent is ${a.toFixed(2)}:1; type crossing the accent needs 2.5:1`);
}

for (const id of fs.readdirSync(path.join(root, 'templates')).sort()) {
  const dir = path.join(root, 'templates', id);
  if (!fs.existsSync(path.join(dir, 'template.json'))) continue;
  const t = { ...JSON.parse(fs.readFileSync(path.join(dir, 'template.json'), 'utf8')), source: fs.readFileSync(path.join(dir, 'template.gt'), 'utf8') };
  if (t.id !== id) bad.push(`template ${id}: its id says "${t.id}"`);
  for (const ty of t.fits.type) if (!book.type.some((x) => x.id === ty)) bad.push(`template ${id}: takes type "${ty}", which is not in type.json`);
  for (const sp of t.fits.spacing) if (!book.spacing.some((x) => x.id === sp)) bad.push(`template ${id}: takes spacing "${sp}", which is not in spacing.json`);
  for (const f of t.formats ?? []) if (!book.formats.some((x) => x.id === f)) bad.push(`template ${id}: made for format "${f}", which is not in formats.json`);
  if (!t.formats?.length) bad.push(`template ${id}: list the formats it is made for`);
  book.templates.push(t);
  let n = 0;
  const one = (palette, type, spacing, format) => {
    const label = `template ${id} (${palette.id}, ${type.id}, ${spacing.id}${format ? ', ' + format.id : ''})`;
    let src;
    try { src = fillTemplate({ template: t, palette, type, spacing, format }, defaultSpec(t)); }
    catch (e) { bad.push(`${label}: ${e.message}`); return; }
    let r = check(src, {});
    // fitted the way step 3 fits it, before the layout is judged
    for (let pass = 0, spec = defaultSpec(t); r.ok && pass < 3; pass++) {
      const f = fitPass({ template: t, palette, type, spacing, format }, spec, r);
      if (!f.changed) break;
      spec = f.spec; r = check(fillTemplate({ template: t, palette, type, spacing, format }, spec), {});
    }
    if (!r.ok) bad.push(`${label}: ${r.diagnostics.filter((d) => d.level === 'error').map((d) => `line ${d.line}: ${d.msg}`).join('; ')}`);
    // as designed (its own type system and the first palette), nothing may sit off the canvas, in the app's way or on other text
    else if (palette === book.palettes[0] && type.id === t.fits.type[0]) for (const x of layoutIssues(r, format)) bad.push(`${label}: ${x}`);
    n++;
  };
  // every palette, type and spacing it takes, at its first format; then every format it is made for
  const first = book.formats.find((f) => f.id === t.formats?.[0]);
  for (const palette of book.palettes) for (const tyId of t.fits.type) for (const spId of t.fits.spacing) {
    const type = book.type.find((x) => x.id === tyId), spacing = book.spacing.find((x) => x.id === spId);
    if (type && spacing) one(palette, type, spacing, first);
  }
  for (const fid of (t.formats ?? []).slice(1)) {
    const f = book.formats.find((x) => x.id === fid);
    if (f) one(book.palettes[0], book.type.find((x) => x.id === t.fits.type[0]), book.spacing.find((x) => x.id === t.fits.spacing[0]), f);
  }
  console.log(`template ${id}: ${n} combinations compile`);
}
if (bad.length) { console.error('the taste book has problems:\n  ' + [...new Set(bad)].slice(0, 30).join('\n  ')); process.exit(1); }
fs.writeFileSync(path.resolve(here, '..', 'src', 'taste.gen.ts'), `// generated by apps/api/scripts/build-taste.mjs from /taste: do not edit
import type { Book } from './taste/fill';
export const TASTE: Book = ${JSON.stringify(book, null, 1)};
`);
// the formats the composer offers, for the web app
fs.writeFileSync(path.resolve(here, '..', '..', 'web', 'src', 'lib', 'formats.gen.ts'), `// generated by apps/api/scripts/build-taste.mjs from /taste/formats.json: do not edit
export const FORMATS: { id: string; name: string; ratio: string; size: [number, number] }[] = ${JSON.stringify(book.formats.map((f) => ({ id: f.id, name: f.name, ratio: f.ratio, size: f.size })), null, 1)};
`);
console.log('taste.gen.ts:', book.templates.length, 'templates,', book.palettes.length, 'palettes,', book.type.length, 'type systems,', book.spacing.length, 'spacing systems,', book.formats.length, 'formats');
