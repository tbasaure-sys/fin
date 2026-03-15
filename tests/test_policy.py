from __future__ import annotations

import numpy as np
import pandas as pd

from meta_alpha_allocator.config import ResearchSettings
from meta_alpha_allocator.policy.engine import (
    DEFAULT_POLICY_ACTIONS,
    _fit_policy_model,
    _learn_blend_weight,
    _select_non_overlapping_rows,
    _policy_weight_map,
    build_current_policy_output,
    build_policy_state_frame,
    label_policy_actions,
)
from meta_alpha_allocator.scenario_weighting import build_scenario_synthesis


def _proxy_prices() -> pd.DataFrame:
    dates = pd.date_range("2024-01-01", periods=260, freq="B")
    return pd.DataFrame(
        {
            "SPY": np.linspace(100, 120, len(dates)),
            "IEF": np.linspace(100, 106, len(dates)),
            "SHY": np.linspace(100, 102, len(dates)),
            "BIL": np.linspace(100, 101, len(dates)),
            "GLD": np.linspace(100, 110, len(dates)),
            "UUP": np.linspace(100, 104, len(dates)),
            "TLT": np.linspace(100, 105, len(dates)),
            "EFA": np.linspace(100, 108, len(dates)),
            "EEM": np.linspace(100, 103, len(dates)),
            "XLK": np.linspace(100, 115, len(dates)),
            "XLF": np.linspace(100, 111, len(dates)),
            "XLU": np.linspace(100, 107, len(dates)),
        },
        index=dates,
    )


def _state_panel() -> pd.DataFrame:
    dates = pd.date_range("2024-01-01", periods=260, freq="B")
    return pd.DataFrame(
        {
            "date": dates,
            "regime": ["NEUTRAL"] * len(dates),
            "crash_prob": np.linspace(0.2, 0.8, len(dates)),
            "tail_risk_score": np.linspace(0.3, 0.7, len(dates)),
            "legitimacy_risk": np.linspace(0.25, 0.75, len(dates)),
            "crowding_pct": np.linspace(0.4, 0.6, len(dates)),
            "tension_pct": np.linspace(0.3, 0.7, len(dates)),
            "memory_p_fail": np.linspace(0.2, 0.5, len(dates)),
            "recurrence": np.linspace(0.3, 0.6, len(dates)),
            "tail_loss_5d": np.linspace(0.1, 0.2, len(dates)),
            "tail_loss_10d": np.linspace(0.15, 0.25, len(dates)),
            "tail_loss_20d": np.linspace(0.2, 0.3, len(dates)),
            "spy_mom_20d": np.linspace(0.01, 0.04, len(dates)),
            "spy_vol_20d": np.linspace(0.10, 0.20, len(dates)),
            "spy_drawdown_20d": np.linspace(-0.05, -0.12, len(dates)),
            "breadth_20d": np.linspace(0.45, 0.65, len(dates)),
            "dispersion_20d": np.linspace(0.01, 0.03, len(dates)),
            "mean_corr_20d": np.linspace(0.40, 0.70, len(dates)),
            "d_eff_20d": np.linspace(3.0, 1.8, len(dates)),
            "fred_term_spread": np.linspace(0.01, -0.01, len(dates)),
            "fred_hy_spread": np.linspace(0.03, 0.05, len(dates)),
            "fred_hy_ig_gap": np.linspace(0.01, 0.02, len(dates)),
            "fred_m2_yoy": np.linspace(0.08, 0.04, len(dates)),
            "fred_balance_sheet_yoy": np.linspace(0.05, -0.02, len(dates)),
        }
    )


def test_policy_weights_sum_to_one() -> None:
    for action in DEFAULT_POLICY_ACTIONS:
        weights = _policy_weight_map(action)
        assert abs(weights.sum() - 1.0) < 1e-9
        assert (weights >= 0).all()


