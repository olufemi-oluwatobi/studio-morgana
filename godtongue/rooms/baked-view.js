// Draws a baked room with WebGL2. The light was calculated once (bake.py), so each frame is a single cheap draw:
// matte surfaces = albedo * E / pi, metals and the floor's sheen reflect a small 360 probe, lights and the window glow.
// mountBaked(canvas, dir) → Promise<{ frame(walk, i), shot(S), walks, look(yawDelta, pitchDelta), info }>
export async function mountBaked(canvas, dir) {
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) throw new Error('This browser has no WebGL2');
  // geometry and light: raw bake.bin where the host serves it, else the same bytes as base64 text (bake.b64.txt)
  const loadBin = async () => {
    const r = await fetch(`${dir}/bake.bin`).catch(() => null);
    if (r && r.ok) return r.arrayBuffer();
    const t = await (await fetch(`${dir}/bake.b64.txt`)).text(), s = atob(t.trim()), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  };
  const [info, bin] = await Promise.all([fetch(`${dir}/bake.json`).then(r => r.json()), loadBin()]);
  const L = info.layout, M = info.materials;
  const vs = `#version 300 es
    in vec3 a_pos; in vec4 a_nrm; in vec4 a_E; in float a_mat; in vec2 a_uv;
    uniform mat4 u_vp; out vec3 v_pos; out vec3 v_nrm; out vec3 v_E; flat out int v_mat; out vec2 v_uv;
    void main(){ v_pos = a_pos; v_nrm = a_nrm.xyz; v_E = a_E.rgb; v_mat = int(a_mat + .5); v_uv = a_uv; gl_Position = u_vp * vec4(a_pos, 1.); }`;
  const fs = `#version 300 es
    precision highp float; precision highp int;
    in vec3 v_pos; in vec3 v_nrm; in vec3 v_E; flat in int v_mat; in vec2 v_uv; out vec4 o;
    uniform vec3 u_cam; uniform float u_exp; uniform vec3 u_base[64]; uniform vec3 u_emit[64]; uniform vec4 u_par[64]; uniform float u_tile;
    uniform sampler2D u_tex; uniform sampler2D u_view; uniform sampler2D u_probe; uniform vec3 u_room; uniform vec3 u_probeO; uniform int u_debug;
    const float PI = 3.14159265;
    vec3 rgbe(vec4 t){ return t.a == 0. ? vec3(0) : t.rgb * exp2(t.a * 255. - 128.) * (255. / 255.); }
    vec3 boxed(vec3 p, vec3 r){                                      // box projection: where would this reflection hit the room?
      vec3 far = mix(vec3(0.), u_room, step(0., r));
      vec3 t = (far - p) / (abs(r) + 1e-5) * sign(r + 1e-6);
      float tt = min(min(t.x, t.y), t.z);
      return normalize(p + r * max(tt, 0.) - u_probeO);
    }
    vec3 probe(vec3 d){
      float th = atan(-d.x, d.z), ph = asin(clamp(d.y, -1., 1.));
      return rgbe(texture(u_probe, vec2(th / (2. * PI) + .5, .5 - ph / PI)));
    }
    vec3 probeBlur(vec3 r, vec3 n, float rough){                    // a few taps in a cone stand in for rough reflections
      vec3 t = normalize(abs(r.y) < .9 ? cross(r, vec3(0,1,0)) : cross(r, vec3(1,0,0))), b = cross(r, t);
      float s = rough * 1.1; vec3 acc = probe(r);
      for (int k = 0; k < 8; k++) { float a = float(k) * 2.39996; float q = sqrt((float(k) + .5) / 8.) * s; acc += probe(normalize(r + (t * cos(a) + b * sin(a)) * q)); }
      return acc / 9.;
    }
    vec3 aces(vec3 x){ x *= u_exp; return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
    vec3 srgb(vec3 x){ return mix(12.92 * x, 1.055 * pow(x, vec3(1. / 2.4)) - .055, step(.0031308, x)); }
    vec3 lin(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
    void main(){
      vec4 par = u_par[v_mat]; vec3 col;
      if (par.w > 1.5) col = rgbe(texture(u_view, v_uv));                      // the window view
      else if (dot(u_emit[v_mat], vec3(1)) > 0.) col = u_emit[v_mat];          // bulbs
      else {
        vec3 base = par.w > .5 ? lin(texture(u_tex, v_uv / u_tile).rgb) : u_base[v_mat];
        vec3 N = normalize(v_nrm), V = normalize(u_cam - v_pos);
        if (dot(N, V) < 0.) N = -N;
        float nv = max(dot(N, V), 0.); vec3 R = reflect(-V, N);
        R = boxed(v_pos, R);
        if (par.x > .5) col = probeBlur(R, N, par.y) * (base + (1. - base) * pow(1. - nv, 5.));
        else {
          col = base * v_E / PI;
          if (par.z > 0.) { float F = .04 + (max(1. - par.z, .04) - .04) * pow(1. - nv, 5.); col = col * (1. - F) + probeBlur(R, N, par.z) * F; }
        }
      }
      if (u_debug == 1) { float h = fract(sin(float(v_mat) * 12.9898) * 43758.5453); col = vec3(h, fract(h * 7.), fract(h * 13.)); o = vec4(col, 1.); return; }
      if (u_debug == 2) { o = vec4(srgb(aces(v_E / PI)), 1.); return; }
      o = vec4(srgb(aces(col)), 1.);
    }`;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const attr = (name, key, size, type, norm) => {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(bin, L[key].offset, L[key].bytes), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, name); if (loc < 0) return;
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
  };
  attr('a_pos', 'position', 3, gl.FLOAT, false);
  attr('a_nrm', 'normal', 4, gl.BYTE, true);
  attr('a_E', 'light', 4, gl.HALF_FLOAT, false);
  attr('a_mat', 'material', 4, gl.UNSIGNED_BYTE, false);
  attr('a_uv', 'uv', 2, gl.FLOAT, false);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array(bin, L.index.offset, L.index.bytes), gl.STATIC_DRAW);
  const nIdx = L.index.bytes / 4;

  // materials
  const base = new Float32Array(64 * 3), emit = new Float32Array(64 * 3), par = new Float32Array(64 * 4);
  let tile = 2.56, texName = null;
  M.forEach((m, i) => {
    base.set(m.base, i * 3); emit.set(m.emit, i * 3);
    const isView = info.views.length && m.name === 'daylight';
    par.set([m.metal ? 1 : 0, m.rough, m.sheen || 0, isView ? 2 : (info.textures[m.name] ? 1 : 0)], i * 4);
    if (info.textures[m.name]) { texName = info.textures[m.name]; tile = m.texture.tile; }
  });
  const U = (n) => gl.getUniformLocation(pr, n);
  gl.uniform3fv(U('u_base'), base); gl.uniform3fv(U('u_emit'), emit); gl.uniform4fv(U('u_par'), par);
  gl.uniform1f(U('u_tile'), tile); gl.uniform1f(U('u_exp'), info.exposure);
  gl.uniform3fv(U('u_room'), [info.room[0], info.room[1], info.room[2]]); gl.uniform3fv(U('u_probeO'), info.probe.origin);
  const loadTex = async (unit, file, { srgb8 = false, repeat = false } = {}) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 128]));
    if (!file) return;
    const img = await createImageBitmap(await (await fetch(`${dir}/${file}`)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    if (srgb8) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 8); }
    else { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  };
  await Promise.all([loadTex(0, texName, { srgb8: true, repeat: true }), loadTex(1, info.views[0]?.texture), loadTex(2, info.probe.texture)]);
  gl.uniform1i(U('u_tex'), 0); gl.uniform1i(U('u_view'), 1); gl.uniform1i(U('u_probe'), 2);
  gl.enable(gl.DEPTH_TEST);

  const sub = (a, b) => a.map((x, i) => x - b[i]), norm = (a) => { const l = Math.hypot(...a); return a.map(x => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function draw(eye, target, lens) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * dpr) || canvas.width, h = Math.round(canvas.clientHeight * dpr) || canvas.height;
    if (canvas.clientWidth && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    const asp = canvas.width / canvas.height, fy = 1 / ((18 / lens) / asp), fx = fy / asp, n = 0.03, f = 60;
    const z = norm(sub(eye, target)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    const view = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
    const proj = [fx, 0, 0, 0, 0, fy, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0];
    const vp = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += proj[k * 4 + r] * view[c * 4 + k]; vp[c * 4 + r] = s; }
    gl.uniformMatrix4fv(U('u_vp'), false, vp); gl.uniform3fv(U('u_cam'), eye);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0);
  }
  return {
    info, walks: info.walks,
    frame(walk, i, lens = 24) { const fr = info.walks[walk].frames[i]; draw(fr.slice(0, 3), fr.slice(3), lens); },
    shot(i) { const s = info.shots[i]; draw(s.origin, s.target, s.focal_mm); },
    view(eye, target, lens = 24) { draw(eye, target, lens); },
    debug(mode) { gl.useProgram(pr); gl.uniform1i(U('u_debug'), mode); },
  };
}
