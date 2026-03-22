CREATE TABLE IF NOT EXISTS bls_position_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, ticker)
);

CREATE INDEX IF NOT EXISTS bls_position_stories_workspace_idx
  ON bls_position_stories (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bls_workspace_memory_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bls_counterfactual_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  outcome_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, outcome_key)
);

CREATE INDEX IF NOT EXISTS bls_counterfactual_outcomes_workspace_idx
  ON bls_counterfactual_outcomes (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bls_capital_twin_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  twin_key TEXT NOT NULL DEFAULT 'current',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, twin_key)
);

CREATE INDEX IF NOT EXISTS bls_capital_twin_runs_workspace_idx
  ON bls_capital_twin_runs (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bls_workspace_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  mandate_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, mandate_key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS bls_workspace_mandates_active_idx
  ON bls_workspace_mandates (workspace_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS bls_workspace_mandates_workspace_idx
  ON bls_workspace_mandates (workspace_id, updated_at DESC);
