"""Reference render of scene.json with Mitsuba 3 (CPU). Writes reference.exr and reference.png."""
import json, sys, time, math
import numpy as np
import mitsuba as mi

mi.set_variant('llvm_ad_rgb')
from mitsuba import ScalarTransform4f as T

spp = int(sys.argv[1]) if len(sys.argv) > 1 else 512
S = json.load(open('scene.json'))
cam = S['camera']
fov = math.degrees(2 * math.atan(18 / cam['focal_mm']))  # horizontal, 36 mm frame

d = {'type': 'scene',
     'integrator': {'type': 'path', 'max_depth': S['bounces'] + 1},
     'sensor': {'type': 'perspective', 'fov': fov, 'fov_axis': 'x',
                'to_world': T().look_at(origin=cam['origin'], target=cam['target'], up=[0, 1, 0]),
                'film': {'type': 'hdrfilm', 'width': cam['width'], 'height': cam['height'],
                         'rfilter': {'type': 'box'}},
                'sampler': {'type': 'independent', 'sample_count': spp}}}

def bsdf(m):
    if m.get('metal'):
        a = m['rough'] ** 2  # same roughness -> alpha mapping as the WebGPU tracer
        return {'type': 'roughconductor', 'distribution': 'ggx', 'alpha': a,
                'specular_reflectance': {'type': 'rgb', 'value': m['base']}}
    return {'type': 'diffuse', 'reflectance': {'type': 'rgb', 'value': m['base']}}

for i, p in enumerate(S['prims']):
    m = S['materials'][p['mat']]
    if p['type'] == 'box':
        lo, hi = np.array(p['min']), np.array(p['max'])
        c, h = (lo + hi) / 2, (hi - lo) / 2
        sh = {'type': 'cube', 'to_world': T().translate(c.tolist()).scale(h.tolist())}
    elif p['type'] == 'sphere':
        sh = {'type': 'sphere', 'center': p['center'], 'radius': p['radius']}
    else:
        a, u, v = map(np.array, (p['corner'], p['u'], p['v']))
        n = np.cross(u, v); n /= np.linalg.norm(n)
        c = a + u / 2 + v / 2
        M = np.eye(4); M[:3, 0] = u / 2; M[:3, 1] = v / 2; M[:3, 2] = n; M[:3, 3] = c
        sh = {'type': 'rectangle', 'to_world': T(M.tolist())}
    if 'emit' in m:
        sh['emitter'] = {'type': 'area', 'radiance': {'type': 'rgb', 'value': m['emit']}}
        sh['bsdf'] = {'type': 'diffuse', 'reflectance': {'type': 'rgb', 'value': [0, 0, 0]}}
    else:
        sh['bsdf'] = bsdf(m)
    d[f's{i:03d}'] = sh

scene = mi.load_dict(d)
t = time.time()
img = mi.render(scene, spp=spp)
dt = time.time() - t
mi.Bitmap(img).write('reference.exr')
arr = np.array(img)[:, :, :3]
np.save('reference.npy', arr)

def tonemap(x, exposure):  # identical to the WGSL display shader
    x = x * exposure
    x = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)

from PIL import Image
Image.fromarray((tonemap(arr, S['exposure']) * 255 + 0.5).astype(np.uint8)).save('reference.png')
print(f'{spp} spp in {dt:.1f} s, mean {arr.mean():.3f}')
