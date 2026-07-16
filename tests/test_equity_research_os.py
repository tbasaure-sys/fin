from __future__ import annotations

import base64
from datetime import date, timedelta
from io import BytesIO
import math

from openpyxl import load_workbook
import pandas as pd
import pytest

from meta_alpha_allocator.research.equity_research_os import (
    DEFAULT_TAX_RATE,
    DcfScenarioInput,
    _build_valuation,
    _build_downloads,
    _build_model_xlsx,
    _build_ttm_row,
    _all_statement_families_use_sec,
    _enrich_balance_frames_with_sec,
    _derive_assumptions,
    _data_points_for_output,
    _apply_current_share_count_gate,
    _apply_statement_reconciliation_gate,
    _load_fmp_payloads,
    _normalize_financials,
    _reconcile_statement_rows,
    _reconcile_current_share_count,
    _sec_company_facts_frames,
    _ttm_data_points,
    _valuation_data_points,
    build_dcf_scenario,
    build_equity_research_bundle,
    calculate_revenue_cagr,
    reverse_dcf_implied_growth,
)
from meta_alpha_allocator.research.institutional_valuation import _normalize_annual_history


RECENT_MARKET_DATE = (date.today() - timedelta(days=1)).isoformat()
PRIOR_MARKET_DATE = (date.today() - timedelta(days=2)).isoformat()


def test_mixed_fmp_and_sec_statement_families_still_require_reconciliation() -> None:
    assert _all_statement_families_use_sec(
        {
            "income": "fmp:income:annual",
            "cash_flow": "fmp:cash-flow:annual",
            "balance": "sec:companyfacts:balance",
        }
    ) is False
    assert _all_statement_families_use_sec(
        {
            "income": "sec:companyfacts:income",
            "cash_flow": "sec:companyfacts:cash-flow",
            "balance": "sec:companyfacts:balance",
        }
    ) is True


def test_unbacked_output_redacts_intrinsic_reverse_dcf_but_keeps_explicit_market_requirement() -> None:
    output = _data_points_for_output(
        [
            {
                "metric": "valuation_reverse_dcf_implied_revenue_cagr",
                "normalized_value": 0.42,
                "raw_value": 0.42,
                "claim_tag": "calculated_metric",
                "formula": "intrinsic reverse DCF",
            },
            {
                "metric": "market_requirement_implied_revenue_cagr",
                "normalized_value": 0.31,
                "raw_value": 0.31,
                "claim_tag": "calculated_metric",
                "formula": "price-implied operating requirement",
            },
        ],
        backed=False,
    )

    assert output[0]["normalized_value"] is None
    assert output[0]["claim_tag"] == "uncertainty"
    assert output[1]["normalized_value"] == 0.31
    assert output[1]["claim_tag"] == "calculated_metric"


def test_valuation_range_evidence_exposes_canonical_low_central_and_high_metrics() -> None:
    points = _valuation_data_points(
        {
            "available": True,
            "primary_method": "through_cycle_fcff_dcf",
            "range": {"low": 88.0, "central": 112.0, "high": 139.0},
            "scenarios": [],
            "multiples": {},
            "reliability": {},
        }
    )

    canonical = {
        point["metric"]: point
        for point in points
        if point["metric"] in {
            "valuation_range_low",
            "valuation_range_central",
            "valuation_range_high",
        }
    }
    assert set(canonical) == {
        "valuation_range_low",
        "valuation_range_central",
        "valuation_range_high",
    }
    assert canonical["valuation_range_low"]["normalized_value"] == 88.0
    assert canonical["valuation_range_central"]["normalized_value"] == 112.0
    assert canonical["valuation_range_high"]["normalized_value"] == 139.0
    assert all(point["claim_tag"] == "calculated_metric" for point in canonical.values())
    assert all(point["formula"] for point in canonical.values())


class MockFMPClient:
    def get_profile(self, symbol: str) -> dict:
        return {
            "symbol": symbol,
            "companyName": "Example Compounder",
            "sector": "Technology",
            "industry": "Software - Infrastructure",
            "country": "NL",
            "currency": "USD",
            "exchangeShortName": "NASDAQ",
            "price": 120.0,
            "mktCap": 1_200.0,
            "beta": 1.1,
        }

    def get_income_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        if period == "quarter":
            return pd.DataFrame()
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
                    "interestExpense": 10.0,
                    "interestExpense": 10.0,
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
                    "interestExpense": 10.0,
                    "interestExpense": 10.0,
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
                    "interestExpense": 10.0,
                    "interestExpense": 10.0,
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
                    "interestExpense": 10.0,
                    "interestExpense": 10.0,
                    "weightedAverageShsOutDil": 10.0,
                },
            ]
        )

    def get_cash_flow_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        if period == "quarter":
            return pd.DataFrame()
        return pd.DataFrame(
            [
                {"date": "2021-12-31", "netCashProvidedByOperatingActivities": 210.0, "capitalExpenditure": -60.0, "stockBasedCompensation": 20.0},
                {"date": "2022-12-31", "netCashProvidedByOperatingActivities": 250.0, "capitalExpenditure": -65.0, "stockBasedCompensation": 22.0},
                {"date": "2023-12-31", "netCashProvidedByOperatingActivities": 310.0, "capitalExpenditure": -70.0, "stockBasedCompensation": 24.0},
                {"date": "2024-12-31", "netCashProvidedByOperatingActivities": 390.0, "capitalExpenditure": -80.0, "stockBasedCompensation": 26.0},
            ]
        )

    def get_balance_sheet_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        if period == "quarter":
            return pd.DataFrame()
        return pd.DataFrame(
            [
                {"date": "2021-12-31", "cashAndCashEquivalents": 120.0, "shortTermInvestments": 0.0, "totalDebt": 180.0, "totalStockholdersEquity": 900.0, "totalAssets": 1250.0, "preferredStock": 0.0, "minorityInterest": 0.0, "unfundedPensionLiability": 0.0, "leaseLiabilitiesNotInDebt": 0.0},
                {"date": "2022-12-31", "cashAndCashEquivalents": 140.0, "shortTermInvestments": 0.0, "totalDebt": 185.0, "totalStockholdersEquity": 980.0, "totalAssets": 1360.0, "preferredStock": 0.0, "minorityInterest": 0.0, "unfundedPensionLiability": 0.0, "leaseLiabilitiesNotInDebt": 0.0},
                {"date": "2023-12-31", "cashAndCashEquivalents": 170.0, "shortTermInvestments": 0.0, "totalDebt": 190.0, "totalStockholdersEquity": 1070.0, "totalAssets": 1480.0, "preferredStock": 0.0, "minorityInterest": 0.0, "unfundedPensionLiability": 0.0, "leaseLiabilitiesNotInDebt": 0.0},
                {"date": "2024-12-31", "cashAndCashEquivalents": 220.0, "shortTermInvestments": 0.0, "totalDebt": 200.0, "totalStockholdersEquity": 1180.0, "totalAssets": 1600.0, "preferredStock": 0.0, "minorityInterest": 0.0, "unfundedPensionLiability": 0.0, "leaseLiabilitiesNotInDebt": 0.0},
            ]
        )

    def get_historical_prices(self, symbol: str) -> pd.DataFrame:
        return pd.DataFrame([{"date": RECENT_MARKET_DATE, "close": 120.0, "volume": 1000}])

    def get_analyst_estimates(self, symbol: str, *, period: str = "annual", limit: int = 10) -> pd.DataFrame:
        rows = []
        for year, revenue in zip(range(2027, 2032), (1_650.0, 1_760.0, 1_860.0, 1_950.0, 2_030.0)):
            rows.append(
                {
                    "date": f"{year}-12-31",
                    "revenueLow": revenue * 0.95,
                    "revenueAvg": revenue,
                    "revenueHigh": revenue * 1.05,
                    "ebitdaLow": revenue * 0.22,
                    "ebitdaAvg": revenue * 0.25,
                    "ebitdaHigh": revenue * 0.28,
                    "numberAnalystsEstimatedRevenue": 5,
                }
            )
        return pd.DataFrame(rows)


