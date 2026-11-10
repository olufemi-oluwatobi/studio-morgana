"""One living room, written to the human-scale numbers. Units: metres, y up.
Interior: x 0..4.5 (width), z 0..3.6 (depth), y 0..2.75 (ceiling).
Every shape is a box, a sphere or a one-sided rectangle, so both renderers read the same thing."""
import json

W, D, H = 4.5, 3.6, 2.75
T = 0.1  # wall thickness

mats = {
    'oak':     {'base': [0.42, 0.27, 0.15], 'rough': 0.6},
    'wall':    {'base': [0.78, 0.74, 0.68], 'rough': 1.0},
    'ceiling': {'base': [0.82, 0.81, 0.79], 'rough': 1.0},
    'skirt':   {'base': [0.86, 0.85, 0.82], 'rough': 1.0},
    'frame':   {'base': [0.05, 0.05, 0.05], 'rough': 1.0},
    'rug':     {'base': [0.52, 0.20, 0.13], 'rough': 1.0},
    'velvet':  {'base': [0.07, 0.20, 0.15], 'rough': 1.0},
    'mustard': {'base': [0.79, 0.34, 0.03], 'rough': 1.0},  # the Bride yellow, #e69d27 in linear
    'walnut':  {'base': [0.22, 0.11, 0.06], 'rough': 1.0},
    'brass':   {'base': [0.91, 0.78, 0.42], 'rough': 0.3, 'metal': True},
    'art':     {'base': [0.08, 0.15, 0.33], 'rough': 1.0},
    'cord':    {'base': [0.03, 0.03, 0.03], 'rough': 1.0},
    'sky':     {'base': [0, 0, 0], 'emit': [3.6, 3.9, 4.4]},
    'bulb':    {'base': [0, 0, 0], 'emit': [60.0, 40.0, 21.0]},  # warm, about 2700 K
}

prims = []
def box(name, x0, y0, z0, x1, y1, z1, mat):
    prims.append({'name': name, 'type': 'box', 'min': [x0, y0, z0], 'max': [x1, y1, z1], 'mat': mat})

# shell
box('floor', -T, -T, -T, W + T, 0, D + T, 'oak')
box('ceiling', -T, H, -T, W + T, H + T, D + T, 'ceiling')
box('wall-left', -T, 0, -T, 0, H, D + T, 'wall')
box('wall-right', W, 0, -T, W + T, H, D + T, 'wall')
box('wall-front', 0, 0, -T, W, H, 0, 'wall')
# back wall with a window opening x 1.4..3.1, sill 0.8, head 2.3
wx0, wx1, wy0, wy1 = 1.4, 3.1, 0.8, 2.3
box('wall-back-l', 0, 0, D, wx0, H, D + T, 'wall')
box('wall-back-r', wx1, 0, D, W, H, D + T, 'wall')
box('wall-back-sill', wx0, 0, D, wx1, wy0, D + T, 'wall')
box('wall-back-head', wx0, wy1, D, wx1, H, D + T, 'wall')
# window frame: mullion and transom
box('mullion', 2.22, wy0, D + 0.03, 2.28, wy1, D + 0.07, 'frame')
box('transom', wx0, 1.88, D + 0.03, wx1, 1.93, D + 0.07, 'frame')
# skirting, 100 mm
box('skirt-l', 0, 0, 0, 0.015, 0.1, D, 'skirt')
box('skirt-r', W - 0.015, 0, 0, W, 0.1, D, 'skirt')
box('skirt-b1', 0, 0, D - 0.015, wx0, 0.1, D, 'skirt')
box('skirt-b2', wx1, 0, D - 0.015, W, 0.1, D, 'skirt')
box('skirt-b3', wx0, 0, D - 0.015, wx1, 0.1, D, 'skirt')

# rug: 300-460 mm off the walls
box('rug', 0.75, 0, 0.9, 3.95, 0.012, 3.15, 'rug')

# sofa along the right wall, 2.1 m long, seat 420 mm
sx0, sx1, sz0, sz1 = 3.6, 4.45, 1.1, 3.2
box('sofa-base', sx0, 0.08, sz0, sx1, 0.42, sz1, 'velvet')
box('sofa-back', 4.22, 0.42, sz0, sx1, 0.86, sz1, 'velvet')
box('sofa-arm-a', sx0, 0.42, sz0, sx1, 0.62, sz0 + 0.18, 'velvet')
box('sofa-arm-b', sx0, 0.42, sz1 - 0.18, sx1, 0.62, sz1, 'velvet')
for i, (x, z) in enumerate([(sx0 + .05, sz0 + .05), (sx1 - .09, sz0 + .05), (sx0 + .05, sz1 - .09), (sx1 - .09, sz1 - .09)]):
    box(f'sofa-leg-{i}', x, 0, z, x + 0.04, 0.08, z + 0.04, 'brass')

# coffee table: 400 mm from the sofa, top at 440 mm (seat 420)
tx0, tx1, tz0, tz1 = 2.35, 3.2, 1.7, 2.6
box('table-top', tx0, 0.40, tz0, tx1, 0.44, tz1, 'walnut')
for i, (x, z) in enumerate([(tx0 + .04, tz0 + .04), (tx1 - .07, tz0 + .04), (tx0 + .04, tz1 - .07), (tx1 - .07, tz1 - .07)]):
    box(f'table-leg-{i}', x, 0.012, z, x + 0.03, 0.40, z + 0.03, 'brass')

# armchair facing the sofa
ax0, ax1, az0, az1 = 0.55, 1.35, 1.75, 2.6
box('chair-base', ax0, 0.08, az0, ax1, 0.42, az1, 'mustard')
box('chair-back', ax0, 0.42, az0, ax0 + 0.2, 0.9, az1, 'mustard')
box('chair-arm-a', ax0, 0.42, az0, ax1, 0.6, az0 + 0.14, 'mustard')
box('chair-arm-b', ax0, 0.42, az1 - 0.14, ax1, 0.6, az1, 'mustard')

# art on the left wall, centre at 1450 mm
box('art', 0, 1.2, 1.6, 0.03, 1.7, 2.4, 'art')

# pendant over the table
pc = [2.775, 1.95, 2.15]
box('cord', pc[0] - 0.006, pc[1] + 0.09, pc[2] - 0.006, pc[0] + 0.006, H, pc[2] + 0.006, 'cord')
prims.append({'name': 'bulb', 'type': 'sphere', 'center': pc, 'radius': 0.09, 'mat': 'bulb'})

# daylight: one-sided rectangle outside the window, facing into the room (-z)
prims.append({'name': 'sky', 'type': 'rect', 'corner': [1.2, 0.6, D + 0.15],
              'u': [0, 1.9, 0], 'v': [2.1, 0, 0], 'mat': 'sky'})

scene = {
    'materials': mats,
    'prims': prims,
    'camera': {'origin': [0.4, 1.25, 0.22], 'target': [2.7, 0.95, 3.2], 'focal_mm': 28,
               'width': 960, 'height': 640},
    'bounces': 6,
    'exposure': 0.7,
}
json.dump(scene, open('scene.json', 'w'), indent=1)
print(len(prims), 'prims')
