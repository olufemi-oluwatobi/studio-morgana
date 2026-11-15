-- Uploads are either assets (printed in pieces: logos, photos, SVGs; kept in the person's library) or references
-- (looked at for style, never printed). The browser measures each image as it uploads it.
ALTER TABLE uploads ADD COLUMN kind TEXT NOT NULL DEFAULT 'reference';   -- 'asset' | 'reference'
ALTER TABLE uploads ADD COLUMN label TEXT;                               -- logo, photo, illustration, icon, pattern …
ALTER TABLE uploads ADD COLUMN width INTEGER;
ALTER TABLE uploads ADD COLUMN height INTEGER;
ALTER TABLE uploads ADD COLUMN palette TEXT;                             -- JSON ["#rrggbb", …], most used first
ALTER TABLE uploads ADD COLUMN saved INTEGER NOT NULL DEFAULT 0;         -- in the person's asset library
