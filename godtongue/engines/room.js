// Engine: rooms. Room document → scene.json → Mitsuba (rooms/render.py) for every "photograph" shot.
// Sample count from GT_ROOM_SPP (default 64, for drafts); finals use more.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildScene } from '../rooms/build.js';

const ROOMS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../rooms');
const run = (args, log) => new Promise((ok, bad) => {
  const p = spawn('python3', args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('close', c => c === 0 ? ok(out.trim()) : bad(new Error(err.split('\n').filter(Boolean).slice(-3).join(' | '))));
});

export default {
  name: 'room', label: 'Room (Mitsuba)',
  describe: 'Interiors: builds the room and renders every photographed shot with the Python path tracer.',
  supports(doc) { return doc.kind === 'room' || 'not a room'; },
  async build(doc, { outDir, log = () => { } }) {
    const scene = buildScene(doc.room);
    fs.writeFileSync(path.join(outDir, 'scene.json'), JSON.stringify(scene, null, 1));
    // draft: 960 wide, 16 samples; final: 1920 wide, 64 samples. Both denoised with OIDN.
    const final = process.env.GT_ROOM_QUALITY === 'final';
    const spp = +(process.env.GT_ROOM_SPP || (final ? 64 : 16));
    const size = final ? [1920, 1280] : [960, 640];
    const shots = [];
    fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
    for (const s of scene.shots) {
      const r = JSON.parse(await run([path.join(ROOMS, 'render.py'), path.join(outDir, 'scene.json'), path.join(outDir, 'shots', s.name), '--shot', s.name, '--spp', String(spp), '--denoise', '--size', ...size.map(String)], log));
      await run(['-c', `from PIL import Image; im = Image.open(${JSON.stringify(path.join(outDir, 'shots', s.name + '.png'))}).convert('RGB'); im.save(${JSON.stringify(path.join(outDir, 'shots', s.name + '.webp'))}, quality=90); im.save(${JSON.stringify(path.join(outDir, 'shots', s.name + '.jpg'))}, quality=92)`], log);
      for (const ext of ['.npy', '.raw.npy']) fs.rmSync(path.join(outDir, 'shots', s.name + ext), { force: true });
      log(`${s.name}: ${r.spp} spp in ${r.seconds} s`);
      shots.push({ name: s.name, png: `shots/${s.name}.png`, webp: `shots/${s.name}.webp`, jpg: `shots/${s.name}.jpg`, aspect: s.aspect, ...r });
    }
    const panoramas = [];
    if (scene.panoramas.length) fs.mkdirSync(path.join(outDir, 'panoramas'), { recursive: true });
    for (const P of scene.panoramas) {
      const base = path.join(outDir, 'panoramas', P.name);
      const r = JSON.parse(await run([path.join(ROOMS, 'render.py'), path.join(outDir, 'scene.json'), base, '--pano', P.name, '--spp', String(spp), '--denoise', '--face', String(final ? 1024 : 512)], log));
      await run(['-c', `from PIL import Image; Image.open(${JSON.stringify(base + '.png')}).convert('RGB').save(${JSON.stringify(base + '.jpg')}, quality=88)`], log);
      fs.rmSync(base + '.npy', { force: true });
      log(`panorama ${P.name}: ${r.seconds} s`);
      panoramas.push({ name: P.name, jpg: `panoramas/${P.name}.jpg`, ...r });
    }
    // walk-throughs. Default: bake the light once, then draw every frame from the bake (minutes, any length).
    // GT_ROOM_WALK=traced path-traces every frame instead (slow; the reference the bake is checked against).
    const walks = [], traced = process.env.GT_ROOM_WALK === 'traced';
    const wsize = traced ? (final ? [1920, 1080] : [960, 540]) : [1920, 1080];
    let baked = null;
    if (scene.walks.length && !traced) {
      const tb = Date.now();
      const r = JSON.parse((await run([path.join(ROOMS, 'bake.py'), path.join(outDir, 'scene.json'), path.join(outDir, 'baked')], log)).split('\n').pop());
      baked = { ...r, seconds: Math.round((Date.now() - tb) / 100) / 10 };
      log(`bake: ${r.vertices} points in ${baked.seconds} s (${r.bin_mb} MB)`);
    }
    for (const [k, w] of scene.walks.entries()) {
      const dir = path.join(outDir, 'walks', w.name);
      fs.mkdirSync(dir, { recursive: true });
      const t0 = Date.now();
      if (traced) await run([path.join(ROOMS, 'render.py'), path.join(outDir, 'scene.json'), path.join(dir, 'frames'), '--walk', w.name, '--spp', String(spp), '--denoise', '--fixed-seed', '--size', ...wsize.map(String)], log);
      else await new Promise((ok, bad) => { const p = spawn('node', [path.join(ROOMS, 'capture.cjs'), path.join(outDir, 'baked'), path.join(dir, 'frames'), '--size', ...wsize.map(String), '--walk', String(k)], { stdio: ['ignore', 'pipe', 'pipe'] }); let e = ''; p.stderr.on('data', d => e += d); p.on('close', c => c === 0 ? ok() : bad(new Error(e.slice(-400) || 'capture failed'))); });
      const mp4 = path.join(outDir, 'walks', `${w.name}.mp4`), poster = path.join(outDir, 'walks', `${w.name}.jpg`);
      await new Promise((ok, bad) => { const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', path.join(dir, 'frames', 'frame-%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]); p.on('close', c => c === 0 ? ok() : bad(new Error('ffmpeg failed'))); });
      await run(['-c', `from PIL import Image; Image.open(${JSON.stringify(path.join(dir, 'frames', 'frame-0000.png'))}).convert('RGB').resize((960, 540)).save(${JSON.stringify(poster)}, quality=88)`], log);
      const secs = Math.round((Date.now() - t0) / 100) / 10;
      log(`walk ${w.name}: ${traced ? 'path traced' : 'drawn from the bake'} in ${secs} s`);
      walks.push({ name: w.name, file: `walks/${w.name}.mp4`, poster: `walks/${w.name}.jpg`, seconds: w.seconds, size: wsize, method: traced ? 'traced' : 'baked', renderSeconds: secs });
    }
    if (baked) fs.copyFileSync(path.join(ROOMS, 'baked-view.js'), path.join(outDir, 'baked', 'baked-view.js'));
    fs.writeFileSync(path.join(outDir, 'index.html'), viewerPage(doc, scene, shots, panoramas, walks, final ? 'final' : 'draft', !!baked));
    const bakedFiles = baked ? ['baked/bake.json', 'baked/bake.b64.txt', 'baked/probe.png', ...fs.readdirSync(path.join(outDir, 'baked')).filter(f => /^(tex|view)-.*\.png$/.test(f)).map(f => `baked/${f}`)] : [];
    return { entry: 'index.html', files: ['scene.json', ...shots.map(s => s.webp), ...panoramas.map(p => p.jpg), ...walks.flatMap(w => [w.file, w.poster]), ...bakedFiles], shots, panoramas, walks, baked };
  },
};

