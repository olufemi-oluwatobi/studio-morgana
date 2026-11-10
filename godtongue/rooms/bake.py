"""Bake a room's light once, so walk-throughs and live views are cheap to draw.
   python3 bake.py scene.json OUT_DIR [--grid 0.05] [--direct 64] [--indirect 256]

Every surface is cut into small triangles (about --grid metres on flat walls), and at each corner we measure how much
light arrives (irradiance E, in linear RGB):
  direct   = by sampling the lights themselves (sharp, low noise)
  indirect = by tracing paths into the room, minus anything that hits a light first (no double counting)
Matte surfaces then just need albedo * E / pi, which any GPU draws in a millisecond.
Writes OUT_DIR/bake.bin (geometry + light), bake.json (layout, materials, cameras), and textures."""
import argparse, json, math, os, sys, time
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R          # noqa: E402  (scene_dict, walk_path, textures)
import mitsuba as mi        # noqa: E402
import drjit as dr          # noqa: E402
from PIL import Image       # noqa: E402

# ── tessellation ───────────────────────────────────────────────────────────────
def grid_quad(o, du, dv, n, step):
    """A rectangle o + s*du + t*dv cut into a grid no coarser than step metres."""
    nu = max(1, math.ceil(np.linalg.norm(du) / step)); nv = max(1, math.ceil(np.linalg.norm(dv) / step))
    s, t = np.meshgrid(np.linspace(0, 1, nu + 1), np.linspace(0, 1, nv + 1), indexing='ij')
    P = o + s[..., None] * du + t[..., None] * dv
    P = P.reshape(-1, 3); N = np.repeat(np.array([n], float), len(P), 0)
    k = np.arange((nu + 1) * (nv + 1)).reshape(nu + 1, nv + 1)
    a, b, c, d = k[:-1, :-1].ravel(), k[1:, :-1].ravel(), k[1:, 1:].ravel(), k[:-1, 1:].ravel()
    I = np.stack([a, b, c, a, c, d], 1).reshape(-1, 3)
    return P, N, I, np.stack([s.ravel(), t.ravel()], 1)


def subdivide(P, N, I, step, UV=None):
    """Split triangles longer than step into a k*k barycentric grid; small triangles keep their shared corners."""
    P = np.asarray(P, float); N = np.asarray(N, float)
    edges = np.stack([np.linalg.norm(P[I[:, 1]] - P[I[:, 0]], axis=1), np.linalg.norm(P[I[:, 2]] - P[I[:, 1]], axis=1), np.linalg.norm(P[I[:, 0]] - P[I[:, 2]], axis=1)], 1).max(1)
    K = np.maximum(1, np.ceil(edges / step).astype(int))
    outP, outN, outUV, outI = [P], [N], ([UV] if UV is not None else None), [I[K == 1]]
    base = len(P)
    for tri, k in zip(I[K > 1], K[K > 1]):
        idx = {}; pts, nrm, uvs = [], [], []
        for i in range(k + 1):
            for j in range(k + 1 - i):
                w = np.array([1 - (i + j) / k, i / k, j / k])
                idx[(i, j)] = base + len(pts)
                pts.append(w @ P[tri]); nn = w @ N[tri]; nrm.append(nn / (np.linalg.norm(nn) + 1e-12))
                if UV is not None: uvs.append(w @ UV[tri])
        tris = []
        for i in range(k):
            for j in range(k - i):
                tris.append([idx[(i, j)], idx[(i + 1, j)], idx[(i, j + 1)]])
                if i + j < k - 1: tris.append([idx[(i + 1, j)], idx[(i + 1, j + 1)], idx[(i, j + 1)]])
        outP.append(np.array(pts)); outN.append(np.array(nrm)); outI.append(np.array(tris)); base += len(pts)
        if UV is not None: outUV.append(np.array(uvs))
    return np.vstack(outP), np.vstack(outN), np.vstack(outI), (np.vstack(outUV) if UV is not None else None)


def sphere(c, r, seg=24):
    th, ph = np.meshgrid(np.linspace(0, np.pi, seg + 1), np.linspace(0, 2 * np.pi, 2 * seg + 1), indexing='ij')
    d = np.stack([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)], -1).reshape(-1, 3)
    k = np.arange((seg + 1) * (2 * seg + 1)).reshape(seg + 1, 2 * seg + 1)
    a, b, cc, dd = k[:-1, :-1].ravel(), k[1:, :-1].ravel(), k[1:, 1:].ravel(), k[:-1, 1:].ravel()
    return np.array(c) + r * d, d, np.stack([a, b, cc, a, cc, dd], 1).reshape(-1, 3)


