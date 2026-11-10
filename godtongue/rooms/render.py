"""Render a room scene with Mitsuba 3 on the CPU.
   python3 render.py scene.json OUT_PREFIX [--shot NAME] [--spp N] [--size W H] [--camera ox oy oz tx ty tz lens]
   Writes OUT_PREFIX.npy (linear RGB) and OUT_PREFIX.png (tone-mapped, identical curve to the WebGPU tracer)."""
import argparse, json, math, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import mitsuba as mi
from PIL import Image

mi.set_variant('llvm_ad_rgb')
from mitsuba import ScalarTransform4f as T


def tonemap(x, exposure):
    x = x * exposure
    x = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


TEX_CACHE = {}


def texture_file(kind, m):
    import os
    import textures
    key = (kind, tuple(m['base']), m['texture'].get('plank'))
    if key not in TEX_CACHE:
        path = os.path.join(MESH_DIR, f'tex{len(TEX_CACHE)}.exr')
        mi.Bitmap(textures.planks(m['base'], tile_m=m['texture']['tile'], plank_m=m['texture']['plank'])).write(path)
        TEX_CACHE[key] = path
    return TEX_CACHE[key]


def bsdf(m, has_uv=False):
    refl = {'type': 'rgb', 'value': m['base']}
    if has_uv and m.get('texture'):
        refl = {'type': 'bitmap', 'filename': texture_file(m['texture']['kind'], m), 'raw': True,
                'to_uv': mi.ScalarTransform4f().scale([1 / m['texture']['tile'], 1 / m['texture']['tile'], 1])}
    if m.get('sheen') and not m.get('metal'):
        return {'type': 'roughplastic', 'distribution': 'ggx', 'alpha': m['sheen'], 'int_ior': 1.5, 'diffuse_reflectance': refl}
    if not m.get('metal'):
        return {'type': 'diffuse', 'reflectance': refl}
    if m.get('metal'):
        return {'type': 'roughconductor', 'distribution': 'ggx', 'alpha': m['rough'] ** 2,
                'specular_reflectance': {'type': 'rgb', 'value': m['base']}}
    return {'type': 'diffuse', 'reflectance': {'type': 'rgb', 'value': m['base']}}


def write_ply(path, P, N, I, UV=None):
    P = np.asarray(P, np.float32).reshape(-1, 3); N = np.asarray(N, np.float32).reshape(-1, 3); I = np.asarray(I, np.int32).reshape(-1, 3)
    cols = [P, N] + ([np.asarray(UV, np.float32).reshape(-1, 2)] if UV is not None else [])
    uvp = 'property float u\nproperty float v\n' if UV is not None else ''
    with open(path, 'wb') as f:
        f.write((f'ply\nformat binary_little_endian 1.0\nelement vertex {len(P)}\nproperty float x\nproperty float y\nproperty float z\n'
                 f'property float nx\nproperty float ny\nproperty float nz\n{uvp}element face {len(I)}\nproperty list uchar int vertex_indices\nend_header\n').encode())
        f.write(np.hstack(cols).astype('<f4').tobytes())
        faces = np.zeros(len(I), dtype=[('n', 'u1'), ('i', '<i4', 3)]); faces['n'] = 3; faces['i'] = I
        f.write(faces.tobytes())


MESH_DIR = None


def view_file(p, emit):
    """The window view as an emitting texture, turned so it reads upright and unmirrored from inside."""
    import os
    import textures
    V = textures.view()                                   # rows top to bottom, columns left to right, looking out
    up = np.array([0, 1, 0.]); out = np.array(p['out'], float)
    right = np.cross(out, up)
    side = np.array(p['v'] if p['upAxis'] == 'u' else p['u'], float)
    if side @ right < 0: V = V[:, ::-1]
    Vb = V[::-1]                                          # Mitsuba: texture row 0 is v = 0, the bottom edge
    T = Vb if p['upAxis'] == 'v' else Vb.transpose(1, 0, 2)
    L = 0.2126 * emit[0] + 0.7152 * emit[1] + 0.0722 * emit[2]
    path = os.path.join(MESH_DIR, f'view-{p["name"]}.exr')
    mi.Bitmap(np.ascontiguousarray(T * L).astype(np.float32)).write(path)
    return path


