from __future__ import annotations

import json

import pandas as pd

from .config import AllocatorSettings, PathConfig, ResearchSettings
from .data.adapters import (
    load_alpha_volume_panel,
    load_defense_price_panel,
    load_fmp_market_proxy_panel,
    load_membership_history,
    load_portfolio_priors,
    load_sp500_price_panel,
    load_state_panel,
)
from .data.runtime_bootstrap import ensure_runtime_inputs
from .data.fred_client import FREDClient
from .data.fmp_client import FMPClient
from .policy.engine import build_current_policy_output, build_policy_state_frame
from .presentation.phantom_cli import load_render_context, render_phantom_terminal
from .production.allocator import build_latest_decision
from .production.reporting import build_overlay_report
from .research.features import build_asset_feature_panel
from .research.labels import build_forward_return_labels
from .research.scoring import compute_selection_diagnostics, estimate_feature_weights, score_cross_section
from .research.tail_risk import run_tail_risk_pipeline
from .storage.runtime_store import save_runtime_document, save_runtime_frame
from .utils import ensure_directory, time_safe_join


def _latest_state_row(state: pd.DataFrame, date: pd.Timestamp) -> pd.Series:
    eligible = state.loc[state["date"] <= date]
    if not eligible.empty:
        return eligible.iloc[-1]
    return pd.Series(
        {
            "date": pd.to_datetime(date),
            "crash_prob": 0.5,
            "legitimacy_risk": 0.5,
            "tail_risk_score": 0.5,
            "regime": "NEUTRAL",
        }
    )


def _weekly_dates(index: pd.DatetimeIndex, weekday: int) -> pd.DatetimeIndex:
    dates = pd.DatetimeIndex(index).sort_values().unique()
    selected = [date for date in dates if date.weekday() == weekday]
    if len(dates) and dates[-1] not in selected:
        selected.append(dates[-1])
    return pd.DatetimeIndex(sorted(set(selected)))


