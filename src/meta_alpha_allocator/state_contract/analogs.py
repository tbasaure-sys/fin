from __future__ import annotations

from typing import Any


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _distance(current: dict[str, Any], row: dict[str, Any]) -> float:
    return (
        abs(_num(current.get("compression_score"), 0.5) - _num(row.get("compression_score"), 0.5))
        + abs(_num(current.get("freedom_score"), 0.5) - _num(row.get("freedom_score"), 0.5))
        + abs(_num(current.get("effective_dimension"), 2.0) - _num(row.get("effective_dimension"), 2.0)) / 5.0
        + abs(_num(current.get("top_eigenvalue_share") or current.get("dominance_share"), 0.5) - _num(row.get("top_eigenvalue_share") or row.get("dominance_share"), 0.5))
    )


def build_analogs(snapshot: dict[str, Any], probabilistic_state: dict[str, Any]) -> list[dict[str, Any]]:
    spectral = snapshot.get("risk", {}).get("spectral", {})
    latest = spectral.get("latest", {})
    history = spectral.get("history") or []
    if not history:
        return []
    ranked = []
    for idx, row in enumerate(history[:-1] or history):
        distance = _distance(latest, row)
        restorative = _clamp01(0.45 + 0.20 * _num(row.get("freedom_score"), 0.0) - 0.25 * _num(row.get("compression_score"), 0.0))
        visible = _clamp01(0.52 + 0.18 * _num(row.get("structural_state") == "open", 0.0) + 0.12 * _num(row.get("freedom_score"), 0.0))
        cluster_type = probabilistic_state.get("cluster_type", "mixed")
        ranked.append({
            "analog_id": f"analog-{idx}",
            "as_of": row.get("date") or row.get("as_of") or row.get("timestamp"),
            "distance": round(distance, 4),
            "cluster_type": cluster_type,
            "p_visible_correction_realized": visible,
            "p_structural_restoration_realized": restorative,
            "days_to_visible_correction": 5 if visible >= 0.55 else 12,
            "days_to_structural_restoration": 20 if restorative >= 0.55 else 45,
            "max_drawdown_from_state": -_clamp01(_num(row.get("compression_score"), 0.0) * 0.18 + (1.0 - _num(row.get("freedom_score"), 0.0)) * 0.12),
            "summary_tags": [row.get("structural_state") or "unknown", "spectral-history"],
        })
    ranked.sort(key=lambda row: row["distance"])
    return ranked[:8]
