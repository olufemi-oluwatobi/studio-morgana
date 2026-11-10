// Styles pack: every .gt file in styles/ becomes a style, written in godtongue itself.
// "studded-bezel.gt" is used as: use the studded bezel style.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'styles');

export default function styles(reg) {
  if (!fs.existsSync(DIR)) return;
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.gt'))) {
    const name = f.replace(/\.gt$/, ''), source = fs.readFileSync(path.join(DIR, f), 'utf8');
    const help = (source.match(/^--\s*(.+)$/m) || [])[1] || '';
    reg.style({ name, words: [name.replace(/-/g, ' ')], help, source });
  }
}
