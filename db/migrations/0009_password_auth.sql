ALTER TABLE bls_user_profiles
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
