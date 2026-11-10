// Reader: one statement's text → typed tokens.
//   word  {t:'word', v:'plate', raw:'Plate'}
//   num   {t:'num', v:0.8, unit:'mm'|null}
//   str   {t:'str', v:'Marilyn'}
//   color {t:'color', v:'#efe6d8'}
//   var   {t:'var', v:'chrome'}           ($chrome)
//   asset {t:'asset', v:'marilyn.jpg'}    (@marilyn.jpg)
//   comma {t:','}   colon {t:':'}
export const UNITS = {
  mm: 'mm', millimetre: 'mm', millimetres: 'mm', millimeter: 'mm', millimeters: 'mm',
  'µm': 'um', um: 'um', micron: 'um', microns: 'um',
  px: 'px', pixel: 'px', pixels: 'px',
  deg: 'deg', degree: 'deg', degrees: 'deg', '°': 'deg',
  '%': 'pct', percent: 'pct',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
  m: 'm', metre: 'm', metres: 'm', meter: 'm', meters: 'm', cm: 'cm', centimetre: 'cm', centimetres: 'cm', centimeter: 'cm', centimeters: 'cm',
};

export function read(text) {
  const toks = []; let i = 0;
  const re = {
    space: /^\s+/,
    str: /^"([^"]*)"/,
    color: /^#[0-9a-fA-F]{6}\b|^#[0-9a-fA-F]{3}\b/,
    var: /^\$([A-Za-z_][\w-]*)/,
    asset: /^@([\w./-]+[\w])/,
    num: /^[-+]?(?:\d+\.?\d*|\.\d+)/,
    word: /^[A-Za-zÀ-ÿ][\w'’À-ÿ-]*/,
    punct: /^[,:;]/,
  };
  while (i < text.length) {
    const s = text.slice(i); let m;
    if ((m = s.match(re.space))) { i += m[0].length; continue; }
    if ((m = s.match(re.str))) { toks.push({ t: 'str', v: m[1] }); i += m[0].length; continue; }
    if ((m = s.match(re.color))) { toks.push({ t: 'color', v: m[0].toLowerCase() }); i += m[0].length; continue; }
    if (s.startsWith('-$') && (m = s.slice(1).match(re.var))) { toks.push({ t: 'var', v: m[1].toLowerCase(), neg: true }); i += m[0].length + 1; continue; }   // -$size
    if ((m = s.match(re.var))) { toks.push({ t: 'var', v: m[1].toLowerCase() }); i += m[0].length; continue; }
    if (/^[-−](\s|$)/.test(s) && toks.length && ['num', 'var', ')'].includes(toks.at(-1).t)) { toks.push({ t: 'op', v: '-' }); i += 1; continue; }   // "a - b"
    if ((m = s.match(/^[*×\/+]/))) { toks.push({ t: 'op', v: m[0] === '×' ? '*' : m[0] }); i += 1; continue; }
    if (s[0] === '(' || s[0] === ')') { toks.push({ t: s[0] }); i += 1; continue; }
    if ((m = s.match(re.asset))) { toks.push({ t: 'asset', v: m[1] }); i += m[0].length; continue; }
    if ((m = s.match(re.num))) {
      const n = parseFloat(m[0]); let len = m[0].length, unit = null;
      const rest = text.slice(i + len);
      const glued = rest.match(/^([A-Za-zµ°%]+)/);
      if (glued) {
        if (UNITS[glued[1].toLowerCase()]) { unit = UNITS[glued[1].toLowerCase()]; len += glued[1].length; }
        else { const raw = m[0] + glued[1]; toks.push({ t: 'word', v: raw.toLowerCase(), raw }); i += raw.length; continue; }  // 24k, 3d
      } else {
        const w = rest.match(/^\s+([A-Za-zµ°%]+)(?![\w])/);
        if (w && UNITS[w[1].toLowerCase()]) { unit = UNITS[w[1].toLowerCase()]; len += w[0].length; }
      }
      toks.push({ t: 'num', v: n, unit }); i += len; continue;
    }
    if ((m = s.match(re.word))) { toks.push({ t: 'word', v: m[0].toLowerCase(), raw: m[0] }); i += m[0].length; continue; }
    if ((m = s.match(re.punct))) { toks.push({ t: m[0] === ';' ? ',' : m[0] }); i += 1; continue; }
    throw new Error(`can't read "${s.slice(0, 12)}"`);
  }
  return toks;
}

export const show = (t) => t.t === 'op' ? t.v : t.t === 'word' ? t.raw : t.t === 'num' ? `${t.v}${t.unit ? ' ' + t.unit : ''}` :
  t.t === 'str' ? `"${t.v}"` : t.t === 'var' ? `$${t.v}` : t.t === 'asset' ? `@${t.v}` : t.t === 'color' ? t.v : t.t;
