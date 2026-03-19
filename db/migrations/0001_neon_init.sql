CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bls_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id TEXT UNIQUE,
  email TEXT UNIQUE,
  display_name TEXT,
  plan TEXT NOT NULL DEFAULT 'alpha',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bls_workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id UUID REFERENCES bls_user_profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bls_watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT,
  conviction TEXT,
  last_signal TEXT,
  change_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, symbol)
);

CREATE INDEX IF NOT EXISTS bls_watchlist_items_workspace_idx
  ON bls_watchlist_items (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bls_command_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_command_history_workspace_idx
  ON bls_command_history (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bls_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  view_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, view_key)
);

CREATE TABLE IF NOT EXISTS bls_workspace_preferences (
  workspace_id TEXT PRIMARY KEY REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  density TEXT,
  default_module TEXT,
  theme TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bls_portfolio_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  asset_type TEXT,
  quantity DOUBLE PRECISION,
  avg_cost_usd DOUBLE PRECISION,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, ticker)
);

CREATE INDEX IF NOT EXISTS bls_portfolio_positions_workspace_idx
  ON bls_portfolio_positions (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bls_portfolio_trade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity DOUBLE PRECISION,
  price_usd DOUBLE PRECISION,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_portfolio_trade_events_workspace_idx
  ON bls_portfolio_trade_events (workspace_id, created_at DESC);
