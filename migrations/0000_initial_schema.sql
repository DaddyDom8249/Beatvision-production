PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS bv_users(
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bv_sessions(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES bv_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bv_sessions_token_idx ON bv_sessions(token_hash);

CREATE TABLE IF NOT EXISTS bv_projects(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES bv_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  creative_direction TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  audio_source_id TEXT,
  audio_source_url TEXT,
  audio_name TEXT,
  audio_type TEXT,
  audio_size INTEGER,
  audio_duration REAL,
  hero_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bv_projects_user_idx ON bv_projects(user_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS bv_world_reports(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES bv_projects(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bv_renders(
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES bv_projects(id) ON DELETE CASCADE,
  provider_render_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  output_url TEXT,
  poster_url TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bv_renders_project_idx ON bv_renders(project_id,created_at DESC);
