#!/usr/bin/env python3
"""
regress.py - golden-image regression for the Fancard factory.

    python3 regress.py bless   # build every card in CARDS, store pixel hashes in golden/v1.json
    python3 regress.py check   # rebuild and compare against golden/v1.json (exit 1 on any change)
    python3 regress.py check tirzee star   # only cards whose label contains one of these words

A card passes when its front and back previews are pixel-identical to the blessed build.
Run `check` after every engine change; run `bless` only when a visual change is intended.
"""
import hashlib, json, os, subprocess, sys, tempfile, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, 'golden', 'v1.json')

# (label, manifest, [patches])
CARDS = [
    ('90s-camera', '90s-camera.card.yaml', []),
    ('hallows', 'hallows.card.yaml', []),
    ('illus-enamel', 'illus-enamel.card.yaml', []),
    ('illus-print', 'illus-print.card.yaml', []),
    ('lab-rosefrost', 'lab-rosefrost.card.yaml', []),
    ('lab-spectra', 'lab-spectra.card.yaml', []),
    ('lab-sunray', 'lab-sunray.card.yaml', []),
    ('marilyn', 'marilyn.card.yaml', []),
    ('marilyn3', 'marilyn3.card.yaml', []),
    ('marilyn4', 'marilyn4.card.yaml', []),
    ('marilyn5', 'marilyn5.card.yaml', []),
    ('marilyn6', 'marilyn6.card.yaml', []),
    ('oxana', 'oxana.card.yaml', []),
    ('oxana-red', 'oxana-red.card.yaml', []),
    ('prom-queen', 'prom-queen.card.yaml', []),
    ('prom-queen-tiara', 'prom-queen.tiara.card.yaml', []),
    ('sienna-rae', 'sienna-rae.card.yaml', []),
    ('sienna-rae-jade-cobalt', 'sienna-rae.card.yaml', ['sienna-rae.jade-cobalt.patch.yaml']),
    ('spray-gloss', 'spray-lab.card.yaml', []),
    ('spray-candy', 'spray-lab.card.yaml', ['spray-lab.candy.patch.yaml']),
    ('spray-glitter', 'spray-lab.card.yaml', ['spray-lab.glitter.patch.yaml']),
    ('spray-metalflake', 'spray-lab.card.yaml', ['spray-lab.metalflake.patch.yaml']),
    ('spray-pearl', 'spray-lab.card.yaml', ['spray-lab.pearl.patch.yaml']),
    ('spray-chameleon', 'spray-lab.card.yaml', ['spray-lab.chameleon.patch.yaml']),
    ('spray-matte', 'spray-lab.card.yaml', ['spray-lab.matte.patch.yaml']),
    ('star', 'star.card.yaml', []),
    ('star-rainbow', 'star.card.yaml', ['star.rainbow.patch.yaml']),
    ('star-relief', 'star-relief.card.yaml', []),
    ('talon-queen', 'talon-queen.card.yaml', []),
    ('tinsel-queen', 'tinsel-queen.card.yaml', []),
    ('tinsel-acanthus', 'tinsel-queen.silver-acanthus.card.yaml', []),
    ('tinsel-acanthus-artwork', 'tinsel-queen.silver-acanthus.card.yaml', ['tinsel-queen.silver-acanthus.artwork.patch.yaml']),
    ('tinsel-acanthus-mirror', 'tinsel-queen.silver-acanthus.card.yaml', ['tinsel-queen.silver-acanthus.mirror.patch.yaml']),
    ('tinsel-acanthus-glass', 'tinsel-queen.silver-acanthus.card.yaml', ['tinsel-queen.silver-acanthus.glass.patch.yaml']),
    ('tirzee', 'tirzee.card.yaml', []),
    ('tirzee-2', 'tirzee-2.card.yaml', []),
    ('vespers', 'vespers.card.yaml', []),
]


def pixhash(path):
    a = np.asarray(Image.open(path).convert('RGBA'))
    return hashlib.sha256(a.tobytes() + str(a.shape).encode()).hexdigest()


def build(label, manifest, patches, out):
    cmd = [sys.executable, os.path.join(HERE, 'fancard.py'), os.path.join(HERE, 'manifests', manifest), '--out', out]
    for p in patches: cmd += ['--patch', os.path.join(HERE, 'manifests', p)]
    r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True)
    if r.returncode != 0:
        return None, (r.stderr or r.stdout).strip().splitlines()[-1:] or ['failed']
    line = [l for l in r.stdout.splitlines() if l.startswith('✓')][-1]
    d = os.path.dirname(line.split()[1])
    return {s: pixhash(os.path.join(d, f'preview-{s}.png')) for s in ('front', 'back')
            if os.path.exists(os.path.join(d, f'preview-{s}.png'))}, None


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('bless', 'check'): sys.exit(__doc__)
    mode, only = sys.argv[1], sys.argv[2:]
    cards = [c for c in CARDS if not only or any(o in c[0] for o in only)]
    golden = json.load(open(GOLDEN)) if os.path.exists(GOLDEN) else {}
    bad = 0
    with tempfile.TemporaryDirectory() as td:
        for label, man, pat in cards:
            t = time.time(); h, err = build(label, man, pat, os.path.join(td, label))
            if err:
                print(f'✗ {label:28s} BUILD FAILED: {err[0]}'); bad += 1; continue
            if mode == 'bless':
                golden[label] = dict(manifest=man, patches=pat, **h); print(f'· {label:28s} blessed ({time.time() - t:.0f} s)')
            else:
                g = golden.get(label)
                if not g: print(f'? {label:28s} no golden yet'); continue
                diff = [s for s in ('front', 'back') if g.get(s) != h.get(s)]
                if diff: bad += 1; print(f'✗ {label:28s} CHANGED: {", ".join(diff)}')
                else: print(f'✓ {label:28s} identical ({time.time() - t:.0f} s)')
    if mode == 'bless':
        os.makedirs(os.path.dirname(GOLDEN), exist_ok=True)
        json.dump(golden, open(GOLDEN, 'w'), indent=1, sort_keys=True)
        print(f'golden: {len(golden)} cards → {GOLDEN}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
