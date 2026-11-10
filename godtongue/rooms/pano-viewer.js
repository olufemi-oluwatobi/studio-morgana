// Drag-to-look 360 viewer. One fullscreen triangle; the fragment shader turns each screen pixel into a direction
// and reads the equirectangular image. No library. mountPano(canvas, imageUrl) → { set(yawDeg, pitchDeg, fovDeg) }.
export function mountPano(canvas, src, { yaw = 0, pitch = 0, fov = 75 } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('no WebGL');
  const vs = 'attribute vec2 p; varying vec2 q; void main(){ q = p; gl_Position = vec4(p, 0., 1.); }';
  const fs = `precision highp float; varying vec2 q; uniform sampler2D img; uniform vec3 view; uniform float aspect;
    void main(){
      float t = tan(radians(view.z) * .5);
      vec3 d = normalize(vec3(q.x * t * aspect, q.y * t, 1.));
      float cp = cos(view.y), sp = sin(view.y);  d = vec3(d.x, d.y * cp + d.z * sp, -d.y * sp + d.z * cp);
      float cy = cos(view.x), sy = sin(view.x);  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
      float th = atan(d.x, d.z), ph = asin(clamp(d.y, -1., 1.));
      gl_FragColor = texture2D(img, vec2(th / 6.2831853 + .5, .5 - ph / 3.1415927));
    }`;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 36, 32, 255]));
  const st = { yaw: yaw * Math.PI / 180, pitch: pitch * Math.PI / 180, fov };
  const uView = gl.getUniformLocation(pr, 'view'), uAsp = gl.getUniformLocation(pr, 'aspect');
  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform3f(uView, st.yaw, st.pitch, st.fov); gl.uniform1f(uAsp, w / h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  const im = new Image(); im.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    draw();
  }; im.src = src;
  // drag to look, wheel or pinch to zoom
  let drag = null; const pts = new Map();
  canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, d: null, fov: st.fov }; canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => {
    if (!drag || !pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); drag.d ??= d; st.fov = Math.max(35, Math.min(100, drag.fov * drag.d / d)); draw(); return; }
    const k = st.fov / canvas.clientHeight * Math.PI / 180;
    st.yaw = drag.yaw - (e.clientX - drag.x) * k; st.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * k)); draw();
  });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) { drag = null; canvas.style.cursor = 'grab'; } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); st.fov = Math.max(35, Math.min(100, st.fov + e.deltaY * 0.05)); draw(); }, { passive: false });
  window.addEventListener('resize', draw);
  return { set(y, p, f) { if (y != null) st.yaw = y * Math.PI / 180; if (p != null) st.pitch = p * Math.PI / 180; if (f != null) st.fov = f; draw(); }, draw };
}
