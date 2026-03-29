from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from meta_alpha_allocator.config import AllocatorSettings, DashboardSettings, PathConfig, ResearchSettings
from meta_alpha_allocator.dashboard.server import DashboardService, _bls_contract_routes, _build_handler
from meta_alpha_allocator.state_contract.model_registry import load_probability_manifest, save_probability_package
from meta_alpha_allocator.state_contract.probabilistic import _ensure_probability_package
from meta_alpha_allocator.state_contract.probability_models import _temporal_folds
from meta_alpha_allocator.state_contract.repairs import _bundle_to_candidate, build_repair_candidates
from meta_alpha_allocator.state_contract.research_artifacts import build_probability_artifact_fingerprint
from meta_alpha_allocator.dashboard.snapshot import apply_screener_query, build_dashboard_snapshot
from meta_alpha_allocator.dashboard.wsgi import create_app


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _paths(tmp_path: Path) -> PathConfig:
    project_root = tmp_path / "meta_alpha_allocator"
    finance_root = tmp_path
    ct_root = tmp_path.parent
    return PathConfig(
        project_root=project_root,
        finance_root=finance_root,
        ct_root=ct_root,
        fin_model_root=finance_root / "Fin_model",
        portfolio_manager_root=finance_root / "portfolio_manager",
        polymarket_root=ct_root / "polymarket_paper_trader",
        caria_data_root=ct_root / "caria_data",
        output_root=project_root / "output",
        cache_root=project_root / "cache",
    )


