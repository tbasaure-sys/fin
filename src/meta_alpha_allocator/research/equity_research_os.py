from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
import json
import math
from pathlib import Path
from typing import Any

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
import pandas as pd

from ..data.fmp_client import FMPClient
from ..data.sec_edgar_client import SECEdgarClient
from .equity_research_agents import build_agent_outputs, run_final_orchestrator_llm


DEFAULT_TAX_RATE = 0.21
DEFAULT_WACC = 0.09
DEFAULT_TERMINAL_GROWTH = 0.03


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_ticker(value: str) -> str:
    ticker = "".join(ch for ch in str(value or "").upper().strip() if ch.isalnum() or ch in {".", "-"})
    return ticker[:16]


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except TypeError:
        pass
    if isinstance(value, str):
        value = value.replace(",", "").strip()
        if not value:
            return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def _ratio(numerator: Any, denominator: Any) -> float | None:
    n = _safe_float(numerator)
    d = _safe_float(denominator)
    if n is None or d in (None, 0):
        return None
    return n / d


def _fmt_currency(value: float | None) -> str:
    if value is None:
        return "n/a"
    abs_value = abs(value)
    if abs_value >= 1_000_000_000:
        return f"${value / 1_000_000_000:,.1f}B"
    if abs_value >= 1_000_000:
        return f"${value / 1_000_000:,.1f}M"
    return f"${value:,.0f}"


def _fmt_pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def _first_existing(row: pd.Series, names: list[str]) -> Any:
    for name in names:
        if name in row and row.get(name) is not None:
            value = row.get(name)
            try:
                if pd.isna(value):
                    continue
            except TypeError:
                pass
            return value
    return None


def _sum_existing(row: pd.Series, names: list[str]) -> float | None:
    values = [_safe_float(_first_existing(row, [name])) for name in names if name in row]
    values = [value for value in values if value is not None]
    return sum(values) if values else None


def calculate_revenue_cagr(start_revenue: float, end_revenue: float, years: int) -> float | None:
    if years <= 0 or start_revenue <= 0 or end_revenue <= 0:
        return None
    return (end_revenue / start_revenue) ** (1 / years) - 1


@dataclass(frozen=True)
class DcfScenarioInput:
    latest_revenue: float
    latest_fcf_margin: float
    cash: float
    debt: float
    diluted_shares: float
    revenue_growth: float
    terminal_fcf_margin: float
    wacc: float
    terminal_growth: float
    years: int = 5


def build_dcf_scenario(name: str, payload: DcfScenarioInput) -> dict[str, Any]:
    if payload.diluted_shares <= 0:
        raise ValueError("diluted_shares must be positive")
    if payload.latest_revenue <= 0:
        raise ValueError("latest_revenue must be positive")
    if payload.wacc <= payload.terminal_growth:
        raise ValueError("wacc must be greater than terminal growth")

    forecast_rows: list[dict[str, Any]] = []
    revenue = payload.latest_revenue
    pv_fcff = 0.0
    for year in range(1, payload.years + 1):
        revenue *= 1 + payload.revenue_growth
        fcff = revenue * payload.terminal_fcf_margin
        discount_factor = (1 + payload.wacc) ** year
        present_value = fcff / discount_factor
        pv_fcff += present_value
        forecast_rows.append(
            {
                "year": year,
                "revenue": revenue,
                "free_cash_flow": fcff,
                "discount_factor": discount_factor,
                "present_value": present_value,
            }
        )

    terminal_fcff = forecast_rows[-1]["free_cash_flow"] * (1 + payload.terminal_growth)
    terminal_value = terminal_fcff / (payload.wacc - payload.terminal_growth)
    pv_terminal_value = terminal_value / ((1 + payload.wacc) ** payload.years)
    enterprise_value = pv_fcff + pv_terminal_value
    equity_value = enterprise_value + payload.cash - payload.debt
    intrinsic_value_per_share = equity_value / payload.diluted_shares

    return {
        "name": name,
        "assumptions": {
            "revenue_growth": payload.revenue_growth,
            "terminal_fcf_margin": payload.terminal_fcf_margin,
            "wacc": payload.wacc,
            "terminal_growth": payload.terminal_growth,
            "years": payload.years,
        },
        "forecast": forecast_rows,
        "pv_fcff": pv_fcff,
        "pv_terminal_value": pv_terminal_value,
        "enterprise_value": enterprise_value,
        "equity_value": equity_value,
        "intrinsic_value_per_share": intrinsic_value_per_share,
    }


def reverse_dcf_implied_growth(
    *,
    current_price: float,
    latest_revenue: float,
    fcf_margin: float,
    cash: float,
    debt: float,
    diluted_shares: float,
    wacc: float = DEFAULT_WACC,
    terminal_growth: float = DEFAULT_TERMINAL_GROWTH,
    years: int = 5,
) -> dict[str, Any]:
    if current_price <= 0 or latest_revenue <= 0 or diluted_shares <= 0 or fcf_margin <= 0:
        return {"available": False, "reason": "missing current price, revenue, shares, or positive FCF margin"}

    def value_at(growth: float) -> float:
        scenario = build_dcf_scenario(
            "reverse",
            DcfScenarioInput(
                latest_revenue=latest_revenue,
                latest_fcf_margin=fcf_margin,
                cash=cash,
                debt=debt,
                diluted_shares=diluted_shares,
                revenue_growth=growth,
                terminal_fcf_margin=fcf_margin,
                wacc=wacc,
                terminal_growth=terminal_growth,
                years=years,
            ),
        )
        return float(scenario["intrinsic_value_per_share"])

    low = -0.15
    high = 0.35
    low_value = value_at(low)
    high_value = value_at(high)
    status = "solved"
    if current_price < low_value:
        status = "below_range"
        solved = low
    elif current_price > high_value:
        status = "above_range"
        solved = high
    else:
        solved = 0.0
        for _ in range(80):
            mid = (low + high) / 2
            mid_value = value_at(mid)
            if mid_value < current_price:
                low = mid
            else:
                high = mid
            solved = (low + high) / 2

    return {
        "available": True,
        "status": status,
        "implied_revenue_cagr": solved,
        "current_price": current_price,
        "value_at_floor": low_value,
        "value_at_ceiling": high_value,
        "assumptions": {
            "terminal_fcf_margin": fcf_margin,
            "wacc": wacc,
            "terminal_growth": terminal_growth,
            "years": years,
        },
    }


def _source_record(source_id: str, provider: str, endpoint: str, status: str, **extra: Any) -> dict[str, Any]:
    return {
        "source_id": source_id,
        "provider": provider,
        "endpoint_or_filing": endpoint,
        "retrieved_at": _now_iso(),
        "status": status,
        **extra,
    }


def _data_point(metric: str, value: Any, tag: str, source_id: str | None = None, formula: str | None = None) -> dict[str, Any]:
    return {
        "metric": metric,
        "raw_value": value,
        "normalized_value": value,
        "claim_tag": tag,
        "source_id": source_id,
        "formula": formula,
    }


EXPECTED_EVIDENCE_METRICS = [
    "company_profile",
    "latest_revenue",
    "latest_diluted_shares",
    "latest_free_cash_flow",
    "revenue_cagr_5y",
    "gross_margin",
    "operating_margin",
    "fcf_margin",
    "roic",
    "net_debt",
    "base_fcf_margin",
    "wacc",
    "terminal_growth",
    "current_price",
    "base_intrinsic_value_per_share",
    "reverse_dcf_implied_revenue_cagr",
    "ev_to_sales",
    "price_to_fcf",
    "latest_sec_filing",
]

DEFAULT_STATEMENT_SOURCE_IDS = {
    "income": "fmp:income:annual",
    "cash_flow": "fmp:cash-flow:annual",
    "balance": "fmp:balance:annual",
}

SEC_STATEMENT_SOURCE_IDS = {
    "income": "sec:companyfacts:income",
    "cash_flow": "sec:companyfacts:cash-flow",
    "balance": "sec:companyfacts:balance",
}

SEC_ANNUAL_FORMS = {"10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"}

SEC_CONCEPTS = {
    "income": {
        "revenue": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
        "grossProfit": ["GrossProfit"],
        "costOfRevenue": ["CostOfRevenue", "CostOfGoodsAndServicesSold"],
        "operatingIncome": ["OperatingIncomeLoss"],
        "incomeBeforeTax": [
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
        ],
        "incomeTaxExpense": ["IncomeTaxExpenseBenefit"],
        "netIncome": ["NetIncomeLoss"],
        "weightedAverageShsOutDil": ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    },
    "cash_flow": {
        "netCashProvidedByOperatingActivities": [
            "NetCashProvidedByUsedInOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        ],
        "capitalExpenditure": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
        "depreciationAndAmortization": ["DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationExpense"],
        "stockBasedCompensation": ["ShareBasedCompensation"],
        "commonStockRepurchased": ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"],
    },
    "balance": {
        "cashAndCashEquivalents": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
        "totalDebt": ["LongTermDebtAndFinanceLeaseObligations", "LongTermDebt"],
        "shortTermDebt": ["LongTermDebtAndFinanceLeaseObligationsCurrent", "LongTermDebtCurrent", "ShortTermBorrowings", "ShortTermDebt"],
        "longTermDebt": ["LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebtNoncurrent"],
        "totalStockholdersEquity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
        "totalAssets": ["Assets"],
        "netReceivables": ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
        "inventory": ["InventoryNet"],
        "goodwillAndIntangibleAssets": ["GoodwillAndIntangibleAssetsNet"],
        "goodwill": ["Goodwill"],
        "intangibleAssets": ["FiniteLivedIntangibleAssetsNet", "IntangibleAssetsNetExcludingGoodwill"],
    },
}


def _has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, float) and math.isnan(value):
        return False
    if isinstance(value, str) and not value.strip():
        return False
    return True


