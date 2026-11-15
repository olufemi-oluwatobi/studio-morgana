# Credits

## game-icons.net

Library stamps are converted from drawings on [game-icons.net](https://game-icons.net), made by their artists and
licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Each stamp stores its artist's credit line
(`library_stamps.credit`) and the Worker serves it with the stamp (`GET /api/library`). Attribution must stay with
any published stamp that came from them.

The artist for each stamp is in its credit line; the import takes one drawing per name, preferring Delapouite, then Lorc, then the other artists.

The first import is run with `apps/api/scripts/import-game-icons.mjs` against a checkout of the icons repository;
its word list is `apps/api/scripts/game-icons-everyday.txt`.