def _seed_outputs(paths: PathConfig) -> None:
    _write(
        paths.fin_model_root / "data_processed" / "tension_metrics.csv",
        "date,T_comp_pct,mem_30d__mem__p_fail,mem_30d__mem__recurrence,asset__mean_corr_63_pct,M_fin_pct,GFL_pct\n"
        "2026-03-10,0.45,0.4,0.5,0.4,0.42,0.38\n",
    )
    _write(paths.fin_model_root / "validation_output" / "current_signal.json", json.dumps({"date": "2026-03-10", "crash_prob": 0.47}))
    _write(
        paths.output_root / "production" / "latest" / "current_allocator_decision.json",
        json.dumps(
            {
                "recommended_policy": "beta_025",
                "beta_target": 0.25,
                "selected_hedge": "SHY",
                "policy_confidence": 0.69,
                "policy_expected_utility": 0.01,
                "best_alternative_action": "beta_040",
                "best_hedge_now": "SHY",
                "tail_risk": {"tail_loss_5d": 0.75, "tail_loss_10d": 0.8, "tail_loss_20d": 0.9, "tail_risk_score": 0.82},
                "weights": {"SPY": 0.25, "SHY": 0.75},
                "policy_decision": {
                    "recommended_action": "beta_025",
                    "selected_hedge": "SHY",
                    "explanation_fields": {
                        "why_this_action": ["tail_loss_10d supported beta target 25%"],
                        "conditions_that_flip_decision": ["crash_prob moving higher would favor beta target 40%"],
                    },
                },
                "overlay_report": {
                    "as_of_date": "2026-03-13",
                    "state": {"regime": "DEFENSIVE", "crash_prob": 0.47, "tail_risk_score": 0.82, "legitimacy_risk": 0.58},
                    "hedge_summary": {"primary_hedge": "SHY", "secondary_hedge": "GLD", "us_treasuries_best_hedge": True},
                },
            }
        ),
    )
    _write(
        paths.output_root / "production" / "latest" / "current_sector_map.csv",
        "sector,proxy_ticker,opportunity_score,mom_60d,view,defense_fit\nTechnology,XLK,0.8,0.12,preferred,0.4\nUtilities,XLU,0.6,0.03,secondary,0.7\n",
    )
    _write(
        paths.output_root / "production" / "latest" / "current_international_map.csv",
        "market,ticker,opportunity_score,mom_60d,diversification_score,view\nCanada,EWC,0.72,0.08,0.64,preferred\nIndia,INDA,0.58,0.06,0.42,secondary\n",
    )
    _write(
        paths.output_root / "production" / "latest" / "current_hedge_ranking.csv",
        "ticker,hedge_score,carry_score,crisis_score,corr_spy_63d,view\nSHY,0.77,0.61,0.82,-0.12,preferred\nGLD,0.69,0.48,0.74,-0.19,secondary\n",
    )
    _write(
        paths.output_root / "research" / "latest" / "research_summary.json",
        json.dumps(
            {
                "benchmark_spy": {"annual_return": 0.13, "sharpe": 0.79, "max_drawdown": -0.33},
                "state_overlay": {"annual_return": 0.12, "sharpe": 1.06, "max_drawdown": -0.24},
                "policy_overlay": {"annual_return": 0.11, "sharpe": 1.1, "max_drawdown": -0.15},
                "oos_blocks": [{"start": "2020-01-01", "end": "2021-01-01", "annual_return": 0.1, "sharpe": 1.0, "max_drawdown": -0.08}],
                "policy_high_vs_low_confidence": {"high": {"annual_return": 0.16, "sharpe": 1.5}, "low": {"annual_return": 0.05, "sharpe": 0.5}},
                "policy_benchmarks": {"trend_following": {"annual_return": 0.19, "sharpe": 1.7, "max_drawdown": -0.1}},
            }
        ),
    )
    _write(
        paths.output_root / "research" / "latest" / "daily_returns.csv",
        ",meta_allocator,spy,selection_standalone,state_overlay\n2026-03-10,0.01,0.012,0.015,0.009\n2026-03-11,-0.004,-0.006,-0.005,-0.003\n2026-03-12,0.003,0.002,0.004,0.003\n",
    )
    _write(
        paths.output_root / "policy" / "latest" / "policy_backtest_summary.json",
        json.dumps(
            {
                "policy_overlay": {"annual_return": 0.11, "sharpe": 1.1, "max_drawdown": -0.15},
                "heuristic_state_overlay": {"annual_return": 0.12, "sharpe": 1.03, "max_drawdown": -0.24},
                "benchmark_spy": {"annual_return": 0.13, "sharpe": 0.79, "max_drawdown": -0.33},
                "high_vs_low_confidence": {"high": {"annual_return": 0.16, "sharpe": 1.5}, "low": {"annual_return": 0.05, "sharpe": 0.5}},
            }
        ),
    )
    _write(
        paths.output_root / "policy" / "latest" / "policy_daily_returns.csv",
        ",policy_overlay,heuristic_state_overlay,trend_following,vol_target\n2026-03-10,0.008,0.006,0.01,0.007\n2026-03-11,-0.002,-0.003,-0.001,-0.002\n2026-03-12,0.004,0.002,0.003,0.003\n",
    )
    _write(
        paths.portfolio_manager_root / "output" / "latest" / "portfolio_summary.json",
        json.dumps(
            {
                "analytics": {"As of": "2026-03-11", "Beta": 0.82, "Top Position Weight": 0.08, "Concentration HHI": 0.04, "Holdings Count": 3},
                "macro": {"implied_equity_risk_premium": 0.0423},
            }
        ),
    )
    _write(
        paths.portfolio_manager_root / "output" / "latest" / "holdings_normalized.csv",
        "ticker;asset_type;quantity;currency;avg_cost_usd;current_price_usd;market_value_usd;weight;source_sheet;sector;industry\n"
        "SGOV;etf;10;USD;100;100.5;1005;0.40;Portfolio_Base;ETF;ETF\n"
        "PAGS;equity;20;USD;9.0;10.14;202.8;0.30;Portfolio_Base;Technology;Software\n"
        "UNH;equity;2;USD;280;285.25;570.5;0.30;Portfolio_Base;Healthcare;Healthcare Plans\n",
    )
    _write(
        paths.portfolio_manager_root / "output" / "latest" / "valuation_summary.csv",
        "ticker;method;fair_value;current_price;upside;confidence\nPAGS;hybrid;67.7;10.14;5.68;0.95\nUNH;hybrid;405.3;285.25;0.42;0.95\nSGOV;hybrid;100.48;100.48;0.0;0.21\n",
    )
    _write(
        paths.portfolio_manager_root / "output" / "latest" / "screener.csv",
        "ticker;asset_type;sector;industry;is_current_holding;is_watchlist;screen_origin;quality_score;value_score;risk_score;growth_score;composite_score;discovery_score;momentum_6m;valuation_gap;suggested_position;fair_value;current_price;thesis_bucket;analyst_consensus\n"
        "PAGS;equity;Technology;Software;TRUE;FALSE;current_holding;0.73;1.92;0.34;0.66;0.94;0.74;0.06;5.68;0.10;67.7;10.14;quality compounder;Buy\n"
        "UNH;equity;Healthcare;Healthcare Plans;TRUE;FALSE;current_holding;0.75;0.80;0.52;0.41;0.74;0.54;0.03;0.42;0.08;405.3;285.25;quality compounder;Buy\n",
    )
    _write(
        paths.portfolio_manager_root / "output" / "latest" / "discovery_screener.csv",
        "ticker;asset_type;sector;industry;is_current_holding;is_watchlist;screen_origin;quality_score;value_score;risk_score;growth_score;composite_score;discovery_score;momentum_6m;valuation_gap;suggested_position;fair_value;current_price;thesis_bucket;analyst_consensus\n"
        "MSFT;equity;Technology;Software;FALSE;TRUE;watchlist;0.83;0.72;0.68;0.61;0.76;0.71;0.08;0.14;0.06;510.0;448.0;quality compounder;Buy\n",
    )
    _write(
        paths.portfolio_manager_root / "output" / "latest" / "simulation_summary.csv",
        "ticker;prob_loss;expected_return;suggested_position;var_95;cvar_95\nPAGS;0.62;-0.03;0.0;-0.59;-0.65\nUNH;0.72;-0.14;0.0;-0.61;-0.67\nSGOV;0.00;0.04;0.1;0.03;0.03\n",
    )
    _write(
        paths.portfolio_manager_root / "output" / "latest" / "daily_screener_hits.csv",
        "ticker;sector;composite_score\nPAGS;Technology;0.94\n",
    )


