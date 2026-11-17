// Engine: game. A piece with a game on it ("Play wordle on the screen …") → one self-contained page.
// The skin is drawn and lit by the web engine (web/engine.js), unchanged. The game (web/games/<kind>.js) is DOM laid on
// top in the same grid px, so it sits exactly on the drawn things it was put on. The page runs in an iframe and talks
// to its parent with postMessage (source 'gt-game'): ready, started, guessed, won, lost, said, control.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toScene } from './web.js';
import { fontFile } from '../core/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// a drawn thing's box in grid px: its shapes, else its own box, else its zone
export function boxOf(doc, name) {
  const L = doc.layers[name], z = doc.zones[name];
  if (L?.shapes?.length) {
    const xs = L.shapes.flatMap(s => s.pts.map(p => p[0])), ys = L.shapes.flatMap(s => s.pts.map(p => p[1]));
    const x = Math.min(...xs), y = Math.min(...ys);
    return [x, y, Math.max(...xs) - x, Math.max(...ys) - y].map(v => Math.round(v * 10) / 10);
  }
  if (L?.box) return [L.box[0], L.box[1], L.box[2] - L.box[0], L.box[3] - L.box[1]];
  if (z?.rect) return z.rect;
  throw new Error(`"${name}" has no shape to put the game on`);
}

export function gameOf(doc) {
  const g = doc.game;
  return {
    kind: g.kind, id: doc.id || doc.name, values: g.values, looks: g.looks, says: g.says,
    rects: {
      board: boxOf(doc, g.board), keyboard: g.keyboard ? boxOf(doc, g.keyboard) : null,
      light: g.controls.light ? boxOf(doc, g.controls.light) : null, power: g.controls.power ? boxOf(doc, g.controls.power) : null,
    },
  };
}

const fontFaces = (looks) => {
  const fams = new Set(['Jost', ...Object.values(looks).map(l => l.font).filter(Boolean)]), out = [];
  for (const fam of fams) for (const w of [400, 600]) {
    const f = fontFile(fam, w, 'normal') || (w === 400 ? null : fontFile(fam, 400, 'normal'));
    if (f) out.push(`@font-face{font-family:"${fam}";font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}) format("woff2")}`);
  }
  return out.join('');
};

const CSS = (W, H, bench) => `
[hidden]{display:none!important}
html,body{margin:0;height:100%;background:${bench};overflow:hidden;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#stage{position:absolute;left:50%;top:50%;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{position:absolute;inset:0;width:100%;height:100%;display:block}
#game{position:absolute;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none}
#game>*{position:absolute;pointer-events:auto}
.board{display:flex;flex-direction:column;align-items:center;justify-content:center}
.grid{display:grid;justify-content:center;perspective:900px}
.tile{display:flex;align-items:center;justify-content:center;font-weight:600;text-transform:uppercase;transition:background .2s,filter .4s}
.tile.typed{transform:scale(1)}
.tile.pop{animation:pop .11s ease-out}
.tile.flip{animation:flip .5s ease-in-out both;animation-delay:var(--d)}
.tile.shake{animation:shake .38s}
@keyframes pop{50%{transform:scale(1.1)}}
@keyframes flip{0%{transform:rotateX(0)}50%{transform:rotateX(90deg)}100%{transform:rotateX(0)}}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.msg{position:absolute;left:0;right:0;bottom:2%;text-align:center;font:600 1em Jost,system-ui,sans-serif;color:#fff;opacity:0;transition:opacity .25s;text-shadow:0 1px 3px #000}
.msg.on{opacity:1}
.keyboard{display:flex;flex-direction:column;box-sizing:border-box;justify-content:center}
.krow{display:flex;justify-content:center}
.key{border:0;padding:0;height:100%;font-weight:600;font-size:inherit;cursor:pointer;transition:transform .06s,box-shadow .06s}
.key:active{transform:translateY(3px)}
.control{border:0;background:transparent;cursor:pointer;border-radius:50%;padding:0}
.dial i{position:absolute;left:50%;top:8%;width:6%;height:30%;margin-left:-3%;border-radius:3px;background:#fff8;box-shadow:0 0 6px #fff6;transform-origin:50% 140%}
.switch i{position:absolute;left:50%;top:50%;width:22%;height:22%;margin:-11% 0 0 -11%;border-radius:50%;background:#3a1a10;box-shadow:inset 0 1px 2px #000}
.switch i.on{background:#ff6a3a;box-shadow:0 0 8px #ff6a3a,0 0 18px #ff6a3a88}
#game.off .tile{filter:brightness(.18) saturate(0);text-shadow:none!important}
#game.off .msg{opacity:0}
`;

export default {
  name: 'game',
  label: 'Game (lit skin + playable game, in a frame)',
  describe: 'A canvas with "Play …" on it: the web engine draws and lights the skin, the game is laid on top as DOM. One page, served in an iframe, talking to its parent over postMessage.',
  supports: (doc) => doc.game ? true : 'this piece plays no game; add e.g. "Play wordle on the screen."',
  async build(doc, { outDir, log }) {
    fs.mkdirSync(outDir, { recursive: true });
    const scene = toScene(doc), game = gameOf(doc), W = scene.W, H = scene.H;
    if (scene.unsupported.length) log?.(`game engine: not yet supported, skipped: ${scene.unsupported.join(', ')}`);
    const engine = fs.readFileSync(path.join(HERE, '..', 'web', 'engine.js'), 'utf8');
    const play = fs.readFileSync(path.join(HERE, '..', 'web', 'games', `${game.kind}.js`), 'utf8');
    const words = game.kind === 'wordle' ? fs.readFileSync(path.join(HERE, '..', 'web', 'games', 'words5.txt'), 'utf8').trim() : '';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>${esc(doc.name)}</title>
<style>${fontFaces(game.looks)}${CSS(W, H, scene.bench)}</style></head>
<body><div id="stage"><canvas id="gl"></canvas><div id="game"></div></div>
<div id="hud" hidden></div><button id="flip" hidden></button><div id="bar" hidden><button id="play"></button><input id="scrub" type="range"><span id="tc"></span></div>
<script>
(function fit(){const s=document.getElementById('stage'),k=Math.min(innerWidth/${W},innerHeight/${H});s.style.transformOrigin='50% 50%';s.style.transform='translate(-50%,-50%) scale('+k+')';addEventListener('resize',fit,{once:true});})();
window.SCENE=${JSON.stringify(scene)};
window.GAME=${JSON.stringify(game)};
window.WORDS=${JSON.stringify(words)};
</script><script>${engine}</script><script>${play}</script></body></html>`;
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    return { entry: 'index.html', files: ['index.html'] };
  },
};
