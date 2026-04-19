from __future__ import annotations

import base64
from io import BytesIO
import math

from openpyxl import load_workbook
import pandas as pd

from meta_alpha_allocator.research.equity_research_os import (
    DcfScenarioInput,
    build_dcf_scenario,
    build_equity_research_bundle,
    calculate_revenue_cagr,
    reverse_dcf_implied_growth,
)


class MockFMPClient:
    def get_profile(self, symbol: str) -> dict:
        return {
            "symbol": symbol,
            "companyName": "Example Compounder",
            "sector": "Technology",
            "industry": "Semiconductors",
            "country": "NL",
            "currency": "USD",
            "exchangeShortName": "NASDAQ",
            "price": 120.0,
            "mktCap": 1_200.0,
            "beta": 1.1,
        }

    def get_income_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {
                    "date": "2021-12-31",
                    "revenue": 1000.0,
                    "grossProfit": 500.0,
                    "costOfRevenue": 500.0,
                    "operatingIncome": 220.0,
                    "incomeBeforeTax": 210.0,
                    "incomeTaxExpense": 42.0,
                    "netIncome": 168.0,
                    "ebitda": 280.0,
                    "weightedAverageShsOutDil": 10.0,
                },
                {
                    "date": "2022-12-31",
                    "revenue": 1120.0,
                    "grossProfit": 570.0,
                    "costOfRevenue": 550.0,
                    "operatingIncome": 250.0,
                    "incomeBeforeTax": 240.0,
                    "incomeTaxExpense": 48.0,
                    "netIncome": 192.0,
                    "ebitda": 315.0,
                    "weightedAverageShsOutDil": 10.1,
                },
                {
                    "date": "2023-12-31",
                    "revenue": 1280.0,
                    "grossProfit": 660.0,
                    "costOfRevenue": 620.0,
                    "operatingIncome": 300.0,
                    "incomeBeforeTax": 290.0,
                    "incomeTaxExpense": 58.0,
                    "netIncome": 232.0,
                    "ebitda": 370.0,
                    "weightedAverageShsOutDil": 10.2,
                },
                {
                    "date": "2024-12-31",
                    "revenue": 1500.0,
                    "grossProfit": 795.0,
                    "costOfRevenue": 705.0,
                    "operatingIncome": 375.0,
                    "incomeBeforeTax": 360.0,
                    "incomeTaxExpense": 72.0,
                    "netIncome": 288.0,
                    "ebitda": 455.0,
                    "weightedAverageShsOutDil": 10.0,
                },
            ]
        )

    def get_cash_flow_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {"date": "2021-12-31", "netCashProvidedByOperatingActivities": 210.0, "capitalExpenditure": -60.0, "stockBasedCompensation": 20.0},
                {"date": "2022-12-31", "netCashProvidedByOperatingActivities": 250.0, "capitalExpenditure": -65.0, "stockBasedCompensation": 22.0},
                {"date": "2023-12-31", "netCashProvidedByOperatingActivities": 310.0, "capitalExpenditure": -70.0, "stockBasedCompensation": 24.0},
                {"date": "2024-12-31", "netCashProvidedByOperatingActivities": 390.0, "capitalExpenditure": -80.0, "stockBasedCompensation": 26.0},
            ]
        )

    def get_balance_sheet_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {"date": "2021-12-31", "cashAndCashEquivalents": 120.0, "totalDebt": 180.0, "totalStockholdersEquity": 900.0, "totalAssets": 1250.0},
                {"date": "2022-12-31", "cashAndCashEquivalents": 140.0, "totalDebt": 185.0, "totalStockholdersEquity": 980.0, "totalAssets": 1360.0},
                {"date": "2023-12-31", "cashAndCashEquivalents": 170.0, "totalDebt": 190.0, "totalStockholdersEquity": 1070.0, "totalAssets": 1480.0},
                {"date": "2024-12-31", "cashAndCashEquivalents": 220.0, "totalDebt": 200.0, "totalStockholdersEquity": 1180.0, "totalAssets": 1600.0},
            ]
        )

    def get_historical_prices(self, symbol: str) -> pd.DataFrame:
        return pd.DataFrame([{"date": "2024-12-31", "close": 120.0, "volume": 1000}])