def tessellate(S, wall_step, mesh_step):
    """→ list of parts: {mat, P, N, I, UV?, bake: bool}. Faces outside the room shell are dropped."""
    lo = np.array([min(p['min'][0] for p in S['prims'] if p['name'] == 'ceiling'), 0, 0])
    W = max(p['max'][0] for p in S['prims'] if p['type'] == 'box' and p['name'].startswith('wall')) - 0.1
    D = max(p['max'][2] for p in S['prims'] if p['type'] == 'box' and p['name'].startswith('wall')) - 0.1
    H = next(p['min'][1] for p in S['prims'] if p['name'] == 'ceiling')
    tol = 0.09
    inside = lambda c: (-tol <= c[0] <= W + tol) and (-tol <= c[1] <= H + 0.001) and (-tol <= c[2] <= D + tol)
    parts = []
    for p in S['prims']:
        m = S['materials'][p['mat']]
        emit = 'emit' in m
        if p['name'] == 'floor-base': continue
        if p['type'] == 'box':
            a, b = np.array(p['min']), np.array(p['max'])
            for ax in range(3):
                for side in (0, 1):
                    n = np.zeros(3); n[ax] = 1 if side else -1
                    u, v = [(ax + 1) % 3, (ax + 2) % 3]
                    o = a.copy(); o[ax] = (b if side else a)[ax]
                    du = np.zeros(3); du[u] = b[u] - a[u]; dv = np.zeros(3); dv[v] = b[v] - a[v]
                    c = o + du / 2 + dv / 2
                    toward_room = np.dot(n, np.array([W / 2, H / 2, D / 2]) - c) > 0
                    near = (-0.3 <= c[0] <= W + 0.3) and (-0.3 <= c[2] <= D + 0.3) and (-0.01 <= c[1] <= H + 0.01)
                    if not (inside(c) or (near and toward_room)): continue
                    big = max(np.linalg.norm(du), np.linalg.norm(dv)) > 0.5
                    P, N, I, _ = grid_quad(o, du, dv, n, wall_step if big else mesh_step)
                    parts.append({'mat': p['mat'], 'P': P, 'N': N, 'I': I, 'bake': not emit})
        elif p['type'] == 'mesh':
            P = np.array(p['p'], float).reshape(-1, 3); N = np.array(p['n'], float).reshape(-1, 3); I = np.array(p['i'], int).reshape(-1, 3)
            UV = np.array(p['uv'], float).reshape(-1, 2) if 'uv' in p else None
            P, N, I, UV = subdivide(P, N, I, wall_step if UV is not None else mesh_step, UV)
            part = {'mat': p['mat'], 'P': P, 'N': N, 'I': I, 'bake': not emit}
            if UV is not None: part['UV'] = UV
            parts.append(part)
        elif p['type'] == 'sphere':
            P, N, I = sphere(p['center'], p['radius'])
            parts.append({'mat': p['mat'], 'P': P, 'N': N, 'I': I, 'bake': False})
        elif p['type'] == 'rect':
            a, u, v = (np.array(p[k], float) for k in ('corner', 'u', 'v'))
            n = np.cross(u, v); n /= np.linalg.norm(n)
            P, N, I, UV = grid_quad(a, u, v, n, 10)
            parts.append({'mat': p['mat'], 'P': P, 'N': N, 'I': I, 'UV': UV, 'bake': False, 'view': p.get('view') is not None, 'prim': p})
    return parts, (W, H, D)


