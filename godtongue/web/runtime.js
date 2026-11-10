// Web renderer runtime (Morgana P1 thin slice). Reads window.SCENE (from engines/web.js).
// Build: every step's mask is composited into five maps (colour, material, height up, height down, flakes).
// Light: one WebGL2 pass turns the maps into pixels each frame, so tilt is real lighting.
(async () => {
  const S = window.SCENE, { W, H } = S, HMAX = 0.4;            // mm that maps to 255 in a height map
  const hud = document.getElementById('hud');
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const load = (src) => { const i = new Image(); i.src = src; return i.decode().then(() => i); };
  const tmp = mk(), tx = tmp.getContext('2d');
  // the mask filled with a colour or an image, on a scratch canvas
  const tint = (mask, fill) => {
    tx.globalCompositeOperation = 'copy'; tx.filter = 'none'; tx.drawImage(mask, 0, 0, W, H);
    tx.globalCompositeOperation = 'source-in';
    if (typeof fill === 'string') { tx.fillStyle = fill; tx.fillRect(0, 0, W, H); } else fill(tx);
    return tmp;
  };
  const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
  const grey = (mm) => { const v = Math.min(255, mm / HMAX * 255); return rgb(v, v, v); };

  async function buildSide(steps) {
    const t0 = performance.now();
    const col = mk(), mr = mk(), up = mk(), dn = mk(), fx = mk();
    const [c, m, u, d, f] = [col, mr, up, dn, fx].map(k => k.getContext('2d'));
    for (const k of [u, d, f]) { k.fillStyle = '#000'; k.fillRect(0, 0, W, H); }
    // the blank
    const body = (k, fill) => { k.fillStyle = fill; k.beginPath(); k.roundRect(S.rect[0], S.rect[1], S.rect[2], S.rect[3], S.r); k.fill(); };
    body(c, S.stock.color); body(m, rgb(255, S.stock.rough * 255, 0));
    const imgs = await Promise.all(steps.map(s => Promise.all([load(s.mask), s.image ? load(s.image.src) : null])));
    const tDecode = performance.now();
    const put = (k, mask, fill, op = 'source-over', blur = 0) => { const t = tint(mask, fill); k.globalCompositeOperation = op; k.filter = blur ? `blur(${blur}px)` : 'none'; k.drawImage(t, 0, 0); k.filter = 'none'; k.globalCompositeOperation = 'source-over'; };
    steps.forEach((s, i) => {
      const [mask, photo] = imgs[i], p = s.params;
      switch (s.op) {
        case 'plate': case 'foil': case 'enamel':
          put(c, mask, s.mat.color); put(m, mask, rgb(s.mat.metal * 255, s.mat.rough * 255, 0)); break;
        case 'emboss': put(u, mask, grey(p.height_mm ?? .1), 'lighter', 1 + (p.soft ?? .5) * 5); break;
        case 'deboss': put(d, mask, grey(p.depth_mm ?? .08), 'lighter', 2.5); break;
        case 'engrave': put(d, mask, grey(p.depth_mm ?? .05), 'lighter', 1.2); break;
        case 'etch': put(m, mask, rgb(0, 110, 0), 'lighter'); break;
        case 'print': case 'illustrate': {
          const [x, y, w, h] = s.image.rect, [fxx, fyy] = s.image.focus;
          const k = Math.max(w / photo.width, h / photo.height), dw = photo.width * k, dh = photo.height * k;
          put(c, mask, (g) => g.drawImage(photo, x - (dw - w) * fxx, y - (dh - h) * fyy, dw, dh), s.image.onFoil ? 'multiply' : 'source-over');
          if (!s.image.onFoil) put(m, mask, rgb(0, 95, 0));
          break;
        }
        case 'spray':
          if (s.kind === 'gloss') put(m, mask, rgb(0, 0, 255), 'lighter');
          else if (s.kind === 'glitter' || s.kind === 'metalflake') put(f, mask, rgb(Math.min(255, (p.density ?? .35) * 255 + 60), Math.min(255, (p.flake_um ?? 200) / 2), 0), 'lighter');
          else if (s.kind === 'candy') put(c, mask, [].concat(p.color || '#c4121e')[0], 'multiply');
          else if (s.kind === 'matte') put(m, mask, rgb(0, 90, 0), 'lighter');
          break;
      }
    });
    return { maps: [col, mr, up, dn, fx], ms: performance.now() - t0, decodeMs: tDecode - t0 };
  }

  // ── light
  const cv = document.getElementById('gl'); cv.width = W; cv.height = H;
  const gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) { hud.textContent = 'WebGL2 is not available in this browser.'; return; }
  const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p * .5 + .5; uv.y = 1. - uv.y; gl_Position = vec4(p, 0, 1); }`;
  const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D uCol, uMR, uUp, uDn, uFx; uniform vec2 uPx, uTilt; uniform vec3 uBench; uniform float uRelief;
float hgt(vec2 q){ return texture(uUp, q).r - texture(uDn, q).r; }
float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
// studio: a dim room, two long softboxes on the diagonal and a fill from above; wider when the surface is rougher
float env(vec3 r, float rough){
  float w = .07 + rough * .55, a = dot(r.xy, normalize(vec2(1., .55)));
  float s1 = exp(-pow((a - .22) / w, 2.)), s2 = .55 * exp(-pow((a + .42) / (w * 1.5), 2.));
  float top = .35 * smoothstep(-.2, 1., r.y);
  return .10 + (s1 * 1.9 + s2 + top) / (1. + rough * 2.2);
}
vec3 srgb(vec3 c){ return pow(clamp(c, 0., 1.), vec3(1. / 2.2)); }
void main(){
  vec4 col = texture(uCol, uv); vec3 mr = texture(uMR, uv).rgb; vec4 fx = texture(uFx, uv);
  if (col.a < .5) { o = vec4(uBench, 1); return; }
  vec3 base = pow(col.rgb, vec3(2.2));
  float metal = mr.r, rough = clamp(mr.g, .03, 1.), coat = mr.b;
  float hx = hgt(uv + vec2(uPx.x, 0.)) - hgt(uv - vec2(uPx.x, 0.)), hy = hgt(uv + vec2(0., uPx.y)) - hgt(uv - vec2(0., uPx.y));
  vec3 n = normalize(vec3(-hx * uRelief, hy * uRelief, 1.));
  vec3 flat_n = vec3(0, 0, 1);
  // glitter: each flake is a tiny mirror with its own tilt
  float flake = 0.;
  if (fx.r > .02) { float sz = max(2., fx.g * 2. * 255. / 50.); vec2 cell = floor(uv / uPx / sz); float on = step(1. - fx.r * .8, hash(cell + 7.));
    vec3 fn = normalize(vec3(hash(cell) - .5, hash(cell + 3.) - .5, .9)); flake = on; n = normalize(mix(n, fn, on)); rough = mix(rough, .04, on); metal = max(metal, on); }
  mat2 rx = mat2(cos(uTilt.y), -sin(uTilt.y), sin(uTilt.y), cos(uTilt.y)), ry = mat2(cos(uTilt.x), -sin(uTilt.x), sin(uTilt.x), cos(uTilt.x));
  vec3 nt = n; nt.yz = rx * nt.yz; nt.xz = ry * nt.xz;
  vec3 ft = flat_n; ft.yz = rx * ft.yz; ft.xz = ry * ft.xz;
  vec3 V = vec3(0, 0, 1), R = reflect(-V, nt), L = normalize(vec3(.35, .6, .75));
  float e = env(R, rough), ndl = max(dot(nt, L), 0.);
  vec3 metalc = base * e * 1.25;
  vec3 diel = base * (.30 + .85 * ndl) + vec3(.03) * max(e - .3, 0.);
  vec3 c = mix(diel, metalc, metal);
  // gloss coat: a second, sharp reflection off the flat lacquer
  float ce = env(reflect(-V, normalize(mix(ft, nt, .25))), .03); c += coat * .05 * max(ce - .45, 0.);
  c += flake * base * .6 * pow(max(dot(R, L), 0.), 40.);
  // cheap contact shadow in the engraved and stepped edges
  c *= 1. - clamp(length(vec2(hx, hy)) * 2.2, 0., .55) * (1. - metal * .5);
  o = vec4(srgb(c), 1);
}`;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.bindAttribLocation(pr, 0, 'p'); gl.vertexAttribPointer(gl.getAttribLocation(pr, 'p'), 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(pr, n);
  const NAMES = ['uCol', 'uMR', 'uUp', 'uDn', 'uFx'];
  const upload = (maps) => maps.map((cvs, i) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cvs);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; });
  const bench = [1, 3, 5].map(i => Math.pow(parseInt(S.bench.slice(i, i + 2), 16) / 255, 1));
  gl.uniform2f(U('uPx'), 1 / W, 1 / H); gl.uniform3f(U('uBench'), ...bench); gl.uniform1f(U('uRelief'), 9.0);

  const built = {}, names = Object.keys(S.sides).filter(k => S.sides[k].length);
  let side = names[0], tilt = [0, 0], manual = false, frames = 0, t0 = performance.now();
  const show = async (k) => {
    if (!built[k]) { const b = await buildSide(S.sides[k]); const u0 = performance.now(); b.tex = upload(b.maps); b.ms += performance.now() - u0; built[k] = b; }
    side = k; built[k].tex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(U(NAMES[i]), i); });
  };
  await show(side);
  const draw = (now) => {
    if (!manual) tilt = [Math.sin(now / 1400) * .35, Math.cos(now / 1900) * .18];
    gl.uniform2f(U('uTilt'), tilt[0], tilt[1]); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); frames++;
    requestAnimationFrame(draw);
  };
  window.__gt = { buildMs: built[side].ms, decodeMs: built[side].decodeMs, steps: S.sides[side].length, setTilt: (x, y) => { manual = true; tilt = [x, y]; }, show, fps: () => frames / ((performance.now() - t0) / 1000) };
  hud.textContent = `${S.name} · ${side} · built in ${built[side].ms.toFixed(0)} ms (${S.sides[side].length} steps)` + (S.unsupported.length ? ` · skipped: ${S.unsupported.join(', ')}` : '');
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); manual = true; tilt = [((e.clientX - r.left) / r.width - .5) * 1.1, ((e.clientY - r.top) / r.height - .5) * .7]; });
  cv.addEventListener('pointerleave', () => { manual = false; });
  // flip: both sides are built up front; the card turns about its vertical axis and swaps maps edge-on
  const label = () => { hud.textContent = `${S.name} · ${side} · built in ${built[side].ms.toFixed(0)} ms (${S.sides[side].length} steps)`; };
  let flipping = false;
  const flip = async () => {
    if (flipping || names.length < 2) return; flipping = true;
    const next = names[(names.indexOf(side) + 1) % names.length];
    if (!built[next]) { hud.textContent = 'building the other side…'; await prebuild; }
    const t0f = performance.now(), dur = 760; let swapped = false;
    await new Promise(done => { const step = (now) => {
      const t = Math.min(1, (now - t0f) / dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2, a = e * 180;
      if (a >= 90 && !swapped) { swapped = true; show(next); }
      cv.style.transform = `rotateY(${a < 90 ? a : a - 180}deg)`;
      if (t < 1) requestAnimationFrame(step); else { cv.style.transform = ''; done(); }
    }; requestAnimationFrame(step); });
    label(); flipping = false;
  };
  const prebuild = (async () => { for (const k of names) if (!built[k]) { const b = await buildSide(S.sides[k]); b.tex = upload(b.maps); built[k] = b; } await show(side); })();
  if (names.length > 1) { const b = document.getElementById('flip'); b.hidden = false; b.onclick = flip; cv.addEventListener('dblclick', flip); window.__gt.flip = flip; }
  requestAnimationFrame(draw);
})().catch(e => { document.getElementById('hud').textContent = 'web renderer error: ' + e.message; window.__gtError = e.message; });
