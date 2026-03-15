from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import PathConfig, ResearchSettings
from ..data.adapters import load_defense_price_panel, load_fmp_market_proxy_panel
from ..data.fmp_client import FMPClient
from ..utils import ensure_directory, performance_summary, split_equal_blocks
from .spectral_structure import run_spectral_structure_pipeline


@dataclass
class SpectralBacktestArtifacts:
    summary: dict
    ceiling_history: pd.DataFrame
    daily_returns: pd.DataFrame


def _monthly_decision_dates(index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    dates = pd.DatetimeIndex(index).sort_values().unique()
    selected: list[pd.Timestamp] = []
    last_key: tuple[int, int] | None = None
    for date in dates:
        key = (date.year, date.month)
        if key != last_key:
            selected.append(date)
            last_key = key
    if len(dates) and dates[-1] not in selected:
        selected.append(dates[-1])
    return pd.DatetimeIndex(selected)


def _state_overlay_with_ceiling(
    decisions: pd.DataFrame,
    prices: pd.DataFrame,
    ceilings: pd.Series,
) -> pd.Series:
    spy = prices["SPY"].reindex(decisions.index).fillna(0.0)
    ief = prices["IEF"].reindex(decisions.index).fillna(0.0) if "IEF" in prices.columns else pd.Series(0.0, index=decisions.index)
    bil = prices["BIL"].reindex(decisions.index).fillna(0.0) if "BIL" in prices.columns else pd.Series(0.0, index=decisions.index)
    defense_mix = 0.6 * ief + 0.4 * bil

    defense_weight = pd.to_numeric(decisions["defense_weight"], errors="coerce").fillna(0.0)
    risky_beta = (1.0 - defense_weight).clip(lower=0.0, upper=1.0)
    ceiling = ceilings.reindex(decisions.index).ffill().fillna(1.0).clip(lower=0.25, upper=1.0)
    capped_beta = np.minimum(risky_beta, ceiling)
    overflow_to_cash = (risky_beta - capped_beta).clip(lower=0.0)

    return (capped_beta * spy + defense_weight * defense_mix + overflow_to_cash * bil).rename("state_overlay_structural")


def _forward_total_return(returns: pd.Series, horizon: int) -> pd.Series:
    clean = returns.fillna(0.0)
    values = np.full(len(clean), np.nan)
    arr = clean.to_numpy(dtype=float)
    for idx in range(len(arr)):
        window = arr[idx + 1 : idx + 1 + horizon]
        if len(window) < horizon:
            break
        values[idx] = float(np.prod(1.0 + window) - 1.0)
    return pd.Series(values, index=clean.index)


def _future_drawdown(returns: pd.Series, horizon: int) -> pd.Series:
    clean = returns.fillna(0.0)
    values = np.full(len(clean), np.nan)
    arr = clean.to_numpy(dtype=float)
    for idx in range(len(arr)):
        window = arr[idx + 1 : idx + 1 + horizon]
        if len(window) < horizon:
            break
        wealth = np.cumprod(1.0 + window)
        drawdown = wealth / np.maximum.accumulate(wealth) - 1.0
        values[idx] = float(drawdown.min())
    return pd.Series(values, index=clean.index)


def _block_summaries(series: pd.Series) -> list[dict]:
    blocks = split_equal_blocks(series.index, n_blocks=3)
    results: list[dict] = []
    for block in blocks:
        block_ret = series.reindex(block).fillna(0.0)
        summary = performance_summary(block_ret)
        summary["start"] = str(block[0].date())
        summary["end"] = str(block[-1].date())
        results.append(summary)
    return results


def run_spectral_backtest(
    paths: PathConfig | None = None,
    research_settings: ResearchSettings | None = None,
) -> SpectralBacktestArtifacts:
    paths = paths or PathConfig()
    research_settings = research_settings or ResearchSettings()
    ensure_directory(research_settings.spectral_output_dir)

    research_root = research_settings.output_dir
    daily_returns_path = research_root / "daily_returns.csv"
    decisions_path = research_root / "allocator_decisions.csv"
    if not daily_returns_path.exists() or not decisions_path.exists():
        from .pipeline import run_research
        from ..config import AllocatorSettings

        run_research(paths, research_settings, AllocatorSettings())

    daily_returns = pd.read_csv(daily_returns_path, index_col=0)
    daily_returns.index = pd.to_datetime(daily_returns.index)
    decisions = pd.read_csv(decisions_path)
    decisions["date"] = pd.to_datetime(decisions["date"])
    decisions = decisions.drop_duplicates("date").set_index("date").sort_index()

    fmp_client = FMPClient.from_env(paths.cache_root)
    defense_prices, _ = load_defense_price_panel(
        paths,
        research_settings.start_date,
        research_settings.end_date,
        fmp_client=fmp_client,
    )
    proxy_prices = load_fmp_market_proxy_panel(
        paths,
        tickers=research_settings.market_proxy_tickers,
        start_date=research_settings.start_date,
        end_date=research_settings.end_date,
        fmp_client=fmp_client,
    )
    proxy_prices = defense_prices.combine_first(proxy_prices) if not defense_prices.empty else proxy_prices
    defense_returns = defense_prices.pct_change().fillna(0.0)

    evaluation_dates = _monthly_decision_dates(decisions.index)
    ceiling_rows: list[dict[str, float | str]] = []
    for date in evaluation_dates:
        truncated_prices = proxy_prices.loc[:date]
        if len(truncated_prices) < max(120, research_settings.spectral_window_days * 2):
            continue
        row = decisions.loc[date]
        defense_weight = float(row.get("defense_weight", 0.0))
        weights = {
            "SPY": max(0.0, 1.0 - defense_weight),
            "IEF": defense_weight * 0.6,
            "BIL": defense_weight * 0.4,
        }
        artifacts = run_spectral_structure_pipeline(
            paths,
            research_settings,
            truncated_prices,
            weights,
            write_outputs=False,
            monte_carlo_paths=400,
        )
        latest = artifacts.summary.get("latest", {})
        if not latest:
            continue
        ceiling_rows.append(
            {
                "date": date,
                "compression_score": latest.get("compression_score"),
                "spectral_state": latest.get("structural_state"),
                "structural_beta_ceiling": latest.get("structural_beta_ceiling"),
                "structural_suggested_stance": latest.get("suggested_stance"),
                "p_compressed": latest.get("p_compressed"),
            }
        )

    ceiling_history = pd.DataFrame(ceiling_rows)
    if ceiling_history.empty:
        raise RuntimeError("Spectral backtest did not produce any evaluation dates.")
    ceiling_history["date"] = pd.to_datetime(ceiling_history["date"])
    ceiling_history = ceiling_history.set_index("date").sort_index()

    base_state_overlay = daily_returns["state_overlay"].reindex(defense_returns.index).dropna()
    aligned_decisions = decisions.reindex(base_state_overlay.index).ffill().dropna(subset=["defense_weight"])
    aligned_index = aligned_decisions.index.intersection(base_state_overlay.index)
    aligned_decisions = aligned_decisions.reindex(aligned_index)
    base_state_overlay = base_state_overlay.reindex(aligned_index).fillna(0.0)
    ceiling_series = ceiling_history["structural_beta_ceiling"].reindex(aligned_index).ffill().fillna(1.0)

    structural_overlay = _state_overlay_with_ceiling(aligned_decisions, defense_returns, ceiling_series)
    comparison = pd.concat(
        [
            base_state_overlay.rename("state_overlay"),
            structural_overlay,
            daily_returns["spy"].reindex(aligned_index).fillna(0.0).rename("spy"),
            daily_returns["policy_overlay"].reindex(aligned_index).fillna(0.0).rename("policy_overlay") if "policy_overlay" in daily_returns.columns else pd.Series(dtype=float),
        ],
        axis=1,
    ).dropna(how="all")

    compression_aligned = ceiling_history["compression_score"].reindex(comparison.index).ffill()
    fwd_return_21d = _forward_total_return(comparison["state_overlay"], 21)
    fwd_drawdown_21d = _future_drawdown(comparison["state_overlay"], 21)
    high_mask = compression_aligned >= compression_aligned.quantile(0.67)
    low_mask = compression_aligned <= compression_aligned.quantile(0.33)

    base_summary = performance_summary(comparison["state_overlay"])
    structural_summary = performance_summary(comparison["state_overlay_structural"])
    spy_summary = performance_summary(comparison["spy"])
    delta_summary = {
        "cagr_delta": structural_summary["annual_return"] - base_summary["annual_return"],
        "sharpe_delta": structural_summary["sharpe"] - base_summary["sharpe"],
        "maxdd_delta": structural_summary["max_drawdown"] - base_summary["max_drawdown"],
    }
    summary = {
        "state_overlay": base_summary,
        "state_overlay_structural": structural_summary,
        "benchmark_spy": spy_summary,
        "policy_overlay": performance_summary(comparison["policy_overlay"]) if "policy_overlay" in comparison.columns else {},
        "value_add_signal": {
            "compression_vs_fwd_return_21d": float(compression_aligned.corr(fwd_return_21d)),
            "compression_vs_future_drawdown_21d": float(compression_aligned.corr(fwd_drawdown_21d)),
            "high_minus_low_fwd_return_21d": float(fwd_return_21d.loc[high_mask].mean() - fwd_return_21d.loc[low_mask].mean()),
            "high_minus_low_future_drawdown_21d": float(fwd_drawdown_21d.loc[high_mask].mean() - fwd_drawdown_21d.loc[low_mask].mean()),
        },
        "oos_blocks": {
            "state_overlay": _block_summaries(comparison["state_overlay"]),
            "state_overlay_structural": _block_summaries(comparison["state_overlay_structural"]),
        },
        "acceptance_checks": {
            "improves_sharpe": structural_summary["sharpe"] > base_summary["sharpe"],
            "improves_maxdd": structural_summary["max_drawdown"] > base_summary["max_drawdown"],
            "similar_cagr": structural_summary["annual_return"] >= base_summary["annual_return"] - 0.015,
            "compression_predicts_worse_future_drawdown": float(compression_aligned.corr(fwd_drawdown_21d)) < 0.0,
        },
        "delta_summary": delta_summary,
        "latest_structural_view": {
            "date": str(ceiling_history.index.max().date()),
            "compression_score": float(ceiling_history["compression_score"].iloc[-1]),
            "structural_beta_ceiling": float(ceiling_history["structural_beta_ceiling"].iloc[-1]),
            "spectral_state": str(ceiling_history["spectral_state"].iloc[-1]),
            "suggested_stance": str(ceiling_history["structural_suggested_stance"].iloc[-1]),
        },
    }

    comparison_out = comparison.copy()
    comparison_out["compression_score"] = compression_aligned
    comparison_out["structural_beta_ceiling"] = ceiling_series.reindex(comparison.index).ffill()
    comparison_out["future_return_21d"] = fwd_return_21d
    comparison_out["future_drawdown_21d"] = fwd_drawdown_21d

    (research_settings.spectral_output_dir / "spectral_backtest_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    ceiling_history.reset_index().to_csv(research_settings.spectral_output_dir / "structural_beta_ceiling_history.csv", index=False)
    comparison_out.to_csv(research_settings.spectral_output_dir / "spectral_backtest_daily_returns.csv", index=True)

    return SpectralBacktestArtifacts(summary=summary, ceiling_history=ceiling_history, daily_returns=comparison_out)
