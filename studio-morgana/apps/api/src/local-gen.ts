// Offline stand-in for the model (AI_MODE=local): template pieces from a brief, and colour/material edits by part number.
// Every template is compiled by scripts/check-local-gen.mjs, so what it writes always builds.
import type { PartBrief } from './ai';
import { FACTS } from './guide.gen';
import { fail } from './util';

const NAMED: Record<string, string> = {
  red: '#a8141d', crimson: '#8f0f1c', oxblood: '#5a0f14', pink: '#d9638f', orange: '#e2611f', yellow: '#e8b923',
  green: '#1f6b45', jade: '#2f8f6f', teal: '#127a7a', blue: '#1f3b9b', navy: '#141f4f', purple: '#5b2a86', lilac: '#a58fd0',
  black: '#121214', white: '#f3efe6', cream: '#efe6d2', ivory: '#efe6d8', grey: '#6f6c67', gray: '#6f6c67', brown: '#5a3b26',
};
const METALS = ['gold', 'chrome', 'silver', 'rose gold', 'copper', 'black mirror', 'gunmetal', 'brass'];
const STOCKS = ['brass', 'stainless', 'titanium'];
const FONTS = ['Lilita One', 'Bodoni Moda', 'Big Shoulders Display', 'Michroma', 'Shrikhand', 'Saira Condensed'];

