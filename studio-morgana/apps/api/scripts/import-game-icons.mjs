// Imports everyday drawings from a game-icons.net checkout into the stamp library, through the admin API.
//   node scripts/import-game-icons.mjs --root /path/to/icons --base http://localhost:8787 --email you@x --password … [--publish]
// A drawing is picked when its name is in game-icons-everyday.txt, or its last word is (the head noun: city-car, oak-leaf). One drawing per name:
// delapouite, then lorc, then the other artists. Every stamp is compiled by the Worker before it is stored.
import fs from 'node:fs';
import path from 'node:path';
import { svgToStamp } from '../../web/src/lib/svgstamp.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const root = arg('root'), base = arg('base', 'http://localhost:8787'), email = arg('email'), password = arg('password');
const publish = process.argv.includes('--publish');
if (!root || !email || !password) { console.error('needs --root, --email and --password'); process.exit(1); }

const words = new Set(fs.readFileSync(new URL('./game-icons-everyday.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean));
const PRIORITY = ['delapouite', 'lorc', 'skoll', 'sbed'];
const artists = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name)
  .sort((a, b) => (PRIORITY.indexOf(a) + 1 || 99) - (PRIORITY.indexOf(b) + 1 || 99) || a.localeCompare(b));

const cap = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const picked = new Map();   // slug → { artist, file }
for (const artist of artists) {
  for (const f of fs.readdirSync(path.join(root, artist))) {
    if (!f.endsWith('.svg')) continue;
    const slug = f.slice(0, -4);
    const last = slug.split('-').pop();
    if (!(words.has(slug) || words.has(last)) || picked.has(slug)) continue;
    picked.set(slug, { artist, file: path.join(root, artist, f) });
  }
}
console.log(`${picked.size} drawings match`);

const items = [], skipped = [];
for (const [slug, { artist, file }] of picked) {
  // a word cannot start with a digit in godtongue: 3d-hammer becomes i-3d-hammer
  const word = /^\d/.test(slug) ? `i-${slug}` : slug;
  const r = svgToStamp(fs.readFileSync(file, 'utf8'), { name: word });
  if (!r.ok) { skipped.push(`${slug}: ${r.notes.join('; ')}`); continue; }
  items.push({
    slug: word, name: cap(slug), words: [slug.replace(/-/g, ' ')], tags: [],
    parts: r.parts, source: `game-icons/${artist}/${slug}`,
    credit: `${cap(artist)}, game-icons.net, CC BY 3.0`, gt: r.gt, svg: r.svg,
  });
}
console.log(`${items.length} converted, ${skipped.length} could not be converted`);

const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-morgana': '1' }, body: JSON.stringify({ email, password }) });
if (!login.ok) { console.error('sign-in failed', login.status); process.exit(1); }
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

let stored = 0; const refused = [];
for (let i = 0; i < items.length; i += 100) {
  const res = await fetch(`${base}/api/admin/library/import`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-morgana': '1', cookie }, body: JSON.stringify({ items: items.slice(i, i + 100), publish }),
  });
  const body = await res.json();
  if (!res.ok) { console.error('batch failed', res.status, body.error); process.exit(1); }
  stored += body.stored;
  for (const r of body.results) if (!r.ok) refused.push(`${r.slug}: ${r.message}`);
  process.stdout.write(`\r${Math.min(i + 100, items.length)} of ${items.length}`);
}
console.log(`\n${stored} stored${publish ? ' and published' : ' as drafts'}; ${refused.length} refused by the compiler`);
for (const l of [...skipped, ...refused].slice(0, 40)) console.log('  ' + l);
