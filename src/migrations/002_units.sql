BEGIN;

-- Table for per-unit verification results
CREATE TABLE IF NOT EXISTS units (
  task_id   TEXT NOT NULL,
  unit_id   TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  claimed   INTEGER NOT NULL,
  verified  INTEGER NOT NULL,
  reason    TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, unit_id)
);

-- Index for fast task lookups
CREATE INDEX IF NOT EXISTS idx_units_task ON units(task_id);

-- Table for task metrics
CREATE TABLE IF NOT EXISTS metrics (
  task_id   TEXT NOT NULL,
  k         TEXT NOT NULL,
  v         REAL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, k, created_at)
);

COMMIT;