// Room pack: interiors in godtongue. A file that starts "create a room …" is a room; every card file is untouched.
// Words shared with cards (create, make, paint, cut, place, put, set) are claimed only when the document is a room.
//
//   create a room called lagos-lounge, 4.5 by 3.6, 2.75 high.
//   make the floor oak.  paint the walls #c9bfae.
//   cut a window in the north wall, 1.7 wide, 1.5 high, sill 0.8.
//   place a sofa against the west wall, 2.1 long, in green velvet.
//   place a coffee table in front of the sofa, 0.4 away.
//   place an armchair facing the sofa, at 3.55 2.2, in #e69d27.
//   lay a rug under the coffee table, 3.2 by 2.25, in terracotta.
//   hang a pendant over the coffee table, 1.95 high.
//   hang art on the east wall, 0.8 by 0.5, 1.45 high.
//   photograph the room called overview, from 4.1 0.22 1.25, looking at 1.8 3.2 0.95, 28 mm.
// Distances are metres ("40 cm" and "400 mm" work too). "at" on a wall is measured from its west end (north and
// south walls) or its south end (east and west walls). "at e n" in the room is metres east and north of the south-west corner.
import { clauses, dropArticles, isWord } from '../core/phrases.js';
import { show } from '../core/read.js';
import { ROOM_MATERIALS, ALIASES, hexToLinear } from '../rooms/materials.js';
import { FACING, OPPOSITE } from '../rooms/build.js';

const WALLS = ['north', 'south', 'east', 'west'];
const KEYS = new Set(['called', 'named', 'against', 'in', 'on', 'facing', 'over', 'above', 'at', 'from', 'looking', 'towards', 'toward', 'with', 'under', 'beneath']);
const KINDS = {
  'sofa': { words: ['sofa', 'couch', 'settee'], length: 2.1, depth: 0.85, material: 'linen' },
  'armchair': { words: ['armchair', 'chair', 'lounge chair'], length: 0.85, depth: 0.8, material: 'linen' },
  'coffee-table': { words: ['coffee table', 'table', 'low table'], length: 0.9, depth: 0.85, height: 0.44, material: 'walnut' },
  'rug': { words: ['rug', 'carpet'], length: 3.0, depth: 2.0, thickness: 0.012, material: 'terracotta' },
  'art': { words: ['art', 'painting', 'picture', 'print', 'artwork'], length: 0.8, tall: 0.5, depth: 0.03, centreHeight: 1.45, material: 'navy' },
  'pendant': { words: ['pendant', 'pendant light', 'globe'], height: 2.0, radius: 0.09 },
  'side-table': { words: ['side table', 'end table'], length: 0.5, depth: 0.5, height: 0.55, material: 'oak' },
  'bookshelf': { words: ['bookshelf', 'bookcase', 'shelves', 'shelf'], length: 1.2, depth: 0.32, height: 2.0, material: 'oak' },
  'plant': { words: ['plant', 'tree', 'fiddle leaf'], length: 0.4, depth: 0.4, height: 1.3 },
  'floor-lamp': { words: ['floor lamp', 'standing lamp', 'lamp'], length: 0.44, depth: 0.44, material: 'linen' },
  'curtains': { words: ['curtains', 'curtain', 'drapes'], material: 'linen' },
};