// The presentation page: walk-through, 360 view, stills and a plan of where every camera stood.
export function viewerPage(doc, scene, shots, panoramas, walks, quality, live = false) {
  const R = doc.room, [W, D, H] = R.size;
  const ext = (p) => { const ew = p.facing === 'north' || p.facing === 'south'; const [a, b] = ew ? [p.length, p.depth] : [p.depth, p.length]; return [p.at[0] - a / 2, p.at[0] + a / 2, p.at[1] - b / 2, p.at[1] + b / 2].map(x => Math.round(x * 1000) / 1000); };
  const M = {
    title: doc.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '), size: [W, D, H], source: doc.source?.file || `${doc.name}.gt`, quality,
    pieces: R.pieces.filter(p => !['curtains', 'pendant'].includes(p.kind)).map(p => ({ kind: p.kind, rect: ext(p) })),
    openings: R.openings.map(o => ({ kind: o.kind, wall: o.wall, at: o.at, width: o.width })),
    shots: R.shots.map((s, i) => ({ name: s.name, file: shots[i].webp, lens: s.lens, from: [s.from3[0], s.from3[2]], at: [s.at3[0], s.at3[2]], height: s.from3[1], aspect: s.aspect })),
    panoramas: (R.panoramas || []).map((p, i) => ({ name: p.name, file: panoramas[i].jpg, at: [p.at3[0], p.at3[2]] })),
    walks: (R.walks || []).map((w, i) => ({ ...walks[i], points: w.points })),
    live,
  };
  const pano = fs.readFileSync(path.join(ROOMS, 'pano-viewer.js'), 'utf8').replace(/^\/\/.*\n/gm, '').replace('export function', 'function');
  const bakedJs = fs.readFileSync(path.join(ROOMS, 'baked-view.js'), 'utf8').replace(/^\/\/.*\n/gm, '').replace('export async function', 'async function');
  return fs.readFileSync(path.join(ROOMS, 'viewer.html'), 'utf8').replace('__TITLE__', M.title).replace('__MANIFEST__', JSON.stringify(M)).replace('__PANO_JS__', () => pano).replace('__BAKED_JS__', () => bakedJs);
}