def _fake_market_panel(*args, **kwargs) -> pd.DataFrame:
    dates = pd.date_range("2025-09-01", periods=180, freq="B")
    return pd.DataFrame(
        {
            "SPY": pd.Series(range(180), index=dates) + 500,
            "SHY": pd.Series(range(180), index=dates) * 0.05 + 100,
            "GLD": pd.Series(range(180), index=dates) * 0.2 + 180,
            "PAGS": pd.Series(range(180), index=dates) * 0.08 + 9,
            "UNH": pd.Series(range(180), index=dates) * 0.03 + 280,
            "SGOV": pd.Series(range(180), index=dates) * 0.01 + 100,
            "XLK": pd.Series(range(180), index=dates) * 0.04 + 210,
            "XLU": pd.Series(range(180), index=dates) * 0.02 + 75,
            "EWC": pd.Series(range(180), index=dates) * 0.03 + 40,
            "INDA": pd.Series(range(180), index=dates) * 0.02 + 52,
        }
    )


def test_build_dashboard_snapshot_from_existing_outputs(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)
    _seed_outputs(paths)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.load_fmp_market_proxy_panel", _fake_market_panel)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.FMPClient.from_env", lambda cache_root: None)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.FREDClient.from_env", lambda cache_root: None)

    snapshot = build_dashboard_snapshot(
        paths,
        ResearchSettings(),
        AllocatorSettings(),
        DashboardSettings(output_dir=paths.output_root / "dashboard" / "latest"),
        refresh_outputs=False,
    )

    assert snapshot["overview"]["selected_hedge"] == "SHY"
    assert snapshot["risk"]["spectral"]["latest"]["compression_score"] is not None
    assert snapshot["portfolio"]["top_holdings"][0]["ticker"] == "SGOV"
    assert snapshot["screener"]["rows"][0]["ticker"] == "MSFT"
    assert snapshot["screener"]["source_file"] == "discovery_screener.csv"
    assert snapshot["portfolio"]["current_mix_vs_spy"]
    assert snapshot["status"]["auto_refresh_seconds"] == 300
    assert snapshot["status"]["contract_status"] == "canonical_valid"
    assert snapshot["decision_packet"]["title"] == "Just advice"
    assert snapshot["decision_packet"]["current_read"][0]["label"] == "Holdings"
    assert snapshot["decision_packet"]["moves"]
    assert snapshot["decision_event_log"]["available"] is True
    assert snapshot["decision_event_log"]["events"]
    assert snapshot["portfolio"]["holdings_source"] == "backend_portfolio_manager"
    assert snapshot["bls_state_v1"]["contract_version"] == "state_contract_v1"
    assert "probabilistic_state" in snapshot["bls_state_v1"]
    assert "research_provenance" in snapshot["bls_state_v1"]
    assert snapshot["bls_state_v1"]["status"]["contract_status"] == "canonical_valid"
    assert snapshot["bls_state_v1"]["probabilistic_state"]["source"] in {"offline_probability_package_v1", "offline_probability_package_v1+research_restoration", "research_artifact_neighbors_v1", "heuristic_fallback_v1"}
    assert (paths.output_root / "state_contract" / "latest" / "probability_models_v1.json").exists()
    assert (paths.output_root / "dashboard" / "latest" / "decision_packet.json").exists()
    assert (paths.output_root / "audit" / "latest" / "decision_events.json").exists()


