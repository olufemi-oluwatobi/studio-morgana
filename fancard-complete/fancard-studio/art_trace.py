#!/usr/bin/env python3
"""
art_trace.py · turn ink drawings into a layered Fancard artwork SVG
====================================================================
An artist draws each process layer in black ink on white (or exports PNGs).
This traces each one to vector paths and stacks them as named SVG groups, ready for:

    components:
      frame-art: { kind: artwork, src: art/frame.svg, layers: { fill: "#relief", veins: "#ink" } }

Usage
  python3 art_trace.py OUT.svg relief=fill.png ink=lines.png [--grid 1080x1669] [--invert]
  (pass --invert when the PNG is white ink on black, e.g. a Fancard mask export)
"""
import sys, numpy as np, potrace
from PIL import Image

def trace(path, W, H, invert):
    im = Image.open(path).convert('L').resize((W * 2, H * 2), Image.LANCZOS)   # trace at 2x so hairlines survive
    a = np.asarray(im).astype('f4') / 255
    ink = a > .5 if invert else a < .5
    plist = potrace.Bitmap(~ink).trace(   # potracer traces False pixels
        turdsize=2, alphamax=1.0, opticurve=True, opttolerance=.2)
    d = []
    for curve in plist:
        sp = curve.start_point; d.append(f'M{sp.x:.2f},{sp.y:.2f}')
        for seg in curve.segments:
            if seg.is_corner:
                d.append(f'L{seg.c.x:.2f},{seg.c.y:.2f}L{seg.end_point.x:.2f},{seg.end_point.y:.2f}')
            else:
                d.append(f'C{seg.c1.x:.2f},{seg.c1.y:.2f} {seg.c2.x:.2f},{seg.c2.y:.2f} {seg.end_point.x:.2f},{seg.end_point.y:.2f}')
        d.append('Z')
    return ''.join(d), len(plist)

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if len(args) < 2: sys.exit(__doc__)
    W, H = 1080, 1669
    for a in sys.argv:
        if a.startswith('--grid'): W, H = map(int, a.split('=')[-1].split('x'))
    invert = '--invert' in sys.argv
    groups = []
    for spec in args[1:]:
        name, path = spec.split('=', 1)
        d, n = trace(path, W, H, invert)
        groups.append(f'  <g id="{name}" transform="scale(.5)"><path fill="#000" fill-rule="evenodd" d="{d}"/></g>')
        print(f'· {name}: {n} shapes')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">\n'
           + '\n'.join(groups) + '\n</svg>\n')
    open(args[0], 'w').write(svg)
    print(f'✓ {args[0]} ({len(svg) / 1024:.0f} KB)')

if __name__ == '__main__':
    main()
