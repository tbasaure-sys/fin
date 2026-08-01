CREATE TABLE IF NOT EXISTS bls_channel_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES bls_workspaces(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL DEFAULT 'channel_profile_v1',
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bls_channel_profiles_updated_idx
  ON bls_channel_profiles (updated_at DESC);

-- Privacy contract: legacy rows that cannot be reconstructed as a complete,
-- explicitly public-safe v1 profile must not survive a deploy.
DELETE FROM bls_channel_profiles
WHERE schema_version <> 'channel_profile_v1'
   OR jsonb_typeof(answers) IS DISTINCT FROM 'object'
   OR COALESCE(answers->>'version', '') <> 'channel_profile_v1'
   OR COALESCE(answers->>'source_safety', '') <> 'public_safe'
   OR COALESCE(answers->>'direct_experience', '') NOT IN ('none', 'occasional', 'repeated', 'operator')
   OR COALESCE(answers->>'repeatability', '') NOT IN ('one_off', 'quarterly', 'monthly', 'weekly')
   OR COALESCE(answers->>'issuer_kpi_mapping', '') NOT IN ('none', 'issuer_only', 'issuer_kpi', 'issuer_kpi_timing')
   OR COALESCE(answers->>'testability', '') NOT IN ('narrative', 'directional', 'dated_falsifier', 'repeated_predictions')
   OR COALESCE(answers->>'protection_time_fit', '') NOT IN ('none', 'attention_fit', 'specialized_fit', 'local_fit', 'protected_low_time')
   OR CASE
        WHEN jsonb_typeof(answers->'archetypes') = 'array'
          THEN jsonb_array_length(answers->'archetypes') NOT BETWEEN 1 AND 3
        ELSE TRUE
      END
   OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(answers->'archetypes') = 'array' THEN answers->'archetypes'
            ELSE '[]'::jsonb
          END
        ) AS archetype(value)
        WHERE archetype.value NOT IN (
          'professional_workflow',
          'local_geographic',
          'public_records',
          'procurement',
          'technical_product',
          'regulated_economics',
          'public_supply_chain',
          'consumer_behavior'
        )
      )
   OR CASE
        WHEN jsonb_typeof(answers->'public_sources') = 'array'
          THEN jsonb_array_length(answers->'public_sources') NOT BETWEEN 1 AND 3
        ELSE TRUE
      END
   OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(answers->'public_sources') = 'array' THEN answers->'public_sources'
            ELSE '[]'::jsonb
          END
        ) AS source(value)
        WHERE source.value NOT IN (
          'public_filings',
          'government_records',
          'public_prices',
          'product_docs',
          'public_observation',
          'none'
        )
      );
