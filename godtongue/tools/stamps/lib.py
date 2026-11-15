# Authoring help for stamps: geometry in Python (shapely), written out as godtongue.
# A stamp is drawn round 0 0, about 100 from the centre to its edge, light from the top left.
# Its parts have roles, so any stamp can be recoloured the same way:
#   body (the main colour) · shade (its shadow side, darker) · light (a highlight) · detail (dark marks: seeds, veins,
#   lines) · leaf (green parts) · stem (wood, stalks) · accent (a second colour)
import math
from shapely.geometry import Polygon, MultiPolygon, Point, LineString
from shapely import affinity
from shapely.ops import unary_union

INK = '#1d1b2e'

def circle(r, x=0, y=0, n=72): return Point(x, y).buffer(r, quad_segs=max(8, n // 4))
def ellipse(w, h, x=0, y=0, rot=0):
    e = affinity.scale(Point(0, 0).buffer(1, quad_segs=24), w / 2, h / 2)
    return affinity.translate(affinity.rotate(e, rot, origin=(0, 0)), x, y)
def poly(pts): return Polygon(pts)
def rot(g, a, o=(0, 0)): return affinity.rotate(g, a, origin=o)
def move(g, x, y): return affinity.translate(g, x, y)
def scale(g, sx, sy=None, o=(0, 0)): return affinity.scale(g, sx, sy if sy is not None else sx, origin=o)
def union(*gs): return unary_union([g for g in gs if g is not None and not g.is_empty])
def stroke(pts, w): return LineString(pts).buffer(w / 2, cap_style='round', join_style='round', quad_segs=4)

def leaf(length, width, x=0, y=0, ang=-90, tip=0.85, n=28):
    """a leaf from its base at x y pointing at ang degrees (0 = right, -90 = up)"""
    side = []
    for i in range(n + 1):
        u = i / n
        hw = width / 2 * math.sin(math.pi * u ** tip) * (1 - 0.15 * u)
        side.append((u * length, hw))
    pts = side + [(u, -w) for u, w in reversed(side)]
    return move(rot(poly(pts), ang), x, y)

def leaf_veins(length, width, x=0, y=0, ang=-90, k=5, w=3):
    ls = [stroke([(length * 0.04, 0), (length * 0.92, 0)], w)]
    for i in range(1, k + 1):
        u = length * (0.12 + 0.72 * i / (k + 1)); h = width / 2 * 0.62 * math.sin(math.pi * (u / length))
        for s in (-1, 1): ls.append(stroke([(u, 0), (u + length * 0.13, s * h)], w * 0.8))
    return move(rot(union(*ls), ang), x, y)

def petal(length, width, x=0, y=0, ang=-90, round_tip=True, n=24):
    side = []
    for i in range(n + 1):
        u = i / n
        hw = width / 2 * (math.sin(math.pi * min(1, u * 1.15)) if not round_tip else math.sin(math.pi * u * 0.5 + 0.0) ** 0.7 * math.cos(max(0, u - 0.6) * 2.2))
        side.append((u * length, max(0.0, hw)))
    pts = side + [(u, -w) for u, w in reversed(side)]
    return move(rot(poly(pts), ang), x, y)

def ring_of(g, n, phase=0):
    return union(*[rot(g, phase + 360 * i / n) for i in range(n)])

def shade_of(body, dx=-16, dy=-16, s=0.94):
    """the shadow side: what is left of the body when a copy moved towards the light covers it"""
    c = body.centroid
    cover = move(scale(body, s, s, (c.x, c.y)), dx, dy)
    return body.difference(cover)

def light_of(body, w=None, h=None, at=(0.3, 0.28), rot_deg=-35):
    """a highlight: a small ellipse towards the top left, inside the body"""
    x0, y0, x1, y1 = body.bounds; bw, bh = x1 - x0, y1 - y0
    e = ellipse(w or bw * 0.2, h or bh * 0.12, x0 + bw * at[0], y0 + bh * at[1], rot_deg)
    return e.intersection(body.buffer(-max(bw, bh) * 0.04))

def pts_of(g, tol=0.6):
    g = g.simplify(tol, preserve_topology=True)
    polys = [g] if isinstance(g, Polygon) else [p for p in getattr(g, 'geoms', []) if isinstance(p, Polygon)]
    out = []
    for p in polys:
        if p.area < 4: continue
        c = list(p.exterior.coords)[:-1]
        if len(c) >= 3: out.append(c)
    return out

def fmt(v):
    r = round(v)
    return str(r)

class Stamp:
    def __init__(self, name, words, tags, about):
        self.name, self.words, self.tags, self.about = name, words, tags, about
        self.parts = []                     # (part, role, geometry or ('stroke'...)), colour
    def add(self, part, geom, colour, role=None):
        if geom is None or geom.is_empty: return self
        self.parts.append((part, role or part, geom, colour)); return self
    def gt(self):
        art = 'an' if self.name[0] in 'aeiou' else 'a'
        lines = [f'-- stamp: {self.name}', f'-- words: {", ".join(self.words)}', f'-- tags: {", ".join(self.tags)}',
                 f'-- about: {self.about}',
                 '-- parts: ' + ', '.join(f'{p} {c}' for p, _, _, c in self.parts),
                 f'define {art} {self.name.replace("-", " ")} as:']
        for part, role, g, colour in self.parts:
            rings = pts_of(g)
            if not rings: continue
            body = ', then '.join('from ' + ' to '.join(f'{fmt(x)} {fmt(y)}' for x, y in r) for r in rings)
            lines.append(f'  draw a shape called {part} {body}.')
        for part, role, g, colour in self.parts:
            if pts_of(g): lines.append(f'  make the {part} {colour}.')
        lines.append('end.')
        return '\n'.join(lines) + '\n'