export default function room(reg) {
  const claim = (words, help, examples, run) => {
    reg.verbList.push({ words, help, examples });
    for (const w of words) {
      const prev = reg.verbs.get(w);
      reg.verbs.set(w, {
        words: [w], help, examples,
        run(ctx, toks, s) {
          if (ctx.doc.room || (w === 'create' || w === 'start') && isWord(dropArticles(toks)[0], 'room')) return run(ctx, toks, s);
          if (prev) return prev.run(ctx, toks, s);
          ctx.err(`"${w}" is a room word; start the file with "create a room called …"`);
        },
      });
    }
  };

  claim(['create', 'start'], 'Start a room: its width (west to east), depth (south to north) and ceiling height, in metres.',
    ['create a room called lagos-lounge, 4.5 by 3.6, 2.75 high.'], (ctx, toks) => {
      const m = mods(ctx, dropArticles(toks).slice(1));
      const name = m.name || 'room';
      const size = m.size || [4.5, 3.6];
      ctx.doc.kind = 'room'; ctx.doc.name = name; ctx.doc.id = `godtongue/${name}`;
      ctx.doc.room = {
        size: [size[0], size[1], m.high ?? m.tall ?? m.size3 ?? 2.75], wallT: 0.1,
        floor: 'oak', walls: 'warm-white', ceiling: 'ceiling-white', frame: 'black',
        skirting: { height: 0.1, depth: 0.015, material: 'skirting-white' },
        daylight: [3.6, 3.9, 4.4], view: 'trees', bulb: [60, 40, 21], exposure: 0.7, bounces: 6, width: 960, height: 640,
        materials: {}, openings: [], pieces: [], shots: [],
      };
      ctx.it = 'room';
    });

  const surface = (ctx, toks) => {
    const t = dropArticles(toks).filter(x => !isWord(x, 'in', 'with', 'to'));
    const what = t[0]?.v;
    const R = need(ctx);
    const target = { floor: 'floor', floors: 'floor', walls: 'walls', wall: 'walls', ceiling: 'ceiling', skirting: 'skirting', skirtings: 'skirting', frames: 'frame', frame: 'frame', 'window-frames': 'frame' }[what];
    if (!target) ctx.err(`"${what}" is not a surface`, 'surfaces: the floor, the walls, the ceiling, the skirting, the frames');
    const key = material(ctx, t.slice(1));
    if (target === 'skirting') R.skirting.material = key; else R[target] = key;
  };
  claim(['make', 'paint', 'finish'], 'Give a surface its material or colour: the floor, the walls, the ceiling, the skirting, the window frames.',
    ['make the floor oak.', 'paint the walls #c9bfae.'], surface);

  claim(['cut'], 'Cut a window or a door into a wall. Windows bring daylight in.',
    ['cut a window in the north wall, 1.7 wide, 1.5 high, sill 0.8.', 'cut a door in the south wall, 0.9 wide, 2.1 high, at 3.6.'], (ctx, toks) => {
      const R = need(ctx), t = dropArticles(toks);
      const kind = t[0]?.v === 'door' ? 'door' : t[0]?.v === 'window' ? 'window' : ctx.err('cut a window or a door?');
      const m = mods(ctx, t.slice(1));
      if (!m.wall) ctx.err(`which wall is the ${kind} in?`, `e.g. "cut a ${kind} in the north wall, …"`);
      const len = m.wall === 'north' || m.wall === 'south' ? R.size[0] : R.size[1];
      const width = m.wide ?? (kind === 'door' ? 0.9 : 1.5), height = m.high ?? m.tall ?? (kind === 'door' ? 2.1 : 1.4);
      const o = { kind, name: m.name || uniqueName(R.openings, kind), wall: m.wall, width, height, sill: kind === 'door' ? 0 : (m.sill ?? 0.8), at: m.at?.[0] ?? len / 2 };
      if (kind === 'door') o.material = m.material || 'walnut';
      if (o.at - width / 2 < 0.05 || o.at + width / 2 > len - 0.05) ctx.err(`the ${kind} runs off the ${m.wall} wall`, `the wall is ${len} m long`);
      if (o.sill + height > R.size[2] - 0.05) ctx.err(`the ${kind} is taller than the room`);
      R.openings.push(o); ctx.it = o.name;
    });

  claim(['place', 'put', 'lay', 'hang', 'add'], 'Place a piece: a sofa, armchair, coffee table, rug, art or pendant. Say where with "against the … wall", "in front of …", "facing …", "over …", "under …" or "at e n". On a stage, a card file goes on as one element: "place a card called ticket from @ticket.gt at 540 900, scale 0.6." Objects: "place a rose at 620 900."',
    ['place a sofa against the west wall, 2.1 long, in green velvet.', 'place a coffee table in front of the sofa, 0.4 away.', 'hang a pendant over the coffee table, 1.95 high.'], (ctx, toks) => {
      const R = need(ctx), t = dropArticles(toks);
      const kind = pieceKind(ctx, t);
      const K = KINDS[kind.key], m = mods(ctx, t.slice(kind.n));
      const [W, D, H] = R.size;
      const p = { kind: kind.key, name: m.name || uniqueName(R.pieces, kind.key), material: m.material || K.material };
      if (m.legs) p.legs = m.legs;
      p.length = m.long ?? m.wide ?? m.size?.[0] ?? K.length;
      p.depth = m.deep ?? m.size?.[1] ?? K.depth;
      if (kind.key === 'coffee-table') p.height = m.high ?? K.height;
      if (kind.key === 'rug') p.thickness = K.thickness;
      if (kind.key === 'art') { p.tall = m.size?.[1] ?? m.tall ?? K.tall; p.depth = K.depth; p.centreHeight = m.high ?? K.centreHeight; }
      p.seed = hashName(`${ctx.doc.name}/${p.name}`);
      if (m.turned != null) p.turned = m.turned;
      if (['side-table', 'bookshelf', 'plant'].includes(kind.key)) p.height = m.high ?? m.tall ?? K.height;
      if (kind.key === 'plant' && m.pot) p.pot = m.pot;
      if (kind.key === 'curtains') {
        const wins = R.openings.filter(o => o.kind === 'window');
        const o = (m.wall && wins.find(w => w.wall === m.wall)) || (m.window && wins.find(w => w.name === m.window)) || wins[0];
        if (!o) ctx.err('there is no window to hang curtains on', 'cut a window first');
        const [W0, D0] = R.size;
        p.facing = OPPOSITE[o.wall]; p.length = o.width; p.top = o.sill + o.height + 0.12; p.depth = 0.1;
        p.at = { north: [o.at, D0], south: [o.at, 0], east: [W0, o.at], west: [0, o.at] }[o.wall];
        R.pieces.push(p); ctx.it = p.name; return;
      }
      if (kind.key === 'pendant') {
        const over = m.over && ref(ctx, R, m.over);
        p.at = over ? [...over.at] : (m.at ? m.at.slice(0, 2) : [W / 2, D / 2]);
        p.height = m.high ?? K.height; p.radius = K.radius; p.ceiling = H; p.facing = 'north'; p.material = 'bulb-warm';
        R.pieces.push(p); ctx.it = p.name; return;
      }
      if (m.wall) {                                   // against a wall (or on it, for art)
        p.facing = OPPOSITE[m.wall];
        const gap = kind.key === 'art' ? 0 : (m.away ?? 0.05);
        const along = m.at?.[0] ?? ((m.wall === 'north' || m.wall === 'south') ? W : D) / 2;
        const off = gap + p.depth / 2;
        p.at = { west: [off, along], east: [W - off, along], south: [along, off], north: [along, D - off] }[m.wall];
      } else if (m.front) {                           // in front of another piece, facing the same way
        const o = ref(ctx, R, m.front), f = FACING[o.facing], d = o.depth / 2 + (m.away ?? 0.4) + p.depth / 2;
        p.facing = o.facing; p.at = [o.at[0] + f[0] * d, o.at[1] + f[1] * d];
      } else if (m.under) {                           // a rug under a piece
        const o = ref(ctx, R, m.under);
        p.facing = 'north'; p.at = m.at ? m.at.slice(0, 2) : [...o.at];
      } else if (m.at) {
        p.at = m.at.slice(0, 2); p.facing = 'north';
      } else ctx.err(`where does the ${kind.key.replace('-', ' ')} go?`, 'say "against the west wall", "in front of the sofa", "facing the sofa, at 3.5 2.2" or "at 2 1.5"');
      if (m.facing) p.facing = WALLS.includes(m.facing) ? m.facing : towards(p.at, ref(ctx, R, m.facing).at);
      if (kind.key === 'rug') p.facing = m.size && WALLS.includes(m.facing) ? p.facing : 'north';
      for (const [i, lim] of [[0, W], [1, D]]) if (p.at[i] < 0 || p.at[i] > lim) ctx.err(`the ${p.name} lands outside the room`, `the room is ${W} by ${D} m`);
      R.pieces.push(p); ctx.it = p.name;
    });

  claim(['photograph', 'shoot'], 'Take a still: where the camera stands (e n, and eye height), what it looks at, and the lens.',
    ['photograph the room called overview, from 4.1 0.22 1.25, looking at 1.8 3.2 0.95, 28 mm.'], (ctx, toks) => {
      const R = need(ctx), t = dropArticles(toks);
      let k = 0; while (t[k]?.t === 'word' && !KEYS.has(t[k].v)) k++;      // "photograph the sofa corner, …" names the shot sofa-corner
      const subject = t.slice(0, k).map(x => x.v).filter(w => w !== 'room').join('-');
      const m = mods(ctx, t.slice(k));
      m.name ??= subject || undefined;
      const words = t.slice(0, k).map(x => x.v);
      let from3, at3, lens = m.lens;
      if (m.from) {
        const look = m.looking || m.towards;
        if (!look) ctx.err('what does the camera look at?', 'add "looking at 1.8 3.2" or "looking at the sofa"');
        from3 = [m.from[0], m.from[2] ?? 1.25, m.from[1]];
        if (Array.isArray(look)) at3 = [look[0], look[2] ?? from3[1], look[1]];
        else { const o = ref(ctx, R, look); at3 = [o.at[0], o.kind === 'pendant' ? o.height : 0.5, o.at[1]]; }
      } else ({ from3, at3, lens } = preset(ctx, R, words, m));
      R.shots.push({ name: m.name || `shot-${R.shots.length + 1}`, from3, at3, lens: Math.round((lens ?? 28) * 10) / 10, aspect: m.flags?.has('portrait') ? 'portrait' : 'landscape' });
    });

  claim(['take'], 'Take a 360° panorama from a spot in the room (metres east and north, and eye height).',
    ['take a panorama at 2.6 2.1 called centre.', 'take a panorama at 1.5 3.0, 1.5 high.'], (ctx, toks) => {
      const R = need(ctx), t = dropArticles(toks);
      if (!isWord(t[0], 'panorama', 'pano', '360')) ctx.err('take what?', 'e.g. "take a panorama at 2.6 2.1."');
      const m = mods(ctx, t.slice(1));
      const [W, D] = R.size, at = m.at || [W / 2, D / 2];
      const h = m.high ?? at[2] ?? 1.5;
      if (at[0] <= 0.1 || at[0] >= W - 0.1 || at[1] <= 0.1 || at[1] >= D - 0.1) ctx.err('the panorama spot is outside the room');
      (R.panoramas ||= []).push({ name: m.name || `panorama-${(R.panoramas?.length || 0) + 1}`, at3: [at[0], h, at[1]] });
    });

  claim(['walk', 'move'], 'A walk-through: the camera walks from one place to another (through any others), at eye height, eased in and out. Places are a door, a window, a piece, or "e n".',
    ['walk from the door to the window, 8 seconds.', 'walk from the door through 3.0 2.0 to the sofa, looking at the window, 10 seconds.'], (ctx, toks) => {
      const R = need(ctx), t = dropArticles(toks);
      const parts = []; let cur = null;
      for (const x of t) {
        if (x.t === ',') { cur = null; continue; }
        if (isWord(x, 'from', 'to', 'through', 'via', 'looking', 'called', 'named') || (x.t === 'num' && cur?.key !== 'from' && cur?.key !== 'to' && cur?.key !== 'through' && cur?.key !== 'via' && cur?.key !== 'looking')) {
          if (x.t === 'word') { cur = { key: x.v === 'via' ? 'through' : x.v === 'named' ? 'called' : x.v, toks: [] }; parts.push(cur); continue; }
          cur = { key: 'num', toks: [] }; parts.push(cur);
        }
        if (!cur) ctx.err(`can't read "${show(x)}" in the walk`, 'e.g. "walk from the door to the window, 8 seconds."');
        cur.toks.push(x);
      }
      const place = (ts) => {
        const ws = ts.filter(x => x.t === 'word' && x.v !== 'at').map(x => x.v), ns = ts.filter(x => x.t === 'num').map(metres);
        if (ns.length >= 2) return [ns[0], ns[1]];
        return placeOf(ctx, R, ws.join('-'));
      };
      const pts = [], walk = { name: `walk-${(R.walks?.length || 0) + 1}`, seconds: 8, height: 1.5 };
      for (const p of parts) {
        if (p.key === 'from') pts.unshift(place(p.toks));
        else if (p.key === 'through') pts.push(place(p.toks));
        else if (p.key === 'to') walk.to = place(p.toks);
        else if (p.key === 'called') walk.name = p.toks.filter(x => x.t === 'word').map(x => x.v).join('-');
        else if (p.key === 'looking') { const ws = p.toks.filter(x => x.t === 'word' && x.v !== 'at').map(x => x.v), ns = p.toks.filter(x => x.t === 'num').map(metres); walk.look = ns.length >= 2 ? [ns[0], ns[2] ?? 1.2, ns[1]] : lookOf(ctx, R, ws.join('-')); }
        else if (p.key === 'num') { const u = p.toks[1]?.v; if (/^sec/.test(u || '') || p.toks[0].unit === 's') walk.seconds = p.toks[0].v; else if (u === 'high') walk.height = metres(p.toks[0]); else ctx.err(`what is ${show(p.toks[0])}?`, 'say "8 seconds" or "1.5 high"'); }
      }
      if (!pts.length || !walk.to) ctx.err('a walk needs a start and an end', 'e.g. "walk from the door to the window."');
      walk.points = [...pts, walk.to]; delete walk.to;
      (R.walks ||= []).push(walk);
    });

  claim(['set'], 'Set a room setting: exposure, daylight, bulb, bounces, size (pixels).',
    ['set the exposure to 0.7.', 'set the size to 1920 by 1080.'], (ctx, toks) => {
      const R = need(ctx), t = dropArticles(toks);
      const to = t.findIndex(x => isWord(x, 'to'));
      const key = t.slice(0, to).filter(x => x.t === 'word').map(x => x.v).join('-'), nums = t.slice(to + 1).filter(x => x.t === 'num').map(x => x.v);
      if (to < 0 || !nums.length) ctx.err('set what to what?', 'e.g. "set the exposure to 0.7."');
      if (key === 'exposure') R.exposure = nums[0];
      else if (key === 'daylight' || key === 'bulb') R[key] = nums.length === 3 ? nums : R[key].map(v => v * nums[0] / R[key][0]);
      else if (key === 'bounces') R.bounces = nums[0];
      else if (key === 'size' || key === 'resolution') [R.width, R.height] = nums;
      else ctx.err(`unknown room setting "${key}"`, ctx.suggest(key, ['exposure', 'daylight', 'bulb', 'bounces', 'size']));
    });
}

