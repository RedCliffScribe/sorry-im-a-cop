PRAGMA foreign_keys = ON;

ALTER TABLE workshop_items ADD COLUMN admin_disabled_previous_status TEXT
  CHECK(admin_disabled_previous_status IS NULL OR admin_disabled_previous_status IN ('published', 'unlisted'));

CREATE INDEX IF NOT EXISTS idx_workshop_users_status_role
  ON workshop_users(status, role, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workshop_admin_actions_created
  ON workshop_admin_actions(created_at DESC, action_id DESC);
