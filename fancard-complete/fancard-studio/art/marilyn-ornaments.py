# Heavy art-nouveau "whiplash" ironwork for the Marilyn concept card.
# Writes art/marilyn-ornaments.svg on the 1240x1829 grid (card body = [80,80,1080,1669]).
#   #relief  tapered mirror strokes + spiral curls (some deliberately run past the photo frame and the card edge)
#   #ink     an engraved groove down the middle of every stroke (mirror engraving)
import math, os, sys
W, H, CX = 1240, 1829, 620

def bez(p0, p1, p2, p3, n=60):
    out = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        out.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return out

def path(*segs):
    pts = []
    for s in segs: pts += s if not pts else s[1:]
    return pts

def spiral(end, prev, r0, turns=1.35, n=70, sign=1):
    """Curl that continues smoothly from the direction prev->end, winding inward."""
    dx, dy = end[0] - prev[0], end[1] - prev[1]; L = math.hypot(dx, dy) or 1; dx, dy = dx / L, dy / L
    nx, ny = -dy * sign, dx * sign                                 # centre lies to this side
    cx, cy = end[0] + nx * r0, end[1] + ny * r0
    a0 = math.atan2(end[1] - cy, end[0] - cx)
    pts = []
    for i in range(1, n + 1):
        t = i / n; a = a0 + sign * t * turns * 2 * math.pi; r = r0 * (1 - .78 * t)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts

def taper(pts, w0, wm, w1):
    """Polygon of a stroke whose width swells from w0 to wm (middle) to w1."""
    n = len(pts); L, R = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1
        t = i / (n - 1)
        w = w0 + (wm - w0) * (t / .5) ** .7 if t <= .5 else wm + (w1 - wm) * ((t - .5) / .5) ** 1.3
        nx, ny = -dy / l * w / 2, dx / l * w / 2
        L.append((x + nx, y + ny)); R.append((x - nx, y - ny))
    poly = L + R[::-1]
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in poly) + " Z"

def line(pts):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

def mirror(pts): return [(W - x, y) for x, y in pts]

strokes = []   # (points, w0, wm, w1)
def add(pts, w0, wm, w1, both=True):
    strokes.append((pts, w0, wm, w1))
    if both: strokes.append((mirror(pts), w0, wm, w1))

# 1 · the great side columns: rise from below the card, swell past the card edge, end in a curl at the top
col = path(bez((150, 1800), (90, 1650), (58, 1450), (122, 1300)),
           bez((122, 1300), (186, 1150), (268, 1060), (226, 905)),          # dips across the photo edge
           bez((226, 905), (176, 752), (28, 660), (44, 520)),               # bulges out past the card edge
           bez((44, 520), (58, 386), (162, 300), (206, 246)))
add(col + spiral(col[-1], col[-3], 44, 1.45, sign=-1), 14, 58, 12)
# 2 · tendril into the photo's lower corner
t2 = bez((122, 1300), (206, 1268), (292, 1252), (318, 1176))
add(t2 + spiral(t2[-1], t2[-3], 26, 1.35, sign=-1), 16, 26, 7)
# 3 · tendril into the photo's upper corner
t3 = bez((44, 520), (122, 470), (232, 420), (286, 330))
add(t3 + spiral(t3[-1], t3[-3], 28, 1.35, sign=1), 16, 28, 7)
# 4 · counter-curl hooking off the column belly (adds the "iron" weight)
t4 = bez((60, 640), (8, 700), (-4, 800), (40, 860))
add(t4 + spiral(t4[-1], t4[-3], 24, 1.2, sign=1), 14, 24, 7)
# 4b · a second whiplash woven through the column (crosses it twice)
w2 = path(bez((262, 1806), (316, 1620), (104, 1520), (82, 1392)),
          bez((82, 1392), (60, 1262), (168, 1176), (132, 1040)),
          bez((132, 1040), (110, 954), (60, 930), (70, 860)))
add(w2 + spiral(w2[-1], w2[-3], 34, 1.4, sign=1), 10, 34, 9)
# 4c · upper sweep: from the top curl down over the photo's top edge
w3 = bez((206, 246), (300, 196), (420, 210), (470, 300))
add(w3 + spiral(w3[-1], w3[-3], 24, 1.3, sign=-1), 18, 22, 6)
# 5 · crest: two scrolls meet over the top edge, plus a central spire
cr = bez((620, 96), (560, 150), (470, 156), (420, 118))
add(cr + spiral(cr[-1], cr[-3], 38, 1.4, sign=1), 26, 36, 9)
cr2 = bez((620, 120), (590, 70), (540, 40), (500, 54))
add(cr2 + spiral(cr2[-1], cr2[-3], 20, 1.25, sign=1), 14, 18, 5)
strokes.append(([(CX, 4), (CX, 60), (CX, 140), (CX, 250)], 4, 34, 4))
# 6 · base: scrolls and a pendant drop below the bottom edge
bs = bez((620, 1706), (560, 1670), (470, 1690), (440, 1748))
add(bs + spiral(bs[-1], bs[-3], 34, 1.4, sign=-1), 26, 32, 9)
strokes.append(([(CX, 1640), (CX, 1720), (CX, 1790), (CX, 1826)], 5, 36, 3))

def leaf(x, y, ang, L, Wd):
    c, s_ = math.cos(ang), math.sin(ang); px, py = -s_, c
    tip = (x + c * L, y + s_ * L); m1 = (x + c * L * .45 + px * Wd, y + s_ * L * .45 + py * Wd); m2 = (x + c * L * .45 - px * Wd, y + s_ * L * .45 - py * Wd)
    return (f'M{x:.0f},{y:.0f} Q{m1[0]:.0f},{m1[1]:.0f} {tip[0]:.0f},{tip[1]:.0f} Q{m2[0]:.0f},{m2[1]:.0f} {x:.0f},{y:.0f}Z',
            f'M{x + c * 8:.0f},{y + s_ * 8:.0f} L{tip[0] - c * 10:.0f},{tip[1] - s_ * 10:.0f}')
LEAVES = [(122, 1300, -2.5, 96, 30), (44, 520, 2.6, 84, 26), (226, 905, -.4, 80, 24), (132, 1040, 2.9, 70, 22), (470, 152, -2.2, 70, 20), (440, 1748, .5, 72, 22)]
lv = [leaf(*l) for l in LEAVES] + [leaf(W - l[0], l[1], math.pi - l[2], l[3], l[4]) for l in LEAVES]
relief = "".join(f'<path d="{taper(p, a, b, c)}"/>' for p, a, b, c in strokes) + "".join(f'<path d="{a}"/>' for a, _ in lv)
ink = "".join(f'<path d="{line(p[2:-6])}"/>' for p, a, b, c in strokes if b >= 18) + "".join(f'<path d="{v}"/>' for _, v in lv)
# spire + drop knots
knots = "".join(f'<circle cx="{CX}" cy="{y}" r="{r}"/>' for y, r in ((96, 26), (250, 12), (1706, 24)))
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       f'<g id="relief" fill="#fff">{relief}{knots}</g>'
       f'<g id="ink" fill="none" stroke="#000" stroke-width="3.4" stroke-linecap="round">{ink}</g></svg>')
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'marilyn-ornaments.svg')
open(out, 'w').write(svg); print('ok', len(strokes), 'strokes')
