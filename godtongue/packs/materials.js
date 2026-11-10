// Materials pack: every finish the factory can make, the words people use for it,
// and two colours (highlight, shadow) that preview engines can draw with.
export default function materials(reg) {
  const metal = (name, words, hi, lo, extra = {}) => reg.material({ name, words, type: 'metal', finish: name, polish: 'mirror', preview: { hi, lo }, ...extra });
  metal('gold-24k', ['gold', 'gold 24k', '24k gold', 'yellow gold'], '#f2c14e', '#a8701c');
  metal('gold-yellow', ['bright gold'], '#ffc925', '#e89a10');
  metal('rose-gold', ['rose gold'], '#f4b49a', '#9a5444');
  metal('silver', ['silver', 'sterling'], '#f1f3f5', '#7c838b');
  metal('copper', ['copper'], '#f0a070', '#8a3e1c');
  metal('gunmetal', ['gunmetal', 'gun metal'], '#9aa0a8', '#2a2d31');
  metal('black-chrome', ['black chrome'], '#3a3d44', '#050506');
  metal('pvd-blue-titanium', ['blue titanium', 'pvd blue'], '#86b6ff', '#16307e');
  metal('pvd-purple', ['purple pvd', 'purple metal'], '#c69bff', '#3d1a7a');
  metal('yellow-foil', ['yellow foil'], '#ffe14a', '#c99a00');
  metal('lime-foil', ['lime foil', 'neon foil'], '#efff7a', '#9db81c');
  metal('orange-foil', ['orange foil'], '#ffb066', '#c4480f');
  metal('ruby', ['ruby', 'red metal'], '#d62a36', '#3d0309');
  metal('garnet', ['garnet'], '#9a1226', '#240308');
  metal('oxblood', ['oxblood'], '#5c0a14', '#120208');
  metal('mirror-chrome', ['chrome', 'mirror chrome', 'mirror'], '#e9eef3', '#6d747c', { mirror: true });
  metal('mirror-gold', ['mirror gold', 'gold mirror'], '#ffd27a', '#8a5a14', { mirror: true });
  metal('mirror-black', ['black mirror', 'mirror black'], '#6c7380', '#0b0c10', { mirror: true });
  metal('mirror-rose', ['rose mirror', 'mirror rose', 'pink mirror'], '#ff9cc4', '#7a2a50', { mirror: true });
  for (const [n, w, hi, lo] of [['holo-rainbow', ['holo', 'rainbow holo', 'holographic'], '#e8e8ff', '#8a8aa8'],
    ['holo-rose', ['rose holo', 'pink holo'], '#ffb8dc', '#8a3a66'], ['holo-ice', ['ice holo', 'blue holo'], '#c8ecff', '#4a7a9a'],
    ['holo-gold', ['gold holo'], '#ffe0a0', '#8a6020'], ['holo-silk', ['silk holo', 'silk'], '#f4f4f8', '#9a9aa8']])
    metal(n, w, hi, lo, { holo: true });
  reg.material({ name: 'crystal', words: ['crystal', 'crystals', 'rhinestone', 'rhinestones'], type: 'metal', finish: 'crystal', preview: { hi: '#ffffff', lo: '#b8c8d8' }, crystal: true });
  for (const [n, w, hi, lo] of [['glass-clear', ['clear glass', 'glass'], '#eef4f6', '#c8d4da'], ['glass-smoke', ['smoke glass', 'smoked glass'], '#5a606a', '#2a2e34'], ['glass-rose', ['rose glass'], '#f6d0da', '#c88a9a']])
    reg.material({ name: n, words: w, type: 'metal', finish: n, preview: { hi, lo }, glass: true });

  // enamels: a colour plus a process
  const enamel = (name, words, hex, process = 'soft-enamel') => reg.material({ name, words, type: 'enamel', hex, process });
  enamel('niello', ['niello', 'black enamel'], '#0b0c0f', 'niello-inlay');
  enamel('ivory', ['ivory', 'ivory pearl', 'ivory enamel'], '#efe6d8');
  enamel('glow', ['glow enamel', 'glow in the dark'], '#c8ff6a', 'glow-enamel');

  // blank stocks (what the card is cut from)
  for (const [n, hi, lo] of [['brass', '#d9b56a', '#7a5a26'], ['stainless', '#d8dcdf', '#6e7479'], ['aluminium', '#e3e5e8', '#8a8f96'],
    ['titanium', '#b7b2aa', '#5d5a55'], ['anodized-navy', '#1d2c78', '#060b2a'], ['anodized-midnight', '#0b1a78', '#010312'], ['anodized-black', '#3a3d44', '#0a0b0e']])
    reg.material({ name: n, words: [n.replace('-', ' '), n.replace('anodized', 'anodised').replace('-', ' ')], type: 'stock', finish: n, preview: { hi, lo } });

  // colour names (for enamel, ink, spray)
  for (const [n, h] of Object.entries({
    black: '#0b0c0f', white: '#f6f4ef', cream: '#f3ead6', red: '#c4121e', crimson: '#9b0f1e', pink: '#ff8fb8', blush: '#f2c4c8',
    orange: '#f28a1e', yellow: '#ffd23e', green: '#1f8a4c', jade: '#1f8a6a', mint: '#9fe0c4', teal: '#0f7a7a', blue: '#1f4fbf',
    navy: '#14204f', sky: '#8ecdf2', purple: '#5b2a8a', lilac: '#c4a8e8', brown: '#6a3e1e', grey: '#8a8f96', gray: '#8a8f96',
    'pale gold': '#f3d27a', 'deep gold': '#c99a3a', champagne: '#f0e0b8',
  })) reg.color(n, h);
}
