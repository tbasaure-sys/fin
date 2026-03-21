CREATE TABLE IF NOT EXISTS bls_portfolio_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  capture_bucket TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_value_usd DOUBLE PRECISION NOT NULL,
  benchmark_symbol TEXT,
  benchmark_price_usd DOUBLE PRECISION,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, capture_bucket)
);

CREATE INDEX IF NOT EXISTS bls_portfolio_history_workspace_idx
  ON bls_portfolio_history (workspace_id, capture_bucket DESC);
