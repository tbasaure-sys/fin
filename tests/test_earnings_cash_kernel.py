from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from meta_alpha_allocator.config import PathConfig, ResearchSettings
from meta_alpha_allocator.research.earnings_cash_kernel import run_earnings_cash_kernel
from meta_alpha_allocator.research.statement_intel import run_statement_intelligence


class FakeFMPClient:
    def __init__(self, statement_map: dict[str, dict[str, pd.DataFrame]]) -> None:
        self.statement_map = statement_map

    def get_income_statements(self, symbol: str, *, period: str = "quarter", limit: int = 40) -> pd.DataFrame:
        return self.statement_map.get(symbol, {}).get("income", pd.DataFrame()).copy()

    def get_cash_flow_statements(self, symbol: str, *, period: str = "quarter", limit: int = 40) -> pd.DataFrame:
        return self.statement_map.get(symbol, {}).get("cash", pd.DataFrame()).copy()

    def get_balance_sheet_statements(self, symbol: str, *, period: str = "quarter", limit: int = 40) -> pd.DataFrame:
        return self.statement_map.get(symbol, {}).get("balance", pd.DataFrame()).copy()


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


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _statement_frames(symbol: str, revenue: list[float], net_income: list[float], ocf: list[float], fcf: list[float], capex: list[float], wc: list[float], assets: list[float]) -> dict[str, pd.DataFrame]:
    quarter_dates = pd.date_range("2023-03-31", periods=len(revenue), freq="QE")
    accepted_dates = quarter_dates + pd.Timedelta(days=45)
    income = pd.DataFrame(
        {
            "date": quarter_dates,
            "calendarYear": quarter_dates.year.astype(str),
            "period": [f"Q{((idx % 4) + 1)}" for idx in range(len(quarter_dates))],
            "acceptedDate": accepted_dates,
            "fillingDate": accepted_dates,
            "revenue": revenue,
            "netIncome": net_income,
        }
    )
    cash = pd.DataFrame(
        {
            "date": quarter_dates,
            "calendarYear": quarter_dates.year.astype(str),
            "period": [f"Q{((idx % 4) + 1)}" for idx in range(len(quarter_dates))],
            "acceptedDate": accepted_dates,
            "fillingDate": accepted_dates,
            "netCashProvidedByOperatingActivities": ocf,
            "freeCashFlow": fcf,
            "capitalExpenditure": capex,
            "changeInWorkingCapital": wc,
        }
    )
    balance = pd.DataFrame(
        {
            "date": quarter_dates,
            "calendarYear": quarter_dates.year.astype(str),
            "period": [f"Q{((idx % 4) + 1)}" for idx in range(len(quarter_dates))],
            "acceptedDate": accepted_dates,
            "fillingDate": accepted_dates,
            "totalAssets": assets,
            "totalCurrentAssets": [value * 0.42 for value in assets],
            "totalCurrentLiabilities": [value * 0.18 for value in assets],
        }
    )
    return {"income": income, "cash": cash, "balance": balance}


def _seed_universe(paths: PathConfig) -> None:
    latest = paths.portfolio_manager_root / "output" / "latest"
    _write(
        latest / "screener.csv",
        "ticker;asset_type;sector;industry;gross_margin;ebitda_margin;roic;fcf_yield;debt_to_ebitda;forward_pe;beta;momentum_6m;valuation_gap;quality_score;value_score;risk_score;growth_score;composite_score;suggested_position;thesis_bucket;analyst_consensus\n"
        "PAGS;equity;Technology;Software;0.50;0.46;0.40;0.44;0.29;6.1;1.44;0.06;5.68;0.73;1.92;0.35;0.66;0.94;0.0;quality compounder;Buy\n"
        "ASTS;equity;Technology;Communications;0.50;-0.10;-0.07;-0.03;7.20;120;2.8;1.38;-1.27;0.24;0.43;0.65;0.93;0.54;0.1;watchlist;Hold\n",
    )
    _write(latest / "valuation_summary.csv", "ticker;fair_value;upside;confidence\nPAGS;67.7;5.68;0.95\nASTS;-24.0;-1.27;0.65\nSGOV;100.5;0.0;0.30\n")
    _write(latest / "holdings_normalized.csv", "ticker;asset_type;weight;sector;industry\nPAGS;equity;0.03;Technology;Software\nASTS;equity;0.02;Technology;Communications\nSGOV;etf;0.25;ETF;ETF\n")
    _write(latest / "portfolio_summary.json", json.dumps({"top_ideas": []}))
    _write(latest / "daily_screener_hits.csv", "ticker;asset_type;sector;industry\nPAGS;equity;Technology;Software\n")


def _fake_price_panel(*args, **kwargs) -> pd.DataFrame:
    dates = pd.date_range("2023-01-02", periods=420, freq="B")
    return pd.DataFrame(
        {
            "PAGS": 20 + pd.Series(range(len(dates)), index=dates) * 0.18,
            "ASTS": 12 - pd.Series(range(len(dates)), index=dates) * 0.03,
        }
    )