def scene_dict(S):
    import tempfile, os
    global MESH_DIR
    MESH_DIR = MESH_DIR or tempfile.mkdtemp(prefix='room-meshes-')
    d = {'type': 'scene', 'integrator': {'type': 'path', 'max_depth': S['bounces'] + 1}}
    for i, p in enumerate(S['prims']):
        m = S['materials'][p['mat']]
        if p['type'] == 'box':
            lo, hi = np.array(p['min']), np.array(p['max'])
            sh = {'type': 'cube', 'to_world': T().translate(((lo + hi) / 2).tolist()).scale(((hi - lo) / 2).tolist())}
        elif p['type'] == 'sphere':
            sh = {'type': 'sphere', 'center': p['center'], 'radius': p['radius']}
        elif p['type'] == 'mesh':
            path = os.path.join(MESH_DIR, f'm{i:03d}.ply'); write_ply(path, p['p'], p['n'], p['i'], p.get('uv'))
            sh = {'type': 'ply', 'filename': path, 'face_normals': False}
        else:
            a, u, v = map(np.array, (p['corner'], p['u'], p['v']))
            n = np.cross(u, v); n /= np.linalg.norm(n)
            M = np.eye(4); M[:3, 0] = u / 2; M[:3, 1] = v / 2; M[:3, 2] = n; M[:3, 3] = a + u / 2 + v / 2
            sh = {'type': 'rectangle', 'to_world': T(M.tolist())}
        if 'emit' in m and p.get('view'):
            sh['emitter'] = {'type': 'area', 'radiance': {'type': 'bitmap', 'filename': view_file(p, m['emit']), 'raw': True}}
            sh['bsdf'] = {'type': 'diffuse', 'reflectance': {'type': 'rgb', 'value': [0, 0, 0]}}
        elif 'emit' in m:
            sh['emitter'] = {'type': 'area', 'radiance': {'type': 'rgb', 'value': m['emit']}}
            sh['bsdf'] = {'type': 'diffuse', 'reflectance': {'type': 'rgb', 'value': [0, 0, 0]}}
        else:
            b = bsdf(m, 'uv' in p)
            sh['bsdf'] = {'type': 'twosided', 'bsdf': b} if p['type'] == 'mesh' else b
        d[f's{i:03d}'] = sh
    return d


def sensor(origin, target, lens, w, h, spp):
    return mi.load_dict({'type': 'perspective', 'fov': math.degrees(2 * math.atan(18 / lens)), 'fov_axis': 'x',
                         'to_world': T().look_at(origin=origin, target=target, up=[0, 1, 0]),
                         'film': {'type': 'hdrfilm', 'width': w, 'height': h, 'rfilter': {'type': 'box'}},
                         'sampler': {'type': 'independent', 'sample_count': spp}})


# Cube faces: forward and up for each, in world space. The image right vector is cross(forward, up) in Mitsuba.
FACES = [((1, 0, 0), (0, 1, 0)), ((-1, 0, 0), (0, 1, 0)), ((0, 1, 0), (0, 0, -1)), ((0, -1, 0), (0, 0, 1)), ((0, 0, 1), (0, 1, 0)), ((0, 0, -1), (0, 1, 0))]