const hashStr = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
const pick = <T>(xs: readonly T[], k: number) => xs[k % xs.length];
const words = (s: string) => s.toLowerCase().match(/[a-z]+/g) || [];
const STOP = new Set(['a', 'an', 'the', 'with', 'and', 'of', 'for', 'in', 'on', 'card', 'canvas', 'post', 'poster', 'scene', 'video', 'called', 'from', 'that', 'this', 'some', 'my']);
const slug = (s: string) => { const q = s.match(/"([^"]{1,30})"/); return (q ? words(q[1]) : words(s).filter((w) => !STOP.has(w))).slice(0, 3).join('-') || 'piece'; };
const quote = (s: string) => s.replace(/["\n]/g, '').trim();

function colourFrom(brief: string, k: number): string {
  for (const w of words(brief)) if (NAMED[w]) return NAMED[w];
  const hex = brief.match(/#[0-9a-f]{6}\b/i);
  return hex ? hex[0].toLowerCase() : pick(['#a8141d', '#141f4f', '#1f6b45', '#121214', '#5b2a86', '#e2611f'], k);
}
function metalFrom(brief: string, k: number): string {
  const b = brief.toLowerCase();
  return METALS.find((m) => b.includes(m)) || pick(METALS, k);
}
function headline(brief: string): string {
  const q = brief.match(/"([^"]{1,24})"/);
  if (q) return q[1].toUpperCase();
  const w = words(brief).filter((x) => x.length > 3 && !['card', 'canvas', 'post', 'scene', 'video', 'with', 'from', 'that', 'this', 'gold', 'chrome', 'silver'].includes(x));
  return (w[0] || 'MORGANA').toUpperCase().slice(0, 12);
}

export function localGenerate(brief: string, i: number, uploads: string[]): string {
  const k = hashStr(brief) + i * 7, b = brief.toLowerCase();
  const name = slug(brief) + (i ? '-' + (i + 1) : '');
  const colour = colourFrom(brief, k), metal = metalFrom(brief, k + i), metal2 = pick(METALS.filter((m) => m !== metal), k + 3);
  const head = headline(brief), font = pick(FONTS, k + i);
  const kind = /\bscene|stage|desk\b/.test(b) ? 'scene' : /\bpost|poster|canvas|sale|ad\b/.test(b) ? 'canvas' : i % 4 === 3 ? 'canvas' : i % 4 === 2 && !uploads.length ? 'scene' : 'card';
  if (kind === 'canvas') {
    const size = Math.max(90, Math.min(360, Math.round(1600 / Math.max(3, head.length))));
    return [`-- ${quote(brief)}`, `create a canvas called ${name}, 1080 by 1350.`, '',
      `write "${head}" called headline in ${font}, at 540 620, size ${size}.`,
      `write "STUDIO MORGANA" called sub in Martian Mono, at 540 840, size 40.`, '',
      'on the front.', `enamel the card in ${colour}.`, 'emboss the headline, 0.2 mm high, soft 0.6.', `plate the headline with ${metal}.`,
      'engrave the sub, 0.03 mm deep.', 'inlay the sub with #f4e3b0, 0.02 mm deep.', 'spray the card with gloss, 30 µm thick.', ''].join('\n');
  }
  if (kind === 'scene') {
    const bg = pick(['#cfc6b4', '#d9d1c2', '#c9b99a', '#b9c2c4'], k);
    return [`-- ${quote(brief)}`, `create a stage called ${name}, 1500 by 1100, on ${bg}.`, '',
      'make a card called ticket from cardstock, 520 by 700, at 760 560, turned 3.',
      `write "${head}" called ticket-title in Big Shoulders Display, at 260 150, size 72.`,
      'draw a circle called ticket-seal, 110 big, at 260 460.',
      'enamel the ticket-title in #222018.', 'emboss the ticket-seal, 0.15 mm high.', `foil the ticket-seal with ${metal === 'black mirror' ? 'gold' : metal}.`, '',
      'make a paper called note from bond, 380 by 500, at 330 600, turned -6, torn top edge, aged 0.3.',
      `write "${quote(brief).slice(0, 22) || 'a note'}" called note-line in Jost, at 190 140, size 26.`,
      'enamel the note-line in #222018.', ''].join('\n');
  }
  const stock = pick(STOCKS, k + 1);
  const lines = [`-- ${quote(brief)}`, `create a card called ${name} from ${stock}, 0.8 mm thick.`, '', 'on the front.'];
  if (uploads.length) lines.push(`print @${uploads[0]} in the window.`, 'spray the window with gloss, 30 µm thick.');
  else lines.push(`enamel the card in ${colour}.`);
  lines.push('draw a bezel called frame.', `plate the frame with ${metal}.`, `sign "${head[0] + head.slice(1).toLowerCase()}" at 620 ${uploads.length ? 1600 : 900}.`,
    `plate the signature with ${metal2}.`, '', 'on the back.', 'plate the card with black mirror.', 'draw a bezel called back-frame.', `plate the back-frame with ${metal}.`, '');
  return lines.join('\n');
}

// "make p2 chrome", "p1 to #c8361f", "turn p3 navy": change that part's plating or colour; nothing else
export function localEdit(source: string, parts: PartBrief[], text: string): string {
  const m = text.toLowerCase().match(/\bp(\d+)\b/);
  if (!m) fail(422, 'the offline editor needs a part number, like "make p1 chrome"');
  const part = parts.find((p) => p.n === Number(m[1]));
  if (!part) fail(422, `there is no P${m[1]} in this piece`);
  const t = text.toLowerCase();
  const material = [...FACTS.materials].sort((a, b) => b.length - a.length).find((x) => t.includes(x.replace(/-/g, ' ')) || t.includes(x));
  const hex = t.match(/#[0-9a-f]{6}\b/)?.[0];
  const colourWord = Object.keys(NAMED).find((w) => new RegExp(`\\b${w}\\b`).test(t));
  const colour = hex || (colourWord ? NAMED[colourWord] : null);
  if (!material && !colour) fail(422, 'the offline editor only changes materials and colours (for example "make p1 chrome" or "make p2 navy")');
  const lines = source.split('\n');
  const target = part.name;
  let changed = false;
  for (const ln of part.lines) {
    const i = ln - 1, s = lines[i];
    if (s == null || !s.includes(target)) continue;
    if (material && /^(plate|foil|coat)\b/.test(s.trim())) { lines[i] = s.replace(/ with [^,.]+/, ` with ${material}`); changed = true; }
    else if (colour && /^(enamel|fill|colour|color|paint)\b/.test(s.trim())) { lines[i] = s.replace(/ in [^,.]+/, ` in ${colour}`); changed = true; }
    else if (colour && /^inlay\b/.test(s.trim())) { lines[i] = s.replace(/ with [^,.]+/, ` with ${colour}`); changed = true; }
  }
  if (!changed) {
    const at = Math.max(...part.lines, 0);
    const add = material ? `plate the ${target} with ${material}.` : `enamel the ${target} in ${colour}.`;
    lines.splice(at, 0, add);
  }
  return lines.join('\n');
}