def test_dashboard_service_boot_without_cache_does_not_build_snapshot_inline(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)

    monkeypatch.setattr("meta_alpha_allocator.dashboard.server.load_cached_snapshot", lambda *args, **kwargs: None)

    def _unexpected_build(*args, **kwargs):  # pragma: no cover - should never run
        raise AssertionError("startup should not build a full snapshot inline when no cache is present")

    monkeypatch.setattr("meta_alpha_allocator.dashboard.server.build_dashboard_snapshot", _unexpected_build)

    service = DashboardService(
        paths,
        ResearchSettings(),
        AllocatorSettings(),
        DashboardSettings(output_dir=paths.output_root / "dashboard" / "latest"),
        boot_refresh_delay=-1,
    )

    snapshot = service.snapshot()
    assert snapshot["status"]["warnings"] == ["snapshot not yet available — refresh in progress"]
    assert snapshot["status"]["auto_refresh_seconds"] == 300


def test_dashboard_service_refresh_updates_market_data_in_artifact_only_mode(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)
    base_snapshot = {
        "generated_at": "2026-03-18T23:50:14.910193+00:00",
        "overview": {},
        "portfolio": {
            "holdings": [{"ticker": "PAGS", "current_price_usd": 10.14, "market_value_usd": 202.8}],
            "top_holdings": [{"ticker": "PAGS", "current_price_usd": 10.14, "market_value_usd": 202.8}],
            "quotes": [{"ticker": "PAGS", "price": 10.14}],
            "quotes_as_of": "2026-03-18",
            "quotes_stale_days": 11,
        },
        "status": {"warnings": []},
    }

    monkeypatch.setenv("META_ALLOCATOR_ARTIFACT_ONLY", "1")
    monkeypatch.setattr("meta_alpha_allocator.dashboard.server.load_cached_snapshot", lambda *args, **kwargs: json.loads(json.dumps(base_snapshot)))
    monkeypatch.setattr("meta_alpha_allocator.dashboard.server.remote_snapshot_url", lambda: "")

    def _refresh_market_data(cached, *args, **kwargs):
        refreshed = json.loads(json.dumps(cached))
        refreshed["generated_at"] = "2026-03-29T12:00:00+00:00"
        refreshed["portfolio"]["holdings"][0]["current_price_usd"] = 15.5
        refreshed["portfolio"]["top_holdings"][0]["current_price_usd"] = 15.5
        refreshed["portfolio"]["quotes"][0]["price"] = 15.5
        refreshed["portfolio"]["quotes_as_of"] = "2026-03-29"
        refreshed["portfolio"]["quotes_stale_days"] = 0
        return refreshed

    monkeypatch.setattr("meta_alpha_allocator.dashboard.server._refresh_cached_snapshot_market_data", _refresh_market_data)

    service = DashboardService(
        paths,
        ResearchSettings(),
        AllocatorSettings(),
        DashboardSettings(output_dir=paths.output_root / "dashboard" / "latest"),
        boot_refresh_delay=-1,
    )

    refreshed = service.refresh()
    assert refreshed["portfolio"]["holdings"][0]["current_price_usd"] == 15.5
    assert refreshed["portfolio"]["quotes"][0]["price"] == 15.5
    assert refreshed["portfolio"]["quotes_as_of"] == "2026-03-29"


