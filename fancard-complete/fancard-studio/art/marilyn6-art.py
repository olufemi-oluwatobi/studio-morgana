# Marilyn concept card v6 artwork (v4 chrome frame + gold rims on the studs only + back cover in an engraved damask filigree) (studded bezel; committed flower band with patterns beneath), on the 1240x1829 grid (card body = [80,80,1080,1669]).
# Writes art/marilyn6-art.svg with layers:
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


# ── studs: crystal rhinestones on the bar + chrome beads between ─────────────
def bar_points(x0, y0, x1, y1, step):
    out = []
    for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        L = math.hypot(bx - ax, by - ay); n = int(L // step)
        out += [(ax + (bx - ax) * i / n, ay + (by - ay) * i / n) for i in range(n)]
    return out
BAR = (96, 96, 1144, 1733)
def near_feature(x, y):      # keep studs off the corner hearts, side bulges, crest and pendant
    if (x < 400 or x > 840) and (y < 400 or y > 1429): return True
    if (x < 140 or x > 1100) and 660 < y < 1000: return True
    if 470 < x < 770 and (y < 160 or y > 1670): return True
    return False
pts = [p for p in bar_points(*BAR, 38) if not near_feature(*p)]
studs = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11"/>' for i, (x, y) in enumerate(pts))
beads = "".join(f'<circle cx="{(a[0] + b[0]) / 2:.1f}" cy="{(a[1] + b[1]) / 2:.1f}" r="4.5"/>' for a, b in zip(pts, pts[1:])
                if math.hypot(a[0] - b[0], a[1] - b[1]) < 60)
BIG = [(92, 92, 24), (1148, 92, 24), (92, 1737, 24), (1148, 1737, 24), (CX, 112, 22), (CX, 1717, 22),
       (60, 914, 18), (1180, 914, 18), (150, 914, 12), (1090, 914, 12)]
studs += "".join(f'<circle cx="{x}" cy="{y}" r="{r}"/>' for x, y, r in BIG)
rims_small = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="16"/>' for x, y in pts)
settings = "".join(f'<circle cx="{x}" cy="{y}" r="{r + 7}"/>' for x, y, r in BIG)             # chrome collet round each big stone

# ── frame 2 · engraved vines in the bezel (gap at top centre for the wordmark) ─
def perim(x0, y0, x1, y1, step=3):
    pts = []
    for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        L = math.hypot(bx - ax, by - ay); n = int(L / step)
        pts += [(ax + (bx - ax) * i / n, ay + (by - ay) * i / n, (by - ay) / L, -(bx - ax) / L) for i in range(n)]
    return pts
P = perim(168, 168, 1072, 1661)
gap = lambda x, y: y < 200 and 440 < x < 800
segs, cur = [], []
for i, (x, y, nx, ny) in enumerate(P):
    if gap(x, y):
        if cur: segs.append(cur); cur = []
        continue
    cur.append((x + nx * 9 * math.sin(i * .055), y + ny * 9 * math.sin(i * .055)))
if cur: segs.append(cur)
leaves = []
for i in range(30, len(P), 38):
    x, y, nx, ny = P[i]
    if gap(x, y): continue
    side = 1 if (i // 38) % 2 else -1
    vx, vy = x + nx * 9 * math.sin(i * .055), y + ny * 9 * math.sin(i * .055); tx, ty = -ny, nx
    dx, dy = nx * side * .8 + tx * .6, ny * side * .8 + ty * .6; L_ = math.hypot(dx, dy); dx, dy = dx / L_, dy / L_
    ex, ey = vx + dx * 30, vy + dy * 30; mx, my = (vx + ex) / 2, (vy + ey) / 2
    leaves.append(f'M{vx:.1f},{vy:.1f} Q{mx - dy * 11:.1f},{my + dx * 11:.1f} {ex:.1f},{ey:.1f} Q{mx + dy * 11:.1f},{my - dx * 11:.1f} {vx:.1f},{vy:.1f} M{vx + dx * 6:.1f},{vy + dy * 6:.1f} L{ex - dx * 6:.1f},{ey - dy * 6:.1f}')
blossoms = []
for i in range(49, len(P), 76):                                   # five-petal blossoms between the leaves
    x, y, nx, ny = P[i]
    if gap(x, y): continue
    vx, vy = x + nx * 9 * math.sin(i * .055), y + ny * 9 * math.sin(i * .055)
    for k in range(5):
        a_ = k / 5 * 6.2832 + i
        px, py = vx + math.cos(a_) * 9, vy + math.sin(a_) * 9
        blossoms.append(f'M{vx:.1f},{vy:.1f} Q{vx + math.cos(a_ - .55) * 15:.1f},{vy + math.sin(a_ - .55) * 15:.1f} {vx + math.cos(a_) * 17:.1f},{vy + math.sin(a_) * 17:.1f} '
                        f'Q{vx + math.cos(a_ + .55) * 15:.1f},{vy + math.sin(a_ + .55) * 15:.1f} {vx:.1f},{vy:.1f}')
    blossoms.append(f'M{vx + 3.5:.1f},{vy:.1f} A3.5,3.5 0 1 1 {vx - 3.5:.1f},{vy:.1f} A3.5,3.5 0 1 1 {vx + 3.5:.1f},{vy:.1f}')
nature = "".join(f'<path d="{pl(s_)}"/>' for s_ in segs) + "".join(f'<path d="{d}"/>' for d in leaves) + "".join(f'<path d="{d}"/>' for d in blossoms)

# ── patterns beneath the flower band: fine crosshatch in the mirror + ivory dot rows either side ──
hatch = []
for k in range(-1900, 1300, 10):
    hatch.append(f'M{k},0 L{k + 1829},1829'); hatch.append(f'M{k + 1829},0 L{k},1829')
underlay = (f'<clipPath id="strip"><path fill-rule="evenodd" d="{rr(134, 134, 1106, 1695, 34)} {rr(206, 206, 1034, 1623, 16)}"/></clipPath>'
            f'<g clip-path="url(#strip)"><path d="{" ".join(hatch)}" stroke="#000" stroke-width="1.1" fill="none"/></g>')
def dotrow(x0, y0, x1, y1, step=13, r=2.6):
    out = []
    for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        L = math.hypot(bx - ax, by - ay); n = int(L // step)
        for i in range(n):
            x, y = ax + (bx - ax) * i / n, ay + (by - ay) * i / n
            if 430 < x < 810 and y < 212: continue
            out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}"/>')
    return "".join(out)
dots = dotrow(140, 140, 1100, 1689) + dotrow(200, 200, 1040, 1629)

# ── square text band in the bezel, open at top centre ────────────────────────
font = base64.b64encode(open(os.path.join(HERE, '..', 'fonts', 'bodoni-moda', 'files', 'bodoni-moda-latin-400-normal.woff2'), 'rb').read()).decode()
FILMS = ("NIAGARA 1953  ·  GENTLEMEN PREFER BLONDES 1953  ·  HOW TO MARRY A MILLIONAIRE 1953  ·  THE SEVEN YEAR ITCH 1955  ·  "
         "BUS STOP 1956  ·  SOME LIKE IT HOT 1959  ·  THE MISFITS 1961  ·  CONCEPT CARD  ·  NOT FOR SALE")
x0, y0, x1, y1, r = 222, 222, 1018, 1607, 12
band_d = (f"M790,{y0} H{x1 - r} Q{x1},{y0} {x1},{y0 + r} V{y1 - r} Q{x1},{y1} {x1 - r},{y1} H{x0 + r} Q{x0},{y1} {x0},{y1 - r} "
          f"V{y0 + r} Q{x0},{y0} {x0 + r},{y0} H450")
band_len = (x1 - r - 790) + (y1 - y0 - 2 * r) * 2 + (x1 - x0 - 2 * r) + (450 - x0 - r) + 4 * (math.pi * r / 2)
def band(idn, text):
    return (f'<path id="{idn}" d="{band_d}" fill="none"/>'
            f'<text font-family="BodoniBand" font-size="18" fill="#000" dy="6"><textPath href="#{idn}" textLength="{band_len - 4:.0f}" lengthAdjust="spacing">{text}</textPath></text>')
textfront = band('tf', FILMS)
textback = band('tb', "MARILYN MONROE  ·  1926 – 1962  ·  " + FILMS)
# ── back cover: engraved damask filigree (mirror-symmetric scroll-and-leaf motif, tiled on a half-drop grid) ──
def motif(cx, cy):
    out = []
    for fx in (1, -1):
        for fy in (1, -1):
            T = lambda q: [(cx + fx * x, cy + fy * y) for x, y in q]
            sc = bez((0, -70), (34, -80), (68, -54), (54, -22)); sc = sc + spiral(sc[-1], sc[-3], 15, 1.3, sign=-1)
            out.append(pl(T(sc)))
            sc2 = bez((0, -38), (22, -40), (36, -22), (28, -6)); out.append(pl(T(sc2 + spiral(sc2[-1], sc2[-3], 8, 1.2, sign=-1))))
            out.append(pl(T(bez((0, -70), (14, -86), (10, -100), (0, -112), n=20))) + ' ' + pl(T(bez((0, -112), (-10, -100), (-14, -86), (0, -70), n=20))))
    out.append(f'M{cx},{cy-24} L{cx+14},{cy} L{cx},{cy+24} L{cx-14},{cy} Z')
    out.append(f'M{cx+3.5},{cy} A3.5,3.5 0 1 1 {cx-3.5},{cy} A3.5,3.5 0 1 1 {cx+3.5},{cy}')
    return out
pat = []
for row, gy in enumerate(range(110, 1860, 240)):
    for gx in range(20 + (95 if row % 2 else 0), 1300, 190):
        pat += motif(gx, gy)
backpat = f'<g fill="none" stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="{" ".join(pat)}"/></g>'
inner = f'<path d="{rr(240, 240, 1000, 1589, 10)}" fill="none" stroke="#fff" stroke-width="5"/>'      # chrome bead round the photo

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       f'<style>@font-face{{font-family:"BodoniBand";src:url(data:font/woff2;base64,{font}) format("woff2")}}</style>'
       f'<g id="frame" fill="#fff">{relief}<path d="{bars[0]}" fill="none" stroke="#fff" stroke-width="34"/>{inner}</g>'
       f'<g id="rims" fill="#fff">{rims_small}{settings}</g>'
       f'<g id="backpat">{backpat}</g>'
       f'<g id="groove" fill="none" stroke="#000" stroke-width="3.2" stroke-linecap="round">{groove}</g>'
       f'<g id="studs" fill="#fff">{studs}</g>'
       f'<g id="beads" fill="#fff">{beads}</g>'
       f'<g id="nature" fill="none" stroke="#000" stroke-width="2.8" stroke-linecap="round">{nature}</g>'
       f'<g id="underlay">{underlay}</g><g id="dots" fill="#000">{dots}</g>'
       f'<g id="textfront">{textfront}</g><g id="textback">{textback}</g></svg>')
open(os.path.join(HERE, 'marilyn6-art.svg'), 'w').write(svg); print('ok', len(pts), 'studs')
