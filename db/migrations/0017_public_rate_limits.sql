CREATE TABLE IF NOT EXISTS bls_public_rate_limits (
  scope TEXT NOT NULL,
  client_hash TEXT NOT NULL CHECK (length(client_hash) = 64),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, client_hash)
);

CREATE INDEX IF NOT EXISTS bls_public_rate_limits_updated_at_idx
  ON bls_public_rate_limits (updated_at);