def test_apply_screener_query_filters_and_sorts() -> None:
    snapshot = {
        "screener": {
            "rows": [
                {"ticker": "PAGS", "sector": "Technology", "thesis_bucket": "quality", "composite_score": 0.94},
                {"ticker": "UNH", "sector": "Healthcare", "thesis_bucket": "defensive", "composite_score": 0.74},
            ],
            "default_sort": {"column": "composite_score", "direction": "desc"},
        }
    }
    filtered = apply_screener_query(snapshot, "search=tech&sort_by=composite_score&direction=desc")
    assert filtered["count"] == 1
    assert filtered["rows"][0]["ticker"] == "PAGS"


def test_dashboard_server_exposes_overview_endpoint(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)
    _seed_outputs(paths)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.load_fmp_market_proxy_panel", _fake_market_panel)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.FMPClient.from_env", lambda cache_root: None)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.FREDClient.from_env", lambda cache_root: None)

    dashboard_settings = DashboardSettings(output_dir=paths.output_root / "dashboard" / "latest")
    snapshot = build_dashboard_snapshot(
        paths,
        ResearchSettings(),
        AllocatorSettings(),
        dashboard_settings,
        refresh_outputs=False,
    )
    app = create_app(paths, ResearchSettings(), AllocatorSettings(), dashboard_settings)

    def _call(path: str) -> dict:
        response = {}

        def start_response(status, headers):
            response["status"] = status
            response["headers"] = headers

        body = b"".join(
            app(
                {
                    "REQUEST_METHOD": "GET",
                    "PATH_INFO": path,
                    "QUERY_STRING": "",
                },
                start_response,
            )
        )
        assert response["status"] == "200 OK"
        return json.loads(body.decode("utf-8"))

    payload = _call("/api/overview")
    assert payload["selected_hedge"]
    packet_payload = _call("/api/decision-packet")
    assert packet_payload["title"] == "Just advice"
    events_payload = _call("/api/decision-events")
    assert events_payload["available"] is True
    state_payload = _bls_contract_routes(snapshot)["/api/state"]
    assert state_payload["contract_version"] == "state_contract_v1"
    assert "probabilistic_state" in state_payload
    contract_payload = _bls_contract_routes(snapshot)["/api/state-contract"]
    assert contract_payload["status"]["contract_status"] == "canonical_valid"


def test_probability_temporal_folds_respect_embargo() -> None:
    dates = pd.date_range("2025-01-01", periods=120, freq="B")
    folds = _temporal_folds(pd.Series(dates), embargo_days=20)

    assert folds
    for train_idx, valid_idx in folds:
        train_max = dates[max(train_idx)]
        valid_min = dates[min(valid_idx)]
        assert valid_min > train_max
        assert (valid_min - train_max).days >= 20


