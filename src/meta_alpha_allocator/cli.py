from __future__ import annotations

import argparse
import json

from .config import AllocatorSettings, DashboardSettings, PathConfig, ResearchSettings
from .dashboard.server import run_dashboard_server
from .dashboard.snapshot import build_dashboard_snapshot, load_cached_snapshot
from .data.adapters import load_fmp_market_proxy_panel, load_state_panel
from .data.fred_client import FREDClient
from .data.fmp_client import FMPClient
from .research.forecast_baselines import run_forecast_baselines
from .research.earnings_cash_kernel import run_earnings_cash_kernel
from .research.pipeline import run_research
from .research.statement_intel import run_statement_intelligence
from .research.tail_risk import run_tail_risk_pipeline
from .runtime import run_phantom, run_policy, run_production


def main() -> None:
    parser = argparse.ArgumentParser(description="Meta Allocator")
    subparsers = parser.add_subparsers(dest="command", required=True)
    default_dashboard_settings = DashboardSettings()

    research_parser = subparsers.add_parser("research", help="Run walk-forward research backtest")
    research_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    research_parser.add_argument("--end-date", default=None)
    research_parser.add_argument("--top-n", type=int, default=ResearchSettings.top_n)

    train_parser = subparsers.add_parser("train", help="Alias for full research training run")
    train_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    train_parser.add_argument("--end-date", default=None)
    train_parser.add_argument("--top-n", type=int, default=ResearchSettings.top_n)

    production_parser = subparsers.add_parser("production", help="Build current allocator decision")
    production_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    production_parser.add_argument("--end-date", default=None)

    report_parser = subparsers.add_parser("report", help="Build current meta allocator view")
    report_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    report_parser.add_argument("--end-date", default=None)

    policy_parser = subparsers.add_parser("policy", help="Build current policy learner decision")
    policy_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    policy_parser.add_argument("--end-date", default=None)

    phantom_parser = subparsers.add_parser("phantom", help="Render live phantom terminal in CLI")
    phantom_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    phantom_parser.add_argument("--end-date", default=None)

    dashboard_parser = subparsers.add_parser("dashboard", help="Run the local workstation dashboard")
    dashboard_subparsers = dashboard_parser.add_subparsers(dest="dashboard_command", required=True)

    dashboard_serve = dashboard_subparsers.add_parser("serve", help="Serve the local workstation UI")
    dashboard_serve.add_argument("--start-date", default=ResearchSettings.start_date)
    dashboard_serve.add_argument("--end-date", default=None)
    dashboard_serve.add_argument("--host", default=default_dashboard_settings.host)
    dashboard_serve.add_argument("--port", type=int, default=default_dashboard_settings.port)
    dashboard_serve.add_argument("--open-browser", action="store_true")

    dashboard_refresh = dashboard_subparsers.add_parser("refresh", help="Refresh the workstation snapshot")
    dashboard_refresh.add_argument("--start-date", default=ResearchSettings.start_date)
    dashboard_refresh.add_argument("--end-date", default=None)

    dashboard_snapshot = dashboard_subparsers.add_parser("snapshot", help="Print the latest workstation snapshot")
    dashboard_snapshot.add_argument("--start-date", default=ResearchSettings.start_date)
    dashboard_snapshot.add_argument("--end-date", default=None)
    dashboard_snapshot.add_argument("--json", action="store_true")

    tail_parser = subparsers.add_parser("tail-risk", help="Run multi-horizon tail-risk model")
    tail_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    tail_parser.add_argument("--end-date", default=None)

    forecast_parser = subparsers.add_parser("forecast-baseline", help="Run mlforecast-style market baselines")
    forecast_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    forecast_parser.add_argument("--end-date", default=None)

    statement_parser = subparsers.add_parser("statement-intel", help="Build financial statement intelligence layer")
    statement_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    statement_parser.add_argument("--end-date", default=None)

    kernel_parser = subparsers.add_parser("earnings-cash-kernel", help="Run experimental earnings-to-cash kernel")
    kernel_parser.add_argument("--start-date", default=ResearchSettings.start_date)
    kernel_parser.add_argument("--end-date", default=None)

    args = parser.parse_args()
    paths = PathConfig()
    research_settings = ResearchSettings(start_date=args.start_date, end_date=args.end_date, top_n=getattr(args, "top_n", ResearchSettings.top_n))
    allocator_settings = AllocatorSettings()

    dashboard_settings = DashboardSettings(
        host=getattr(args, "host", default_dashboard_settings.host),
        port=getattr(args, "port", default_dashboard_settings.port),
    )

    if args.command in {"research", "train"}:
        summary = run_research(paths, research_settings, allocator_settings)
        print(json.dumps(summary, indent=2))
    elif args.command == "tail-risk":
        fmp_client = FMPClient.from_env(paths.cache_root)
        fred_client = FREDClient.from_env(paths.cache_root)
        state = load_state_panel(paths)
        artifacts = run_tail_risk_pipeline(paths, research_settings, state, fmp_client=fmp_client, fred_client=fred_client)
        print(json.dumps(artifacts.summary, indent=2))
    elif args.command == "forecast-baseline":
        state = load_state_panel(paths)
        fmp_client = FMPClient.from_env(paths.cache_root)
        proxy_prices = load_fmp_market_proxy_panel(
            paths,
            tickers=research_settings.forecast_tickers,
            start_date=args.start_date,
            end_date=args.end_date,
            fmp_client=fmp_client,
        )
        artifacts = run_forecast_baselines(paths, research_settings, state, proxy_prices)
        print(json.dumps(artifacts.summary, indent=2))
    elif args.command == "statement-intel":
        artifacts = run_statement_intelligence(paths, research_settings)
        print(json.dumps(artifacts.summary, indent=2))
    elif args.command == "earnings-cash-kernel":
        artifacts = run_earnings_cash_kernel(paths, research_settings)
        print(json.dumps(artifacts.summary, indent=2))
    elif args.command == "policy":
        payload = run_policy(paths, research_settings, allocator_settings)
        print(json.dumps(payload, indent=2))
    elif args.command == "phantom":
        print(run_phantom(paths, research_settings, allocator_settings))
    elif args.command == "dashboard":
        if args.dashboard_command == "serve":
            run_dashboard_server(
                paths,
                research_settings,
                allocator_settings,
                dashboard_settings,
                open_browser=args.open_browser,
            )
        elif args.dashboard_command == "refresh":
            snapshot = build_dashboard_snapshot(
                paths,
                research_settings,
                allocator_settings,
                dashboard_settings,
                refresh_outputs=True,
            )
            print(json.dumps(snapshot, indent=2))
        else:
            snapshot = load_cached_snapshot(paths, dashboard_settings)
            if snapshot is None:
                snapshot = build_dashboard_snapshot(
                    paths,
                    research_settings,
                    allocator_settings,
                    dashboard_settings,
                    refresh_outputs=True,
                )
            print(json.dumps(snapshot if args.json else snapshot["overview"], indent=2))
    else:
        payload = run_production(paths, research_settings, allocator_settings)
        print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