def test_fmp_consensus_snapshot_receives_explicit_currency_and_retrieval_provenance() -> None:
    class ConsensusOnlyFMPClient:
        def get_profile(self, symbol: str) -> dict:
            return {"symbol": symbol, "currency": "USD"}

        def get_analyst_estimates(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
            return pd.DataFrame(
                [
                    {
                        "date": f"{year}-12-31",
                        "revenueLow": revenue * 0.9,
                        "revenueAvg": revenue,
                        "revenueHigh": revenue * 1.1,
                        "numberAnalystsEstimatedRevenue": 4,
                    }
                    for year, revenue in ((2027, 100.0), (2028, 110.0), (2029, 120.0))
                ]
            )

    _, frames, sources = _load_fmp_payloads("EXM", None, ConsensusOnlyFMPClient())

    estimates = frames["analyst_estimates"]
    assert estimates["currency"].tolist() == ["USD", "USD", "USD"]
    assert estimates["sourceFamily"].tolist() == ["FMP", "FMP", "FMP"]
    assert estimates["provenanceBasis"].tolist() == [
        "current_provider_snapshot_retrieved_at",
        "current_provider_snapshot_retrieved_at",
        "current_provider_snapshot_retrieved_at",
    ]
    assert estimates["providerSnapshotAt"].notna().all()
    source = next(item for item in sources if item["source_id"] == "fmp:analyst-estimates")
    assert source["as_of"] != source["forecast_through"]
    assert source["forecast_through"] == "2029-12-31"


class MicronLikeFMPClient(MockFMPClient):
    """Forward-aware fixture that reproduces the stale-annual MU failure mode."""

    def get_profile(self, symbol: str) -> dict:
        return {
            "symbol": symbol,
            "companyName": "Micron Technology, Inc.",
            "sector": "Technology",
            "industry": "Semiconductors",
            "country": "US",
            "currency": "USD",
            "exchangeShortName": "NASDAQ",
            "price": 983.12,
            "marketCap": 1_110_325_896_800.0,
            "beta": 1.18,
        }

    def get_quote(self, symbol: str) -> dict:
        return {
            "symbol": symbol,
            "price": 983.12,
            "marketCap": 1_110_325_896_800.0,
            "timestamp": 1_784_059_201,
        }

    def get_income_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        if period == "annual":
            return pd.DataFrame(
                [
                    {"date": "2019-08-29", "reportedCurrency": "USD", "revenue": 23_406_000_000.0, "operatingIncome": 6_283_000_000.0, "incomeBeforeTax": 5_900_000_000.0, "incomeTaxExpense": 900_000_000.0, "netIncome": 5_000_000_000.0, "ebitda": 12_000_000_000.0, "interestExpense": 500_000_000.0, "weightedAverageShsOutDil": 1_100_000_000.0},
                    {"date": "2020-09-03", "reportedCurrency": "USD", "revenue": 21_435_000_000.0, "operatingIncome": 3_735_000_000.0, "incomeBeforeTax": 3_400_000_000.0, "incomeTaxExpense": 500_000_000.0, "netIncome": 2_900_000_000.0, "ebitda": 10_500_000_000.0, "interestExpense": 450_000_000.0, "weightedAverageShsOutDil": 1_100_000_000.0},
                    {"date": "2021-09-02", "reportedCurrency": "USD", "revenue": 27_705_000_000.0, "operatingIncome": 6_283_000_000.0, "incomeBeforeTax": 5_900_000_000.0, "incomeTaxExpense": 900_000_000.0, "netIncome": 5_000_000_000.0, "ebitda": 13_000_000_000.0, "interestExpense": 400_000_000.0, "weightedAverageShsOutDil": 1_105_000_000.0},
                    {"date": "2022-09-01", "reportedCurrency": "USD", "revenue": 30_758_000_000.0, "operatingIncome": 8_700_000_000.0, "incomeBeforeTax": 8_300_000_000.0, "incomeTaxExpense": 1_400_000_000.0, "netIncome": 6_900_000_000.0, "ebitda": 15_000_000_000.0, "interestExpense": 350_000_000.0, "weightedAverageShsOutDil": 1_100_000_000.0},
                    {
                        "date": "2023-08-31",
                        "reportedCurrency": "USD",
                        "revenue": 15_540_000_000.0,
                        "operatingIncome": -5_745_000_000.0,
                        "incomeBeforeTax": -6_210_000_000.0,
                        "incomeTaxExpense": -377_000_000.0,
                        "netIncome": -5_833_000_000.0,
                        "ebitda": 1_100_000_000.0,
                        "interestExpense": 500_000_000.0,
                        "weightedAverageShsOutDil": 1_093_000_000.0,
                    },
                    {
                        "date": "2024-08-29",
                        "reportedCurrency": "USD",
                        "revenue": 25_111_000_000.0,
                        "operatingIncome": 1_304_000_000.0,
                        "incomeBeforeTax": 1_180_000_000.0,
                        "incomeTaxExpense": 402_000_000.0,
                        "netIncome": 778_000_000.0,
                        "ebitda": 8_900_000_000.0,
                        "interestExpense": 450_000_000.0,
                        "weightedAverageShsOutDil": 1_105_000_000.0,
                    },
                    {
                        "date": "2025-08-28",
                        "reportedCurrency": "USD",
                        "revenue": 37_378_000_000.0,
                        "operatingIncome": 8_420_000_000.0,
                        "incomeBeforeTax": 8_170_000_000.0,
                        "incomeTaxExpense": 1_130_000_000.0,
                        "netIncome": 7_040_000_000.0,
                        "ebitda": 18_597_420_056.0,
                        "interestExpense": 400_000_000.0,
                        "weightedAverageShsOutDil": 1_125_000_000.0,
                    },
                ]
            )
        return pd.DataFrame(
            [
                {"date": "2025-08-28", "period": "Q4", "reportedCurrency": "USD", "revenue": 11_315_000_000.0, "operatingIncome": 3_800_000_000.0, "incomeBeforeTax": 3_700_000_000.0, "incomeTaxExpense": 500_000_000.0, "netIncome": 3_200_000_000.0, "ebitda": 6_800_000_000.0, "interestExpense": 100_000_000.0, "weightedAverageShsOutDil": 1_125_000_000.0},
                {"date": "2025-11-27", "period": "Q1", "reportedCurrency": "USD", "revenue": 24_900_000_000.0, "operatingIncome": 15_600_000_000.0, "incomeBeforeTax": 15_500_000_000.0, "incomeTaxExpense": 2_250_000_000.0, "netIncome": 13_250_000_000.0, "ebitda": 14_500_000_000.0, "interestExpense": 100_000_000.0, "weightedAverageShsOutDil": 1_130_000_000.0},
                {"date": "2026-02-26", "period": "Q2", "reportedCurrency": "USD", "revenue": 26_100_000_000.0, "operatingIncome": 16_800_000_000.0, "incomeBeforeTax": 16_700_000_000.0, "incomeTaxExpense": 2_400_000_000.0, "netIncome": 14_300_000_000.0, "ebitda": 15_100_000_000.0, "interestExpense": 100_000_000.0, "weightedAverageShsOutDil": 1_136_000_000.0},
                {"date": "2026-05-28", "period": "Q3", "reportedCurrency": "USD", "revenue": 27_959_000_000.0, "operatingIncome": 18_000_000_000.0, "incomeBeforeTax": 17_900_000_000.0, "incomeTaxExpense": 2_650_000_000.0, "netIncome": 15_250_000_000.0, "ebitda": 15_850_000_000.0, "interestExpense": 100_000_000.0, "weightedAverageShsOutDil": 1_145_000_000.0},
            ]
        )

    def get_income_statement_ttm(self, symbol: str) -> pd.DataFrame:
        quarters = self.get_income_statements(symbol, period="quarter", limit=8)
        return pd.DataFrame(
            [
                {
                    "date": quarters["date"].max(),
                    "period": "TTM",
                    "reportedCurrency": "USD",
                    **{
                        field: quarters[field].sum()
                        for field in (
                            "revenue",
                            "operatingIncome",
                            "incomeBeforeTax",
                            "incomeTaxExpense",
                            "netIncome",
                            "ebitda",
                            "interestExpense",
                        )
                    },
                    "weightedAverageShsOutDil": quarters["weightedAverageShsOutDil"].mean(),
                }
            ]
        )

    def get_cash_flow_statement_ttm(self, symbol: str) -> pd.DataFrame:
        quarters = self.get_cash_flow_statements(symbol, period="quarter", limit=8)
        return pd.DataFrame(
            [
                {
                    "date": quarters["date"].max(),
                    "period": "TTM",
                    "netCashProvidedByOperatingActivities": quarters["netCashProvidedByOperatingActivities"].sum(),
                    "capitalExpenditure": quarters["capitalExpenditure"].sum(),
                    "stockBasedCompensation": quarters["stockBasedCompensation"].sum(),
                }
            ]
        )

    def get_balance_sheet_statement_ttm(self, symbol: str) -> pd.DataFrame:
        latest = self.get_balance_sheet_statements(symbol, period="quarter", limit=8).sort_values("date").iloc[-1]
        return pd.DataFrame([{**latest.to_dict(), "period": "TTM"}])

    def get_cash_flow_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        if period == "annual":
            return pd.DataFrame(
                [
                    {"date": "2019-08-29", "netCashProvidedByOperatingActivities": 13_200_000_000.0, "capitalExpenditure": -9_000_000_000.0},
                    {"date": "2020-09-03", "netCashProvidedByOperatingActivities": 8_300_000_000.0, "capitalExpenditure": -8_000_000_000.0},
                    {"date": "2021-09-02", "netCashProvidedByOperatingActivities": 12_500_000_000.0, "capitalExpenditure": -9_700_000_000.0},
                    {"date": "2022-09-01", "netCashProvidedByOperatingActivities": 15_200_000_000.0, "capitalExpenditure": -12_100_000_000.0},
                    {"date": "2023-08-31", "netCashProvidedByOperatingActivities": -1_640_000_000.0, "capitalExpenditure": -7_676_000_000.0},
                    {"date": "2024-08-29", "netCashProvidedByOperatingActivities": 8_500_000_000.0, "capitalExpenditure": -8_200_000_000.0},
                    {"date": "2025-08-28", "netCashProvidedByOperatingActivities": 17_525_000_000.0, "capitalExpenditure": -15_857_000_000.0},
                ]
            ).assign(
                stockBasedCompensation=[420_000_000.0, 440_000_000.0, 500_000_000.0, 560_000_000.0, 620_000_000.0, 710_000_000.0, 820_000_000.0]
            )
        return pd.DataFrame(
            [
                {"date": "2025-08-28", "period": "Q4", "netCashProvidedByOperatingActivities": 5_730_000_000.0, "capitalExpenditure": -5_658_000_000.0},
                {"date": "2025-11-27", "period": "Q1", "netCashProvidedByOperatingActivities": 13_900_000_000.0, "capitalExpenditure": -5_900_000_000.0},
                {"date": "2026-02-26", "period": "Q2", "netCashProvidedByOperatingActivities": 15_200_000_000.0, "capitalExpenditure": -6_400_000_000.0},
                {"date": "2026-05-28", "period": "Q3", "netCashProvidedByOperatingActivities": 16_602_000_000.0, "capitalExpenditure": -7_302_000_000.0},
            ]
        ).assign(stockBasedCompensation=[210_000_000.0, 230_000_000.0, 250_000_000.0, 270_000_000.0])

    def get_balance_sheet_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        def complete_bridge(frame: pd.DataFrame) -> pd.DataFrame:
            frame["reportedCurrency"] = "USD"
            for column in (
                "shortTermInvestments",
                "goodwillAndIntangibleAssets",
                "preferredStock",
                "minorityInterest",
                "unfundedPensionLiability",
                "leaseLiabilitiesNotInDebt",
            ):
                frame[column] = 0.0
            return frame

        if period == "annual":
            return complete_bridge(pd.DataFrame(
                [
                    {"date": "2019-08-29", "cashAndCashEquivalents": 7_000_000_000.0, "totalDebt": 8_000_000_000.0, "totalStockholdersEquity": 35_000_000_000.0, "totalAssets": 55_000_000_000.0},
                    {"date": "2020-09-03", "cashAndCashEquivalents": 8_000_000_000.0, "totalDebt": 9_000_000_000.0, "totalStockholdersEquity": 37_000_000_000.0, "totalAssets": 58_000_000_000.0},
                    {"date": "2021-09-02", "cashAndCashEquivalents": 9_000_000_000.0, "totalDebt": 10_000_000_000.0, "totalStockholdersEquity": 40_000_000_000.0, "totalAssets": 62_000_000_000.0},
                    {"date": "2022-09-01", "cashAndCashEquivalents": 10_000_000_000.0, "totalDebt": 11_000_000_000.0, "totalStockholdersEquity": 43_000_000_000.0, "totalAssets": 65_000_000_000.0},
                    {"date": "2023-08-31", "cashAndCashEquivalents": 8_577_000_000.0, "totalDebt": 13_933_000_000.0, "totalStockholdersEquity": 44_123_000_000.0, "totalAssets": 66_283_000_000.0},
                    {"date": "2024-08-29", "cashAndCashEquivalents": 7_041_000_000.0, "totalDebt": 14_007_000_000.0, "totalStockholdersEquity": 45_131_000_000.0, "totalAssets": 69_416_000_000.0},
                    {"date": "2025-08-28", "cashAndCashEquivalents": 9_642_000_000.0, "totalDebt": 15_278_000_000.0, "totalStockholdersEquity": 56_900_000_000.0, "totalAssets": 82_300_000_000.0},
                ]
            ))
        return complete_bridge(pd.DataFrame(
            [
                {"date": "2025-08-28", "period": "Q4", "cashAndCashEquivalents": 9_642_000_000.0, "totalDebt": 15_278_000_000.0, "totalStockholdersEquity": 56_900_000_000.0, "totalAssets": 82_300_000_000.0},
                {"date": "2025-11-27", "period": "Q1", "cashAndCashEquivalents": 14_200_000_000.0, "totalDebt": 13_100_000_000.0, "totalStockholdersEquity": 68_000_000_000.0, "totalAssets": 94_000_000_000.0},
                {"date": "2026-02-26", "period": "Q2", "cashAndCashEquivalents": 20_500_000_000.0, "totalDebt": 9_800_000_000.0, "totalStockholdersEquity": 80_000_000_000.0, "totalAssets": 105_000_000_000.0},
                {"date": "2026-05-28", "period": "Q3", "cashAndCashEquivalents": 26_100_000_000.0, "totalDebt": 7_500_000_000.0, "totalStockholdersEquity": 101_000_000_000.0, "totalAssets": 134_000_000_000.0},
            ]
        ))

    def get_historical_prices(self, symbol: str) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {"date": PRIOR_MARKET_DATE, "close": 937.0, "volume": 1_000},
                {"date": RECENT_MARKET_DATE, "close": 983.12, "volume": 1_000},
            ]
        )

    def get_analyst_estimates(self, symbol: str, *, period: str = "annual", limit: int = 10) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {"date": "2026-08-28", "revenueLow": 113_421_669_739.0, "revenueAvg": 129_410_262_643.0, "revenueHigh": 135_447_406_207.0, "ebitdaLow": 56_710_834_869.0, "ebitdaAvg": 64_705_131_321.0, "ebitdaHigh": 67_723_703_103.0, "epsLow": 72.07522, "epsAvg": 73.16487, "epsHigh": 79.40558},
                {"date": "2027-08-28", "revenueLow": 188_016_727_211.0, "revenueAvg": 247_869_510_690.0, "revenueHigh": 281_808_615_506.0, "ebitdaLow": 94_008_363_605.0, "ebitdaAvg": 123_934_755_345.0, "ebitdaHigh": 140_904_307_753.0, "epsLow": 122.15885, "epsAvg": 152.81617, "epsHigh": 221.46734},
                {"date": "2028-08-28", "revenueLow": 196_545_549_591.0, "revenueAvg": 277_863_429_890.0, "revenueHigh": 318_980_256_008.0, "ebitdaLow": 98_272_774_795.0, "ebitdaAvg": 138_931_714_945.0, "ebitdaHigh": 159_490_128_004.0, "epsLow": 86.91417, "epsAvg": 166.45062, "epsHigh": 226.63974},
                {"date": "2029-08-28", "revenueLow": 256_933_248_698.0, "revenueAvg": 363_235_666_667.0, "revenueHigh": 416_985_444_938.0, "ebitdaLow": 128_466_624_349.0, "ebitdaAvg": 181_617_833_333.0, "ebitdaHigh": 208_492_722_469.0, "epsLow": 113.95376, "epsAvg": 183.93, "epsHigh": 219.31214},
                {"date": "2030-08-28", "revenueLow": 317_897_149_315.0, "revenueAvg": 449_422_500_000.0, "revenueHigh": 515_925_770_305.0, "ebitdaLow": 158_948_574_657.0, "ebitdaAvg": 224_711_250_000.0, "ebitdaHigh": 257_962_885_152.0, "epsLow": 163.9762, "epsAvg": 264.67, "epsHigh": 315.58389},
            ]
        )

    def get_key_metrics_ttm(self, symbol: str) -> dict:
        return {
            "symbol": symbol,
            "marketCap": 1_110_325_896_800.0,
            "enterpriseValueTTM": 1_091_706_896_800.0,
            "freeCashFlowToFirmTTM": 26_368_496_691.0,
            "freeCashFlowToEquityTTM": 15_777_000_000.0,
            "investedCapitalTTM": 105_981_000_000.0,
        }

    def get_ratios_ttm(self, symbol: str) -> dict:
        return {
            "symbol": symbol,
            "ebitdaMarginTTM": 0.4980614573,
            "effectiveTaxRateTTM": 0.1456665595,
            "bookValuePerShareTTM": 89.29432624,
            "netIncomePerShareTTM": 44.74556738,
        }


