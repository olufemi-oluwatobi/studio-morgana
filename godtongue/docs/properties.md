# Properties and words (Morgana)

Every word a godtongue user can write. "Animatable" says whether the word can take a timed change (`change … to … over … s`)
once order 5.1 lands; until then the timed words are the ones marked "timed".

| Word | Example | Scope | Animatable | Status |
| --- | --- | --- | --- | --- |
| `create a card` | `create a card called hello from brass, 0.8 mm thick.` | document | no | done |
| `create a canvas` | `create a canvas called post, 1080 by 1350.` | document | no | done |
| `create a stage` | `create a stage called three-bodies, 1500 by 1100, on #cfc6b4.` | document | no | done |
| `create a video` | `create a video called desk, 1080 by 1350, on #c9b99a, 3 s long.` | document | no | done |
| `make a paper / card / piece / plate` | `make a paper called memo from bond, 760 by 1000, at 540 900.` | element | yes (`at`, `turned`) | done |
| `place a card` | `place a card called ticket from @desk-ticket.gt at 540 720, scale 0.7.` | element (on a stage) | yes (`scale`, `at` through moves) | done (order 0.3) |
| `flip` | `flip the ticket at 1.2 s, over 0.8 s.` | element with a back face | timed | done (order 0.3) |
| `flip` (layers) | `flip the wing upside down.` | layer | no | done (existing) |
| `bring … to the front`, `send … behind …` | `send the memo behind the ticket.` | element | no | done |
| `bring in`, `slam … in`, `remove … at T s` | `slam the plaque in at 0.8 s.` | element | timed | done |
| `glide … to x y` | `glide the memo to 300 400, turned 6, at 2 s, over 1 s.` | element | timed | done |
| `reveal … at T s` | `reveal the title at 1 s, over 0.5 s, from the left.` | layer | timed | done |
| `caption … at T s` | `caption "Quants" at 2 s, for 3 s.` | caption | timed | done |
| `spray … with` | `spray the card with glitter, 30 µm thick.` | step | timed (`at`, `for`) | done |
