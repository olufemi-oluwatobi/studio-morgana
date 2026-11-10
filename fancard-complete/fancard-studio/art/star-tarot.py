# Draws the XVII "The Star" test art as two printer plates: CMYK colour + white underbase.
# Elements with class "w" get white ink underneath (opaque); everything else is see-through ink on foil.
# Output: assets/star-front.png, assets/star-front-white.png, assets/star-back.png, assets/star-back-white.png
import math, os, random, subprocess, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); ASSETS = os.path.join(HERE, '..', 'assets')
W, H = 1044, 1698                       # = zone [70,70,940,1529] at the engine's 1200/1080 print scale
random.seed(17)
INK = '#1d1a3a'
def star4(x, y, s, cls='', fill='#fff'):
    k = s * .16
    return (f'<path class="{cls}" fill="{fill}" d="M{x},{y-s} Q{x+k},{y-k} {x+s*.7},{y} Q{x+k},{y+k} {x},{y+s} '
            f'Q{x-k},{y+k} {x-s*.7},{y} Q{x-k},{y-k} {x},{y-s}Z"/>')
def rose(x, y, r, c1='#d8344d', c2='#9e1531'):
    p = [f'<g class="w" transform="translate({x},{y})">']
    for i in range(7):
        a = i / 7 * 6.283
        p.append(f'<ellipse cx="{math.cos(a)*r*.55:.1f}" cy="{math.sin(a)*r*.55:.1f}" rx="{r*.5:.1f}" ry="{r*.4:.1f}" transform="rotate({math.degrees(a):.0f} {math.cos(a)*r*.55:.1f} {math.sin(a)*r*.55:.1f})" fill="{c1}" stroke="{INK}" stroke-width="2.4"/>')
    for i in range(5):
        a = i / 5 * 6.283 + .4
        p.append(f'<ellipse cx="{math.cos(a)*r*.27:.1f}" cy="{math.sin(a)*r*.27:.1f}" rx="{r*.33:.1f}" ry="{r*.26:.1f}" transform="rotate({math.degrees(a):.0f} {math.cos(a)*r*.27:.1f} {math.sin(a)*r*.27:.1f})" fill="{c2}" stroke="{INK}" stroke-width="2"/>')
    sp = " ".join(f"{math.cos(t)*r*.3*(1-t/12):.1f},{math.sin(t)*r*.3*(1-t/12):.1f}" for t in [i*.2 for i in range(55)])
    p.append(f'<polyline points="{sp}" fill="none" stroke="{INK}" stroke-width="2.4"/></g>')
    return "".join(p)
def leaf(x, y, a, L, c='#3f9a6b'):
    return (f'<g class="w" transform="translate({x},{y}) rotate({a})"><path d="M0,0 Q{L*.5},{-L*.32} {L},0 Q{L*.5},{L*.32} 0,0Z" fill="{c}" stroke="{INK}" stroke-width="2.2"/>'
            f'<path d="M4,0 L{L-8},0" stroke="{INK}" stroke-width="1.6"/></g>')