class MicronShareCountFMPClient(MicronLikeFMPClient):
    def __init__(self, outstanding_shares: float) -> None:
        self.outstanding_shares = outstanding_shares

    def get_shares_float(self, symbol: str) -> dict:
        return {
            "symbol": symbol,
            "date": RECENT_MARKET_DATE,
            "as_of": f"{RECENT_MARKET_DATE}T00:00:00+00:00",
            "outstandingShares": self.outstanding_shares,
            "floatShares": self.outstanding_shares * 0.985,
            "freeFloat": 98.5,
        }


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

    def get_company_facts(self, symbol: str) -> dict:
        return {
            "facts": {
                "us-gaap": {
                    "RevenueFromContractWithCustomerExcludingAssessedTax": _sec_annual_facts({2021: 1000.0, 2022: 1120.0, 2023: 1280.0, 2024: 1500.0}),
                    "GrossProfit": _sec_annual_facts({2021: 500.0, 2022: 570.0, 2023: 660.0, 2024: 795.0}),
                    "CostOfRevenue": _sec_annual_facts({2021: 500.0, 2022: 550.0, 2023: 620.0, 2024: 705.0}),
                    "OperatingIncomeLoss": _sec_annual_facts({2021: 220.0, 2022: 250.0, 2023: 300.0, 2024: 375.0}),
                    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest": _sec_annual_facts(
                        {2021: 210.0, 2022: 240.0, 2023: 290.0, 2024: 360.0}
                    ),
                    "IncomeTaxExpenseBenefit": _sec_annual_facts({2021: 42.0, 2022: 48.0, 2023: 58.0, 2024: 72.0}),
                    "NetIncomeLoss": _sec_annual_facts({2021: 168.0, 2022: 192.0, 2023: 232.0, 2024: 288.0}),
                    "WeightedAverageNumberOfDilutedSharesOutstanding": _sec_annual_facts(
                        {2021: 10.0, 2022: 10.1, 2023: 10.2, 2024: 10.0},
                        unit="shares",
                    ),
                    "NetCashProvidedByUsedInOperatingActivities": _sec_annual_facts({2021: 210.0, 2022: 250.0, 2023: 310.0, 2024: 390.0}),
                    "PaymentsToAcquirePropertyPlantAndEquipment": _sec_annual_facts({2021: 60.0, 2022: 65.0, 2023: 70.0, 2024: 80.0}),
                    "DepreciationDepletionAndAmortization": _sec_annual_facts({2021: 60.0, 2022: 65.0, 2023: 70.0, 2024: 80.0}),
                    "ShareBasedCompensation": _sec_annual_facts({2021: 20.0, 2022: 22.0, 2023: 24.0, 2024: 26.0}),
                    "CashAndCashEquivalentsAtCarryingValue": _sec_annual_facts({2021: 120.0, 2022: 140.0, 2023: 170.0, 2024: 220.0}),
                    "LongTermDebtAndFinanceLeaseObligationsCurrent": _sec_annual_facts({2021: 30.0, 2022: 35.0, 2023: 40.0, 2024: 45.0}),
                    "LongTermDebtAndFinanceLeaseObligationsNoncurrent": _sec_annual_facts({2021: 150.0, 2022: 150.0, 2023: 150.0, 2024: 155.0}),
                    "StockholdersEquity": _sec_annual_facts({2021: 900.0, 2022: 980.0, 2023: 1070.0, 2024: 1180.0}),
                    "Assets": _sec_annual_facts({2021: 1250.0, 2022: 1360.0, 2023: 1480.0, 2024: 1600.0}),
                }
            }
        }


class EmptyStatementFMPClient(MockFMPClient):
    def get_income_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame()

    def get_cash_flow_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame()

    def get_balance_sheet_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame()


def _quarterly_ttm_frames(dates: list[str], *, include_debt: bool = True) -> dict[str, pd.DataFrame]:
    periods = ["Q1", "Q2", "Q3", "Q4"]
    income = []
    cash_flow = []
    balance = []
    for index, date in enumerate(dates):
        period = periods[index % 4]
        income.append(
            {
                "date": date,
                "period": period,
                "reportedCurrency": "USD",
                "revenue": 100.0 + index * 10,
                "operatingIncome": 20.0,
                "incomeBeforeTax": 18.0,
                "incomeTaxExpense": 3.6,
                "netIncome": 14.4,
                "ebitda": 25.0,
                "interestExpense": 2.0,
                "weightedAverageShsOutDil": 10.0,
            }
        )
        cash_flow.append(
            {
                "date": date,
                "period": period,
                "netCashProvidedByOperatingActivities": 22.0,
                "capitalExpenditure": -8.0,
                "stockBasedCompensation": 1.0,
            }
        )
        row = {
            "date": date,
            "period": period,
            "reportedCurrency": "USD",
            "cashAndCashEquivalents": 30.0,
            "shortTermInvestments": 0.0,
            "totalStockholdersEquity": 80.0,
            "totalAssets": 150.0,
            "preferredStock": 0.0,
            "minorityInterest": 0.0,
            "unfundedPensionLiability": 0.0,
            "leaseLiabilitiesNotInDebt": 0.0,
        }
        if include_debt:
            row["totalDebt"] = 25.0
        balance.append(row)
    return {
        "income_quarterly": pd.DataFrame(income),
        "cash_flow_quarterly": pd.DataFrame(cash_flow),
        "balance_quarterly": pd.DataFrame(balance),
    }


def _add_provider_ttm(frames: dict[str, pd.DataFrame], *, multiplier: float = 1.0) -> dict[str, pd.DataFrame]:
    output = {key: value.copy() for key, value in frames.items()}
    income = output["income_quarterly"]
    cash_flow = output["cash_flow_quarterly"]
    balance = output["balance_quarterly"]
    output["income_ttm"] = pd.DataFrame(
        [
            {
                "date": income["date"].max(),
                "period": "TTM",
                "reportedCurrency": "USD",
                "revenue": income["revenue"].sum() * multiplier,
                "operatingIncome": income["operatingIncome"].sum() * multiplier,
                "incomeBeforeTax": income["incomeBeforeTax"].sum() * multiplier,
                "incomeTaxExpense": income["incomeTaxExpense"].sum() * multiplier,
                "netIncome": income["netIncome"].sum() * multiplier,
                "ebitda": income["ebitda"].sum() * multiplier,
                "interestExpense": income["interestExpense"].sum() * multiplier,
                "weightedAverageShsOutDil": income["weightedAverageShsOutDil"].mean() * multiplier,
            }
        ]
    )
    output["cash_flow_ttm"] = pd.DataFrame(
        [
            {
                "date": cash_flow["date"].max(),
                "period": "TTM",
                "netCashProvidedByOperatingActivities": cash_flow["netCashProvidedByOperatingActivities"].sum() * multiplier,
                "capitalExpenditure": cash_flow["capitalExpenditure"].sum() * multiplier,
                "stockBasedCompensation": cash_flow["stockBasedCompensation"].sum() * multiplier,
            }
        ]
    )
    output["balance_ttm"] = pd.DataFrame(
        [
            {
                **balance.sort_values("date").iloc[-1].to_dict(),
                "period": "TTM",
            }
        ]
    )
    return output


