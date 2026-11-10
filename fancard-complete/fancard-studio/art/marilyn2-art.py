# Marilyn concept card v2 artwork, on the 1240x1829 grid (card body = [80,80,1080,1669]).
# Writes art/marilyn2-art.svg with layers:
#   #frame     frame 1: heavy chrome ironwork covering the card edges (corner scrolls, side curls, crest, pendant break out)
#   #groove    engraved groove down the heavy strokes
#   #nature    frame 2: an engraved vine-and-leaf band cut into the mirror
#   #textfront the square text band round the photo (films + years)
#   #textback  the square text band round the back panel
import math, os, base64
HERE = os.path.dirname(os.path.abspath(__file__))
W, H, CX, CY = 1240, 1829, 620, 914.5

def bez(p0, p1, p2, p3, n=60):
    return [((1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t*t*p2[0] + t**3*p3[0],
             (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t*t*p2[1] + t**3*p3[1]) for t in (i / n for i in range(n + 1))]
def spiral(end, prev, r0, turns=1.35, n=70, sign=1):
    dx, dy = end[0] - prev[0], end[1] - prev[1]; L = math.hypot(dx, dy) or 1; dx, dy = dx / L, dy / L
    cx, cy = end[0] - dy * sign * r0, end[1] + dx * sign * r0
    a0 = math.atan2(end[1] - cy, end[0] - cx)
    return [(cx + math.cos(a0 + sign * t * turns * 6.2832) * r0 * (1 - .78 * t), cy + math.sin(a0 + sign * t * turns * 6.2832) * r0 * (1 - .78 * t)) for t in (i / n for i in range(1, n + 1))]
def taper(pts, w0, wm, w1):
    n = len(pts); L, R = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, n - 1)]; dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1
        t = i / (n - 1); w = w0 + (wm - w0) * (t / .5) ** .7 if t <= .5 else wm + (w1 - wm) * ((t - .5) / .5) ** 1.3
        L.append((x - dy / l * w / 2, y + dx / l * w / 2)); R.append((x + dy / l * w / 2, y - dx / l * w / 2))
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in L + R[::-1]) + " Z"
def pl(pts): return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
def rr(x0, y0, x1, y1, r): return f"M{x0+r},{y0} H{x1-r} Q{x1},{y0} {x1},{y0+r} V{y1-r} Q{x1},{y1} {x1-r},{y1} H{x0+r} Q{x0},{y1} {x0},{y1-r} V{y0+r} Q{x0},{y0} {x0+r},{y0} Z"

# ── frame 1 · heavy ironwork on the card edges ───────────────────────────────
strokes = []
def add4(pts, w0, wm, w1, sym=(True, True)):
    for fx in ((False, True) if sym[0] else (False,)):
        for fy in ((False, True) if sym[1] else (False,)):
            strokes.append(([(W - x if fx else x, H - y if fy else y) for x, y in pts], w0, wm, w1))
# corner heart: two scrolls rising from the top bar and the side bar, curling into the corner
a = bez((360, 112), (250, 58), (140, 40), (92, 100)); add4(a + spiral(a[-1], a[-3], 34, 1.35, sign=-1), 12, 30, 9)
b = bez((112, 360), (58, 250), (40, 140), (100, 92)); add4(b + spiral(b[-1], b[-3], 34, 1.35, sign=1), 12, 30, 9)
c = bez((210, 112), (190, 170), (150, 190), (112, 210)); add4(c, 10, 16, 10)                              # brace inside the corner
# side bulges: swell out past the card edge mid-height, curl at both ends
s1 = bez((112, 700), (36, 760), (20, 860), (60, 914)); add4(s1 + spiral(s1[-1], s1[-3], 22, 1.2, sign=1), 12, 30, 6)
s2 = bez((112, 760), (170, 820), (176, 880), (150, 914)); add4(s2 + spiral(s2[-1], s2[-3], 16, 1.1, sign=-1), 10, 16, 5)
# crest + pendant (break out top and bottom)
cr = bez((620, 112), (560, 150), (470, 150), (430, 104)); add4(cr + spiral(cr[-1], cr[-3], 32, 1.4, sign=1), 26, 30, 9, sym=(True, True))
for y0, y1 in ((112, 6), (1717, 1823)):
    strokes.append(([(CX, y0), (CX, (y0 * 2 + y1) / 3), (CX, (y0 + y1 * 2) / 3), (CX, y1)], 30, 26, 3))
bars = [rr(96, 96, 1144, 1733, 46)]                                                       # heavy edge bar (stroke)
relief = "".join(f'<path d="{taper(p, a_, b_, c_)}"/>' for p, a_, b_, c_ in strokes)
relief += "".join(f'<circle cx="{CX}" cy="{y}" r="{r}"/>' for y, r in ((112, 30), (1717, 30)))
groove = "".join(f'<path d="{pl(p[2:-6])}"/>' for p, a_, b_, c_ in strokes if b_ >= 26)
groove += f'<path d="{rr(96, 96, 1144, 1733, 46)}"/>'

