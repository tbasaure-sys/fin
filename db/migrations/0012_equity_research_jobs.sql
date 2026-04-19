CREATE TABLE IF NOT EXISTS bls_equity_research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'quick',
  status TEXT NOT NULL DEFAULT 'queued',
  backend_run_id TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_run_id UUID REFERENCES bls_equity_research_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_equity_research_jobs_workspace_ticker_idx
  ON bls_equity_research_jobs (workspace_id, ticker, created_at DESC);

CREATE INDEX IF NOT EXISTS bls_equity_research_jobs_backend_run_idx
  ON bls_equity_research_jobs (backend_run_id);

CREATE INDEX IF NOT EXISTS bls_equity_research_jobs_status_idx
  ON bls_equity_research_jobs (status, updated_at DESC);