def test_ttm_builder_rejects_four_monthly_rows_disguised_as_quarters() -> None:
    frames = _quarterly_ttm_frames(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"])

    assert _build_ttm_row(frames, 0.21) is None


def test_ttm_builder_preserves_missing_balance_inputs_instead_of_inventing_zero() -> None:
    frames = _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"], include_debt=False)

    ttm = _build_ttm_row(frames, 0.21)

    assert ttm is not None
    assert ttm["ttm_validation"]["status"] == "date_sequence_only"
    assert ttm["total_debt"] is None
    assert ttm["invested_capital"] is None
    assert ttm["roic"] is None


def test_ttm_builder_validates_only_when_quarter_sum_matches_provider_ttm() -> None:
    frames = _add_provider_ttm(
        _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    )

    ttm = _build_ttm_row(frames, 0.21)

    assert ttm is not None
    assert ttm["ttm_validation"]["status"] == "validated"
    assert ttm["ttm_validation"]["provider_ttm_reconciled"] is True
    assert all(check["passed"] for check in ttm["ttm_validation"]["provider_ttm_checks"])


def test_ttm_builder_records_explicit_balance_date_currency_and_bridge_checks() -> None:
    frames = _add_provider_ttm(
        _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    )

    ttm = _build_ttm_row(frames, 0.21)

    assert ttm is not None
    validation = ttm["ttm_validation"]
    assert validation["provider_ttm_balance_date"] == "2026-03-31"
    assert validation["provider_ttm_balance_date_gap_days"] == 0
    assert validation["provider_ttm_balance_date_current"] is True
    assert validation["provider_ttm_balance_currency"] == "USD"
    assert validation["provider_ttm_balance_currency_reconciled"] is True
    checks = {check["metric"]: check for check in validation["provider_ttm_checks"]}
    for metric in (
        "cash",
        "total_debt",
        "non_operating_investments",
        "preferred_stock",
        "minority_interest",
        "lease_liabilities_not_in_debt",
    ):
        assert checks[metric]["passed"] is True
        assert checks[metric]["calculated_value"] == checks[metric]["provider_value"]


@pytest.mark.parametrize(
    ("date_case", "balance_date"),
    [
        ("missing", None),
        ("future", "2026-04-01"),
        ("stale", "2026-02-13"),
    ],
)
def test_ttm_builder_rejects_missing_future_or_stale_provider_balance_dates(
    date_case: str,
    balance_date: str | None,
) -> None:
    frames = _add_provider_ttm(
        _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    )
    if balance_date is None:
        frames["balance_ttm"] = frames["balance_ttm"].drop(columns=["date"])
    else:
        frames["balance_ttm"].loc[:, "date"] = balance_date

    ttm = _build_ttm_row(frames, 0.21)

    assert ttm is not None
    validation = ttm["ttm_validation"]
    assert validation["provider_ttm_balance_date_current"] is False, date_case
    assert validation["provider_ttm_reconciled"] is False


@pytest.mark.parametrize("balance_currency", [None, "EUR"])
def test_ttm_builder_rejects_missing_or_discordant_provider_balance_currency(
    balance_currency: str | None,
) -> None:
    frames = _add_provider_ttm(
        _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    )
    frames["balance_ttm"].loc[:, "reportedCurrency"] = balance_currency

    ttm = _build_ttm_row(frames, 0.21)

    assert ttm is not None
    validation = ttm["ttm_validation"]
    assert validation["provider_ttm_balance_currency_reconciled"] is False
    assert validation["provider_ttm_reconciled"] is False


def test_ttm_builder_requires_diluted_shares_in_all_four_quarters() -> None:
    frames = _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    frames["income_quarterly"].loc[:2, "weightedAverageShsOutDil"] = None
    frames = _add_provider_ttm(frames)

    ttm = _build_ttm_row(frames, 0.21)

    assert ttm is not None
    assert ttm["diluted_shares"] is None
    assert ttm["ttm_validation"]["diluted_share_quarters"] == 1
    assert ttm["ttm_validation"]["status"] == "provider_ttm_mismatch"
    assert ttm["ttm_validation"]["provider_ttm_reconciled"] is False


def test_ttm_builder_marks_mismatch_when_provider_ttm_disagrees() -> None:
    frames = _add_provider_ttm(
        _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"]),
        multiplier=2.0,
    )

    ttm = _build_ttm_row(frames, 0.21)

    assert ttm is not None
    assert ttm["ttm_validation"]["status"] == "provider_ttm_mismatch"
    assert ttm["ttm_validation"]["provider_ttm_reconciled"] is False
    assert any(not check["passed"] for check in ttm["ttm_validation"]["provider_ttm_checks"])


def _sec_duration_facts(rows: list[dict], *, unit: str = "USD") -> dict:
    return {"units": {unit: rows}}


def _complete_sec_rolling_ttm_facts(frames: dict[str, pd.DataFrame]) -> dict:
    q4_revenue, q1_revenue, q2_revenue, q3_revenue = frames["income_quarterly"]["revenue"].tolist()
    q4_interest, q1_interest, q2_interest, q3_interest = frames["income_quarterly"]["interestExpense"].tolist()
    q4_shares, q1_shares, q2_shares, q3_shares = frames["income_quarterly"][
        "weightedAverageShsOutDil"
    ].tolist()
    q4_cfo, q1_cfo, q2_cfo, q3_cfo = frames["cash_flow_quarterly"][
        "netCashProvidedByOperatingActivities"
    ].tolist()
    q4_capex, q1_capex, q2_capex, q3_capex = frames["cash_flow_quarterly"][
        "capitalExpenditure"
    ].abs().tolist()
    q4_sbc, q1_sbc, q2_sbc, q3_sbc = frames["cash_flow_quarterly"][
        "stockBasedCompensation"
    ].tolist()

    def rolling_facts(
        q4: float,
        q1: float,
        q2: float,
        q3: float,
        *,
        unit: str = "USD",
        weighted_average: bool = False,
    ) -> dict:
        prior_q3_ytd = q4 if weighted_average else 3 * q4
        fiscal_year = (3 * q4 + q4) / 4 if weighted_average else prior_q3_ytd + q4
        q2_ytd = (q1 + q2) / 2 if weighted_average else q1 + q2
        q3_ytd = (q1 + q2 + q3) / 3 if weighted_average else q1 + q2 + q3
        return _sec_duration_facts(
            [
                {
                    "start": "2024-07-01",
                    "end": "2025-03-31",
                    "val": prior_q3_ytd,
                    "form": "10-Q",
                    "fp": "Q3",
                    "fy": 2025,
                    "filed": "2025-04-20",
                },
                {
                    "start": "2024-07-01",
                    "end": "2025-06-30",
                    "val": fiscal_year,
                    "form": "10-K",
                    "fp": "FY",
                    "fy": 2025,
                    "filed": "2025-08-20",
                },
                {
                    "start": "2025-07-01",
                    "end": "2025-09-30",
                    "val": q1,
                    "form": "10-Q",
                    "fp": "Q1",
                    "fy": 2026,
                    "filed": "2025-10-20",
                },
                {
                    "start": "2025-07-01",
                    "end": "2025-12-31",
                    "val": q2_ytd,
                    "form": "10-Q",
                    "fp": "Q2",
                    "fy": 2026,
                    "filed": "2026-01-20",
                },
                {
                    "start": "2025-07-01",
                    "end": "2026-03-31",
                    "val": q3_ytd,
                    "form": "10-Q",
                    "fp": "Q3",
                    "fy": 2026,
                    "filed": "2026-04-20",
                },
            ],
            unit=unit,
        )

    return {
        "facts": {
            "us-gaap": {
                "RevenueFromContractWithCustomerExcludingAssessedTax": rolling_facts(
                    q4_revenue, q1_revenue, q2_revenue, q3_revenue
                ),
                "InterestExpenseNonOperating": rolling_facts(
                    q4_interest, q1_interest, q2_interest, q3_interest
                ),
                "WeightedAverageNumberOfDilutedSharesOutstanding": rolling_facts(
                    q4_shares,
                    q1_shares,
                    q2_shares,
                    q3_shares,
                    unit="shares",
                    weighted_average=True,
                ),
                "NetCashProvidedByUsedInOperatingActivities": rolling_facts(
                    q4_cfo, q1_cfo, q2_cfo, q3_cfo
                ),
                "PaymentsToAcquirePropertyPlantAndEquipment": rolling_facts(
                    q4_capex, q1_capex, q2_capex, q3_capex
                ),
                "ShareBasedCompensation": rolling_facts(
                    q4_sbc, q1_sbc, q2_sbc, q3_sbc
                ),
            }
        }
    }


def test_ttm_builder_does_not_validate_sec_ytd_without_the_prior_fy_q4_bridge() -> None:
    frames = _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    for key in ("income_quarterly", "cash_flow_quarterly", "balance_quarterly"):
        frames[key]["period"] = ["Q4", "Q1", "Q2", "Q3"]
    q1_revenue, q2_revenue, q3_revenue = frames["income_quarterly"].loc[1:3, "revenue"].tolist()
    q1_cfo, q2_cfo, q3_cfo = frames["cash_flow_quarterly"].loc[1:3, "netCashProvidedByOperatingActivities"].tolist()
    q1_capex, q2_capex, q3_capex = frames["cash_flow_quarterly"].loc[1:3, "capitalExpenditure"].abs().tolist()
    facts = {
        "facts": {
            "us-gaap": {
                "RevenueFromContractWithCustomerExcludingAssessedTax": _sec_duration_facts([
                    {"start": "2025-07-01", "end": "2025-09-30", "val": q1_revenue, "form": "10-Q", "fp": "Q1", "fy": 2026, "filed": "2025-10-20"},
                    {"start": "2025-07-01", "end": "2025-12-31", "val": q1_revenue + q2_revenue, "form": "10-Q", "fp": "Q2", "fy": 2026, "filed": "2026-01-20"},
                    {"start": "2025-07-01", "end": "2026-03-31", "val": q1_revenue + q2_revenue + q3_revenue, "form": "10-Q", "fp": "Q3", "fy": 2026, "filed": "2026-04-20"},
                ]),
                "NetCashProvidedByUsedInOperatingActivities": _sec_duration_facts([
                    {"start": "2025-07-01", "end": "2025-09-30", "val": q1_cfo, "form": "10-Q", "fp": "Q1", "fy": 2026, "filed": "2025-10-20"},
                    {"start": "2025-07-01", "end": "2025-12-31", "val": q1_cfo + q2_cfo, "form": "10-Q", "fp": "Q2", "fy": 2026, "filed": "2026-01-20"},
                    {"start": "2025-07-01", "end": "2026-03-31", "val": q1_cfo + q2_cfo + q3_cfo, "form": "10-Q", "fp": "Q3", "fy": 2026, "filed": "2026-04-20"},
                ]),
                "PaymentsToAcquirePropertyPlantAndEquipment": _sec_duration_facts([
                    {"start": "2025-07-01", "end": "2025-09-30", "val": q1_capex, "form": "10-Q", "fp": "Q1", "fy": 2026, "filed": "2025-10-20"},
                    {"start": "2025-07-01", "end": "2025-12-31", "val": q1_capex + q2_capex, "form": "10-Q", "fp": "Q2", "fy": 2026, "filed": "2026-01-20"},
                    {"start": "2025-07-01", "end": "2026-03-31", "val": q1_capex + q2_capex + q3_capex, "form": "10-Q", "fp": "Q3", "fy": 2026, "filed": "2026-04-20"},
                ]),
            }
        }
    }

    ttm = _build_ttm_row(frames, 0.21, sec_company_facts=facts)

    assert ttm is not None
    assert ttm["ttm_validation"]["status"] == "date_sequence_only"
    assert ttm["ttm_validation"]["sec_quarterly_reconciled"] is False


def test_ttm_builder_validates_all_four_discrete_quarters_against_complete_sec_fiscal_identities() -> None:
    frames = _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    for key in ("income_quarterly", "cash_flow_quarterly", "balance_quarterly"):
        frames[key]["period"] = ["Q4", "Q1", "Q2", "Q3"]

    ttm = _build_ttm_row(frames, 0.21, sec_company_facts=_complete_sec_rolling_ttm_facts(frames))

    assert ttm is not None
    assert ttm["ttm_validation"]["status"] == "validated"
    assert ttm["ttm_validation"]["period_basis"] == "discrete_reconciled_to_sec_ytd"
    assert ttm["ttm_validation"]["sec_quarterly_reconciled"] is True
    assert {check["metric"] for check in ttm["ttm_validation"]["sec_quarterly_checks"]} == {
        "revenue",
        "interest_expense",
        "diluted_shares",
        "cash_from_operations",
        "capital_expenditures",
        "stock_based_compensation",
    }
    assert len(ttm["ttm_validation"]["sec_quarterly_checks"]) == 24
    assert {check["period"] for check in ttm["ttm_validation"]["sec_quarterly_checks"]} == {
        "Q1",
        "Q2",
        "Q3",
        "Q4",
    }

    points = {point["metric"]: point for point in _ttm_data_points(ttm)}
    assert "sec:companyfacts:income" in points["financials.ttm.revenue"]["source_ids"]
    assert "sec:companyfacts:income" in points["financials.ttm.fcff"]["source_ids"]
    assert "sec:companyfacts:cash-flow" in points["financials.ttm.fcff"]["source_ids"]
    assert "sec:companyfacts:income" in points["financials.ttm.fcff_after_sbc"]["source_ids"]
    assert "sec:companyfacts:cash-flow" in points["financials.ttm.fcff_after_sbc"]["source_ids"]
    assert "sec:companyfacts:income" in points["financials.ttm.diluted_shares"]["source_ids"]
    assert "sec:companyfacts:income" not in points["financials.ttm.net_income"]["source_ids"]


@pytest.mark.parametrize("corrupt_period", ["Q3", "Q4"])
def test_ttm_builder_rejects_corrupt_provider_quarter_even_when_other_sec_identities_match(
    corrupt_period: str,
) -> None:
    frames = _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    for key in ("income_quarterly", "cash_flow_quarterly", "balance_quarterly"):
        frames[key]["period"] = ["Q4", "Q1", "Q2", "Q3"]
    sec_facts = _complete_sec_rolling_ttm_facts(frames)
    period_index = {"Q4": 0, "Q1": 1, "Q2": 2, "Q3": 3}[corrupt_period]
    frames["income_quarterly"].loc[period_index, "revenue"] *= 1.5

    ttm = _build_ttm_row(frames, 0.21, sec_company_facts=sec_facts)

    assert ttm is not None
    assert ttm["ttm_validation"]["status"] == "date_sequence_only"
    assert ttm["ttm_validation"]["sec_quarterly_reconciled"] is False
    assert any(
        check["metric"] == "revenue"
        and check["period"] == corrupt_period
        and check["passed"] is False
        for check in ttm["ttm_validation"]["sec_quarterly_checks"]
    )


@pytest.mark.parametrize(
    ("frame_key", "column"),
    [
        ("income_quarterly", "interestExpense"),
        ("cash_flow_quarterly", "stockBasedCompensation"),
        ("income_quarterly", "weightedAverageShsOutDil"),
    ],
)
def test_sec_ttm_cannot_validate_when_an_owner_fcff_per_share_driver_is_corrupt(
    frame_key: str,
    column: str,
) -> None:
    frames = _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    for key in ("income_quarterly", "cash_flow_quarterly", "balance_quarterly"):
        frames[key]["period"] = ["Q4", "Q1", "Q2", "Q3"]
    sec_facts = _complete_sec_rolling_ttm_facts(frames)
    frames[frame_key].loc[3, column] *= 100.0

    ttm = _build_ttm_row(frames, 0.21, sec_company_facts=sec_facts)

    assert ttm is not None
    assert ttm["ttm_validation"]["status"] == "date_sequence_only"
    assert ttm["ttm_validation"]["sec_quarterly_reconciled"] is False
    assert any(
        check["period"] == "Q3" and check["passed"] is False
        for check in ttm["ttm_validation"]["sec_quarterly_checks"]
        if check["metric"] in {"interest_expense", "stock_based_compensation", "diluted_shares"}
    )


def test_ttm_builder_rejects_incoherent_fiscal_period_sequence_before_sec_reconciliation() -> None:
    frames = _quarterly_ttm_frames(["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"])
    sec_facts = _complete_sec_rolling_ttm_facts(frames)
    for key in ("income_quarterly", "cash_flow_quarterly", "balance_quarterly"):
        frames[key]["period"] = ["Q4", "Q1", "Q3", "Q2"]

    ttm = _build_ttm_row(frames, 0.21, sec_company_facts=sec_facts)

    assert ttm is not None
    assert ttm["ttm_validation"]["status"] == "date_sequence_only"
    assert ttm["ttm_validation"]["sec_quarterly_reconciled"] is False


def test_cash_and_short_term_investments_are_reconciled_without_double_counting() -> None:
    frames = {
        "income": pd.DataFrame([{"date": "2025-12-31", "revenue": 100.0}]),
        "cash_flow": pd.DataFrame([{"date": "2025-12-31", "netCashProvidedByOperatingActivities": 20.0, "capitalExpenditure": -5.0}]),
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-12-31",
                    "cashAndCashEquivalents": 20.0,
                    "cashAndShortTermInvestments": 35.0,
                    "totalDebt": 10.0,
                    "totalStockholdersEquity": 80.0,
                    "totalAssets": 120.0,
                }
            ]
        ),
    }

    row = _normalize_financials(frames, 0.21)[0]

    assert row["cash"] == 20.0
    assert row["non_operating_investments"] == 15.0
    assert row["cash_includes_short_term_investments"] is False
    assert row["cash_investment_reconciliation_passed"] is True


