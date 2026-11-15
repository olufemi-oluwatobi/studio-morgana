#!/usr/bin/env python3
"""Cut a subject out of a photo: IS-Net (rembg) for the matte, then a clean edge and true foreground colour.
Usage: python3 tools/cutout.py IN.jpg OUT.png
Used by godtongue's "print @photo.jpg …, cut out"; the result is cached beside the photo in .gt-cache/."""
import sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, binary_opening, binary_dilation, label
src, dst = sys.argv[1], sys.argv[2]
Image.MAX_IMAGE_PIXELS = None
im = Image.open(src).convert('RGB')
if max(im.size) > 2400: im.thumbnail((2400, 2400), Image.LANCZOS)
from rembg import remove, new_session
a = np.asarray(remove(im, session=new_session('isnet-general-use'), only_mask=True), dtype=np.float64) / 255
# keep the subject: the biggest piece and anything at least 3% of it; trim loose threads; soften the edge a touch
lab, n = label(a > .5); sz = np.bincount(lab.ravel()); sz[0] = 0
keep = np.isin(lab, np.where(sz >= sz.max() * .03)[0]) if n else a > .5
yy, xx = np.mgrid[-3:4, -3:4]; inside = binary_opening(keep, structure=(xx ** 2 + yy ** 2) <= 9)
a = np.clip(a * gaussian_filter(binary_dilation(inside, iterations=1).astype(float), .8), 0, 1)
rgb = np.asarray(im, dtype=np.float64) / 255
try:
    from pymatting import estimate_foreground_ml
    rgb = np.clip(estimate_foreground_ml(rgb, a), 0, 1)       # the subject's own colour at the edge, not the backdrop's
except Exception:
    pass
Image.fromarray((np.dstack([rgb, a]) * 255).astype(np.uint8), 'RGBA').save(dst)
print('cut out', dst, im.size)