// ── helpers
// Presentation presets: a wall straight on, a corner across the room, or a piece close up.
//   photograph the north wall.   photograph the north-west corner.   photograph the sofa, close.
function preset(ctx, R, words, m) {
  const [W, D] = R.size, eye = 1.3, compass = words.filter(w => WALLS.includes(w) || /^(north|south)-(east|west)$/.test(w)).flatMap(w => w.split('-'));
  if (words.includes('wall') && compass.length === 1) {                     // one-point view of a wall, from just inside the opposite wall
    const wall = compass[0], ns = wall === 'north' || wall === 'south', len = ns ? W : D, depth = ns ? D : W;
    const dist = depth - 0.35, mid = len / 2;
    const P = { north: [[mid, 0.35], [mid, D]], south: [[mid, D - 0.35], [mid, 0]], east: [[0.35, mid], [W, mid]], west: [[W - 0.35, mid], [0, mid]] }[wall];
    const lens = m.lens ?? Math.max(16, Math.min(35, 18 * dist / (len / 2 + 0.15)));
    return { from3: [P[0][0], eye, P[0][1]], at3: [P[1][0], 1.2, P[1][1]], lens };
  }
  if (words.includes('corner') && compass.length === 2) {                  // two-point view across the room into a corner
    const ce = compass.includes('east') ? W : 0, cn = compass.includes('north') ? D : 0;
    const from3 = [ce ? 0.45 : W - 0.45, eye, cn ? 0.45 : D - 0.45];
    return { from3, at3: [ce, 1.1, cn], lens: m.lens ?? 22 };
  }
  const subject = words.filter(w => !['close', 'detail', 'up', 'of'].includes(w)).join('-');
  if (!subject) ctx.err('where does the camera stand?', 'say "from 4.1 0.2", or name a wall, a corner or a piece: "photograph the north wall."');
  const o = ref(ctx, R, subject);
  let f = FACING[o.facing] || [0, 1];
  if (['plant', 'side-table', 'floor-lamp', 'pendant', 'rug', 'coffee-table'].includes(o.kind)) {   // no real front: shoot from the middle of the room
    const v = [W / 2 - o.at[0], D / 2 - o.at[1]], l = Math.hypot(...v) || 1; f = [v[0] / l, v[1] / l];
  }
  const turn = 22 * Math.PI / 180, dir = [f[0] * Math.cos(turn) - f[1] * Math.sin(turn), f[0] * Math.sin(turn) + f[1] * Math.cos(turn)];
  const dist = Math.max(1.3, (o.length || 1) * 1.05) + (o.depth || 0.5) / 2;
  const top = o.kind === 'pendant' ? o.height : o.kind === 'art' ? o.centreHeight : o.kind === 'bookshelf' ? o.height * 0.55 : (o.height ?? 0.8) * 0.6;
  const from3 = [o.at[0] + dir[0] * dist, Math.max(0.9, top + 0.35), o.at[1] + dir[1] * dist];
  for (const [i, lim] of [[0, W], [2, D]]) from3[i] = Math.max(0.3, Math.min(lim - 0.3, from3[i]));
  return { from3, at3: [o.at[0], top, o.at[1]], lens: m.lens ?? 40 };
}