def test_negative_interest_expense_sign_is_not_converted_with_abs() -> None:
    frames = {
        "income": pd.DataFrame(
            [
                {
                    "date": "2025-12-31",
                    "revenue": 1_000.0,
                    "operatingIncome": 200.0,
                    "incomeBeforeTax": 180.0,
                    "incomeTaxExpense": 37.8,
                    "interestExpense": -20.0,
                }
            ]
        ),
        "cash_flow": pd.DataFrame(
            [
                {
                    "date": "2025-12-31",
                    "netCashProvidedByOperatingActivities": 160.0,
                    "capitalExpenditure": -20.0,
                    "stockBasedCompensation": 10.0,
                }
            ]
        ),
        "balance": pd.DataFrame([{"date": "2025-12-31", "cashAndCashEquivalents": 100.0}]),
    }

    row = _normalize_financials(frames, 0.21)[0]

    assert row["free_cash_flow"] == 140.0
    assert row["interest_expense_sign_ambiguous"] is True
    assert row["fcff"] is None
    assert row["fcff_after_sbc"] is None


def test_capital_lease_is_deducted_only_when_total_debt_excludes_it() -> None:
    base_frames = {
        "income": pd.DataFrame([{"date": "2025-12-31", "revenue": 100.0}]),
        "cash_flow": pd.DataFrame([{"date": "2025-12-31", "netCashProvidedByOperatingActivities": 20.0, "capitalExpenditure": -5.0}]),
    }
    excluded = {
        **base_frames,
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-12-31",
                    "shortTermDebt": 10.0,
                    "longTermDebt": 20.0,
                    "totalDebt": 30.0,
                    "capitalLeaseObligations": 5.0,
                }
            ]
        ),
    }
    included = {
        **base_frames,
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-12-31",
                    "shortTermDebt": 10.0,
                    "longTermDebt": 20.0,
                    "totalDebt": 35.0,
                    "capitalLeaseObligations": 5.0,
                }
            ]
        ),
    }

    excluded_row = _normalize_financials(excluded, 0.21)[0]
    included_row = _normalize_financials(included, 0.21)[0]

    assert excluded_row["lease_liabilities_not_in_debt"] == 5.0
    assert excluded_row["lease_debt_reconciliation"] == "excluded_from_total_debt"
    assert included_row["lease_liabilities_not_in_debt"] == 0.0
    assert included_row["lease_debt_reconciliation"] == "included_in_total_debt"


def test_gross_pension_liabilities_are_not_mislabeled_as_an_unfunded_deficit() -> None:
    frames = {
        "income": pd.DataFrame([{"date": "2025-12-31", "revenue": 100.0}]),
        "cash_flow": pd.DataFrame([{"date": "2025-12-31", "netCashProvidedByOperatingActivities": 20.0, "capitalExpenditure": -5.0}]),
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-12-31",
                    "pensionLiabilities": 50.0,
                }
            ]
        ),
    }

    row = _normalize_financials(frames, 0.21)[0]

    assert row["unfunded_pension_liability"] is None


def test_financial_statement_families_cannot_silently_mix_currencies() -> None:
    frames = {
        "income": pd.DataFrame([{"date": "2026-03-31", "reportedCurrency": "USD", "revenue": 100.0}]),
        "cash_flow": pd.DataFrame(
            [
                {
                    "date": "2026-03-31",
                    "reportedCurrency": "EUR",
                    "netCashProvidedByOperatingActivities": 20.0,
                    "capitalExpenditure": -5.0,
                }
            ]
        ),
        "balance": pd.DataFrame(
            [
                {
                    "date": "2026-03-31",
                    "reportedCurrency": "GBP",
                    "cashAndCashEquivalents": 10.0,
                    "totalDebt": 5.0,
                    "totalStockholdersEquity": 50.0,
                }
            ]
        ),
    }

    rows = _normalize_financials(frames, 0.21)

    assert rows[0]["reported_currency"] is None
    assert rows[0]["reported_currencies"] == ["EUR", "GBP", "USD"]
    assert rows[0]["currency_mismatch"] is True


def test_normalized_financials_preserve_non_calendar_fiscal_metadata() -> None:
    frames = {
        "income": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "calendarYear": 2025,
                    "period": "FY",
                    "revenue": 100.0,
                }
            ]
        ),
        "cash_flow": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": "2024",
                    "calendarYear": "2025",
                    "period": "fy",
                    "netCashProvidedByOperatingActivities": 20.0,
                    "capitalExpenditure": -5.0,
                }
            ]
        ),
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "calendarYear": 2025,
                    "period": "FY",
                    "cashAndCashEquivalents": 10.0,
                    "totalDebt": 5.0,
                    "totalStockholdersEquity": 50.0,
                }
            ]
        ),
    }

    rows = _normalize_financials(frames, 0.21)
    normalized_history, validation = _normalize_annual_history(rows)

    assert rows[0]["fiscal_year"] == 2024
    assert rows[0]["calendar_year"] == 2025
    assert rows[0]["period"] == "FY"
    assert rows[0]["fiscal_metadata_mismatch"] is False
    assert validation["passed"] is True
    assert normalized_history[0]["fiscal_year"] == 2024


def test_conflicting_statement_fiscal_metadata_fails_closed() -> None:
    frames = {
        "income": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "period": "FY",
                    "revenue": 100.0,
                }
            ]
        ),
        "cash_flow": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2025,
                    "period": "FY",
                    "netCashProvidedByOperatingActivities": 20.0,
                    "capitalExpenditure": -5.0,
                }
            ]
        ),
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "period": "Q4",
                    "cashAndCashEquivalents": 10.0,
                    "totalDebt": 5.0,
                    "totalStockholdersEquity": 50.0,
                }
            ]
        ),
    }

    rows = _normalize_financials(frames, 0.21)
    _, validation = _normalize_annual_history(rows)

    assert rows[0]["fiscal_year"] is None
    assert rows[0]["fiscal_years"] == [2024, 2025]
    assert rows[0]["period"] is None
    assert rows[0]["periods"] == ["FY", "Q4"]
    assert rows[0]["fiscal_metadata_mismatch"] is True
    assert validation["passed"] is False
    assert validation["conflicting_fiscal_metadata_rows"] == ["2025-01-31"]


def test_two_fiscal_years_ending_in_one_calendar_year_do_not_collapse() -> None:
    dates_and_years = [("2025-01-31", 2024), ("2025-12-31", 2025)]
    frames = {
        "income": pd.DataFrame(
            [
                {"date": date, "fiscalYear": fiscal_year, "period": "FY", "revenue": revenue}
                for (date, fiscal_year), revenue in zip(dates_and_years, (100.0, 120.0))
            ]
        ),
        "cash_flow": pd.DataFrame(
            [
                {
                    "date": date,
                    "fiscalYear": fiscal_year,
                    "period": "FY",
                    "netCashProvidedByOperatingActivities": cfo,
                    "capitalExpenditure": -5.0,
                }
                for (date, fiscal_year), cfo in zip(dates_and_years, (20.0, 24.0))
            ]
        ),
        "balance": pd.DataFrame(
            [
                {
                    "date": date,
                    "fiscalYear": fiscal_year,
                    "period": "FY",
                    "cashAndCashEquivalents": 10.0,
                    "totalDebt": 5.0,
                    "totalStockholdersEquity": equity,
                }
                for (date, fiscal_year), equity in zip(dates_and_years, (50.0, 60.0))
            ]
        ),
    }

    normalized_history, validation = _normalize_annual_history(_normalize_financials(frames, 0.21))

    assert validation["passed"] is True
    assert validation["unique_years"] == 2
    assert [row["fiscal_year"] for row in normalized_history] == [2024, 2025]


def test_explicit_quarter_cannot_enter_annual_history() -> None:
    frames = {
        "income": pd.DataFrame([{"date": "2025-03-31", "fiscalYear": 2025, "period": "Q1", "revenue": 25.0}]),
        "cash_flow": pd.DataFrame(
            [
                {
                    "date": "2025-03-31",
                    "fiscalYear": 2025,
                    "period": "Q1",
                    "netCashProvidedByOperatingActivities": 5.0,
                    "capitalExpenditure": -1.0,
                }
            ]
        ),
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-03-31",
                    "fiscalYear": 2025,
                    "period": "Q1",
                    "cashAndCashEquivalents": 10.0,
                    "totalDebt": 5.0,
                    "totalStockholdersEquity": 50.0,
                }
            ]
        ),
    }

    _, validation = _normalize_annual_history(_normalize_financials(frames, 0.21))

    assert validation["passed"] is False
    assert validation["non_annual_period_rows"] == [{"date": "2025-03-31", "period": "Q1"}]


def test_same_date_statement_conflicts_fail_closed_before_annual_history() -> None:
    frames = {
        "income": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "period": "FY",
                    "reportedCurrency": "USD",
                    "revenue": 100.0,
                },
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2025,
                    "period": "FY",
                    "reportedCurrency": "EUR",
                    "revenue": 120.0,
                },
            ]
        ),
        "cash_flow": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "period": "FY",
                    "reportedCurrency": "USD",
                    "netCashProvidedByOperatingActivities": 20.0,
                    "capitalExpenditure": -5.0,
                }
            ]
        ),
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "period": "FY",
                    "reportedCurrency": "USD",
                    "cashAndCashEquivalents": 10.0,
                    "totalDebt": 5.0,
                    "totalStockholdersEquity": 50.0,
                }
            ]
        ),
    }

    rows = _normalize_financials(frames, 0.21)
    reversed_frames = {**frames, "income": frames["income"].iloc[::-1].reset_index(drop=True)}
    reversed_rows = _normalize_financials(reversed_frames, 0.21)
    _, validation = _normalize_annual_history(rows)

    assert rows[0]["statement_duplicate_mismatch"] is True
    assert rows[0]["statement_duplicate_conflicts"]["income"] == [
        "fiscal_year",
        "income_currency",
        "revenue",
    ]
    assert reversed_rows[0]["statement_duplicate_conflicts"] == rows[0]["statement_duplicate_conflicts"]
    assert reversed_rows[0]["fiscal_year"] == rows[0]["fiscal_year"]
    assert reversed_rows[0]["revenue"] == rows[0]["revenue"] is None
    assert validation["passed"] is False
    assert validation["conflicting_statement_duplicate_rows"] == ["2025-01-31"]


def test_identical_same_date_statement_duplicates_collapse_safely() -> None:
    income_row = {
        "date": "2025-01-31",
        "fiscalYear": 2024,
        "period": "FY",
        "reportedCurrency": "USD",
        "revenue": 100.0,
    }
    frames = {
        "income": pd.DataFrame([income_row, dict(income_row)]),
        "cash_flow": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "period": "FY",
                    "reportedCurrency": "USD",
                    "netCashProvidedByOperatingActivities": 20.0,
                    "capitalExpenditure": -5.0,
                }
            ]
        ),
        "balance": pd.DataFrame(
            [
                {
                    "date": "2025-01-31",
                    "fiscalYear": 2024,
                    "period": "FY",
                    "reportedCurrency": "USD",
                    "cashAndCashEquivalents": 10.0,
                    "totalDebt": 5.0,
                    "totalStockholdersEquity": 50.0,
                }
            ]
        ),
    }

    rows = _normalize_financials(frames, 0.21)
    _, validation = _normalize_annual_history(rows)

    assert len(rows) == 1
    assert rows[0]["statement_duplicate_mismatch"] is False
    assert rows[0]["statement_duplicate_counts"]["income"] == 2
    assert validation["passed"] is True