def test_probability_package_is_invalidated_on_artifact_fingerprint_change(tmp_path: Path, monkeypatch) -> None:
    snapshot = {"_output_root": tmp_path / "output"}
    stale_package = {"feature_columns": ["D_eff"], "targets": {"portfolio_recoverability": {"dummy": True}}, "metrics": []}
    old_fingerprint = {"fingerprint_hash": "old-hash", "artifacts": [{"artifact_key": "recoverability_episodes"}], "complete": True}
    save_probability_package(snapshot, stale_package, artifact_fingerprint=old_fingerprint)

    research_artifacts = {
        "recoverability_episodes": {"metadata": {"sha256": "new-1", "row_count": 10, "mtime_utc": "2026-03-17T00:00:00Z"}},
        "prob_recoverability_challenge": {"metadata": {"sha256": "new-2", "row_count": 10, "mtime_utc": "2026-03-17T00:00:00Z"}},
        "prob_recoverability_action_epochs": {"metadata": {"sha256": "new-3", "row_count": 10, "mtime_utc": "2026-03-17T00:00:00Z"}},
        "phantom_detector": {"metadata": {"sha256": "new-4", "row_count": 10, "mtime_utc": "2026-03-17T00:00:00Z"}},
        "daily_spectral_metrics": {"metadata": {"sha256": "new-5", "row_count": 10, "mtime_utc": "2026-03-17T00:00:00Z"}},
        "structural_recovery": {"metadata": {"sha256": "new-6", "row_count": 10, "mtime_utc": "2026-03-17T00:00:00Z"}},
    }

    monkeypatch.setattr('meta_alpha_allocator.state_contract.probabilistic.build_episode_frame', lambda artifacts: pd.DataFrame({'as_of': pd.to_datetime(['2026-01-01']*80), 'D_eff': [4.0]*80, 'stress_score': [0.4]*80, 'eq_breadth_20': [0.5]*80, 'cross_corr_60': [0.4]*80, 'VIX': [20.0]*80, 'phantom_score': [0.3]*80, 'fragility_pct': [0.4]*80, 'y_g_dominance': ([0,1]*40), 'y_r_dominance': ([1,0]*40), 'y_visible_correction': ([0,1]*40), 'y_structural_restoration': ([1,0]*40), 'y_phantom_rebound': ([0,1]*40), 'y_portfolio_recoverability': ([1,0]*40), 'y_extreme_drawdown': ([0,1]*40)}))
    monkeypatch.setattr('meta_alpha_allocator.state_contract.probabilistic.build_training_probability_frame', lambda frame: frame)
    rebuilt = {"feature_columns": ["D_eff"], "targets": {"portfolio_recoverability": {"rebuilt": True}}, "metrics": []}
    monkeypatch.setattr('meta_alpha_allocator.state_contract.probabilistic.build_probability_packages', lambda frame, embargo_days=20: rebuilt)

    package = _ensure_probability_package(snapshot, research_artifacts)
    manifest = load_probability_manifest(snapshot)
    fingerprint = build_probability_artifact_fingerprint(research_artifacts)

    assert package is rebuilt
    assert package['_package_meta']['package_invalidation_reason'] == 'artifact_fingerprint_mismatch'
    assert manifest['artifact_fingerprint_hash'] == fingerprint['fingerprint_hash']


def test_repair_candidate_preserves_negative_recoverability_delta(monkeypatch) -> None:
    snapshot = {}
    holdings = [{"ticker": "AAA", "weight": 1.0, "sector": "Technology", "asset_type": "equity", "momentum_6m": 0.1, "upside": 0.2}]
    measured_state = {"portfolio_hhi": 1.0, "portfolio_factor_dimension": 1.0, "portfolio_fragility_exposure": 0.7, "portfolio_liquidity_buffer": 0.05}
    probabilistic_state = {"p_portfolio_recoverability": 0.60, "p_phantom_rebound": 0.20, "p_extreme_drawdown": 0.10}
    bundle = [{"id": "trim-aaa", "kind": "trim", "ticker": "AAA", "weight": 0.2, "label": "Trim AAA by 20%"}]

    monkeypatch.setattr('meta_alpha_allocator.state_contract.repairs._score_from_package', lambda *args, **kwargs: {
        'p_portfolio_recoverability': 0.42,
        'p_phantom_rebound': 0.27,
        'p_extreme_drawdown': 0.18,
    })

    candidate = _bundle_to_candidate(bundle, snapshot, holdings, measured_state, probabilistic_state, ['turnover_budget'], 'AAA')

    assert candidate is not None
    assert candidate['delta_recoverability'] < 0
    assert candidate['repair_efficiency'] < 0


