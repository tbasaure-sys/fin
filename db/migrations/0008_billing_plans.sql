CREATE TABLE IF NOT EXISTS bls_billing_subscriptions (
  user_profile_id UUID PRIMARY KEY REFERENCES bls_user_profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  plan_key TEXT NOT NULL DEFAULT 'founder',
  status TEXT NOT NULL DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_billing_subscriptions_plan_idx
  ON bls_billing_subscriptions (plan_key, status);

CREATE UNIQUE INDEX IF NOT EXISTS bls_billing_subscriptions_provider_subscription_idx
  ON bls_billing_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
