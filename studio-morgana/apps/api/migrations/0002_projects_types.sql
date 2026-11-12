-- Projects and piece types.
-- A project is a wall of its own: pieces are pinned to it (yours or anyone's; a pin does not copy the piece).
-- A piece's type says what it is as media, and so how it is shown and exported: image | video (slides next).
-- `category` (cards, posts, scenes) stays as what the source draws; the wall's tabs now go by type.

ALTER TABLE pieces ADD COLUMN type TEXT NOT NULL DEFAULT 'image';
UPDATE pieces SET type = 'video' WHERE category = 'videos';
CREATE INDEX pieces_type ON pieces(owner, deleted, type, updated DESC);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,                -- u:<user id> or a:<visitor id>
  name TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX projects_owner ON projects(owner, deleted, updated DESC);

CREATE TABLE project_pins (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  piece_id TEXT NOT NULL REFERENCES pieces(id) ON DELETE CASCADE,
  pinned INTEGER NOT NULL,
  PRIMARY KEY (project_id, piece_id)
);
CREATE INDEX project_pins_order ON project_pins(project_id, pinned DESC);
CREATE INDEX project_pins_piece ON project_pins(piece_id);
