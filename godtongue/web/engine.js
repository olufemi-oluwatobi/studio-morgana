// Web engine runtime (Morgana order 0.2: the one renderer). Reads window.SCENE from engines/web.js.
// Every document is a list of elements. An element has one or more faces (a stage element has one; a card
// has front and back). Each face is built in its own local maps (colour, material, height up, height down,
// silhouette, shadow, flakes), then every element is drawn in stack order: soft shadow from its height,
// its edge band from its thickness, then its lit surface. Cards flip about their vertical axis in the vertex
// shader and show the back face once they have turned past edge-on.
(async () => {
  const S = window.SCENE, { W, H } = S, PXMM = 4, HMAX = 0.4;
  const hud = document.getElementById('hud');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const load = (src) => { const i = new Image(); i.src = src; return i.decode().then(() => i); };
  const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  const grey = (mm) => { const v = Math.min(255, mm / HMAX * 255); return rgb(v, v, v); };

  // ── outline: rect, rounded or circle; torn and deckle edges eat into the sheet with a random walk.
  // rect origin: e.rect = [x, y, w, h] when the body sits inside the element's box (cards); else the whole box.
  function outline(e, rnd) {
    const [bx, by, w, h] = e.rect || [0, 0, e.size[0], e.size[1]], p = new Path2D();
    if (e.outline === 'circle') { p.arc(bx + w / 2, by + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; }
    const style = e.edge.style, side = e.edge.side, rough = style === 'torn' ? 7 : style === 'deckle' ? 2.6 : 0;
    if (!rough || bx || by) { p.roundRect(bx, by, w, h, e.corners || (e.body.family === 'metal' ? 6 : e.body.family === 'card' ? 3 : 0)); return p; }
    const edge = (x0, y0, x1, y1, nx, ny, on) => {
      const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / 3)); let walk = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n; walk = walk * .8 + (rnd() - .5) * rough * .9;
        const d = on ? Math.abs(walk) + rnd() * rough * .35 + (style === 'torn' && rnd() < .04 ? rnd() * rough : 0) : 0;
        p.lineTo(x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d);
      }
    };
    p.moveTo(0, 0);
    edge(0, 0, w, 0, 0, 1, side === 'all' || side === 'top');
    edge(w, 0, w, h, -1, 0, side === 'all' || side === 'right');
    edge(w, h, 0, h, 0, -1, side === 'all' || side === 'bottom');
    edge(0, h, 0, 0, 1, 0, side === 'all' || side === 'left');
    p.closePath(); return p;
  }

  // ── paint spray: droplets around the gun's path into a coverage buffer; alpha = 1 - exp(-k * coverage)
  function sprayCoat(e, s, stencil, rnd) {
    const [w, h] = e.size, p = s.params, col = s.mat.color;
    const r = { fine: .7, medium: 1.3, coarse: 2.6 }[p.nozzle], area = Math.PI * r * r;
    const sigma = Math.max(8, p.away_cm * PXMM * 1.5), step = Math.max(3, sigma / 12), gap = sigma * .9;
    const acc = new Float32Array(w * h);
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.2832 * rnd());
    const path = [];
    if (p.sweep === 'horizontal') for (let y = -sigma * .5; y <= h + sigma * .5; y += gap) for (let x = -sigma; x <= w + sigma; x += step) path.push([x, y]);
    else if (p.sweep === 'vertical') for (let x = -sigma * .5; x <= w + sigma * .5; x += gap) for (let y = -sigma; y <= h + sigma; y += step) path.push([x, y]);
    else { const cx = /right/.test(p.sweep) ? w : 0, cy = /bottom/.test(p.sweep) ? h : 0; for (let k = 0; k < 400; k++) path.push([cx, cy]); }
    const per = Math.max(1, Math.round(.5 * step * gap / area * p.pressure));
    const spread = /left|right/.test(p.sweep) && p.sweep !== 'horizontal' ? Math.max(w, h) * .55 : sigma;
    for (let pass = 0; pass < p.passes; pass++) for (const [gx, gy] of path) for (let k = 0; k < per; k++) {
      const x = gx + gauss() * spread, y = gy + gauss() * spread, rr = r * (.6 + rnd() * .8);
      if (x < -rr || y < -rr || x >= w + rr || y >= h + rr) continue;
      if (rr < 1.1) { const i = (y | 0) * w + (x | 0); if (x >= 0 && y >= 0 && x < w && y < h) acc[i] += Math.PI * rr * rr; continue; }
      const R = Math.ceil(rr);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue; const X = (x + dx) | 0, Y = (y + dy) | 0;
        if (X >= 0 && Y >= 0 && X < w && Y < h) acc[Y * w + X] += 1;
      }
    }
    // droplet grain: blend each pixel toward its local average; fine nozzles read as mist, coarse as spatter
    const grain = { fine: .12, medium: .3, coarse: .75 }[p.nozzle];
    const ac = mk(w, h), ax = ac.getContext('2d'), ai = ax.createImageData(w, h);
    for (let i = 0; i < w * h; i++) ai.data[i * 4 + 3] = Math.min(255, acc[i] * 40);
    ax.putImageData(ai, 0, 0);
    const bl = mk(w, h), bx = bl.getContext('2d'); bx.filter = `blur(${2 + r * 2}px)`; bx.drawImage(ac, 0, 0);
    const mean = bx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) { const mu = mean[i * 4 + 3] / 40; acc[i] = mu + (Math.min(acc[i], 6.3) - mu) * grain; }
    const st = stencil.getContext('2d').getImageData(0, 0, w, h).data;
    const coat = mk(w, h), cx = coat.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
    const [cr, cg, cb] = [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16));
    for (let i = 0; i < w * h; i++) {
      const a = (1 - Math.exp(-1.8 * Math.max(0, acc[i]))) * st[i * 4 + 3] / 255;
      d[i * 4] = cr; d[i * 4 + 1] = cg; d[i * 4 + 2] = cb; d[i * 4 + 3] = a * 255;
    }
    cx.putImageData(img, 0, 0);
    return coat;
  }

  // ── one face of an element is prepared once (masks, outline, paint coats, drips), then composed at any time t
  async function prepareFace(e, steps, key) {
    const [w, h] = e.size, seed = key === 'front' ? hashStr(e.name) : hashStr(e.name + ':' + key), rnd = rng(seed);
    const P = { e, steps, shape: outline(e, rnd), masks: await Promise.all(steps.map(s => load(s.mask))), coats: [], photos: {}, boxes: {} };
    for (const [i, s] of steps.entries()) {
      if (s.params?.gradient) {            // the box a gradient runs across: where the mask has ink
        const sc = 4, bw = Math.ceil(w / sc), bh = Math.ceil(h / sc), bc = mk(bw, bh), bx = bc.getContext('2d', { willReadFrequently: true });
        bx.drawImage(P.masks[i], 0, 0, bw, bh); const a = bx.getImageData(0, 0, bw, bh).data;
        let x0 = bw, y0 = bh, x1 = -1, y1 = -1;
        for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (a[(y * bw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 >= 0) P.boxes[i] = [x0 * sc, y0 * sc, (x1 - x0 + 1) * sc, (y1 - y0 + 1) * sc];
      }
      if (s.image) P.photos[i] = await load(s.image.src);
      if (s.op === 'spray' && s.kind === 'paint') {
        const p = s.params, sten = mk(w, h), sx = sten.getContext('2d');
        sx.filter = p.soft ? `blur(${Math.max(2, p.away_cm * .8)}px)` : 'none'; sx.drawImage(P.masks[i], 0, 0);
        const coat = sprayCoat(e, s, sten, rng(seed + i * 7919));
        const fin = s.mat.finish, gloss = fin === 'gloss' || fin === 'candy' ? 255 : fin === 'satin' ? 90 : 0;
        const mm = mk(w, h), mx = mm.getContext('2d'); mx.drawImage(coat, 0, 0); mx.globalCompositeOperation = 'source-in';
        mx.fillStyle = rgb(s.mat.metal * 255, s.mat.rough * 255, gloss); mx.fillRect(0, 0, w, h);
        // drips: where the coat is heavy, paint runs down from its lowest edge
        const drips = [];
        if (p.drips) {
          const a = coat.getContext('2d').getImageData(0, 0, w, h).data, dr = rng(seed + i * 31);
          for (let k = 0; k < w / 9; k++) {
            const x = (dr() * w) | 0; let y = -1;
            for (let yy = h - 1; yy > 0; yy--) if (a[(yy * w + x) * 4 + 3] > 150) { y = yy; break; }
            if (y < 0 || dr() < .45) continue;
            drips.push({ x, y: y - 2, len: 18 + dr() ** 2 * 150, wd: 2.5 + dr() * 4.5, delay: dr() * .8 });
          }
        }
        P.coats[i] = { coat, mm, drips, color: s.mat.color };
      }
    }
    // the shadow is the silhouette blurred by height; the maps are colour, material, height up, height down,
    // silhouette, shadow and flakes (glitter and metal flake density and size)
    const sh = mk(w + 160, h + 160), shx = sh.getContext('2d');
    shx.filter = `blur(${2 + e.up_mm * PXMM * .9}px)`; shx.translate(80, 80); shx.fill(P.shape);
    P.maps = [0, 0, 0, 0, 0, 0, 0].map(() => mk(w, h)); P.maps[5] = sh;
    const o = P.maps[4].getContext('2d'); if (e.body.color !== 'none') { o.fillStyle = '#fff'; o.fill(P.shape); }
    return P;
  }

  // how much of a timed coat has been sprayed, as a mask that follows the gun; and where the gun is
  function reveal(P, s, prog) {
    const [w, h] = P.e.size, rv = mk(w, h), r = rv.getContext('2d'), p = s.params, sigma = Math.max(8, p.away_cm * PXMM * 1.5);
    let gun = null;
    if (/top|bottom/.test(p.sweep)) {
      const cx = /right/.test(p.sweep) ? w : 0, cy = /bottom/.test(p.sweep) ? h : 0, R = Math.hypot(w, h) * 1.15 * prog;
      const g = r.createRadialGradient(cx, cy, Math.max(0, R - sigma * 1.2), cx, cy, R + 1);
      g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); r.fillStyle = g; r.fillRect(0, 0, w, h);
      const ang = .55 + Math.sin(prog * 18) * .5; gun = [cx + (cx ? -1 : 1) * Math.cos(ang) * R * .9, cy + (cy ? -1 : 1) * Math.sin(ang) * R * .9];
    } else {
      const vert = p.sweep === 'vertical', L = vert ? w : h, A = vert ? h : w, rows = Math.max(1, Math.ceil(L / (sigma * .9))), rh = L / rows;
      r.fillStyle = '#fff'; r.filter = `blur(${Math.min(14, sigma * .25)}px)`;
      for (let i = 0; i < rows; i++) {
        const rp = Math.max(0, Math.min(1, prog * rows - i)); if (!rp) continue;
        const ltr = i % 2 === 0, len = rp * (A + 40), x0 = ltr ? -20 : A + 20 - len;
        if (vert) r.fillRect(i * rh - 6, x0, rh + 12, len); else r.fillRect(x0, i * rh - 6, len, rh + 12);
        if (rp < 1) { const at = ltr ? x0 + len : x0; gun = vert ? [i * rh + rh / 2, at] : [at, i * rh + rh / 2]; }
      }
    }
    return { rv, gun };
  }

  // compose a face at time t into its seven maps
  function compose(P, t) {
    const e = P.e, [w, h] = e.size, B = e.body, rnd = rng(hashStr(e.name) + 99);
    const [col, mr, up, dn, sil, sh, fx] = P.maps, [c, m, u, d, f] = [col, mr, up, dn, fx].map(k => k.getContext('2d'));
    for (const k of [u, d]) { k.globalCompositeOperation = 'source-over'; k.fillStyle = '#000'; k.fillRect(0, 0, w, h); }
    f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, w, h);
    const ink = B.color === 'none';
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h);
    if (!ink) { c.fillStyle = B.color; c.fillRect(0, 0, w, h); }
    m.fillStyle = rgb(B.metal * 255, B.rough * 255, 0); m.fillRect(0, 0, w, h);
    if (e.aged > 0) {
      for (let k = 0; k < 14; k++) { const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * w * .35, g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(150,110,50,${.12 * e.aged})`); g.addColorStop(1, 'rgba(150,110,50,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .75);
      v.addColorStop(0, 'rgba(120,85,40,0)'); v.addColorStop(1, `rgba(120,85,40,${.35 * e.aged})`); c.fillStyle = v; c.fillRect(0, 0, w, h);
    }
    const tmp = mk(w, h), tx = tmp.getContext('2d');
    // a layer being revealed: its mask wiped in from a side (as if drawn or written) or faded in
    const revealed = (mask, r) => {
      if (!r || !S.video) return mask;
      const pr = Math.max(0, Math.min(1, (t - r.t0) / r.dur)); if (pr >= 1) return mask; if (pr <= 0) return null;
      const out = mk(w, h), ox = out.getContext('2d'); ox.drawImage(mask, 0, 0); ox.globalCompositeOperation = 'destination-in';
      if (r.from === 'fade') { ox.globalAlpha = pr; ox.fillStyle = '#fff'; ox.fillRect(0, 0, w, h); return out; }
      const horiz = /left|right/.test(r.from), L = horiz ? w : h, edge = 40, pos = pr * (L + edge) - edge;
      const g = horiz ? ox.createLinearGradient(0, 0, w, 0) : ox.createLinearGradient(0, 0, 0, h);
      const a = Math.max(0, Math.min(1, pos / L)), b = Math.max(0, Math.min(1, (pos + edge) / L));
      const fwd = /left|top/.test(r.from);
      if (fwd) { g.addColorStop(0, '#fff'); g.addColorStop(a, '#fff'); g.addColorStop(b, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)'); }
      else { g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1 - b, 'rgba(255,255,255,0)'); g.addColorStop(1 - a, '#fff'); g.addColorStop(1, '#fff'); }
      ox.fillStyle = g; ox.fillRect(0, 0, w, h); return out;
    };
    const tint = (mask, fill) => { tx.globalCompositeOperation = 'copy'; tx.drawImage(mask, 0, 0); tx.globalCompositeOperation = 'source-in'; if (typeof fill === 'string') { tx.fillStyle = fill; tx.fillRect(0, 0, w, h); } else fill(tx); return tmp; };
    const put = (k, mask, fill, op = 'source-over', blur = 0, alpha = 1, dx = 0, dy = 0) => { const tt = tint(mask, fill); k.globalCompositeOperation = op; k.globalAlpha = alpha; k.filter = blur ? `blur(${blur}px)` : 'none'; k.drawImage(tt, dx, dy); k.filter = 'none'; k.globalAlpha = 1; k.globalCompositeOperation = 'source-over'; };
    // a gradient across the area's own box: linear at an angle (0 = left to right, 90 = top to bottom) or radial from its centre
    const gradFill = (gr, box) => (g) => {
      const [x, y, bw, bh] = box || [0, 0, w, h], cx = x + bw / 2, cy = y + bh / 2; let G;
      if (gr.radial) G = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(bw, bh) / 2);
      else { const a = (gr.angle ?? 90) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), half = (Math.abs(ux) * bw + Math.abs(uy) * bh) / 2; G = g.createLinearGradient(cx - ux * half, cy - uy * half, cx + ux * half, cy + uy * half); }
      gr.stops.forEach((c, i) => G.addColorStop(gr.stops.length > 1 ? i / (gr.stops.length - 1) : 0, c));
      g.fillStyle = G; g.fillRect(0, 0, w, h);
    };
    const paper = B.family === 'paper' || B.family === 'card';
    const mists = [];
    for (const [i, s] of P.steps.entries()) {
      const mask = revealed(P.masks[i], s.reveal), p = s.params || {};
      if (!mask) continue;
      switch (s.op) {
        case 'enamel': {
          // a flat colour or a gradient; "opacity" thins it and a blend mode mixes it with what is under it
          const fill = p.gradient ? gradFill(p.gradient, P.boxes[i]) : s.mat.color, al = p.opacity ?? 1;
          if (ink) { put(c, mask, fill, p.blend || 'source-over', 0, al); break; }
          if (paper) put(c, mask, fill, p.blend || 'multiply', 0, al);
          else { put(c, mask, fill, p.blend || 'source-over', 0, al); put(m, mask, rgb(0, s.mat.rough * 255, 0), 'source-over', 0, p.blend ? al * .5 : al); }
          break;
        }
        case 'shadow': {
          // the shadow is knocked out under the area itself, so a see-through fill on top is not darkened by its own shadow
          const sc = mk(w, h), sx = sc.getContext('2d'), tt = tint(mask, p.color || '#000');
          sx.filter = `blur(${p.blur ?? 18}px)`; sx.drawImage(tt, p.dx || 0, p.dy ?? 10); sx.filter = 'none';
          sx.globalCompositeOperation = 'destination-out'; sx.drawImage(mask, 0, 0);
          c.globalCompositeOperation = paper ? 'multiply' : 'source-over'; c.globalAlpha = p.opacity ?? .45; c.drawImage(sc, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
          break;
        }
        case 'glow': for (let k = 0; k < (p.strength || 1); k++) put(c, mask, p.color || '#fff', p.blend || 'screen', p.blur ?? 30, p.opacity ?? 1); break;
        case 'plate': case 'foil': case 'inlay': put(c, mask, s.mat.color); put(m, mask, rgb(s.mat.metal * 255, s.mat.rough * 255, 0)); break;
        case 'emboss': put(u, mask, grey(p.height_mm ?? .1), 'lighter', 1 + (p.soft ?? .5) * 4); break;
        case 'deboss': put(d, mask, grey(p.depth_mm ?? .08), 'lighter', 2); break;
        case 'engrave': put(d, mask, grey(p.depth_mm ?? .05), 'lighter', 1); break;
        case 'etch': put(m, mask, rgb(0, 110, 0), 'lighter'); break;
        case 'print': case 'illustrate': {
          // ink on foil or on paper multiplies into the colour; ink on bare metal sits on top and is matte
          const photo = P.photos[i], [x, y, ww, hh] = s.image.rect, [fx0, fy0] = s.image.focus;
          const k = Math.max(ww / photo.width, hh / photo.height), dw = photo.width * k, dh = photo.height * k;
          const multi = !!s.image.onFoil || paper;
          // adjustments (blur, brightness, contrast, saturation, hue, grayscale, sepia) are applied to the photo itself
          put(c, mask, (g) => { g.filter = s.image.filter || 'none'; g.drawImage(photo, x - (dw - ww) * fx0, y - (dh - hh) * fy0, dw, dh); g.filter = 'none'; }, p.blend || (multi ? 'multiply' : 'source-over'), 0, p.opacity ?? 1);
          if (!multi) put(m, mask, rgb(0, 95, 0));
          break;
        }
        case 'spray': {
          if (s.kind !== 'paint') {
            if (s.kind === 'gloss') put(m, mask, rgb(0, 0, 255), 'lighter');
            else if (s.kind === 'matte') put(m, mask, rgb(0, 90, 0), 'lighter');
            else if (s.kind === 'glitter' || s.kind === 'metalflake') put(f, mask, rgb(Math.min(255, (p.density ?? .35) * 255 + 60), Math.min(255, (p.flake_um ?? 200) / 2), 0), 'lighter');
            else if (s.kind === 'candy') put(c, mask, [].concat(p.color || '#c4121e')[0], 'multiply');
            break;
          }
          const C = P.coats[i], timed = p.t0 != null && S.video, prog = timed ? Math.max(0, Math.min(1, (t - p.t0) / (p.dur || 1))) : 1;
          if (prog <= 0) break;
          let coat = C.coat, mmap = C.mm;
          if (prog < 1) {
            const { rv, gun } = reveal(P, s, prog);
            const a = mk(w, h), ax = a.getContext('2d'); ax.drawImage(C.coat, 0, 0); ax.globalCompositeOperation = 'destination-in'; ax.drawImage(rv, 0, 0);
            const b = mk(w, h), bx = b.getContext('2d'); bx.drawImage(C.mm, 0, 0); bx.globalCompositeOperation = 'destination-in'; bx.drawImage(rv, 0, 0);
            coat = a; mmap = b; if (gun) mists.push({ gun, color: C.color, r: Math.max(18, p.away_cm * PXMM * 1.1) });
          }
          c.drawImage(coat, 0, 0); m.drawImage(mmap, 0, 0);
          // drips start once the gun has passed and keep running for a moment
          if (C.drips.length) {
            const tEnd = timed ? p.t0 + (p.dur || 1) * .7 : -1e9;
            for (const k of [c, m]) { k.lineCap = 'round'; }
            for (const dp of C.drips) {
              const g = timed ? Math.max(0, Math.min(1, (t - tEnd - dp.delay) / 1.8)) : 1; if (!g) continue;
              const L = dp.len * (1 - (1 - g) ** 2.2);
              c.strokeStyle = C.color; c.lineWidth = dp.wd; c.beginPath(); c.moveTo(dp.x, dp.y); c.lineTo(dp.x, dp.y + L); c.stroke();
              c.fillStyle = C.color; c.beginPath(); c.arc(dp.x, dp.y + L, dp.wd * .75, 0, 6.2832); c.fill();
              m.strokeStyle = rgb(0, 20, 255); m.lineWidth = dp.wd; m.beginPath(); m.moveTo(dp.x, dp.y); m.lineTo(dp.x, dp.y + L); m.stroke();
            }
          }
          break;
        }
      }
    }
    // the mist where the gun is spraying right now
    for (const ms of mists) { const g = c.createRadialGradient(ms.gun[0], ms.gun[1], 0, ms.gun[0], ms.gun[1], ms.r);
      g.addColorStop(0, ms.color + '88'); g.addColorStop(1, ms.color + '00'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
    if (ink) { const o = P.maps[4].getContext('2d'); o.globalCompositeOperation = 'copy'; o.drawImage(col, 0, 0); o.globalCompositeOperation = 'source-in'; o.fillStyle = '#fff'; o.fillRect(0, 0, w, h); o.globalCompositeOperation = 'source-over'; }
    return P.maps;
  }

  // ── GL
  const cv = document.getElementById('gl'); cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) { hud.textContent = 'WebGL2 is not available in this browser.'; return; }
  const VS = `#version 300 es
in vec2 p; out vec2 uv;
uniform vec2 uStage, uAt, uSize, uOff, uCam; uniform float uTurn, uFlip, uMirror, uPad, uZoom, uScale; uniform int uScreen;
void main(){ vec2 sz = (uSize + 2. * uPad) * uScale; uv = p; if (uMirror > .5) uv.x = 1. - uv.x;
  vec2 l = (p - .5) * sz; l.x *= cos(uFlip); float c = cos(uTurn), s = sin(uTurn);
  vec2 q = vec2(c * l.x - s * l.y, s * l.x + c * l.y) + uAt + uOff; if (uScreen == 0) q = (q - uCam) * uZoom + uStage * .5; gl_Position = vec4(q.x / uStage.x * 2. - 1., 1. - q.y / uStage.y * 2., 0, 1); }`;
  const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uCol, uMR, uUp, uDn, uSil, uSh, uFx, uCap; uniform vec2 uSize, uDir, uTilt; uniform vec3 uL; uniform float uHeld; uniform int uMode; uniform float uFibres, uTurn, uThick, uAlpha; uniform vec3 uEdge;
float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 q){ vec2 i = floor(q), f = fract(q); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float hgt(vec2 q){ return texture(uUp, q).r - texture(uDn, q).r; }
// the studio: two softboxes and a fill, in the direction uDir
float env(vec3 r, float rough){ float w = .07 + rough * .55, a = dot(r.xy, uDir);
  float s1 = exp(-pow((a - .22) / w, 2.)), s2 = .55 * exp(-pow((a + .42) / (w * 1.5), 2.)), top = .35 * smoothstep(-.2, 1., r.y);
  return .10 + (s1 * 1.9 + s2 + top) / (1. + rough * 2.2); }
vec3 srgb(vec3 c){ return pow(clamp(c, 0., 1.), vec3(1. / 2.2)); }
void main(){
  if (uMode == 3) { o = texture(uCap, uv); return; }
  if (uMode == 0) { float a = texture(uSh, uv).a; o = vec4(0., 0., 0., a * .42 * uAlpha); return; }
  float sil = texture(uSil, uv).a; if (sil < .01) discard;
  vec4 col = texture(uCol, uv); vec3 base = pow(col.rgb, vec3(2.2));
  if (uMode == 1) { o = vec4(srgb(uEdge), sil * uAlpha); return; }
  vec3 mr = texture(uMR, uv).rgb; float metal = mr.r, rough = clamp(mr.g, .03, 1.), coat = mr.b;
  vec2 px = 1. / uSize;
  float hx = hgt(uv + vec2(px.x, 0.)) - hgt(uv - vec2(px.x, 0.)), hy = hgt(uv + vec2(0., px.y)) - hgt(uv - vec2(0., px.y));
  // paper fibres: fine tooth plus a few long fibres, in colour and in the surface normal
  vec2 fp = uv * uSize;
  float f1 = vnoise(fp / 2.2), f2 = vnoise(vec2(fp.x / 14., fp.y / 3.)), fib = (f1 - .5) * .7 + (f2 - .5) * .5;
  base *= 1. + uFibres * fib * .18;
  hx += uFibres * (vnoise(fp / 2.2 + vec2(.7, 0.)) - f1) * .05; hy += uFibres * (vnoise(fp / 2.2 + vec2(0., .7)) - f1) * .05;
  vec3 n = normalize(vec3(-hx * 9., hy * 9., 1.));
  // glitter and metal flake: each flake is a tiny mirror with its own tilt
  float flake = 0.; vec4 fx = texture(uFx, uv);
  if (fx.r > .02) { float sz = max(2., fx.g * 2. * 255. / 50.); vec2 cell = floor(fp / sz);
    float on = step(1. - fx.r * .8, hash(cell + 7.));
    vec3 fn = normalize(vec3(hash(cell) - .5, hash(cell + 3.) - .5, .9)); flake = on; n = normalize(mix(n, fn, on)); rough = mix(rough, .04, on); metal = max(metal, on); }
  float c = cos(-uTurn), s = sin(-uTurn); n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  // held blanks (cards): the hand tilts the surface, so the lacquer's flat normal turns with it and the gloss
  // sheen moves; the light stays put. Stage elements: the surface is flat and the light moves (uL, uDir).
  vec3 nt = n, ft = vec3(0., 0., 1.);
  if (uHeld > .5) {
    mat2 rx = mat2(cos(uTilt.y), -sin(uTilt.y), sin(uTilt.y), cos(uTilt.y)), ry = mat2(cos(uTilt.x), -sin(uTilt.x), sin(uTilt.x), cos(uTilt.x));
    nt.yz = rx * nt.yz; nt.xz = ry * nt.xz; ft.yz = rx * ft.yz; ft.xz = ry * ft.xz;
  }
  vec3 V = vec3(0, 0, 1), R = reflect(-V, nt), L = uL;
  float e = env(R, rough), ndl = max(dot(nt, L), 0.);
  // the two profiles: a held card is shaded a little darker and lifted by its sheen; a stage element is open
  float k = uHeld;
  vec3 diel = base * mix(.42 + .72 * ndl, .30 + .85 * ndl, k) + vec3(mix(.035, .03, k)) * max(e - mix(.35, .3, k), 0.) * (1. - rough);
  vec3 cc = mix(diel, base * e * 1.25, metal);
  cc += coat * .06 * max(env(reflect(-V, normalize(mix(ft, nt, .25))), .03) - .4, 0.);
  cc += flake * base * .6 * pow(max(dot(R, L), 0.), 40.);
  cc *= 1. - clamp(length(vec2(hx, hy)) * 2., 0., .5) * (1. - metal * .5);
  o = vec4(srgb(cc), sil * uAlpha);
}`;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const pa = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(pa); gl.vertexAttribPointer(pa, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(pr, n);
  // texture units: 0 colour, 1 material, 2 height up, 3 height down, 4 silhouette, 5 shadow, 6 flakes, 7 captions
  const NAMES = ['uCol', 'uMR', 'uUp', 'uDn', 'uSil', 'uSh', 'uFx'], CAP_UNIT = 7;
  const upload = (maps) => maps.map((cvs) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cvs);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; });
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform2f(U('uStage'), W, H); gl.uniform1f(U('uFlip'), 0); gl.uniform1f(U('uMirror'), 0);

  const V = S.video, T = V ? V.seconds : 0, TL = S.timeline || { camera: [], captions: [] };
  const t0 = performance.now();
  // every element, every face: built once, composed once for the start (or every frame when timed)
  // a face is built the first time it is shown: a card's front at load, its back on the first flip
  const built = S.elements.map((e) => ({
    e, flipA: 0, anim: null,
    surf: Object.fromEntries(Object.entries(e.faces).map(([face, steps]) => [face, { steps, P: null, tex: null }])),
  }));
  const primary = (b) => b.surf.front ? 'front' : Object.keys(b.surf)[0];
  const ensure = async (b, face) => {
    const f = b.surf[face]; if (f.tex) return;
    f.P = await prepareFace(b.e, f.steps, face);
    f.tex = upload(compose(f.P, V ? 0 : Infinity));
  };
  await Promise.all(built.map(b => ensure(b, primary(b)).then(() => b.e.flips?.length && b.surf.back && ensure(b, 'back'))));
  const buildMs = performance.now() - t0;
  const bg = [1, 3, 5].map(i => parseInt(S.bench.slice(i, i + 2), 16) / 255);
  const lin = (h) => [1, 3, 5].map(i => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2));
  const norm2 = (x, y) => { const l = Math.hypot(x, y); return [x / l, y / l]; }, norm3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
  const clamp = (x) => Math.max(0, Math.min(1, x)), easeIO = (k) => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const easeOutBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2), easeIn = (k) => k * k * k;
  const EASE = {
    linear: (k) => k, 'ease-in': easeIn, 'ease-out': (k) => 1 - Math.pow(1 - k, 3), overshoot: easeOutBack,
    bounce: (k) => { const n = 7.5625, d = 2.75; return k < 1 / d ? n * k * k : k < 2 / d ? n * (k -= 1.5 / d) * k + .75 : k < 2.5 / d ? n * (k -= 2.25 / d) * k + .9375 : n * (k -= 2.625 / d) * k + .984375; },
    elastic: (k) => k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - .75) * 2.0944) + 1,
  };
  const FLIP_MS = 760;
  // the moments maps must be rebuilt: coats, drips and reveals
  const allSteps = S.elements.flatMap(e => Object.values(e.faces).flat());
  const windows = allSteps.flatMap(s => [s.params?.t0 != null ? [s.params.t0, s.params.t0 + (s.params.dur || 1) + (s.params.drips ? 2.6 : 0)] : null, s.reveal ? [s.reveal.t0, s.reveal.t0 + s.reveal.dur] : null].filter(Boolean));
  const busy = (t) => windows.some(([a, b]) => t >= a - .05 && t <= b + .05);
  const DIRS = { bottom: [0, 1], top: [0, -1], left: [-1, 0], right: [1, 0] };
  // where an element is at time t: its entrance, its glides and its exit
  function pose(e, t) {
    const q = { x: e.at[0], y: e.at[1], turn: e.turn || 0, scale: e.scale ?? 1, alpha: 1, lift: 0 };
    for (const mv of (e.moves || []).slice().sort((a, b) => a.t0 - b.t0)) {
      if (!V || t <= mv.t0) { if (V) break; }
      const k = V ? (EASE[mv.ease] || easeIO)(clamp((t - mv.t0) / mv.dur)) : 1;
      if (mv.to) { q.x += (mv.to[0] - q.x) * k; q.y += (mv.to[1] - q.y) * k; }
      if (mv.turn != null) q.turn += (mv.turn - q.turn) * k; if (mv.scale != null) q.scale += (mv.scale - q.scale) * k;
      q.lift = Math.max(q.lift, Math.sin(Math.PI * clamp((t - mv.t0) / mv.dur)) * 4);
    }
    if (!V) return q;
    // fades: an element that fades in starts invisible; each fade moves its opacity to 1 or 0
    if (e.fades?.length) { const fs = e.fades.slice().sort((a, b) => a.t0 - b.t0); let al = fs[0].to === 1 ? 0 : 1;
      for (const f of fs) { if (t <= f.t0) break; al += (f.to - al) * clamp((t - f.t0) / (f.dur || .001)); }
      q.alpha = al; if (al <= 0) return null; }
    const en = e.enter, ex = e.exit;
    if (en) {
      if (t < en.t0) return null;
      if (en.style === 'slam') { const k = clamp((t - en.t0) / .2); q.scale *= 1 + 1.3 * (1 - easeIn(k)); q.alpha *= clamp(k * 4); const after = t - en.t0 - .2; if (after > 0) q.scale *= 1 + .05 * Math.sin(after * 40) * Math.exp(-after * 14); q.lift = 10 * (1 - k); }
      else { const k = clamp((t - en.t0) / .75), d = DIRS[en.from] || DIRS.bottom, dist = (d[0] ? W : H) * .9, back = 1 - easeOutBack(k);
        q.x += d[0] * dist * back; q.y += d[1] * dist * back; q.turn += back * 7 * (d[0] || 1); q.lift = Math.max(q.lift, 8 * (1 - k)); }
    }
    if (ex && t >= ex.t0) { const k = easeIn(clamp((t - ex.t0) / .55)); if (k >= 1) return null; const d = DIRS[ex.to] || DIRS.left, dist = (d[0] ? W : H) * 1.05;
      q.x += d[0] * dist * k; q.y += d[1] * dist * k; q.turn -= k * 6 * (d[0] || 1); q.lift = Math.max(q.lift, 8 * k); }
    return q;
  }
  function camera(t) {
    const c = { x: W / 2, y: H / 2, zoom: 1 };
    if (!V) return c;
    if (!TL.camera.length) { c.zoom = 1 + .04 * (t / T); return c; }
    for (const k of TL.camera.slice().sort((a, b) => a.t0 - b.t0)) { if (t <= k.t0) break; const e = (EASE[k.ease] || easeIO)(clamp((t - k.t0) / k.dur));
      if (k.to) { c.x += (k.to[0] - c.x) * e; c.y += (k.to[1] - c.y) * e; } if (k.zoom != null) c.zoom += (k.zoom - c.zoom) * e; }
    return c;
  }
  // captions: drawn word by word into a stage-sized layer that sits on top of everything
  const CS = TL.captionStyle || {}, capC = mk(W, H), capX = capC.getContext('2d');
  let capFont = 'sans-serif';
  if (CS.src) { const f = new FontFace('gtcap', `url(${CS.src})`, { weight: String(CS.weight || 500) }); await f.load(); document.fonts.add(f); capFont = 'gtcap'; }
  const capTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + CAP_UNIT); gl.bindTexture(gl.TEXTURE_2D, capTex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const norm = (w) => w.toLowerCase().replace(/[^a-z0-9σ±+−-]/g, '');
  function drawCaptions(t) {
    capX.clearRect(0, 0, W, H); let any = false;
    const size = CS.size || 60, lh = size * 1.18, maxW = W * .84, y0 = CS.y ?? H * .8;
    capX.font = `${CS.weight || 500} ${size}px ${capFont}, sans-serif`; capX.textBaseline = 'alphabetic';
    for (const cp of TL.captions) {
      if (t < cp.t0 || t > cp.t0 + cp.dur + .25) continue; any = true;
      const words = cp.text.split(/\s+/), hl = new Array(words.length).fill(null);
      for (const mk_ of cp.marks) { const mw = mk_.text.split(/\s+/).map(norm); for (let i = 0; i + mw.length <= words.length; i++) if (mw.every((w, j) => norm(words[i + j]) === w)) for (let j = 0; j < mw.length; j++) hl[i + j] = mk_.color; }
      const lines = [[]]; let lw = 0; const sp = capX.measureText(' ').width;
      words.forEach((w, i) => { const ww = capX.measureText(w).width; if (lw + ww > maxW && lines.at(-1).length) { lines.push([]); lw = 0; } lines.at(-1).push(i); lw += ww + sp; });
      const per = Math.min(.32, cp.dur * .55 / words.length), out = clamp((cp.t0 + cp.dur + .25 - t) / .25);
      lines.forEach((ln, li) => {
        const width = ln.reduce((a, i) => a + capX.measureText(words[i]).width, 0) + sp * (ln.length - 1);
        let x = (W - width) / 2; const y = y0 + (li - (lines.length - 1) / 2) * lh;
        for (const i of ln) {
          const k = clamp((t - cp.t0 - i * per) / .14), ww = capX.measureText(words[i]).width;
          if (k > 0) { capX.globalAlpha = k * out; capX.fillStyle = hl[i] || CS.color || '#1d1b18'; capX.fillText(words[i], x, y + (1 - k) * 14); }
          x += ww + sp;
        }
      });
    }
    capX.globalAlpha = 1; return any;
  }
  // which face an element shows: the back once it has turned past edge-on (and is built)
  const faceOf = (b, angle) => {
    if (b.surf.back?.tex && Math.cos(angle * Math.PI / 180) < 0) return 'back';
    return primary(b);
  };
  // in a video, a placed card turns over at each scheduled flip (180 degrees, eased); otherwise the hand turns it
  const angleAt = (b, t) => {
    if (!V || !b.e.flips?.length) return b.flipA;
    let a = 0;
    for (const f of b.e.flips) if (t >= f.t0) a += 180 * easeIO(clamp((t - f.t0) / f.dur));
    return a;
  };
  const refresh = (t) => { for (const b of built) for (const k of Object.keys(b.surf)) { const f = b.surf[k]; if (!f.tex) continue; const maps = compose(f.P, t); [0, 1, 2, 3, 4, 6].forEach((i) => { gl.bindTexture(gl.TEXTURE_2D, f.tex[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maps[i]); }); } };
  // bare: no background, no cast shadow, no edge band; alpha is the silhouette (clean cut-outs for posters)
  let bare = false;
  let light = [0, 0], manual = false, frames = 0, tf = performance.now(), lastT = -1, lastFace = null;
  // card flips: a half turn about the vertical axis, eased; the face changes edge-on
  const tickFlips = (now) => {
    for (const b of built) if (b.anim) { const k = clamp((now - b.anim.t0) / FLIP_MS); b.flipA = b.anim.from + (b.anim.to - b.anim.from) * easeIO(k); if (k >= 1) b.anim = null; }
  };
  const render = (t, now) => {
    if (V) {
      if (busy(t) || busy(lastT) || lastT < 0 || Math.abs(t - lastT) > .5) refresh(t);
      lastT = t;
      if (!manual) light = [-.35 + Math.sin(t * .4) * .25, -.15 + Math.sin(t * .3) * .08];
    } else if (!manual) light = [Math.sin(now / 2300) * .5, Math.cos(now / 3100) * .3];
    const cam = camera(t);
    gl.uniform2f(U('uCam'), cam.x, cam.y); gl.uniform1f(U('uZoom'), cam.zoom); gl.uniform1i(U('uScreen'), 0);
    if (bare) gl.clearColor(0, 0, 0, 0); else gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    // the two lighting modes (see the shader): a held card tilts with the hand; a stage element is lit by the light
    const Ls = norm3(-.45 + light[0] * .6, .6 - light[1] * .6, .8), Ds = norm2(1 + light[0] * .8, .55 + light[1] * .8);
    const Lh = norm3(.35, .6, .75), Dh = norm2(1, .55);
    for (const b of built) {
      const e = b.e, q = pose(e, t); if (!q) continue;
      const angle = angleAt(b, t), face = faceOf(b, angle), tex = b.surf[face].tex, [w, h] = e.size, turn = q.turn * Math.PI / 180, thick = e.body.thick_mm * PXMM, inkB = e.body.color === 'none';
      const mirror = face === 'back' ? 1 : 0;
      gl.uniform1f(U('uHeld'), e.held ? 1 : 0);
      gl.uniform3f(U('uL'), ...(e.held ? Lh : Ls)); gl.uniform2f(U('uDir'), ...(e.held ? Dh : Ds));
      gl.uniform2f(U('uTilt'), e.held ? light[0] : 0, e.held ? light[1] : 0);
      tex.forEach((tt, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tt); gl.uniform1i(U(NAMES[i]), i); });
      gl.uniform2f(U('uAt'), q.x, q.y); gl.uniform2f(U('uSize'), w, h); gl.uniform1f(U('uTurn'), turn); gl.uniform1f(U('uScale'), q.scale); gl.uniform1f(U('uAlpha'), q.alpha);
      gl.uniform1f(U('uFlip'), angle * Math.PI / 180); gl.uniform1f(U('uFibres'), e.body.fibres || 0);
      const lift = (e.up_mm + q.lift) * PXMM;
      if (!inkB && !bare) { gl.uniform1i(U('uMode'), 0); gl.uniform1f(U('uMirror'), 0); gl.uniform1f(U('uPad'), 80); gl.uniform2f(U('uOff'), lift * (.5 - light[0] * .4), lift * (.8 - light[1] * .4)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
      gl.uniform1f(U('uPad'), 0); gl.uniform1f(U('uMirror'), mirror);
      if (thick > .6 && !bare) {
        const ec = lin(e.body.color).map(v => e.body.family === 'metal' ? Math.min(1, v * 1.6 + .15) : v * .72);
        gl.uniform3f(U('uEdge'), ec[0], ec[1], ec[2]); gl.uniform1i(U('uMode'), 1); gl.uniform2f(U('uOff'), thick * .55, thick * .8); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.uniform1i(U('uMode'), 2); gl.uniform2f(U('uOff'), 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (TL.captions.length && drawCaptions(t)) {
      gl.activeTexture(gl.TEXTURE0 + CAP_UNIT); gl.bindTexture(gl.TEXTURE_2D, capTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, capC);
      gl.uniform1i(U('uCap'), CAP_UNIT); gl.uniform1i(U('uMode'), 3); gl.uniform1i(U('uScreen'), 1); gl.uniform2f(U('uAt'), W / 2, H / 2); gl.uniform2f(U('uSize'), W, H);
      gl.uniform1f(U('uTurn'), 0); gl.uniform1f(U('uFlip'), 0); gl.uniform1f(U('uMirror'), 0); gl.uniform1f(U('uScale'), 1); gl.uniform2f(U('uOff'), 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    frames++;
  };
  gl.uniform1f(U('uZoom'), 1); gl.uniform1f(U('uScale'), 1); gl.uniform1f(U('uAlpha'), 1);
  // playback with a scrub bar for videos
  let playing = true, tPlay = 0, last = performance.now();
  if (V) {
    const bar = document.getElementById('bar'), sc = document.getElementById('scrub'), pb = document.getElementById('play'), tc = document.getElementById('tc');
    bar.hidden = false; pb.onclick = () => { playing = !playing; pb.textContent = playing ? 'Pause' : 'Play'; };
    sc.oninput = () => { playing = false; pb.textContent = 'Play'; tPlay = sc.value / 1000 * T; };
    setInterval(() => { sc.value = Math.round(tPlay / T * 1000); tc.textContent = tPlay.toFixed(1) + ' s'; }, 100);
  }
  const cards = built.filter(b => b.surf.back);
  let flipping = false;
  const flip = async () => {
    if (flipping) return; flipping = true;
    try { for (const b of cards) { await ensure(b, 'back'); if (!b.anim) b.anim = { from: b.flipA, to: b.flipA + 180, t0: performance.now() }; } }
    finally { flipping = false; }
  };
  const show = async (face) => {
    for (const b of built) if (b.surf[face]) { await ensure(b, face); b.anim = null; b.flipA = face === 'back' ? 180 : 0; }
  };
  const updateHud = () => {
    const face = built.length === 1 && !V ? faceOf(built[0], built[0].flipA) : null;
    const key = face || 'stage';
    if (key === lastFace) return; lastFace = key;
    hud.textContent = `${S.name} · ${face ? face + ' · ' : ''}${face ? '' : S.elements.length + ' elements · '}built in ${buildMs.toFixed(0)} ms` +
      (S.unsupported.length ? ` · skipped: ${S.unsupported.join(', ')}` : '');
  };
  const loop = (now) => { const dt = (now - last) / 1000; last = now;
    tickFlips(now);
    if (!window.__capturing) { if (V && playing) tPlay = (tPlay + dt) % T; render(V ? tPlay : 0, now); }
    if (!V) updateHud();
    requestAnimationFrame(loop); };
  window.__gt = {
    frame: (t) => { window.__capturing = true; render(t, 0); gl.finish(); return cv.toDataURL('image/jpeg', .93); },
    // draw one moment into the canvas and stop the live loop; { bare: true } draws only the lit surfaces on transparent
    draw: (t, o = {}) => {
      window.__capturing = true; bare = !!o.bare;
      if (bare) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      try { render(t, 0); gl.finish(); } finally { bare = false; gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      return cv;
    },
    canvas: cv, scene: S,
    dispose: () => { window.__capturing = true; gl.getExtension('WEBGL_lose_context')?.loseContext(); },
    video: V, buildMs, steps: allSteps.length, faces: built.map(b => Object.keys(b.surf)),
    setTilt: (x, y) => { manual = true; light = [x, y]; }, show, flip,
    fps: () => frames / ((performance.now() - tf) / 1000),
  };
  if (cards.length) { const b = document.getElementById('flip'); b.hidden = false; b.onclick = flip; cv.addEventListener('dblclick', flip); }
  updateHud();
  cv.addEventListener('pointermove', (ev) => { const r = cv.getBoundingClientRect(); manual = true; light = [((ev.clientX - r.left) / r.width - .5) * 1.4, ((ev.clientY - r.top) / r.height - .5) * 1.0]; });
  cv.addEventListener('pointerleave', () => { manual = false; });
  requestAnimationFrame(loop);
})().catch(e => { document.getElementById('hud').textContent = 'render error: ' + e.message; window.__gtError = e.message; });