def test_run_earnings_cash_kernel_scores_conversion_quality(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)
    _seed_universe(paths)
    settings = ResearchSettings(statement_kernel_output_dir=tmp_path / "statement_kernel")
    fake_client = FakeFMPClient(
        {
            "PAGS": _statement_frames(
                "PAGS",
                revenue=[100, 105, 110, 115, 120, 130, 140, 150],
                net_income=[10, 11, 12, 12, 13, 15, 17, 18],
                ocf=[11, 12, 13, 13, 15, 18, 20, 22],
                fcf=[8, 9, 9, 10, 11, 13, 15, 16],
                capex=[-2, -2, -3, -3, -3, -4, -4, -4],
                wc=[0.5, 0.4, 0.4, 0.2, 0.1, -0.2, -0.3, -0.4],
                assets=[120, 124, 128, 132, 136, 142, 148, 155],
            ),
            "ASTS": _statement_frames(
                "ASTS",
                revenue=[35, 36, 37, 38, 39, 40, 41, 42],
                net_income=[2, 2, 3, 3, 4, 4, 5, 5],
                ocf=[-1, 0, -1, 0, 1, 0, 1, 0],
                fcf=[-3, -2, -3, -2, -2, -2, -1, -1],
                capex=[-2, -2, -2, -2, -2, -2, -2, -2],
                wc=[1.0, 1.1, 1.2, 1.1, 1.0, 1.0, 0.9, 0.8],
                assets=[80, 82, 85, 88, 92, 95, 99, 103],
            ),
        }
    )
    monkeypatch.setattr("meta_alpha_allocator.research.earnings_cash_kernel.load_fmp_market_proxy_panel", _fake_price_panel)

    artifacts = run_earnings_cash_kernel(paths, settings, fmp_client=fake_client)

    latest = artifacts.latest_panel.set_index("ticker")
    assert latest.loc["PAGS", "earnings_cash_kernel_bucket"] == "cash_confirmed"
    assert latest.loc["ASTS", "earnings_cash_kernel_bucket"] in {"fragile_conversion", "earnings_only"}
    assert latest.loc["PAGS", "earnings_cash_kernel_score"] > latest.loc["ASTS", "earnings_cash_kernel_score"]
    assert artifacts.summary["research_utility"]["coverage"] > 0
    assert (settings.statement_kernel_output_dir / "earnings_cash_kernel_summary.json").exists()


def test_statement_intel_merges_kernel_fields(tmp_path: Path, monkeypatch) -> None:
    paths = _paths(tmp_path)
    _seed_universe(paths)
    fake_client = FakeFMPClient(
        {
            "PAGS": _statement_frames(
                "PAGS",
                revenue=[100, 105, 110, 115, 120, 130, 140, 150],
                net_income=[10, 11, 12, 12, 13, 15, 17, 18],
                ocf=[11, 12, 13, 13, 15, 18, 20, 22],
                fcf=[8, 9, 9, 10, 11, 13, 15, 16],
                capex=[-2, -2, -3, -3, -3, -4, -4, -4],
                wc=[0.5, 0.4, 0.4, 0.2, 0.1, -0.2, -0.3, -0.4],
                assets=[120, 124, 128, 132, 136, 142, 148, 155],
            ),
            "ASTS": _statement_frames(
                "ASTS",
                revenue=[35, 36, 37, 38, 39, 40, 41, 42],
                net_income=[2, 2, 3, 3, 4, 4, 5, 5],
                ocf=[-1, 0, -1, 0, 1, 0, 1, 0],
                fcf=[-3, -2, -3, -2, -2, -2, -1, -1],
                capex=[-2, -2, -2, -2, -2, -2, -2, -2],
                wc=[1.0, 1.1, 1.2, 1.1, 1.0, 1.0, 0.9, 0.8],
                assets=[80, 82, 85, 88, 92, 95, 99, 103],
            ),
        }
    )
    monkeypatch.setattr("meta_alpha_allocator.research.statement_intel.FMPClient.from_env", lambda cache_root: fake_client)
    monkeypatch.setattr("meta_alpha_allocator.research.earnings_cash_kernel.load_fmp_market_proxy_panel", _fake_price_panel)

    settings = ResearchSettings(statement_output_dir=tmp_path / "statement", statement_kernel_output_dir=tmp_path / "statement_kernel")
    artifacts = run_statement_intelligence(paths, settings)

    assert "earnings_cash_kernel_score" in artifacts.panel.columns
    assert "statement_conviction_score" in artifacts.panel.columns
    assert "top_kernel_names" in artifacts.summary
    assert "kernel_research_utility" in artifacts.summary
    assert artifacts.panel.loc[artifacts.panel["ticker"] == "PAGS", "earnings_cash_kernel_bucket"].iloc[0] == "cash_confirmed"