def _sec_annual_facts(values: dict[int, float], *, unit: str = "USD") -> dict:
    return {
        "units": {
            unit: [
                {
                    "end": f"{year}-12-31",
                    "fy": year,
                    "fp": "FY",
                    "form": "10-K",
                    "filed": f"{year + 1}-02-15",
                    "val": value,
                }
                for year, value in values.items()
            ]
        }
    }


class SECCompanyFactsFallbackClient(MockSECClient):
    def get_company_facts(self, symbol: str) -> dict:
        return {
            "facts": {
                "us-gaap": {
                    "RevenueFromContractWithCustomerExcludingAssessedTax": _sec_annual_facts({2021: 1000.0, 2022: 1120.0, 2023: 1280.0, 2024: 1500.0}),
                    "GrossProfit": _sec_annual_facts({2021: 500.0, 2022: 570.0, 2023: 660.0, 2024: 795.0}),
                    "CostOfRevenue": _sec_annual_facts({2021: 500.0, 2022: 550.0, 2023: 620.0, 2024: 705.0}),
                    "OperatingIncomeLoss": _sec_annual_facts({2021: 220.0, 2022: 250.0, 2023: 300.0, 2024: 375.0}),
                    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest": _sec_annual_facts(
                        {2021: 210.0, 2022: 240.0, 2023: 290.0, 2024: 360.0}
                    ),
                    "IncomeTaxExpenseBenefit": _sec_annual_facts({2021: 42.0, 2022: 48.0, 2023: 58.0, 2024: 72.0}),
                    "NetIncomeLoss": _sec_annual_facts({2021: 168.0, 2022: 192.0, 2023: 232.0, 2024: 288.0}),
                    "WeightedAverageNumberOfDilutedSharesOutstanding": _sec_annual_facts(
                        {2021: 10.0, 2022: 10.1, 2023: 10.2, 2024: 10.0},
                        unit="shares",
                    ),
                    "NetCashProvidedByUsedInOperatingActivities": _sec_annual_facts({2021: 210.0, 2022: 250.0, 2023: 310.0, 2024: 390.0}),
                    "PaymentsToAcquirePropertyPlantAndEquipment": _sec_annual_facts({2021: 60.0, 2022: 65.0, 2023: 70.0, 2024: 80.0}),
                    "DepreciationDepletionAndAmortization": _sec_annual_facts({2021: 60.0, 2022: 65.0, 2023: 70.0, 2024: 80.0}),
                    "ShareBasedCompensation": _sec_annual_facts({2021: 20.0, 2022: 22.0, 2023: 24.0, 2024: 26.0}),
                    "CashAndCashEquivalentsAtCarryingValue": _sec_annual_facts({2021: 120.0, 2022: 140.0, 2023: 170.0, 2024: 220.0}),
                    "LongTermDebtAndFinanceLeaseObligationsCurrent": _sec_annual_facts({2021: 30.0, 2022: 35.0, 2023: 40.0, 2024: 45.0}),
                    "LongTermDebtAndFinanceLeaseObligationsNoncurrent": _sec_annual_facts({2021: 150.0, 2022: 150.0, 2023: 150.0, 2024: 155.0}),
                    "StockholdersEquity": _sec_annual_facts({2021: 900.0, 2022: 980.0, 2023: 1070.0, 2024: 1180.0}),
                    "Assets": _sec_annual_facts({2021: 1250.0, 2022: 1360.0, 2023: 1480.0, 2024: 1600.0}),
                }
            }
        }


class MismatchedSECClient(MockSECClient):
    def get_company_facts(self, symbol: str) -> dict:
        payload = super().get_company_facts(symbol)
        units = payload["facts"]["us-gaap"]["RevenueFromContractWithCustomerExcludingAssessedTax"]["units"]["USD"]
        units[-1]["val"] = 9_999.0
        return payload


class FakeFinalLLMClient:
    def __init__(self) -> None:
        self.calls = 0
        self.payloads: list[dict] = []

    def complete(self, payload: dict, config: object) -> str:
        self.calls += 1
        self.payloads.append(payload)
        return (
            '{"executive_judgment":"Evidence-backed final synthesis completed.",'
            '"strongest_points":["DCF and reverse DCF were already calculated."],'
            '"red_team":["Do not underwrite claims beyond the audit."],'
            '"open_questions":["Which filing fact should be checked next?"],'
            '"memo_patch":"Keep conviction gated on evidence coverage."}'
        )


class SplitDebtFMPClient(MockFMPClient):
    def get_balance_sheet_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame(
            [
                {
                    "date": "2021-12-31",
                    "cashAndCashEquivalents": 120.0,
                    "shortTermDebt": 30.0,
                    "longTermDebt": 150.0,
                    "totalStockholdersEquity": 900.0,
                    "totalAssets": 1250.0,
                },
                {
                    "date": "2022-12-31",
                    "cashAndCashEquivalents": 140.0,
                    "shortTermDebt": 35.0,
                    "longTermDebt": 150.0,
                    "totalStockholdersEquity": 980.0,
                    "totalAssets": 1360.0,
                },
                {
                    "date": "2023-12-31",
                    "cashAndCashEquivalents": 170.0,
                    "shortTermDebt": 40.0,
                    "longTermDebt": 150.0,
                    "totalStockholdersEquity": 1070.0,
                    "totalAssets": 1480.0,
                },
                {
                    "date": "2024-12-31",
                    "cashAndCashEquivalents": 220.0,
                    "shortTermDebt": 45.0,
                    "longTermDebt": 155.0,
                    "totalStockholdersEquity": 1180.0,
                    "totalAssets": 1600.0,
                },
            ]
        )


class LeakyErrorFMPClient(MockFMPClient):
    def get_profile(self, symbol: str) -> dict:
        raise RuntimeError("403 Client Error for url: https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=live_secret_key")

    def get_income_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame()

    def get_cash_flow_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame()

    def get_balance_sheet_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        return pd.DataFrame()


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


def test_model_xlsx_is_withheld_even_when_valuation_is_decision_ready_until_headline_formulas_reconcile() -> None:
    valuation = {
        "model_version": "institutional_valuation_v3",
        "available": True,
        "status": "decision_ready",
        "primary_method": "forward_fcff_dcf",
        "cash_flow_basis": "FCFF",
        "currency": "USD",
        "current_price": 10.0,
        "market_data_as_of": "2026-07-14",
        "financial_data_as_of": "2026-06-30",
        "range": {"low": 8.0, "central": 12.0, "high": 16.0},
        "selected_value": 12.0,
        "reliability": {"usable": True, "status": "high", "score": 0.95},
        "price_validation": {"usable": True, "status": "validated"},
        "cost_of_capital": {"wacc": 0.10},
        "scenarios": [
            {
                "name": "base",
                "method": "forward_fcff_dcf",
                "assumptions": {"discount_rate": 0.10, "terminal_growth": 0.02},
                "forecast": [
                    {"year": 1, "date": "2027", "revenue_growth": 0.05, "revenue": 105.0, "cash_flow": 10.5},
                ],
                "intrinsic_value_per_share": 12.0,
            }
        ],
        "reverse_dcf": {},
        "multiples": {},
    }
    model = _build_model_xlsx(
        ticker="EXM",
        company_profile={"name": "Example", "currency": "USD"},
        rows=[{"date": "2025-12-31", "revenue": 100.0, "diluted_shares": 10.0, "cash": 5.0, "total_debt": 2.0}],
        ttm_row=None,
        assumptions={},
        valuation=valuation,
        sources={"records": [], "data_points": [], "coverage": {}, "agent_outputs": {}},
        audit={"status": "pass", "findings": [], "coverage": {}},
    )

    assert model is None


def test_sec_prefers_total_intangibles_over_the_finite_lived_subset() -> None:
    company_facts = {
        "facts": {
            "us-gaap": {
                "Goodwill": _sec_annual_facts({2025: 10.0}),
                "FiniteLivedIntangibleAssetsNet": _sec_annual_facts({2025: 20.0}),
                "IntangibleAssetsNetExcludingGoodwill": _sec_annual_facts({2025: 30.0}),
            }
        }
    }

    frames, _ = _sec_company_facts_frames(company_facts)

    assert frames["balance"].iloc[-1]["goodwillAndIntangibleAssets"] == 40.0


def test_sec_derives_only_the_unfunded_part_of_a_defined_benefit_plan() -> None:
    company_facts = {
        "facts": {
            "us-gaap": {
                "DefinedBenefitPlanBenefitObligation": _sec_annual_facts({2025: 197_000_000.0}),
                "DefinedBenefitPlanFairValueOfPlanAssets": _sec_annual_facts({2025: 276_000_000.0}),
            }
        }
    }

    frames, covered = _sec_company_facts_frames(company_facts)
    balance = frames["balance"]

    assert balance.iloc[0]["unfundedPensionLiability"] == 0.0
    assert balance.iloc[0]["unfundedPensionLiabilityBasis"] == "benefit_obligation_less_plan_assets"
    assert "unfundedPensionLiability" in covered["balance"]


def test_sec_quarterly_balance_facts_are_isolated_from_the_annual_statement_series() -> None:
    company_facts = {
        "facts": {
            "us-gaap": {
                "Assets": {
                    "units": {
                        "USD": [
                            {
                                "end": "2025-12-31",
                                "fy": 2025,
                                "fp": "FY",
                                "form": "10-K",
                                "filed": "2026-02-20",
                                "val": 1_000_000_000.0,
                            },
                            {
                                "end": "2026-03-31",
                                "fy": 2026,
                                "fp": "Q1",
                                "form": "10-Q",
                                "filed": "2026-05-01",
                                "val": 1_100_000_000.0,
                            },
                        ]
                    }
                },
                "DefinedBenefitPlanBenefitObligation": {
                    "units": {
                        "USD": [
                            {
                                "end": "2026-03-31",
                                "fy": 2026,
                                "fp": "Q1",
                                "form": "10-Q",
                                "filed": "2026-05-01",
                                "val": 250_000_000.0,
                            }
                        ]
                    }
                },
                "DefinedBenefitPlanFairValueOfPlanAssets": {
                    "units": {
                        "USD": [
                            {
                                "end": "2026-03-31",
                                "fy": 2026,
                                "fp": "Q1",
                                "form": "10-Q",
                                "filed": "2026-05-01",
                                "val": 200_000_000.0,
                            }
                        ]
                    }
                },
            }
        }
    }

    frames, _ = _sec_company_facts_frames(company_facts)

    assert frames["balance"]["date"].tolist() == ["2025-12-31"]
    assert frames["balance"].iloc[-1]["totalAssets"] == 1_000_000_000.0
    assert "unfundedPensionLiability" not in frames["balance"].columns
    assert frames["balance_enrichment"].iloc[-1]["date"] == "2026-03-31"
    assert frames["balance_enrichment"].iloc[-1]["unfundedPensionLiability"] == 50_000_000.0


def test_sec_pension_fact_enriches_each_missing_fmp_balance_frame_with_provenance() -> None:
    sec_frames, _ = _sec_company_facts_frames(
        {
            "facts": {
                "us-gaap": {
                    "DefinedBenefitPlanBenefitObligation": _sec_annual_facts({2025: 197_000_000.0}),
                    "DefinedBenefitPlanFairValueOfPlanAssets": _sec_annual_facts({2025: 276_000_000.0}),
                }
            }
        }
    )
    frames = {
        "balance": pd.DataFrame([{"date": "2025-12-31", "totalAssets": 1_000_000_000.0}]),
        "balance_quarterly": pd.DataFrame([{"date": "2026-03-31", "totalAssets": 1_100_000_000.0}]),
        "balance_ttm": pd.DataFrame([{"date": "2026-03-31", "totalAssets": 1_100_000_000.0}]),
    }

    enrichments = _enrich_balance_frames_with_sec(frames, sec_frames)

    assert len(enrichments) == 3
    for frame_key in ("balance", "balance_quarterly", "balance_ttm"):
        row = frames[frame_key].iloc[-1]
        assert row["unfundedPensionLiability"] == 0.0
        assert row["unfundedPensionLiabilityBasis"] == "benefit_obligation_less_plan_assets"
        assert row["unfundedPensionLiabilityAsOf"] == "2025-12-31"
        assert row["unfundedPensionLiabilitySourceId"] == "sec:companyfacts:balance"