def front():
    ax, ay, aw, ah = 162, 250, 720, 1010                     # arch window
    cx = ax + aw / 2
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
         '<stop offset="0" stop-color="#3a4cc0"/><stop offset=".35" stop-color="#8a4fc4"/><stop offset=".62" stop-color="#ef5f8e"/>'
         '<stop offset=".85" stop-color="#ffa451"/><stop offset="1" stop-color="#ffd27a"/></linearGradient>'
         '<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fd6e8"/><stop offset=".5" stop-color="#a99bf0"/><stop offset="1" stop-color="#7fe0c4"/></linearGradient>'
         f'<clipPath id="arch"><path d="M{ax},{ay+aw/2} A{aw/2},{aw/2} 0 0 1 {ax+aw},{ay+aw/2} V{ay+ah} H{ax} Z"/></clipPath></defs>',
         # border: a light see-through tint so the foil drives it (no white)
         f'<rect x="0" y="0" width="{W}" height="{H}" rx="40" fill="url(#rim)" opacity=".55"/>',
         f'<rect x="22" y="22" width="{W-44}" height="{H-44}" rx="30" fill="none" stroke="{INK}" stroke-width="5"/>',
         f'<rect x="40" y="40" width="{W-80}" height="{H-80}" rx="22" fill="none" stroke="{INK}" stroke-width="2"/>',
         # sky inside the arch: clear ink
         f'<g clip-path="url(#arch)"><rect x="{ax}" y="{ay}" width="{aw}" height="{ah}" fill="url(#sky)"/>']
    for _ in range(70):                                          # stars: no ink at all -> bare foil sparkles
        x, y = random.uniform(ax + 20, ax + aw - 20), random.uniform(ay + 20, ay + ah * .55)
        s.append(star4(round(x), round(y), random.choice([6, 8, 10, 14])))
    # the great star, white-backed cream with orange rays
    s.append(f'<g transform="translate({cx},{ay+330})">')
    for k in range(16):
        L = 210 if k % 2 == 0 else 120
        s.append(f'<path class="w" d="M0,0 L{L*math.cos(k*.3927 - .05):.0f},{L*math.sin(k*.3927 - .05):.0f} L{L*math.cos(k*.3927 + .05):.0f},{L*math.sin(k*.3927 + .05):.0f}Z" fill="#ffcf6a" stroke="{INK}" stroke-width="2"/>')
    s.append(f'<circle class="w" r="88" fill="#fff3d6" stroke="{INK}" stroke-width="4"/>'
             + star4(0, 0, 70, 'w', '#ffb347') + f'<circle r="14" fill="{INK}"/></g>')
    # rolling clouds + ground (white-backed)
    for i, (x, y, r) in enumerate([(ax+60, ay+ah-250, 95), (ax+190, ay+ah-275, 80), (ax+aw-70, ay+ah-255, 100), (ax+aw-210, ay+ah-285, 76), (cx, ay+ah-235, 70)]):
        s.append(f'<circle class="w" cx="{x}" cy="{y}" r="{r}" fill="#9fd0f5" stroke="{INK}" stroke-width="3"/>')
        s.append(f'<path d="M{x-r*.6},{y+r*.1} Q{x},{y-r*.5} {x+r*.6},{y+r*.1}" fill="none" stroke="{INK}" stroke-width="2" opacity=".7"/>')
    s.append(f'<path class="w" d="M{ax},{ay+ah-220} Q{cx},{ay+ah-300} {ax+aw},{ay+ah-220} V{ay+ah} H{ax}Z" fill="#fbf1dc" stroke="{INK}" stroke-width="3"/>')
    for _ in range(26):
        x, y = random.uniform(ax + 30, ax + aw - 30), random.uniform(ay + ah - 190, ay + ah - 30)
        s.append(star4(round(x), round(y), random.choice([5, 7, 9]), 'w', '#f2a93b'))
    s.append('</g>')
    # moon-phase band round the arch (white-backed)
    s.append(f'<path class="w" d="M{ax-34},{ay+ah} V{ay+aw/2} A{aw/2+34},{aw/2+34} 0 0 1 {ax+aw+34},{ay+aw/2} V{ay+ah}" fill="none" stroke="#f6d48a" stroke-width="40"/>')
    s.append(f'<path d="M{ax-54},{ay+ah} V{ay+aw/2} A{aw/2+54},{aw/2+54} 0 0 1 {ax+aw+54},{ay+aw/2} V{ay+ah} M{ax-14},{ay+ah} V{ay+aw/2} A{aw/2+14},{aw/2+14} 0 0 1 {ax+aw+14},{ay+aw/2} V{ay+ah}" fill="none" stroke="{INK}" stroke-width="3"/>')
    for k in range(13):
        t = math.pi + k / 12 * math.pi; R = aw / 2 + 34
        x, y = cx + math.cos(t) * R, ay + aw / 2 + math.sin(t) * R
        ph = k / 12
        s.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="12" fill="{INK}"/><circle class="w" cx="{x + (ph - .5) * 18:.0f}" cy="{y:.0f}" r="11" fill="#fff6dc"/>')
    s.append(f'<path d="M{ax},{ay+aw/2} A{aw/2},{aw/2} 0 0 1 {ax+aw},{ay+aw/2} V{ay+ah} H{ax} Z" fill="none" stroke="{INK}" stroke-width="4"/>')
    # roses + leaves along the bottom of the arch
    for x, y, a, L in [(ax+40, ay+ah-40, -150, 80), (ax+140, ay+ah-10, -30, 90), (ax+aw-60, ay+ah-30, -40, 85), (cx-150, ay+ah+10, -170, 80), (cx+170, ay+ah, -15, 90), (cx, ay+ah-60, -95, 70)]:
        s.append(leaf(x, y, a, L))
    for x, y, r in [(ax+70, ay+ah-20, 58), (cx-80, ay+ah-10, 72), (cx+70, ay+ah+5, 64), (ax+aw-50, ay+ah-25, 56)]:
        s.append(rose(x, y, r))
    # numeral + title plate: dark see-through ink (title reads on the foil)
    s.append(f'<text x="{W/2}" y="160" text-anchor="middle" font-family="Bodoni Moda,serif" font-size="64" fill="{INK}">XVII</text>')
    for sx in (-1, 1):
        s.append(f'<path d="M{W/2 + sx*90},140 h{sx*170}" stroke="{INK}" stroke-width="2.5"/>' + star4(W/2 + sx*280, 140, 14, '', INK))
    s.append(f'<rect x="150" y="{H-260}" width="{W-300}" height="120" rx="10" fill="none" stroke="{INK}" stroke-width="3.5"/>'
             f'<rect x="164" y="{H-246}" width="{W-328}" height="92" rx="6" fill="none" stroke="{INK}" stroke-width="1.5"/>'
             f'<text x="{W/2}" y="{H-180}" text-anchor="middle" font-family="Bodoni Moda,serif" font-size="58" letter-spacing="10" fill="{INK}">THE STAR</text>'
             f'<text x="{W/2}" y="{H-90}" text-anchor="middle" font-family="Jost,sans-serif" font-size="20" letter-spacing="6" fill="{INK}">FANCARD · Nº 0001 · ONE OF 1000</text>')
    s.append('</svg>')
    return "".join(s)

