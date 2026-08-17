PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workshop_users (
  user_id TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80),
  avatar_ref TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS workshop_sessions (
  session_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES workshop_users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workshop_sessions_user
  ON workshop_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_workshop_sessions_expiry
  ON workshop_sessions(expires_at);

CREATE TABLE IF NOT EXISTS workshop_items (
  item_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES workshop_users(user_id),
  kind TEXT NOT NULL CHECK(kind = 'image-generation-preset'),
  slug TEXT UNIQUE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  summary TEXT NOT NULL CHECK(length(summary) BETWEEN 1 AND 2000),
  language TEXT NOT NULL CHECK(length(language) BETWEEN 2 AND 35),
  content_rating TEXT NOT NULL CHECK(content_rating IN ('general', 'mature')),
  tags_json TEXT NOT NULL CHECK(json_valid(tags_json)),
  status TEXT NOT NULL CHECK(status IN ('published', 'unlisted', 'disabled', 'deleted')),
  latest_revision_id TEXT,
  disabled_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workshop_items_public
  ON workshop_items(status, kind, updated_at DESC, item_id DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_items_owner
  ON workshop_items(owner_user_id);

CREATE TABLE IF NOT EXISTS workshop_revisions (
  revision_id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES workshop_items(item_id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK(revision_number > 0),
  schema_version INTEGER NOT NULL CHECK(schema_version > 0),
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256) = 64),
  r2_key TEXT NOT NULL UNIQUE,
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 262144),
  compatibility_json TEXT NOT NULL CHECK(json_valid(compatibility_json)),
  changelog TEXT NOT NULL CHECK(length(changelog) BETWEEN 1 AND 2000),
  created_by_user_id TEXT NOT NULL REFERENCES workshop_users(user_id),
  created_at TEXT NOT NULL,
  UNIQUE(item_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_workshop_revisions_item
  ON workshop_revisions(item_id, revision_number DESC);

CREATE TRIGGER IF NOT EXISTS workshop_items_latest_revision_insert_guard
BEFORE INSERT ON workshop_items
WHEN NEW.latest_revision_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'latest revision must be linked after item creation');
END;

CREATE TRIGGER IF NOT EXISTS workshop_items_latest_revision_update_guard
BEFORE UPDATE OF latest_revision_id ON workshop_items
WHEN NEW.latest_revision_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM workshop_revisions revision
    WHERE revision.revision_id = NEW.latest_revision_id
      AND revision.item_id = NEW.item_id
  )
BEGIN
  SELECT RAISE(ABORT, 'latest revision must belong to item');
END;

CREATE TABLE IF NOT EXISTS workshop_admin_actions (
  action_id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES workshop_users(user_id),
  action TEXT NOT NULL CHECK(length(action) BETWEEN 1 AND 80),
  target_type TEXT NOT NULL CHECK(target_type IN ('item', 'user', 'revision', 'role')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
  before_summary_json TEXT CHECK(before_summary_json IS NULL OR json_valid(before_summary_json)),
  after_summary_json TEXT CHECK(after_summary_json IS NULL OR json_valid(after_summary_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workshop_admin_actions_target
  ON workshop_admin_actions(target_type, target_id, created_at DESC);
