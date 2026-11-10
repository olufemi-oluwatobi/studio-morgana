# Goku card line art, on the 1240x1829 grid (card body x 80..1160, y 80..1749, corners 54).
# Writes one SVG per layer (everything drawn is gold; alpha is the mask):
#   goku-edge.svg       front: gold band on the card edge, inscription strip, keyline round the art
#   goku-back.svg       back: inner rules (the gold band and its inscription come from goku-edge), fireball sun stamp, nimbus clouds,
#                       seven dragon-ball medallions, title lines, small stars
#   goku-scales.svg     back: seigaiha wave scales filling the field, cleared round every motif
import math, os, base64
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = '/home/claude/src/fancard-complete/fancard-studio/fonts'
W, H, CX = 1240, 1829, 620
X0, Y0, X1, Y1 = 80, 80, 1160, 1749

def font(fam, f):
    b = base64.b64encode(open(os.path.join(FONTS, fam, 'files', f), 'rb').read()).decode()
    return b
STYLE = ('<style>'
         f'@font-face{{font-family:"GJost";src:url(data:font/woff2;base64,{font("jost", "jost-latin-500-normal.woff2")}) format("woff2")}}'
         f'@font-face{{font-family:"GBod";src:url(data:font/woff2;base64,{font("bodoni-moda", "bodoni-moda-latin-700-italic.woff2")}) format("woff2")}}'
         f'@font-face{{font-family:"GHand";src:url(data:font/woff2;base64,{font("homemade-apple", "homemade-apple-latin-400-normal.woff2")}) format("woff2")}}'
         f'@font-face{{font-family:"GBodR";src:url(data:font/woff2;base64,{font("bodoni-moda", "bodoni-moda-latin-500-normal.woff2")}) format("woff2")}}'
         '</style>')
def svg(body, defs=''):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">{STYLE}<defs>{defs}</defs>{body}</svg>'
def rr(x0, y0, x1, y1, r):
    return f"M{x0+r},{y0} H{x1-r} Q{x1},{y0} {x1},{y0+r} V{y1-r} Q{x1},{y1} {x1-r},{y1} H{x0+r} Q{x0},{y1} {x0},{y1-r} V{y0+r} Q{x0},{y0} {x0+r},{y0} Z"
def ring(x0, y0, x1, y1, r, w):            # stroked rounded rect
    return f'<path d="{rr(x0, y0, x1, y1, r)}" fill="none" stroke="#fff" stroke-width="{w}"/>'
def circ(cx, cy, r, w=None):
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" ' + (f'fill="none" stroke="#fff" stroke-width="{w}"/>' if w else 'fill="#fff"/>')
def star(cx, cy, R, n=5, k=.42, rot=-90):
    pts = []
    for i in range(2 * n):
        a = math.radians(rot + i * 180 / n); r = R if i % 2 == 0 else R * k
        pts.append(f"{cx + r*math.cos(a):.1f},{cy + r*math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="#fff"/>'
def spark(cx, cy, s):
    k = s * .16
    return (f'<path fill="#fff" d="M{cx},{cy-s} Q{cx+k},{cy-k} {cx+s*.7},{cy} Q{cx+k},{cy+k} {cx},{cy+s} '
            f'Q{cx-k},{cy+k} {cx-s*.7},{cy} Q{cx-k},{cy-k} {cx},{cy-s}Z"/>')
def taper(pts, w0, w1):
    n = len(pts); L, R = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, n - 1)]; dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1
        w = w0 + (w1 - w0) * i / (n - 1)
        L.append((x - dy / l * w / 2, y + dx / l * w / 2)); R.append((x + dy / l * w / 2, y - dx / l * w / 2))
    return '<path fill="#fff" d="M' + " L".join(f"{x:.1f},{y:.1f}" for x, y in L + R[::-1]) + ' Z"/>'
