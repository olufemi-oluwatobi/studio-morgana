# Studio Morgana

A generator and editor for godtongue pieces: cards, canvas posts, lit scenes and short videos. You describe a piece,
the model writes it in godtongue, and your browser renders it. Then you change it by saying what to change ("make p1
chrome") or by editing its godtongue directly.

Two pages, plus sign-in:

- **Wall (`/`).** Featured pieces and yours, in a tight masonry. The header stays fixed and holds the composer (a bar
  that opens into a panel) and the category tabs (All, Cards, Posts, Scenes, Videos). Make adds four options at the top,
  as skeletons that fill in as each one renders. Drag a piece to the tray to Remove it, to use it as a reference for a
  New card, or to Edit it. Dropping it outside the window removes it. Videos play muted previews as they scroll into view.
- **Editor (`/p/:id`).** The piece, centred, with nothing over it. Turn on Parts to see numbered pins (P1, P2, …).
  On the right is the godtongue: edit it and press Run (⌘↵). Under it is the command input. Each change becomes a new
  version, renders straight away, and can be undone. Export as PNG, MP4 or `.gt`. Changing a piece you do not own
  saves your own copy first.
- **Sign-in (`/auth`).** Email and password, confirm email, forgot and reset password. Anyone can generate without
  an account, up to a daily limit; signing up moves what you made into your account.

## How it is built

```
studio-morgana/
  packages/renderer   godtongue in the browser: a compile worker (compiler + page build) and an in-frame bridge
  apps/api            one Cloudflare Worker: Hono API, D1, R2, Workers AI (GPT-OSS), Resend (off until a key is set)
  apps/web            Vite + React: the wall, the editor and sign-in; served by the same Worker as static assets
  scripts             seed (featured pieces + demo admin), checks and smoke tests
```

The compiler is `../godtongue` (a sibling folder in the same repository). Nothing is copied from it: the runtime is
built from it.

**Rendering happens in the browser, never on the server.** The compile worker turns a source into the engine's page
off the main thread. A single sandboxed frame runs that page, draws the piece once, and sends back:

- posters at 480 and 1200 px wide (cards are cut out along their own outline: no background, no shadow);
- the position of every numbered part;
- for videos, an MP4 encoded with WebCodecs.

The browser uploads these to R2, against the version they belong to, and commits the version. Everything served from
`/files/…` is immutable and cached for a year. Renders are also remembered in memory by fingerprint (source + files +
engine version), so going back to a version shows it instantly. A long video encode gives way to anything interactive,
and is queued again afterwards.

**The model.** `@cf/openai/gpt-oss-120b` on Workers AI writes new pieces, applies commands and repairs sources that do
not compile. It is given a guide (`apps/api/src/guide.gen.ts`) built from godtongue itself: the verb reference, every
material, colour, font, shape, pigment and stock name, worked examples, and what the renderer cannot draw yet. With
`AI_MODE=local` (the `offline` environment), a small built-in generator stands in. It writes from templates and changes
colours and materials by part number; `scripts/check-local-gen.mjs` compiles everything it can produce.

**Data.**

| Store | Holds |
|---|---|
| D1 | users, sessions, tokens, pieces, versions, outputs, piece files, uploads, collections, daily usage |
| R2 | uploaded images and `.gt` files (`f/<sha-256>`) and every version's posters and video (`o/<version>/…`) |

A piece is one godtongue source plus its history; whether it is a card, a post, a scene or a video comes from the
source when it compiles.

## Run it locally

Needs Node 22 and Chromium (only for the seed and the checks). From this folder:

```
npm install
npm run build          # runtime (worker + fonts), the model's guide, the web app
npm run db:local       # D1 tables, locally
npm run dev            # wrangler dev --env offline on http://127.0.0.1:8787 (built-in generator, no account needed)
npm run seed           # demo admin + the featured pieces, rendered by the app in a headless browser
```

To work on the web app with hot reload, keep `npm run dev` running and run `npm -w @morgana/web run dev`
(http://localhost:5173, which proxies `/api` and `/files` to the Worker).

**Demo account:** `demo@example.com` / `morgana-demo-2026`. It is an admin, so it can set the featured collection.

## Deploy to Cloudflare

```
npx wrangler login
npx wrangler d1 create morgana              # put the id in apps/api/wrangler.jsonc
npx wrangler r2 bucket create morgana-files
npm run deploy                              # builds, applies migrations, deploys the Worker with its assets
node scripts/seed.mjs --base https://<your worker>.workers.dev --remote
```

Then set `APP_URL` in `wrangler.jsonc` to the live address. To switch email on:
`npx wrangler secret put RESEND_API_KEY`, and set `EMAIL_FROM` to an address on a domain verified in Resend. Until
then, confirmation and reset links are written to the Worker log.

### Deploy from GitHub (Workers Builds)

In the Cloudflare dashboard: Workers & Pages → Create → Import a repository, pick this repository, then:

- Root directory: `studio-morgana` (the build reads `../godtongue` and `../fancard-complete`, so push the whole repository)
- Build command: `npm ci && npm run build`
- Deploy command: `npm -w @morgana/api run deploy` (applies new migrations, then deploys)

The D1 database `morgana` and the R2 bucket `morgana-files` already exist and their ids are in `apps/api/wrangler.jsonc`.

### The domain

`APP_URL` is `https://www.studiomorgana.xyz` (used in emailed links). To serve the app there: add studiomorgana.xyz to
Cloudflare (Websites → Add a domain, then point the registrar's nameservers at Cloudflare), uncomment `routes` in
`apps/api/wrangler.jsonc` and deploy. The bare domain redirects to www. Until then the app runs on its workers.dev address.

## Featured

Featured is the collection with the slug `featured`, which only admins can change:

```
PUT /api/admin/collections/featured   { "pieceIds": ["…", "…"] }
```

`scripts/seed.mjs` fills it with godtongue's examples.

## Projects and piece types

- **Projects** are your own walls (`/projects/:id`). Pin any piece to one: drop it on the project in the sidebar,
  or use **Pin** in the editor. Pieces made from a project's wall are pinned to it. Pins never copy a piece;
  unpinning (drag to **Unpin**) leaves the piece alone. A visitor's projects move to their account on sign-in.
- **Deleting**: drag your piece to **Delete**, or use the bin in the editor; both offer Undo. Featured pieces
  you don't own can only be hidden.
- **Piece types** say what a piece is as media: `image` or `video` today (anything with a timeline is a video),
  `slides` next. The wall's tabs, the editor's viewer and the export menu come from `apps/web/src/lib/types.ts`;
  the server's list is `apps/api/src/types.ts`. A new type goes in both, with a viewer.

## Seeding a deployed wall

A new deployment has an empty database, so the wall is empty (the showcase only picks pieces people have made public). The simple way: sign up on the site, make your account an admin (`UPDATE users SET role = 'admin', verified = 1 WHERE email = '…'` in the D1 console), and press **Seed the wall** in the sidebar. It makes four starter pieces' worth of options in your browser and features them. Or, from your computer, seed the featured pieces once, from your computer (it renders them in a real browser, exactly like the app does):

```
npx playwright install chromium
npx wrangler login
node scripts/seed.mjs --base https://<your-worker>.workers.dev --remote --email you@example.com --password '<a new password>'
```

It signs up that account, makes it an admin, renders and uploads the featured pieces, and sets them public. Do not use the default demo account on a deployed site: its password is in this repository.

## Public, private and the showcase

Every piece is **private** until its owner makes it **public** (the Public / Private button in the editor; you need to be signed in). A private piece is a 404 for everyone else, including its id, references, remixes and pins. Public pieces can be opened, pinned and remixed by anyone.

The wall's top section is the featured pieces (hand-picked, always first), then the **showcase**: chosen by a scheduled job from the public pieces.

```
score = (1 + 3·people who pinned it + 2·people who remixed it) × freshness × 0.5^(age / 10 days)
```

People are other accounts, counted once each. Freshness is 1.5× in the first day. Picks go best first, at most 24, at most 2 per owner, at most 70% of one type. See `apps/api/src/showcase.ts` (pure, checked by `node scripts/check-showcase.mjs`).

The job runs from a Cron Trigger every six hours (`triggers.crons` in `wrangler.jsonc`) together with housekeeping (expired sessions, tokens, old usage counters). To fire it by hand: **Refresh showcase** in the sidebar (admins), or `POST /api/admin/jobs/run {"job":"showcase"}`. `GET /api/admin/jobs` shows the last runs. It also fires on its own when it has never run or is over 13 hours stale (checked on wall loads), and right after a piece goes public while the showcase has room, so a fresh deploy seeds itself.

## API

All writes need the header `x-morgana: 1`.

```
GET  /api/me
POST /api/auth/signup | login | logout | verify | forgot | reset
GET  /api/wall?type=&cursor=                 your pieces, then featured (type: image | video)
POST /api/generate {prompt, refs, uploads, n, projectId}  NDJSON, one line per option; projectId pins them
GET  /api/pieces/:id[?version=]
POST /api/pieces/:id/command  {text, versionId, parts}
POST /api/pieces/:id/versions {source, parentId}
POST /api/pieces/:id/repair   {versionId, diagnostics}
POST /api/pieces/:id/visibility {visibility: public|private}
POST /api/pieces/:id/commit   {versionId, category, type, fingerprint, w, h}
PUT  /api/versions/:vid/outputs/poster-480 | poster-1200 | video
DELETE /api/pieces/:id · POST /api/pieces/:id/restore
GET  /api/projects · POST /api/projects {name, pieceId?} · PATCH|DELETE /api/projects/:id · POST /api/projects/:id/restore
GET  /api/projects/:id/wall?type=&cursor=     the project's pins, newest first
PUT|DELETE /api/projects/:id/pins/:pieceId   pin or unpin any piece (featured ones too)
POST /api/uploads                             an image or a .gt file (raw body, x-file-name)
GET  /files/<key>                             R2, immutable, supports Range
```

## Known limits

- Video encoding runs in the browser and takes about as long as rendering every frame. It is fast on a graphics card,
  but slow with software graphics (about 0.6 s a frame in the headless checks). The poster shows until the video is ready.
- The editor shows a card's front. Back faces are compiled and listed as parts, but are not shown yet.
- In local development, Workers AI needs a Cloudflare account, so `npm run dev` uses the built-in generator;
  `npm -w @morgana/api run dev:ai` uses the real model once you are logged in.
- Rooms and holo, crystal and pearl finishes are not drawn by the web engine yet, and the model is told not to use them.