def _financial_source_for_field(field: str, source_ids: dict[str, str] | None = None) -> str | None:
    source_ids = source_ids or DEFAULT_STATEMENT_SOURCE_IDS
    income_fields = {
        "revenue",
        "gross_profit",
        "cost_of_revenue",
        "operating_income",
        "pretax_income",
        "tax_expense",
        "net_income",
        "ebitda",
        "diluted_shares",
    }
    cash_flow_fields = {
        "cash_from_operations",
        "capital_expenditures",
        "depreciation_amortization",
        "stock_based_compensation",
        "common_stock_repurchased",
    }
    balance_fields = {
        "cash",
        "total_debt",
        "short_term_debt",
        "long_term_debt",
        "total_equity",
        "total_assets",
        "net_receivables",
        "inventory",
        "goodwill_and_intangibles",
    }
    if field in income_fields:
        return source_ids.get("income")
    if field in cash_flow_fields:
        return source_ids.get("cash_flow")
    if field in balance_fields:
        return source_ids.get("balance")
    return None


def _financial_formula_for_field(field: str) -> str | None:
    formulas = {
        "free_cash_flow": "cash_from_operations - abs(capital_expenditures)",
        "nopat": "operating_income * (1 - normalized_tax_rate)",
        "invested_capital": "total_debt + total_equity - cash",
        "gross_margin": "gross_profit / revenue",
        "operating_margin": "operating_income / revenue",
        "net_margin": "net_income / revenue",
        "fcf_margin": "free_cash_flow / revenue",
        "cash_conversion": "cash_from_operations / net_income",
        "sbc_as_pct_revenue": "stock_based_compensation / revenue",
        "sbc_as_pct_fcf": "stock_based_compensation / free_cash_flow",
        "roic": "NOPAT / average_invested_capital",
    }
    return formulas.get(field)


def _financial_data_points(rows: list[dict[str, Any]], source_ids: dict[str, str] | None = None) -> list[dict[str, Any]]:
    ledger: list[dict[str, Any]] = []
    for row in rows:
        period = row.get("fiscal_year") or row.get("date") or "unknown"
        for field, value in row.items():
            if field in {"date", "fiscal_year"} or not _has_value(value):
                continue
            source_id = _financial_source_for_field(field, source_ids)
            formula = _financial_formula_for_field(field)
            if source_id:
                ledger.append(_data_point(f"financials.annual.{period}.{field}", value, "sourced_fact", source_id))
            elif formula:
                ledger.append(_data_point(f"financials.annual.{period}.{field}", value, "calculated_metric", formula=formula))
    return ledger


def _valuation_data_points(valuation: dict[str, Any]) -> list[dict[str, Any]]:
    if not valuation.get("available"):
        return []
    points: list[dict[str, Any]] = []
    for scenario in valuation.get("scenarios", []):
        name = scenario.get("name") or "scenario"
        for key in ["intrinsic_value_per_share", "equity_value", "terminal_value", "pv_terminal_value"]:
            value = scenario.get(key)
            if _has_value(value):
                points.append(_data_point(f"valuation.scenario.{name}.{key}", value, "calculated_metric", formula="deterministic DCF scenario model"))
        for key, value in (scenario.get("assumptions") or {}).items():
            if _has_value(value):
                points.append(_data_point(f"valuation.scenario.{name}.assumption.{key}", value, "assumption", formula="scenario assumption"))
    reverse = valuation.get("reverse_dcf") or {}
    for key in ["implied_revenue_cagr", "current_price", "value_at_floor", "value_at_ceiling"]:
        value = reverse.get(key)
        if _has_value(value):
            tag = "sourced_fact" if key == "current_price" else "calculated_metric"
            points.append(
                _data_point(
                    f"valuation.reverse_dcf.{key}",
                    value,
                    tag,
                    "fmp:profile" if key == "current_price" else None,
                    None if key == "current_price" else "binary search for growth where DCF value equals current price",
                )
            )
    for key, value in (valuation.get("multiples") or {}).items():
        if _has_value(value):
            points.append(_data_point(f"valuation.multiples.{key}", value, "calculated_metric", formula=f"{key} deterministic multiple calculation"))
    return points


def _build_evidence_coverage(sources: list[dict[str, Any]], data_points: list[dict[str, Any]]) -> dict[str, Any]:
    source_status = {str(source.get("source_id")): source.get("status") for source in sources if source.get("source_id")}
    statement_source_ids = set(DEFAULT_STATEMENT_SOURCE_IDS.values()) | set(SEC_STATEMENT_SOURCE_IDS.values())
    source_backed = [
        point
        for point in data_points
        if point.get("claim_tag") == "sourced_fact" and point.get("source_id") and source_status.get(str(point.get("source_id"))) == "ok"
    ]
    sourced_missing = [
        point.get("metric")
        for point in data_points
        if point.get("claim_tag") == "sourced_fact"
        and (not point.get("source_id") or source_status.get(str(point.get("source_id"))) != "ok")
    ]
    formula_missing = [
        point.get("metric")
        for point in data_points
        if point.get("claim_tag") == "calculated_metric" and not point.get("formula")
    ]
    expected_present = {point.get("metric") for point in data_points if _has_value(point.get("normalized_value"))}
    missing_expected = [metric for metric in EXPECTED_EVIDENCE_METRICS if metric not in expected_present]
    covered_expected = len(EXPECTED_EVIDENCE_METRICS) - len(missing_expected)
    score = round((covered_expected / len(EXPECTED_EVIDENCE_METRICS)) * 100) if EXPECTED_EVIDENCE_METRICS else 0
    sec_metadata_ok = source_status.get("sec:submissions") == "ok"
    statement_sources = [
        source
        for source in sources
        if source.get("source_id") in statement_source_ids
        and source.get("status") == "ok"
        and int(source.get("row_count") or 0) > 0
    ]
    statement_providers = {str(source.get("provider")) for source in statement_sources if source.get("provider")}
    xbrl_statement_facts_available = "sec-edgar" in statement_providers
    if not statement_sources:
        statement_authority = "No source-backed normalized statements"
        statement_source_provider = None
    elif statement_providers == {"sec-edgar"}:
        statement_authority = "SEC Company Facts/XBRL normalized statements"
        statement_source_provider = "sec-edgar"
    elif "sec-edgar" in statement_providers:
        statement_authority = "Mixed FMP and SEC Company Facts normalized statements"
        statement_source_provider = "mixed"
    elif sec_metadata_ok:
        statement_authority = "FMP normalized statements; SEC metadata only"
        statement_source_provider = "fmp"
    else:
        statement_authority = "FMP normalized statements without SEC metadata cross-check"
        statement_source_provider = "fmp"
    status = "pass" if score >= 85 and not sourced_missing and not formula_missing else "partial"
    if score < 60 or sourced_missing:
        status = "needs_attention"
    return {
        "status": status,
        "score": score,
        "expected_metrics": len(EXPECTED_EVIDENCE_METRICS),
        "covered_expected_metrics": covered_expected,
        "missing_expected_metrics": missing_expected,
        "total_data_points": len(data_points),
        "source_backed_points": len(source_backed),
        "calculated_points": len([point for point in data_points if point.get("claim_tag") == "calculated_metric"]),
        "assumption_points": len([point for point in data_points if point.get("claim_tag") == "assumption"]),
        "interpretation_points": len([point for point in data_points if point.get("claim_tag") == "interpretation"]),
        "uncertainty_points": len([point for point in data_points if point.get("claim_tag") == "uncertainty"]),
        "sourced_points_missing_ok_source": sourced_missing,
        "calculated_points_missing_formula": formula_missing,
        "ok_source_records": len([source for source in sources if source.get("status") == "ok"]),
        "error_source_records": len([source for source in sources if source.get("status") == "error"]),
        "unavailable_source_records": len([source for source in sources if source.get("status") == "unavailable"]),
        "sec_metadata_available": sec_metadata_ok,
        "statement_source_provider": statement_source_provider,
        "statement_authority": statement_authority,
        "statement_source_ids": [str(source.get("source_id")) for source in statement_sources if source.get("source_id")],
        "xbrl_statement_facts_available": xbrl_statement_facts_available,
    }


