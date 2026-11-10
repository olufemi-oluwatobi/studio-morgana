// Stage runtime (Morgana element model, first cut). Reads window.SCENE of kind "stage" from engines/web.js.
// Each element is built in its own local maps (colour, material, height, outline) from its body and steps,
// then the stage draws every element in stack order: soft shadow from its height, its edge band from its
// thickness, then its lit surface. Paint sprays deposit droplets into a coverage buffer that builds up per pass.
(async () => {
  const S = window.SCENE, { W, H } = S, PXMM = 4, HMAX = 0.4;
  const hud = document.getElementById('hud');
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const load = (src) => { const i = new Image(); i.src = src; return i.decode().then(() => i); };
  const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hashStr = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
  const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  const grey = (mm) => { const v = Math.min(255, mm / HMAX * 255); return rgb(v, v, v); };

  // ── outline: rect, rounded or circle; torn and deckle edges eat into the sheet with a random walk
  function outline(e, rnd) {
    const [w, h] = e.size, p = new Path2D();
    if (e.outline === 'circle') { p.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); return p; }
    const style = e.edge.style, side = e.edge.side, rough = style === 'torn' ? 7 : style === 'deckle' ? 2.6 : 0;
    if (!rough) { p.roundRect(0, 0, w, h, e.corners || (e.body.family === 'metal' ? 6 : e.body.family === 'card' ? 3 : 0)); return p; }
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

  // ── build one element into local maps
  async function buildElement(e) {
    const t0 = performance.now(), [w, h] = e.size, B = e.body, rnd = rng(hashStr(e.name));
    const [col, mr, up, dn, sil] = [0, 0, 0, 0, 0].map(() => mk(w, h));
    const [c, m, u, d, o] = [col, mr, up, dn, sil].map(k => k.getContext('2d'));
    const shape = outline(e, rnd);
    o.fillStyle = '#fff'; o.fill(shape);
    for (const k of [u, d]) { k.fillStyle = '#000'; k.fillRect(0, 0, w, h); }
    c.fillStyle = B.color; c.fillRect(0, 0, w, h);
    m.fillStyle = rgb(B.metal * 255, B.rough * 255, 0); m.fillRect(0, 0, w, h);
    if (e.aged > 0) {                                  // age: warm blotches and darker edges
      for (let k = 0; k < 14; k++) { const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * w * .35, g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(150,110,50,${.12 * e.aged})`); g.addColorStop(1, 'rgba(150,110,50,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .75);
      v.addColorStop(0, 'rgba(120,85,40,0)'); v.addColorStop(1, `rgba(120,85,40,${.35 * e.aged})`); c.fillStyle = v; c.fillRect(0, 0, w, h);
    }
    const tmp = mk(w, h), tx = tmp.getContext('2d');
    const tint = (mask, fill) => { tx.globalCompositeOperation = 'copy'; tx.drawImage(mask, 0, 0); tx.globalCompositeOperation = 'source-in'; if (typeof fill === 'string') { tx.fillStyle = fill; tx.fillRect(0, 0, w, h); } else fill(tx); return tmp; };
    const put = (k, mask, fill, op = 'source-over', blur = 0) => { const t = tint(mask, fill); k.globalCompositeOperation = op; k.filter = blur ? `blur(${blur}px)` : 'none'; k.drawImage(t, 0, 0); k.filter = 'none'; k.globalCompositeOperation = 'source-over'; };
    const paper = B.family === 'paper' || B.family === 'card';
    for (const [i, s] of e.steps.entries()) {
      const mask = await load(s.mask), p = s.params || {};
      switch (s.op) {
        case 'enamel':                                  // on paper and card, a colour fill is ink: it sits in the fibres
          if (paper) put(c, mask, s.mat.color, 'multiply'); else { put(c, mask, s.mat.color); put(m, mask, rgb(0, s.mat.rough * 255, 0)); }
          break;
        case 'plate': case 'foil': case 'inlay':
          put(c, mask, s.mat.color); put(m, mask, rgb(s.mat.metal * 255, s.mat.rough * 255, 0)); break;
        case 'emboss': put(u, mask, grey(p.height_mm ?? .1), 'lighter', 1 + (p.soft ?? .5) * 4); break;
        case 'deboss': put(d, mask, grey(p.depth_mm ?? .08), 'lighter', 2); break;
        case 'engrave': put(d, mask, grey(p.depth_mm ?? .05), 'lighter', 1); break;
        case 'etch': put(m, mask, rgb(0, 110, 0), 'lighter'); break;
        case 'spray':
          if (s.kind === 'paint') {
            const sten = mk(w, h), sx = sten.getContext('2d');
            sx.filter = p.soft ? `blur(${Math.max(2, p.away_cm * .8)}px)` : 'none'; sx.drawImage(mask, 0, 0);
            const coat = sprayCoat(e, s, sten, rng(hashStr(e.name) + i * 7919));
            c.drawImage(coat, 0, 0);
            const fin = s.mat.finish, gloss = fin === 'gloss' || fin === 'candy' ? 255 : fin === 'satin' ? 90 : 0;
            const mm = mk(w, h), mx = mm.getContext('2d'); mx.drawImage(coat, 0, 0); mx.globalCompositeOperation = 'source-in';
            mx.fillStyle = rgb(s.mat.metal * 255, s.mat.rough * 255, gloss); mx.fillRect(0, 0, w, h); m.drawImage(mm, 0, 0);
          } else if (s.kind === 'gloss') put(m, mask, rgb(0, 0, 255), 'lighter');
          else if (s.kind === 'matte') put(m, mask, rgb(0, 90, 0), 'lighter');
          break;
        case 'print': case 'illustrate': {
          const photo = await load(s.image.src), [x, y, ww, hh] = s.image.rect, [fx, fy] = s.image.focus;
          const k = Math.max(ww / photo.width, hh / photo.height), dw = photo.width * k, dh = photo.height * k;
          put(c, mask, (g) => g.drawImage(photo, x - (dw - ww) * fx, y - (dh - hh) * fy, dw, dh), paper ? 'multiply' : 'source-over');
          break;
        }
      }
    }
    // shadow: the outline, blurred by how high the element sits
    const sh = mk(w + 160, h + 160), shx = sh.getContext('2d');
    shx.filter = `blur(${2 + e.up_mm * PXMM * .9}px)`; shx.translate(80, 80); shx.fill(shape);
    return { maps: [col, mr, up, dn, sil, sh], ms: performance.now() - t0 };
  }

  // ── GL
  const cv = document.getElementById('gl'); cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) { hud.textContent = 'WebGL2 is not available in this browser.'; return; }
  const VS = `#version 300 es
in vec2 p; out vec2 uv;
uniform vec2 uStage, uAt, uSize, uOff; uniform float uTurn, uPad;
void main(){ vec2 sz = uSize + 2. * uPad; uv = p; vec2 l = (p - .5) * sz; float c = cos(uTurn), s = sin(uTurn);
  vec2 q = vec2(c * l.x - s * l.y, s * l.x + c * l.y) + uAt + uOff; gl_Position = vec4(q.x / uStage.x * 2. - 1., 1. - q.y / uStage.y * 2., 0, 1); }`;
  const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uCol, uMR, uUp, uDn, uSil, uSh; uniform vec2 uSize, uLight; uniform int uMode; uniform float uFibres, uTurn, uThick; uniform vec3 uEdge;
float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 q){ vec2 i = floor(q), f = fract(q); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float hgt(vec2 q){ return texture(uUp, q).r - texture(uDn, q).r; }
float env(vec3 r, float rough){ vec2 dir = normalize(vec2(1., .55) + uLight * .8); float w = .07 + rough * .55, a = dot(r.xy, dir);
  float s1 = exp(-pow((a - .22) / w, 2.)), s2 = .55 * exp(-pow((a + .42) / (w * 1.5), 2.)), top = .35 * smoothstep(-.2, 1., r.y);
  return .10 + (s1 * 1.9 + s2 + top) / (1. + rough * 2.2); }
vec3 srgb(vec3 c){ return pow(clamp(c, 0., 1.), vec3(1. / 2.2)); }
void main(){
  if (uMode == 0) { float a = texture(uSh, uv).a; o = vec4(0., 0., 0., a * .42); return; }
  float sil = texture(uSil, uv).a; if (sil < .01) discard;
  vec4 col = texture(uCol, uv); vec3 base = pow(col.rgb, vec3(2.2));
  if (uMode == 1) { o = vec4(srgb(uEdge), sil); return; }
  vec3 mr = texture(uMR, uv).rgb; float metal = mr.r, rough = clamp(mr.g, .03, 1.), coat = mr.b;
  vec2 px = 1. / uSize;
  float hx = hgt(uv + vec2(px.x, 0.)) - hgt(uv - vec2(px.x, 0.)), hy = hgt(uv + vec2(0., px.y)) - hgt(uv - vec2(0., px.y));
  // paper fibres: fine tooth plus a few long fibres, in colour and in the surface normal
  vec2 fp = uv * uSize;
  float f1 = vnoise(fp / 2.2), f2 = vnoise(vec2(fp.x / 14., fp.y / 3.)), fib = (f1 - .5) * .7 + (f2 - .5) * .5;
  base *= 1. + uFibres * fib * .18;
  hx += uFibres * (vnoise(fp / 2.2 + vec2(.7, 0.)) - f1) * .05; hy += uFibres * (vnoise(fp / 2.2 + vec2(0., .7)) - f1) * .05;
  vec3 n = normalize(vec3(-hx * 9., hy * 9., 1.));
  float c = cos(-uTurn), s = sin(-uTurn); n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
  vec3 V = vec3(0, 0, 1), R = reflect(-V, n), L = normalize(vec3(-.45 + uLight.x * .6, .6 - uLight.y * .6, .8));
  float e = env(R, rough), ndl = max(dot(n, L), 0.);
  vec3 diel = base * (.42 + .72 * ndl) + vec3(.035) * max(e - .35, 0.) * (1. - rough);
  vec3 cc = mix(diel, base * e * 1.25, metal);
  cc += coat * .06 * max(env(reflect(-V, normalize(mix(vec3(0, 0, 1), n, .3))), .03) - .4, 0.);
  cc *= 1. - clamp(length(vec2(hx, hy)) * 2., 0., .5) * (1. - metal * .5);
  o = vec4(srgb(cc), sil);
}`;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const pa = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(pa); gl.vertexAttribPointer(pa, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(pr, n);
  const NAMES = ['uCol', 'uMR', 'uUp', 'uDn', 'uSil', 'uSh'];
  const upload = (maps) => maps.map((cvs) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cvs);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; });
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform2f(U('uStage'), W, H);

  const t0 = performance.now();
  const built = await Promise.all(S.elements.map(async (e) => ({ e, ...(await buildElement(e)) })));
  for (const b of built) b.tex = upload(b.maps);
  const buildMs = performance.now() - t0;
  const bg = [1, 3, 5].map(i => parseInt(S.bench.slice(i, i + 2), 16) / 255);
  const lin = (h) => [1, 3, 5].map(i => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2));
  let light = [0, 0], manual = false, frames = 0, tf = performance.now();
  const draw = (now) => {
    if (!manual) light = [Math.sin(now / 2300) * .5, Math.cos(now / 3100) * .3];
    gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U('uLight'), light[0], light[1]);
    for (const b of built) {
      const e = b.e, [w, h] = e.size, turn = (e.turn || 0) * Math.PI / 180, thick = e.body.thick_mm * PXMM;
      b.tex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U(NAMES[i]), i); });
      gl.uniform2f(U('uAt'), e.at[0], e.at[1]); gl.uniform2f(U('uSize'), w, h); gl.uniform1f(U('uTurn'), turn);
      gl.uniform1f(U('uFibres'), e.body.fibres || 0);
      // shadow, pushed away from the light by the element's height
      const lift = e.up_mm * PXMM;
      gl.uniform1i(U('uMode'), 0); gl.uniform1f(U('uPad'), 80); gl.uniform2f(U('uOff'), lift * (.5 - light[0] * .4), lift * (.8 - light[1] * .4)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.uniform1f(U('uPad'), 0);
      // the edge band: the sheet's thickness showing on the side away from the light
      if (thick > .6) {
        const ec = lin(e.body.color).map(v => e.body.family === 'metal' ? Math.min(1, v * 1.6 + .15) : v * .72);
        gl.uniform3f(U('uEdge'), ec[0], ec[1], ec[2]); gl.uniform1i(U('uMode'), 1); gl.uniform2f(U('uOff'), thick * .55, thick * .8); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.uniform1i(U('uMode'), 2); gl.uniform2f(U('uOff'), 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    frames++; requestAnimationFrame(draw);
  };
  window.__gt = { buildMs, steps: S.elements.reduce((a, e) => a + e.steps.length, 0), setTilt: (x, y) => { manual = true; light = [x, y]; }, fps: () => frames / ((performance.now() - tf) / 1000), show: () => {} };
  hud.textContent = `${S.name} · ${S.elements.length} elements · built in ${buildMs.toFixed(0)} ms` + (S.unsupported.length ? ` · skipped: ${S.unsupported.join(', ')}` : '');
  cv.addEventListener('pointermove', (ev) => { const r = cv.getBoundingClientRect(); manual = true; light = [((ev.clientX - r.left) / r.width - .5) * 1.4, ((ev.clientY - r.top) / r.height - .5) * 1.0]; });
  cv.addEventListener('pointerleave', () => { manual = false; });
  requestAnimationFrame(draw);
})().catch(e => { document.getElementById('hud').textContent = 'stage error: ' + e.message; window.__gtError = e.message; });