# ── frame 2 · engraved vines and leaves in the mirror ────────────────────────
def perim(x0, y0, x1, y1, step=3):
    pts = []
    for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        L = math.hypot(bx - ax, by - ay); n = int(L / step)
        pts += [(ax + (bx - ax) * i / n, ay + (by - ay) * i / n, (by - ay) / L, -(bx - ax) / L) for i in range(n)]
    return pts
P = perim(176, 176, 1064, 1653)
vine = [(x + nx * 9 * math.sin(i * .055), y + ny * 9 * math.sin(i * .055)) for i, (x, y, nx, ny) in enumerate(P)]
leaves = []
for i in range(30, len(P), 38):
    x, y, nx, ny = P[i]; side = 1 if (i // 38) % 2 else -1
    vx, vy = vine[i]; tx, ty = -ny, nx
    dx, dy = nx * side * .8 + tx * .6, ny * side * .8 + ty * .6; L_ = math.hypot(dx, dy); dx, dy = dx / L_, dy / L_
    ex, ey = vx + dx * 34, vy + dy * 34; mx, my = (vx + ex) / 2, (vy + ey) / 2
    leaves.append(f'M{vx:.1f},{vy:.1f} Q{mx - dy * 12:.1f},{my + dx * 12:.1f} {ex:.1f},{ey:.1f} Q{mx + dy * 12:.1f},{my - dx * 12:.1f} {vx:.1f},{vy:.1f} M{vx + dx * 6:.1f},{vy + dy * 6:.1f} L{ex - dx * 6:.1f},{ey - dy * 6:.1f}')
    if (i // 38) % 3 == 0:                                                                    # a tiny bud
        bx_, by_ = vx - dx * 18 + tx * 8, vy - dy * 18 + ty * 8
        leaves.append(f'M{bx_ + 6:.1f},{by_:.1f} A6,6 0 1 1 {bx_ - 6:.1f},{by_:.1f} A6,6 0 1 1 {bx_ + 6:.1f},{by_:.1f}')
nature = f'<path d="{pl(vine)}"/>' + "".join(f'<path d="{d}"/>' for d in leaves)
nature += f'<path d="{rr(150, 150, 1090, 1679, 30)}"/><path d="{rr(204, 204, 1036, 1625, 18)}"/>'

# ── square text bands ────────────────────────────────────────────────────────
font = base64.b64encode(open(os.path.join(HERE, '..', 'fonts', 'bodoni-moda', 'files', 'bodoni-moda-latin-400-normal.woff2'), 'rb').read()).decode()
FILMS = ("NIAGARA 1953  ·  GENTLEMEN PREFER BLONDES 1953  ·  HOW TO MARRY A MILLIONAIRE 1953  ·  "
         "THE SEVEN YEAR ITCH 1955  ·  BUS STOP 1956  ·  SOME LIKE IT HOT 1959  ·  THE MISFITS 1961  ·  "
         "CONCEPT CARD  ·  NOT FOR SALE  ·  ")
def band(idn, x0, y0, x1, y1, size, text):
    per = 2 * (x1 - x0 + y1 - y0) - 8 * 14 + 2 * math.pi * 14
    return (f'<path id="{idn}p" d="{rr(x0, y0, x1, y1, 14)}" fill="none"/>'
            f'<text font-family="BodoniBand" font-size="{size}" fill="#000"><textPath href="#{idn}p" textLength="{per - 6:.0f}" lengthAdjust="spacing">{text}</textPath></text>'
            f'<path d="{rr(x0 - 16, y0 - 30, x1 + 16, y1 + 16, 24)}" fill="none" stroke="#000" stroke-width="2"/>'
            f'<path d="{rr(x0 + 12, y0 + 12, x1 - 12, y1 - 12, 8)}" fill="none" stroke="#000" stroke-width="1.6"/>')
textfront = band('tf', 288, 330, 952, 1238, 19, FILMS)
textback = band('tb', 288, 330, 952, 1238, 19, "FANCARD  ·  Nº 001  ·  " + FILMS + "MARILYN MONROE  ·  1926 – 1962  ·  ")

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       f'<style>@font-face{{font-family:"BodoniBand";src:url(data:font/woff2;base64,{font}) format("woff2")}}</style>'
       f'<g id="frame" fill="#fff">{relief}<path d="{bars[0]}" fill="none" stroke="#fff" stroke-width="34"/></g>'
       f'<g id="groove" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round">{groove}</g>'
       f'<g id="nature" fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round">{nature}</g>'
       f'<g id="textfront">{textfront}</g><g id="textback">{textback}</g></svg>')
open(os.path.join(HERE, 'marilyn2-art.svg'), 'w').write(svg); print('ok')
