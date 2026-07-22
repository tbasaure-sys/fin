CREATE TABLE IF NOT EXISTS bls_channel_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL DEFAULT 'channel_profile_v1',
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_channel_profiles_updated_idx
  ON bls_channel_profiles (updated_at DESC);
