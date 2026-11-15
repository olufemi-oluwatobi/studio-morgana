# BIRDS card art: Audubon birds as raised silver relief with niello feather lines, in card space (1080x1669).
#   front: the belted kingfisher (plate 77), diving out of the window's top-left corner
#   back:  the American flamingo (plate 431), stepping out of the shade grid at the bottom right
# Writes art/birds-front.svg and art/birds-back.svg (layers #relief and #ink) through art_trace.py.
import subprocess, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, binary_opening, binary_closing, label
GW, GH, S = 1080, 1669, 2            # card grid, drawn at 2x so the feather lines survive tracing
def layers(src, box):
    x, y, w = box
    im = Image.open(src).convert('RGBA'); h = round(im.height * w / im.width)
    im = im.resize((w * S, h * S), Image.LANCZOS)
    a = np.asarray(im, 'f4') / 255; al = a[..., 3]
    L = a[..., :3] @ np.array([.3, .59, .11], 'f4')
    sil = binary_closing(binary_opening(al > .5, iterations=2), iterations=2)
    lab, n = label(sil); sz = np.bincount(lab.ravel()); sz[0] = 0; sil = np.isin(lab, np.where(sz > sz.max() * .02)[0])
    # feather lines: the plate's dark marks plus local dips in tone (the engraver's lines), kept off the outer edge
    dip = L - gaussian_filter(L, 5 * S)
    ink = ((L < .30) | (dip < -.055)) & binary_opening(sil, iterations=3 * S)
    ink = gaussian_filter(ink.astype('f4'), .8) > .5
    def canvas(m):
        c = np.zeros((GH * S, GW * S), bool); hh, ww = m.shape
        x0, y0 = x * S, y * S; c[y0:y0 + hh, x0:x0 + ww] = m[:GH * S - y0, :GW * S - x0]; return c
    return canvas(sil), canvas(ink)
def write(name, sil, ink):
    for k, m in (('fill', sil), ('ink', ink)):
        Image.fromarray(np.where(m, 0, 255).astype('uint8')).save(f'art/{name}-{k}.png')   # black ink on white
    subprocess.run(['python3', 'art_trace.py', f'art/{name}.svg', f'relief=art/{name}-fill.png', f'ink=art/{name}-ink.png'], check=True)
write('birds-front', *layers('assets/hero-kingfisher.png', (52, 236, 540)))
write('birds-back', *layers('assets/hero-flamingo.png', (628, 862, 420)))
print('ok')
