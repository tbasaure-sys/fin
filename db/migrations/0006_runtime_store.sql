CREATE TABLE IF NOT EXISTS bls_runtime_documents (
  document_key text PRIMARY KEY,
  source text NOT NULL DEFAULT 'unknown',
  generated_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bls_runtime_tables (
  dataset_key text PRIMARY KEY,
  table_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bls_runtime_snapshots (
  snapshot_key text PRIMARY KEY,
  source text NOT NULL DEFAULT 'dashboard',
  status text NOT NULL DEFAULT 'ready',
  generated_at timestamptz,
  as_of_date date,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bls_runtime_refresh_runs (
  refresh_key text PRIMARY KEY,
  trigger_source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'started',
  started_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz,
  error_message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS bls_runtime_documents_updated_idx
  ON bls_runtime_documents (updated_at DESC);

CREATE INDEX IF NOT EXISTS bls_runtime_tables_updated_idx
  ON bls_runtime_tables (updated_at DESC);

CREATE INDEX IF NOT EXISTS bls_runtime_snapshots_generated_idx
  ON bls_runtime_snapshots (generated_at DESC);

CREATE INDEX IF NOT EXISTS bls_runtime_refresh_runs_started_idx
  ON bls_runtime_refresh_runs (started_at DESC);
