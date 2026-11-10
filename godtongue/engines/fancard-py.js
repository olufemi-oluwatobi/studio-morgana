// Engine: the locked v1 factory (fancard.py). Card Document → v1 manifest + SVG art → physical render.
// The factory is called, never edited.
// REFERENCE ONLY (order 0.5): the reference the web engine is checked against. It is never the default engine,
// and no feature may depend on it. The Python factory stays as a comparison, not a production path.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../core/config.js';

export function toManifest(doc, buildDir) {
  const c = doc.card;
  const M = {
    fancard: 0.2, id: doc.id, template: 'godtongue@1', seed: c.seed,
    edition: { no: c.edition.no, of: c.edition.of, set: c.edition.set },
    creator: { name: c.title || doc.name },
    blank: { stock: c.stock, thickness_mm: c.thickness_mm, size_mm: c.size_mm, grid: c.grid },
    zones: {}, tokens: { enamel: {}, metal: {}, type: {} }, components: {}, sides: {},
    render: { lights: c.lights, bench: c.bench }, produce: { separations: 'per-op' },
  };
  for (const [k, z] of Object.entries(doc.zones)) M.zones[k] = { rect: z.rect, r: z.r || 0 };
  const fontKey = (f) => {
    const k = `${f.family}-${f.weight}-${f.style}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    M.tokens.type[k] = { family: f.family, weight: f.weight, style: f.style }; return k;
  };
  fs.mkdirSync(path.join(buildDir, 'art'), { recursive: true });
  const [W, H] = c.grid;
  for (const [name, L] of Object.entries(doc.layers)) {
    if (L.kind === 'vector') {
      fs.writeFileSync(path.join(buildDir, 'art', `${name}.svg`),
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g id="L">${L.svg}</g></svg>`);
      M.components[name] = { kind: 'artwork', src: `art/${name}.svg`, layers: { fill: '#L' } };
    } else if (L.kind === 'text') {
      M.components[name] = { kind: 'shape.draw', items: [{ type: 'text', at: L.at, font: fontKey(L.font), size: L.size, text: L.text, ...(L.track ? { track: L.track } : {}) }] };
    } else if (L.kind === 'signature') {
      const z = `sig-${name}`;
      M.zones[z] = { center: L.center, max_width: L.max_width, size: L.size, rotate_deg: L.rotate_deg, overlay: true };
      M.components[name] = { kind: 'type.signature', params: { text: L.text, font: fontKey(L.font) }, place: { at: z } };
    }
  }
  for (const [k, m] of Object.entries(doc.materials)) {
    if (m.type === 'enamel') M.tokens.enamel[k] = { name: m.name || k, hex: m.hex, process: m.process || 'soft-enamel' };
    else M.tokens.metal[k] = m.finish === 'crystal' ? { finish: 'crystal' } : { finish: m.finish, polish: m.polish || 'mirror' };
  }
  const mask = (a) => {
    const t = (x) => x.mod === 'halo' ? `halo(${x.ref},${round(x.r)})` : x.mod === 'grow' ? `grow(${x.ref},${round(x.r)})` : x.ref;
    return [...a.terms.map(t), ...(a.minus || []).map(x => '-' + t(x)), ...(a.within || []).map(x => '&' + t(x))];
  };
  fs.mkdirSync(path.join(buildDir, 'assets'), { recursive: true });
  const asset = (key) => { const dst = path.join(buildDir, 'assets', path.basename(key)); fs.copyFileSync(doc.assets[key].path, dst); return `assets/${path.basename(key)}`; };
  for (const [side, S] of Object.entries(doc.sides)) {
    const ops = [{ op: 'brush', params: { angle_deg: c.brush_deg } }];
    for (const s of S.steps) {
      const o = { op: s.op, mask: mask(s.area) };
      if (s.op === 'plate' || s.op === 'foil') o.metal = `metal.${s.material}`;
      if (s.op === 'enamel') o.color = `enamel.${s.material}`;
      if (s.op === 'spray') o.kind = s.kind;
      if (s.op === 'print' || s.op === 'illustrate') {
        o.image = { src: asset(s.image.asset), zone: s.image.zone || 'window', ...(s.image.focus ? { focus: s.image.focus } : {}), ...(s.image.zoom ? { zoom: s.image.zoom } : {}), filters: [] };
        if (s.on_foil) { o.on_foil = true; if (s.white) o.white = mask(s.white); }
      }
      if (s.params && Object.keys(s.params).length) o.params = s.params;
      ops.push(o);
    }
    M.sides[side] = { ...(S.silhouette.length ? { silhouette: S.silhouette } : {}), ops };
  }
  return M;
}
const round = (v) => Math.round(v * 10) / 10;

export default {
  name: 'fancard-py',
  label: 'Fancard v1 · reference only (Python factory)',
  reference: true,
  describe: 'Runs the locked v1 factory: metals, relief, enamel and light, as a tilt-and-flip card page. About 30–90 s.',
  supports() { return fs.existsSync(path.join(config.fancardHome, 'fancard.py')) || `fancard.py not found in ${config.fancardHome} (set FANCARD_HOME)`; },
  async build(doc, { outDir, log = () => { } }) {
    const buildDir = path.join(outDir, 'build'); fs.mkdirSync(buildDir, { recursive: true });
    const M = toManifest(doc, buildDir);
    const manifest = path.join(buildDir, 'card.yaml');            // JSON is valid YAML
    fs.writeFileSync(manifest, JSON.stringify(M, null, 1));
    log(`manifest → build/card.yaml (${M.sides.front?.ops.length || 0} front ops, ${M.sides.back?.ops.length || 0} back ops)`);
    const out = await run(config.python, [path.join(config.fancardHome, 'fancard.py'), manifest, '--out', path.join(outDir, 'render')], config.fancardHome, log);
    const line = out.split('\n').reverse().find(l => l.startsWith('✓'));
    if (!line) throw new Error('the factory did not finish:\n' + out.split('\n').slice(-6).join('\n'));
    const html = line.split(/\s+/)[1], dir = path.relative(outDir, path.dirname(html));
    const previews = {};
    for (const s of ['front', 'back']) if (fs.existsSync(path.join(path.dirname(html), `preview-${s}.png`))) previews[s] = `${dir}/preview-${s}.png`;
    return { entry: `${dir}/card.html`, previews, files: ['build/card.yaml', `${dir}/card.html`, ...Object.values(previews)], manifest: 'build/card.yaml' };
  },
};

function run(cmd, args, cwd, log) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd });
    let out = '';
    p.stdout.on('data', d => { out += d; String(d).split('\n').filter(Boolean).forEach(l => log(l)); });
    p.stderr.on('data', d => { out += d; String(d).split('\n').filter(Boolean).forEach(l => log(l)); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(`fancard.py exited ${code}:\n${out.split('\n').slice(-8).join('\n')}`)));
  });
}
