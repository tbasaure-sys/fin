CREATE TABLE IF NOT EXISTS bls_workspace_members (
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS bls_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_auth_sessions_user_idx
  ON bls_auth_sessions (user_profile_id, created_at DESC);

ALTER TABLE bls_portfolio_positions
  ADD COLUMN IF NOT EXISTS sector TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS source_sheet TEXT,
  ADD COLUMN IF NOT EXISTS current_price_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS market_value_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION;
