PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  lyrics TEXT NOT NULL DEFAULT '',
  creative_direction TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  audio_key TEXT,
  audio_name TEXT,
  audio_type TEXT,
  audio_size INTEGER,
  duration_seconds REAL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS world_reports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_index INTEGER NOT NULL,
  start_seconds REAL NOT NULL,
  duration_seconds REAL NOT NULL,
  prompt TEXT NOT NULL,
  image_url TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, scene_index)
);

CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id, scene_index);

CREATE TABLE IF NOT EXISTS renders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_render_id TEXT,
  status TEXT NOT NULL,
  output_url TEXT,
  poster_url TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_renders_project ON renders(project_id, created_at DESC);
