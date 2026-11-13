-- Public and private pieces, and the showcase.
-- visibility: 'private' (only the owner) or 'public' (anyone with the link; eligible for the showcase).
-- published: when it was made public (the showcase favours what is new).
-- The showcase collection is filled by the scheduled job from public pieces; `featured` stays hand-picked.
ALTER TABLE pieces ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE pieces ADD COLUMN published INTEGER;
UPDATE pieces SET visibility = 'public', published = updated WHERE id IN (SELECT piece_id FROM collection_items WHERE slug = 'featured');
CREATE INDEX pieces_public ON pieces(visibility, deleted, status, published DESC);
INSERT OR IGNORE INTO collections (slug, title) VALUES ('showcase', 'Showcase');

-- the last run of each scheduled job
CREATE TABLE job_runs (
  name TEXT PRIMARY KEY,
  ran INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  result TEXT NOT NULL
);
