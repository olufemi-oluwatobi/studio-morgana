// Factory configuration: where the v1 Python factory and its fonts live.
// Override with godtongue.config.json next to package.json, or env FANCARD_HOME / FANCARD_FONTS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let file = {};
try { file = JSON.parse(fs.readFileSync(path.join(ROOT, 'godtongue.config.json'), 'utf8')); } catch { }

export const config = {
  fancardHome: process.env.FANCARD_HOME || file.fancardHome || path.join(ROOT, '..', 'fancard-complete', 'fancard-studio'),
  python: process.env.PYTHON || file.python || 'python3',
  get fontsDir() { return process.env.FANCARD_FONTS || file.fontsDir || path.join(this.fancardHome, 'fonts'); },
};

// "Bodoni Moda", 400, "italic" → path to its woff2, or null
export function fontFile(family, weight = 400, style = 'normal') {
  const slug = family.toLowerCase().replace(/\s+/g, '-');
  const dir = path.join(config.fontsDir, slug, 'files');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.woff2') && f.includes('-latin-') && !f.includes('-latin-ext-'));
  return [`${slug}-latin-${weight}-${style}.woff2`, `${slug}-latin-400-${style}.woff2`, `${slug}-latin-${weight}-normal.woff2`, `${slug}-latin-400-normal.woff2`]
    .map(f => files.includes(f) ? path.join(dir, f) : null).find(Boolean) || (files[0] ? path.join(dir, files[0]) : null);
}
