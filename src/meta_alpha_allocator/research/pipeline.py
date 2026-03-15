from __future__ import annotations

import json
from dataclasses import asdict

import numpy as np
import pandas as pd

from ..config import AllocatorSettings, PathConfig, ResearchSettings
from ..data.adapters import (
    load_alpha_volume_panel,
    load_defense_price_panel,
    load_fmp_market_proxy_panel,
    load_membership_history,
    load_portfolio_priors,
    load_sp500_price_panel,
    load_state_panel,
)
from ..data.fred_client import FREDClient
from ..data.fmp_client import FMPClient
from ..policy.engine import build_policy_state_frame, run_policy_backtest
from ..production.allocator import allocate_capital, build_sleeve_signal
from ..utils import ensure_directory, performance_summary, split_equal_blocks, time_safe_join
from .features import build_asset_feature_panel
from .labels import build_forward_return_labels
from .regime_labels import build_daily_regime_frame, summarize_performance_by_episode, summarize_performance_by_regime
from .scoring import compute_daily_feature_ics, compute_selection_diagnostics, estimate_feature_weights, estimate_feature_weights_from_ics, score_cross_section
from .tail_risk import run_tail_risk_pipeline


def _weekly_rebalance_dates(index: pd.DatetimeIndex, weekday: int) -> pd.DatetimeIndex:
    dates = pd.DatetimeIndex(index).sort_values().unique()
    chosen = [date for date in dates if date.weekday() == weekday]
    if dates[-1] not in chosen:
        chosen.append(dates[-1])
    return pd.DatetimeIndex(sorted(set(chosen)))


def _neutral_state_row(date: pd.Timestamp) -> pd.Series:
    return pd.Series(
        {
            "date": pd.to_datetime(date),
            "crash_prob": 0.5,
            "tension_pct": 0.5,
            "memory_p_fail": 0.5,
            "recurrence": 0.5,
            "crowding_pct": 0.5,
            "regime": "NEUTRAL",
            "legitimacy_risk": 0.5,
            "tail_loss_5d": 0.5,
            "tail_loss_10d": 0.5,
            "tail_loss_20d": 0.5,
            "tail_risk_score": 0.5,
        }
    )


def _state_row_for_date(state: pd.DataFrame, date: pd.Timestamp) -> pd.Series:
    eligible = state.loc[state["date"] <= date]
    if eligible.empty:
        return _neutral_state_row(date)
    return eligible.iloc[-1]


def _build_baseline_returns(full_returns: pd.DataFrame, decisions: pd.DataFrame) -> pd.DataFrame:
    spy = full_returns.get("SPY", pd.Series(0.0, index=full_returns.index))
    ief = full_returns.get("IEF", pd.Series(0.0, index=full_returns.index))
    bil = full_returns.get("BIL", pd.Series(0.0, index=full_returns.index))

    state_overlay = []
    for date, row in decisions.iterrows():
        defense = float(row["defense_weight"])
        state_overlay.append(spy.loc[date] * (1.0 - defense) + (0.6 * ief.loc[date] + 0.4 * bil.loc[date]) * defense)
    state_overlay = pd.Series(state_overlay, index=decisions.index, name="state_overlay")

    standalone = decisions["selection_return"].rename("selection_standalone")
    benchmark = spy.reindex(decisions.index).fillna(0.0).rename("spy")
    return pd.concat([benchmark, standalone, state_overlay], axis=1)


