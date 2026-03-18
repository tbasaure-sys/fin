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


def _classify(delta_recoverability: float, delta_phantom: float) -> str:
    if delta_recoverability >= 0.08 and delta_phantom <= -0.04:
        return "real_repair"
    if delta_recoverability >= 0.04:
        return "optionality_preserving_defense"
    return "cosmetic_de_risking"


def build_repair_candidates(snapshot: dict[str, Any], measured_state: dict[str, Any], probabilistic_state: dict[str, Any], policy_state: dict[str, Any]) -> list[dict[str, Any]]:
    portfolio = snapshot.get("portfolio", {})
    screener = snapshot.get("screener", {})
    top_holdings = portfolio.get("top_holdings") or []
    sim_rank = portfolio.get("simulation_rank") or []
    hedge = snapshot.get("hedges", {}).get("selected_hedge") or snapshot.get("overview", {}).get("selected_hedge") or "SHY"
    discovery = [row for row in screener.get("rows", []) if not row.get("is_current_holding")]
    weakest = None
    if sim_rank:
        weakest = max(sim_rank, key=lambda row: _num(row.get("prob_loss"), 0.0))
    elif top_holdings:
        weakest = min(top_holdings, key=lambda row: _num(row.get("upside"), 0.0))
    best_add = max(discovery, key=lambda row: _num(row.get("discovery_score"), _num(row.get("composite_score"), 0.0))) if discovery else None
    base_recoverability = _num(probabilistic_state.get("p_portfolio_recoverability"), 0.5)
    base_phantom = _num(probabilistic_state.get("p_phantom_rebound"), 0.5)
    floor = _num(policy_state.get("hedge_floor"), 0.1)
    candidates = []
    if weakest is not None:
        trim_weight = min(max(_num(weakest.get("suggested_position"), 0.05), 0.03), 0.12)
        delta_recoverability = 0.05 + 0.18 * _num(measured_state.get("portfolio_fragility_exposure"), 0.5)
        delta_phantom = -0.03 - 0.08 * base_phantom
        candidates.append({
            "id": f"trim-{weakest.get('ticker', 'holding').lower()}",
            "trade_set": [f"Trim {weakest.get('ticker')} by {trim_weight:.0%}"],
            "delta_recoverability": _clamp01(delta_recoverability),
            "delta_phantom": max(-1.0, delta_phantom),
            "delta_extreme_drawdown": -0.04,
            "repair_efficiency": _clamp01(delta_recoverability / max(trim_weight, 0.01)),
            "classification": _classify(delta_recoverability, delta_phantom),
            "binding_constraints": ["turnover_budget", "tax_awareness"],
            "funding_source": "existing position",
            "invalidation": ["holding quality improves materially", "recoverability already restored"],
        })
    candidates.append({
        "id": f"raise-{str(hedge).lower()}",
        "trade_set": [f"Raise protective hedge floor via {hedge} to at least {floor:.0%}"],
        "delta_recoverability": 0.06,
        "delta_phantom": -0.05,
        "delta_extreme_drawdown": -0.08,
        "repair_efficiency": _clamp01(0.06 / max(floor, 0.05)),
        "classification": "optionality_preserving_defense",
        "binding_constraints": ["hedge_floor", "carry_budget"],
        "funding_source": "cash sleeve",
        "invalidation": ["mode upgrades to act with authority > 0.7"],
    })
    if weakest is not None and best_add is not None:
        delta_recoverability = 0.09 + 0.08 * max(_num(best_add.get("quality_score"), 0.5) - _num(weakest.get("prob_loss"), 0.5), 0.0)
        delta_phantom = -0.06
        candidates.append({
            "id": f"switch-{weakest.get('ticker', 'holding').lower()}-to-{best_add.get('ticker', 'idea').lower()}",
            "trade_set": [f"Trim {weakest.get('ticker')}", f"Fund {best_add.get('ticker')} starter position"],
            "delta_recoverability": _clamp01(delta_recoverability),
            "delta_phantom": delta_phantom,
            "delta_extreme_drawdown": -0.05,
            "repair_efficiency": _clamp01(delta_recoverability / 0.08),
            "classification": "real_repair",
            "binding_constraints": ["single_name_add_limit", "liquidity_buffer"],
            "funding_source": weakest.get("ticker"),
            "invalidation": ["candidate exits allowed sleeves", "authority falls below 0.45"],
        })
    candidates.sort(key=lambda row: (_num(row.get("repair_efficiency"), 0.0), _num(row.get("delta_recoverability"), 0.0)), reverse=True)
    return candidates[:10]
