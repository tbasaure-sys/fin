from __future__ import annotations

import pandas as pd

from meta_alpha_allocator.config import AllocatorSettings
from meta_alpha_allocator.production.allocator import allocate_capital, build_sleeve_signal
from meta_alpha_allocator.utils import cap_weights, compute_turnover


def test_cap_weights_respects_position_and_sector_caps() -> None:
    raw = pd.Series({"A": 5.0, "B": 4.0, "C": 1.0})
    sectors = pd.Series({"A": "Tech", "B": "Tech", "C": "Health"})
    capped = cap_weights(raw, max_position=0.45, sector_map=sectors, max_sector=0.60)
    assert abs(capped.sum() - 1.0) < 1e-9
    assert capped.max() <= 0.45 + 1e-9
    assert capped.loc[["A", "B"]].sum() <= 0.60 + 1e-9


def test_compute_turnover_handles_missing_names() -> None:
    previous = pd.Series({"SPY": 0.5, "IEF": 0.5})
    current = pd.Series({"SPY": 0.2, "BIL": 0.8})
    turnover = compute_turnover(previous, current)
    assert abs(turnover - 1.6) < 1e-9


def test_allocate_capital_creates_defense_when_risk_is_high() -> None:
    state = pd.Series({"crash_prob": 0.85, "legitimacy_risk": 0.80, "crowding_pct": 0.70})
    signal = build_sleeve_signal(pd.Timestamp("2025-01-03"), state, selection_strength=0.8, coverage=0.9)
    selection = pd.Series({"AAA": 0.6, "BBB": 0.4})
    sectors = pd.Series({"AAA": "Tech", "BBB": "Health"})
    decision, weights, sleeve = allocate_capital(
        pd.Timestamp("2025-01-03"),
        state,
        signal,
        selection,
        sectors,
        AllocatorSettings(),
        previous_weights=pd.Series({"SPY": 1.0}),
    )
    assert decision.risk_mode == "crisis"
    assert weights["IEF"] + weights["BIL"] >= 0.20
    assert sleeve["expected_edge"] <= 1.0