# ── baking ─────────────────────────────────────────────────────────────────────
def bake_points(scene, P, N, n_direct, n_indirect, chunk=1 << 20, log=print):
    """Irradiance E at each point (RGB). Direct by light sampling, indirect by cosine-weighted paths."""
    integ = scene.integrator()
    parts = {'direct': np.zeros((len(P), 3), np.float32), 'indirect': np.zeros((len(P), 3), np.float32)}
    buried = np.zeros(len(P), np.float32)
    org = (P + N * 2e-3).astype(np.float32)
    for spp, kind in ((n_direct, 'direct'), (n_indirect, 'indirect')):
        per = max(1, chunk // spp)
        for s0 in range(0, len(P), per):
            o = np.repeat(org[s0:s0 + per], spp, 0); n = np.repeat(N[s0:s0 + per].astype(np.float32), spp, 0)
            cnt = len(o)
            # stratified: each point's samples are spread evenly over the light and the hemisphere, not clumped at random
            square = int(round(math.sqrt(spp))) ** 2 == spp and (spp & (spp - 1)) == 0
            sampler = mi.load_dict({'type': 'stratified', 'sample_count': spp, 'jitter': True} if square else {'type': 'independent'})
            sampler.seed(s0 * 7 + (1 if kind == 'direct' else 2), cnt)
            if kind == 'direct':
                it = dr.zeros(mi.Interaction3f, cnt)
                it.p = mi.Point3f(*o.T); it.n = mi.Normal3f(*n.T)
                ds, w = scene.sample_emitter_direction(it, sampler.next_2d(), True)
                cos = dr.maximum(dr.dot(mi.Vector3f(*n.T), ds.d), 0)
                val = np.array(w * cos).T            # drjit colours come out as (3, n)
            else:
                frame = mi.Frame3f(mi.Normal3f(*n.T))
                d = frame.to_world(mi.warp.square_to_cosine_hemisphere(sampler.next_2d()))
                ray = mi.Ray3f(mi.Point3f(*o.T), d)
                L, _, _ = integ.sample(scene, sampler, ray)
                si = scene.ray_intersect(ray)
                Le = si.emitter(scene).eval(si, si.is_valid())
                near = np.array(dr.select(si.is_valid() & (si.t < 0.03), 1.0, 0.0)).reshape(-1, spp).mean(1)
                buried[s0:s0 + per] = near
                val = np.array(L - Le).T                  # (3, n) → (n, 3)
                val = np.minimum(val, 25.0) * np.pi        # clamp rare bright paths, then E = pi * mean(L) for cosine sampling
            val = np.nan_to_num(val.reshape(-1, spp, 3), nan=0, posinf=0).mean(1)
            parts[kind][s0:s0 + per] += val
        log(f'  {kind}: {spp} samples x {len(P)} points')
    return parts['direct'], parts['indirect'], buried


def inset_points(P, I, N, amount=0.005):
    """Move each sample point a few mm towards the middle of its own triangles, so points on a face's edge
    don't see light leaking past the corner of the neighbouring box."""
    cen = P[I].mean(1)
    acc = np.zeros_like(P); cnt = np.zeros(len(P))
    for k in range(3): np.add.at(acc, I[:, k], cen); np.add.at(cnt, I[:, k], 1)
    d = acc / np.maximum(cnt, 1)[:, None] - P
    d -= N * np.einsum('ij,ij->i', d, N)[:, None]           # stay on the surface plane
    L = np.linalg.norm(d, axis=1, keepdims=True)
    return P + d / np.maximum(L, 1e-9) * np.minimum(L, amount)


def despeckle(P, N, E, radius, buried=None, k=24, band=0.35):
    """Clamp each point to within ±band of the median of its same-plane neighbours: removes speckle, keeps gradients."""
    from scipy.spatial import cKDTree
    d, j = cKDTree(P).query(P, k=k, distance_upper_bound=radius)
    j[:, 0] = np.arange(len(P)); d[:, 0] = 0          # coincident points (e.g. a wall edge and a reveal edge) must not stand in for the point itself
    ok = np.isfinite(d); j = np.where(ok, j, 0)
    ok &= (np.einsum('ij,ikj->ik', N, N[j]) > 0.9) & (np.abs(np.einsum('ij,ikj->ik', N, P[j] - P[:, None, :])) < 0.006)
    if buried is not None: ok &= buried[j] < 0.6
    ok[:, 0] = True
    lum = E @ np.array([0.2126, 0.7152, 0.0722])
    nb = np.where(ok, lum[j], np.nan)
    med = np.nanmedian(nb, 1)
    scale = np.clip(lum, med * (1 - band), med * (1 + band)) / np.maximum(lum, 1e-9)
    return E * np.where(lum > 1e-9, scale, 1)[:, None]


def smooth(P, N, E, radius, buried=None, cos_min=0.9, k=48):
    """Average E over nearby points that face the same way (irradiance filtering). Gaussian in distance."""
    from scipy.spatial import cKDTree
    tree = cKDTree(P)
    d, j = tree.query(P, k=k, distance_upper_bound=radius)
    j[:, 0] = np.arange(len(P)); d[:, 0] = 0          # the point itself, never a coincident point of another surface
    ok = np.isfinite(d)
    j = np.where(ok, j, 0)
    w = np.exp(-(np.where(ok, d, radius) / (radius / 2)) ** 2) * ok
    w *= (np.einsum('ij,ikj->ik', N, N[j]) > cos_min)
    w *= np.abs(np.einsum('ij,ikj->ik', N, P[j] - P[:, None, :])) < 0.006     # same plane, so a rug never borrows the floor under it
    if buried is not None: w *= (buried[j] < 0.6)                               # never borrow from points hidden under things
    w[:, 0] = np.maximum(w[:, 0], 1.0)                       # each point always keeps itself
    return (E[j] * w[..., None]).sum(1) / w.sum(1, keepdims=True)


def probe(scene, origin, face, spp):
    """A small 360 picture from the middle of the room, used for reflections on brass and the floor's sheen."""
    D0 = scene  # already loaded
    return R.render_panorama(D0, None, origin, face, spp, True)


def encode_rgbe(x):
    """Linear HDR → 8-bit RGBE (shared exponent), so textures stay bright-correct in WebGL."""
    m = np.max(x, -1, keepdims=True)
    e = np.where(m > 1e-32, np.ceil(np.log2(np.maximum(m, 1e-32))), -128)
    rgb = np.clip(np.where(m > 1e-32, x / np.exp2(e) * 255, 0), 0, 255)
    return np.concatenate([rgb, np.clip(e + 128, 0, 255)], -1).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('out')
    ap.add_argument('--grid', type=float, default=0.05); ap.add_argument('--mesh-grid', type=float, default=0.25)
    ap.add_argument('--direct', type=int, default=256); ap.add_argument('--indirect', type=int, default=256)
    ap.add_argument('--fps', type=int, default=24)
    ap.add_argument('--direct-radius', type=float, default=0.08, help='metres; small, so shadows stay sharp')
    ap.add_argument('--indirect-radius', type=float, default=0.25, help='metres; bounce light changes slowly')
    a = ap.parse_args()
    t0 = time.time()
    S = json.load(open(a.scene))
    os.makedirs(a.out, exist_ok=True)
    R.MESH_DIR = R.MESH_DIR or __import__('tempfile').mkdtemp(prefix='room-meshes-')
    D = R.scene_dict(S)
    scene = mi.load_dict(D)
    parts, (W, H, Dp) = tessellate(S, a.grid, a.mesh_grid)
    bp = [p for p in parts if p['bake']]
    P = np.vstack([p['P'] for p in bp]); N = np.vstack([p['N'] for p in bp])
    Ps = np.vstack([inset_points(p['P'], p['I'], p['N']) for p in bp])
    print(f'{sum(len(p["P"]) for p in parts)} vertices, {sum(len(p["I"]) for p in parts)} triangles; baking {len(P)} points')
    Ed, Ei, buried = bake_points(scene, Ps, N, a.direct, a.indirect)
    Ed = despeckle(P, N, Ed, a.direct_radius * 1.5, buried); Ei = despeckle(P, N, Ei, a.indirect_radius, buried)
    E = smooth(P, N, Ed, a.direct_radius, buried) + smooth(P, N, Ei, a.indirect_radius, buried)
    k = 0
    for p in bp: p['E'] = E[k:k + len(p['P'])]; k += len(p['P'])
    t_bake = time.time() - t0

    # materials table and per-vertex material index
    names = sorted({p['mat'] for p in parts}); mid = {n: i for i, n in enumerate(names)}
    mats = []
    for n in names:
        m = S['materials'][n]
        mats.append({'name': n, 'base': m['base'], 'emit': m.get('emit', [0, 0, 0]), 'metal': bool(m.get('metal')), 'rough': m.get('rough', 1.0),
                     'sheen': m.get('sheen', 0), 'texture': m.get('texture')})

    # textures: floor planks (albedo, sRGB 8-bit), window view (RGBE radiance), reflection probe (RGBE)
    tex = {}
    for m in mats:
        if m['texture'] and m['texture']['kind'] == 'planks':
            import textures
            img = textures.planks(m['base'], tile_m=m['texture']['tile'], plank_m=m['texture']['plank'], px_per_m=1024 / m['texture']['tile'])
            img = np.array(Image.fromarray((np.clip(img, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS))
            Image.fromarray(img).save(os.path.join(a.out, f'tex-{m["name"]}.png')); tex[m['name']] = f'tex-{m["name"]}.png'
    for p in parts:
        if p.get('view'):
            path = R.view_file(p['prim'], S['materials'][p['mat']]['emit'])
            v = np.array(mi.Bitmap(path)).astype(np.float32)[..., :3]
            v = np.array(Image.fromarray(encode_rgbe(v)).resize((512, 512), Image.NEAREST))
            Image.fromarray(v, 'RGBA').save(os.path.join(a.out, f'view-{p["prim"]["name"]}.png'))
            p['viewTex'] = f'view-{p["prim"]["name"]}.png'
    centre = [W / 2, 1.2, Dp / 2]
    pr = R.render_panorama(scene, S, centre, 128, 64, False)
    pr = np.array(Image.fromarray(encode_rgbe(pr)).resize((512, 256), Image.NEAREST))
    Image.fromarray(pr, 'RGBA').save(os.path.join(a.out, 'probe.png'))

    # pack: positions f32, normals i8, E f16, material u8, uv f32 (zeros where unused), indices u32
    nV = sum(len(p['P']) for p in parts)
    pos = np.vstack([p['P'] for p in parts]).astype(np.float32)
    nrm = np.clip(np.round(np.vstack([p['N'] for p in parts]) * 127), -127, 127).astype(np.int8)
    nrm4 = np.zeros((nV, 4), np.int8); nrm4[:, :3] = nrm
    Ev = np.vstack([p.get('E', np.zeros((len(p['P']), 3))) for p in parts]).astype(np.float16)
    Ev4 = np.zeros((nV, 4), np.float16); Ev4[:, :3] = Ev
    mat = np.concatenate([np.full(len(p['P']), mid[p['mat']], np.uint8) for p in parts])
    mat4 = np.zeros((nV, 4), np.uint8); mat4[:, 0] = mat
    uv = np.vstack([p['UV'] if 'UV' in p else np.zeros((len(p['P']), 2)) for p in parts]).astype(np.float32)
    idx, base = [], 0
    for p in parts: idx.append(p['I'] + base); base += len(p['P'])
    idx = np.vstack(idx).astype(np.uint32).ravel()
    blobs = [('position', pos), ('normal', nrm4), ('light', Ev4), ('material', mat4), ('uv', uv), ('index', idx)]
    layout, off = {}, 0
    with open(os.path.join(a.out, 'bake.bin'), 'wb') as f:
        for name, arr in blobs:
            b = arr.tobytes(); layout[name] = {'offset': off, 'bytes': len(b)}; f.write(b); off += len(b)
            pad = (-off) % 4; f.write(b'\0' * pad); off += pad
    # the same bytes as base64 text, for hosts that only serve text and image types
    import base64
    with open(os.path.join(a.out, 'bake.bin'), 'rb') as f, open(os.path.join(a.out, 'bake.b64.txt'), 'wb') as g: g.write(base64.b64encode(f.read()))
    # view quads: which vertex range uses which view texture
    views, base = [], 0
    for p in parts:
        if p.get('viewTex'): views.append({'texture': p['viewTex'], 'first': base, 'count': len(p['P'])})
        base += len(p['P'])
    walks = []
    for w in S.get('walks', []):
        pos_w, tgt_w = R.walk_path(w, a.fps)
        walks.append({'name': w['name'], 'fps': a.fps, 'seconds': w['seconds'], 'frames': np.round(np.hstack([pos_w, tgt_w]), 4).tolist()})
    info = {'vertices': nV, 'triangles': len(idx) // 3, 'layout': layout, 'materials': mats, 'textures': tex, 'views': views,
            'probe': {'texture': 'probe.png', 'origin': centre}, 'exposure': S['exposure'], 'room': [W, H, Dp],
            'shots': S['shots'], 'walks': walks, 'bake': {'grid': a.grid, 'direct': a.direct, 'indirect': a.indirect, 'radii': [a.direct_radius, a.indirect_radius], 'seconds': round(t_bake, 1)}}
    json.dump(info, open(os.path.join(a.out, 'bake.json'), 'w'))
    print(json.dumps({'vertices': nV, 'triangles': len(idx) // 3, 'bake_seconds': round(t_bake, 1), 'total_seconds': round(time.time() - t0, 1),
                      'bin_mb': round(off / 1e6, 2)}))


if __name__ == '__main__':
    main()
