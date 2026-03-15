from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import ResearchSettings


TREASURY_HEDGES = {"IEF", "TLT", "SHY"}


@dataclass(frozen=True)
class OverlayReport:
    overview: dict
    sector_map: pd.DataFrame
    international_map: pd.DataFrame
    hedge_ranking: pd.DataFrame


def _safe_pct_change(series: pd.Series, periods: int) -> float:
    clean = series.dropna()
    if len(clean) <= periods:
        return np.nan
    return float(clean.iloc[-1] / clean.iloc[-periods - 1] - 1.0)


def _safe_drawdown(series: pd.Series, window: int) -> float:
    clean = series.dropna()
    if clean.empty:
        return np.nan
    recent = clean.tail(window)
    if recent.empty:
        return np.nan
    peak = recent.max()
    if peak == 0:
        return np.nan
    return float(recent.iloc[-1] / peak - 1.0)


def _safe_corr(left: pd.Series, right: pd.Series, window: int) -> float:
    joined = pd.concat([left, right], axis=1).dropna().tail(window)
    if len(joined) < max(20, window // 3):
        return np.nan
    return float(joined.iloc[:, 0].corr(joined.iloc[:, 1]))


def _percentile_score(series: pd.Series, higher_is_better: bool = True) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    anchor = numeric if higher_is_better else -numeric
    ranked = anchor.rank(pct=True)
    return ranked.fillna(0.5)


def _proxy_snapshot(proxy_prices: pd.DataFrame, tickers: list[str], as_of_date: pd.Timestamp) -> pd.DataFrame:
    if proxy_prices.empty:
        return pd.DataFrame(columns=["ticker", "mom_20d", "mom_60d", "vol_20d", "drawdown_63d", "corr_spy_60d"])

    prices = proxy_prices.sort_index().ffill().loc[:as_of_date]
    returns = prices.pct_change()
    spy_returns = returns.get("SPY", pd.Series(dtype=float))
    rows: list[dict[str, float | str]] = []
    for ticker in tickers:
        if ticker not in prices.columns:
            continue
        series = prices[ticker].dropna()
        if series.empty:
            continue
        ticker_returns = returns[ticker]
        rows.append(
            {
                "ticker": ticker,
                "mom_20d": _safe_pct_change(series, 20),
                "mom_60d": _safe_pct_change(series, 60),
                "vol_20d": float(ticker_returns.dropna().tail(20).std()) if len(ticker_returns.dropna()) >= 10 else np.nan,
                "drawdown_63d": _safe_drawdown(series, 63),
                "corr_spy_60d": _safe_corr(ticker_returns, spy_returns, 60),
            }
        )
    return pd.DataFrame(rows)


def _sector_lookup(settings: ResearchSettings) -> dict[str, str]:
    return {sector: ticker for sector, ticker in settings.sector_proxy_map}


def _international_lookup(settings: ResearchSettings) -> dict[str, str]:
    return {label: ticker for label, ticker in settings.international_proxy_map}


def build_sector_opportunity_map(
    latest_scored: pd.DataFrame,
    proxy_prices: pd.DataFrame,
    as_of_date: pd.Timestamp,
    latest_state: pd.Series,
    settings: ResearchSettings,
) -> pd.DataFrame:
    sector_lookup = _sector_lookup(settings)
    risk_level = float(np.clip(latest_state.get("tail_risk_score", latest_state.get("crash_prob", 0.5)), 0.0, 1.0))
    if latest_scored.empty:
        sector_stats = pd.DataFrame(columns=["sector", "coverage", "avg_selection_score", "breadth", "avg_quality", "avg_residual_momentum", "avg_crowding"])
        cross_section_weight = 0.25
    else:
        latest_scored = latest_scored.copy()
        latest_scored["sector"] = latest_scored["sector"].fillna("Unknown")
        sector_stats = (
            latest_scored.groupby("sector")
            .agg(
                coverage=("ticker", "nunique"),
                avg_selection_score=("selection_score", "mean"),
                breadth=("selection_score", lambda values: float((values > 0).mean())),
                avg_quality=("quality", "mean"),
                avg_residual_momentum=("residual_momentum", "mean"),
                avg_crowding=("crowding", "mean"),
            )
            .reset_index()
        )
        sector_date = pd.to_datetime(latest_scored["date"]).max()
        staleness_days = max((pd.to_datetime(as_of_date) - sector_date).days, 0)
        cross_section_weight = float(np.clip(1.0 - staleness_days / 90.0, 0.25, 1.0))

    proxy = _proxy_snapshot(proxy_prices, list(dict.fromkeys(sector_lookup.values())), as_of_date)
    proxy["sector"] = proxy["ticker"].map({ticker: sector for sector, ticker in sector_lookup.items()})
    sector_frame = sector_stats.merge(proxy, on="sector", how="outer")
    sector_frame["proxy_ticker"] = sector_frame["sector"].map(sector_lookup)
    sector_frame["coverage"] = sector_frame["coverage"].fillna(0).astype(int)

    signal = (
        0.35 * _percentile_score(sector_frame["avg_selection_score"])
        + 0.20 * _percentile_score(sector_frame["breadth"])
        + 0.15 * _percentile_score(sector_frame["avg_quality"])
        + 0.15 * _percentile_score(sector_frame["avg_residual_momentum"])
        + 0.15 * _percentile_score(sector_frame["mom_60d"])
    )
    defense_fit = (
        0.45 * _percentile_score(sector_frame["drawdown_63d"])
        + 0.35 * _percentile_score(sector_frame["corr_spy_60d"], higher_is_better=False)
        + 0.20 * _percentile_score(sector_frame["avg_crowding"], higher_is_better=False)
    )
    sector_frame["opportunity_score"] = ((1.0 - risk_level) * signal + risk_level * defense_fit) * (1.0 - 0.35 * (1.0 - cross_section_weight))
    sector_frame["signal_score"] = signal
    sector_frame["defense_fit"] = defense_fit
    sector_frame["cross_section_weight"] = cross_section_weight
    sector_frame["view"] = np.where(sector_frame["opportunity_score"] >= sector_frame["opportunity_score"].median(), "preferred", "secondary")
    return sector_frame.sort_values("opportunity_score", ascending=False).reset_index(drop=True)


def build_international_opportunity_map(
    proxy_prices: pd.DataFrame,
    as_of_date: pd.Timestamp,
    latest_state: pd.Series,
    settings: ResearchSettings,
) -> pd.DataFrame:
    market_lookup = _international_lookup(settings)
    risk_level = float(np.clip(latest_state.get("tail_risk_score", latest_state.get("crash_prob", 0.5)), 0.0, 1.0))
    proxy = _proxy_snapshot(proxy_prices, list(market_lookup.values()), as_of_date)
    if proxy.empty:
        return pd.DataFrame(columns=["market", "ticker", "opportunity_score"])
    proxy["market"] = proxy["ticker"].map({ticker: label for label, ticker in market_lookup.items()})
    trend_score = 0.55 * _percentile_score(proxy["mom_60d"]) + 0.20 * _percentile_score(proxy["mom_20d"]) + 0.25 * _percentile_score(proxy["drawdown_63d"])
    diversification_score = 0.60 * _percentile_score(proxy["corr_spy_60d"], higher_is_better=False) + 0.40 * _percentile_score(proxy["vol_20d"], higher_is_better=False)
    proxy["opportunity_score"] = (1.0 - risk_level) * trend_score + risk_level * (0.60 * diversification_score + 0.40 * trend_score)
    proxy["trend_score"] = trend_score
    proxy["diversification_score"] = diversification_score
    proxy["view"] = np.where(proxy["opportunity_score"] >= proxy["opportunity_score"].median(), "preferred", "secondary")
    return proxy.sort_values("opportunity_score", ascending=False).reset_index(drop=True)


def build_hedge_ranking(
    proxy_prices: pd.DataFrame,
    as_of_date: pd.Timestamp,
    latest_state: pd.Series,
    settings: ResearchSettings,
) -> pd.DataFrame:
    risk_level = float(np.clip(latest_state.get("tail_risk_score", latest_state.get("crash_prob", 0.5)), 0.0, 1.0))
    prices = proxy_prices.sort_index().ffill().loc[:as_of_date]
    returns = prices.pct_change()
    spy_returns = returns.get("SPY", pd.Series(dtype=float)).dropna()
    rows: list[dict[str, float | str | bool]] = []
    for ticker in settings.hedge_tickers:
        if ticker not in returns.columns:
            continue
        candidate_returns = returns[ticker].dropna()
        joined = pd.concat([spy_returns.rename("spy"), candidate_returns.rename("candidate")], axis=1).dropna().tail(252)
        if joined.empty:
            continue
        down_mask = joined["spy"] < 0
        stress_cutoff = joined["spy"].quantile(0.20)
        stress_mask = joined["spy"] <= stress_cutoff
        rows.append(
            {
                "ticker": ticker,
                "is_treasury": ticker in TREASURY_HEDGES,
                "down_capture": float(joined.loc[down_mask, "candidate"].mean()) if down_mask.any() else np.nan,
                "stress_capture": float(joined.loc[stress_mask, "candidate"].mean()) if stress_mask.any() else np.nan,
                "corr_spy_63d": _safe_corr(returns[ticker], returns.get("SPY", pd.Series(dtype=float)), 63),
                "vol_20d": float(candidate_returns.tail(20).std()) if len(candidate_returns) >= 10 else np.nan,
                "carry_60d": _safe_pct_change(prices[ticker].dropna(), 60),
                "drawdown_63d": _safe_drawdown(prices[ticker].dropna(), 63),
            }
        )
    ranking = pd.DataFrame(rows)
    if ranking.empty:
        return ranking
    crisis_score = (
        0.30 * _percentile_score(ranking["down_capture"])
        + 0.30 * _percentile_score(ranking["stress_capture"])
        + 0.25 * _percentile_score(ranking["corr_spy_63d"], higher_is_better=False)
        + 0.15 * _percentile_score(ranking["vol_20d"], higher_is_better=False)
    )
    carry_score = (
        0.35 * _percentile_score(ranking["carry_60d"])
        + 0.35 * _percentile_score(ranking["drawdown_63d"])
        + 0.15 * _percentile_score(ranking["vol_20d"], higher_is_better=False)
        + 0.15 * _percentile_score(ranking["corr_spy_63d"], higher_is_better=False)
    )
    ranking["hedge_score"] = risk_level * crisis_score + (1.0 - risk_level) * carry_score
    ranking["crisis_score"] = crisis_score
    ranking["carry_score"] = carry_score
    ranking["view"] = np.where(ranking["hedge_score"] >= ranking["hedge_score"].median(), "preferred", "secondary")
    return ranking.sort_values("hedge_score", ascending=False).reset_index(drop=True)


def build_overlay_report(
    latest_state: pd.Series,
    latest_scored: pd.DataFrame,
    proxy_prices: pd.DataFrame,
    as_of_date: pd.Timestamp,
    settings: ResearchSettings,
    decision_payload: dict,
    selection_diagnostics: dict,
    tail_risk_latest: dict,
    scenario_payload: dict | None = None,
) -> OverlayReport:
    sector_map = build_sector_opportunity_map(latest_scored, proxy_prices, as_of_date, latest_state, settings)
    international_map = build_international_opportunity_map(proxy_prices, as_of_date, latest_state, settings)
    hedge_ranking = build_hedge_ranking(proxy_prices, as_of_date, latest_state, settings)
    latest_cross_section_date = pd.to_datetime(latest_scored["date"]).max() if not latest_scored.empty else pd.NaT
    cross_section_staleness = int((pd.to_datetime(as_of_date) - latest_cross_section_date).days) if pd.notna(latest_cross_section_date) else None

    top_hedge = hedge_ranking.iloc[0].to_dict() if not hedge_ranking.empty else {}
    second_hedge = hedge_ranking.iloc[1].to_dict() if len(hedge_ranking) > 1 else {}
    overview = {
        "as_of_date": str(pd.to_datetime(as_of_date).date()),
        "state": {
            "regime": latest_state.get("regime", "UNKNOWN"),
            "crash_prob": float(latest_state.get("crash_prob", 0.5)),
            "tail_risk_score": float(latest_state.get("tail_risk_score", latest_state.get("crash_prob", 0.5))),
            "legitimacy_risk": float(latest_state.get("legitimacy_risk", 0.5)),
        },
        "risk_budget": {
            "core_beta_weight": float(decision_payload.get("core_beta_weight", 0.0)),
            "defense_weight": float(decision_payload.get("defense_weight", 0.0)),
            "selection_weight": float(decision_payload.get("selection_weight", 0.0)),
            "risk_mode": decision_payload.get("risk_mode", "UNKNOWN"),
        },
        "selection_context": {
            "selection_strength": float(selection_diagnostics.get("selection_strength", 0.5)),
            "breadth": float(selection_diagnostics.get("breadth", 0.0)),
            "top_spread": float(selection_diagnostics.get("top_spread", 0.0)),
            "coverage": float(selection_diagnostics.get("coverage", 0.0)),
            "cross_section_as_of_date": str(latest_cross_section_date.date()) if pd.notna(latest_cross_section_date) else None,
            "cross_section_staleness_days": cross_section_staleness,
        },
        "hedge_summary": {
            "primary_hedge": top_hedge.get("ticker"),
            "secondary_hedge": second_hedge.get("ticker"),
            "us_treasuries_best_hedge": bool(top_hedge.get("ticker") in TREASURY_HEDGES),
            "primary_hedge_score": float(top_hedge.get("hedge_score", np.nan)) if top_hedge else np.nan,
        },
        "scenario_synthesis": scenario_payload or {},
        "tail_risk_latest": tail_risk_latest,
    }
    return OverlayReport(
        overview=overview,
        sector_map=sector_map,
        international_map=international_map,
        hedge_ranking=hedge_ranking,
    )
