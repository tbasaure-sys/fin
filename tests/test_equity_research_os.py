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


def test_equity_research_bundle_uses_sources_and_formulas() -> None:
    bundle = build_equity_research_bundle("EXM", mode="full", fmp_client=MockFMPClient(), sec_client=MockSECClient())

    assert bundle["ok"] is True
    assert bundle["ticker"] == "EXM"
    assert bundle["valuation"]["available"] is True
    assert bundle["financials"]["annual"][-1]["free_cash_flow"] == 310.0
    assert bundle["financials"]["ratios"]["latest_revenue"] == 1500.0
    assert bundle["audit"]["status"] == "pass"
    assert len(bundle["sources"]["records"]) == 9
    assert bundle["sources"]["coverage"]["status"] == "pass"
    assert bundle["sources"]["coverage"]["score"] == 100
    assert bundle["sources"]["coverage"]["covered_expected_metrics"] == bundle["sources"]["coverage"]["expected_metrics"]
    assert bundle["sources"]["coverage"]["statement_authority"] == "FMP normalized statements with SEC Company Facts/XBRL cross-check"
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
    assert "agent research desk" in bundle["report_markdown"].lower()
    assert "evidence coverage: 100%" in bundle["report_markdown"].lower()
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
        "Evidence Points",
        "Coverage",
        "Agent Claims",
    }.issubset(set(workbook.sheetnames))
    assert str(workbook["DCF"]["B11"].value).startswith("=")
    assert workbook["Agent Claims"].max_row > 2


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
    assert llm_client.calls == 1
    assert final["status"] == "ok"
    assert final["call_budget"] == {"max_calls": 1, "actual_calls": 1}
    assert final["analysis"]["executive_judgment"] == "Evidence-backed final synthesis completed."
    assert llm_client.payloads[0]["valuation"]["available"] is True
    assert "Final LLM orchestrator" in bundle["report_markdown"]


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
    assert bundle["valuation"]["available"] is True
    assert bundle["artifacts"]["model_xlsx"] is True
    assert bundle["sources"]["coverage"]["statement_source_provider"] == "sec-edgar"
    assert bundle["sources"]["coverage"]["statement_authority"] == "SEC Company Facts/XBRL normalized statements"
    assert bundle["sources"]["coverage"]["xbrl_statement_facts_available"] is True
    assert any(source["source_id"] == "sec:companyfacts:income" and source["status"] == "ok" for source in bundle["sources"]["records"])
    assert any(point["source_id"] == "sec:companyfacts:income" for point in bundle["sources"]["data_points"])
    assert any(point["source_id"] == "sec:companyfacts:balance" and point["metric"].endswith(".total_debt") for point in bundle["sources"]["data_points"])
    assert any("SEC Company Facts/XBRL" in claim["text"] for claim in bundle["agents"]["claims"])


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