def _load_fmp_payloads(ticker: str, paths: PathConfigLike, fmp_client: FMPClient | None) -> tuple[dict[str, Any], dict[str, pd.DataFrame], list[dict[str, Any]]]:
    sources: list[dict[str, Any]] = []
    frames = {
        "income": pd.DataFrame(),
        "cash_flow": pd.DataFrame(),
        "balance": pd.DataFrame(),
        "prices": pd.DataFrame(),
    }
    profile: dict[str, Any] = {}

    if fmp_client is None:
        sources.append(_source_record("fmp:client", "fmp", "env:FMP_API_KEY", "unavailable", error="FMP API key is not configured in this runtime."))
        return profile, frames, sources

    loaders = [
        ("profile", "fmp:profile", f"profile/{ticker}", lambda: fmp_client.get_profile(ticker)),
        (
            "income",
            "fmp:income:annual",
            f"income-statement/{ticker}?period=annual&limit=10",
            lambda: fmp_client.get_income_statements(ticker, period="annual", limit=10),
        ),
        (
            "cash_flow",
            "fmp:cash-flow:annual",
            f"cash-flow-statement/{ticker}?period=annual&limit=10",
            lambda: fmp_client.get_cash_flow_statements(ticker, period="annual", limit=10),
        ),
        (
            "balance",
            "fmp:balance:annual",
            f"balance-sheet-statement/{ticker}?period=annual&limit=10",
            lambda: fmp_client.get_balance_sheet_statements(ticker, period="annual", limit=10),
        ),
        (
            "prices",
            "fmp:prices",
            f"historical-price-eod/full?symbol={ticker}",
            lambda: fmp_client.get_historical_prices(ticker),
        ),
    ]

    for key, source_id, endpoint, loader in loaders:
        try:
            payload = loader()
            if key == "profile":
                profile = payload if isinstance(payload, dict) else {}
                sources.append(_source_record(source_id, "fmp", endpoint, "ok", row_count=1 if profile else 0))
            else:
                frame = payload if isinstance(payload, pd.DataFrame) else pd.DataFrame(payload)
                frames[key] = frame
                sources.append(_source_record(source_id, "fmp", endpoint, "ok", row_count=int(len(frame))))
        except Exception as exc:  # noqa: BLE001
            sources.append(_source_record(source_id, "fmp", endpoint, "error", error=str(exc)))

    return profile, frames, sources


