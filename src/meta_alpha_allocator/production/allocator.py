from __future__ import annotations

from dataclasses import asdict

import numpy as np
import pandas as pd

from ..config import AllocatorSettings
from ..models import AllocatorDecision, SleeveSignal
from ..utils import cap_weights, compute_turnover, sigmoid


def build_sleeve_signal(date: pd.Timestamp, state_row: pd.Series, selection_strength: float, coverage: float) -> SleeveSignal:
    structural_prior = float(state_row.get("crash_prob", 0.5))
    tail_risk = float(state_row.get("tail_risk_score", structural_prior))
    structural_prior = float(np.clip(0.55 * structural_prior + 0.45 * tail_risk, 0.0, 1.0))
    legitimacy_risk = float(state_row.get("legitimacy_risk", structural_prior))
    legitimacy_risk = float(np.clip(0.70 * legitimacy_risk + 0.30 * tail_risk, 0.0, 1.0))
    crowding = float(state_row.get("crowding_pct", 0.5))
    edge_score = sigmoid(4.0 * (selection_strength - 0.5))
    legitimacy_score = float(np.clip(1.0 - (0.60 * legitimacy_risk + 0.25 * crowding + 0.15 * (1.0 - coverage)), 0.0, 1.0))
    expected_edge = float(np.clip(edge_score * legitimacy_score, 0.0, 1.0))
    veto_reason = None
    if legitimacy_score < 0.25:
        veto_reason = "systemic_fragility"
    elif coverage < 0.20:
        veto_reason = "low_feature_coverage"

    return SleeveSignal(
        date=str(date.date()),
        sleeve="selection",
        score=edge_score,
        confidence=float(np.clip(0.5 * coverage + 0.5 * (1.0 - structural_prior), 0.0, 1.0)),
        expected_edge=expected_edge,
        veto_reason=veto_reason,
    )


def allocate_capital(
    date: pd.Timestamp,
    state_row: pd.Series,
    sleeve_signal: SleeveSignal,
    selection_weights: pd.Series,
    sector_map: pd.Series,
    settings: AllocatorSettings,
    previous_weights: pd.Series | None = None,
) -> tuple[AllocatorDecision, pd.Series, dict[str, float]]:
    structural = float(state_row.get("crash_prob", 0.5))
    tail_risk = float(state_row.get("tail_risk_score", structural))
    structural = float(np.clip(0.50 * structural + 0.50 * tail_risk, 0.0, 1.0))
    legitimacy = 1.0 - float(np.clip(state_row.get("legitimacy_risk", structural) * 0.70 + tail_risk * 0.30, 0.0, 1.0))
    expected_edge = sleeve_signal.expected_edge

    risk_budget = np.clip(1.0 - 0.50 * structural, 0.45, 1.05)
    defense_floor = settings.min_defense_weight if structural >= 0.50 else max(0.04, settings.min_defense_weight * 0.50)
    selection_weight = settings.base_selection_weight * risk_budget * np.clip(0.55 + expected_edge, 0.25, 1.25) * np.clip(0.65 + legitimacy, 0.25, 1.20)
    selection_weight = float(np.clip(selection_weight, settings.min_selection_weight, 0.70))
    core_weight = float(np.clip(settings.base_core_weight * np.clip(1.00 - 0.40 * structural, 0.50, 1.15) * np.clip(1.00 - 0.15 * expected_edge, 0.55, 1.10), 0.10, 0.75))
    defense_weight = float(np.clip(1.0 - selection_weight - core_weight, defense_floor, 0.80))

    total = selection_weight + core_weight + defense_weight
    selection_weight /= total
    core_weight /= total
    defense_weight /= total

    if structural >= settings.crisis_threshold:
        risk_mode = "crisis"
    elif structural >= settings.defensive_threshold:
        risk_mode = "defensive"
    else:
        risk_mode = "balanced"

    defense_ief_share = float(np.clip(0.85 - structural, 0.25, 0.80))
    defense_split = {"IEF": defense_weight * defense_ief_share, "BIL": defense_weight * (1.0 - defense_ief_share)}

    basket = cap_weights(
        selection_weights * selection_weight,
        max_position=settings.max_position,
        sector_map=sector_map,
        max_sector=settings.max_sector,
    )
    full_weights = pd.concat(
        [
            pd.Series({"SPY": core_weight}),
            pd.Series(defense_split),
            basket,
        ]
    )
    full_weights = full_weights.groupby(level=0).sum()
    full_weights = full_weights / full_weights.sum()
    base_previous = previous_weights if previous_weights is not None else pd.Series(dtype=float)
    turnover = compute_turnover(base_previous, full_weights)

    decision = AllocatorDecision(
        date=str(date.date()),
        risk_mode=risk_mode,
        core_beta_weight=float(core_weight),
        defense_weight=float(defense_weight),
        selection_weight=float(selection_weight),
        turnover=turnover,
    )
    return decision, full_weights, asdict(sleeve_signal)


def build_latest_decision(
    latest_date: pd.Timestamp,
    latest_state: pd.Series,
    selection_panel: pd.DataFrame,
    settings: AllocatorSettings,
    selection_strength: float | None = None,
    previous_weights: pd.Series | None = None,
) -> tuple[AllocatorDecision, pd.Series, dict[str, float]]:
    eligible = selection_panel.loc[selection_panel["date"] == latest_date].copy()
    coverage = float(eligible["selection_score"].notna().mean()) if not eligible.empty else 0.0
    selection_strength = float(selection_strength if selection_strength is not None else (eligible["selection_rank"].mean() if not eligible.empty else 0.5))
    sleeve_signal = build_sleeve_signal(latest_date, latest_state, selection_strength, coverage)
    ranked = eligible.sort_values("selection_score", ascending=False).head(20)
    raw_weights = ranked.set_index("ticker")["selection_rank"]
    sector_map = ranked.set_index("ticker")["sector"].fillna("Unknown")
    return allocate_capital(latest_date, latest_state, sleeve_signal, raw_weights, sector_map, settings, previous_weights)
