PRAGMA foreign_keys = ON;

ALTER TABLE workshop_sessions ADD COLUMN csrf_hash TEXT;

CREATE TABLE IF NOT EXISTS workshop_oauth_states (
  state_hash TEXT PRIMARY KEY,
  return_to TEXT NOT NULL CHECK(length(return_to) BETWEEN 1 AND 300),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workshop_oauth_states_expiry
  ON workshop_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS workshop_idempotency_keys (
  user_id TEXT NOT NULL REFERENCES workshop_users(user_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('create_item', 'create_revision')),
  key_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL CHECK(response_status BETWEEN 200 AND 299),
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(user_id, action, key_hash)
);

CREATE INDEX IF NOT EXISTS idx_workshop_idempotency_expiry
  ON workshop_idempotency_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_workshop_revisions_creator_created
  ON workshop_revisions(created_by_user_id, created_at DESC);