def render_panorama(scene, S, origin, face, spp, denoise, seed=0):
    """Six 90° square views stitched into one equirectangular image (2:1).
    Columns run left to right as you turn right; the middle column looks north."""
    import pyoidn
    imgs = []
    for fwd, up in FACES:
        sen = mi.load_dict({'type': 'perspective', 'fov': 90, 'fov_axis': 'x',
                            'to_world': T().look_at(origin=origin, target=(np.array(origin) + fwd).tolist(), up=list(up)),
                            'film': {'type': 'hdrfilm', 'width': face, 'height': face, 'rfilter': {'type': 'box'}},
                            'sampler': {'type': 'independent', 'sample_count': spp}})
        full = np.array(mi.render(scene, sensor=sen, spp=spp, seed=seed)).astype(np.float32)
        col = full[:, :, :3]
        if denoise:
            c = full.shape[2]
            col = pyoidn.denoise(np.ascontiguousarray(col), np.ascontiguousarray(np.clip(full[:, :, c - 6:c - 3], 0, 1)),
                                 np.ascontiguousarray(np.clip(full[:, :, c - 3:], -1, 1)), hdr=True)
        imgs.append(col)
    H = face * 2; W = H * 2
    th = (np.arange(W) + 0.5) / W * 2 * np.pi - np.pi
    ph = np.pi / 2 - (np.arange(H) + 0.5) / H * np.pi
    TH, PH = np.meshgrid(th, ph)
    # local: x = right of north, y up, z north; world x points west, so flip it
    d = np.stack([-np.cos(PH) * np.sin(TH), np.sin(PH), np.cos(PH) * np.cos(TH)], -1)
    out = np.zeros((H, W, 3), np.float32); best = np.full((H, W), -1.0)
    for k, (fwd, up) in enumerate(FACES):
        f = np.array(fwd, float); u = np.array(up, float); r = np.cross(f, u)
        df = d @ f
        use = (df > best) & (df > 0)
        best = np.where(use, df, best)
        x = (d @ r) / np.maximum(df, 1e-6); y = (d @ u) / np.maximum(df, 1e-6)
        cx = (x + 1) / 2 * face - 0.5; cy = (1 - y) / 2 * face - 0.5
        x0 = np.clip(np.floor(cx).astype(int), 0, face - 1); y0 = np.clip(np.floor(cy).astype(int), 0, face - 1)
        x1 = np.clip(x0 + 1, 0, face - 1); y1 = np.clip(y0 + 1, 0, face - 1)
        fx = np.clip(cx - x0, 0, 1)[..., None]; fy = np.clip(cy - y0, 0, 1)[..., None]
        I = imgs[k]
        v = (I[y0, x0] * (1 - fx) + I[y0, x1] * fx) * (1 - fy) + (I[y1, x0] * (1 - fx) + I[y1, x1] * fx) * fy
        out[use] = v[use]
    return out


