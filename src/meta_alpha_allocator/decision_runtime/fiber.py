from __future__ import annotations

from typing import Any


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        parsed = float(value)
        return default if parsed != parsed else parsed
    except (TypeError, ValueError):
        return default


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _fmt_pct(value: float) -> str:
    return f"{_clamp01(value) * 100:.1f}%"


def _label_fiber_outcome(row: dict[str, Any]) -> str:
    restoration = _clamp01(_num(row.get("p_structural_restoration_realized"), 0.0))
    visible_correction = _clamp01(_num(row.get("p_visible_correction_realized"), 0.0))
    drawdown = _num(row.get("max_drawdown_from_state"), 0.0)
    if restoration >= 0.5 and drawdown >= -0.12:
        return "generative"
    if restoration < 0.5 and drawdown <= -0.18:
        return "compressive"
    if visible_correction >= 0.5:
        return "palliative"
    return "compressive" if drawdown <= -0.18 else "palliative"


def summarize_visible_fiber(contract: dict[str, Any] | None) -> dict[str, Any]:
    contract = contract or {}
    analogs = [row for row in (contract.get("analogs") or []) if isinstance(row, dict)]
    if not analogs:
        return {
            "available": False,
            "title": "Visible fiber",
            "explanation": "This compares the current setup with similar past states to see whether similar-looking situations usually healed, stalled, or got worse.",
            "headline": "No comparable states yet",
            "takeaway": "No historical read yet.",
            "ambiguity_label": "Unknown",
            "sample_count": 0,
            "dominant_share": None,
            "rows": [],
        }

    counts = {"generative": 0, "palliative": 0, "compressive": 0}
    rows: list[dict[str, Any]] = []
    for row in analogs:
        outcome = _label_fiber_outcome(row)
        counts[outcome] += 1
        rows.append(
            {
                "as_of": row.get("as_of"),
                "label": outcome,
                "visible_relief": _fmt_pct(_clamp01(_num(row.get("p_visible_correction_realized"), 0.0))),
                "structural_healing": _fmt_pct(_clamp01(_num(row.get("p_structural_restoration_realized"), 0.0))),
                "drawdown": _fmt_pct(abs(_num(row.get("max_drawdown_from_state"), 0.0))),
            }
        )

    total = len(rows)
    dominant_share = max(counts.values()) / total if total else None
    ambiguity_label = "Low" if dominant_share is not None and dominant_share >= 0.65 else "Medium" if dominant_share is not None and dominant_share >= 0.5 else "High"
    if counts["compressive"] / total >= 0.4:
        takeaway = "Many similar-looking states later broke down. That argues for patience and tighter risk."
    elif counts["generative"] / total >= 0.45:
        takeaway = "A meaningful share of similar states healed well enough to support staged risk."
    else:
        takeaway = "Most similar states bounced a bit but did not truly improve. Treat this as a watch state, not a green light."

    return {
        "available": True,
        "title": "Visible fiber",
        "explanation": "This compares the current setup with similar past states to see whether similar-looking situations usually healed, stalled, or got worse.",
        "headline": f"{total} similar states found",
        "takeaway": takeaway,
        "ambiguity_label": ambiguity_label,
        "sample_count": total,
        "dominant_share": dominant_share,
        "rows": rows,
        "counts": counts,
    }
