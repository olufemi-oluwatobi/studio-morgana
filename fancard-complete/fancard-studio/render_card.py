#!/usr/bin/env python3
"""
render_card.py - lossless render pipeline for fancard HTML pages.

Usage:
    python3 render_card.py <card.html> <name> <outdir>

Writes into <outdir>:
    <name>_front_x.png   1712x2140 still, card 1230x1901 on the page's bench colour
    <name>_back_x.png    same, back face
    <name>_x.mp4         1080x1350, 6 s, 30 fps, H.264, tilt and flip loop
    <name>_x.gif         600x750, 20 fps, under 15 MB

Requirements: python3 with playwright (chromium installed), numpy, pillow,
ffmpeg on PATH, and gifsicle on PATH (or set GIFSICLE=/path/to/gifsicle).
"""
import os, re, sys, math, io, shutil, subprocess, tempfile, time
import numpy as np
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

# ---- settings (the values used for the Cinematic and Muse cards) ----
STILL_W = 1230          # card width in stills, css px at 1x
VIDEO_W = 380           # card width in video, css px at 2x (= 760 px in the frame)
XW, XH = 1712, 2140     # X canvas, 4:5
CARD_LIFT = 20          # px the card sits above the canvas centre
FPS, SECONDS, SUB = 30, 6.0, 48
GIF_FPS, GIF_W, GIF_H = 20, 600, 750
GIF_MAX = 15_000_000       # X limit for GIF, in bytes
GIF_LOSSY = (20, 40, 60, 80, 100, 120)  # tried in order until the GIF fits

STILL_CSS = (".hint,.shadow{display:none!important}"
             f".stage{{width:{STILL_W}px!important;max-width:none!important}}"
             ".page{gap:0!important;padding:0!important;min-height:0!important}"
             "html,body{background:transparent!important}")
VIDEO_CSS = (".hint{display:none!important}"
             f".stage{{width:{VIDEO_W}px!important;max-width:none!important}}"
             ".page{gap:0!important;padding:0!important}")

# Fake clock: the page's own requestAnimationFrame loop only advances when we step it,
# so every frame is deterministic.
CLOCK = """(()=>{let now=1000,q=[];const real=window.requestAnimationFrame.bind(window);performance.now=()=>now;
window.requestAnimationFrame=f=>{q.push(f);return q.length};window.__step=ms=>{now+=ms;const r=q;q=[];r.forEach(f=>f(now))};
window.__paint=()=>new Promise(r=>real(()=>real(r)))})()"""

# Drives the page's own pointer and keyboard handlers. tx/ty in [-1,1]; flip toggles the card.
RUN = """([tx,ty,flip,ms])=>{const s=document.getElementById('stage'),r=s.getBoundingClientRect();
 s.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+(tx/1.1+1)/2*r.width,clientY:r.top+(-ty/1.1+1)/2*r.height,pointerType:'mouse',bubbles:true}));
 if(flip)s.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));window.__step(ms)}"""


def render_stills(p, url, work):
    """Front and back exactly as the page draws them, at native layer resolution."""
    b = p.chromium.launch()
    c = b.new_context(viewport={'width': 1500, 'height': 2000}, device_scale_factor=1, color_scheme='dark')
    pg = c.new_page()
    pg.add_init_script(CLOCK)
    pg.goto(url)
    pg.add_style_tag(content=STILL_CSS)
    pg.wait_for_timeout(300)
    st = pg.locator('#stage')
    pg.evaluate("window.__step(16)")                     # front at rest: no tilt, no flip
    st.screenshot(path=os.path.join(work, 'front_native.png'), omit_background=True)
    pg.evaluate(RUN, [0, 0, True, 16])                   # flip to back, centred pointer
    for _ in range(220):                                 # let the flip spring settle
        pg.evaluate(RUN, [0, 0, False, 16])
    st.screenshot(path=os.path.join(work, 'back_native.png'), omit_background=True)
    b.close()


def x_canvas(card_path, out_path, bg):
    """Place the card on the 4:5 canvas with a soft shadow. Returns True if opaque card pixels are untouched."""
    card = Image.open(card_path).convert('RGBA')
    CW, CH = card.size
    ox, oy = (XW - CW) // 2, (XH - CH) // 2 - CARD_LIFT
    c = Image.new('RGBA', (XW, XH), bg + (255,))
    a = np.array(card)[..., 3]
    sh = Image.new('L', (XW, XH), 0)
    sh.paste(Image.fromarray((a > 0).astype('uint8') * 150), (ox, oy + 28))
    sh = sh.filter(ImageFilter.GaussianBlur(34))
    c = Image.composite(Image.new('RGBA', (XW, XH), (0, 0, 0, 255)), c, sh)
    c.alpha_composite(card, (ox, oy))
    c.convert('RGB').save(out_path, optimize=True)
    got = np.array(c.convert('RGB'))[oy:oy + CH, ox:ox + CW].astype(int)
    ref = np.array(card)[..., :3].astype(int)
    return bool((got[a == 255] == ref[a == 255]).all())


