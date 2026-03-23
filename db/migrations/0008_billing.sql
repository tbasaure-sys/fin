CREATE TABLE IF NOT EXISTS bls_billing_accounts (
  user_profile_id UUID PRIMARY KEY REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
  billing_email TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT NOT NULL DEFAULT 'inactive',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  stripe_checkout_session_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_billing_accounts_plan_idx
  ON bls_billing_accounts (plan, plan_status, updated_at DESC);
