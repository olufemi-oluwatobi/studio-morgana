#!/usr/bin/env bash
# Factory reference renders: the oracle the web renderer must match (P1 parity).
# Builds each golden card with the v1 factory and keeps the front/back previews at half size (webp).
set -e
cd "$(dirname "$0")/.."
CARDS="hello marilyn rose-and-plane lounge-card the-bride the-bride-v10 goku/goku"
for c in $CARDS; do
  n=$(basename "$c")
  node bin/gt.js build "examples/$c.gt" --engine fancard-py --out "out/golden/$n" > /dev/null
  d=$(dirname "$(find "out/golden/$n" -name preview-front.png | head -1)")
  for s in front back; do
    [ -f "$d/preview-$s.png" ] || continue
    python3 -c "from PIL import Image; im=Image.open('$d/preview-$s.png').convert('RGB'); im.resize((im.width//2, im.height//2), Image.LANCZOS).save('golden/refs/$n-$s.webp', quality=92)"
  done
  echo "ref $n"
done