def walk_path(w, fps=24):
    """Camera positions and targets for every frame: a centripetal Catmull-Rom curve through the points,
    walked at an even pace with a smooth start and stop. Without a target it looks 1.2 m ahead, slightly down."""
    P = np.array(w['points'], float)
    if len(P) == 2: P = np.array([P[0], (2 * P[0] + P[1]) / 3, (P[0] + 2 * P[1]) / 3, P[1]])
    Q = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    dense = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1:i + 3]
        t0 = 0; t1 = t0 + np.linalg.norm(p1 - p0) ** 0.5 + 1e-6; t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5 + 1e-6; t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5 + 1e-6
        for t in np.linspace(t1, t2, 200, endpoint=False):
            A1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1; A2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            A3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2; B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3
            dense.append((t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2)
    dense.append(P[-1]); dense = np.array(dense)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(dense, axis=0), axis=1))])
    n = int(round(w['seconds'] * fps))
    u = np.linspace(0, 1, n); u = u * u * (3 - 2 * u)               # ease in and out
    pos = np.array([np.interp(x * s[-1], s, dense[:, k]) for k in range(3) for x in u]).reshape(3, n).T
    if w.get('look'):
        tgt = np.repeat(np.array([w['look']], float), n, 0)
    else:
        ahead = np.array([np.interp(min(s[-1], x * s[-1] + 1.2), s, dense[:, k]) for k in range(3) for x in u]).reshape(3, n).T
        end_dir = dense[-1] - dense[-2]; end_dir /= np.linalg.norm(end_dir) + 1e-9
        over = np.clip(u * s[-1] + 1.2 - s[-1], 0, None)[:, None]
        tgt = ahead + end_dir * over; tgt[:, 1] = pos[:, 1]          # level: verticals stay vertical
    # smooth the aim so turns feel like a person, not a rail
    k = max(1, int(fps * 0.4)); ker = np.ones(k) / k
    tgt = np.array([np.convolve(np.pad(tgt[:, j], (k // 2, k - 1 - k // 2), mode='edge'), ker, 'valid') for j in range(3)]).T
    return pos, tgt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('out')
    ap.add_argument('--shot'); ap.add_argument('--spp', type=int, default=256)
    ap.add_argument('--size', type=int, nargs=2)
    ap.add_argument('--denoise', action='store_true', help='Intel Open Image Denoise with albedo and normal passes')
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--pano', help='render this panorama instead of a shot')
    ap.add_argument('--face', type=int, default=768, help='cube face size for panoramas')
    ap.add_argument('--walk', help='render the frames of this walk into OUT_PREFIX/frame-0000.png …')
    ap.add_argument('--frames', type=int, nargs=2, help='first and last frame (inclusive) to render')
    ap.add_argument('--fps', type=int, default=24)
    ap.add_argument('--lens', type=float, default=24)
    ap.add_argument('--fixed-seed', action='store_true', help='same noise pattern every frame (steadier video)')
    a = ap.parse_args()
    S = json.load(open(a.scene))
    cam = S['camera']
    if a.shot:
        cam = {**cam, **next(s for s in S['shots'] if s['name'] == a.shot)}
    w, h = a.size or (cam['width'], cam['height'])
    if cam.get('aspect') == 'portrait' and w > h:
        w, h = int(round(h * 0.8 / 2) * 2), h                 # 4:5 portrait, the card and Instagram shape
    D = scene_dict(S)
    if a.denoise:
        D['integrator'] = {'type': 'aov', 'aovs': 'albedo:albedo,nn:sh_normal', 'integrator': D['integrator']}
    scene = mi.load_dict(D)
    t = time.time()
    if a.walk:
        W_ = next(x for x in S['walks'] if x['name'] == a.walk)
        pos, tgt = walk_path(W_, a.fps)
        os.makedirs(a.out, exist_ok=True)
        f0, f1 = a.frames or (0, len(pos) - 1)
        sen = sensor(pos[0].tolist(), tgt[0].tolist(), a.lens, w, h, a.spp)
        params = mi.traverse(sen)
        import pyoidn
        for f in range(f0, min(f1, len(pos) - 1) + 1):
            params['to_world'] = T().look_at(origin=pos[f].tolist(), target=tgt[f].tolist(), up=[0, 1, 0]); params.update()
            full = np.array(mi.render(scene, sensor=sen, spp=a.spp, seed=0 if a.fixed_seed else f)).astype(np.float32)
            col = full[:, :, :3]
            if a.denoise:
                c = full.shape[2]
                col = pyoidn.denoise(np.ascontiguousarray(col), np.ascontiguousarray(np.clip(full[:, :, c - 6:c - 3], 0, 1)), np.ascontiguousarray(np.clip(full[:, :, c - 3:], -1, 1)), hdr=True)
            np.save(os.path.join(a.out, f'frame-{f:04d}.npy'), col) if os.environ.get('KEEP_NPY') else None
            Image.fromarray((tonemap(col, S['exposure']) * 255 + 0.5).astype(np.uint8)).save(os.path.join(a.out, f'frame-{f:04d}.png'))
        print(json.dumps({'frames': len(pos), 'rendered': [f0, min(f1, len(pos) - 1)], 'seconds': round(time.time() - t, 2), 'size': [w, h]}))
        return
    if a.pano:
        P = next(p for p in S['panoramas'] if p['name'] == a.pano)
        arr = render_panorama(scene, S, P['origin'], a.face, a.spp, a.denoise, a.seed)
        np.save(a.out + '.npy', arr)
        Image.fromarray((tonemap(arr, S['exposure']) * 255 + 0.5).astype(np.uint8)).save(a.out + '.png')
        print(json.dumps({'spp': a.spp, 'seconds': round(time.time() - t, 2), 'size': [arr.shape[1], arr.shape[0]]}))
        return
    img = mi.render(scene, sensor=sensor(cam['origin'], cam['target'], cam['focal_mm'], w, h, a.spp), spp=a.spp, seed=a.seed)
    full = np.array(img).astype(np.float32)
    arr = full[:, :, :3]
    if a.denoise:
        import pyoidn
        c = full.shape[2]
        albedo, normal = full[:, :, c - 6:c - 3], full[:, :, c - 3:]
        np.save(a.out + '.raw.npy', arr)
        arr = pyoidn.denoise(np.ascontiguousarray(arr), np.ascontiguousarray(np.clip(albedo, 0, 1)), np.ascontiguousarray(np.clip(normal, -1, 1)), hdr=True)
    dt = time.time() - t
    np.save(a.out + '.npy', arr)
    Image.fromarray((tonemap(arr, S['exposure']) * 255 + 0.5).astype(np.uint8)).save(a.out + '.png')
    print(json.dumps({'spp': a.spp, 'seconds': round(dt, 2), 'size': [w, h]}))


if __name__ == '__main__':
    main()
