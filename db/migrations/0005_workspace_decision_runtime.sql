CREATE TABLE IF NOT EXISTS bls_escrow_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  escrow_key TEXT NOT NULL,
  action_id TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  slot TEXT,
  ticker TEXT,
  tone TEXT,
  funding TEXT,
  size_label TEXT,
  size_value DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'staged',
  auto_mature BOOLEAN NOT NULL DEFAULT FALSE,
  readiness DOUBLE PRECISION NOT NULL DEFAULT 0,
  maturity_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  invalidation_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, escrow_key)
);

CREATE INDEX IF NOT EXISTS bls_escrow_decisions_workspace_idx
  ON bls_escrow_decisions (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bls_decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  action_id TEXT,
  escrow_key TEXT,
  title TEXT,
  user_response TEXT NOT NULL,
  size_override DOUBLE PRECISION,
  note TEXT,
  state_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  counterfactual JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, event_key)
);

CREATE INDEX IF NOT EXISTS bls_decision_events_workspace_idx
  ON bls_decision_events (workspace_id, occurred_at DESC);
