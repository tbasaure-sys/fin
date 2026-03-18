from __future__ import annotations

from typing import Any

_CASHLIKE_TICKERS = {"SGOV", "SHY", "BIL", "SHV", "VGSH", "JPST"}


def _num(value: Any, default: float | None = None) -> float | None:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float | None, low: float = 0.0, high: float = 1.0) -> float | None:
    if value is None:
        return None
    return max(low, min(high, float(value)))


def _series_drawdown(history: list[dict[str, Any]], key: str) -> float | None:
    values = []
    for row in history or []:
        try:
            values.append(float(row.get(key)))
        except (TypeError, ValueError):
            continue
    if not values:
        return None
    peak = max(values)
    if peak == 0:
        return 0.0
    return min(values) / peak - 1.0


def _portfolio_factor_dimension(top_holdings: list[dict[str, Any]]) -> float:
    sectors = {}
    for row in top_holdings or []:
        sector = str(row.get("sector") or "Unknown")
        try:
            weight = max(float(row.get("weight") or 0.0), 0.0)
        except (TypeError, ValueError):
            weight = 0.0
        sectors[sector] = sectors.get(sector, 0.0) + weight
    if not sectors:
        return 1.0
    sum_sq = sum(weight * weight for weight in sectors.values() if weight > 0)
    if sum_sq <= 0:
        return float(len(sectors))
    return max(1.0, min(float(len(sectors)), 1.0 / sum_sq))


def _portfolio_fragility_exposure(top_holdings: list[dict[str, Any]]) -> float:
    if not top_holdings:
        return 0.5
    weighted = 0.0
    total_weight = 0.0
    for row in top_holdings:
        try:
            weight = max(float(row.get("weight") or 0.0), 0.0)
        except (TypeError, ValueError):
            weight = 0.0
        momentum = _clamp(_num(row.get("momentum_6m"), 0.0), -1.0, 1.0) or 0.0
        upside = _num(row.get("upside"), 0.0) or 0.0
        fragility = 0.55 - 0.25 * upside + 0.20 * abs(min(momentum, 0.0))
        weighted += weight * _clamp(fragility, 0.0, 1.0)
        total_weight += weight
    if total_weight <= 0:
        return 0.5
    return _clamp(weighted / total_weight) or 0.5


def _portfolio_liquidity_buffer(holdings: list[dict[str, Any]], alignment: dict[str, Any]) -> float:
    if not holdings:
        return _clamp(_num(alignment.get("selected_hedge_weight"), 0.05)) or 0.05

    liquid_weight = 0.0
    for row in holdings:
        ticker = str(row.get("ticker") or "").upper()
        asset_type = str(row.get("asset_type") or "").lower()
        sector = str(row.get("sector") or "").lower()
        weight = max(_num(row.get("weight"), 0.0) or 0.0, 0.0)
        if asset_type == "cash" or ticker in _CASHLIKE_TICKERS:
            liquid_weight += weight
            continue
        if sector == "etf" and ticker in _CASHLIKE_TICKERS:
            liquid_weight += weight
    fallback = _num(alignment.get("selected_hedge_weight"), 0.0) or 0.0
    return _clamp(max(liquid_weight, fallback)) or 0.0


def build_measured_state(snapshot: dict[str, Any]) -> dict[str, Any]:
    risk = snapshot.get("risk", {})
    spectral_latest = risk.get("spectral", {}).get("latest", {})
    structure = risk.get("structure", {})
    macro = risk.get("macro", {})
    portfolio = snapshot.get("portfolio", {})
    analytics = portfolio.get("analytics", {})
    alignment = portfolio.get("alignment", {})
    holdings = portfolio.get("holdings") or portfolio.get("top_holdings") or []
    mix_history = portfolio.get("current_mix_vs_spy") or []
    hhi = _num(analytics.get("Concentration HHI"), 0.0)
    liquidity_buffer = _portfolio_liquidity_buffer(holdings, alignment)
    market_effective_dimension = _num(spectral_latest.get("effective_dimension") or structure.get("effective_dimension_20d"), 1.0) or 1.0
    market_dominance_share = _clamp(_num(spectral_latest.get("top_eigenvalue_share") or spectral_latest.get("dominance_share"), 0.5)) or 0.5
    market_compression = _clamp(_num(spectral_latest.get("compression_score"), 0.5)) or 0.5
    breadth = _clamp(_num(structure.get("breadth_20d"), 0.5)) or 0.5
    corr = _clamp(_num(structure.get("mean_corr_20d") or structure.get("avg_pair_corr_60d"), 0.5)) or 0.5
    portfolio_drawdown = _num(analytics.get("Max Drawdown"), None)
    benchmark_drawdown = _series_drawdown(mix_history, "spy_growth")
    if benchmark_drawdown is None:
        benchmark_drawdown = _num(structure.get("spy_drawdown_20d"), 0.0)
    current_mix_drawdown = _series_drawdown(mix_history, "portfolio_growth")
    if portfolio_drawdown is None:
        portfolio_drawdown = _num(structure.get("spy_drawdown_20d"), 0.0)

    return {
        "market_effective_dimension": market_effective_dimension,
        "market_dominance_share": market_dominance_share,
        "market_compression": market_compression,
        "breadth": breadth,
        "median_pairwise_corr": corr,
        "portfolio_hhi": _clamp(hhi) if hhi is not None else None,
        "portfolio_factor_dimension": _portfolio_factor_dimension(holdings),
        "portfolio_fragility_exposure": _portfolio_fragility_exposure(holdings),
        "portfolio_liquidity_buffer": liquidity_buffer,
        "portfolio_drawdown": current_mix_drawdown if current_mix_drawdown is not None else portfolio_drawdown,
        "benchmark_drawdown": benchmark_drawdown,
        "macro_vix": _num(macro.get("vix")),
    }
