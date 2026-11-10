// Engine loader: every .js file in engines/ (except this one) is an engine.
// An engine exports default { name, label, describe, supports(doc) → true|string, async build(doc, { outDir, log }) → result }
// result = { entry: 'index.html', previews: { front, back }, files: [...] }   (paths relative to outDir)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

export async function loadEngines(extraDirs = []) {
  const engines = {};
  for (const dir of [DIR, ...extraDirs]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('_'))) {
      const mod = (await import(pathToFileURL(path.join(dir, f)).href)).default;
      if (mod?.name && typeof mod.build === 'function') engines[mod.name] = mod;
    }
  }
  return engines;
}
