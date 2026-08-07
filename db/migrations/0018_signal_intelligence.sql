CREATE TABLE IF NOT EXISTS bls_market_assets (
  asset_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'fmp',
  provider_symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  benchmark_key TEXT,
  volume_kind TEXT NOT NULL DEFAULT 'none',
  calendar_key TEXT NOT NULL DEFAULT 'business',
  rights_status TEXT NOT NULL DEFAULT 'pending',
  coverage_status TEXT NOT NULL DEFAULT 'unknown',
  coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_data_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_market_assets_active_idx
  ON bls_market_assets (is_active, rights_status, asset_class, asset_key);

CREATE TABLE IF NOT EXISTS bls_market_bars_eod (
  asset_key TEXT NOT NULL REFERENCES bls_market_assets(asset_key) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  session_date DATE NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  adj_close DOUBLE PRECISION,
  raw_close DOUBLE PRECISION,
  adjustment_factor DOUBLE PRECISION NOT NULL DEFAULT 1,
  volume DOUBLE PRECISION,
  input_hash TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (asset_key, provider, session_date)
);

CREATE INDEX IF NOT EXISTS bls_market_bars_eod_lookup_idx
  ON bls_market_bars_eod (asset_key, session_date DESC);

CREATE TABLE IF NOT EXISTS bls_analysis_runs (
  id UUID PRIMARY KEY,
  workspace_id TEXT REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  available_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  receipt JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_analysis_runs_subject_idx
  ON bls_analysis_runs (workspace_id, run_type, subject_type, subject_key, as_of_date DESC);

CREATE INDEX IF NOT EXISTS bls_analysis_runs_latest_idx
  ON bls_analysis_runs (run_type, subject_type, subject_key, as_of_date DESC);

CREATE TABLE IF NOT EXISTS bls_decision_evidence_links (
  decision_event_id UUID NOT NULL REFERENCES bls_decision_events(id) ON DELETE CASCADE,
  analysis_run_id UUID NOT NULL REFERENCES bls_analysis_runs(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (decision_event_id, analysis_run_id, role)
);

ALTER TABLE bls_decision_events
  ADD COLUMN IF NOT EXISTS record_version TEXT NOT NULL DEFAULT 'legacy.v1';

ALTER TABLE bls_decision_events
  ADD COLUMN IF NOT EXISTS subject_type TEXT;

ALTER TABLE bls_decision_events
  ADD COLUMN IF NOT EXISTS subject_key TEXT;

ALTER TABLE bls_decision_events
  ADD COLUMN IF NOT EXISTS as_of_date DATE;
