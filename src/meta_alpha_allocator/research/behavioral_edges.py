from __future__ import annotations

import json
import math
from typing import Any

import pandas as pd


def _clip01(value: float | None, neutral: float = 0.5) -> float:
    if value is None or pd.isna(value):
        return neutral
    return float(min(max(value, 0.0), 1.0))


def _scaled(value: float | None, low: float, high: float, *, reverse: bool = False, neutral: float = 0.5) -> float:
    if value is None or pd.isna(value) or high == low:
        return neutral
    scaled = (float(value) - low) / (high - low)
    scaled = min(max(scaled, 0.0), 1.0)
    return 1.0 - scaled if reverse else scaled


def compute_behavioral_state(feature_row: pd.Series | dict[str, Any]) -> dict[str, Any]:
    row = dict(feature_row)
    breadth = row.get("breadth_20d", row.get("pct_positive_20d"))
    avg_corr = row.get("avg_pair_corr_60d", row.get("mean_corr_20d"))
    momentum_concentration = row.get("momentum_concentration_60d")
    effective_dimension = row.get("d_eff_20d")
    sector_spread = row.get("sector_spread")
    hedge_gap = row.get("hedge_score_gap")
    crowding = row.get("crowding_pct")

    breadth_fragility = _scaled(breadth, 0.30, 0.65, reverse=True)
    correlation_fragility = _scaled(avg_corr, 0.15, 0.75)
    concentration_fragility = _scaled(momentum_concentration, 0.50, 2.00)
    dimension_fragility = _scaled(effective_dimension, 2.0, 10.0, reverse=True)
    leadership_fragility = _scaled(sector_spread, 0.02, 0.30)
    hedge_disagreement = _scaled(hedge_gap, 0.01, 0.20)

    consensus_fragility_score = _clip01(
        0.24 * breadth_fragility
        + 0.20 * correlation_fragility
        + 0.18 * concentration_fragility
        + 0.16 * dimension_fragility
        + 0.12 * leadership_fragility
        + 0.10 * hedge_disagreement
    )
    belief_capacity_misalignment = _clip01(
        0.45 * consensus_fragility_score
        + 0.25 * _clip01(crowding)
        + 0.15 * leadership_fragility
        + 0.15 * hedge_disagreement
    )

    narrative: list[str] = []
    if breadth_fragility >= 0.65:
        narrative.append("Breadth is narrow relative to recent history, which makes the consensus easier to break.")
    if concentration_fragility >= 0.65:
        narrative.append("Leadership is concentrated, suggesting the market story is being carried by a thin set of winners.")
    if correlation_fragility >= 0.65:
        narrative.append("Cross-asset correlation is elevated, so the consensus is behaving more like one crowded trade.")
    if belief_capacity_misalignment >= 0.65:
        narrative.append("Capital appears crowded into a limited set of expressions, increasing belief-capacity mismatch.")

    return {
        "consensus_fragility_score": consensus_fragility_score,
        "belief_capacity_misalignment": belief_capacity_misalignment,
        "consensus_fragility_narrative": narrative,
    }


def summarize_owner_elasticity(screener: pd.DataFrame) -> dict[str, Any]:
    if screener.empty or "owner_elasticity_score" not in screener.columns:
        return {"top_names": [], "sector_breadth": []}

    frame = screener.copy()
    frame["owner_elasticity_score"] = pd.to_numeric(frame["owner_elasticity_score"], errors="coerce")
    top_names = (
        frame.loc[frame["owner_elasticity_score"].notna()]
        .sort_values(["owner_elasticity_score", "discovery_score"], ascending=[False, False])
        .head(12)
    )

    sector_breadth = pd.DataFrame()
    if "sector" in frame.columns:
        sector_breadth = (
            frame.loc[frame["owner_elasticity_score"].notna()]
            .groupby("sector", dropna=False)
            .agg(
                median_owner_elasticity=("owner_elasticity_score", "median"),
                high_elasticity_share=("owner_elasticity_bucket", lambda values: float((pd.Series(values) == "high_elasticity").mean())),
                names=("ticker", "nunique"),
            )
            .reset_index()
            .sort_values(["median_owner_elasticity", "high_elasticity_share"], ascending=[False, False])
        )
    return {
        "top_names": json.loads(top_names.replace({pd.NA: None}).to_json(orient="records")) if not top_names.empty else [],
        "sector_breadth": json.loads(sector_breadth.replace({pd.NA: None}).to_json(orient="records")) if not sector_breadth.empty else [],
    }
