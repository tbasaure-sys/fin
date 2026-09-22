CREATE TABLE IF NOT EXISTS bls_living_cases_v1 (
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,11}$'),
  language TEXT NOT NULL CHECK (language IN ('es', 'en')),
  baseline_key TEXT NOT NULL CHECK (length(baseline_key) = 64),
  baseline JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, ticker)
);
CREATE INDEX IF NOT EXISTS bls_living_cases_owner_idx
  ON bls_living_cases_v1 (owner_id, workspace_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS bls_living_case_events_v1 (
  event_key TEXT PRIMARY KEY CHECK (length(event_key) = 64),
  workspace_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  source_accession TEXT NOT NULL,
  source_accepted_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workspace_id, ticker) REFERENCES bls_living_cases_v1(workspace_id, ticker) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS bls_living_case_events_owner_idx
  ON bls_living_case_events_v1 (owner_id, workspace_id, created_at DESC);
