-- The stamp library: everyday drawings converted to godtongue, checked, and published by admins.
-- A draft is not used by the generator; only published stamps are offered to it.
CREATE TABLE IF NOT EXISTS library_stamps (
  slug TEXT PRIMARY KEY,                     -- the godtongue word, e.g. house, rose-tree
  name TEXT NOT NULL,                        -- how people read it: "House"
  words TEXT NOT NULL DEFAULT '[]',          -- JSON: words a brief might use for it
  tags TEXT NOT NULL DEFAULT '[]',           -- JSON: groups such as "food", "home", "nature"
  parts TEXT NOT NULL DEFAULT '[]',          -- JSON: [{ name, area }], the coloured parts
  source TEXT NOT NULL DEFAULT '',           -- where it came from, e.g. game-icons/delapouite/house
  credit TEXT NOT NULL DEFAULT '',           -- the credit line the licence needs
  gt TEXT NOT NULL,                          -- the godtongue definition, checked on import
  svg TEXT NOT NULL,                         -- preview drawing
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | published | hidden
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS library_stamps_status ON library_stamps (status);
