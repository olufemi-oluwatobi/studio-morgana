// Statement splitter: source text → [{text, line, col}] and recipe blocks.
// A statement ends at a full stop followed by whitespace or end of text, outside quotes.
// "0.8 mm" and "@marilyn.jpg" never end a statement. Comments: "--" or "//" to end of line.

export function stripComments(src) {
  let out = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"') q = !q;
    if (!q && ((c === '-' && src[i + 1] === '-') || (c === '/' && src[i + 1] === '/'))) {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }   // keep columns and lines
      if (i < src.length) out += '\n';
      continue;
    }
    out += c;
  }
  return out;
}

export function split(src) {
  src = stripComments(src.replace(/\r\n?/g, '\n'));
  const stmts = [];
  let buf = '', q = false, line = 1, col = 1, sLine = 1, sCol = 1, started = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (!started && !/\s/.test(c)) { started = true; sLine = line; sCol = col; }
    if (c === '"') q = !q;
    const next = src[i + 1];
    const ends = !q && (c === '.' && (next === undefined || /\s/.test(next)));
    if (ends) {
      if (buf.trim()) stmts.push({ text: buf.trim(), line: sLine, col: sCol });
      buf = ''; started = false;
    } else if (!q && c === ':' && (next === undefined || /\s/.test(next)) && /\bas\s*$/i.test(buf)) {
      // "define $x as:" opens a recipe block that runs to "end."
      stmts.push({ text: buf.trim() + ':', line: sLine, col: sCol, opens: true });
      buf = ''; started = false;
    } else buf += c;
    if (c === '\n') { line++; col = 1; } else col++;
  }
  if (buf.trim()) stmts.push({ text: buf.trim(), line: sLine, col: sCol, unterminated: true });
  return stmts;
}

// Group recipe blocks: "define $x as:" ... "end." → one statement with .body = [statements]
export function group(stmts) {
  const out = []; let i = 0;
  while (i < stmts.length) {
    const s = stmts[i];
    if (s.opens) {
      const body = []; i++;
      while (i < stmts.length && !/^end$/i.test(stmts[i].text)) body.push(stmts[i++]);
      if (i >= stmts.length) out.push({ ...s, error: 'recipe never closed: add "end." after its last statement' });
      else out.push({ ...s, body });
      i++;
    } else { out.push(s); i++; }
  }
  return out;
}