def run_production(paths: PathConfig, research_settings: ResearchSettings, allocator_settings: AllocatorSettings) -> dict:
    ensure_directory(allocator_settings.output_dir)
    ensure_directory(research_settings.policy_output_dir)
    fmp_client = FMPClient.from_env(paths.cache_root)
    fred_client = FREDClient.from_env(paths.cache_root)
    ensure_runtime_inputs(paths, research_settings, fmp_client=fmp_client)

    state = load_state_panel(paths)
    tail_risk = run_tail_risk_pipeline(paths, research_settings, state, fmp_client=fmp_client, fred_client=fred_client)
    state = time_safe_join(state, tail_risk.panel[["date", "tail_loss_5d", "tail_loss_10d", "tail_loss_20d", "tail_risk_score"]], on="date")
    prices = load_sp500_price_panel(paths, research_settings.start_date, research_settings.end_date)
    membership = load_membership_history(paths)
    priors = load_portfolio_priors(paths, fmp_client=fmp_client)
    volume = load_alpha_volume_panel(paths, tickers=list(prices.columns), start_date=research_settings.start_date, end_date=research_settings.end_date)

    features = build_asset_feature_panel(prices, membership, priors, dollar_volume=volume)
    labels = build_forward_return_labels(prices, horizon_days=research_settings.forward_horizon_days)
    panel = features.merge(labels, on=["date", "ticker"], how="left")
    panel = time_safe_join(panel, state, on="date")
    panel["date"] = panel["date"].astype("datetime64[ns]")

    latest_date = panel["date"].max()
    proxy_prices = load_fmp_market_proxy_panel(
        paths,
        tickers=research_settings.market_proxy_tickers,
        start_date=research_settings.start_date,
        end_date=research_settings.end_date,
        fmp_client=fmp_client,
    )
    defense_prices, _ = load_defense_price_panel(
        paths,
        start_date=research_settings.start_date,
        end_date=research_settings.end_date,
        tickers=tuple(dict.fromkeys(("SPY", *research_settings.hedge_tickers))),
        fmp_client=fmp_client,
    )
    proxy_prices = defense_prices.combine_first(proxy_prices) if not defense_prices.empty else proxy_prices
    proxy_returns = proxy_prices.pct_change().fillna(0.0) if not proxy_prices.empty else defense_prices.pct_change().fillna(0.0)
    report_date = pd.to_datetime(proxy_prices.index.max()) if not proxy_prices.empty else latest_date
    train_end = latest_date - pd.Timedelta(days=research_settings.embargo_days)
    train_start = latest_date - pd.Timedelta(days=research_settings.train_lookback_days)
    train_panel = panel.loc[(panel["date"] >= train_start) & (panel["date"] <= train_end)].dropna(subset=["fwd_excess_return"]).copy()
    weights = estimate_feature_weights(train_panel, list(research_settings.feature_columns), label_column="fwd_excess_return")
    latest_scored = score_cross_section(panel.loc[panel["date"] == latest_date].copy(), list(research_settings.feature_columns), weights)
    diagnostics = compute_selection_diagnostics(latest_scored, research_settings.top_n)
    diagnostics["coverage"] = float(latest_scored["selection_score"].notna().mean()) if not latest_scored.empty else 0.0
    latest_state = _latest_state_row(state, report_date)
    decision, full_weights, sleeve_signal = build_latest_decision(
        latest_date,
        latest_state,
        latest_scored,
        allocator_settings,
        selection_strength=diagnostics["selection_strength"],
    )
    policy_history = build_policy_state_frame(
        _weekly_dates(proxy_prices.index if not proxy_prices.empty else defense_prices.index, research_settings.weekly_rebalance_weekday),
        state,
        proxy_prices if not proxy_prices.empty else defense_prices,
        research_settings,
    )
    latest_policy_row = build_policy_state_frame(
        pd.DatetimeIndex([report_date]),
        state,
        proxy_prices if not proxy_prices.empty else defense_prices,
        research_settings,
    ).iloc[-1]
    policy_decision = build_current_policy_output(research_settings, policy_history, proxy_returns, latest_policy_row, paths=paths)
    overlay_report = build_overlay_report(
        latest_state=latest_state,
        latest_scored=latest_scored,
        proxy_prices=proxy_prices,
        as_of_date=report_date,
        settings=research_settings,
        decision_payload=decision.__dict__,
        selection_diagnostics=diagnostics,
        tail_risk_latest=tail_risk.summary.get("latest", {}),
        scenario_payload=policy_decision.get("scenario_synthesis", {}),
    )

    basket = full_weights.drop(labels=["SPY", "IEF", "BIL"], errors="ignore").sort_values(ascending=False)
    payload = {
        "recommended_policy": policy_decision["recommended_action"],
        "beta_target": policy_decision["beta_target"],
        "selected_hedge": policy_decision["selected_hedge"],
        "policy_confidence": policy_decision["confidence"],
        "policy_expected_utility": policy_decision["expected_utility"],
        "best_alternative_action": policy_decision["alternative_action"],
        "best_hedge_now": overlay_report.overview["hedge_summary"]["primary_hedge"],
        "policy_decision": policy_decision,
        "decision": decision.__dict__,
        "sleeve_signal": sleeve_signal,
        "selection_diagnostics": diagnostics,
        "tail_risk": tail_risk.summary.get("latest", {}),
        "overlay_report": overlay_report.overview,
        "weights": {key: float(value) for key, value in full_weights.sort_values(ascending=False).items()},
    }
    (allocator_settings.output_dir / "current_allocator_decision.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    save_runtime_document(
        "current_allocator_decision",
        payload,
        {
            "source": "run_production",
            "recommended_policy": payload.get("recommended_policy"),
        },
    )
    basket.rename("weight").to_csv(allocator_settings.output_dir / "current_selected_basket.csv", index=True)
    (allocator_settings.output_dir / "current_meta_allocator_view.json").write_text(json.dumps(overlay_report.overview, indent=2), encoding="utf-8")
    overlay_report.sector_map.to_csv(allocator_settings.output_dir / "current_sector_map.csv", index=False)
    overlay_report.international_map.to_csv(allocator_settings.output_dir / "current_international_map.csv", index=False)
    overlay_report.hedge_ranking.to_csv(allocator_settings.output_dir / "current_hedge_ranking.csv", index=False)
    save_runtime_frame("production:current_sector_map", overlay_report.sector_map, {"source": "run_production"})
    save_runtime_frame("production:current_international_map", overlay_report.international_map, {"source": "run_production"})
    save_runtime_frame("production:current_hedge_ranking", overlay_report.hedge_ranking, {"source": "run_production"})
    (research_settings.policy_output_dir / "current_policy_decision.json").write_text(json.dumps(policy_decision, indent=2), encoding="utf-8")
    return payload


def run_policy(paths: PathConfig, research_settings: ResearchSettings, allocator_settings: AllocatorSettings) -> dict:
    payload = run_production(paths, research_settings, allocator_settings)
    return payload["policy_decision"]


def run_phantom(paths: PathConfig, research_settings: ResearchSettings, allocator_settings: AllocatorSettings) -> str:
    payload = run_production(paths, research_settings, allocator_settings)
    research_summary, policy_summary, sector_map, international_map, hedge_ranking = load_render_context(paths)
    return render_phantom_terminal(
        payload,
        research_summary=research_summary,
        policy_summary=policy_summary,
        sector_map=sector_map,
        international_map=international_map,
        hedge_ranking=hedge_ranking,
    )
