"""Trace the dark ink of the Goku art into a filled SVG, placed in card-grid coordinates over the window.
   python3 trace_ink.py ART.jpg OUT.svg X0 Y0 X1 Y1 [--thresh 0.2]"""
import sys, cv2, numpy as np
art, out = sys.argv[1], sys.argv[2]
X0, Y0, X1, Y1 = map(float, sys.argv[3:7])
th = float(sys.argv[sys.argv.index('--thresh') + 1]) if '--thresh' in sys.argv else 0.2
im = cv2.imread(art)
k = 4                                                      # work at 4x so curves stay smooth when enlarged onto the card
big = cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
lum = cv2.cvtColor(big, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
lum = cv2.GaussianBlur(lum, (0, 0), 1.6 * k / 2)           # soften the print grain before choosing ink
ink = (lum < th).astype(np.uint8) * 255
ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=2)
ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=1)
n, lab, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
keep = np.zeros_like(ink)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= 60 * k * k / 4: keep[lab == i] = 255     # drop specks of texture
cs, hier = cv2.findContours(keep, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
sx, sy = (X1 - X0) / keep.shape[1], (Y1 - Y0) / keep.shape[0]
parts = []
for c in cs:
    if len(c) < 6: continue
    c = cv2.approxPolyDP(c, 0.9, True)[:, 0, :].astype(float)
    if len(c) < 3: continue
    pts = [(X0 + x * sx, Y0 + y * sy) for x, y in c]
    parts.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + ' Z')
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 1829"><path fill="#fff" fill-rule="evenodd" d="{" ".join(parts)}"/></svg>'
open(out, 'w').write(svg)
cv2.imwrite(out.replace('.svg', '-mask.png'), keep)
print(len(parts), 'shapes,', round(len(svg) / 1024), 'KB, ink covers', round((keep > 0).mean() * 100, 1), '% of the window')
