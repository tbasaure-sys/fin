from __future__ import annotations

from collections import Counter
from math import log
from typing import Any

import pandas as pd

from ..config import PathConfig
from .research_artifacts import artifact_frame, load_research_artifacts


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _normalize_dates(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame
    result = frame.copy()
    date_col = next((col for col in ("Date", "date", "as_of", "timestamp") if col in result.columns), None)
    if date_col is None:
        return pd.DataFrame()
    result["as_of"] = pd.to_datetime(result[date_col], errors="coerce").dt.normalize()
    return result.dropna(subset=["as_of"]).sort_values("as_of").reset_index(drop=True)


def _find_col(frame: pd.DataFrame, candidates: tuple[str, ...]) -> str | None:
    lowered = {str(col).lower(): col for col in frame.columns}
    for candidate in candidates:
        if candidate.lower() in lowered:
            return str(lowered[candidate.lower()])
    return None


def _col_values(frame: pd.DataFrame, candidates: tuple[str, ...], default: float = 0.0) -> pd.Series:
    col = _find_col(frame, candidates)
    if col is None:
        return pd.Series([default] * len(frame), index=frame.index, dtype="float64")
    return pd.to_numeric(frame[col], errors="coerce").fillna(default)


def _build_transition_frame() -> pd.DataFrame:
    artifacts = load_research_artifacts(PathConfig())
    action_epochs = _normalize_dates(artifact_frame(artifacts, "prob_recoverability_action_epochs"))
    spectral = _normalize_dates(artifact_frame(artifacts, "daily_spectral_metrics"))
    episodes = _normalize_dates(artifact_frame(artifacts, "recoverability_episodes"))
    recovery = _normalize_dates(artifact_frame(artifacts, "structural_recovery"))
    events = _normalize_dates(artifact_frame(artifacts, "recovery_events"))
    phantom = _normalize_dates(artifact_frame(artifacts, "phantom_detector"))

    base = action_epochs if not action_epochs.empty else spectral
    if base.empty:
        return pd.DataFrame()

    frame = base.copy()
    for extra in (spectral, episodes, recovery, events, phantom):
        if extra.empty:
            continue
        extra_no_dupes = extra.drop_duplicates(subset=["as_of"])
        cols = [col for col in extra_no_dupes.columns if col != "as_of" and col not in frame.columns]
        if cols:
            frame = frame.merge(extra_no_dupes[["as_of", *cols]], on="as_of", how="left")

    frame["compression_score"] = _col_values(frame, ("compression_score", "Z", "T_comp_pct"), 0.5)
    frame["freedom_score"] = _clamp_series(
        0.45 * _col_values(frame, ("D_eff", "effective_dimension", "D_raw"), 0.5)
        + 0.35 * _col_values(frame, ("eq_breadth_20", "breadth", "breadth_20d"), 0.5)
        + 0.20 * (1.0 - _col_values(frame, ("cross_corr_60", "mean_corr_20d", "median_pairwise_corr"), 0.5))
    )
    frame["fragility_score"] = _clamp_series(
        0.40 * _col_values(frame, ("phantom_score", "fragility_pct"), 0.4)
        + 0.30 * _col_values(frame, ("corr_gap",), 0.2)
        + 0.30 * _col_values(frame, ("liquidity_pct",), 0.2)
    )
    frame["visible_relief"] = _clamp_series(
        _col_values(frame, ("visible_correction", "future_max_relief", "p_visible_correction"), 0.0)
    )
    frame["structural_healing"] = _clamp_series(
        _col_values(frame, ("structural_restoration", "recovered", "p_structural_restoration"), 0.0)
    )
    frame = frame.drop_duplicates(subset=["as_of"]).sort_values("as_of").reset_index(drop=True)
    return frame


def _clamp_series(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").fillna(0.0).clip(0.0, 1.0)


def _state_label_from_row(row: pd.Series) -> str:
    compression = _num(row.get("compression_score"), 0.0)
    freedom = _num(row.get("freedom_score"), 0.0)
    fragility = _num(row.get("fragility_score"), 0.0)
    visible_relief = _num(row.get("visible_relief"), 0.0)
    structural_healing = _num(row.get("structural_healing"), 0.0)

    if compression >= 0.65 and fragility >= 0.55:
        return "compressed_fragile"
    if visible_relief >= 0.50 and structural_healing < 0.35:
        return "relief_without_healing"
    if structural_healing >= 0.55 and freedom >= 0.45:
        return "repair_advancing"
    if freedom >= 0.55 and compression < 0.45:
        return "open_repairable"
    return "mixed_balancing"


def _live_state_label(measured_state: dict[str, Any], probabilistic_state: dict[str, Any]) -> str:
    compression = _num(measured_state.get("market_compression"), 0.0)
    fragility = _num(measured_state.get("portfolio_fragility_exposure"), 0.0)
    freedom = _clamp01(
        0.50 * min(_num(measured_state.get("market_effective_dimension"), 2.0) / 6.0, 1.0)
        + 0.30 * _num(measured_state.get("breadth"), 0.0)
        + 0.20 * (1.0 - _num(measured_state.get("median_pairwise_corr"), 0.0))
    )
    row = pd.Series(
        {
            "compression_score": compression,
            "fragility_score": fragility,
            "freedom_score": freedom,
            "visible_relief": _num(probabilistic_state.get("p_visible_correction"), 0.0),
            "structural_healing": _num(probabilistic_state.get("p_structural_restoration"), 0.0),
        }
    )
    return _state_label_from_row(row)


def _live_vector(measured_state: dict[str, Any], probabilistic_state: dict[str, Any]) -> dict[str, float]:
    return {
        "compression_score": _num(measured_state.get("market_compression"), 0.5),
        "freedom_score": _clamp01(
            0.50 * min(_num(measured_state.get("market_effective_dimension"), 2.0) / 6.0, 1.0)
            + 0.30 * _num(measured_state.get("breadth"), 0.5)
            + 0.20 * (1.0 - _num(measured_state.get("median_pairwise_corr"), 0.5))
        ),
        "fragility_score": _num(measured_state.get("portfolio_fragility_exposure"), 0.5),
        "visible_relief": _num(probabilistic_state.get("p_visible_correction"), 0.5),
        "structural_healing": _num(probabilistic_state.get("p_structural_restoration"), 0.5),
    }


def _distance(row: pd.Series, live: dict[str, float]) -> float:
    return sum(abs(_num(row.get(key), 0.5) - value) * weight for key, value, weight in (
        ("compression_score", live["compression_score"], 0.30),
        ("freedom_score", live["freedom_score"], 0.22),
        ("fragility_score", live["fragility_score"], 0.20),
        ("visible_relief", live["visible_relief"], 0.16),
        ("structural_healing", live["structural_healing"], 0.12),
    ))


def build_transition_memory(
    snapshot: dict[str, Any],
    measured_state: dict[str, Any],
    probabilistic_state: dict[str, Any],
) -> dict[str, Any]:
    frame = _build_transition_frame()
    cluster = str(probabilistic_state.get("cluster_type") or "mixed").replace(" ", "_").lower()
    if frame.empty or len(frame.index) < 8:
        history = snapshot.get("risk", {}).get("spectral", {}).get("history") or []
        return {
            "regime_cluster": f"{cluster}_low_history",
            "top_transitions": [],
            "state_entropy": 1.0,
            "tail_transition_risk": _clamp01(_num(probabilistic_state.get("p_extreme_drawdown"), 0.0)),
            "evidence_count": len(history),
        }

    frame = frame.copy()
    frame["state_label"] = frame.apply(_state_label_from_row, axis=1)
    frame["next_state"] = frame["state_label"].shift(-1)
    frame["next_days"] = (frame["as_of"].shift(-1) - frame["as_of"]).dt.days
    frame = frame.dropna(subset=["next_state", "next_days"])

    live_state = _live_state_label(measured_state, probabilistic_state)
    live_vector = _live_vector(measured_state, probabilistic_state)
    cluster_frame = frame[frame["state_label"] == live_state].copy()
    if cluster_frame.empty:
        cluster_frame = frame.copy()
    cluster_frame["distance"] = cluster_frame.apply(lambda row: _distance(row, live_vector), axis=1)
    sample = cluster_frame.nsmallest(min(24, len(cluster_frame.index)), "distance")

    counts = Counter(str(value) for value in sample["next_state"].tolist())
    total = max(sum(counts.values()), 1)
    top_transitions = []
    for state_name, count in counts.most_common(3):
        state_rows = sample[sample["next_state"] == state_name]
        top_transitions.append(
            {
                "next_state": state_name,
                "probability": count / total,
                "median_days": int(pd.to_numeric(state_rows["next_days"], errors="coerce").median() or 5),
            }
        )

    entropy = 0.0
    for count in counts.values():
        p = count / total
        if p > 0:
            entropy -= p * log(p, 2)
    normalized_entropy = _clamp01(entropy / 2.0)
    regime_cluster = f"{cluster}_{live_state}"
    tail_transition_risk = _clamp01(
        0.45 * _num(probabilistic_state.get("p_extreme_drawdown"), 0.0)
        + 0.25 * normalized_entropy
        + 0.20 * _num(measured_state.get("market_compression"), 0.0)
        + 0.10 * _num(measured_state.get("portfolio_fragility_exposure"), 0.0)
    )
    return {
        "regime_cluster": regime_cluster,
        "top_transitions": top_transitions,
        "state_entropy": normalized_entropy,
        "tail_transition_risk": tail_transition_risk,
        "evidence_count": int(len(sample.index)),
    }
