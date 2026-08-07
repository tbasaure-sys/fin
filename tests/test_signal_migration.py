from pathlib import Path


def test_signal_intelligence_migration_is_additive_and_contains_common_spine_tables():
    migration = Path("db/migrations/0018_signal_intelligence.sql").read_text(encoding="utf-8")

    for table in (
        "bls_market_assets",
        "bls_market_bars_eod",
        "bls_analysis_runs",
        "bls_decision_evidence_links",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table}" in migration
    assert "ADD COLUMN IF NOT EXISTS record_version" in migration
    assert "ADD COLUMN IF NOT EXISTS subject_type" in migration
    assert "ADD COLUMN IF NOT EXISTS subject_key" in migration
    assert "coverage_status" in migration
    assert "coverage_pct" in migration
    assert "last_data_date" in migration
    assert "request.security" not in migration
