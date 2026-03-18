from __future__ import annotations

from typing import Any


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_vix(vix: float | None) -> float:
    if vix is None:
        return 0.35
    return _clamp01((float(vix) - 12.0) / 28.0)


def _dimension_score(effective_dimension: float, floor: float = 2.0, ceiling: float = 8.0) -> float:
    span = max(ceiling - floor, 1e-6)
    return _clamp01((effective_dimension - floor) / span)


def _weighted_average(values: list[float], weights: list[float]) -> float:
    total = sum(weights)
    if total <= 0:
        return sum(values) / len(values)
    return sum(value * weight for value, weight in zip(values, weights)) / total


def build_probabilistic_state(snapshot: dict[str, Any], measured_state: dict[str, Any], uncertainty: dict[str, Any], horizon_days: int = 20) -> dict[str, Any]:
    crash_prob = _clamp01(_num(snapshot.get("overview", {}).get("crash_prob"), 0.35))
    tail_risk = _clamp01(_num(snapshot.get("overview", {}).get("tail_risk_score"), 0.35))
    legitimacy_risk = _clamp01(_num(snapshot.get("overview", {}).get("legitimacy_risk"), 0.35))
    compression = _clamp01(_num(measured_state.get("market_compression"), 0.5))
    dominance = _clamp01(_num(measured_state.get("market_dominance_share"), 0.5))
    effective_dimension = max(_num(measured_state.get("market_effective_dimension"), 2.0), 1.0)
    breadth = _clamp01(_num(measured_state.get("breadth"), 0.5))
    corr = _clamp01(_num(measured_state.get("median_pairwise_corr"), 0.5))
    fragility = _clamp01(_num(measured_state.get("portfolio_fragility_exposure"), 0.5))
    liquidity = _clamp01(_num(measured_state.get("portfolio_liquidity_buffer"), 0.1))
    drawdown = abs(_num(measured_state.get("portfolio_drawdown"), -0.05))
    benchmark_drawdown = abs(_num(measured_state.get("benchmark_drawdown"), -0.05))
    factor_dimension = max(_num(measured_state.get("portfolio_factor_dimension"), 2.0), 1.0)
    concentration = _clamp01(_num(measured_state.get("portfolio_hhi"), 0.1))
    vix_norm = _normalize_vix(measured_state.get("macro_vix"))
    market_dimension_score = _dimension_score(effective_dimension)
    portfolio_dimension_score = _dimension_score(factor_dimension, floor=1.0, ceiling=5.0)

    p_structural = _clamp01(0.28 * compression + 0.24 * dominance + 0.18 * corr + 0.18 * (1.0 - market_dimension_score) + 0.12 * (1.0 - breadth))
    p_regime = _clamp01(0.30 * crash_prob + 0.24 * tail_risk + 0.18 * vix_norm + 0.16 * min(benchmark_drawdown / 0.20, 1.0) + 0.12 * legitimacy_risk)
    gap = p_structural - p_regime
    if p_structural >= 0.6 and p_regime >= 0.6:
        cluster_type = "compound"
    elif abs(gap) <= 0.08:
        cluster_type = "mixed"
    elif gap > 0:
        cluster_type = "G-dominated"
    else:
        cluster_type = "R-dominated"

    p_visible_correction = _clamp01(0.48 + 0.28 * p_regime - 0.18 * p_structural - 0.10 * min(drawdown / 0.25, 1.0) + 0.08 * breadth)
    p_structural_restoration = _clamp01(0.40 + 0.22 * breadth + 0.15 * liquidity + 0.12 * portfolio_dimension_score - 0.22 * compression - 0.12 * fragility)
    phantom_base = _clamp01(0.35 + 0.35 * p_structural + 0.18 * compression - 0.42 * p_structural_restoration + 0.08 * concentration)
    p_phantom_rebound = min(p_visible_correction, phantom_base)
    p_extreme_drawdown = _clamp01(0.24 * crash_prob + 0.20 * tail_risk + 0.16 * p_structural + 0.14 * fragility + 0.14 * min(drawdown / 0.25, 1.0) + 0.12 * (1.0 - liquidity))

    challenge_scores = [
        1.0 - _clamp01(0.60 * compression + 0.25 * fragility + 0.15 * (1.0 - liquidity)),
        1.0 - _clamp01(0.45 * vix_norm + 0.30 * crash_prob + 0.25 * (1.0 - liquidity)),
        1.0 - _clamp01(0.50 * tail_risk + 0.25 * corr + 0.25 * fragility),
        1.0 - _clamp01(0.55 * fragility + 0.25 * concentration + 0.20 * min(drawdown / 0.25, 1.0)),
        1.0 - _clamp01(0.35 * p_structural + 0.25 * p_regime + 0.20 * compression + 0.20 * min(benchmark_drawdown / 0.20, 1.0)),
    ]
    challenge_weights = [
        0.18 + (0.22 * compression),
        0.18 + (0.18 * vix_norm),
        0.18 + (0.20 * tail_risk),
        0.18 + (0.20 * concentration),
        0.18 + (0.22 * max(p_structural, p_regime)),
    ]
    p_portfolio_recoverability = _clamp01(_weighted_average(challenge_scores, challenge_weights))
    authority_score = _clamp01(_num(uncertainty.get("authority_score"), 0.0))

    return {
        "horizon_days": horizon_days,
        "p_structural_dominance": p_structural,
        "p_regime_shock_dominance": p_regime,
        "cluster_type": cluster_type,
        "p_visible_correction": p_visible_correction,
        "p_structural_restoration": p_structural_restoration,
        "p_phantom_rebound": p_phantom_rebound,
        "p_portfolio_recoverability": p_portfolio_recoverability,
        "p_extreme_drawdown": p_extreme_drawdown,
        "authority_score": authority_score,
    }