def text_on(pid, d, txt, size, fam='GJost', spacing=None, length=None):
    tl = f' textLength="{length:.0f}" lengthAdjust="spacing"' if length else ''
    ls = f' letter-spacing="{spacing}"' if spacing else ''
    return (f'<path id="{pid}" d="{d}" fill="none"/>'
            f'<text font-family="{fam}" font-size="{size}" fill="#fff"{ls} dominant-baseline="central"><textPath href="#{pid}"{tl}>{txt}</textPath></text>')
def text(x, y, txt, size, fam='GJost', spacing=0, anchor='middle'):
    return f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" fill="#fff" letter-spacing="{spacing}" text-anchor="{anchor}" dominant-baseline="central">{txt}</text>'

INSCRIPTION = ("SON GOKU ✦ KAKAROT ✦ RAISED ON MOUNT PAOZU ✦ STUDENT OF MASTER ROSHI ✦ RIDER OF THE FLYING NIMBUS ✦ "
               "SEEKER OF THE SEVEN DRAGON BALLS ✦ SUPER SAIYAN ✦ FAN CONCEPT ✦ NOT FOR SALE ✦ ")

# ── front: one wide gold band from the card edge to the art, inscription engraved along its middle ──
edge = f'<path d="{rr(X0, Y0, X1, Y1, 54)} {rr(132, 132, 1108, 1697, 14)}" fill="#fff" fill-rule="evenodd"/>'
def arc_rr(x0, y0, x1, y1, r):                      # rounded rect from top centre, clockwise, true arcs
    return (f"M{CX},{y0} H{x1-r} A{r},{r} 0 0 1 {x1},{y0+r} V{y1-r} A{r},{r} 0 0 1 {x1-r},{y1} H{x0+r} "
            f"A{r},{r} 0 0 1 {x0},{y1-r} V{y0+r} A{r},{r} 0 0 1 {x0+r},{y0} H{CX}")
FRONT_TXT = ("Son Goku, called Kakarot ~ raised on Mount Paozu ~ student of Master Roshi ~ rider of the Flying Nimbus ~ "
             "seeker of the seven Dragon Balls ~ the Saiyan who stayed ~ kamehameha ~ the hope of the universe ~ "
             "protector of Earth ~ he trains harder every single day ~ eats enough for ten ~ forever smiling at a stronger foe ~ "
             "fancard, set 05, number 001 of 100 ~ a fan concept, not for sale ~ ")
plen = 2 * ((1134 - 106 - 2 * 34) + (1723 - 106 - 2 * 34)) + 2 * math.pi * 34
etext = (f'<path id="fe" d="{arc_rr(106, 106, 1134, 1723, 34)}" fill="none"/>'
         f'<text font-family="GHand" font-size="20" fill="#fff" dominant-baseline="central">'
         f'<textPath href="#fe" textLength="{plen - 18:.0f}" lengthAdjust="spacing">{FRONT_TXT}</textPath></text>')
# subtle chased texture for the band: fine stipple, densest near the edges, thinning toward the text line
import random as _r
_r.seed(11)
dots = []
band = lambda x, y: (80 <= x <= 1160 and 80 <= y <= 1749) and not (132 < x < 1108 and 132 < y < 1697)
while len(dots) < 9000:
    x, y = _r.uniform(80, 1160), _r.uniform(80, 1749)
    if not band(x, y): continue
    dline = min(abs(x - 106), abs(x - 1134), abs(y - 106), abs(y - 1723))
    if dline < 13 and _r.random() < .85: continue        # keep the inscription line clean
    dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{_r.uniform(.7, 1.5):.2f}" fill="#fff"/>')
open(os.path.join(HERE, 'goku-edge-grain.svg'), 'w').write(svg(f'<g clip-path="url(#cardclip)">{"".join(dots)}</g>',
     f'<clipPath id="cardclip"><path d="{rr(X0, Y0, X1, Y1, 54)}"/></clipPath>'))
open(os.path.join(HERE, 'goku-edge-text.svg'), 'w').write(svg(etext))
open(os.path.join(HERE, 'goku-edge.svg'), 'w').write(svg(edge))

