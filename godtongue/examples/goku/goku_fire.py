# Painted fire under Goku: crops the art to the window (976x1565), adds an underglow and
# layered anime-style flames rising from the bottom. Writes goku-art-fire.png.
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops
random.seed(9)
WW, WH, PX = 976, 1565, 8
art = Image.open('goku-art.jpg').convert('RGB')
aw, ah = art.size; tw = aw; th = round(aw * WH / WW)
if th > ah: th = ah; tw = round(ah * WW / WH)
y0 = round((ah - th) * 0.4); x0 = (aw - tw) // 2
art = art.crop((x0, y0, x0 + tw, y0 + th)).resize((WW, WH), Image.LANCZOS)

# underglow: warm light rising from the bottom
glow = Image.new('L', (WW, WH), 0); d = ImageDraw.Draw(glow)
for y in range(WH):
    t = max(0, (y - WH * 0.45) / (WH * 0.55)); d.line([(0, y), (WW, y)], fill=int(170 * t ** 1.6))
warm = Image.new('RGB', (WW, WH), (255, 120, 30))
art = Image.composite(ImageChops.screen(art, warm), art, glow)

# painted flames: layered anime-style tongues (dark red -> red -> orange -> yellow -> pale core),
# drawn at 2x for smooth edges, then distressed with the art's own grunge so they sit in the painting
import numpy as np, math
SS = 2
FH = 900                                                # flame zone height (px, at 1x)
def tongues(seed):
    rnd = random.Random(seed); T = []
    x = -60
    while x < WW + 60:
        u = abs(x / WW - .5) * 2
        H = rnd.uniform(.6, 1.0) * (280 + 520 * u ** 1.3)
        T.append(dict(c=x, w=rnd.uniform(150, 230), H=H, lean=rnd.choice([-1, 1]) * rnd.uniform(20, 70),
                      amp=rnd.uniform(28, 60), ph=rnd.uniform(0, 6.28), wisp=rnd.random() < .35))
        x += rnd.uniform(70, 120)
    return T
BASE = tongues(5)
def tongue(d, c, w, H, lean, amp, ph, base_y):
    L, R = [], []
    for k in range(61):
        t = k / 60
        hw = w / 2 * (1 - t) ** 1.15 * (.75 + .9 * t * (1 - t))
        cx = c + lean * t * t + amp * math.sin(t * math.pi * 1.6 + ph) * t
        y = base_y - t * H
        L.append(((cx - hw) * SS, y * SS)); R.append(((cx + hw) * SS, y * SS))
    d.polygon(L + R[::-1], fill=255)
    return cx, base_y - H
def layer(scale, col, jit):
    im = Image.new('L', (WW * SS, FH * SS), 0); d = ImageDraw.Draw(im)
    rnd = random.Random(int(scale * 1000))
    for T in BASE:
        tipx, tipy = tongue(d, T['c'] + rnd.uniform(-jit, jit), T['w'] * (.45 + .55 * scale), T['H'] * scale * rnd.uniform(.85, 1.08),
                            T['lean'] * scale, T['amp'] * (.5 + .5 * scale), T['ph'], FH + 20)
        if T['wisp'] and scale > .5:                    # a detached lick floating above the tip
            tongue(d, tipx + rnd.uniform(-20, 20), 46 * scale, 120 * scale, T['lean'] * .4, 14, T['ph'] + 1, tipy - 30 * scale)
    d.rectangle([0, (FH - 60 * scale - 10) * SS, WW * SS, FH * SS], fill=255)
    return im.resize((WW, FH), Image.LANCZOS), col
LAYERS = [layer(1.0, (110, 10, 14), 0), layer(.78, (196, 30, 18), 14), layer(.56, (242, 104, 26), 18),
          layer(.36, (255, 188, 58), 20), layer(.17, (255, 238, 170), 22)]
# grunge from the art: its fine-detail luminance, reused as a distress texture
g = np.asarray(Image.open('goku-art.jpg').convert('L').resize((WW, WH), Image.BICUBIC), dtype=float)
gb = np.asarray(Image.fromarray(g.astype('uint8')).filter(ImageFilter.GaussianBlur(6)), dtype=float)
grit = np.clip((g - gb) / 60, -1, 1)[200:200 + FH]      # from the upper art: no watermark
rng = np.random.default_rng(3); speck = rng.random((FH, WW)) < .035
fire = np.zeros((FH, WW, 4))
for m, col in LAYERS:
    a = np.asarray(m, dtype=float) / 255
    c = np.array(col, dtype=float)
    shade = (1 + .28 * grit)[..., None]
    rgb = np.clip(c * shade, 0, 255)
    rgb[speck] = rgb[speck] * .7
    fire[..., :3] = fire[..., :3] * (1 - a[..., None]) + rgb * a[..., None]
    fire[..., 3] = np.maximum(fire[..., 3], a)
fire[..., 3] *= 255
fire = Image.fromarray(fire.astype('uint8'), 'RGBA')
out = art.convert('RGBA')
halo = fire.filter(ImageFilter.GaussianBlur(30)); halo.putalpha(halo.getchannel('A').point(lambda a: a * .6))
out.alpha_composite(halo, (0, WH - FH)); out.alpha_composite(fire, (0, WH - FH))
out.convert('RGB').save('goku-art-fire.png'); print('ok')
