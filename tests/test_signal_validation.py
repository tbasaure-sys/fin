import numpy as np
import pandas as pd

from meta_alpha_allocator.signal_intelligence.validation import ValidationConfig, evaluate_signal_validation


def _bars(count=620):
    dates = pd.date_range("2024-01-01", periods=count, freq="D")
    close = 100 * np.exp(np.arange(count) * 0.004)
    return pd.DataFrame({
        "date": dates,
        "open": close * 0.998,
        "high": close * 1.01,
        "low": close * 0.99,
        "close": close,
        "volume": 1000 + np.arange(count) * 10,
    })


def test_validation_is_walk_forward_and_keeps_qualification_separate_from_daily_state():
    result = evaluate_signal_validation(
        {"SPY": {"bars": _bars(), "assetClass": "etf"}},
        config=ValidationConfig(
            bootstrap_repetitions=10,
            min_assets=1,
            min_asset_days=1,
            min_fold_stability=0,
            max_bh_q=1,
        ),
    )

    assert result["schemaVersion"] == "signal-validation.v1"
    assert result["primaryHorizon"] == 21
    assert "score" not in result
    assert result["status"] in {"qualified", "descriptive_only"}
    assert result["burnIn"] >= 750
    assert all("score" not in group for group in result["groups"])