# ── back ──────────────────────────────────────────────────────────────────────
b = []
b.append(ring(162, 162, 1078, 1667, 14, 3.2))            # inner rule
b.append(ring(171, 171, 1069, 1658, 9, 1.2))

# fireball sun stamp
SX, SY = CX, 640
for i in range(64):
    a = i / 64 * 2 * math.pi
    long = i % 2 == 0
    r0, r1 = 168, (318 if long else 250) - (14 if i % 4 == 2 else 0)
    amp, waves = (9 if long else 6), (2.5 if long else 1.6)
    pts = []
    for k in range(41):
        t = k / 40; r = r0 + (r1 - r0) * t
        off = math.sin(t * waves * 2 * math.pi) * amp * (0.3 + t)
        pts.append((SX + r * math.cos(a) - off * math.sin(a), SY + r * math.sin(a) + off * math.cos(a)))
    b.append(taper(pts, 4.2 if long else 3, .6))
for i in range(128):                                       # fine straight rays close to the disc
    a = (i + .5) / 128 * 2 * math.pi
    b.append(f'<line x1="{SX+170*math.cos(a):.1f}" y1="{SY+170*math.sin(a):.1f}" x2="{SX+196*math.cos(a):.1f}" y2="{SY+196*math.sin(a):.1f}" stroke="#fff" stroke-width="1.1"/>')
b.append(circ(SX, SY, 160, 5)); b.append(circ(SX, SY, 151, 1.4))
b.append(text_on('ring', f"M{SX-124},{SY} A124,124 0 1 1 {SX+124},{SY} A124,124 0 1 1 {SX-124},{SY}",
                 "SET 05 ✦ ONE OF 100 ✦ NOV 2026 ✦ SON GOKU ✦", 21, spacing=3, length=2 * math.pi * 124 - 14))
b.append(circ(SX, SY, 100, 3)); b.append(circ(SX, SY, 93, 1.2))
b.append(text(SX, SY - 28, 'fancard', 44, 'GBod'))
b.append(text(SX, SY + 34, '001', 72, 'GJost', 2))
for dx in (-58, 58): b.append(star(SX + dx, SY - 66 if False else SY + 78, 0) if False else '')
b.append(star(SX, SY + 82, 9))
b.append(circ(SX, SY, 330, 2.2))                           # the scale clearing edge

# nimbus clouds: spiral scrolls in a band under the sun
def cloud(cx, cy, s, flip=1):
    out = []
    for (dx, dy, r, turns) in [(0, 0, 30, 1.6), (46, -10, 22, 1.4), (-44, 6, 20, 1.3), (82, 8, 14, 1.2)]:
        pts = []
        for k in range(90):
            t = k / 89; ang = flip * t * turns * 2 * math.pi; rr_ = r * s * (1 - .82 * t)
            pts.append((cx + flip * dx * s + rr_ * math.cos(ang + math.pi), cy + dy * s + rr_ * math.sin(ang + math.pi)))
        out.append(taper(pts, 3.6, 1))
    out.append(f'<path d="M{cx-80*s},{cy+30*s} Q{cx-20*s},{cy+44*s} {cx+30*s},{cy+30*s} T{cx+120*s},{cy+28*s}" fill="none" stroke="#fff" stroke-width="2.2" transform="{"" if flip > 0 else f"scale(-1 1) translate({-2*cx} 0)"}"/>')
    return "".join(out)
b.append(cloud(470, 1030, 1.0, 1)); b.append(cloud(770, 1030, 1.0, -1))

# title
b.append(ring(350, 976, 890, 1284, 22, 3)); b.append(ring(360, 986, 880, 1274, 14, 1.2))
b.append(f'<line x1="400" y1="1192" x2="840" y2="1192" stroke="#fff" stroke-width="1.6"/>')
b.append(text(CX, 1222, 'THE SAIYAN RAISED ON EARTH', 20, 'GJost', 6))
b.append(f'<line x1="400" y1="1252" x2="840" y2="1252" stroke="#fff" stroke-width="1.6"/>')
for x in (390, 850): b.append(star(x, 1222, 7, 4, .3))

