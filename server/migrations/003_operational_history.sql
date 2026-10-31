CREATE TABLE operational_history (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('policy','profile','screening','agreement')),
  resource_id TEXT NOT NULL,
  provider_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  programme_id TEXT REFERENCES programmes(id) ON DELETE CASCADE,
  previous_data TEXT,
  next_data TEXT NOT NULL,
  changed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX operational_history_resource ON operational_history(kind,resource_id,sequence);
