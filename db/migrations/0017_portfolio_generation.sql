ALTER TABLE bls_portfolio_positions
  ADD COLUMN IF NOT EXISTS portfolio_generation_started_at TIMESTAMPTZ;
