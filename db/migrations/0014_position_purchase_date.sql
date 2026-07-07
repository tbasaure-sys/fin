-- Adds purchase_date to portfolio positions so performance can be
-- reconstructed from holdings + real historical prices without snapshots.
ALTER TABLE bls_portfolio_positions
  ADD COLUMN IF NOT EXISTS purchase_date DATE;
