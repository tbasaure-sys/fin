from __future__ import annotations

import pandas as pd

from meta_alpha_allocator.presentation.phantom_cli import render_phantom_terminal


def test_render_phantom_terminal_contains_core_sections() -> None:
    payload = {
        "beta_target": 0.25,
        "selected_hedge": "SHY",
        "policy_confidence": 0.70,
        "policy_expected_utility": 0.01,
        "best_alternative_action": "beta_040",
        "best_hedge_now": "SHY",
        "tail_risk": {"tail_loss_5d": 0.7, "tail_loss_10d": 0.8, "tail_loss_20d": 0.9, "tail_risk_score": 0.8},
        "overlay_report": {
            "state": {"regime": "RISK_ON", "crash_prob": 0.45, "tail_risk_score": 0.88, "legitimacy_risk": 0.44},
            "hedge_summary": {"primary_hedge": "SHY", "secondary_hedge": "GLD", "us_treasuries_best_hedge": True},
        },
        "policy_decision": {
            "date": "2026-03-13",
            "explanation_fields": {
                "why_this_action": ["memory_p_fail supported beta target 25%"],
                "conditions_that_flip_decision": ["crash_prob moving higher would favor beta target 40%"],
            },
        },
    }
    research_summary = {
        "benchmark_spy": {"annual_return": 0.13, "sharpe": 0.79, "max_drawdown": -0.33},
        "state_overlay": {"annual_return": 0.12, "sharpe": 1.06, "max_drawdown": -0.24},
    }
    policy_summary = {
        "policy_overlay": {"annual_return": 0.11, "sharpe": 1.10, "max_drawdown": -0.15},
        "high_vs_low_confidence": {
            "high": {"annual_return": 0.16, "sharpe": 1.6, "max_drawdown": -0.14},
            "low": {"annual_return": 0.06, "sharpe": 0.59, "max_drawdown": -0.18},
        },
    }
    sector_map = pd.DataFrame([{"sector": "Technology", "proxy_ticker": "XLK", "opportunity_score": 0.8, "mom_60d": 0.1, "view": "preferred"}])
    international_map = pd.DataFrame([{"market": "Canada", "ticker": "EWC", "opportunity_score": 0.7, "mom_60d": 0.05, "view": "preferred"}])
    hedge_ranking = pd.DataFrame([{"ticker": "SHY", "hedge_score": 0.77, "carry_60d": 0.01, "drawdown_63d": -0.01, "corr_spy_63d": -0.13, "view": "preferred"}])

    rendered = render_phantom_terminal(payload, research_summary, policy_summary, sector_map, international_map, hedge_ranking)
    assert "PHANTOM TERMINAL" in rendered
    assert "Beta target" in rendered
    assert "Hedge Intel" in rendered
    assert "Technology" in rendered
    assert "Canada" in rendered
