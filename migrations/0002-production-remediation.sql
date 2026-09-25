-- Production remediation migration.
-- Apply to the existing remote D1 database before deploying the new Worker.
ALTER TABLE projects ADD COLUMN audio_duration REAL;

ALTER TABLE scenes ADD COLUMN motion_effect TEXT NOT NULL DEFAULT 'zoomIn';
ALTER TABLE scenes ADD COLUMN image_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE scenes ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id,scene_index);
CREATE INDEX IF NOT EXISTS idx_scenes_image_status ON scenes(project_id,image_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_renders_provider_id ON renders(provider_render_id);
