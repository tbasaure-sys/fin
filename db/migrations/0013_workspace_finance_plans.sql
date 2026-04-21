CREATE TABLE IF NOT EXISTS bls_workspace_finance_plans (
  workspace_id TEXT PRIMARY KEY REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  monthly_income DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (monthly_income >= 0),
  fixed_expenses DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (fixed_expenses >= 0),
  variable_expenses DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (variable_expenses >= 0),
  safety_buffer DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (safety_buffer >= 0),
  target_monthly_investment DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (target_monthly_investment >= 0),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_workspace_finance_plans_updated_idx
  ON bls_workspace_finance_plans (updated_at DESC);
