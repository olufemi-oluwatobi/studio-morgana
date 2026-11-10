# Changelog

## 1.0.0 · 2026-11-08 · v1 locked
The manifest factory is frozen at this point. Every card below builds pixel-identical to `golden/v1.json` (`python3 regress.py check`).

Added since the original Fancard Studio source:
- `print` on foil (`on_foil: true`) with a white underbase mask: see-through CMYK over metal.
- `holo-silk` foil.
- `spray` op with seven kinds: gloss, candy, glitter, metalflake, pearl, chameleon, matte.
- `silhouette` on a side: ornaments extend the card outline; edge chamfer exempts the extensions.
- `illustrate` op: cloisonné separation of an illustration into enamel cells with metal wires, one plate per colour.
- `regress.py` golden-image regression and `golden/v1.json`.
- Cards: oxana, oxana-red, hallows, star (+ rainbow), star-relief, spray-lab (+6), lab-*, marilyn 1-6, illus-enamel, illus-print.

Known gaps carried into v2: see README "Known gaps".