def _load_sec_filings(ticker: str, sec_client: SECEdgarClient | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    source_id = "sec:submissions"
    endpoint = f"submissions/CIK{{resolved_from_{ticker}}}.json"
    if sec_client is None:
        return [], [
            _source_record(
                source_id,
                "sec-edgar",
                "env:SEC_USER_AGENT",
                "unavailable",
                error="SEC_USER_AGENT is not configured; EDGAR metadata was not requested.",
            )
        ]
    try:
        filings = sec_client.get_recent_filings(ticker)
        return filings, [_source_record(source_id, "sec-edgar", endpoint, "ok", row_count=len(filings))]
    except Exception as exc:  # noqa: BLE001
        return [], [_source_record(source_id, "sec-edgar", endpoint, "error", error=str(exc))]


def _sec_unit_priority(target: str) -> tuple[str, ...]:
    return ("shares",) if target == "weightedAverageShsOutDil" else ("USD",)


def _sec_us_gaap_facts(company_facts: dict[str, Any]) -> dict[str, Any]:
    facts = company_facts.get("facts") if isinstance(company_facts, dict) else {}
    us_gaap = facts.get("us-gaap") if isinstance(facts, dict) else {}
    return us_gaap if isinstance(us_gaap, dict) else {}


def _sec_concept_values_by_date(
    company_facts: dict[str, Any],
    concept_names: list[str],
    *,
    unit_priority: tuple[str, ...],
) -> dict[str, dict[str, Any]]:
    us_gaap = _sec_us_gaap_facts(company_facts)
    values: dict[str, dict[str, Any]] = {}
    for concept in concept_names:
        concept_payload = us_gaap.get(concept) or {}
        units = concept_payload.get("units") if isinstance(concept_payload, dict) else {}
        if not isinstance(units, dict):
            continue
        unit = next((candidate for candidate in unit_priority if candidate in units), None)
        if unit is None:
            continue
        for fact in units.get(unit) or []:
            if not isinstance(fact, dict):
                continue
            form = str(fact.get("form") or "").upper()
            if form not in SEC_ANNUAL_FORMS:
                continue
            fiscal_period = str(fact.get("fp") or "").upper()
            if fiscal_period and fiscal_period != "FY":
                continue
            end_date = str(fact.get("end") or "").strip()
            value = _safe_float(fact.get("val"))
            if not end_date or value is None:
                continue
            filed = str(fact.get("filed") or "")
            existing = values.get(end_date)
            if existing is None or (existing.get("concept") == concept and filed >= str(existing.get("filed") or "")):
                values[end_date] = {
                    "value": value,
                    "concept": concept,
                    "unit": unit,
                    "filed": filed,
                    "form": form,
                    "fy": fact.get("fy"),
                }
    return values


def _sec_company_facts_frames(company_facts: dict[str, Any]) -> tuple[dict[str, pd.DataFrame], dict[str, list[str]]]:
    frames: dict[str, pd.DataFrame] = {}
    targets_covered: dict[str, list[str]] = {}
    for statement_key, concept_map in SEC_CONCEPTS.items():
        rows_by_date: dict[str, dict[str, Any]] = {}
        covered: list[str] = []
        for target, concepts in concept_map.items():
            values_by_date = _sec_concept_values_by_date(
                company_facts,
                concepts,
                unit_priority=_sec_unit_priority(target),
            )
            if values_by_date:
                covered.append(target)
            for end_date, fact in values_by_date.items():
                rows_by_date.setdefault(end_date, {"date": end_date})
                rows_by_date[end_date][target] = fact["value"]
        if statement_key == "balance":
            for row in rows_by_date.values():
                if row.get("goodwillAndIntangibleAssets") is None:
                    goodwill = _safe_float(row.get("goodwill"))
                    intangible_assets = _safe_float(row.get("intangibleAssets"))
                    if goodwill is not None or intangible_assets is not None:
                        row["goodwillAndIntangibleAssets"] = (goodwill or 0.0) + (intangible_assets or 0.0)
                row.pop("goodwill", None)
                row.pop("intangibleAssets", None)
        frame = pd.DataFrame([rows_by_date[date] for date in sorted(rows_by_date)])
        frames[statement_key] = frame
        targets_covered[statement_key] = sorted(set(covered))
    return frames, targets_covered


def _load_sec_company_facts(ticker: str, sec_client: SECEdgarClient | None) -> tuple[dict[str, pd.DataFrame], list[dict[str, Any]]]:
    frames = {
        "income": pd.DataFrame(),
        "cash_flow": pd.DataFrame(),
        "balance": pd.DataFrame(),
    }
    endpoint = f"api/xbrl/companyfacts/CIK{{resolved_from_{ticker}}}.json"
    if sec_client is None:
        return frames, [
            _source_record(
                source_id,
                "sec-edgar",
                "env:SEC_USER_AGENT",
                "unavailable",
                error="SEC_USER_AGENT is not configured; XBRL company facts were not requested.",
            )
            for source_id in SEC_STATEMENT_SOURCE_IDS.values()
        ]
    try:
        company_facts = sec_client.get_company_facts(ticker)
        if not company_facts:
            return frames, [
                _source_record(source_id, "sec-edgar", endpoint, "unavailable", row_count=0, error="No SEC company facts payload was returned.")
                for source_id in SEC_STATEMENT_SOURCE_IDS.values()
            ]
        frames, targets_covered = _sec_company_facts_frames(company_facts)
        sources: list[dict[str, Any]] = []
        for statement_key, source_id in SEC_STATEMENT_SOURCE_IDS.items():
            frame = frames.get(statement_key, pd.DataFrame())
            status = "ok" if not frame.empty else "unavailable"
            sources.append(
                _source_record(
                    source_id,
                    "sec-edgar",
                    endpoint,
                    status,
                    row_count=int(len(frame)),
                    targets_covered=targets_covered.get(statement_key, []),
                    error=None if status == "ok" else "No annual SEC facts mapped to this normalized statement.",
                )
            )
        return frames, sources
    except Exception as exc:  # noqa: BLE001
        return frames, [
            _source_record(source_id, "sec-edgar", endpoint, "error", error=str(exc))
            for source_id in SEC_STATEMENT_SOURCE_IDS.values()
        ]


class PathConfigLike:
    cache_root: Path


def _normalize_financials(frames: dict[str, pd.DataFrame], tax_rate: float) -> list[dict[str, Any]]:
    income = frames["income"].copy()
    cash_flow = frames["cash_flow"].copy()
    balance = frames["balance"].copy()

    def project(frame: pd.DataFrame, fields: dict[str, list[str]]) -> pd.DataFrame:
        if frame.empty or "date" not in frame.columns:
            return pd.DataFrame(columns=["date", *fields.keys()])
        rows = []
        for _, raw in frame.iterrows():
            row = {"date": str(pd.to_datetime(raw.get("date")).date())}
            for target, names in fields.items():
                row[target] = _safe_float(_first_existing(raw, names))
            rows.append(row)
        return pd.DataFrame(rows)

    income_n = project(
        income,
        {
            "revenue": ["revenue"],
            "gross_profit": ["grossProfit", "gross_profit"],
            "cost_of_revenue": ["costOfRevenue", "cost_of_revenue"],
            "operating_income": ["operatingIncome", "operating_income"],
            "pretax_income": ["incomeBeforeTax", "income_before_tax"],
            "tax_expense": ["incomeTaxExpense", "income_tax_expense"],
            "net_income": ["netIncome", "net_income"],
            "ebitda": ["ebitda", "EBITDA"],
            "diluted_shares": ["weightedAverageShsOutDil", "weighted_average_shares_diluted"],
        },
    )
    cash_n = project(
        cash_flow,
        {
            "cash_from_operations": ["netCashProvidedByOperatingActivities", "operatingCashFlow", "cash_from_operations"],
            "capital_expenditures_raw": ["capitalExpenditure", "capital_expenditures"],
            "depreciation_amortization": ["depreciationAndAmortization", "depreciation_amortization"],
            "stock_based_compensation": ["stockBasedCompensation", "stock_based_compensation"],
            "common_stock_repurchased": ["commonStockRepurchased", "common_stock_repurchased"],
        },
    )
    balance_n = project(
        balance,
        {
            "cash": ["cashAndCashEquivalents", "cashAndShortTermInvestments", "cash"],
            "total_debt": ["totalDebt"],
            "short_term_debt": ["shortTermDebt", "short_term_debt"],
            "long_term_debt": ["longTermDebt", "long_term_debt"],
            "total_equity": ["totalStockholdersEquity", "total_equity"],
            "total_assets": ["totalAssets", "total_assets"],
            "net_receivables": ["netReceivables", "net_receivables"],
            "inventory": ["inventory"],
            "goodwill_and_intangibles": ["goodwillAndIntangibleAssets", "goodwill_and_intangibles"],
        },
    )

    merged = income_n.merge(cash_n, on="date", how="outer").merge(balance_n, on="date", how="outer")
    if merged.empty:
        return []
    merged = merged.sort_values("date")

    rows: list[dict[str, Any]] = []
    for _, row in merged.iterrows():
        capex_raw = _safe_float(row.get("capital_expenditures_raw"))
        capex = abs(capex_raw) if capex_raw is not None else None
        cfo = _safe_float(row.get("cash_from_operations"))
        revenue = _safe_float(row.get("revenue"))
        operating_income = _safe_float(row.get("operating_income"))
        tax_expense = _safe_float(row.get("tax_expense"))
        pretax = _safe_float(row.get("pretax_income"))
        row_tax_rate = _ratio(tax_expense, pretax)
        if row_tax_rate is None or row_tax_rate < 0 or row_tax_rate > 0.45:
            row_tax_rate = tax_rate
        debt = _safe_float(row.get("total_debt"))
        if debt is None:
            debt = _sum_existing(row, ["short_term_debt", "long_term_debt"])
        debt = debt or 0.0
        equity = _safe_float(row.get("total_equity")) or 0.0
        cash = _safe_float(row.get("cash")) or 0.0
        invested_capital = debt + equity - cash
        free_cash_flow = cfo - capex if cfo is not None and capex is not None else None
        nopat = operating_income * (1 - row_tax_rate) if operating_income is not None else None
        rows.append(
            {
                "date": row.get("date"),
                "revenue": revenue,
                "gross_profit": _safe_float(row.get("gross_profit")),
                "cost_of_revenue": _safe_float(row.get("cost_of_revenue")),
                "operating_income": operating_income,
                "net_income": _safe_float(row.get("net_income")),
                "ebitda": _safe_float(row.get("ebitda")),
                "cash_from_operations": cfo,
                "capital_expenditures": capex,
                "free_cash_flow": free_cash_flow,
                "depreciation_amortization": _safe_float(row.get("depreciation_amortization")),
                "stock_based_compensation": _safe_float(row.get("stock_based_compensation")),
                "common_stock_repurchased": _safe_float(row.get("common_stock_repurchased")),
                "cash": cash,
                "total_debt": debt,
                "short_term_debt": _safe_float(row.get("short_term_debt")),
                "long_term_debt": _safe_float(row.get("long_term_debt")),
                "total_equity": equity,
                "total_assets": _safe_float(row.get("total_assets")),
                "net_receivables": _safe_float(row.get("net_receivables")),
                "inventory": _safe_float(row.get("inventory")),
                "goodwill_and_intangibles": _safe_float(row.get("goodwill_and_intangibles")),
                "diluted_shares": _safe_float(row.get("diluted_shares")),
                "tax_rate": row_tax_rate,
                "nopat": nopat,
                "invested_capital": invested_capital,
                "gross_margin": _ratio(row.get("gross_profit"), revenue),
                "operating_margin": _ratio(operating_income, revenue),
                "net_margin": _ratio(row.get("net_income"), revenue),
                "fcf_margin": _ratio(free_cash_flow, revenue),
                "cash_conversion": _ratio(cfo, row.get("net_income")),
                "sbc_as_pct_revenue": _ratio(row.get("stock_based_compensation"), revenue),
                "sbc_as_pct_fcf": _ratio(row.get("stock_based_compensation"), free_cash_flow),
            }
        )

    for index, row in enumerate(rows):
        if index == 0:
            row["roic"] = None
            row["roiic"] = None
            continue
        previous = rows[index - 1]
        avg_ic = ((row.get("invested_capital") or 0) + (previous.get("invested_capital") or 0)) / 2
        row["roic"] = _ratio(row.get("nopat"), avg_ic)
        delta_nopat = (row.get("nopat") or 0) - (previous.get("nopat") or 0)
        delta_ic = (row.get("invested_capital") or 0) - (previous.get("invested_capital") or 0)
        row["roiic"] = _ratio(delta_nopat, delta_ic)

    return rows


def _latest(rows: list[dict[str, Any]], key: str) -> float | None:
    for row in reversed(rows):
        value = _safe_float(row.get(key))
        if value is not None:
            return value
    return None


def _growth_between(rows: list[dict[str, Any]], key: str, years: int) -> float | None:
    clean = [row for row in rows if _safe_float(row.get(key)) is not None and _safe_float(row.get(key)) > 0]
    if len(clean) < 2:
        return None
    lookback = min(years, len(clean) - 1)
    start = _safe_float(clean[-lookback - 1].get(key))
    end = _safe_float(clean[-1].get(key))
    return calculate_revenue_cagr(start or 0, end or 0, lookback)


def _derive_assumptions(rows: list[dict[str, Any]]) -> dict[str, Any]:
    tax_rates = [_safe_float(row.get("tax_rate")) for row in rows]
    tax_rates = [value for value in tax_rates if value is not None and 0 <= value <= 0.45]
    fcf_margins = [_safe_float(row.get("fcf_margin")) for row in rows]
    fcf_margins = [value for value in fcf_margins if value is not None and value > 0]
    latest_fcf_margin = _latest(rows, "fcf_margin")
    base_margin = latest_fcf_margin if latest_fcf_margin is not None and latest_fcf_margin > 0 else (pd.Series(fcf_margins).median() if fcf_margins else 0.08)

    return {
        "normalized_tax_rate": float(pd.Series(tax_rates).median()) if tax_rates else DEFAULT_TAX_RATE,
        "base_revenue_growth": _growth_between(rows, "revenue", 5) or 0.06,
        "base_fcf_margin": float(max(min(base_margin, 0.45), 0.02)),
        "wacc": DEFAULT_WACC,
        "terminal_growth": DEFAULT_TERMINAL_GROWTH,
        "forecast_years": 5,
        "source": "historical_median_or_default_when_data_missing",
    }


def _build_ratios(rows: list[dict[str, Any]]) -> dict[str, Any]:
    latest_revenue = _latest(rows, "revenue")
    latest_debt = _latest(rows, "total_debt") or 0.0
    latest_cash = _latest(rows, "cash") or 0.0
    latest_ebitda = _latest(rows, "ebitda")
    latest_shares = _latest(rows, "diluted_shares")
    first_shares = next((_safe_float(row.get("diluted_shares")) for row in rows if _safe_float(row.get("diluted_shares")) is not None), None)
    share_years = max(len([row for row in rows if _safe_float(row.get("diluted_shares")) is not None]) - 1, 0)

    return {
        "revenue_cagr_3y": _growth_between(rows, "revenue", 3),
        "revenue_cagr_5y": _growth_between(rows, "revenue", 5),
        "gross_margin": _latest(rows, "gross_margin"),
        "operating_margin": _latest(rows, "operating_margin"),
        "net_margin": _latest(rows, "net_margin"),
        "fcf_margin": _latest(rows, "fcf_margin"),
        "roic": _latest(rows, "roic"),
        "roiic": _latest(rows, "roiic"),
        "cash_conversion": _latest(rows, "cash_conversion"),
        "net_debt": latest_debt - latest_cash,
        "net_debt_to_ebitda": _ratio(latest_debt - latest_cash, latest_ebitda),
        "sbc_as_pct_revenue": _latest(rows, "sbc_as_pct_revenue"),
        "sbc_as_pct_fcf": _latest(rows, "sbc_as_pct_fcf"),
        "share_count_cagr": calculate_revenue_cagr(first_shares or 0, latest_shares or 0, share_years) if share_years else None,
        "latest_revenue": latest_revenue,
        "latest_fcf": _latest(rows, "free_cash_flow"),
        "latest_diluted_shares": latest_shares,
    }


def _quality_flags(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    flags: list[dict[str, Any]] = []
    latest = rows[-1] if rows else {}
    revenue_growth = _growth_between(rows, "revenue", 3)
    receivables_growth = _growth_between(rows, "net_receivables", 3)
    inventory_growth = _growth_between(rows, "inventory", 3)
    cogs_growth = _growth_between(rows, "cost_of_revenue", 3)
    share_growth = _growth_between(rows, "diluted_shares", 3)

    if receivables_growth is not None and revenue_growth is not None and receivables_growth > revenue_growth + 0.05:
        flags.append({"severity": "medium", "title": "Receivables growing faster than revenue", "metric": receivables_growth})
    if inventory_growth is not None and cogs_growth is not None and inventory_growth > cogs_growth + 0.05:
        flags.append({"severity": "medium", "title": "Inventory growing faster than COGS", "metric": inventory_growth})
    if (_safe_float(latest.get("cash_conversion")) or 0) < 0.8 and (_safe_float(latest.get("net_income")) or 0) > 0:
        flags.append({"severity": "high", "title": "Cash conversion below earnings quality threshold", "metric": latest.get("cash_conversion")})
    goodwill_intangibles = _ratio(latest.get("goodwill_and_intangibles"), latest.get("total_assets"))
    if goodwill_intangibles is not None and goodwill_intangibles > 0.4:
        flags.append({"severity": "medium", "title": "High goodwill and intangible asset intensity", "metric": goodwill_intangibles})
    if share_growth is not None and share_growth > 0.02:
        flags.append({"severity": "medium", "title": "Share count creep", "metric": share_growth})
    if (_safe_float(latest.get("free_cash_flow")) or 0) < 0 and (_safe_float(latest.get("net_income")) or 0) > 0:
        flags.append({"severity": "high", "title": "Negative FCF despite positive earnings", "metric": latest.get("free_cash_flow")})
    return flags


def _build_valuation(
    rows: list[dict[str, Any]],
    profile: dict[str, Any],
    prices: pd.DataFrame,
    assumptions: dict[str, Any],
) -> dict[str, Any]:
    latest_revenue = _latest(rows, "revenue")
    latest_cash = _latest(rows, "cash") or 0.0
    latest_debt = _latest(rows, "total_debt") or 0.0
    latest_shares = _latest(rows, "diluted_shares")
    latest_ebitda = _latest(rows, "ebitda")
    latest_fcf = _latest(rows, "free_cash_flow")
    fcf_margin = assumptions["base_fcf_margin"]
    current_price = _safe_float(profile.get("price"))
    if current_price is None and not prices.empty and "close" in prices.columns:
        current_price = _safe_float(prices.sort_values("date")["close"].dropna().iloc[-1]) if not prices["close"].dropna().empty else None
    market_cap = _safe_float(profile.get("mktCap"))
    if market_cap is None and current_price is not None and latest_shares is not None:
        market_cap = current_price * latest_shares
    enterprise_value = market_cap + latest_debt - latest_cash if market_cap is not None else None

    missing = [
        name
        for name, value in {
            "latest_revenue": latest_revenue,
            "latest_diluted_shares": latest_shares,
            "current_price": current_price,
        }.items()
        if value is None or value <= 0
    ]
    if missing:
        return {
            "available": False,
            "reason": "missing required valuation inputs",
            "missing": missing,
            "current_price": current_price,
            "scenarios": [],
            "reverse_dcf": {"available": False, "reason": "missing required valuation inputs"},
            "multiples": {},
        }

    scenario_inputs = {
        "bear": DcfScenarioInput(
            latest_revenue=latest_revenue,
            latest_fcf_margin=fcf_margin,
            cash=latest_cash,
            debt=latest_debt,
            diluted_shares=latest_shares,
            revenue_growth=max((assumptions["base_revenue_growth"] or 0.06) - 0.04, -0.02),
            terminal_fcf_margin=max(fcf_margin - 0.03, 0.01),
            wacc=0.11,
            terminal_growth=0.02,
        ),
        "base": DcfScenarioInput(
            latest_revenue=latest_revenue,
            latest_fcf_margin=fcf_margin,
            cash=latest_cash,
            debt=latest_debt,
            diluted_shares=latest_shares,
            revenue_growth=assumptions["base_revenue_growth"] or 0.06,
            terminal_fcf_margin=fcf_margin,
            wacc=assumptions["wacc"],
            terminal_growth=assumptions["terminal_growth"],
        ),
        "bull": DcfScenarioInput(
            latest_revenue=latest_revenue,
            latest_fcf_margin=fcf_margin,
            cash=latest_cash,
            debt=latest_debt,
            diluted_shares=latest_shares,
            revenue_growth=(assumptions["base_revenue_growth"] or 0.06) + 0.04,
            terminal_fcf_margin=min(fcf_margin + 0.03, 0.5),
            wacc=0.08,
            terminal_growth=0.035,
        ),
    }
    scenarios = [build_dcf_scenario(name, scenario) for name, scenario in scenario_inputs.items()]
    reverse = reverse_dcf_implied_growth(
        current_price=current_price,
        latest_revenue=latest_revenue,
        fcf_margin=fcf_margin,
        cash=latest_cash,
        debt=latest_debt,
        diluted_shares=latest_shares,
        wacc=assumptions["wacc"],
        terminal_growth=assumptions["terminal_growth"],
    )
    multiples = {
        "market_cap": market_cap,
        "enterprise_value": enterprise_value,
        "ev_to_sales": _ratio(enterprise_value, latest_revenue),
        "ev_to_ebitda": _ratio(enterprise_value, latest_ebitda),
        "price_to_fcf": _ratio(market_cap, latest_fcf),
    }
    return {
        "available": True,
        "current_price": current_price,
        "scenarios": scenarios,
        "reverse_dcf": reverse,
        "multiples": multiples,
    }


def _audit_bundle(
    ticker: str,
    rows: list[dict[str, Any]],
    sources: list[dict[str, Any]],
    valuation: dict[str, Any],
    data_points: list[dict[str, Any]],
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    coverage = _build_evidence_coverage(sources, data_points)
    if not rows:
        findings.append({"severity": "high", "code": "missing_financials", "message": f"No normalized financial statements are available for {ticker}."})
    if any(source.get("status") == "error" for source in sources):
        findings.append({"severity": "medium", "code": "provider_error", "message": "At least one provider call failed. Inspect sources.json."})
    if any(source.get("status") == "unavailable" and source.get("provider") == "fmp" for source in sources):
        findings.append({"severity": "high", "code": "provider_unavailable", "message": "FMP is unavailable in this runtime, so no source-backed report can be completed."})
    if any(source.get("status") == "unavailable" and source.get("provider") == "sec-edgar" for source in sources):
        findings.append({"severity": "medium", "code": "sec_edgar_unavailable", "message": "SEC EDGAR metadata is unavailable because SEC_USER_AGENT is not configured."})
    if rows and not any(source.get("provider") == "sec-edgar" and source.get("status") == "ok" for source in sources):
        findings.append({"severity": "medium", "code": "filing_crosscheck_missing", "message": "Financial statements were not cross-checked against SEC/XBRL facts in this run."})
    if not valuation.get("available"):
        findings.append({"severity": "medium", "code": "valuation_unavailable", "message": valuation.get("reason", "Valuation could not be completed.")})
    for point in data_points:
        if point["claim_tag"] == "sourced_fact" and not point.get("source_id"):
            findings.append({"severity": "high", "code": "missing_source", "message": f"{point['metric']} lacks a source id."})
    if coverage["score"] < 85:
        severity = "high" if coverage["score"] < 60 else "medium"
        findings.append(
            {
                "severity": severity,
                "code": "evidence_coverage_gap",
                "message": f"Evidence ledger covers {coverage['covered_expected_metrics']}/{coverage['expected_metrics']} required research metrics.",
            }
        )
    if coverage["sourced_points_missing_ok_source"]:
        findings.append(
            {
                "severity": "high",
                "code": "sourced_point_without_ok_source",
                "message": f"{len(coverage['sourced_points_missing_ok_source'])} sourced facts do not map to an ok source record.",
            }
        )
    if coverage["calculated_points_missing_formula"]:
        findings.append(
            {
                "severity": "medium",
                "code": "formula_missing",
                "message": f"{len(coverage['calculated_points_missing_formula'])} calculated metrics are missing formulas.",
            }
        )
    return {
        "generated_at": _now_iso(),
        "status": "pass" if not [item for item in findings if item["severity"] == "high"] else "needs_attention",
        "findings": findings,
        "coverage": coverage,
    }


def _checklist_scores(ratios: dict[str, Any], quality_flags: list[dict[str, Any]], valuation: dict[str, Any], audit: dict[str, Any] | None = None) -> dict[str, Any]:
    roic = ratios.get("roic") or 0
    fcf_margin = ratios.get("fcf_margin") or 0
    cash_conversion = ratios.get("cash_conversion") or 0
    base_value = None
    if valuation.get("available"):
        base = next((item for item in valuation.get("scenarios", []) if item.get("name") == "base"), None)
        base_value = base.get("intrinsic_value_per_share") if base else None
    current_price = valuation.get("current_price")
    valuation_margin = _ratio((base_value or 0) - (current_price or 0), current_price) if base_value and current_price else None
    return {
        "quality": round(max(0, min(100, 35 + roic * 180 + fcf_margin * 80 + cash_conversion * 15))),
        "accounting_risk": round(max(0, 100 - len(quality_flags) * 18)),
        "valuation": round(max(0, min(100, 50 + (valuation_margin or 0) * 100))),
        "evidence": round(max(0, min(100, (audit or {}).get("coverage", {}).get("score", 40)))),
    }


def _assumptions_yml(assumptions: dict[str, Any]) -> str:
    lines = ["assumptions:"]
    for key, value in assumptions.items():
        lines.append(f"  {key}: {value}")
    return "\n".join(lines) + "\n"


def _json_text(payload: Any) -> str:
    return json.dumps(payload, indent=2, sort_keys=True, default=str)


def _text_download(filename: str, media_type: str, text: str) -> dict[str, Any]:
    return {
        "filename": filename,
        "media_type": media_type,
        "encoding": "base64",
        "content_base64": base64.b64encode(text.encode("utf-8")).decode("ascii"),
    }


def _bytes_download(filename: str, media_type: str, content: bytes) -> dict[str, Any]:
    return {
        "filename": filename,
        "media_type": media_type,
        "encoding": "base64",
        "content_base64": base64.b64encode(content).decode("ascii"),
    }


def _append_rows(sheet, rows: list[list[Any]]) -> None:
    for row in rows:
        sheet.append(row)


def _style_sheet(sheet) -> None:
    header_fill = PatternFill("solid", fgColor="1F2937")
    header_font = Font(color="FFFFFF", bold=True)
    section_fill = PatternFill("solid", fgColor="E5E7EB")
    section_font = Font(color="111827", bold=True)
    thin_gray = Side(style="thin", color="D1D5DB")
    for row in sheet.iter_rows():
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            if cell.row == 1:
                cell.fill = header_fill
                cell.font = header_font
            elif isinstance(cell.value, str) and cell.column == 1 and cell.value.endswith(":"):
                cell.fill = section_fill
                cell.font = section_font
            if cell.value is not None:
                cell.border = Border(bottom=thin_gray)
            if isinstance(cell.value, (int, float)) and cell.column > 1:
                cell.number_format = '#,##0.0;[Red](#,##0.0);-'
            if isinstance(cell.value, str) and cell.value.startswith("="):
                cell.font = Font(color="000000")
    for column_cells in sheet.columns:
        values = [str(cell.value or "") for cell in column_cells]
        width = min(max(len(value) for value in values) + 2, 42)
        sheet.column_dimensions[get_column_letter(column_cells[0].column)].width = max(width, 12)
    sheet.freeze_panes = "A2"


def _write_kv_sheet(sheet, payload: dict[str, Any], *, source_note: str | None = None) -> None:
    sheet.append(["Field", "Value"])
    for key, value in payload.items():
        sheet.append([key, value])
        if source_note:
            sheet.cell(row=sheet.max_row, column=2).comment = Comment(source_note, "Research OS")
    _style_sheet(sheet)


def _build_model_xlsx(
    *,
    ticker: str,
    company_profile: dict[str, Any],
    rows: list[dict[str, Any]],
    assumptions: dict[str, Any],
    valuation: dict[str, Any],
    sources: dict[str, Any],
    audit: dict[str, Any],
) -> bytes | None:
    if not rows or not valuation.get("available"):
        return None

    workbook = Workbook()
    workbook.remove(workbook.active)

    assumptions_sheet = workbook.create_sheet("Assumptions")
    assumptions_sheet.append(["Field", "Value"])
    _append_rows(
        assumptions_sheet,
        [
            ["Ticker", ticker],
            ["Company", company_profile.get("name")],
            ["Sector", company_profile.get("sector")],
            ["Industry", company_profile.get("industry")],
            ["Current price", valuation.get("current_price")],
            ["WACC", assumptions.get("wacc")],
            ["Terminal growth", assumptions.get("terminal_growth")],
            ["Base revenue growth", assumptions.get("base_revenue_growth")],
            ["Base FCF margin", assumptions.get("base_fcf_margin")],
            ["Forecast years", assumptions.get("forecast_years")],
        ],
    )
    assumptions_sheet["B6"].number_format = "0.0%"
    assumptions_sheet["B7"].number_format = "0.0%"
    assumptions_sheet["B8"].number_format = "0.0%"
    assumptions_sheet["B9"].number_format = "0.0%"
    _style_sheet(assumptions_sheet)

    financials_sheet = workbook.create_sheet("Historical Financials")
    financial_headers = [
        "date",
        "revenue",
        "gross_profit",
        "operating_income",
        "net_income",
        "cash_from_operations",
        "capital_expenditures",
        "free_cash_flow",
        "gross_margin",
        "operating_margin",
        "fcf_margin",
        "roic",
        "diluted_shares",
        "cash",
        "total_debt",
    ]
    financials_sheet.append(financial_headers)
    for row in rows:
        financials_sheet.append([row.get(header) for header in financial_headers])
    for cell in financials_sheet[1]:
        cell.comment = Comment("Raw statement values are normalized from provider data; calculated columns use formulas in the Python engine.", "Research OS")
    _style_sheet(financials_sheet)

    forecast_sheet = workbook.create_sheet("Forecast")
    latest = rows[-1]
    latest_revenue = _safe_float(latest.get("revenue")) or 0.0
    latest_shares = _safe_float(latest.get("diluted_shares")) or 0.0
    latest_cash = _safe_float(latest.get("cash")) or 0.0
    latest_debt = _safe_float(latest.get("total_debt")) or 0.0
    forecast_sheet.append(["Year", "Revenue", "FCF margin", "FCFF", "Discount factor", "PV FCFF"])
    for year in range(1, int(assumptions.get("forecast_years") or 5) + 1):
        row_idx = year + 1
        if year == 1:
            forecast_sheet.append([year, f"={latest_revenue}*(1+Assumptions!$B$8)", "=Assumptions!$B$9", f"=B{row_idx}*C{row_idx}", f"=(1+Assumptions!$B$6)^{year}", f"=D{row_idx}/E{row_idx}"])
        else:
            forecast_sheet.append([year, f"=B{row_idx - 1}*(1+Assumptions!$B$8)", "=Assumptions!$B$9", f"=B{row_idx}*C{row_idx}", f"=(1+Assumptions!$B$6)^{year}", f"=D{row_idx}/E{row_idx}"])
    _style_sheet(forecast_sheet)

    dcf_sheet = workbook.create_sheet("DCF")
    terminal_row = int(assumptions.get("forecast_years") or 5) + 1
    _append_rows(
        dcf_sheet,
        [
            ["Line", "Value"],
            ["PV forecast FCFF", "=SUM(Forecast!F2:F6)"],
            ["Terminal FCFF", f"=Forecast!D{terminal_row}*(1+Assumptions!$B$7)"],
            ["Terminal value", "=B3/(Assumptions!$B$6-Assumptions!$B$7)"],
            ["PV terminal value", f"=B4/Forecast!E{terminal_row}"],
            ["Enterprise value", "=B2+B5"],
            ["Cash", latest_cash],
            ["Debt", latest_debt],
            ["Equity value", "=B6+B7-B8"],
            ["Diluted shares", latest_shares],
            ["Intrinsic value per share", "=B9/B10"],
        ],
    )
    _style_sheet(dcf_sheet)

    reverse_sheet = workbook.create_sheet("Reverse DCF")
    reverse = valuation.get("reverse_dcf") or {}
    _write_kv_sheet(reverse_sheet, {
        "available": reverse.get("available"),
        "status": reverse.get("status"),
        "current_price": reverse.get("current_price"),
        "implied_revenue_cagr": reverse.get("implied_revenue_cagr"),
        "terminal_fcf_margin": reverse.get("assumptions", {}).get("terminal_fcf_margin"),
        "wacc": reverse.get("assumptions", {}).get("wacc"),
        "terminal_growth": reverse.get("assumptions", {}).get("terminal_growth"),
    })

    multiples_sheet = workbook.create_sheet("Multiples")
    _write_kv_sheet(multiples_sheet, valuation.get("multiples") or {})

    scenarios_sheet = workbook.create_sheet("Scenarios")
    scenarios_sheet.append(["Scenario", "Revenue growth", "Terminal FCF margin", "WACC", "Terminal growth", "Equity value", "Value/share"])
    for scenario in valuation.get("scenarios", []):
        scenario_assumptions = scenario.get("assumptions") or {}
        scenarios_sheet.append([
            scenario.get("name"),
            scenario_assumptions.get("revenue_growth"),
            scenario_assumptions.get("terminal_fcf_margin"),
            scenario_assumptions.get("wacc"),
            scenario_assumptions.get("terminal_growth"),
            scenario.get("equity_value"),
            scenario.get("intrinsic_value_per_share"),
        ])
    _style_sheet(scenarios_sheet)

    sensitivities_sheet = workbook.create_sheet("Sensitivities")
    sensitivities_sheet.append(["WACC / terminal growth", "2.0%", "2.5%", "3.0%", "3.5%"])
    for wacc in [0.08, 0.09, 0.10, 0.11]:
        sensitivities_sheet.append([wacc, None, None, None, None])
        row_idx = sensitivities_sheet.max_row
        for col_idx, tg in enumerate([0.02, 0.025, 0.03, 0.035], start=2):
            if wacc > tg:
                sensitivities_sheet.cell(row=row_idx, column=col_idx).value = f"=(DCF!$B$2+(Forecast!D6*(1+{tg})/({wacc}-{tg})/((1+{wacc})^5))+DCF!$B$7-DCF!$B$8)/DCF!$B$10"
    _style_sheet(sensitivities_sheet)

    sources_sheet = workbook.create_sheet("Sources")
    sources_sheet.append(["source_id", "provider", "endpoint_or_filing", "retrieved_at", "status", "row_count", "error"])
    for source in sources.get("records", []):
        sources_sheet.append([
            source.get("source_id"),
            source.get("provider"),
            source.get("endpoint_or_filing"),
            source.get("retrieved_at"),
            source.get("status"),
            source.get("row_count"),
            source.get("error"),
        ])
    _style_sheet(sources_sheet)

    audit_sheet = workbook.create_sheet("Audit")
    audit_sheet.append(["severity", "code", "message"])
    for finding in audit.get("findings", []):
        audit_sheet.append([finding.get("severity"), finding.get("code"), finding.get("message")])
    _style_sheet(audit_sheet)

    evidence_sheet = workbook.create_sheet("Evidence Points")
    evidence_sheet.append(["metric", "claim_tag", "source_id", "formula", "normalized_value"])
    for point in sources.get("data_points", []):
        evidence_sheet.append([
            point.get("metric"),
            point.get("claim_tag"),
            point.get("source_id"),
            point.get("formula"),
            point.get("normalized_value"),
        ])
    _style_sheet(evidence_sheet)

    coverage_sheet = workbook.create_sheet("Coverage")
    coverage = sources.get("coverage") or audit.get("coverage") or {}
    coverage_sheet.append(["field", "value"])
    for key, value in coverage.items():
        coverage_sheet.append([key, _json_text(value) if isinstance(value, (list, dict)) else value])
    _style_sheet(coverage_sheet)

    agents_payload = sources.get("agent_outputs") or {}
    agent_claims_sheet = workbook.create_sheet("Agent Claims")
    agent_claims_sheet.append(["agent_id", "agent_name", "claim_tag", "claim", "evidence_refs", "metric_refs"])
    for claim in agents_payload.get("claims", []):
        agent_claims_sheet.append(
            [
                claim.get("agent_id"),
                claim.get("agent_name"),
                claim.get("claim_tag"),
                claim.get("text"),
                ", ".join(str(item) for item in claim.get("evidence_refs", [])),
                ", ".join(str(item) for item in claim.get("metric_refs", [])),
            ]
        )
    _style_sheet(agent_claims_sheet)

    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _build_downloads(bundle: dict[str, Any]) -> list[dict[str, Any]]:
    ticker = bundle["ticker"]
    downloads = [
        _text_download(f"{ticker}_report.md", "text/markdown", bundle["report_markdown"]),
        _text_download(f"{ticker}_sources.json", "application/json", _json_text(bundle["sources"])),
        _text_download(f"{ticker}_audit.json", "application/json", _json_text(bundle["audit"])),
        _text_download(f"{ticker}_assumptions.yml", "application/yaml", bundle["assumptions_yml"]),
    ]
    model_bytes = _build_model_xlsx(
        ticker=ticker,
        company_profile=bundle["company_profile"],
        rows=bundle["financials"]["annual"],
        assumptions=bundle["assumptions"],
        valuation=bundle["valuation"],
        sources=bundle["sources"],
        audit=bundle["audit"],
    )
    if model_bytes:
        downloads.append(
            _bytes_download(
                f"{ticker}_model.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                model_bytes,
            )
        )
    return downloads


def _report_markdown(
    ticker: str,
    profile: dict[str, Any],
    ratios: dict[str, Any],
    valuation: dict[str, Any],
    quality_flags: list[dict[str, Any]],
    audit: dict[str, Any],
    filings: list[dict[str, Any]],
    agent_outputs: dict[str, Any],
) -> str:
    name = profile.get("companyName") or ticker
    sector = profile.get("sector") or "n/a"
    industry = profile.get("industry") or "n/a"
    base = next((item for item in valuation.get("scenarios", []) if item.get("name") == "base"), None)
    reverse = valuation.get("reverse_dcf", {})
    implied_growth = reverse.get("implied_revenue_cagr") if reverse.get("available") else None
    base_value = base.get("intrinsic_value_per_share") if base else None
    flags = quality_flags or [{"severity": "info", "title": "No accounting quality flags were triggered by the available data."}]
    findings = audit.get("findings") or [{"severity": "info", "message": "No high-severity audit findings."}]
    coverage = audit.get("coverage") or {}
    coverage_line = f"{coverage.get('score', 0)}% ({coverage.get('covered_expected_metrics', 0)}/{coverage.get('expected_metrics', 0)} required metrics)"
    valuation_intro = (
        "The deterministic engine calculates bear, base, and bull DCF cases from sourced statements and explicit assumptions. The LLM layer should only interpret these outputs after the audit passes."
        if valuation.get("available")
        else "Valuation was not produced because required source-backed financial inputs are missing. No fair value, upside, or reverse DCF conclusion was inferred."
    )
    statement_authority = coverage.get("statement_authority", "not assessed")
    filing_lines = [
        f"- {item.get('form')} filed {item.get('filing_date')} for period {item.get('report_date') or 'n/a'} ({item.get('accession_number')})"
        for item in filings[:5]
    ] or ["- SEC filings metadata unavailable in this run."]
    agents = agent_outputs.get("agents") or []
    agent_lines = [
        f"- {agent.get('name')} [{agent.get('status')}]: {agent.get('summary')}"
        for agent in agents
    ] or ["- Agent layer not emitted."]
    final_orchestrator = agent_outputs.get("final_orchestrator") or {}
    final_analysis = final_orchestrator.get("analysis") or {}
    final_orchestrator_lines: list[str] = []
    if final_orchestrator.get("status") == "ok":
        final_orchestrator_lines.append(f"- Final LLM orchestrator: {final_analysis.get('executive_judgment') or final_analysis.get('memo_patch') or 'Completed.'}")
        llm_open_questions = final_analysis.get("open_questions") if isinstance(final_analysis.get("open_questions"), list) else []
        for item in llm_open_questions[:5]:
            final_orchestrator_lines.append(f"- Open question: {item}")
    elif final_orchestrator.get("enabled"):
        final_orchestrator_lines.append(f"- Final LLM orchestrator: {final_orchestrator.get('status')} ({final_orchestrator.get('error', 'no synthesis returned')}).")
    else:
        final_orchestrator_lines.append("- Final LLM orchestrator: disabled; deterministic agent layer used.")
    red_team_agent = next((agent for agent in agents if agent.get("id") == "red_team_agent"), {})
    red_team_lines = [
        f"- [{claim.get('claim_tag')}] {claim.get('text')}"
        for claim in red_team_agent.get("claims", [])
    ] or ["- Red-team agent did not emit claims."]

    return "\n".join(
        [
            f"# {ticker} research OS memo",
            "",
            "## 1-page investment memo",
            f"- Company: {name}",
            f"- Sector / industry: {sector} / {industry}",
            f"- Evidence state: {audit.get('status')}",
            f"- Evidence coverage: {coverage_line}",
            f"- Latest revenue: {_fmt_currency(ratios.get('latest_revenue'))}",
            f"- Revenue CAGR, 5y: {_fmt_pct(ratios.get('revenue_cagr_5y'))}",
            f"- FCF margin: {_fmt_pct(ratios.get('fcf_margin'))}",
            f"- ROIC: {_fmt_pct(ratios.get('roic'))}",
            f"- Base DCF value/share: {_fmt_currency(base_value)}",
            f"- Reverse DCF implied revenue CAGR: {_fmt_pct(implied_growth)}",
            "",
            "## Valuation suite",
            valuation_intro,
            f"Statement authority: {statement_authority}. SEC EDGAR is used for filing metadata unless XBRL fact ingestion is explicitly present in sources.json.",
            "",
            "## Agent research desk",
            f"Agent layer: {agent_outputs.get('version', 'n/a')} ({agent_outputs.get('mode', 'n/a')}). Agents interpret audited outputs; they do not calculate financial metrics.",
            *agent_lines,
            *final_orchestrator_lines,
            "",
            "## Red-team memo",
            *red_team_lines,
            "",
            "## Accounting quality flags",
            *[f"- [{item.get('severity')}] {item.get('title')}" for item in flags],
            "",
            "## Authoritative filings",
            *filing_lines,
            "",
            "## Audit findings",
            *[f"- [{item.get('severity')}] {item.get('message')}" for item in findings],
            "",
            "## Source appendix",
            f"See sources.json for provider endpoints, timestamps, row counts, errors, and coverage gaps. Statement authority: {statement_authority}.",
            "",
        ]
    )


def build_equity_research_bundle(
    ticker: str,
    *,
    mode: str = "quick",
    paths: PathConfigLike | None = None,
    fmp_client: FMPClient | None = None,
    sec_client: SECEdgarClient | None = None,
    llm_client: Any | None = None,
    enable_llm: bool | None = None,
) -> dict[str, Any]:
    symbol = clean_ticker(ticker)
    if not symbol:
        return {
            "ok": False,
            "error": "Ticker is required.",
            "audit": {
                "status": "needs_attention",
                "findings": [{"severity": "high", "code": "missing_ticker", "message": "Ticker is required."}],
            },
        }

    if fmp_client is None and paths is not None:
        fmp_client = FMPClient.from_env(paths.cache_root)
    if sec_client is None and paths is not None:
        sec_client = SECEdgarClient.from_env(paths.cache_root)

    statement_source_ids = dict(DEFAULT_STATEMENT_SOURCE_IDS)
    profile, frames, sources = _load_fmp_payloads(symbol, paths, fmp_client)
    filings, sec_sources = _load_sec_filings(symbol, sec_client)
    sources.extend(sec_sources)
    if any(frames.get(key, pd.DataFrame()).empty for key in DEFAULT_STATEMENT_SOURCE_IDS):
        sec_frames, sec_fact_sources = _load_sec_company_facts(symbol, sec_client)
        sources.extend(sec_fact_sources)
        for statement_key, source_id in SEC_STATEMENT_SOURCE_IDS.items():
            if frames.get(statement_key, pd.DataFrame()).empty and not sec_frames.get(statement_key, pd.DataFrame()).empty:
                frames[statement_key] = sec_frames[statement_key]
                statement_source_ids[statement_key] = source_id
    preliminary_assumptions = {"normalized_tax_rate": DEFAULT_TAX_RATE}
    rows = _normalize_financials(frames, preliminary_assumptions["normalized_tax_rate"])
    assumptions = _derive_assumptions(rows)
    rows = _normalize_financials(frames, assumptions["normalized_tax_rate"])
    ratios = _build_ratios(rows)
    quality_flags = _quality_flags(rows)
    valuation = _build_valuation(rows, profile, frames["prices"], assumptions)

    data_points = [
        _data_point("company_profile", profile.get("companyName") or symbol, "sourced_fact", "fmp:profile"),
        _data_point("latest_revenue", ratios.get("latest_revenue"), "sourced_fact", statement_source_ids.get("income")),
        _data_point("latest_diluted_shares", ratios.get("latest_diluted_shares"), "sourced_fact", statement_source_ids.get("income")),
        _data_point("latest_free_cash_flow", ratios.get("latest_fcf"), "calculated_metric", formula="cash_from_operations - abs(capital_expenditures)"),
        _data_point("revenue_cagr_5y", ratios.get("revenue_cagr_5y"), "calculated_metric", formula="(Revenue_t / Revenue_0) ** (1 / years) - 1"),
        _data_point("gross_margin", ratios.get("gross_margin"), "calculated_metric", formula="gross_profit / revenue"),
        _data_point("operating_margin", ratios.get("operating_margin"), "calculated_metric", formula="operating_income / revenue"),
        _data_point("fcf_margin", ratios.get("fcf_margin"), "calculated_metric", formula="free_cash_flow / revenue"),
        _data_point("roic", ratios.get("roic"), "calculated_metric", formula="NOPAT / average_invested_capital"),
        _data_point("net_debt", ratios.get("net_debt"), "calculated_metric", formula="total_debt - cash_and_equivalents"),
        _data_point("base_fcf_margin", assumptions.get("base_fcf_margin"), "assumption", formula="latest positive FCF margin or historical median fallback"),
        _data_point("wacc", assumptions.get("wacc"), "assumption", formula="user-default assumption"),
        _data_point("terminal_growth", assumptions.get("terminal_growth"), "assumption", formula="user-default assumption"),
    ]
    data_points.extend(_financial_data_points(rows, statement_source_ids))
    if valuation.get("available"):
        base_case = next((item for item in valuation.get("scenarios", []) if item.get("name") == "base"), None)
        data_points.extend(
            [
                _data_point("current_price", valuation.get("current_price"), "sourced_fact", "fmp:profile" if profile.get("price") is not None else "fmp:prices"),
                _data_point("base_intrinsic_value_per_share", (base_case or {}).get("intrinsic_value_per_share"), "calculated_metric", formula="PV_FCFF + cash - debt divided by diluted shares"),
                _data_point("reverse_dcf_implied_revenue_cagr", valuation.get("reverse_dcf", {}).get("implied_revenue_cagr"), "calculated_metric", formula="binary search for growth where DCF value equals current price"),
                _data_point("ev_to_sales", valuation.get("multiples", {}).get("ev_to_sales"), "calculated_metric", formula="enterprise_value / latest_revenue"),
                _data_point("price_to_fcf", valuation.get("multiples", {}).get("price_to_fcf"), "calculated_metric", formula="market_cap / latest_free_cash_flow"),
            ]
        )
        data_points.extend(_valuation_data_points(valuation))
    if filings:
        data_points.append(_data_point("latest_sec_filing", filings[0].get("accession_number"), "sourced_fact", "sec:submissions"))
    audit = _audit_bundle(symbol, rows, sources, valuation, data_points)
    coverage = audit.get("coverage", {})
    checklist = _checklist_scores(ratios, quality_flags, valuation, audit)

    company_profile = {
        "name": profile.get("companyName") or symbol,
        "sector": profile.get("sector"),
        "industry": profile.get("industry"),
        "country": profile.get("country"),
        "currency": profile.get("currency"),
        "exchange": profile.get("exchangeShortName") or profile.get("exchange"),
        "beta": _safe_float(profile.get("beta")),
        "market_cap": _safe_float(profile.get("mktCap")),
        "description": profile.get("description") if mode == "full" else None,
    }
    agent_outputs = build_agent_outputs(
        ticker=symbol,
        profile=profile,
        rows=rows,
        ratios=ratios,
        valuation=valuation,
        quality_flags=quality_flags,
        audit=audit,
        sources=sources,
        filings=filings,
    )
    agent_outputs["final_orchestrator"] = run_final_orchestrator_llm(
        ticker=symbol,
        profile=profile,
        rows=rows,
        ratios=ratios,
        valuation=valuation,
        quality_flags=quality_flags,
        audit=audit,
        agent_outputs=agent_outputs,
        filings=filings,
        llm_client=llm_client,
        enabled=enable_llm,
    )
    bundle = {
        "ok": True,
        "ticker": symbol,
        "mode": "full" if mode == "full" else "quick",
        "generated_at": _now_iso(),
        "company_profile": company_profile,
        "financials": {
            "annual": rows,
            "ratios": ratios,
            "quality_flags": quality_flags,
        },
        "filings": {
            "recent": filings,
        },
        "valuation": valuation,
        "checklist_score": checklist,
        "agents": agent_outputs,
        "report_markdown": _report_markdown(symbol, profile, ratios, valuation, quality_flags, audit, filings, agent_outputs),
        "sources": {
            "records": sources,
            "data_points": data_points,
            "coverage": coverage,
            "statement_source_ids": statement_source_ids,
            "claims": agent_outputs.get("claims", []),
            "agent_outputs": agent_outputs,
        },
        "audit": audit,
        "assumptions": assumptions,
        "assumptions_yml": _assumptions_yml(assumptions),
        "artifacts": {
            "report_md": True,
            "model_xlsx": bool(rows and valuation.get("available")),
            "sources_json": True,
            "audit_json": True,
            "assumptions_yml": True,
            "note": "Artifacts are generated from the deterministic finance engine and source ledger.",
        },
    }
    bundle["downloads"] = _build_downloads(bundle)
    return bundle