def test_build_policy_state_frame_is_time_safe() -> None:
    state = _state_panel()
    state.loc[0, "crash_prob"] = 0.11
    state.loc[1:, "crash_prob"] = 0.77
    dates = pd.DatetimeIndex([state.loc[0, "date"], state.loc[10, "date"]])
    frame = build_policy_state_frame(dates, state, _proxy_prices(), ResearchSettings())
    assert abs(frame.iloc[0]["crash_prob"] - 0.11) < 1e-9
    assert abs(frame.iloc[1]["crash_prob"] - 0.77) < 1e-9
    assert "scenario_soft_landing_posterior" in frame.columns
    assert "scenario_recession_crash_posterior" in frame.columns
    assert abs(
        frame.filter(like="scenario_").filter(like="_posterior").iloc[1].sum() - 1.0
    ) < 1e-9


def test_label_policy_actions_avoids_lookahead_on_last_rows() -> None:
    feature_frame = pd.DataFrame({"date": [pd.Timestamp("2024-01-05"), pd.Timestamp("2024-12-20")]})
    for column in [
        "crash_prob", "tail_risk_score", "legitimacy_risk", "crowding_pct", "tension_pct", "memory_p_fail", "recurrence",
        "tail_loss_5d", "tail_loss_10d", "tail_loss_20d", "spy_mom_20d", "spy_vol_20d", "spy_drawdown_20d", "breadth_20d",
        "dispersion_20d", "mean_corr_20d", "d_eff_20d", "fred_term_spread", "fred_hy_spread", "fred_hy_ig_gap",
        "fred_m2_yoy", "fred_balance_sheet_yoy", "sector_top_score", "sector_spread", "international_top_score",
        "international_spread", "hedge_top_score", "hedge_second_score", "hedge_score_gap", "uup_score", "shy_score",
        "ief_score", "gld_score", "tlt_score", "bil_score",
    ]:
        feature_frame[column] = 0.5
    labeled = label_policy_actions(feature_frame, _proxy_prices().pct_change().fillna(0.0))
    assert pd.notna(labeled.iloc[0]["best_action"])
    assert pd.isna(labeled.iloc[1]["best_action"])
    assert "best_regime" in labeled.columns
    assert "training_label" in labeled.columns


def test_label_policy_actions_collapses_to_three_regimes_and_filters_small_spreads() -> None:
    feature_frame = pd.DataFrame({"date": [pd.Timestamp("2024-01-05")]})
    for column in [
        "crash_prob", "tail_risk_score", "legitimacy_risk", "crowding_pct", "tension_pct", "memory_p_fail", "recurrence",
        "tail_loss_5d", "tail_loss_10d", "tail_loss_20d", "spy_mom_20d", "spy_vol_20d", "spy_drawdown_20d", "breadth_20d",
        "dispersion_20d", "mean_corr_20d", "d_eff_20d", "fred_term_spread", "fred_hy_spread", "fred_hy_ig_gap",
        "fred_m2_yoy", "fred_balance_sheet_yoy", "sector_top_score", "sector_spread", "international_top_score",
        "international_spread", "hedge_top_score", "hedge_second_score", "hedge_score_gap", "uup_score", "shy_score",
        "ief_score", "gld_score", "tlt_score", "bil_score",
    ]:
        feature_frame[column] = 0.5

    proxy_returns = _proxy_prices().pct_change().fillna(0.0)
    proxy_returns.loc[proxy_returns.index[:20], "SPY"] = 0.01
    proxy_returns.loc[proxy_returns.index[:20], "BIL"] = 0.0
    labeled = label_policy_actions(feature_frame, proxy_returns, min_forward_spread=0.02, min_utility_gap=0.001)
    assert labeled.iloc[0]["best_regime"] in {"DEFENSIVE", "NEUTRAL", "RISK_ON"}
    assert labeled.iloc[0]["training_label"] in {"DEFENSIVE", "NEUTRAL", "RISK_ON"}
    assert bool(labeled.iloc[0]["label_is_actionable"]) is True

    flat_returns = _proxy_prices().pct_change().fillna(0.0) * 0.0
    muted = label_policy_actions(feature_frame, flat_returns, min_forward_spread=0.02, min_utility_gap=0.001)
    assert bool(muted.iloc[0]["label_is_actionable"]) is False
    assert pd.isna(muted.iloc[0]["training_label"])