# seven dragon balls
def ball(cx, cy, n):
    o = [circ(cx, cy, 86, 3.2), circ(cx, cy, 77, 1.2)]
    for i in range(36):
        a = i / 36 * 2 * math.pi; o.append(circ(cx + 81.5 * math.cos(a), cy + 81.5 * math.sin(a), 1.5))
    o.append(circ(cx, cy, 60, 3))
    o.append(f'<path d="M{cx-44*math.cos(.5):.1f},{cy-44*math.sin(.5)-10:.1f} A44,44 0 0 1 {cx-10:.1f},{cy-46:.1f}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" transform="rotate(-20 {cx} {cy})"/>')
    if n == 1: P, s = [(0, 0)], 20
    elif n == 7: P, s = [(0, 0)] + [(24 * math.cos(a), 24 * math.sin(a)) for a in [i * math.pi / 3 - math.pi / 2 for i in range(6)]], 10
    else:
        r_ = {2: 16, 3: 19, 4: 21, 5: 23, 6: 25}[n]
        P, s = [(r_ * math.cos(a), r_ * math.sin(a)) for a in [i * 2 * math.pi / n - math.pi / 2 for i in range(n)]], {2: 15, 3: 14, 4: 12, 5: 11, 6: 10}[n]
    for dx, dy in P: o.append(star(cx + dx, cy + 4 + dy, s))
    return "".join(o)
BALLS = [(272, 300, 1), (968, 300, 2), (272, 1180, 3), (968, 1180, 4), (272, 1400, 5), (968, 1400, 6), (CX, 1528, 7)]
for (x, y, n) in BALLS: b.append(ball(x, y, n))
# little sparkles in the field
for (x, y, s) in [(420, 300, 12), (820, 300, 12), (230, 560, 10), (1010, 560, 10), (230, 800, 9), (1010, 800, 9),
                  (430, 1530, 11), (810, 1530, 11), (272, 1600, 8), (968, 1600, 8)]:
    b.append(spark(x, y, s))
open(os.path.join(HERE, 'goku-back.svg'), 'w').write(svg("".join(b)))

# ── back scales (seigaiha), cleared round the motifs ─────────────────────────
R = 30
arcs = []
rows = int((1658 - 171) / (R / 2)) + 4
for j in range(rows):
    y = 171 - R + j * R / 2
    for i in range(-1, int(900 / (2 * R)) + 3):
        x = 171 + i * 2 * R + (R if j % 2 else 0)
        arcs.append(f'<circle cx="{x}" cy="{y}" r="{R}" fill="#000"/>')
        for rr_ in (R - 2, R * .72, R * .45, R * .18):
            arcs.append(f'<circle cx="{x}" cy="{y}" r="{rr_:.1f}" fill="none" stroke="#fff" stroke-width="1.5"/>')
# reverse the paint order so lower rows sit on top, as in the classic pattern
holes = [f'<circle cx="{SX}" cy="{SY}" r="330" fill="#000"/>']
holes += [f'<circle cx="{x}" cy="{y}" r="96" fill="#000"/>' for (x, y, _) in BALLS]
holes += [f'<rect x="350" y="980" width="540" height="300" rx="20" fill="#000"/>']
defs = (f'<clipPath id="field"><path d="{rr(171, 171, 1069, 1658, 9)}"/></clipPath>'
        f'<mask id="sc" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#000"/>'
        f'<g clip-path="url(#field)">{"".join(arcs)}{"".join(holes)}</g></mask>')
open(os.path.join(HERE, 'goku-scales.svg'), 'w').write(svg(f'<rect width="{W}" height="{H}" fill="#fff" mask="url(#sc)"/>', defs))
print('ok')
