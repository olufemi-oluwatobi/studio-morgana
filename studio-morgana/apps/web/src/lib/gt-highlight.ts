// Colour for godtongue source. Godtongue reads like English, so the rules are simple: the first word of a statement
// is its verb, the word after "called" is a name, and strings, colours, numbers, @files, $variables and comments stand out.
// Lines are cached by their text, so typing re-tokenises only the line being typed.
export type Tok = { t: string; k?: 'verb' | 'kw' | 'name' | 'str' | 'num' | 'hex' | 'ref' | 'cmt' | 'face' | 'punct' };

const KW = new Set([
  'called', 'from', 'at', 'by', 'in', 'with', 'on', 'of', 'to', 'the', 'a', 'an', 'and', 'size', 'turned', 'thick', 'deep',
  'high', 'soft', 'big', 'wide', 'tall', 'over', 'into', 'then', 'until', 'for', 'as', 'is', 'top', 'bottom', 'left', 'right', 'edge',
]);
const RE = /(--.*$)|("(?:[^"\\]|\\.)*"?)|(#[0-9a-fA-F]{3,8}\b)|([@$][\w./-]+)|(-?\d+(?:\.\d+)?(?:mm|µm|um|ms|s|px|%|°|deg)?)|([A-Za-z][\w-]*)|([.,:;])|(\s+|.)/g;

function tokenise(line: string): Tok[] {
  if (/^\s*on the \w+\.\s*$/.test(line)) return [{ t: line, k: 'face' }];
  const out: Tok[] = [];
  let start = true, afterCalled = false;
  for (const m of line.matchAll(RE)) {
    const [s, cmt, str, hex, ref, num, word, punct] = m;
    if (cmt) out.push({ t: s, k: 'cmt' });
    else if (str) { out.push({ t: s, k: 'str' }); start = false; }
    else if (hex) { out.push({ t: s, k: 'hex' }); start = false; }
    else if (ref) { out.push({ t: s, k: 'ref' }); start = false; }
    else if (num) { out.push({ t: s, k: 'num' }); start = false; }
    else if (word) {
      const w = word.toLowerCase();
      out.push({ t: s, k: start ? 'verb' : afterCalled ? 'name' : KW.has(w) ? 'kw' : undefined });
      afterCalled = w === 'called'; start = false;
      continue;
    } else if (punct) { out.push({ t: s, k: 'punct' }); if (s === '.') start = true; }
    else out.push({ t: s });
    if (!/^\s+$/.test(s)) afterCalled = false;
  }
  return out;
}

const cache = new Map<string, Tok[]>();
export function tokens(line: string): Tok[] {
  let t = cache.get(line);
  if (!t) {
    t = tokenise(line);
    if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
    cache.set(line, t);
  }
  return t;
}