def test_non_overlapping_training_rows_respect_forward_horizon() -> None:
    frame = pd.DataFrame(
        {
            "date": pd.date_range("2024-01-05", periods=10, freq="W-FRI"),
            "training_label": ["DEFENSIVE", "RISK_ON"] * 5,
            "best_regime_utility": np.linspace(0.01, 0.10, 10),
            "label_is_actionable": [True] * 10,
            "crash_prob": np.linspace(0.2, 0.8, 10),
        }
    )
    selected = _select_non_overlapping_rows(frame, horizon_days=21)
    assert len(selected) <= 3
    assert selected["date"].is_monotonic_increasing


def test_fit_policy_model_uses_actionable_non_overlapping_regimes() -> None:
    settings = ResearchSettings(policy_min_training_samples=2, forward_horizon_days=21)
    train_frame = pd.DataFrame(
        {
            "date": pd.date_range("2024-01-05", periods=12, freq="W-FRI"),
            "training_label": ["DEFENSIVE", "RISK_ON", "DEFENSIVE", "RISK_ON"] * 3,
            "best_regime_utility": np.linspace(0.02, 0.12, 12),
            "label_is_actionable": [True] * 12,
            "crash_prob": np.linspace(0.2, 0.8, 12),
            "tail_risk_score": np.linspace(0.3, 0.7, 12),
        }
    )
    artifacts = _fit_policy_model(train_frame, ["crash_prob", "tail_risk_score"], settings)
    assert artifacts.used_fallback is False
    assert artifacts.training_samples == 12
    assert 2 <= artifacts.non_overlap_samples < artifacts.training_samples
    assert set(artifacts.mean_utilities) == {"DEFENSIVE", "RISK_ON"}


def test_learn_blend_weight_uses_contextual_history() -> None:
    history = pd.DataFrame(
        {
            "dominant_scenario": ["recession_crash"] * 10 + ["soft_landing"] * 10,
            "confidence_bucket": ["high"] * 20,
            "confidence": [0.7] * 20,
            "policy_beta_target": [1.0] * 10 + [1.0] * 10,
            "scenario_expected_beta": [0.25] * 10 + [0.55] * 10,
            "utility__beta_025": [0.03] * 10 + [0.00] * 10,
            "utility__beta_040": [0.025] * 10 + [0.01] * 10,
            "utility__beta_055": [0.015] * 10 + [0.015] * 10,
            "utility__beta_070": [0.005] * 10 + [0.02] * 10,
            "utility__beta_085": [0.0] * 10 + [0.025] * 10,
            "utility__beta_100": [-0.01] * 10 + [0.03] * 10,
        }
    )
    crash_weight, crash_source = _learn_blend_weight(
        history,
        dominant_scenario="recession_crash",
        confidence=0.7,
        confidence_threshold=0.42,
    )
    soft_weight, soft_source = _learn_blend_weight(
        history,
        dominant_scenario="soft_landing",
        confidence=0.7,
        confidence_threshold=0.42,
    )
    assert crash_source == "scenario_and_confidence"
    assert soft_source == "scenario_and_confidence"
    assert crash_weight < soft_weight


def test_build_current_policy_output_falls_back_when_history_is_small() -> None:
    settings = ResearchSettings()
    feature_history = build_policy_state_frame(pd.DatetimeIndex([pd.Timestamp("2024-03-01"), pd.Timestamp("2024-03-08")]), _state_panel(), _proxy_prices(), settings)
    latest_row = feature_history.iloc[-1]
    payload = build_current_policy_output(settings, feature_history, _proxy_prices().pct_change().fillna(0.0), latest_row)
    assert payload["veto_reason"] == "insufficient_training_history"
    assert payload["selected_hedge"] in {"SHY", "IEF", "GLD", "UUP", "BIL", "TLT"}
    assert "scenario_synthesis" in payload
    assert 0.0 <= payload["scenario_expected_beta"] <= 1.0


def test_scenario_synthesis_returns_normalized_posterior() -> None:
    settings = ResearchSettings()
    feature_history = build_policy_state_frame(pd.DatetimeIndex(pd.date_range("2024-01-05", periods=20, freq="W-FRI")), _state_panel(), _proxy_prices(), settings)
    synthesis = build_scenario_synthesis(feature_history, feature_history.iloc[-1])
    assert abs(sum(synthesis.posterior.values()) - 1.0) < 1e-9
    assert synthesis.preferred_hedge in {"SHY", "IEF", "GLD", "UUP", "BIL", "TLT"}
    assert 0.15 <= synthesis.expected_beta <= 0.90
