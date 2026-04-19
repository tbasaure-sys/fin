CREATE TABLE IF NOT EXISTS bls_equity_research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'quick',
  status TEXT NOT NULL DEFAULT 'ready',
  generated_at TIMESTAMPTZ,
  provider_status TEXT,
  report_markdown TEXT NOT NULL DEFAULT '',
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  audit JSONB NOT NULL DEFAULT '{}'::jsonb,
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_equity_research_runs_workspace_ticker_idx
  ON bls_equity_research_runs (workspace_id, ticker, created_at DESC);

CREATE INDEX IF NOT EXISTS bls_equity_research_runs_ticker_idx
  ON bls_equity_research_runs (ticker, created_at DESC);
