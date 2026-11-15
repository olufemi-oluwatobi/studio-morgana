// "cut out": a photo with its backdrop removed. Made once by tools/cutout.py (IS-Net matte + foreground colour)
// and cached beside the photo as .gt-cache/<name>.cut.png; rebuilt when the photo changes.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export function cutoutPath(file) {
  const dir = path.join(path.dirname(file), '.gt-cache'), out = path.join(dir, path.basename(file).replace(/\.[^.]+$/, '') + '.cut.png');
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(file).mtimeMs) return out;
  fs.mkdirSync(dir, { recursive: true });
  try { execFileSync(config.python, [path.join(ROOT, 'tools', 'cutout.py'), file, out], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { throw new Error(`cut out failed for ${path.basename(file)}: ${String(e.stderr || e.message).split('\n').filter(Boolean).slice(-2).join(' ')}`); }
  return out;
}
