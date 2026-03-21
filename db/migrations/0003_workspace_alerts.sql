CREATE TABLE IF NOT EXISTS bls_workspace_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  alert_id TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  body TEXT,
  action TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, alert_id)
);

CREATE INDEX IF NOT EXISTS bls_workspace_alerts_workspace_idx
  ON bls_workspace_alerts (workspace_id, updated_at DESC);
