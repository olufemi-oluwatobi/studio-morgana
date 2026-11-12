-- Studio Morgana: first schema.
-- A piece is one godtongue source with its history. What it is (card, canvas post, scene, video) comes from the
-- source when it compiles, and is kept in `category` for the wall's tabs. Outputs belong to one version.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass TEXT NOT NULL,                 -- pbkdf2$<iterations>$<salt b64>$<hash b64>
  role TEXT NOT NULL DEFAULT 'user',  -- user | admin
  verified INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                -- sha-256 of the cookie token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE tokens (
  id TEXT PRIMARY KEY,                -- sha-256 of the emailed token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- verify | reset
  expires INTEGER NOT NULL
);

CREATE TABLE pieces (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,                -- u:<user id> or a:<visitor id>
  title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'cards',  -- cards | posts | scenes | videos
  status TEXT NOT NULL DEFAULT 'draft',    -- draft | ready | failed
  version_id TEXT,                    -- the current version (has outputs)
  poster_w INTEGER, poster_h INTEGER,
  prompt TEXT,
  parent_id TEXT,                     -- the piece this was remixed from
  deleted INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX pieces_owner ON pieces(owner, deleted, updated DESC);

CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  piece_id TEXT NOT NULL REFERENCES pieces(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  source TEXT NOT NULL,
  by TEXT NOT NULL,                   -- ai | human | repair | fork | seed
  command TEXT,
  parent_id TEXT,
  fingerprint TEXT,                   -- set by the browser after it renders (source + files + engine version)
  created INTEGER NOT NULL,
  UNIQUE (piece_id, n)
);

CREATE TABLE outputs (
  version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                 -- poster-480 | poster-1200 | video
  key TEXT NOT NULL,                  -- R2 key
  type TEXT NOT NULL,
  w INTEGER, h INTEGER, bytes INTEGER,
  created INTEGER NOT NULL,
  PRIMARY KEY (version_id, name)
);

-- a piece's own files (images it prints, fonts, other .gt files), content-addressed in R2
CREATE TABLE piece_files (
  piece_id TEXT NOT NULL REFERENCES pieces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  PRIMARY KEY (piece_id, name)
);

CREATE TABLE uploads (
  key TEXT NOT NULL,                  -- f/<sha-256> (the same image uploaded twice is stored once)
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (key, owner)
);

CREATE TABLE collections (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL
);
CREATE TABLE collection_items (
  slug TEXT NOT NULL REFERENCES collections(slug) ON DELETE CASCADE,
  piece_id TEXT NOT NULL REFERENCES pieces(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (slug, piece_id)
);
CREATE INDEX collection_order ON collection_items(slug, position);
INSERT INTO collections (slug, title) VALUES ('featured', 'Featured');

CREATE TABLE usage (
  subject TEXT NOT NULL,              -- u:<id> or a:<visitor>
  day TEXT NOT NULL,                  -- YYYY-MM-DD (UTC)
  kind TEXT NOT NULL,                 -- generate | command
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, day, kind)
);
