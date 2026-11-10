"""Goku as coloured line art: outlines of the dark ink, one SVG per colour group (by area of the picture).
   python3 trace_lines.py ART.jpg OUTPREFIX X0 Y0 X1 Y1"""
import sys, cv2, numpy as np
art, pre = sys.argv[1], sys.argv[2]; X0, Y0, X1, Y1 = map(float, sys.argv[3:7])
im = cv2.imread(art); k = 4
big = cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
lum = cv2.GaussianBlur(cv2.cvtColor(big, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255, (0, 0), 3.2)
ink = (lum < 0.11).astype(np.uint8) * 255
ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=3)
ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), iterations=1)
H, W = ink.shape
cs, _ = cv2.findContours(ink, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
sx, sy = (X1 - X0) / W, (Y1 - Y0) / H
def group(cx, cy):                      # areas of the picture, as fractions of width and height
    u, v = cx / W, cy / H
    if v < 0.30 or (v < 0.45 and (u < 0.2 or u > 0.85)): return 'hair'
    if v < 0.64 and 0.22 < u < 0.86: return 'face'
    if v < 0.64: return 'shoulders'
    return 'body'
groups = {}
for c in cs:
    if cv2.contourArea(c) < 900 and cv2.arcLength(c, True) < 400: continue      # drop grain
    c = cv2.approxPolyDP(c, 1.2, True)[:, 0, :].astype(float)
    if len(c) < 3: continue
    m = c.mean(0); g = group(*m)
    groups.setdefault(g, []).append('M' + ' L'.join(f'{X0 + x * sx:.1f} {Y0 + y * sy:.1f}' for x, y in c) + ' Z')
for g, parts in groups.items():
    open(f'{pre}-{g}.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1240 1829"><path fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" d="{" ".join(parts)}"/></svg>')
    print(g, len(parts), 'outlines')