class MockSECClient:
    def get_recent_filings(self, symbol: str) -> list[dict]:
        return [
            {
                "form": "10-K",
                "accession_number": "0000000000-25-000001",
                "filing_date": "2025-02-15",
                "report_date": "2024-12-31",
                "primary_document": "exm-20241231.htm",
                "filing_url": "https://www.sec.gov/Archives/edgar/data/1/000000000025000001/exm-20241231.htm",
            }
        ]


def test_revenue_cagr_formula() -> None:
    result = calculate_revenue_cagr(100.0, 121.0, 2)
    assert result is not None
    assert math.isclose(result, 0.10, rel_tol=1e-9)


def test_dcf_and_reverse_dcf_are_deterministic() -> None:
    scenario = build_dcf_scenario(
        "base",
        DcfScenarioInput(
            latest_revenue=1000.0,
            latest_fcf_margin=0.2,
            cash=100.0,
            debt=50.0,
            diluted_shares=10.0,
            revenue_growth=0.06,
            terminal_fcf_margin=0.2,
            wacc=0.09,
            terminal_growth=0.03,
        ),
    )

    assert scenario["intrinsic_value_per_share"] > 0
    reverse = reverse_dcf_implied_growth(
        current_price=scenario["intrinsic_value_per_share"],
        latest_revenue=1000.0,
        fcf_margin=0.2,
        cash=100.0,
        debt=50.0,
        diluted_shares=10.0,
        wacc=0.09,
        terminal_growth=0.03,
    )
    assert reverse["available"] is True
    assert math.isclose(reverse["implied_revenue_cagr"], 0.06, abs_tol=1e-5)


def test_equity_research_bundle_uses_sources_and_formulas() -> None:
    bundle = build_equity_research_bundle("EXM", mode="full", fmp_client=MockFMPClient(), sec_client=MockSECClient())

    assert bundle["ok"] is True
    assert bundle["ticker"] == "EXM"
    assert bundle["valuation"]["available"] is True
    assert bundle["financials"]["annual"][-1]["free_cash_flow"] == 310.0
    assert bundle["financials"]["ratios"]["latest_revenue"] == 1500.0
    assert bundle["audit"]["status"] == "pass"
    assert len(bundle["sources"]["records"]) == 6
    assert bundle["filings"]["recent"][0]["form"] == "10-K"
    assert any(point["source_id"] == "sec:submissions" for point in bundle["sources"]["data_points"])
    assert any(point["claim_tag"] == "calculated_metric" for point in bundle["sources"]["data_points"])
    assert "authoritative filings" in bundle["report_markdown"].lower()
    assert "reverse dcf" in bundle["report_markdown"].lower()
    assert bundle["artifacts"]["model_xlsx"] is True
    download_names = {artifact["filename"] for artifact in bundle["downloads"]}
    assert {
        "EXM_report.md",
        "EXM_model.xlsx",
        "EXM_sources.json",
        "EXM_audit.json",
        "EXM_assumptions.yml",
    }.issubset(download_names)
    workbook_artifact = next(artifact for artifact in bundle["downloads"] if artifact["filename"] == "EXM_model.xlsx")
    workbook = load_workbook(BytesIO(base64.b64decode(workbook_artifact["content_base64"])), data_only=False)
    assert {
        "Assumptions",
        "Historical Financials",
        "Forecast",
        "DCF",
        "Reverse DCF",
        "Multiples",
        "Scenarios",
        "Sensitivities",
        "Sources",
        "Audit",
    }.issubset(set(workbook.sheetnames))
    assert str(workbook["DCF"]["B11"].value).startswith("=")


def test_equity_research_bundle_refuses_to_invent_without_provider() -> None:
    bundle = build_equity_research_bundle("AAPL", fmp_client=None)

    assert bundle["ok"] is True
    assert bundle["valuation"]["available"] is False
    assert bundle["audit"]["status"] == "needs_attention"
    assert bundle["sources"]["records"][0]["status"] == "unavailable"
    assert any(source["provider"] == "sec-edgar" and source["status"] == "unavailable" for source in bundle["sources"]["records"])
    assert bundle["artifacts"]["model_xlsx"] is False
    assert not any(artifact["filename"].endswith(".xlsx") for artifact in bundle["downloads"])