def test_download_builder_does_not_offer_xlsx_when_artifact_policy_withholds_it(monkeypatch) -> None:
    monkeypatch.setattr(
        "meta_alpha_allocator.research.equity_research_os._build_model_xlsx",
        lambda **_: b"should-not-be-offered",
    )
    bundle = {
        "ticker": "EXM",
        "report_markdown": "# EXM",
        "sources": {},
        "audit": {},
        "assumptions_yml": "assumptions:\n",
        "assumptions": {},
        "financials": {"annual": [], "ttm": None},
        "company_profile": {},
        "valuation": {},
        "artifacts": {"model_xlsx": False},
    }

    downloads = _build_downloads(bundle)

    assert not any(artifact["filename"].endswith(".xlsx") for artifact in downloads)


def test_equity_research_bundle_uses_sources_and_formulas() -> None:
    bundle = build_equity_research_bundle("EXM", mode="full", fmp_client=MockFMPClient(), sec_client=MockSECClient())

    assert bundle["ok"] is True
    assert bundle["ticker"] == "EXM"
    assert bundle["valuation"]["available"] is True
    assert bundle["financials"]["annual"][-1]["free_cash_flow"] == 310.0
    assert bundle["financials"]["ratios"]["latest_revenue"] == 1500.0
    assert bundle["audit"]["status"] == "needs_attention"
    assert len(bundle["sources"]["records"]) >= 9
    assert bundle["sources"]["coverage"]["status"] == "pass"
    assert bundle["sources"]["coverage"]["score"] == 100
    assert bundle["sources"]["coverage"]["covered_expected_metrics"] == bundle["sources"]["coverage"]["expected_metrics"]
    assert bundle["sources"]["coverage"]["statement_authority"] == "FMP normalized statements reconciled to SEC Company Facts/XBRL"
    assert bundle["sources"]["coverage"]["statement_reconciliation_status"] == "reconciled"
    assert bundle["sources"]["coverage"]["statement_reconciliation_pass_ratio"] == 1.0
    assert bundle["sources"]["coverage"]["xbrl_statement_facts_available"] is True
    assert "sec:companyfacts:income" in bundle["sources"]["coverage"]["statement_crosscheck_source_ids"]
    assert bundle["audit"]["coverage"]["score"] == bundle["sources"]["coverage"]["score"]
    assert bundle["checklist_score"]["evidence"] == 100
    assert bundle["filings"]["recent"][0]["form"] == "10-K"
    assert any(point["source_id"] == "sec:submissions" for point in bundle["sources"]["data_points"])
    assert any(point["claim_tag"] == "calculated_metric" for point in bundle["sources"]["data_points"])
    assert any(point["metric"].startswith("financials.annual.2024-12-31.") for point in bundle["sources"]["data_points"])
    assert bundle["agents"]["mode"] == "local_first_multi_agent_desk"
    assert bundle["agents"]["execution"]["specialist_llm_calls"] == 0
    assert bundle["agents"]["execution"]["final_orchestrator_max_calls"] == 1
    assert bundle["agents"]["final_orchestrator"]["status"] == "disabled"
    assert {agent["id"] for agent in bundle["agents"]["agents"]}.issuperset(
        {"orchestrator_agent", "valuation_agent", "risk_agent", "red_team_agent", "editor_auditor_agent"}
    )
    assert all(claim["claim_tag"] in {"sourced_fact", "calculated_metric", "assumption", "interpretation", "uncertainty"} for claim in bundle["agents"]["claims"])
    assert any(claim["agent_id"] == "red_team_agent" for claim in bundle["sources"]["claims"])
    assert "authoritative filings" in bundle["report_markdown"].lower()
    assert "analyst desk" in bundle["report_markdown"].lower()
    assert "evidence coverage: 100%" in bundle["report_markdown"].lower()
    assert "reverse dcf" in bundle["report_markdown"].lower()
    assert "valuation status: not_decision_ready" in bundle["report_markdown"].lower()
    assert "valuation range: withheld" in bundle["report_markdown"].lower()
    assert "central estimate: withheld" in bundle["report_markdown"].lower()
    assert "base dcf value/share" not in bundle["report_markdown"].lower()
    valuation_agent = next(agent for agent in bundle["agents"]["agents"] if agent["id"] == "valuation_agent")
    assert valuation_agent["status"] == "blocked"
    assert not any(claim["id"] == "valuation.base_value" for claim in valuation_agent["claims"])
    assert bundle["artifacts"]["model_xlsx"] is False
    download_names = {artifact["filename"] for artifact in bundle["downloads"]}
    assert {
        "EXM_report.md",
        "EXM_sources.json",
        "EXM_audit.json",
        "EXM_assumptions.yml",
    }.issubset(download_names)
    assert not any(name.endswith(".xlsx") for name in download_names)


def test_equity_research_bundle_allows_one_final_llm_orchestrator_call() -> None:
    llm_client = FakeFinalLLMClient()
    bundle = build_equity_research_bundle(
        "EXM",
        mode="full",
        fmp_client=MockFMPClient(),
        sec_client=MockSECClient(),
        llm_client=llm_client,
        enable_llm=True,
    )

    final = bundle["agents"]["final_orchestrator"]
    assert llm_client.calls == 0
    assert final["status"] == "withheld"
    assert final["reason"] == "valuation_not_decision_ready"
    assert final["call_budget"] == {"max_calls": 1, "actual_calls": 0}
    assert final["analysis"]["executive_judgment"] == ""
    assert "Evidence-backed final synthesis completed." not in bundle["report_markdown"]
    assert "Final LLM orchestrator" not in bundle["report_markdown"]


def test_equity_research_bundle_sums_short_and_long_debt_when_total_debt_missing() -> None:
    bundle = build_equity_research_bundle("EXM", mode="full", fmp_client=SplitDebtFMPClient(), sec_client=MockSECClient())

    latest = bundle["financials"]["annual"][-1]
    assert latest["short_term_debt"] == 45.0
    assert latest["long_term_debt"] == 155.0
    assert latest["total_debt"] == 200.0
    assert bundle["financials"]["ratios"]["net_debt"] == -20.0


def test_equity_research_bundle_uses_sec_companyfacts_when_fmp_statements_missing() -> None:
    bundle = build_equity_research_bundle(
        "EXM",
        mode="full",
        fmp_client=EmptyStatementFMPClient(),
        sec_client=SECCompanyFactsFallbackClient(),
    )

    assert bundle["ok"] is True
    assert len(bundle["financials"]["annual"]) == 4
    latest = bundle["financials"]["annual"][-1]
    assert latest["revenue"] == 1500.0
    assert latest["short_term_debt"] == 45.0
    assert latest["long_term_debt"] == 155.0
    assert latest["total_debt"] == 200.0
    assert latest["free_cash_flow"] == 310.0
    assert bundle["valuation"]["available"] is False
    assert bundle["valuation"]["status"] == "not_decision_ready"
    assert bundle["artifacts"]["model_xlsx"] is False
    assert bundle["sources"]["coverage"]["statement_source_provider"] == "sec-edgar"
    assert bundle["sources"]["coverage"]["statement_authority"] == "SEC Company Facts/XBRL normalized statements"
    assert bundle["sources"]["coverage"]["xbrl_statement_facts_available"] is True
    assert any(source["source_id"] == "sec:companyfacts:income" and source["status"] == "ok" for source in bundle["sources"]["records"])
    assert any(point["source_id"] == "sec:companyfacts:income" for point in bundle["sources"]["data_points"])
    assert any(point["source_id"] == "sec:companyfacts:balance" and point["metric"].endswith(".total_debt") for point in bundle["sources"]["data_points"])
    assert any("SEC Company Facts/XBRL" in claim["text"] for claim in bundle["agents"]["claims"])


def test_sec_statement_availability_does_not_count_as_a_crosscheck_without_numeric_tie_out() -> None:
    bundle = build_equity_research_bundle(
        "EXM",
        mode="quick",
        fmp_client=MockFMPClient(),
        sec_client=MismatchedSECClient(),
    )

    assert bundle["sources"]["coverage"]["statement_reconciliation_status"] == "mismatch"
    assert "available but not reconciled" in bundle["sources"]["coverage"]["statement_authority"]
    assert any(finding["code"] == "filing_reconciliation_mismatch" for finding in bundle["audit"]["findings"])
    assert bundle["valuation"]["status"] == "not_decision_ready"
    assert bundle["valuation"]["reliability"]["usable"] is False
    assert bundle["valuation"]["range"] == {"low": None, "central": None, "high": None}
    assert bundle["valuation"].get("market_requirements", {}).get("available") is not True


def test_latest_debt_mismatch_is_critical_even_when_the_aggregate_pass_ratio_is_high() -> None:
    primary = [{
        "date": "2025-12-31",
        "revenue": 1_000.0,
        "net_income": 100.0,
        "cash_from_operations": 180.0,
        "capital_expenditures": -80.0,
        "cash": 100.0,
        "total_debt": 100.0,
        "total_equity": 500.0,
        "diluted_shares": 10.0,
    }]
    sec = [{**primary[0], "total_debt": 1_000.0}]

    reconciliation = _reconcile_statement_rows(primary, sec)

    assert reconciliation["pass_ratio"] == pytest.approx(0.875)
    assert reconciliation["passed"] is False
    assert reconciliation["status"] == "mismatch"
    assert any(item["metric"] == "total_debt" for item in reconciliation["critical_failures"])


def test_equity_research_bundle_refuses_to_invent_without_provider() -> None:
    bundle = build_equity_research_bundle("AAPL", fmp_client=None)

    assert bundle["ok"] is True
    assert bundle["valuation"]["available"] is False
    assert bundle["audit"]["status"] == "needs_attention"
    assert bundle["sources"]["coverage"]["status"] == "needs_attention"
    assert bundle["sources"]["coverage"]["score"] < 60
    assert "latest_revenue" in bundle["sources"]["coverage"]["missing_expected_metrics"]
    assert bundle["sources"]["coverage"]["statement_authority"] == "No source-backed normalized statements"
    assert bundle["checklist_score"]["evidence"] == bundle["sources"]["coverage"]["score"]
    assert bundle["sources"]["records"][0]["status"] == "unavailable"
    assert any(source["provider"] == "sec-edgar" and source["status"] == "unavailable" for source in bundle["sources"]["records"])
    assert bundle["agents"]["agents"]
    assert any(agent["status"] in {"blocked", "needs_attention"} for agent in bundle["agents"]["agents"])


def test_equity_research_source_errors_redact_provider_secrets() -> None:
    bundle = build_equity_research_bundle("AAPL", fmp_client=LeakyErrorFMPClient())
    errors = [str(source.get("error") or "") for source in bundle["sources"]["records"]]

    assert any("apikey=[redacted]" in error for error in errors)
    assert all("live_secret_key" not in error for error in errors)
    assert bundle["artifacts"]["model_xlsx"] is False
    assert not any(artifact["filename"].endswith(".xlsx") for artifact in bundle["downloads"])