// Where a walk can go: just inside a door, in front of a window, or in front of a piece.
function placeOf(ctx, R, name) {
  const [W, D] = R.size;
  const o = R.openings.find(x => x.name === name || x.kind === name);
  if (o) {
    const inset = o.kind === 'door' ? 0.6 : 2.0;
    return { north: [o.at, D - inset], south: [o.at, inset], east: [W - inset, o.at], west: [inset, o.at] }[o.wall];
  }
  if (name === 'middle' || name === 'centre' || name === 'center') return [W / 2, D / 2];
  const p = ref(ctx, R, name);
  let f = FACING[p.facing] || [0, 1];
  if (['plant', 'side-table', 'floor-lamp', 'pendant', 'rug', 'coffee-table'].includes(p.kind)) { const v = [W / 2 - p.at[0], D / 2 - p.at[1]], l = Math.hypot(...v) || 1; f = [v[0] / l, v[1] / l]; }
  const d = (p.depth || 0.5) / 2 + 1.1;
  return [Math.max(0.3, Math.min(W - 0.3, p.at[0] + f[0] * d)), Math.max(0.3, Math.min(D - 0.3, p.at[1] + f[1] * d))];
}
function lookOf(ctx, R, name) {
  const [W, D] = R.size;
  const o = R.openings.find(x => x.name === name || x.kind === name);
  if (o) { const h = o.sill + o.height / 2; return { north: [o.at, h, D], south: [o.at, h, 0], east: [W, h, o.at], west: [0, h, o.at] }[o.wall]; }
  const p = ref(ctx, R, name);
  return [p.at[0], p.kind === 'pendant' ? p.height : p.kind === 'art' ? p.centreHeight : 0.55, p.at[1]];
}