def test_repair_candidates_respect_turnover_cap(monkeypatch) -> None:
    snapshot = {
        'portfolio': {
            'holdings': [
                {'ticker': 'AAA', 'weight': 0.50, 'sector': 'Technology', 'asset_type': 'equity', 'momentum_6m': 0.12, 'upside': -0.2},
                {'ticker': 'BBB', 'weight': 0.30, 'sector': 'Healthcare', 'asset_type': 'equity', 'momentum_6m': -0.08, 'upside': 0.15},
                {'ticker': 'SGOV', 'weight': 0.20, 'sector': 'ETF', 'asset_type': 'etf', 'momentum_6m': 0.0, 'upside': 0.0},
            ],
            'simulation_rank': [{'ticker': 'AAA', 'prob_loss': 0.70, 'suggested_position': 0.0}],
        },
        'screener': {
            'rows': [
                {'ticker': 'XYZ', 'is_current_holding': False, 'sector': 'Industrials', 'asset_type': 'equity', 'discovery_score': 0.8, 'momentum_6m': -0.09, 'upside': 0.3},
                {'ticker': 'FAST', 'is_current_holding': False, 'sector': 'Technology', 'asset_type': 'equity', 'discovery_score': 0.7, 'momentum_6m': 0.14, 'upside': 0.2},
            ],
        },
        'hedges': {'selected_hedge': 'SHY'},
    }
    measured_state = {'portfolio_hhi': 0.38, 'portfolio_factor_dimension': 1.8, 'portfolio_fragility_exposure': 0.62, 'portfolio_liquidity_buffer': 0.10}
    probabilistic_state = {'p_portfolio_recoverability': 0.58, 'p_phantom_rebound': 0.24, 'p_extreme_drawdown': 0.18}
    policy_state = {
        'mode': 'observe',
        'max_single_name_add': 0.01,
        'max_gross_add': 0.04,
        'max_turnover': 0.05,
        'hedge_floor': 0.10,
        'allowed_sleeves': ['defensive_compounders', 'oversold_rebound', 'index_hedge', 'cash_equivalents'],
        'forbidden_sleeves': ['crowded_thematic_growth'],
    }

    monkeypatch.setattr('meta_alpha_allocator.state_contract.repairs._score_from_package', lambda *args, **kwargs: {
        'p_portfolio_recoverability': 0.66,
        'p_phantom_rebound': 0.18,
        'p_extreme_drawdown': 0.14,
    })

    candidates = build_repair_candidates(snapshot, measured_state, probabilistic_state, policy_state)

    assert candidates
    assert all(candidate['turnover'] <= 0.05 for candidate in candidates)


def test_dashboard_server_contract_routes_emit_probability_headers(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)
    _seed_outputs(paths)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.load_fmp_market_proxy_panel", _fake_market_panel)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.FMPClient.from_env", lambda cache_root: None)
    monkeypatch.setattr("meta_alpha_allocator.dashboard.snapshot.FREDClient.from_env", lambda cache_root: None)

    dashboard_settings = DashboardSettings(output_dir=paths.output_root / "dashboard" / "latest")
    snapshot = build_dashboard_snapshot(
        paths,
        ResearchSettings(),
        AllocatorSettings(),
        dashboard_settings,
        refresh_outputs=False,
    )
    assert snapshot["bls_state_v1"]["contract_version"] == "state_contract_v1"
    service = DashboardService(paths, ResearchSettings(), AllocatorSettings(), dashboard_settings, boot_refresh_delay=-1)
    service._snapshot = snapshot
    handler_cls = _build_handler(service)
    handler = object.__new__(handler_cls)
    handler.path = "/api/state-contract"
    captured = {}
    chunks = []
    handler.send_response = lambda status: captured.update({"status": f"{status} OK"})
    handler.send_header = lambda key, value: captured.setdefault("headers", {}).update({key: value})
    handler.end_headers = lambda: None
    handler.wfile = type("W", (), {"write": lambda self, data: chunks.append(data)})()
    handler.send_error = lambda code: (_ for _ in ()).throw(AssertionError(f"unexpected error {code}"))

    handler.do_GET()
    payload = json.loads(b"".join(chunks).decode("utf-8"))

    assert captured["status"] == "200 OK"
    assert captured["headers"]["X-BLS-Contract-Version"] == payload["contract_version"]
    assert captured["headers"]["X-BLS-Contract-Status"] == payload["status"]["contract_status"]
    assert "X-BLS-Fold-Count" in captured["headers"]
    assert "X-BLS-Brier-OOF" in captured["headers"]
    assert "X-BLS-Sample-Count" in captured["headers"]