def run_research(
    paths: PathConfig | None = None,
    research_settings: ResearchSettings | None = None,
    allocator_settings: AllocatorSettings | None = None,
) -> dict:
    paths = paths or PathConfig()
    research_settings = research_settings or ResearchSettings()
    allocator_settings = allocator_settings or AllocatorSettings()
    ensure_directory(research_settings.output_dir)
    fmp_client = FMPClient.from_env(paths.cache_root)
    fred_client = FREDClient.from_env(paths.cache_root)

    state = load_state_panel(paths)
    tail_risk = run_tail_risk_pipeline(paths, research_settings, state, fmp_client=fmp_client, fred_client=fred_client)
    tail_state_columns = ["date"] + [column for column in tail_risk.panel.columns if column != "date" and column not in state.columns]
    state = time_safe_join(state, tail_risk.panel[tail_state_columns], on="date")
    prices = load_sp500_price_panel(paths, research_settings.start_date, research_settings.end_date)
    membership = load_membership_history(paths)
    membership = membership.loc[membership["date"].between(prices.index.min(), prices.index.max())]
    priors = load_portfolio_priors(paths, fmp_client=fmp_client)
    volume = load_alpha_volume_panel(paths, tickers=list(prices.columns), start_date=research_settings.start_date, end_date=research_settings.end_date)
    defense_prices, defense_warnings = load_defense_price_panel(paths, research_settings.start_date, research_settings.end_date, fmp_client=fmp_client)
    proxy_prices = load_fmp_market_proxy_panel(
        paths,
        tickers=research_settings.market_proxy_tickers,
        start_date=research_settings.start_date,
        end_date=research_settings.end_date,
        fmp_client=fmp_client,
    )
    proxy_prices = defense_prices.combine_first(proxy_prices) if not defense_prices.empty else proxy_prices

    stock_returns = prices.pct_change().fillna(0.0)
    defense_returns = defense_prices.pct_change().fillna(0.0)
    full_returns = pd.concat([defense_returns, stock_returns], axis=1).sort_index().ffill().fillna(0.0)
    proxy_returns = proxy_prices.pct_change().fillna(0.0) if not proxy_prices.empty else defense_returns.copy()
    feature_columns = list(research_settings.feature_columns)

    features = build_asset_feature_panel(prices, membership, priors, dollar_volume=volume)
    labels = build_forward_return_labels(prices, horizon_days=research_settings.forward_horizon_days)
    panel = features.merge(labels, on=["date", "ticker"], how="left")
    panel = time_safe_join(panel, state, on="date", by=None)
    panel["date"] = pd.to_datetime(panel["date"])
    panel = panel.dropna(subset=feature_columns, how="all")
    daily_feature_ics = compute_daily_feature_ics(panel, feature_columns, label_column="fwd_excess_return")

    rebalances = _weekly_rebalance_dates(prices.index, research_settings.weekly_rebalance_weekday)
    previous_full_weights = pd.Series(dtype=float)
    previous_selection_weights = pd.Series(dtype=float)
    weight_history: list[dict[str, float]] = []
    decisions_rows: list[dict] = []
    strategy_returns: list[tuple[pd.Timestamp, float]] = []
    active_weights: pd.Series | None = None
    last_retrain_key: tuple[int, int] | pd.Timestamp | None = None

    for idx, rebalance_date in enumerate(rebalances[:-1]):
        next_date = rebalances[idx + 1]
        train_end = rebalance_date - pd.Timedelta(days=research_settings.embargo_days)
        train_start = train_end - pd.Timedelta(days=research_settings.train_lookback_days)

        if research_settings.retrain_frequency == "monthly":
            retrain_key: tuple[int, int] | pd.Timestamp = (rebalance_date.year, rebalance_date.month)
        else:
            retrain_key = rebalance_date

        if active_weights is None or retrain_key != last_retrain_key:
            ic_window = daily_feature_ics.loc[(daily_feature_ics["date"] >= train_start) & (daily_feature_ics["date"] <= train_end)].copy()
            if ic_window["date"].nunique() < 60:
                continue

            active_weights = estimate_feature_weights_from_ics(ic_window, feature_columns)
            last_retrain_key = retrain_key
            weight_row = {"date": str(rebalance_date.date())}
            weight_row.update(active_weights.to_dict())
            weight_history.append(weight_row)

        weights = active_weights

        point_in_time = panel.loc[panel["date"] == rebalance_date].copy()
        if point_in_time.empty or point_in_time["ticker"].nunique() < research_settings.min_assets_per_day:
            continue

        scored = score_cross_section(point_in_time, feature_columns, weights)
        selected = scored.sort_values("selection_score", ascending=False).head(research_settings.top_n).copy()
        diagnostics = compute_selection_diagnostics(scored, research_settings.top_n)
        selection_strength = diagnostics["selection_strength"]
        coverage = float(scored["selection_score"].notna().mean()) if not scored.empty else 0.0

        state_row = _state_row_for_date(state, rebalance_date)
        sleeve_signal = build_sleeve_signal(rebalance_date, state_row, selection_strength, coverage)
        raw_selection_weights = selected.set_index("ticker")["selection_rank"]
        sector_map = selected.set_index("ticker")["sector"].fillna("Unknown")
        decision, full_weights, sleeve_signal_dict = allocate_capital(
            rebalance_date,
            state_row,
            sleeve_signal,
            raw_selection_weights,
            sector_map,
            allocator_settings,
            previous_full_weights,
        )

        selection_only = raw_selection_weights / raw_selection_weights.sum() if raw_selection_weights.sum() > 0 else raw_selection_weights
        previous_selection_weights = selection_only

        hold_dates = full_returns.loc[(full_returns.index > rebalance_date) & (full_returns.index <= next_date)].index
        for hold_date in hold_dates:
            daily_ret = float(full_returns.reindex(columns=full_weights.index, fill_value=0.0).loc[hold_date].mul(full_weights).sum())
            if hold_date == hold_dates[0]:
                daily_ret -= decision.turnover * (research_settings.transaction_cost_bps / 10000.0)
            selection_return = float(stock_returns.reindex(columns=selection_only.index, fill_value=0.0).loc[hold_date].mul(selection_only).sum()) if not selection_only.empty else 0.0
            decision_payload = asdict(decision)
            decision_payload.pop("date", None)
            sleeve_payload = dict(sleeve_signal_dict)
            sleeve_payload.pop("date", None)
            decisions_rows.append(
                {
                    "date": hold_date,
                    **decision_payload,
                    **sleeve_payload,
                    **diagnostics,
                    "selection_return": selection_return,
                }
            )
            strategy_returns.append((hold_date, daily_ret))

        previous_full_weights = full_weights

    if not strategy_returns:
        raise RuntimeError("No research results were produced. Check local data availability.")

    returns = pd.Series({date: value for date, value in strategy_returns}).sort_index().rename("meta_allocator")
    decisions = pd.DataFrame(decisions_rows).drop_duplicates("date").set_index("date").sort_index()
    baselines = _build_baseline_returns(full_returns, decisions)
    policy_rebalance_dates = _weekly_rebalance_dates(proxy_prices.index if not proxy_prices.empty else defense_prices.index, research_settings.weekly_rebalance_weekday)
    policy_state = build_policy_state_frame(policy_rebalance_dates, state, proxy_prices if not proxy_prices.empty else defense_prices, research_settings)
    policy_artifacts = run_policy_backtest(paths, research_settings, policy_state, proxy_returns, baselines["state_overlay"])

    summary = {
        "meta_allocator": performance_summary(returns),
        "benchmark_spy": performance_summary(baselines["spy"]),
        "selection_standalone": performance_summary(baselines["selection_standalone"]),
        "state_overlay": performance_summary(baselines["state_overlay"]),
        "policy_overlay": policy_artifacts.summary.get("policy_overlay", {}),
        "policy_benchmarks": {
            "heuristic_state_overlay": policy_artifacts.summary.get("heuristic_state_overlay", {}),
            "static_60_40": policy_artifacts.summary.get("static_60_40", {}),
            "vol_target": policy_artifacts.summary.get("vol_target", {}),
            "trend_following": policy_artifacts.summary.get("trend_following", {}),
            "defensive_mix": policy_artifacts.summary.get("defensive_mix", {}),
        },
        "data_warnings": defense_warnings,
        "latest_tail_risk": tail_risk.summary.get("latest", {}),
    }

    blocks = split_equal_blocks(returns.index, n_blocks=3)
    block_results = []
    positive_blocks = 0
    regime_frame = build_daily_regime_frame(returns.index)
    regime_lookup = regime_frame.set_index("date")
    for block in blocks:
        block_ret = returns.reindex(block).fillna(0.0)
        block_summary = performance_summary(block_ret)
        block_summary["start"] = str(block[0].date())
        block_summary["end"] = str(block[-1].date())
        block_regimes = regime_lookup.reindex(block)
        if not block_regimes.empty:
            dominant = block_regimes["regime_label"].dropna().mode()
            top_episodes = block_regimes["episode_name"].dropna().value_counts().head(3).index.tolist()
            block_summary["dominant_regime"] = str(dominant.iloc[0]) if not dominant.empty else "normal"
            block_summary["overlapping_episodes"] = top_episodes
        block_results.append(block_summary)
        if block_summary["total_return"] >= -0.005:
            positive_blocks += 1

    summary["oos_blocks"] = block_results
    summary["regime_performance"] = summarize_performance_by_regime(returns, regime_frame)
    summary["episode_performance"] = summarize_performance_by_episode(returns, regime_frame)
    summary["acceptance_checks"] = {
        "sharpe_vs_spy": summary["meta_allocator"]["sharpe"] > summary["benchmark_spy"]["sharpe"],
        "maxdd_vs_selection": summary["meta_allocator"]["max_drawdown"] > summary["selection_standalone"]["max_drawdown"],
        "non_negative_blocks_2_of_3": positive_blocks >= 2,
        "policy_beats_heuristic_on_any_primary_metric": any(policy_artifacts.summary.get("acceptance_checks", {}).values()),
    }
    summary["policy_acceptance_checks"] = policy_artifacts.summary.get("acceptance_checks", {})
    summary["policy_high_vs_low_confidence"] = policy_artifacts.summary.get("high_vs_low_confidence", {})

    decisions.index = pd.to_datetime(decisions.index)
    daily_returns = pd.concat([returns, baselines], axis=1).sort_index()
    daily_returns = daily_returns.join(regime_lookup, how="left")
    latest_weights = pd.DataFrame(weight_history)

    (research_settings.output_dir / "research_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    decisions.reset_index().to_csv(research_settings.output_dir / "allocator_decisions.csv", index=False)
    daily_returns.to_csv(research_settings.output_dir / "daily_returns.csv", index=True)
    latest_weights.to_csv(research_settings.output_dir / "latest_feature_weights.csv", index=False)

    return summary