function hashName(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function need(ctx) { if (!ctx.doc.room) ctx.err('start with "create a room called …"'); return ctx.doc.room; }
function uniqueName(list, base) { let n = base; for (let q = 2; list.some(x => x.name === n); q++) n = `${base}-${q}`; return n; }
const metres = (t) => t.unit === 'mm' ? t.v / 1000 : t.unit === 'cm' ? t.v / 100 : t.v;

function pieceKind(ctx, t) {
  for (let n = Math.min(3, t.length); n >= 1; n--) {
    const phrase = t.slice(0, n).map(x => x.v).join(' ');
    for (const [key, K] of Object.entries(KINDS)) if (K.words.includes(phrase) || K.words.includes(phrase.replace(/s$/, ''))) return { key, n };
  }
  const w = t[0]?.t === 'word' ? t[0].v : show(t[0] || { t: 'nothing' });
  ctx.err(`no piece called "${w}"`, ctx.suggest(w, Object.values(KINDS).flatMap(K => K.words)) || `pieces: ${Object.keys(KINDS).join(', ')}`);
}

function ref(ctx, R, name) {
  const n = String(name).replace(/ /g, '-');
  const hit = R.pieces.find(p => p.name === n) || R.pieces.find(p => p.kind === n) || R.pieces.find(p => KINDS[p.kind].words.map(w => w.replace(/ /g, '-')).includes(n));
  if (!hit) ctx.err(`there is no "${n}" in the room yet`, R.pieces.length ? `placed so far: ${R.pieces.map(p => p.name).join(', ')}` : 'place it first');
  return hit;
}
function towards(from, to) {
  const de = to[0] - from[0], dn = to[1] - from[1];
  return Math.abs(de) >= Math.abs(dn) ? (de >= 0 ? 'east' : 'west') : (dn >= 0 ? 'north' : 'south');
}

function material(ctx, toks) {
  const R = ctx.doc.room;
  const t = toks.filter(x => !isWord(x, 'in', 'with', 'the'));
  if (!t.length) ctx.err('which material or colour?', `materials: ${Object.keys(ROOM_MATERIALS).join(', ')}, or a #hex colour`);
  if (t[0].t === 'color') { const key = `paint-${t[0].v.slice(1)}`; R.materials[key] = { base: hexToLinear(t[0].v), rough: 1.0 }; return key; }
  const words = t.filter(x => x.t === 'word').map(x => x.v), name = words.join('-'), spaced = words.join(' ');
  const key = ROOM_MATERIALS[name] ? name : ALIASES[spaced] || (ROOM_MATERIALS[name.replace(/s$/, '')] ? name.replace(/s$/, '') : null);
  if (key) { R.materials[key] = ROOM_MATERIALS[key]; return key; }
  const hex = ctx.reg.colors.get(spaced) || ctx.reg.colors.get(name);
  if (hex) { const k = `paint-${name}`; R.materials[k] = { base: hexToLinear(hex), rough: 1.0 }; return k; }
  ctx.err(`unknown material "${spaced}"`, ctx.suggest(name, [...Object.keys(ROOM_MATERIALS), ...ctx.reg.colors.keys()]) || 'use a room material or a #hex colour');
}

// One statement's modifiers. Keywords start a new phrase even without a comma: "against the west wall in green velvet".
function mods(ctx, toks) {
  const m = {};
  const parts = [];
  for (const c of clauses(toks)) {
    let cur = [];
    c.forEach((x, i) => {
      const prev = c[i - 1];
      const startsHere = x.t === 'word' && KEYS.has(x.v) && cur.length && !isWord(prev, 'looking') && !(isWord(x, 'at') && isWord(prev, 'looking'));
      if (startsHere) { parts.push(cur); cur = []; }
      cur.push(x);
    });
    if (cur.length) parts.push(cur);
  }
  for (const raw of parts) {
    const p = dropArticles(raw);
    const [a, b] = p, words = p.filter(x => x.t === 'word').map(x => x.v), nums = p.filter(x => x.t === 'num');
    const name = (ws) => ws.join('-');
    if (isWord(a, 'called', 'named')) { m.name = p[1]?.t === 'str' ? p[1].v.toLowerCase().replace(/[^a-z0-9]+/g, '-') : name(words.slice(1)); continue; }
    if (isWord(a, 'in') && isWord(b, 'front')) { m.front = name(words.slice(3)); continue; }               // in front of the sofa
    if (isWord(a, 'in', 'on', 'against') && WALLS.includes(b?.v) && isWord(p[2], 'wall')) { m.wall = b.v; continue; }
    if (isWord(a, 'on', 'at', 'over') && words.includes('window')) { const w = words.find(x => WALLS.includes(x)); if (w) m.wall = w; else if (words.length > 2) m.window = name(words.slice(1)); continue; }
    if (isWord(a, 'against') || (isWord(a, 'on') && words.includes('wall'))) { m.wall = words.find(w => WALLS.includes(w)) || ctx.err('which wall?'); continue; }
    if (isWord(a, 'in')) { m.material = material(ctx, p.slice(1)); continue; }
    if (isWord(a, 'with') && words.at(-1) === 'legs') { m.legs = material(ctx, p.slice(1, -1)); continue; }
    if (isWord(a, 'facing')) { m.facing = name(words.slice(1)); continue; }
    if (isWord(a, 'over', 'above')) { m.over = name(words.slice(1)); continue; }
    if (isWord(a, 'under', 'beneath')) { m.under = name(words.slice(1)); continue; }
    if (isWord(a, 'at')) { m.at = nums.map(metres); continue; }
    if (isWord(a, 'from')) { m.from = nums.map(metres); continue; }
    if (isWord(a, 'looking', 'towards', 'toward')) {
      const key = 'looking';
      m[key] = nums.length >= 2 ? nums.map(metres) : name(words.filter(w => !['looking', 'at', 'towards', 'toward'].includes(w)));
      continue;
    }
    if (a?.t === 'num') {
      if (a.unit === 'mm' && a.v >= 10 && (!b || isWord(b, 'lens'))) { m.lens = a.v; continue; }          // 28 mm, 28 mm lens
      if (isWord(b, 'by', 'x') && p[2]?.t === 'num') { m.size = [metres(a), metres(p[2])]; if (isWord(p[3], 'by') && p[4]?.t === 'num') m.size3 = metres(p[4]); continue; }
      if (b?.t === 'word') { m[b.v] = metres(a); continue; }                                              // 2.1 long, 1.95 high, 0.4 away
    }
    if (a?.t === 'word' && b?.t === 'num') { m[a.v] = a.v === 'lens' ? b.v : metres(b); continue; }      // sill 0.8, lens 35
    if (p.length && p.every(x => x.t === 'word') && p.length <= 2) { (m.flags ||= new Set()).add(words.join('-')); continue; }   // close, portrait, front on
    ctx.err(`can't read "${raw.map(show).join(' ')}"`, 'see the room words in the reference');
  }
  return m;
}