def back():
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         '<defs><radialGradient id="g" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#ffb56b"/><stop offset=".5" stop-color="#d36ac0"/><stop offset="1" stop-color="#3a4cc0"/></radialGradient></defs>',
         f'<rect x="0" y="0" width="{W}" height="{H}" rx="40" fill="url(#g)" opacity=".75"/>',
         f'<rect x="22" y="22" width="{W-44}" height="{H-44}" rx="30" fill="none" stroke="{INK}" stroke-width="5"/>',
         f'<rect x="40" y="40" width="{W-80}" height="{H-80}" rx="22" fill="none" stroke="{INK}" stroke-width="2"/>']
    for gy in range(110, H - 60, 120):                          # two-way star lattice: bare foil stars on clear ink
        for gx in range(90 + (gy // 120 % 2) * 60, W - 60, 120):
            s.append(star4(gx, gy, 14))
    cx, cy = W / 2, H / 2
    s.append(f'<circle class="w" cx="{cx}" cy="{cy}" r="250" fill="#fbf1dc" stroke="{INK}" stroke-width="5"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="226" fill="none" stroke="{INK}" stroke-width="2"/>')
    for k in range(24):
        a = k / 24 * 6.283; L = 205 if k % 2 == 0 else 175
        s.append(f'<path class="w" d="M{cx},{cy} L{cx+L*math.cos(a-.04):.0f},{cy+L*math.sin(a-.04):.0f} L{cx+L*math.cos(a+.04):.0f},{cy+L*math.sin(a+.04):.0f}Z" fill="#ffcf6a" stroke="{INK}" stroke-width="1.6"/>')
    s.append(f'<circle class="w" cx="{cx}" cy="{cy}" r="96" fill="#fff3d6" stroke="{INK}" stroke-width="4"/>')
    s.append(f'<text x="{cx}" y="{cy+22}" text-anchor="middle" font-family="Bodoni Moda,serif" font-size="64" font-style="italic" fill="{INK}">0001</text>')
    for sy in (-1, 1):
        s.append(f'<text x="{cx}" y="{cy + sy*330 + 14}" text-anchor="middle" font-family="Jost,sans-serif" font-size="24" letter-spacing="10" fill="{INK}" transform="rotate({0 if sy > 0 else 180} {cx} {cy + sy*330})">FANCARD · THE STAR</text>')
    s.append('</svg>')
    return "".join(s)

PAGE = """<html><head><style>@font-face{font-family:'Bodoni Moda';src:url('file://%s/fonts/bodoni-moda/files/bodoni-moda-latin-400-normal.woff2')}
@font-face{font-family:'Bodoni Moda';font-style:italic;src:url('file://%s/fonts/bodoni-moda/files/bodoni-moda-latin-400-italic.woff2')}
@font-face{font-family:'Jost';src:url('file://%s/fonts/jost/files/jost-latin-500-normal.woff2')}
html,body{margin:0;background:#fff} body.white *{stroke:#fff!important;opacity:1!important}
body.white *:not([fill="none"]){fill:#fff!important}
body.white .w:not([fill="none"]),body.white .w *:not([fill="none"]){fill:#000!important}
body.white .w,body.white .w *{stroke:#000!important}</style></head><body>%s</body></html>"""
JS = """const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:%d,height:%d}});
for(const [f,o] of %s){await p.goto('file://'+f);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(200);
await p.screenshot({path:o+'.png'});await p.evaluate(()=>document.body.classList.add('white'));await p.screenshot({path:o+'-white.png'});}
await b.close();})();"""
if __name__ == '__main__':
    fonts = os.path.abspath(os.path.join(HERE, '..'))
    jobs = []
    for name, svg in (('star-front', front()), ('star-back', back())):
        f = os.path.join('/tmp', name + '.html'); open(f, 'w').write(PAGE % (fonts, fonts, fonts, svg)); jobs.append([f, os.path.join(os.path.abspath(ASSETS), name)])
    js = '/tmp/star-shot.js'; open(js, 'w').write(JS % (W, H, json.dumps(jobs)))
    subprocess.run(['node', js], check=True, cwd=fonts)
    print('ok')

# full-card white plates for the raster `artwork` component (it maps the PNG onto the whole 1080x1669 card)
from PIL import Image
for side in ('front', 'back'):
    wp = Image.open(os.path.join(ASSETS, f'star-{side}-white.png')).convert('L').resize((940, 1529), Image.LANCZOS)
    full = Image.new('L', (1080, 1669), 255); full.paste(wp, (70, 70))
    full.save(os.path.join(HERE, f'star-{side}-white-card.png'))
print('white plates ok')
