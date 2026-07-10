CREATE TABLE IF NOT EXISTS bls_public_breakpoint_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  status TEXT NOT NULL,
  model_version TEXT,
  generated_at TIMESTAMPTZ NOT NULL,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_public_breakpoint_runs_ticker_created_idx
  ON bls_public_breakpoint_runs (ticker, created_at DESC);