def test_micron_like_company_builds_a_cycle_but_withholds_it_when_sec_numbers_conflict() -> None:
    bundle = build_equity_research_bundle(
        "MU",
        mode="quick",
        fmp_client=MicronLikeFMPClient(),
        sec_client=MockSECClient(),
    )

    valuation = bundle["valuation"]
    ttm = bundle["financials"]["ttm"]

    assert ttm["date"] == "2026-05-28"
    assert math.isclose(ttm["revenue"], 90_274_000_000.0, rel_tol=1e-9)
    assert math.isclose(ttm["cash_from_operations"], 51_432_000_000.0, rel_tol=1e-9)
    assert math.isclose(ttm["capital_expenditures"], 25_260_000_000.0, rel_tol=1e-9)
    assert math.isclose(ttm["free_cash_flow"], 26_172_000_000.0, rel_tol=1e-9)
    assert ttm["ttm_validation"]["status"] == "validated"
    assert ttm["ttm_validation"]["provider_ttm_reconciled"] is True
    assert valuation["model_version"] == "institutional_valuation_v3"
    assert valuation["archetype"] == "capacity_cycle"
    assert valuation["primary_method"] is None
    assert valuation["available"] is False
    assert valuation["reliability"]["usable"] is False
    assert valuation["status"] == "not_decision_ready"
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["cycle_revenue_normalization"]["current_level_supported"] is False
    assert valuation["cycle_revenue_normalization"]["current_to_historical_peak"] > 1.75
    assert valuation["estimate_validation"]["growth_usage"]["material_clips"] == 1
    assert valuation["estimate_validation"]["used_in_valuation"] is False
    assert valuation["cycle_normalization"]["coverage_complete"] is True
    assert valuation["cycle_revenue_normalization"]["coverage_complete"] is True
    assert any(item["margin"] < 0 for item in valuation["cycle_normalization"]["observations"])
    assert valuation["market_data_as_of"] == RECENT_MARKET_DATE
    assert valuation["price_validation"]["status"] == "provider_reconciled"
    assert valuation["market_requirements"]["available"] is False
    assert valuation["market_requirements"]["status"] == "blocked_statement_reconciliation"
    ttm_revenue_point = next(point for point in bundle["sources"]["data_points"] if point["metric"] == "financials.ttm.revenue")
    assert ttm_revenue_point["source_ids"] == ["fmp:income:quarterly", "fmp:income:ttm"]
    assert ttm_revenue_point["quarter_dates"] == ["2025-08-28", "2025-11-27", "2026-02-26", "2026-05-28"]
    latest_revenue_point = next(point for point in bundle["sources"]["data_points"] if point["metric"] == "latest_revenue")
    assert latest_revenue_point["claim_tag"] == "calculated_metric"
    assert latest_revenue_point["source_id"] is None
    evidence_metrics = {point["metric"] for point in bundle["sources"]["data_points"]}
    assert "reverse_dcf_status" not in evidence_metrics
    missing_evidence_metrics = set(bundle["sources"]["coverage"]["missing_expected_metrics"])
    assert {
        "wacc",
        "terminal_growth",
        "reverse_dcf_status",
        "valuation_range_central",
        "ev_to_sales",
        "price_to_fcf",
    }.issubset(missing_evidence_metrics)


def test_micron_like_provider_only_ttm_cannot_return_price_requirements() -> None:
    profile, frames, _ = _load_fmp_payloads("MU", None, MicronLikeFMPClient())
    rows = _normalize_financials(frames, DEFAULT_TAX_RATE)
    ttm = _build_ttm_row(frames, DEFAULT_TAX_RATE)
    assumptions = _derive_assumptions(rows, ttm)
    rows = _normalize_financials(frames, assumptions["normalized_tax_rate"])
    ttm = _build_ttm_row(frames, assumptions["normalized_tax_rate"])
    assumptions = _derive_assumptions(rows, ttm)

    valuation = _build_valuation("MU", rows, ttm, profile, frames, assumptions)

    assert valuation["status"] == "not_decision_ready"
    assert valuation["available"] is False
    assert valuation["cycle_revenue_normalization"]["structural_break"] is False
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["structural_scale_bridge"]["passed"] is False
    assert valuation["structural_scale_bridge"]["scale_inputs_reconciled"] is False
    assert "ttm_scale_inputs_reconciliation" in valuation["structural_scale_bridge"]["missing"]
    assert valuation["market_requirements"]["available"] is False


def test_current_basic_shares_are_reconciled_as_a_control_not_a_diluted_denominator_replacement() -> None:
    bundle = build_equity_research_bundle(
        "MU",
        mode="quick",
        fmp_client=MicronShareCountFMPClient(1_119_000_000.0),
        sec_client=None,
    )

    valuation = bundle["valuation"]
    reconciliation = valuation["share_denominator_reconciliation"]

    assert valuation["status"] == "not_decision_ready"
    assert reconciliation["status"] == "reconciled"
    assert reconciliation["passed"] is True
    assert reconciliation["current_basic_outstanding_shares"] == 1_119_000_000.0
    assert reconciliation["ttm_weighted_average_diluted_shares"] == 1_134_000_000.0
    assert reconciliation["valuation_denominator_replaced"] is False
    assert reconciliation["maximum_relative_difference"] == 0.20
    assert bundle["financials"]["ttm"]["ttm_validation"]["share_denominator_reconciliation"]["passed"] is True
    source = next(item for item in bundle["sources"]["records"] if item["source_id"] == "fmp:shares-float")
    assert source["status"] == "ok"
    point = next(item for item in bundle["sources"]["data_points"] if item["metric"] == "current_basic_outstanding_shares")
    assert point["normalized_value"] == 1_119_000_000.0
    assert point["source_id"] == "fmp:shares-float"


def test_material_current_share_count_mismatch_withholds_the_valuation_range() -> None:
    bundle = build_equity_research_bundle(
        "MU",
        mode="quick",
        fmp_client=MicronShareCountFMPClient(1_650_000_000.0),
        sec_client=None,
    )

    valuation = bundle["valuation"]
    reconciliation = valuation["share_denominator_reconciliation"]

    assert reconciliation["status"] == "material_mismatch"
    assert reconciliation["passed"] is False
    assert reconciliation["relative_difference"] > 0.20
    assert valuation["status"] == "not_decision_ready"
    assert valuation["range"] == {"low": None, "central": None, "high": None}
    assert valuation["reliability"]["usable"] is False
    assert "current_share_count_reconciliation" in valuation["reliability"]["decision_ready_blockers"]
    assert valuation["reliability"]["readiness_gates"]["current_share_count_reconciliation"]["passed"] is False
    assert any(item["code"] == "share_denominator_mismatch" for item in bundle["audit"]["findings"])


def test_share_mismatch_clears_an_otherwise_available_valuation() -> None:
    valuation = {
        "available": True,
        "status": "research_grade",
        "primary_method": "forward_fcff_dcf",
        "cash_flow_basis": "operating_FCFF_after_SBC",
        "range": {"low": 80.0, "central": 100.0, "high": 125.0},
        "selected_value": 100.0,
        "scenarios": [{"name": "base", "intrinsic_value_per_share": 100.0}],
        "methods": [{"key": "forward_fcff_dcf", "value_per_share": 100.0}],
        "reverse_dcf": {"available": True, "weight": 0},
        "market_requirements": {
            "available": True,
            "status": "solved",
            "implied_revenue_cagr": 0.25,
            "reference_price": 100.0,
        },
        "reliability": {"usable": True, "readiness_gates": {}, "decision_ready_blockers": []},
    }
    reconciliation = {
        "status": "material_mismatch",
        "passed": False,
        "required": True,
        "relative_difference": 0.25,
        "maximum_relative_difference": 0.20,
    }

    gated = _apply_current_share_count_gate(valuation, reconciliation)

    assert gated["available"] is False
    assert gated["range"] == {"low": None, "central": None, "high": None}
    assert gated["selected_value"] is None
    assert gated["scenarios"] == []
    assert gated["methods"] == []
    assert gated["reverse_dcf"]["available"] is False
    assert gated["market_requirements"]["available"] is False
    assert gated["market_requirements"]["status"] == "blocked_share_denominator"
    assert gated["market_requirements"]["implied_revenue_cagr"] is None


def test_required_sec_mismatch_clears_an_otherwise_available_valuation() -> None:
    valuation = {
        "available": True,
        "status": "research_grade",
        "primary_method": "forward_fcff_dcf",
        "cash_flow_basis": "operating_FCFF_after_SBC",
        "range": {"low": 80.0, "central": 100.0, "high": 125.0},
        "selected_value": 100.0,
        "scenarios": [{"name": "base", "intrinsic_value_per_share": 100.0}],
        "methods": [{"key": "forward_fcff_dcf", "value_per_share": 100.0}],
        "reverse_dcf": {"available": True, "weight": 0},
        "reliability": {"usable": True, "readiness_gates": {}, "decision_ready_blockers": []},
    }

    gated = _apply_statement_reconciliation_gate(
        valuation,
        {"status": "mismatch", "passed": False, "pass_ratio": 0.40},
        required=True,
    )

    assert gated["available"] is False
    assert gated["range"] == {"low": None, "central": None, "high": None}
    assert gated["selected_value"] is None
    assert gated["scenarios"] == []
    assert gated["methods"] == []
    assert gated["reverse_dcf"]["available"] is False


def test_current_share_count_at_the_control_boundary_is_not_silently_accepted() -> None:
    bundle = build_equity_research_bundle(
        "MU",
        mode="quick",
        fmp_client=MicronShareCountFMPClient(1_360_800_000.0),
        sec_client=None,
    )

    reconciliation = bundle["valuation"]["share_denominator_reconciliation"]
    assert reconciliation["relative_difference"] == pytest.approx(0.20)
    assert reconciliation["status"] == "material_mismatch"
    assert bundle["valuation"]["status"] == "not_decision_ready"
    assert bundle["valuation"]["range"] == {"low": None, "central": None, "high": None}


@pytest.mark.parametrize(
    ("snapshot", "expected_status"),
    [
        ({"symbol": "EXM", "outstandingShares": 10.0}, "undated_or_invalid"),
        ({"symbol": "EXM", "outstandingShares": 10.0, "as_of": "2010-01-01"}, "stale"),
        ({"symbol": "EXM", "outstandingShares": 12.49, "as_of": RECENT_MARKET_DATE}, "material_mismatch"),
    ],
)
def test_current_share_control_rejects_undated_stale_and_asymmetric_scale_gaps(
    snapshot: dict,
    expected_status: str,
) -> None:
    reconciliation = _reconcile_current_share_count(
        "EXM",
        {"diluted_shares": 10.0},
        snapshot,
    )

    assert reconciliation["status"] == expected_status
    assert reconciliation["passed"] is False


class NegativeFcfFMPClient(MockFMPClient):
    def get_cash_flow_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        if period == "quarter":
            return pd.DataFrame()
        return pd.DataFrame(
            [
                {"date": "2022-12-31", "netCashProvidedByOperatingActivities": -300.0, "capitalExpenditure": -200.0},
                {"date": "2023-12-31", "netCashProvidedByOperatingActivities": -180.0, "capitalExpenditure": -120.0},
                {"date": "2024-12-31", "netCashProvidedByOperatingActivities": -120.0, "capitalExpenditure": -80.0},
            ]
        )


def test_negative_fcf_company_does_not_invent_a_positive_terminal_margin() -> None:
    bundle = build_equity_research_bundle("EARLY", fmp_client=NegativeFcfFMPClient(), sec_client=MockSECClient())

    assert bundle["assumptions"]["historical_cash_flow_margin_reference"] is None
    assert bundle["valuation"]["status"] == "not_decision_ready"
    assert bundle["valuation"]["reliability"]["usable"] is False
    assert bundle["valuation"]["range"] == {"low": None, "central": None, "high": None}
    assert bundle["valuation"]["scenarios"] == []


class BankFMPClient(MockFMPClient):
    def get_profile(self, symbol: str) -> dict:
        profile = super().get_profile(symbol)
        return {
            **profile,
            "companyName": "Example National Bank",
            "sector": "Financial Services",
            "industry": "Banks - Diversified",
        }

    def get_balance_sheet_statements(self, symbol: str, *, period: str, limit: int) -> pd.DataFrame:
        frame = super().get_balance_sheet_statements(symbol, period=period, limit=limit).copy()
        if not frame.empty:
            for column in (
                "shortTermInvestments",
                "goodwillAndIntangibleAssets",
                "preferredStock",
                "minorityInterest",
                "unfundedPensionLiability",
                "leaseLiabilitiesNotInDebt",
            ):
                frame[column] = 0.0
        return frame


def test_bank_routes_to_residual_income_instead_of_enterprise_fcff_dcf() -> None:
    bundle = build_equity_research_bundle("BANK", fmp_client=BankFMPClient(), sec_client=MockSECClient())
    valuation = bundle["valuation"]

    assert valuation["model_version"] == "institutional_valuation_v3"
    assert valuation["archetype"] == "financial"
    assert valuation["primary_method"] == "residual_income"
    assert all(scenario["method"] == "residual_income" for scenario in valuation["scenarios"])
    assert valuation["status"] != "decision_ready"
    assert valuation["reliability"]["readiness_gates"]["method_agreement"]["passed"] is False
    assert valuation["multiples"]["enterprise_value"] is None
    assert valuation["multiples"]["ev_to_sales"] is None
    assert valuation["multiples"]["price_to_book"] is not None


def test_evidence_pass_does_not_upgrade_a_legacy_or_weak_valuation_to_decision_ready() -> None:
    bundle = build_equity_research_bundle("EXM", mode="quick", fmp_client=MockFMPClient(), sec_client=MockSECClient())

    assert bundle["sources"]["coverage"]["status"] == "pass"
    assert bundle["audit"]["status"] == "needs_attention"
    assert bundle["valuation"]["status"] != "decision_ready"
    assert bundle["valuation"]["reliability"]["status"] in {"medium", "low", "blocked"}
