CREATE TABLE IF NOT EXISTS analytics_visitors (
  visitor_hash TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL,
  first_country_code TEXT NOT NULL,
  last_country_code TEXT NOT NULL,
  last_region TEXT NOT NULL,
  last_region_code TEXT NOT NULL,
  last_city TEXT NOT NULL,
  language TEXT NOT NULL,
  device_class TEXT NOT NULL,
  viewport_width INTEGER NOT NULL,
  app_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_visitors_last_seen
  ON analytics_visitors(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_analytics_visitors_last_region
  ON analytics_visitors(last_country_code, last_region, last_city);

CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_hash TEXT PRIMARY KEY,
  visitor_hash TEXT NOT NULL,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  start_day TEXT NOT NULL,
  country_code TEXT NOT NULL,
  region TEXT NOT NULL,
  region_code TEXT NOT NULL,
  city TEXT NOT NULL,
  language TEXT NOT NULL,
  device_class TEXT NOT NULL,
  viewport_width INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  referrer_host TEXT NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen
  ON analytics_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_visitor
  ON analytics_sessions(visitor_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_day
  ON analytics_sessions(start_day);

CREATE TABLE IF NOT EXISTS analytics_daily_visitors (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_visitors_visitor
  ON analytics_daily_visitors(visitor_hash, day);

CREATE TABLE IF NOT EXISTS analytics_daily_metrics (
  day TEXT PRIMARY KEY,
  page_views INTEGER NOT NULL DEFAULT 0,
  sessions_started INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  heartbeat_count INTEGER NOT NULL DEFAULT 0,
  peak_online INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
