"""Procedural textures for rooms. Everything is seeded, so the same room always looks the same.
planks(): a seamless oak plank floor tile in linear RGB.  view(): what you see through a window, in linear RGB."""
import numpy as np


def periodic_noise(h, w, scale_y, scale_x, rng):
    """Seamless noise: white noise filtered in the frequency domain (FFT noise always tiles)."""
    f = np.fft.fft2(rng.standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None] * h / scale_y
    fx = np.fft.fftfreq(w)[None, :] * w / scale_x
    n = np.real(np.fft.ifft2(f * np.exp(-(fx ** 2 + fy ** 2))))
    return (n - n.mean()) / (n.std() + 1e-9)


def planks(base, tile_m=2.56, plank_m=0.16, px_per_m=640, seed=7):
    """Rows of planks running north-south (image rows = v = north). base = mean linear colour."""
    rng = np.random.default_rng(seed)
    S = int(tile_m * px_per_m)
    cols = int(round(tile_m / plank_m)); pw = S // cols
    tone = np.ones((S, S)); joint = np.zeros((S, S), bool)
    grain = periodic_noise(S, S, 5, 260, rng) * 0.5 + periodic_noise(S, S, 2, 50, rng) * 0.25   # long streaks along the plank
    for c in range(cols):
        x0 = c * pw
        start = rng.uniform(0, S); y = start
        joint[int(start) % S, x0:x0 + pw] = True
        while y < start + S:                         # planks wrap round the tile, so it repeats without a seam
            y1 = min(y + rng.uniform(0.7, 1.9) * px_per_m, start + S)
            ys = np.arange(int(y), int(y1)) % S
            tone[np.ix_(ys, np.arange(x0, x0 + pw))] = rng.normal(1.0, 0.11)
            joint[int(y1) % S, x0:x0 + pw] = True
            y = y1
        joint[:, x0] = True
    # dilate joints to about 1.5 mm
    k = max(1, int(0.0015 * px_per_m))
    J = joint.copy()
    for s in range(1, k + 1): J |= np.roll(joint, s, 0) | np.roll(joint, s, 1)
    img = np.array(base)[None, None, :] * tone[..., None] * (1 + 0.16 * grain[..., None])
    warm = 1 + 0.06 * periodic_noise(S, S, 600, 600, rng)[..., None] * np.array([1.0, 0.7, 0.4])
    img = img * warm
    img[J] *= 0.35
    return np.clip(img, 0, 1).astype(np.float32)


def view(w=1024, h=1024, seed=3):
    """A bright daylight view: soft sky above, a band of distant trees below. Mean luminance is about 1."""
    rng = np.random.default_rng(seed)
    yy = np.linspace(1, 0, h)[:, None]              # 1 at the top row
    sky = (np.array([0.62, 0.76, 1.0]) * yy[..., None] + np.array([1.0, 0.98, 0.94]) * (1 - yy[..., None]))
    img = np.broadcast_to(sky, (h, w, 3)).copy()
    # tree line: overlapping rounded crowns along the horizon, darker and shaded towards their base
    X, Y = np.meshgrid(np.linspace(0, 1, w), np.linspace(1, 0, h))       # Y = 1 at the top row
    crown = np.zeros((h, w)); shade = np.zeros((h, w))
    for _ in range(46):
        cx, r = rng.uniform(-0.05, 1.05), rng.uniform(0.04, 0.12)
        cy = rng.uniform(0.14, 0.28)
        d = np.sqrt(((X - cx) * 1.0) ** 2 + ((Y - cy) * 1.15) ** 2) / r
        inside = np.clip((1 - d) * 18, 0, 1)
        crown = np.maximum(crown, inside)
        shade = np.maximum(shade, inside * np.clip(0.55 + 0.45 * (Y - cy) / r, 0, 1))
    crown = np.maximum(crown, (Y < 0.16).astype(float))                    # hedge and ground under the crowns
    leaf = 0.85 + 0.15 * periodic_noise(h, w, 14, 14, rng)
    tone = (0.35 + 0.65 * np.maximum(shade, (Y < 0.16) * 0.4)) * leaf
    green = np.stack([0.022 * tone, 0.042 * tone, 0.018 * tone], -1)
    img = img * (1 - crown[..., None]) + green * crown[..., None]
    lum = (img * np.array([0.2126, 0.7152, 0.0722])).sum(-1).mean()
    return (img / lum).astype(np.float32)