def render_frames(p, url, framedir):
    """48 motion-blur subsamples per frame, accumulated in linear light. Two cycles: the first warms the springs."""
    lin = lambda a: (a / 255.) ** 2.2
    dt = 1 / FPS / SUB
    n = int(round(SECONDS * FPS))
    flips = {int(round(2.0 / dt)), int(round(5.0 / dt))}
    b = p.chromium.launch()
    c = b.new_context(viewport={'width': 540, 'height': 675}, device_scale_factor=2, color_scheme='dark')
    pg = c.new_page()
    pg.add_init_script(CLOCK)
    pg.goto(url)
    pg.add_style_tag(content=VIDEO_CSS)
    pg.wait_for_timeout(800)
    for cyc in range(2):
        for k in range(n):
            want = cyc == 1
            fast = (2.0 <= k / FPS < 2.75) or (5.0 <= k / FPS < 5.75)
            acc = None
            for s in range(SUB):
                sub = k * SUB + s
                w = 2 * math.pi * (sub * dt) / 3.0
                pg.evaluate(RUN, [.82 * math.sin(w), .66 * math.cos(w), sub in flips, dt * 1000])
                draw = want and (s >= SUB - 12 if fast else (s >= SUB - 24 and (s - (SUB - 24)) % 6 == 5))
                if draw:
                    pg.evaluate("window.__paint()")
                    a = lin(np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert('RGB'), dtype=np.float32))
                    acc = a if acc is None else acc + a
            if want:
                img = (np.clip(acc / (12 if fast else 4), 0, 1) ** (1 / 2.2) * 255 + .5).astype('uint8')
                Image.fromarray(img).save(os.path.join(framedir, f'f{k:04d}.png'), compress_level=1)
    b.close()


def gifsicle_path():
    g = os.environ.get('GIFSICLE') or shutil.which('gifsicle')
    if not g:
        sys.exit('gifsicle not found. Install it (apt install gifsicle, or brew install gifsicle) '
                 'or set GIFSICLE=/path/to/gifsicle.')
    return g


GIFSICLE = None


def main():
    global GIFSICLE
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    src, name, outdir = sys.argv[1:4]
    GIFSICLE = gifsicle_path()  # checked up front, before the slow render
    os.makedirs(outdir, exist_ok=True)
    html = open(src, encoding='utf8').read()
    m = re.search(r'--bg:\s*(#[0-9a-fA-F]{6})', html)
    bg = tuple(int(m.group(1)[i:i + 2], 16) for i in (1, 3, 5)) if m else (0x12, 0x0a, 0x0a)
    work = tempfile.mkdtemp(prefix='card_')
    framedir = os.path.join(work, 'frames')
    os.makedirs(framedir)
    page = os.path.join(work, 'page.html')
    shutil.copy(src, page)
    url = 'file://' + page
    t0 = time.time()
    with sync_playwright() as p:
        render_stills(p, url, work)
        print('stills rendered', round(time.time() - t0, 1), 's', flush=True)
        render_frames(p, url, framedir)
        print('frames rendered', round(time.time() - t0, 1), 's', flush=True)

    for side in ('front', 'back'):
        ok = x_canvas(os.path.join(work, f'{side}_native.png'), os.path.join(outdir, f'{name}_{side}_x.png'), bg)
        print(f'{side}: card pixels identical on canvas: {ok}')

    mp4 = os.path.join(outdir, f'{name}_x.mp4')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-framerate', str(FPS), '-i', os.path.join(framedir, 'f%04d.png'),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
                    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
                    '-movflags', '+faststart', mp4], check=True)
    print('mp4', os.path.getsize(mp4) // 1024, 'KiB')

    pal = os.path.join(work, 'pal.png')
    base = f'fps={GIF_FPS},scale={GIF_W}:{GIF_H}:flags=lanczos'
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', mp4, '-vf', f'{base},palettegen=max_colors=256:stats_mode=diff', pal], check=True)
    raw = os.path.join(work, 'raw.gif')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', mp4, '-i', pal, '-lavfi',
                    f'[0:v]{base}[v];[v][1:v]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
                    '-loop', '0', raw], check=True)
    gif = os.path.join(outdir, f'{name}_x.gif')
    g = GIFSICLE
    for lossy in GIF_LOSSY:
        subprocess.run([g, '-O3', f'--lossy={lossy}', '--no-warnings', raw, '-o', gif], check=True)
        size = os.path.getsize(gif)
        print(f'gif lossy={lossy}: {size / 1048576:.1f} MiB')
        if size <= GIF_MAX:
            break
    else:
        sys.exit('GIF still over 15 MB at the strongest setting: reduce GIF_FPS or the GIF size')
    shutil.rmtree(work, ignore_errors=True)
    print('done in', round(time.time() - t0, 1), 's ->', outdir)


if __name__ == '__main__':
    main()
