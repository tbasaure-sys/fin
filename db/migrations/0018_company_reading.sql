CREATE TABLE IF NOT EXISTS bls_company_reading_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bls_company_thesis_ledgers (
  scope TEXT NOT NULL CHECK (scope IN ('guest', 'account')),
  owner UUID NOT NULL,
  ticker TEXT NOT NULL,
  version INTEGER NOT NULL,
  ledger JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, owner, ticker)
);
