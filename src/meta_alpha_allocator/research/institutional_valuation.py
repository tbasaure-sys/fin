from __future__ import annotations

from datetime import datetime, timezone
import math
import numbers
import re
from statistics import median
from typing import Any, Iterable

import pandas as pd


MODEL_VERSION = "institutional_valuation_v3"
FCFF_DCF_METHODS = frozenset({
    "forward_fcff_dcf",
    "through_cycle_fcff_dcf",
    "market_implied_operating_requirements",
})
DEFAULT_RISK_FREE_RATE = 0.0425
DEFAULT_EQUITY_RISK_PREMIUM = 0.05
BETA_WINSOR_LOWER = 0.50
BETA_WINSOR_UPPER = 2.00
BETA_RAW_WEIGHT = 0.60
MAX_DECISION_READY_METHOD_DISAGREEMENT = 0.45
MAX_DECISION_READY_TERMINAL_VALUE_SHARE = 0.75
MAX_MARKET_DATA_AGE_DAYS = 7
MAX_PRICE_CORROBORATION_GAP_DAYS = 4
MAX_FINANCIAL_DATA_AGE_DAYS = 190
ARCHETYPE_BETA_PRIORS = {
    "financial": 1.05,
    "specialized_real_assets": 0.85,
    "capacity_cycle": 1.25,
    "early_stage": 1.40,
    "asset_light_growth": 1.15,
    "asset_heavy": 0.95,
    "general": 1.00,
}


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _positive(value: Any) -> float | None:
    parsed = _number(value)
    return parsed if parsed is not None and parsed > 0 else None


def _clamp(value: float, low: float, high: float) -> float:
    return min(max(float(value), low), high)


def _ratio(numerator: Any, denominator: Any) -> float | None:
    n = _number(numerator)
    d = _number(denominator)
    if n is None or d in (None, 0):
        return None
    result = n / d
    return result if math.isfinite(result) else None


def _date_text(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, numbers.Real) and not math.isfinite(float(value)):
        return None
    try:
        return str(pd.to_datetime(value).date())
    except (TypeError, ValueError, OverflowError):
        return None


def _authentic_sec_company_facts_record(record: Any, expected_ticker: str | None) -> bool:
    if not isinstance(record, dict):
        return False
    ticker = re.sub(r"[^A-Z0-9.-]", "", str(expected_ticker or "").upper().strip())
    if not ticker:
        return False
    provider = str(record.get("provider") or "").strip().lower()
    endpoint = str(record.get("endpoint_or_filing") or "").strip()
    expected_endpoint = f"api/xbrl/companyfacts/CIK{{resolved_from_{ticker}}}.json"
    row_count = record.get("row_count")
    return bool(
        provider == "sec-edgar"
        and endpoint.lower() == expected_endpoint.lower()
        and isinstance(row_count, int)
        and not isinstance(row_count, bool)
        and row_count > 0
    )


def _epoch_date(value: Any) -> str | None:
    timestamp = _number(value)
    if timestamp is None or timestamp <= 0:
        return None
    try:
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat()
    except (OSError, OverflowError, ValueError):
        return None


def _age_days(value: Any) -> int | None:
    date = _date_text(value)
    if not date:
        return None
    try:
        parsed = datetime.fromisoformat(date).date()
    except ValueError:
        return None
    age = (datetime.now(timezone.utc).date() - parsed).days
    return age if age >= 0 else None


def _records(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, pd.DataFrame):
        return [dict(row) for row in value.to_dict(orient="records")]
    if isinstance(value, list):
        return [dict(row) for row in value if isinstance(row, dict)]
    return []


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, bool) or value is None or isinstance(value, (str, int)):
        return value
    if isinstance(value, numbers.Real):
        parsed = float(value)
        return parsed if math.isfinite(parsed) else None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def _normalize_annual_history(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    by_year: dict[int, dict[str, Any]] = {}
    invalid_dates: list[Any] = []
    conflicting_fiscal_metadata_rows: list[str] = []
    conflicting_statement_duplicate_rows: list[str] = []
    non_annual_period_rows: list[dict[str, str]] = []
    duplicate_years = 0
    conflicting_duplicate_years = 0
    for raw in rows:
        date = _date_text(raw.get("date"))
        if date is None or _age_days(date) is None:
            invalid_dates.append(raw.get("date"))
            continue
        if raw.get("statement_duplicate_mismatch") is True:
            conflicting_statement_duplicate_rows.append(date)
            continue
        if raw.get("fiscal_metadata_mismatch") is True:
            conflicting_fiscal_metadata_rows.append(date)
            continue
        period = str(raw.get("period") or "").upper().strip()
        if period and period not in {"FY", "ANNUAL"}:
            non_annual_period_rows.append({"date": date, "period": period})
            continue
        fiscal_year_raw = (
            raw.get("fiscal_year")
            or raw.get("fiscalYear")
            or raw.get("calendar_year")
            or raw.get("calendarYear")
        )
        try:
            year = int(fiscal_year_raw) if fiscal_year_raw not in (None, "") else int(pd.to_datetime(date).year)
        except (TypeError, ValueError):
            invalid_dates.append(raw.get("date"))
            continue
        if year in by_year:
            duplicate_years += 1
            existing = by_year[year]
            if date > str(existing.get("date") or ""):
                by_year[year] = {**raw, "date": date, "fiscal_year": year}
            elif date == str(existing.get("date") or ""):
                numeric_critical_fields = (
                    "revenue",
                    "ebitda",
                    "fcff",
                    "free_cash_flow",
                    "net_income",
                    "diluted_shares",
                    "cash",
                    "total_debt",
                    "total_equity",
                )
                text_critical_fields = (
                    "reported_currency",
                    "fiscal_year",
                    "fiscalYear",
                    "calendar_year",
                    "calendarYear",
                    "period",
                )
                numeric_conflict = any(
                    _number(raw.get(field)) != _number(existing.get(field))
                    for field in numeric_critical_fields
                )
                text_conflict = any(
                    str(raw.get(field) or "").upper().strip()
                    != str(existing.get(field) or "").upper().strip()
                    for field in text_critical_fields
                )
                if numeric_conflict or text_conflict:
                    conflicting_duplicate_years += 1
            continue
        by_year[year] = {**raw, "date": date, "fiscal_year": year}
    normalized = sorted(by_year.values(), key=lambda row: row["date"])
    return normalized, {
        "passed": bool(
            not invalid_dates
            and not conflicting_fiscal_metadata_rows
            and not conflicting_statement_duplicate_rows
            and not non_annual_period_rows
            and conflicting_duplicate_years == 0
        ),
        "input_rows": len(rows),
        "unique_years": len(normalized),
        "duplicate_years": duplicate_years,
        "conflicting_duplicate_years": conflicting_duplicate_years,
        "conflicting_fiscal_metadata_rows": conflicting_fiscal_metadata_rows,
        "conflicting_statement_duplicate_rows": conflicting_statement_duplicate_rows,
        "non_annual_period_rows": non_annual_period_rows,
        "invalid_or_future_dates": invalid_dates,
        "policy": "one explicit FY observation per fiscal year; statement-family metadata must reconcile; the latest fiscal date wins and same-date conflicts are rejected",
    }


def _latest_price(prices: Any) -> tuple[float | None, str | None, str]:
    rows = _records(prices)
    candidates: list[tuple[str, float, str]] = []
    for row in rows:
        price = _positive(row.get("close") if row.get("close") is not None else row.get("price"))
        date = _date_text(row.get("date"))
        if price is not None and date:
            source_family = str(
                row.get("source_family")
                or row.get("provider_family")
                or row.get("provider")
                or "FMP"
            ).strip()
            candidates.append((date, price, source_family))
    if not candidates:
        return None, None, "FMP"
    date, price, source_family = sorted(candidates, key=lambda item: item[0])[-1]
    return price, date, source_family


def classify_archetype(
    profile: dict[str, Any],
    current_row: dict[str, Any] | None,
    estimates: Any,
    annual_rows: list[dict[str, Any]] | None = None,
) -> str:
    sector = str(profile.get("sector") or "").lower().strip()
    industry = str(profile.get("industry") or "").lower().strip()
    text = f"{sector} {industry}"
    revenue = _number((current_row or {}).get("revenue"))
    cash_flow = _number((current_row or {}).get("free_cash_flow"))
    future = _records(estimates)

    def contains_any(value: str, phrases: Iterable[str]) -> bool:
        return any(re.search(rf"\b{re.escape(phrase)}\b", value) for phrase in phrases)

    software_business = contains_any(industry, ("software", "saas", "cloud", "platform", "internet content", "marketplace"))

    if sector == "financial services" and not industry:
        return "specialized_financial"
    if not sector or not industry:
        return "unknown"

    entity_text = " ".join(
        str(value or "")
        for value in (
            profile.get("companyName") or profile.get("name"),
            industry,
            profile.get("description"),
        )
    ).lower()
    payment_network = bool(
        contains_any(
            entity_text,
            (
                "payment network",
                "payments network",
                "card network",
                "transaction processing",
                "payment processing",
            ),
        )
        and not contains_any(entity_text, ("lending", "loans", "deposits", "consumer banking", "commercial banking"))
    )
    if profile.get("isEtf") is True or profile.get("isETF") is True or profile.get("isFund") is True or contains_any(
        entity_text,
        ("exchange traded fund", "closed end fund", "blank check", "spac", "business development company", "royalty trust"),
    ):
        return "specialized_security"

    if contains_any(industry, ("reit", "real estate investment trust")):
        return "specialized_real_assets"
    if contains_any(industry, ("healthcare plans", "health care plans", "managed care", "health insurance")):
        return "specialized_financial"
    if contains_any(
        industry,
        ("insurance", "reinsurance", "mortgage finance", "consumer finance"),
    ) and not software_business:
        return "specialized_financial"
    if contains_any(industry, ("credit services",)) and not payment_network:
        return "specialized_financial"
    if contains_any(industry, ("bank", "banks", "thrift")) and not software_business:
        return "financial"
    if sector == "financial services" and not (
        payment_network
        or contains_any(industry, ("financial data", "stock exchange", "market data"))
    ):
        return "specialized_financial"
    if contains_any(industry, ("clinical stage", "clinical-stage", "preclinical")):
        return "early_stage"
    if contains_any(industry, ("biotechnology", "biotech")):
        history = list(annual_rows or [])[-5:]
        recurring_commercial_years = [
            row
            for row in history
            if (_positive(row.get("revenue")) or 0) > 0
            and (_positive(row.get("fcff_after_sbc")) or 0) > 0
        ]
        historical_revenues = [
            value
            for row in history
            if (value := _positive(row.get("revenue"))) is not None
        ]
        commercial_history_supported = bool(
            len(history) >= 3
            and len(recurring_commercial_years) == len(history)
            and historical_revenues
            and max(historical_revenues) / min(historical_revenues) <= 3.0
        )
        if (
            (revenue is None or revenue <= 0)
            or (cash_flow is None or cash_flow <= 0)
            or not commercial_history_supported
        ):
            return "early_stage"
    if software_business:
        if (revenue is None or revenue <= 0) and (cash_flow is None or cash_flow <= 0):
            return "early_stage"
        return "asset_light_growth"
    if sector in {"energy", "basic materials", "materials"} or contains_any(
        industry,
        ("semiconductor", "semiconductors", "memory", "oil", "gas", "mining", "metals", "chemical", "shipping", "airline", "automobile", "steel"),
    ):
        return "capacity_cycle"
    if (revenue is None or revenue <= 0) and (cash_flow is None or cash_flow <= 0):
        return "early_stage"
    if cash_flow is not None and cash_flow <= 0 and not any(_positive(row.get("ebitdaAvg")) for row in future):
        return "early_stage"
    if contains_any(text, ("utility", "industrial", "aerospace", "construction", "telecom")):
        return "asset_heavy"
    return "general"


def validate_market_price(
    profile: dict[str, Any],
    quote: dict[str, Any] | None,
    prices: Any,
    shares: float | None,
    expected_ticker: str | None = None,
) -> dict[str, Any]:
    quote = quote or {}
    quote_price = _positive(quote.get("price"))
    quote_date = _date_text(quote.get("as_of")) or _epoch_date(quote.get("timestamp"))
    historical_price, historical_date, historical_source_family = _latest_price(prices)
    quote_source_family = str(quote.get("source_family") or quote.get("provider_family") or "FMP").strip()
    profile_source_family = str(profile.get("source_family") or profile.get("provider_family") or "FMP").strip()
    profile_price = _positive(profile.get("price"))
    profile_market_cap = _positive(profile.get("marketCap")) or _positive(profile.get("mktCap"))
    quote_market_cap = _positive(quote.get("marketCap")) or _positive(quote.get("market_cap"))
    market_cap = quote_market_cap or profile_market_cap
    price = quote_price or historical_price or profile_price
    as_of = quote_date if quote_price is not None else historical_date
    checks: list[dict[str, Any]] = []
    blockers: list[str] = []

    observed_symbols = {
        str(value).upper().strip()
        for value in [
            profile.get("symbol"),
            quote.get("symbol"),
            *[row.get("symbol") for row in _records(prices)],
        ]
        if value not in (None, "")
    }
    requested_symbol = str(expected_ticker).upper().strip() if expected_ticker else None
    if requested_symbol:
        identity_passed = observed_symbols == {requested_symbol}
        checks.append(
            {
                "key": "security_identity",
                "passed": identity_passed,
                "required": True,
                "requested_symbol": requested_symbol,
                "observed_symbols": sorted(observed_symbols),
            }
        )
        if not identity_passed:
            blockers.append("El ticker solicitado no está corroborado por el símbolo informado por el proveedor.")
    elif len(observed_symbols) >= 2:
        checks.append(
            {
                "key": "security_identity",
                "passed": False,
                "required": True,
                "requested_symbol": None,
                "observed_symbols": sorted(observed_symbols),
            }
        )
        blockers.append("Las fuentes de mercado no identifican el mismo instrumento.")
    elif observed_symbols:
        checks.append(
            {
                "key": "security_identity",
                "passed": True,
                "required": True,
                "requested_symbol": None,
                "observed_symbols": sorted(observed_symbols),
            }
        )

    explicit_exchanges = {
        str(value).upper().strip()
        for value in (
            profile.get("exchangeShortName") or profile.get("exchange"),
            quote.get("exchange") or quote.get("exchangeShortName"),
        )
        if value not in (None, "")
    }
    if len(explicit_exchanges) >= 2:
        checks.append(
            {
                "key": "exchange_identity",
                "passed": False,
                "required": True,
                "exchanges": sorted(explicit_exchanges),
            }
        )
        blockers.append("Las fuentes de mercado no identifican la misma bolsa de cotización.")
    elif explicit_exchanges:
        checks.append(
            {
                "key": "exchange_identity",
                "passed": True,
                "required": True,
                "exchanges": sorted(explicit_exchanges),
            }
        )

    explicit_currencies = {
        str(value).upper().strip()
        for value in [
            profile.get("currency"),
            quote.get("currency"),
            *[row.get("currency") for row in _records(prices)],
        ]
        if value not in (None, "")
    }
    if len(explicit_currencies) >= 2:
        checks.append(
            {
                "key": "market_currency_identity",
                "passed": False,
                "required": True,
                "currencies": sorted(explicit_currencies),
            }
        )
        blockers.append("Las fuentes de mercado usan monedas distintas.")
    elif explicit_currencies:
        checks.append(
            {
                "key": "market_currency_identity",
                "passed": True,
                "required": True,
                "currencies": sorted(explicit_currencies),
            }
        )
    else:
        checks.append(
            {
                "key": "market_currency_identity",
                "passed": False,
                "required": True,
                "currencies": [],
                "reason": "missing explicit listing currency",
            }
        )
        blockers.append("Falta la moneda explícita de cotización.")

    # Separate FMP endpoints can reconcile one provider payload, but they are
    # not independent market observations.
    provider_price_checks: list[dict[str, Any]] = []
    if quote_price is not None and historical_price is not None:
        difference = abs(quote_price - historical_price) / max(quote_price, historical_price)
        quote_parsed = pd.to_datetime(quote_date, errors="coerce")
        close_parsed = pd.to_datetime(historical_date, errors="coerce")
        date_gap = abs((quote_parsed - close_parsed).days) if not pd.isna(quote_parsed) and not pd.isna(close_parsed) else None
        comparable = date_gap is not None and date_gap <= MAX_PRICE_CORROBORATION_GAP_DAYS
        tolerance = 0.03 if date_gap == 0 else 0.08 if date_gap == 1 else 0.12 if date_gap == 2 else 0.18
        independent = historical_source_family.lower() != quote_source_family.lower()
        check = {
            "key": "quote_vs_latest_close",
            "passed": difference <= tolerance if comparable else None,
            "required": comparable,
            "independent": independent,
            "source_family": historical_source_family,
            "compared_with_source_family": quote_source_family,
            "difference": difference,
            "maximum_difference": tolerance,
            "date_gap_days": date_gap,
            "quote_date": quote_date,
            "close_date": historical_date,
            "comparable": comparable,
        }
        checks.append(check)
        if comparable:
            provider_price_checks.append(check)
        if comparable and not check["passed"]:
            blockers.append("La cotización no concuerda con el cierre independiente más reciente.")

    if quote_price is not None and profile_price is not None:
        difference = abs(quote_price - profile_price) / max(quote_price, profile_price)
        check = {
            "key": "quote_vs_profile_price",
            "passed": difference <= 0.05,
            "required": False,
            "independent": False,
            "source_family": profile_source_family,
            "difference": difference,
            "maximum_difference": 0.05,
        }
        checks.append(check)

    if quote_price is None and historical_price is not None and profile_price is not None:
        difference = abs(historical_price - profile_price) / max(historical_price, profile_price)
        independent = historical_source_family.lower() != profile_source_family.lower()
        check = {
            "key": "latest_close_vs_profile_price",
            "passed": difference <= 0.05,
            "required": True,
            "independent": independent,
            "source_family": historical_source_family,
            "compared_with_source_family": profile_source_family,
            "difference": difference,
            "maximum_difference": 0.05,
            "close_date": historical_date,
        }
        checks.append(check)
        provider_price_checks.append(check)

    adr_ratio = _positive(profile.get("adrRatio")) or _positive(profile.get("adr_ratio"))
    adr_flag = profile.get("isAdr") is True or profile.get("isADR") is True or adr_ratio is not None
    valuation_shares = shares
    adr_conversion: dict[str, Any] | None = None
    if adr_flag:
        implied_listing_shares = _ratio(market_cap, price)
        if adr_ratio is None:
            checks.append({"key": "adr_ratio", "passed": False, "required": True})
            blockers.append("El ratio entre ADR y acciones ordinarias no está disponible.")
        elif shares is None or implied_listing_shares is None:
            checks.append({"key": "adr_denominator", "passed": False, "required": True, "adr_ratio": adr_ratio})
            blockers.append("No se puede reconciliar el ADR con las acciones y la capitalización.")
        else:
            candidates = {
                "ordinary_shares_divided_by_adr_ratio": shares / adr_ratio,
                "ordinary_shares_multiplied_by_adr_ratio": shares * adr_ratio,
                "reported_shares_already_listing_units": shares,
            }
            candidate_differences = {
                key: abs(candidate - implied_listing_shares) / max(candidate, implied_listing_shares)
                for key, candidate in candidates.items()
                if candidate > 0
            }
            selected_convention = min(candidate_differences, key=candidate_differences.get)
            selected_difference = candidate_differences[selected_convention]
            explicit_share_basis = str(
                profile.get("shareCountBasis")
                or profile.get("reportedSharesBasis")
                or profile.get("share_unit")
                or ""
            ).lower().strip()
            listing_basis_explicit = explicit_share_basis in {
                "adr",
                "listing",
                "listing_security",
                "depositary_receipt",
            }
            ambiguous_listing_basis = (
                selected_convention == "reported_shares_already_listing_units"
                and adr_ratio != 1.0
                and not listing_basis_explicit
            )
            passed = selected_difference <= 0.08 and not ambiguous_listing_basis
            valuation_shares = candidates[selected_convention] if passed else None
            adr_conversion = {
                "adr_ratio": adr_ratio,
                "convention": selected_convention if passed else None,
                "reported_diluted_shares": shares,
                "listing_shares": valuation_shares,
                "market_implied_listing_shares": implied_listing_shares,
                "difference": selected_difference,
                "reported_share_basis": explicit_share_basis or None,
                "share_basis_explicit": listing_basis_explicit,
                "ambiguous_listing_basis": ambiguous_listing_basis,
            }
            checks.append(
                {
                    "key": "adr_denominator",
                    "passed": passed,
                    "required": True,
                    **adr_conversion,
                    "maximum_difference": 0.08,
                }
            )
            if not passed:
                blockers.append("El ratio ADR no concuerda con precio, acciones y capitalización.")

    denominator_checks: list[dict[str, Any]] = []
    for source_key, source_market_cap in (
        ("profile_market_cap", profile_market_cap),
        ("quote_market_cap", quote_market_cap),
    ):
        implied = _ratio(source_market_cap, price)
        if implied is None or valuation_shares is None or valuation_shares <= 0:
            continue
        difference = abs(implied - valuation_shares) / max(implied, valuation_shares)
        maximum_difference = 0.05 if source_key == "quote_market_cap" else 0.08
        required = source_key == "quote_market_cap" or quote_market_cap is None
        check = {
            "key": "price_times_shares_vs_market_cap",
            "source": source_key,
            "passed": difference <= maximum_difference,
            "required": required,
            "difference": difference,
            "maximum_difference": maximum_difference,
            "implied_shares": implied,
            "valuation_shares": valuation_shares,
            "independent": False,
            "source_family": quote_source_family if source_key == "quote_market_cap" else profile_source_family,
        }
        checks.append(check)
        denominator_checks.append(check)
        if required and difference > 0.35:
            blockers.append("Precio, acciones y capitalización no usan la misma escala.")

    required_checks = [check for check in checks if check.get("required", True)]
    has_independent_price = any(
        check.get("independent") is True and check.get("passed") is True
        for check in provider_price_checks
    )
    has_provider_price_corroboration = any(check.get("passed") is True for check in provider_price_checks)
    has_denominator_reconciliation = any(check.get("passed") is True for check in denominator_checks)
    identity_checks = [
        check
        for check in checks
        if check.get("key") in {"security_identity", "exchange_identity", "market_currency_identity"}
    ]
    identity_corroborated = bool(identity_checks) and all(check.get("passed") is True for check in identity_checks)
    provider_corroborated = (
        has_provider_price_corroboration
        and has_denominator_reconciliation
        and bool(required_checks)
        and all(check.get("passed") is True for check in required_checks)
    )
    inconsistent = any(check.get("passed") is False for check in required_checks)
    age_days = _age_days(as_of)
    fresh = age_days is not None and age_days <= MAX_MARKET_DATA_AGE_DAYS
    usable_for_context = bool(
        price is not None
        and fresh
        and identity_corroborated
        and has_provider_price_corroboration
    )
    if as_of and age_days is None:
        blockers.append("La fecha de mercado es futura o inválida.")
    if blockers or price is None:
        status = "blocked"
    elif inconsistent:
        status = "inconsistent"
    elif provider_corroborated and not fresh:
        status = "stale" if age_days is not None else "undated"
    elif provider_corroborated and has_independent_price and fresh:
        status = "validated"
    elif provider_corroborated and fresh:
        status = "provider_reconciled"
    elif quote_price is not None:
        status = "single_source"
    else:
        status = "unverified"

    listing_currency = next(iter(explicit_currencies), None)
    independent_observation = (
        {
            "source_id": (
                "yfinance:prices"
                if historical_source_family.lower() in {"yfinance", "yahoo finance", "yahoo"}
                else "market:independent-close"
            ),
            "source_family": historical_source_family,
            "price": historical_price,
            "as_of": historical_date,
            "currency": listing_currency,
        }
        if has_independent_price
        and historical_price is not None
        and historical_date
        and listing_currency
        else None
    )

    return {
        "status": status,
        "usable": status == "validated",
        "research_usable": bool(
            fresh
            and provider_corroborated
            and status in {"validated", "provider_reconciled"}
        ),
        # A share-count/market-cap mismatch blocks per-share valuation, but it
        # does not invalidate a fresh quote that agrees with the same
        # provider's dated close. Keep that distinction explicit so the UI can
        # show market context without presenting it as valuation-grade.
        "usable_for_context": usable_for_context,
        "price": price,
        "currency": listing_currency,
        "as_of": as_of,
        "age_days": age_days,
        "fresh": fresh,
        "maximum_age_days": MAX_MARKET_DATA_AGE_DAYS,
        "market_cap": market_cap,
        "implied_shares": _ratio(market_cap, price),
        "reported_diluted_shares": shares,
        "valuation_shares": valuation_shares,
        "adr_conversion": adr_conversion,
        "independent_price_observation": has_independent_price,
        "independent_observation": independent_observation,
        "provider_corroborated": provider_corroborated,
        "provider_family": quote_source_family,
        "denominator_reconciled": has_denominator_reconciliation,
        "sources": [
            source
            for source, available in (
                (f"{quote_source_family} quote", quote_price is not None),
                (f"{historical_source_family} latest close", historical_price is not None),
                (f"{profile_source_family} company profile", profile_price is not None),
            )
            if available
        ],
        "checks": checks,
        "blockers": blockers,
    }


def validate_fundamental_scale(
    current_row: dict[str, Any],
    annual_rows: list[dict[str, Any]],
    price_validation: dict[str, Any],
    key_metrics_ttm: dict[str, Any] | None,
    archetype: str,
) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    blockers: list[str] = []
    market_cap = _positive(price_validation.get("market_cap"))
    statement_values = {
        key: abs(value)
        for key in (
            "revenue",
            "ebitda",
            "cash_from_operations",
            "capital_expenditures",
            "free_cash_flow",
            "fcff",
            "cash",
            "total_debt",
            "total_equity",
            "total_assets",
            "goodwill_and_intangibles",
            "preferred_stock",
            "minority_interest",
            "unfunded_pension_liability",
            "lease_liabilities_not_in_debt",
            "non_operating_investments",
        )
        if (value := _number(current_row.get(key))) is not None and value != 0
    }
    magnitude_inputs = [value for value in [market_cap, *statement_values.values()] if value is not None]
    magnitude_passed = bool(magnitude_inputs) and max(magnitude_inputs) <= 1e16
    checks.append(
        {
            "key": "finite_usd_input_magnitude",
            "passed": magnitude_passed,
            "required": True,
            "maximum_absolute_input": max(magnitude_inputs) if magnitude_inputs else None,
            "maximum_allowed": 1e16,
        }
    )
    if not magnitude_passed:
        blockers.append("Una magnitud financiera excede el límite seguro para datos expresados en USD.")
    if market_cap is not None and statement_values:
        anchor_key, anchor_value = max(statement_values.items(), key=lambda item: item[1])
        ratio = _ratio(anchor_value, market_cap)
        minimum_anchor_ratio = 1e-3 if archetype == "financial" else 5e-3
        maximum_anchor_ratio = 30.0 if archetype == "financial" else 30.0
        passed = ratio is not None and minimum_anchor_ratio <= ratio <= maximum_anchor_ratio
        checks.append(
            {
                "key": "financial_statements_vs_market_cap",
                "passed": passed,
                "required": True,
                "anchor": anchor_key,
                "anchor_value": anchor_value,
                "market_cap": market_cap,
                "anchor_to_market_cap": ratio,
                "minimum": minimum_anchor_ratio,
                "maximum": maximum_anchor_ratio,
            }
        )
        if not passed:
            blockers.append("Los estados financieros y la capitalización parecen usar escalas distintas.")
    else:
        checks.append(
            {
                "key": "financial_statements_vs_market_cap",
                "passed": False,
                "required": True,
                "reason": "missing market cap or statement scale anchor",
            }
        )
        blockers.append("Falta una referencia para reconciliar la escala de los estados financieros.")

    revenue_minimum = {
        "asset_light_growth": 0.10,
        "general": 0.05,
        "asset_heavy": 0.03,
        "capacity_cycle": 0.03,
        "financial": 0.001,
    }.get(archetype, 0.05)
    scale_specs = [("market_cap_to_revenue_scale", "revenue", revenue_minimum, 200.0)]
    if archetype != "financial":
        scale_specs.append(("market_cap_to_positive_fcff_scale", "fcff", 2.0, 2_000.0))
    for key, statement_key, minimum_multiple, maximum_multiple in scale_specs:
        denominator = _positive(current_row.get(statement_key))
        if market_cap is None or denominator is None:
            continue
        multiple = _ratio(market_cap, denominator)
        passed = multiple is not None and minimum_multiple <= multiple <= maximum_multiple
        checks.append(
            {
                "key": key,
                "passed": passed,
                "required": True,
                "market_cap": market_cap,
                "statement_value": denominator,
                "multiple": multiple,
                "minimum": minimum_multiple,
                "maximum": maximum_multiple,
            }
        )
        if not passed:
            blockers.append("Los múltiplos implícitos indican una posible diferencia de unidades en los estados.")

    if archetype == "financial" and market_cap is not None:
        for key, statement_key, minimum_multiple, maximum_multiple in (
            ("financial_market_cap_to_equity_scale", "total_equity", 0.50, 10.0),
            ("financial_market_cap_to_positive_earnings_scale", "net_income", 4.0, 100.0),
            ("financial_market_cap_to_assets_scale", "total_assets", 0.005, 5.0),
        ):
            denominator = _positive(current_row.get(statement_key))
            if denominator is None:
                continue
            multiple = _ratio(market_cap, denominator)
            passed = multiple is not None and minimum_multiple <= multiple <= maximum_multiple
            checks.append(
                {
                    "key": key,
                    "passed": passed,
                    "required": True,
                    "market_cap": market_cap,
                    "statement_value": denominator,
                    "multiple": multiple,
                    "minimum": minimum_multiple,
                    "maximum": maximum_multiple,
                }
            )
            if not passed:
                blockers.append("Precio y estados de la entidad financiera parecen usar escalas incompatibles.")

    latest_annual = annual_rows[-1] if annual_rows else {}
    continuity_specs = [
        ("ttm_revenue_vs_latest_annual", "revenue", "revenue", 0.20, 5.0),
        ("ttm_shares_vs_latest_annual", "diluted_shares", "diluted_shares", 0.50, 2.0),
        ("ttm_cash_vs_latest_annual", "cash", "cash", 0.125, 8.0),
        ("ttm_total_debt_vs_latest_annual", "total_debt", "total_debt", 0.05, 20.0),
        ("ttm_total_equity_vs_latest_annual", "total_equity", "total_equity", 0.25, 4.0),
        ("ttm_total_assets_vs_latest_annual", "total_assets", "total_assets", 0.25, 4.0),
        (
            "ttm_ebitda_vs_latest_annual",
            "ebitda",
            "ebitda",
            0.02 if archetype == "capacity_cycle" else 0.25,
            50.0 if archetype == "capacity_cycle" else 4.0,
        ),
        (
            "ttm_fcff_vs_latest_annual",
            "fcff",
            "fcff",
            0.01 if archetype == "capacity_cycle" else 0.10,
            50.0 if archetype == "capacity_cycle" else 10.0,
        ),
        (
            "ttm_net_income_vs_latest_annual",
            "net_income",
            "net_income",
            0.01 if archetype == "capacity_cycle" else 0.10,
            50.0 if archetype == "capacity_cycle" else (4.0 if archetype == "financial" else 10.0),
        ),
    ]
    if archetype == "financial":
        continuity_specs = [
            spec
            for spec in continuity_specs
            if spec[0] not in {"ttm_ebitda_vs_latest_annual", "ttm_fcff_vs_latest_annual"}
        ]
    for key, current_key, annual_key, minimum, maximum in continuity_specs:
        current_raw = _number(current_row.get(current_key))
        annual_raw = _number(latest_annual.get(annual_key))
        if current_raw is None:
            continue
        if annual_raw is None:
            checks.append(
                {
                    "key": key,
                    "passed": False,
                    "required": True,
                    "current_value": current_raw,
                    "latest_annual_value": None,
                    "reason": "missing latest annual comparator",
                }
            )
            blockers.append("Falta el comparador anual de un campo crítico de escala.")
            continue
        current_value = abs(current_raw)
        annual_value = abs(annual_raw)
        if current_value == 0 and annual_value == 0:
            ratio = 1.0
        elif annual_value == 0:
            ratio = None
        else:
            ratio = current_value / annual_value
        passed = ratio is not None and math.isfinite(ratio) and minimum <= ratio <= maximum
        checks.append(
            {
                "key": key,
                "passed": passed,
                "required": True,
                "current_value": current_value,
                "latest_annual_value": annual_value,
                "ratio": ratio,
                "minimum": minimum,
                "maximum": maximum,
            }
        )
        if not passed:
            blockers.append("Los últimos doce meses no usan la misma escala que el último estado anual.")

    plausibility_specs = () if archetype == "financial" else (
        ("current_ebitda_margin_plausibility", "ebitda", "revenue", -1.0, 0.90),
        ("current_fcff_margin_plausibility", "fcff", "revenue", -1.0, 0.80),
        ("current_fcff_to_ebitda_plausibility", "fcff", "ebitda", -2.0, 2.0),
    )
    for key, numerator_key, denominator_key, minimum, maximum in plausibility_specs:
        ratio = _ratio(current_row.get(numerator_key), current_row.get(denominator_key))
        passed = ratio is not None and minimum <= ratio <= maximum
        checks.append(
            {
                "key": key,
                "passed": passed,
                "required": True,
                "ratio": ratio,
                "minimum": minimum,
                "maximum": maximum,
            }
        )
        if not passed:
            blockers.append("Un driver de flujo no es coherente con ingresos y rentabilidad operativa.")

    calculated_fcff = _number(current_row.get("fcff"))
    provider_fcff = _number((key_metrics_ttm or {}).get("freeCashFlowToFirmTTM"))
    if calculated_fcff is not None and provider_fcff is not None:
        difference = abs(calculated_fcff - provider_fcff) / max(abs(calculated_fcff), abs(provider_fcff), 1.0)
        passed = difference <= 0.15 and (calculated_fcff == 0 or provider_fcff == 0 or calculated_fcff * provider_fcff > 0)
        checks.append(
            {
                "key": "calculated_fcff_vs_provider_ttm",
                "passed": passed,
                "required": True,
                "calculated_fcff": calculated_fcff,
                "provider_fcff": provider_fcff,
                "difference": difference,
                "maximum_difference": 0.15,
            }
        )
        if not passed:
            blockers.append("El FCFF calculado no concuerda con la métrica TTM del proveedor.")

    return {
        "passed": bool(checks) and all(check.get("passed") is True for check in checks if check.get("required", True)),
        "checks": checks,
        "blockers": list(dict.fromkeys(blockers)),
    }


def _normalized_beta(profile: dict[str, Any], archetype: str) -> dict[str, Any]:
    raw_beta = _number(profile.get("beta"))
    prior = ARCHETYPE_BETA_PRIORS.get(archetype, ARCHETYPE_BETA_PRIORS["general"])
    if raw_beta is None:
        winsorized = prior
        adjusted = prior
        source = "archetype_prior"
    else:
        winsorized = _clamp(raw_beta, BETA_WINSOR_LOWER, BETA_WINSOR_UPPER)
        adjusted = BETA_RAW_WEIGHT * winsorized + (1 - BETA_RAW_WEIGHT) * prior
        adjusted = _clamp(adjusted, BETA_WINSOR_LOWER, BETA_WINSOR_UPPER)
        source = "winsorized_raw_blended_with_archetype_prior"
    return {
        "raw_beta": raw_beta,
        "winsorized_beta": winsorized,
        "archetype_beta_prior": prior,
        "adjusted_beta": adjusted,
        "beta_raw_weight": BETA_RAW_WEIGHT,
        "beta_source": source,
    }


def _cost_of_capital(
    profile: dict[str, Any],
    current_row: dict[str, Any],
    price_validation: dict[str, Any],
    archetype: str,
    annual_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    beta_policy = _normalized_beta(profile, archetype)
    beta = float(beta_policy["adjusted_beta"])
    cost_of_equity = _clamp(DEFAULT_RISK_FREE_RATE + beta * DEFAULT_EQUITY_RISK_PREMIUM, 0.065, 0.18)
    operating_beta = float(ARCHETYPE_BETA_PRIORS.get(archetype, ARCHETYPE_BETA_PRIORS["general"]))
    operating_discount_rate = _clamp(
        DEFAULT_RISK_FREE_RATE + operating_beta * DEFAULT_EQUITY_RISK_PREMIUM,
        0.065,
        0.18,
    )
    reported_debt = max(0.0, _number(current_row.get("total_debt")) or 0.0)
    lease_claims = max(0.0, _number(current_row.get("lease_liabilities_not_in_debt")) or 0.0)
    pension_claims = max(0.0, _number(current_row.get("unfunded_pension_liability")) or 0.0)
    preferred_claims = max(0.0, _number(current_row.get("preferred_stock")) or 0.0)
    minority_claims = max(0.0, _number(current_row.get("minority_interest")) or 0.0)
    debt_like_capital = reported_debt + lease_claims + pension_claims
    observed_market_cap = _positive(price_validation.get("market_cap"))
    if observed_market_cap is None:
        shares = _positive(current_row.get("diluted_shares"))
        price = _positive(price_validation.get("price"))
        observed_market_cap = shares * price if shares is not None and price is not None else None
    equity_value_for_weights = None
    capital_structure_source = "apv_unlevered_archetype_operating_rate_no_implicit_tax_shield"
    reported_tax_rate = _number(current_row.get("tax_rate"))
    tax_rate = _clamp(0.21 if reported_tax_rate is None else reported_tax_rate, 0.0, 0.35)
    interest_expense = _positive(current_row.get("interest_expense"))
    ebitda = _number(current_row.get("ebitda"))
    interest_coverage = _ratio(ebitda, interest_expense)
    if interest_coverage is None:
        credit_spread = 0.025
    elif interest_coverage >= 8:
        credit_spread = 0.015
    elif interest_coverage >= 4:
        credit_spread = 0.025
    elif interest_coverage >= 2:
        credit_spread = 0.04
    elif interest_coverage >= 1:
        credit_spread = 0.07
    else:
        credit_spread = 0.12
    observed_debt_cost = _ratio(interest_expense, debt_like_capital)
    debt_cost = _clamp(
        max(DEFAULT_RISK_FREE_RATE + credit_spread, observed_debt_cost or 0.0),
        0.04,
        0.30,
    )
    target_debt_weight = {
        "asset_heavy": 0.30,
        "capacity_cycle": 0.25,
        "general": 0.20,
        "asset_light_growth": 0.10,
    }.get(archetype, 0.20)
    full_target_debt_to_revenue = {
        "asset_heavy": 0.50,
        "capacity_cycle": 0.35,
        "general": 0.25,
        "asset_light_growth": 0.10,
    }.get(archetype, 0.25)
    historical_revenues = [
        value
        for row in (annual_rows or [])[-5:]
        if (value := _positive(row.get("revenue"))) is not None
    ]
    current_revenue = _positive(current_row.get("revenue"))
    if len(historical_revenues) >= 3:
        capital_weight_revenue = float(median(historical_revenues))
        capital_weight_revenue_source = "median_last_five_complete_fiscal_years"
    else:
        capital_weight_revenue = current_revenue
        capital_weight_revenue_source = "current_period_fallback"
    observed_debt_to_revenue = _ratio(debt_like_capital, capital_weight_revenue)
    target_activation = _clamp(
        (observed_debt_to_revenue or 0.0) / full_target_debt_to_revenue,
        0.0,
        1.0,
    )
    # The canonical DCF is APV-like: operating FCFF is discounted without an
    # implicit perpetual tax shield.  A current debt weight must not make the
    # same business worth more merely because leverage rose or revenue entered
    # a cyclical trough.  With no debt schedule, the central case applies zero
    # tax shield and discloses only the theoretical upper bound.
    debt_weight = 0.0
    equity_weight = 1.0
    tax_shield_eligible_claims = reported_debt + lease_claims
    tax_shield_present_value = 0.0
    tax_shield_upper_bound = tax_rate * tax_shield_eligible_claims
    wacc = operating_discount_rate
    return {
        "risk_free_rate": DEFAULT_RISK_FREE_RATE,
        "equity_risk_premium": DEFAULT_EQUITY_RISK_PREMIUM,
        "capital_market_input_source": "fixed_policy_prior_not_live_market_data",
        "capital_market_inputs_as_of": None,
        "dated_capital_market_inputs": False,
        "beta": beta,
        **beta_policy,
        "cost_of_equity": cost_of_equity,
        "operating_beta": operating_beta,
        "operating_beta_source": "archetype_asset_risk_prior",
        "operating_discount_rate": operating_discount_rate,
        "pre_tax_cost_of_debt": debt_cost,
        "observed_debt_cost": observed_debt_cost,
        "interest_coverage": interest_coverage,
        "credit_spread": credit_spread,
        "observed_market_cap": observed_market_cap,
        "reported_debt": reported_debt,
        "lease_claims": lease_claims,
        "pension_claims": pension_claims,
        "preferred_claims": preferred_claims,
        "minority_claims": minority_claims,
        "debt_like_capital": debt_like_capital,
        "equity_value_for_weights": equity_value_for_weights,
        "capital_structure_source": capital_structure_source,
        "target_policy_debt_weight": target_debt_weight,
        "full_target_debt_to_revenue": full_target_debt_to_revenue,
        "observed_debt_to_revenue": observed_debt_to_revenue,
        "capital_weight_revenue": capital_weight_revenue,
        "capital_weight_revenue_source": capital_weight_revenue_source,
        "target_activation": target_activation,
        "equity_weight": equity_weight,
        "debt_weight": debt_weight,
        "tax_shield_eligible_claims": tax_shield_eligible_claims,
        "tax_shield_present_value": tax_shield_present_value,
        "tax_shield_upper_bound": tax_shield_upper_bound,
        "tax_shield_policy": "central_value_zero_without_an_explicit_reproducible_debt_schedule",
        "effective_tax_rate": tax_rate,
        "wacc": _clamp(wacc, 0.04, 0.30),
    }


def _operating_cash_separation(row: dict[str, Any], archetype: str) -> dict[str, Any]:
    """Separate operating liquidity from assets added in the EV bridge.

    CFO-based FCFF normally retains the income earned by cash and marketable
    securities. Adding every dollar of those assets to equity value would then
    count part of their economics twice. Until sourced interest income and
    trapped-cash data are available, use a transparent, conservative liquidity
    reserve and remove a policy-rate return from owner FCFF.
    """
    revenue = _positive(row.get("revenue"))
    cash = _number(row.get("cash"))
    investments = _number(row.get("non_operating_investments"))
    adjusted_fcff = _number(row.get("fcff_after_sbc"))
    tax_rate = _clamp(_number(row.get("tax_rate")) if _number(row.get("tax_rate")) is not None else 0.21, 0.0, 0.35)
    reserve_ratio = {
        "asset_light_growth": 0.02,
        "general": 0.025,
        "asset_heavy": 0.04,
        "capacity_cycle": 0.05,
    }.get(archetype, 0.03)
    calculable = bool(
        revenue is not None
        and cash is not None
        and cash >= 0
        and adjusted_fcff is not None
    )
    if not calculable:
        return {
            "complete": False,
            "reserve_ratio": reserve_ratio,
            "operating_cash_reserve": None,
            "excess_cash": None,
            "non_operating_investments": investments,
            "assets_added_to_equity": None,
            "estimated_after_tax_non_operating_income": None,
            "operating_fcff_after_sbc": None,
            "policy": "requires revenue, cash, investments and FCFF after SBC",
        }
    complete = investments is not None and investments >= 0
    investments_for_calculation = max(0.0, float(investments or 0.0))
    liquid_assets = float(cash) + investments_for_calculation
    operating_cash = min(liquid_assets, float(revenue) * reserve_ratio)
    non_operating_assets = max(0.0, liquid_assets - operating_cash)
    excess_cash = max(0.0, float(cash) - min(float(cash), operating_cash))
    estimated_after_tax_income = non_operating_assets * DEFAULT_RISK_FREE_RATE * (1 - tax_rate)
    return {
        "complete": complete,
        "reserve_ratio": reserve_ratio,
        "operating_cash_reserve": operating_cash,
        "excess_cash": excess_cash,
        "total_liquid_assets": liquid_assets,
        "excess_liquid_assets": non_operating_assets,
        "non_operating_investments": investments,
        "assets_added_to_equity": non_operating_assets,
        "estimated_after_tax_non_operating_income": estimated_after_tax_income,
        "operating_fcff_after_sbc": adjusted_fcff - estimated_after_tax_income,
        "policy": "retain a revenue-based operating liquidity reserve; add only excess cash and explicit investments; remove their estimated after-tax policy-rate income from FCFF",
    }


def _first_number(row: dict[str, Any], *keys: str, positive: bool = False) -> float | None:
    for key in keys:
        parsed = _number(row.get(key))
        if parsed is not None and (not positive or parsed > 0):
            return parsed
    return None


def _future_estimates(
    estimates: Any,
    current_date: str | None,
    current_revenue: float | None,
    market_currency: str | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows = _records(estimates)
    counters = {
        "input_rows": len(rows),
        "duplicate_years": 0,
        "non_annual_rows": 0,
        "currency_rejections": 0,
        "missing_currency_rows": 0,
        "cadence_rejections": 0,
        "scale_rejections": 0,
        "growth_rejections": 0,
        "dispersion_rejections": 0,
        "internal_consistency_rejections": 0,
        "ebitda_scale_rejections": 0,
        "ebitda_consistency_rejections": 0,
        "missing_revenue_rows": 0,
        "conflicting_duplicate_years": 0,
    }
    candidates: list[dict[str, Any]] = []
    accepted_currencies: set[str] = set()
    normalized_market_currency = str(market_currency or "").upper().strip() or None
    today = pd.Timestamp(datetime.now(timezone.utc).date())
    parsed_current_date = pd.to_datetime(current_date, errors="coerce")
    reference_date = max(today, parsed_current_date) if not pd.isna(parsed_current_date) else today

    for row in rows:
        date = _date_text(row.get("date"))
        parsed_date = pd.to_datetime(date, errors="coerce") if date else pd.NaT
        if not date or pd.isna(parsed_date) or parsed_date <= reference_date:
            continue
        period = str(row.get("period") or row.get("periodType") or row.get("period_type") or "").upper().strip()
        if period and period not in {"FY", "ANNUAL", "YEAR", "FISCAL YEAR", "12M"}:
            counters["non_annual_rows"] += 1
            continue
        row_currency = str(
            row.get("currency")
            or row.get("reportedCurrency")
            or row.get("estimatedCurrency")
            or ""
        ).upper().strip() or None
        if row_currency and normalized_market_currency and row_currency != normalized_market_currency:
            counters["currency_rejections"] += 1
            continue
        if row_currency:
            accepted_currencies.add(row_currency)
        else:
            counters["missing_currency_rows"] += 1

        average = _first_number(row, "revenueAvg", "estimatedRevenueAvg", positive=True)
        if average is None:
            counters["missing_revenue_rows"] += 1
            continue
        low = _first_number(row, "revenueLow", "estimatedRevenueLow", positive=True) or average
        high = _first_number(row, "revenueHigh", "estimatedRevenueHigh", positive=True) or average
        if low > high or not low <= average <= high:
            counters["internal_consistency_rejections"] += 1
            continue
        if low / average < 0.20 or high / average > 2.0:
            counters["dispersion_rejections"] += 1
            continue

        # EBITDA may legitimately be negative.  Losing its sign silently turns
        # an expected loss into a profitable DCF fallback.
        ebitda_average = _first_number(row, "ebitdaAvg", "estimatedEbitdaAvg")
        ebitda_low = _first_number(row, "ebitdaLow", "estimatedEbitdaLow")
        ebitda_high = _first_number(row, "ebitdaHigh", "estimatedEbitdaHigh")
        if ebitda_average is not None:
            ebitda_low = ebitda_average if ebitda_low is None else ebitda_low
            ebitda_high = ebitda_average if ebitda_high is None else ebitda_high
        if (
            ebitda_average is not None
            and ebitda_low is not None
            and ebitda_high is not None
            and (ebitda_low > ebitda_high or not ebitda_low <= ebitda_average <= ebitda_high)
        ):
            counters["ebitda_consistency_rejections"] += 1
            ebitda_low = None
            ebitda_average = None
            ebitda_high = None

        ebitda_values = [value for value in (ebitda_low, ebitda_average, ebitda_high) if value is not None]
        if ebitda_values and max(abs(value) for value in ebitda_values) / average > 0.75:
            counters["ebitda_scale_rejections"] += 1
            ebitda_low = None
            ebitda_average = None
            ebitda_high = None

        fiscal_year_raw = row.get("fiscalYear") or row.get("calendarYear") or row.get("year")
        try:
            fiscal_year = int(fiscal_year_raw) if fiscal_year_raw not in (None, "") else int(parsed_date.year)
        except (TypeError, ValueError):
            fiscal_year = int(parsed_date.year)
        explicit_observation_date = _date_text(
            row.get("updatedAt") or row.get("lastUpdated") or row.get("publishedDate")
        )
        provider_snapshot_date = _date_text(row.get("providerSnapshotAt"))
        provider_snapshot_is_traced = bool(
            str(row.get("sourceFamily") or row.get("source_family") or "").upper().strip() == "FMP"
            and row.get("provenanceBasis") == "current_provider_snapshot_retrieved_at"
        )
        observation_date = explicit_observation_date or (
            provider_snapshot_date if provider_snapshot_is_traced else None
        )
        observation_basis = (
            "provider_revision_date"
            if explicit_observation_date
            else "current_provider_snapshot_retrieved_at"
            if provider_snapshot_date and provider_snapshot_is_traced
            else None
        )
        candidates.append(
            {
                **row,
                "date": date,
                "fiscal_year": fiscal_year,
                "_observation_date": observation_date,
                "_observation_basis": observation_basis,
                "revenueLow": low,
                "revenueAvg": average,
                "revenueHigh": high,
                "ebitdaLow": ebitda_low,
                "ebitdaAvg": ebitda_average,
                "ebitdaHigh": ebitda_high,
            }
        )

    unique: list[dict[str, Any]] = []
    selected_observation_dates_by_year: dict[str, str | None] = {}
    candidates_by_year: dict[int, list[dict[str, Any]]] = {}
    for row in candidates:
        candidates_by_year.setdefault(int(row["fiscal_year"]), []).append(row)
    signature_fields = (
        "date",
        "currency",
        "reportedCurrency",
        "estimatedCurrency",
        "numberAnalystsEstimatedRevenue",
        "numberAnalystEstimatedRevenue",
        "analystCount",
        "_observation_basis",
        "revenueLow",
        "revenueAvg",
        "revenueHigh",
        "ebitdaLow",
        "ebitdaAvg",
        "ebitdaHigh",
    )
    for fiscal_year in sorted(candidates_by_year):
        revisions = candidates_by_year[fiscal_year]
        counters["duplicate_years"] += max(0, len(revisions) - 1)
        if len(revisions) == 1:
            selected = revisions[0]
        else:
            observation_dates = [row.get("_observation_date") for row in revisions]
            if all(observation_dates):
                latest_observation_date = max(str(value) for value in observation_dates)
                latest_revisions = [
                    row for row in revisions if str(row.get("_observation_date")) == latest_observation_date
                ]
                latest_signatures = {
                    tuple(row.get(field) for field in signature_fields)
                    for row in latest_revisions
                }
                if len(latest_signatures) != 1:
                    counters["conflicting_duplicate_years"] += 1
                    continue
                selected = latest_revisions[0]
            else:
                signatures = {
                    tuple(row.get(field) for field in signature_fields)
                    for row in revisions
                }
                if len(signatures) != 1:
                    counters["conflicting_duplicate_years"] += 1
                    continue
                selected = revisions[0]
        unique.append(selected)
        selected_observation_dates_by_year[str(fiscal_year)] = selected.get("_observation_date")
    unique.sort(key=lambda item: item["date"])

    clean: list[dict[str, Any]] = []
    previous_date = reference_date
    previous_revenue = _positive(current_revenue)
    for row in unique:
        parsed_date = pd.to_datetime(row["date"], errors="coerce")
        gap_days = (parsed_date - previous_date).days if not pd.isna(previous_date) else None
        minimum_gap = 270
        if gap_days is None or gap_days < minimum_gap or gap_days > 550:
            counters["cadence_rejections"] += 1
            continue
        average = float(row["revenueAvg"])
        scale_ratio = average / previous_revenue if previous_revenue is not None else None
        if scale_ratio is not None:
            if not 0.05 <= scale_ratio <= 20.0:
                counters["scale_rejections"] += 1
                continue
            if not 0.20 <= scale_ratio <= 3.0:
                counters["growth_rejections"] += 1
                continue
        clean.append(row)
        previous_date = parsed_date
        previous_revenue = average
        if len(clean) == 5:
            break

    observation_dates = [row["_observation_date"] for row in clean if row.get("_observation_date")]
    observation_bases = [row["_observation_basis"] for row in clean if row.get("_observation_basis")]
    analyst_counts = [
        count
        for row in clean
        if (
            count := _positive(
                row.get("numberAnalystsEstimatedRevenue")
                or row.get("numberAnalystEstimatedRevenue")
                or row.get("analystCount")
            )
        ) is not None
    ]
    observation_ages = [_age_days(date) for date in observation_dates]
    provenance_complete = bool(
        len(clean) >= 3
        and len(observation_dates) == len(clean)
        and len(observation_bases) == len(clean)
        and len(analyst_counts) == len(clean)
        and all(age is not None and age <= 120 for age in observation_ages)
        and all(count >= 2 for count in analyst_counts)
    )
    currency_explicit_years = sum(
        bool(str(row.get("currency") or row.get("reportedCurrency") or row.get("estimatedCurrency") or "").strip())
        for row in clean
    )
    currency_complete = bool(
        normalized_market_currency
        and len(clean) >= 3
        and currency_explicit_years == len(clean)
        and accepted_currencies == {normalized_market_currency}
    )
    validation = {
        **counters,
        "accepted_years": len(clean),
        "accepted_dates": [row["date"] for row in clean],
        "accepted_currencies": sorted(accepted_currencies),
        "currency_explicit_years": currency_explicit_years,
        "currency_complete": currency_complete,
        "market_currency": normalized_market_currency,
        "annual_sequence_validated": len(clean) >= 3,
        "ebitda_coverage_years": sum(_number(row.get("ebitdaAvg")) is not None for row in clean),
        "reference_date": str(reference_date.date()),
        "observation_dates": observation_dates,
        "observation_bases": observation_bases,
        "analyst_counts": analyst_counts,
        "selected_observation_dates_by_year": selected_observation_dates_by_year,
        "provenance_complete": provenance_complete,
        "provenance_policy": "at least three estimates observed within 120 days and supported by two or more analysts",
        "policy": "one fiscal-year estimate per year; 270-550 day cadence; matching currency; bounded units, growth and EBITDA margin",
    }
    return clean, validation


def _historical_conversion(annual_rows: list[dict[str, Any]], cash_flow_key: str) -> float | None:
    ratios: list[float] = []
    for row in annual_rows:
        cash_flow = _positive(row.get(cash_flow_key))
        ebitda = _positive(row.get("ebitda"))
        ratio = _ratio(cash_flow, ebitda)
        if ratio is not None and 0 < ratio < 1.25:
            ratios.append(ratio)
    return median(ratios) if len(ratios) >= 3 else None


def _historical_margin(annual_rows: list[dict[str, Any]], cash_flow_key: str) -> float | None:
    margins: list[float] = []
    for row in annual_rows:
        margin = _ratio(row.get(cash_flow_key), row.get("revenue"))
        if margin is not None and margin > 0:
            margins.append(margin)
    return median(margins) if margins else None


def _historical_cash_flow_evidence(annual_rows: list[dict[str, Any]], cash_flow_key: str) -> dict[str, Any]:
    evidence_window = annual_rows[-10:]
    observations = [
        value
        for row in evidence_window
        if (value := _number(row.get(cash_flow_key))) is not None
    ]
    positive_years = sum(value > 0 for value in observations)
    nonpositive_years = len(observations) - positive_years
    margins = [
        margin
        for row in evidence_window
        if (margin := _ratio(row.get(cash_flow_key), row.get("revenue"))) is not None
        and -2.0 <= margin <= 2.0
    ]
    positive_share = positive_years / len(observations) if observations else 0.0
    if margins:
        margin_series = pd.Series(margins, dtype="float64")
        median_margin = float(margin_series.median())
        dispersion = float(margin_series.quantile(0.75) - margin_series.quantile(0.25)) / max(abs(median_margin), 0.02)
    else:
        median_margin = None
        dispersion = None
    passed = (
        len(observations) >= 3
        and len(observations) == len(evidence_window)
        and len(margins) >= 3
        and positive_years >= 2
        and positive_share >= 0.60
        and dispersion is not None
        and dispersion <= 3.0
    )
    return {
        "cash_flow_key": cash_flow_key,
        "observations": len(observations),
        "expected_observations": len(evidence_window),
        "missing_observations": len(evidence_window) - len(observations),
        "positive_years": positive_years,
        "nonpositive_years": nonpositive_years,
        "positive_share": positive_share,
        "persistent_positive_regime": bool(observations) and nonpositive_years == 0,
        "median_margin": median_margin,
        "normalized_margin_dispersion": dispersion,
        "passed": passed,
        "policy": "complete annual coverage, at least three observations, 60% positive years and bounded margin-regime dispersion; generic DCF additionally requires no loss years",
    }


def _historical_trend_support(annual_rows: list[dict[str, Any]]) -> dict[str, Any]:
    observations = [
        {"date": _date_text(row.get("date")), "revenue": revenue}
        for row in annual_rows[-10:]
        if (revenue := _positive(row.get("revenue"))) is not None and _date_text(row.get("date"))
    ]
    annualized_growth: list[float] = []
    gaps: list[int] = []
    for previous, current in zip(observations, observations[1:]):
        gap_days = (pd.to_datetime(current["date"]) - pd.to_datetime(previous["date"])).days
        gaps.append(gap_days)
        if gap_days <= 0:
            continue
        years = gap_days / 365.25
        annualized_growth.append((current["revenue"] / previous["revenue"]) ** (1 / years) - 1)
    span_years = (
        (pd.to_datetime(observations[-1]["date"]) - pd.to_datetime(observations[0]["date"])).days / 365.25
        if len(observations) >= 2
        else 0.0
    )
    endpoint_cagr = (
        (observations[-1]["revenue"] / observations[0]["revenue"]) ** (1 / span_years) - 1
        if span_years > 0
        else None
    )
    median_growth = float(median(annualized_growth)) if annualized_growth else None
    dispersion = (
        float(pd.Series(annualized_growth).quantile(0.90) - pd.Series(annualized_growth).quantile(0.10))
        if len(annualized_growth) >= 3
        else None
    )
    normalized_growth = (
        _clamp(0.55 * endpoint_cagr + 0.45 * median_growth, -0.15, 0.30)
        if endpoint_cagr is not None and median_growth is not None
        else None
    )
    growth_series = pd.Series(annualized_growth, dtype="float64") if annualized_growth else None
    lower_growth = float(growth_series.quantile(0.25)) if growth_series is not None else None
    upper_growth = float(growth_series.quantile(0.75)) if growth_series is not None else None
    passed = bool(
        len(observations) >= 5
        and span_years >= 3.5
        and gaps
        and min(gaps) >= 270
        and max(gaps) <= 550
        and endpoint_cagr is not None
        and -0.25 <= endpoint_cagr <= 0.50
        and dispersion is not None
        and dispersion <= 0.60
        and all(-0.60 <= growth <= 1.00 for growth in annualized_growth)
    )
    bear_growth = (
        min(float(normalized_growth), _clamp(float(lower_growth), -0.25, 0.15))
        if passed and normalized_growth is not None and lower_growth is not None
        else None
    )
    bull_growth = (
        max(float(normalized_growth), _clamp(float(upper_growth), -0.05, 0.35))
        if passed and normalized_growth is not None and upper_growth is not None
        else None
    )
    return {
        "passed": passed,
        "observations": observations,
        "years": len(observations),
        "span_years": span_years,
        "maximum_gap_days": max(gaps) if gaps else None,
        "endpoint_cagr": endpoint_cagr,
        "median_annual_growth": median_growth,
        "growth_dispersion": dispersion,
        "normalized_growth": normalized_growth,
        "bear": bear_growth,
        "base": normalized_growth if passed else None,
        "bull": bull_growth,
        "lower_quartile_growth": lower_growth,
        "upper_quartile_growth": upper_growth,
        "policy": "at least five consecutive annual observations with bounded endpoint growth and cross-year dispersion",
    }


def _reinvestment_support(annual_rows: list[dict[str, Any]]) -> dict[str, Any]:
    evidence_window = annual_rows[-10:]
    observations: list[dict[str, float | str | None]] = []
    for row in evidence_window:
        revenue = _positive(row.get("revenue"))
        debt = _number(row.get("total_debt"))
        leases = _number(row.get("lease_liabilities_not_in_debt"))
        pension = _number(row.get("unfunded_pension_liability"))
        preferred = _number(row.get("preferred_stock"))
        minority = _number(row.get("minority_interest"))
        equity = _number(row.get("total_equity"))
        cash = _number(row.get("cash"))
        investments = _number(row.get("non_operating_investments"))
        calculated_capital = (
            debt + leases + pension + preferred + minority + equity - cash - investments
            if all(
                value is not None
                for value in (debt, leases, pension, preferred, minority, equity, cash, investments)
            )
            else None
        )
        explicit_capital = (
            calculated_capital
            if calculated_capital is not None and calculated_capital > 0
            else _positive(row.get("invested_capital"))
        )
        sales_to_capital = _ratio(revenue, explicit_capital)
        if sales_to_capital is not None and 0.10 <= sales_to_capital <= 20.0:
            observations.append(
                {
                    "date": _date_text(row.get("date")),
                    "revenue": revenue,
                    "invested_capital": explicit_capital,
                    "sales_to_capital": sales_to_capital,
                }
            )
    ratios = [float(item["sales_to_capital"]) for item in observations]
    normalized = (
        float(median(ratios))
        if len(ratios) >= 3 and len(ratios) == len(evidence_window)
        else None
    )
    return {
        "passed": normalized is not None,
        "observations": observations,
        "observed_years": len(observations),
        "required_years": len(evidence_window),
        "missing_years": len(evidence_window) - len(observations),
        "normalized_sales_to_capital": normalized,
        "policy": "incremental revenue above the verified historical growth path requires investment at the median historical sales-to-capital ratio",
    }


def _share_dilution_policy(
    annual_rows: list[dict[str, Any]],
    current_reported_shares: float,
    current_listing_shares: float,
) -> dict[str, Any]:
    observations = [
        (_date_text(row.get("date")), shares)
        for row in annual_rows[-10:]
        if (shares := _positive(row.get("diluted_shares"))) is not None and _date_text(row.get("date"))
    ]
    historical_cagr: float | None = None
    span_years = 0.0
    if len(observations) >= 2:
        first_date, first_shares = observations[0]
        last_date, last_shares = observations[-1]
        span_years = (pd.to_datetime(last_date) - pd.to_datetime(first_date)).days / 365.25
        if span_years > 0 and first_shares > 0 and last_shares > 0:
            historical_cagr = (last_shares / first_shares) ** (1 / span_years) - 1
    observed_rate = _clamp(max(0.0, historical_cagr or 0.0), 0.0, 0.15)
    exceeds_supported_dilution = historical_cagr is not None and historical_cagr > 0.15
    projected_reported_shares = current_reported_shares * ((1 + observed_rate) ** 5)
    listing_conversion = current_listing_shares / current_reported_shares
    projected_listing_shares = projected_reported_shares * listing_conversion
    return {
        "observations": len(observations),
        "span_years": span_years,
        "historical_cagr": historical_cagr,
        "observed_annual_dilution": observed_rate,
        "applied_annual_dilution": 0.0,
        "applied_to_valuation": False,
        "maximum_supported_annual_dilution": 0.15,
        "exceeds_supported_dilution": exceeds_supported_dilution,
        "current_reported_shares": current_reported_shares,
        "current_listing_shares": current_listing_shares,
        "valuation_denominator_shares": current_listing_shares,
        "projected_reported_shares_year_5": projected_reported_shares,
        "projected_listing_shares_year_5": projected_listing_shares,
        "passed": len(observations) >= 3 and span_years >= 1.5 and not exceeds_supported_dilution,
        "policy": "historical dilution is disclosed but not imposed on all present-value cash flows; observed dilution above 15% requires an explicit financing and share schedule",
    }


def _cycle_margin_distribution(annual_rows: list[dict[str, Any]], cash_flow_key: str) -> dict[str, Any]:
    observations: list[tuple[str | None, float]] = []
    for row in annual_rows[-10:]:
        margin = _ratio(row.get(cash_flow_key), row.get("revenue"))
        if margin is not None and -0.75 < margin < 0.75:
            observations.append((_date_text(row.get("date")), margin))
    values = [value for _, value in observations]
    if not values:
        return {"available": False, "observations": [], "years": 0}
    series = pd.Series(values, dtype="float64")
    lower = float(series.quantile(0.05))
    upper = float(series.quantile(0.95))
    winsorized = series.clip(lower=lower, upper=upper)
    bear = float(winsorized.quantile(0.25))
    base = float(winsorized.median())
    bull = float(winsorized.quantile(0.75))
    dates = [date for date, _ in observations if date]
    span_years = 0.0
    maximum_gap_days: int | None = None
    if len(dates) >= 2:
        parsed_dates = sorted(pd.to_datetime(date) for date in dates)
        span_years = (parsed_dates[-1] - parsed_dates[0]).days / 365.25
        maximum_gap_days = max((right - left).days for left, right in zip(parsed_dates, parsed_dates[1:]))
    weak_years = sum(value <= base - 0.03 for value in values)
    strong_years = sum(value >= base + 0.03 for value in values)
    coverage_complete = (
        len(values) >= 7
        and span_years >= 5.5
        and maximum_gap_days is not None
        and maximum_gap_days <= 550
        and weak_years >= 1
        and strong_years >= 1
    )
    return {
        "available": True,
        "observations": [{"date": date, "margin": value} for date, value in observations],
        "years": len(values),
        "span_years": span_years,
        "maximum_gap_days": maximum_gap_days,
        "weak_years": weak_years,
        "strong_years": strong_years,
        "bear": _clamp(bear, -0.35, 0.45),
        "base": _clamp(base, -0.20, 0.45),
        "bull": _clamp(bull, -0.10, 0.55),
        "coverage_complete": coverage_complete,
        "policy": "winsorized 25th/50th/75th percentiles over up to ten annual observations, including loss years",
    }


def _cycle_revenue_distribution(annual_rows: list[dict[str, Any]]) -> dict[str, Any]:
    observations = [
        {"date": _date_text(row.get("date")), "revenue": revenue}
        for row in annual_rows[-10:]
        if (revenue := _positive(row.get("revenue"))) is not None and _date_text(row.get("date"))
    ]
    observations.sort(key=lambda row: str(row["date"]))
    growth_observations: list[dict[str, Any]] = []
    gaps: list[int] = []
    for left, right in zip(observations, observations[1:]):
        left_date = pd.to_datetime(left["date"])
        right_date = pd.to_datetime(right["date"])
        gap_days = int((right_date - left_date).days)
        gaps.append(gap_days)
        years = gap_days / 365.25
        if years <= 0:
            continue
        growth = (float(right["revenue"]) / float(left["revenue"])) ** (1 / years) - 1
        if math.isfinite(growth) and -0.90 < growth < 4.0:
            growth_observations.append(
                {
                    "from": left["date"],
                    "to": right["date"],
                    "annualized_growth": growth,
                }
            )
    if len(observations) < 2 or not growth_observations:
        return {
            "available": False,
            "observations": observations,
            "growth_observations": growth_observations,
            "coverage_complete": False,
        }

    first = observations[0]
    last = observations[-1]
    span_years = (pd.to_datetime(last["date"]) - pd.to_datetime(first["date"])).days / 365.25
    endpoint_cagr = (
        (float(last["revenue"]) / float(first["revenue"])) ** (1 / span_years) - 1
        if span_years > 0
        else None
    )
    growth_series = pd.Series(
        [row["annualized_growth"] for row in growth_observations],
        dtype="float64",
    )
    lower = float(growth_series.quantile(0.10))
    upper = float(growth_series.quantile(0.90))
    robust_growth = growth_series.clip(lower=lower, upper=upper)
    median_growth = float(robust_growth.median())
    lower_growth = float(robust_growth.quantile(0.25))
    upper_growth = float(robust_growth.quantile(0.75))
    dispersion = max(0.0, upper_growth - lower_growth)
    structural_growth = (
        0.65 * float(endpoint_cagr) + 0.35 * median_growth
        if endpoint_cagr is not None
        else median_growth
    )
    maximum_gap_days = max(gaps) if gaps else None
    coverage_complete = bool(
        len(observations) >= 7
        and len(growth_observations) >= 6
        and span_years >= 5.5
        and maximum_gap_days is not None
        and maximum_gap_days <= 550
    )
    return {
        "available": True,
        "observations": observations,
        "growth_observations": growth_observations,
        "years": len(observations),
        "span_years": span_years,
        "maximum_gap_days": maximum_gap_days,
        "endpoint_cagr": endpoint_cagr,
        "median_annual_growth": median_growth,
        "growth_dispersion": dispersion,
        "bear": _clamp(min(lower_growth, structural_growth - dispersion * 0.50), -0.15, 0.12),
        "base": _clamp(structural_growth, -0.08, 0.20),
        "bull": _clamp(max(upper_growth, structural_growth + dispersion * 0.50), -0.02, 0.30),
        "coverage_complete": coverage_complete,
        "policy": "endpoint CAGR blended with winsorized annual growth; scenario growth is bounded and fades to terminal growth",
    }


def _growth_cap(archetype: str) -> float:
    return {
        "capacity_cycle": 0.60,
        "asset_light_growth": 0.50,
        "asset_heavy": 0.25,
        "general": 0.35,
        "early_stage": 0.65,
    }.get(archetype, 0.35)


def _estimate_growth_usage_validation(
    estimates: list[dict[str, Any]],
    current_revenue: float,
    valuation_date: str | None,
    archetype: str,
) -> dict[str, Any]:
    previous_revenue = current_revenue
    previous_date = pd.to_datetime(valuation_date, errors="coerce")
    growth_limit = _growth_cap(archetype)
    checks: list[dict[str, Any]] = []
    material_clips = 0
    for row in estimates:
        revenue = _positive(row.get("revenueAvg"))
        row_date = pd.to_datetime(row.get("date"), errors="coerce")
        if revenue is None or pd.isna(row_date) or pd.isna(previous_date):
            continue
        step_years = max(0.25, (row_date - previous_date).days / 365.25)
        raw_growth = (revenue / previous_revenue) ** (1 / step_years) - 1 if previous_revenue > 0 else None
        used_growth = _clamp(raw_growth, -0.45, growth_limit) if raw_growth is not None else None
        clipped = raw_growth is not None and used_growth is not None and abs(raw_growth - used_growth) > 0.05
        material_clips += int(clipped)
        checks.append(
            {
                "date": row.get("date"),
                "step_years": step_years,
                "raw_annualized_growth": raw_growth,
                "maximum_growth": growth_limit,
                "minimum_growth": -0.45,
                "materially_clipped": clipped,
            }
        )
        previous_revenue = revenue
        previous_date = row_date
    return {
        "checks": checks,
        "material_clips": material_clips,
        "passed": bool(checks) and material_clips == 0,
        "policy": "raw annualized estimate growth must fit the archetype bound without more than five percentage points of clipping",
    }


def _estimate_operating_margin_usage_validation(
    estimates: list[dict[str, Any]],
    annual_rows: list[dict[str, Any]],
    current_row: dict[str, Any],
    archetype: str,
) -> dict[str, Any]:
    current_margin = _ratio(current_row.get("ebitda"), current_row.get("revenue"))
    historical_margins = [
        margin
        for row in annual_rows[-10:]
        if (margin := _ratio(row.get("ebitda"), row.get("revenue"))) is not None
        and -0.75 <= margin <= 0.85
    ]
    anchor_candidates = [value for value in [current_margin, *historical_margins] if value is not None]
    absolute_ceiling = {
        "asset_light_growth": 0.65,
        "general": 0.60,
        "asset_heavy": 0.45,
        "capacity_cycle": 0.75,
    }.get(archetype, 0.60)
    supported_ceiling = (
        min(absolute_ceiling, max(anchor_candidates) + 0.20)
        if anchor_candidates
        else None
    )
    supported_floor = (
        max(-0.60, min(anchor_candidates) - 0.20)
        if anchor_candidates
        else None
    )
    checks: list[dict[str, Any]] = []
    previous_margin = current_margin
    violations = 0
    for row in estimates:
        margin = _ratio(row.get("ebitdaAvg"), row.get("revenueAvg"))
        if margin is None:
            continue
        step_change = margin - previous_margin if previous_margin is not None else None
        passed = bool(
            supported_floor is not None
            and supported_ceiling is not None
            and supported_floor <= margin <= supported_ceiling
            and (step_change is None or abs(step_change) <= 0.15)
        )
        violations += int(not passed)
        checks.append(
            {
                "date": row.get("date"),
                "estimated_ebitda_margin": margin,
                "change_from_previous": step_change,
                "supported_floor": supported_floor,
                "supported_ceiling": supported_ceiling,
                "maximum_annual_change": 0.15,
                "passed": passed,
            }
        )
        previous_margin = margin
    return {
        "passed": len(checks) >= 3 and violations == 0,
        "checks": checks,
        "violations": violations,
        "current_margin": current_margin,
        "historical_margins": historical_margins,
        "supported_floor": supported_floor,
        "supported_ceiling": supported_ceiling,
        "policy": "forward EBITDA margins must remain within the issuer's observed regime plus a 20-point transition band and move no more than 15 points per year",
    }


def _forecast_path(
    *,
    estimates: list[dict[str, Any]],
    scenario: str,
    starting_revenue: float,
    starting_cash_flow: float,
    starting_ebitda: float | None,
    conversion: float | None,
    cash_flow_margin: float | None,
    fallback_growth: float | None,
    archetype: str,
    terminal_growth: float,
    valuation_date: str | None,
    sales_to_capital: float | None = None,
    reinvestment_baseline_growth: float | None = None,
    cycle_margins: dict[str, Any] | None = None,
    cycle_revenue: dict[str, Any] | None = None,
) -> list[dict[str, float | str]]:
    field_suffix = {"bear": "Low", "base": "Avg", "bull": "High"}[scenario]
    conversion_factor = {"bear": 0.78, "base": 1.0, "bull": 1.12}[scenario]
    margin_delta = {"bear": -0.04, "base": 0.0, "bull": 0.035}[scenario]
    previous_revenue = starting_revenue
    path: list[dict[str, float | str]] = []
    growth_limit = _growth_cap(archetype)
    parsed_valuation_date = pd.to_datetime(valuation_date, errors="coerce")
    previous_time_years = 0.0

    for year in range(1, 6):
        estimate = estimates[year - 1] if year <= len(estimates) else None
        if estimate:
            time_years = (
                max(0.25, (pd.to_datetime(estimate.get("date")) - parsed_valuation_date).days / 365.25)
                if not pd.isna(parsed_valuation_date)
                else previous_time_years + 1.0
            )
            step_years = max(0.25, time_years - previous_time_years)
            raw_revenue = _positive(estimate.get(f"revenue{field_suffix}")) or _positive(estimate.get("revenueAvg"))
            raw_growth = (
                (raw_revenue / previous_revenue) ** (1 / step_years) - 1
                if raw_revenue and previous_revenue > 0
                else 0.0
            )
            used_growth = _clamp(raw_growth, -0.45, growth_limit)
            fade_to_mature = min(0.80, max(0.0, (year - 1) / 5))
            bounded_growth = used_growth * (1 - fade_to_mature) + terminal_growth * fade_to_mature
            revenue = previous_revenue * ((1 + bounded_growth) ** step_years)
            ebitda = _first_number(estimate, f"ebitda{field_suffix}", "ebitdaAvg")
            if ebitda is not None and raw_revenue and raw_revenue > 0:
                ebitda *= revenue / raw_revenue
        else:
            time_years = previous_time_years + 1.0
            step_years = 1.0
            raw_growth = None
            cycle_growth = (
                _number((cycle_revenue or {}).get(scenario))
                if archetype == "capacity_cycle"
                else None
            )
            starting_growth = _clamp(
                cycle_growth
                if cycle_growth is not None
                else (fallback_growth if fallback_growth is not None else terminal_growth + 0.02),
                -0.15,
                growth_limit,
            )
            fade = year / 5
            bounded_growth = starting_growth * (1 - fade) + terminal_growth * fade
            revenue = previous_revenue * (1 + bounded_growth)
            ebitda = None

        if archetype == "capacity_cycle" and cycle_margins:
            scenario_margin = _number(cycle_margins.get(scenario))
            base_cycle_margin = _number(cycle_margins.get("base"))
            if scenario_margin is None or base_cycle_margin is None or base_cycle_margin <= 0:
                return []
            terminal_factor = {"bear": 0.70, "base": 1.0, "bull": 1.10}[scenario]
            terminal_margin = _clamp(base_cycle_margin * terminal_factor, 0.005, 0.45)
            transition = min(1.0, year / 5)
            modeled_margin = scenario_margin * (1 - transition) + terminal_margin * transition
            cash_flow = revenue * modeled_margin
        elif conversion is not None and ebitda is not None:
            cash_flow = ebitda * _clamp(conversion * conversion_factor, 0.03, 0.85)
        elif ebitda is not None and ebitda <= 0:
            return []
        elif cash_flow_margin is not None:
            target_margin = _clamp(cash_flow_margin + margin_delta, 0.005, 0.55)
            transition = min(1.0, year / 3)
            current_margin = _clamp(starting_cash_flow / starting_revenue, -0.5, 0.7)
            cash_flow = revenue * (current_margin * (1 - transition) + target_margin * transition)
        else:
            return []

        incremental_reinvestment = 0.0
        supported_revenue_without_extra_investment = None
        if (
            sales_to_capital is not None
            and sales_to_capital > 0
            and reinvestment_baseline_growth is not None
        ):
            baseline_growth = _clamp(reinvestment_baseline_growth, -0.15, growth_limit)
            supported_revenue_without_extra_investment = previous_revenue * ((1 + baseline_growth) ** step_years)
            incremental_reinvestment = max(0.0, revenue - supported_revenue_without_extra_investment) / sales_to_capital
            cash_flow -= incremental_reinvestment

        path.append(
            {
                "year": year,
                "date": estimate.get("date") if estimate else f"year_{year}",
                "time_years": time_years,
                "step_years": step_years,
                "revenue": revenue,
                "raw_annualized_revenue_growth": raw_growth,
                "revenue_growth": bounded_growth,
                "cash_flow": cash_flow,
                "sales_to_capital": sales_to_capital,
                "supported_revenue_without_extra_investment": supported_revenue_without_extra_investment,
                "incremental_reinvestment": incremental_reinvestment,
                "reinvestment_baseline_growth": reinvestment_baseline_growth,
            }
        )
        previous_revenue = revenue
        previous_time_years = time_years
    return path


def _discounted_cash_flow(
    *,
    name: str,
    method: str,
    forecast: list[dict[str, Any]],
    discount_rate: float,
    terminal_growth: float,
    cash: float,
    debt: float,
    shares: float,
) -> dict[str, Any] | None:
    if not forecast or shares <= 0 or discount_rate <= terminal_growth:
        return None
    present_value = 0.0
    forecast_rows: list[dict[str, Any]] = []
    for row in forecast:
        year = int(row["year"])
        time_years = float(row.get("time_years") or year)
        cash_flow = float(row["cash_flow"])
        pv = cash_flow / ((1 + discount_rate) ** time_years)
        present_value += pv
        forecast_rows.append({**row, "discount_factor": (1 + discount_rate) ** time_years, "present_value": pv})
    terminal_sales_to_capital = _positive(forecast_rows[-1].get("sales_to_capital"))
    terminal_baseline_growth = _number(forecast_rows[-1].get("reinvestment_baseline_growth"))
    incremental_terminal_growth = max(0.0, terminal_growth - (terminal_baseline_growth or 0.0))
    terminal_reinvestment = (
        max(0.0, float(forecast_rows[-1].get("revenue") or 0.0) * incremental_terminal_growth / terminal_sales_to_capital)
        if terminal_sales_to_capital is not None and incremental_terminal_growth > 0
        else 0.0
    )
    terminal_cash_flow = float(forecast_rows[-1]["cash_flow"]) * (1 + terminal_growth) - terminal_reinvestment
    terminal_value = terminal_cash_flow / (discount_rate - terminal_growth)
    terminal_time_years = float(forecast_rows[-1].get("time_years") or len(forecast_rows))
    pv_terminal = terminal_value / ((1 + discount_rate) ** terminal_time_years)
    if method in FCFF_DCF_METHODS:
        enterprise_value = present_value + pv_terminal
        equity_value = enterprise_value + cash - debt
    else:
        enterprise_value = None
        equity_value = present_value + pv_terminal
    value_per_share = equity_value / shares
    total_pv = present_value + pv_terminal
    return {
        "name": name,
        "method": method,
        "assumptions": {
            "discount_rate": discount_rate,
            "wacc": discount_rate if method in FCFF_DCF_METHODS else None,
            "cost_of_equity": discount_rate if method == "forward_fcfe_dcf" else None,
            "terminal_growth": terminal_growth,
            "years": len(forecast_rows),
            "terminal_reinvestment": terminal_reinvestment,
            "terminal_sales_to_capital": terminal_sales_to_capital,
        },
        "forecast": forecast_rows,
        "pv_explicit_cash_flow": present_value,
        "terminal_value": terminal_value,
        "pv_terminal_value": pv_terminal,
        "terminal_value_share": pv_terminal / total_pv if total_pv > 0 else None,
        "enterprise_value": enterprise_value,
        "equity_value": equity_value,
        "intrinsic_value_per_share": value_per_share,
    }


def _residual_income_value(book_value_per_share: float, roe: float, cost_of_equity: float, terminal_growth: float) -> tuple[float, float]:
    initial_book = book_value_per_share
    book = book_value_per_share
    present_residual = 0.0
    terminal_roe = cost_of_equity + 0.01
    for year in range(1, 6):
        fade = year / 6
        year_roe = roe * (1 - fade) + terminal_roe * fade
        beginning_book = book
        earnings = year_roe * beginning_book
        residual = earnings - cost_of_equity * beginning_book
        present_residual += residual / ((1 + cost_of_equity) ** year)
        if earnings > 0 and year_roe > 0:
            retention = _clamp(max(terminal_growth, 0.0) / year_roe, 0.0, 0.8)
            dividends = earnings * (1 - retention)
        else:
            dividends = 0.0
        book = beginning_book + earnings - dividends
    terminal_residual = (terminal_roe - cost_of_equity) * book
    terminal_value = terminal_residual / max(0.025, cost_of_equity - terminal_growth)
    pv_terminal = terminal_value / ((1 + cost_of_equity) ** 5)
    return initial_book + present_residual + pv_terminal, pv_terminal


def _blocked_valuation(
    *,
    archetype: str,
    reason: str,
    price_validation: dict[str, Any],
    limitations: Iterable[str],
) -> dict[str, Any]:
    blocked_gates = {
        "validated_price": {
            "passed": price_validation.get("status") == "validated",
            "observed": price_validation.get("status"),
            "required": "validated",
        },
        "fresh_market_data": {
            "passed": price_validation.get("fresh") is True,
            "observed_age_days": price_validation.get("age_days"),
            "maximum_age_days": MAX_MARKET_DATA_AGE_DAYS,
        },
        "valuation_inputs": {
            "passed": False,
            "reason": reason,
        },
    }
    return _json_safe({
        "model_version": MODEL_VERSION,
        "available": False,
        "status": "not_decision_ready",
        "archetype": archetype,
        "primary_method": None,
        "reason": reason,
        "current_price": price_validation.get("price"),
        "currency": price_validation.get("currency"),
        "market_data_as_of": price_validation.get("as_of"),
        "price_validation": price_validation,
        "range": {"low": None, "central": None, "high": None},
        "selected_value": None,
        "scenarios": [],
        "methods": [],
        "reverse_dcf": {"available": False, "status": "not_applicable", "reason": reason, "weight": 0},
        "multiples": {},
        "reliability": {
            "usable": False,
            "status": "blocked",
            "score": 0.0,
            "reasons": [],
            "limitations": list(limitations),
            "readiness_gates": blocked_gates,
            "decision_ready_blockers": [
                key for key, gate in blocked_gates.items() if gate.get("passed") is not True
            ],
        },
    })


def _reverse_dcf(
    *,
    price: float | None,
    revenue: float,
    cash_flow_margin: float | None,
    cash: float,
    debt: float,
    shares: float,
    discount_rate: float,
    terminal_growth: float,
    method: str,
) -> dict[str, Any]:
    if price is None or price <= 0 or cash_flow_margin is None or cash_flow_margin <= 0:
        return {"available": False, "status": "missing_inputs", "reason": "Faltan precio o flujo positivo.", "method": method, "weight": 0}

    def value(growth: float) -> float:
        path: list[dict[str, Any]] = []
        year_revenue = revenue
        for year in range(1, 6):
            year_revenue *= 1 + growth
            path.append({"year": year, "date": f"year_{year}", "revenue": year_revenue, "revenue_growth": growth, "cash_flow": year_revenue * cash_flow_margin})
        scenario = _discounted_cash_flow(
            name="reverse",
            method=method,
            forecast=path,
            discount_rate=discount_rate,
            terminal_growth=terminal_growth,
            cash=cash,
            debt=debt,
            shares=shares,
        )
        return float(scenario["intrinsic_value_per_share"]) if scenario else float("nan")

    low, high = -0.25, 1.0
    low_value, high_value = value(low), value(high)
    if price < low_value:
        return {"available": True, "status": "below_range", "implied_revenue_cagr": None, "bound": "<-25%", "current_price": price, "value_at_floor": low_value, "value_at_ceiling": high_value, "method": method, "weight": 0}
    if price > high_value:
        return {"available": True, "status": "above_range", "implied_revenue_cagr": None, "bound": ">100%", "current_price": price, "value_at_floor": low_value, "value_at_ceiling": high_value, "method": method, "weight": 0}
    solved = 0.0
    for _ in range(100):
        solved = (low + high) / 2
        if value(solved) < price:
            low = solved
        else:
            high = solved
    return {
        "available": True,
        "status": "solved",
        "implied_revenue_cagr": (low + high) / 2,
        "current_price": price,
        "value_at_floor": low_value,
        "value_at_ceiling": high_value,
        "method": method,
        "weight": 0,
    }


def _build_institutional_valuation_model(
    *,
    annual_rows: list[dict[str, Any]],
    ttm_row: dict[str, Any] | None,
    profile: dict[str, Any],
    quote: dict[str, Any] | None,
    prices: Any,
    analyst_estimates: Any,
    key_metrics_ttm: dict[str, Any] | None,
    ratios_ttm: dict[str, Any] | None,
    assumptions: dict[str, Any],
    expected_ticker: str | None = None,
    source_records: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    annual_rows, annual_history_validation = _normalize_annual_history(annual_rows)
    current_row = dict(ttm_row or (annual_rows[-1] if annual_rows else {}))
    source_records = [record for record in (source_records or []) if isinstance(record, dict)]
    sbc_reconciliation_failures: list[dict[str, Any]] = []

    def attach_owner_fcff(row: dict[str, Any], label: str) -> None:
        reported_fcff = _number(row.get("fcff"))
        stock_compensation = _number(row.get("stock_based_compensation"))
        explicit_adjusted = _number(row.get("fcff_after_sbc"))
        calculated_adjusted = (
            reported_fcff - stock_compensation
            if reported_fcff is not None and stock_compensation is not None and stock_compensation >= 0
            else None
        )
        if explicit_adjusted is not None and calculated_adjusted is not None:
            difference = abs(explicit_adjusted - calculated_adjusted) / max(
                abs(explicit_adjusted), abs(calculated_adjusted), 1.0
            )
            if difference > 0.02:
                sbc_reconciliation_failures.append(
                    {
                        "period": label,
                        "reported_adjusted_fcff": explicit_adjusted,
                        "calculated_adjusted_fcff": calculated_adjusted,
                        "difference": difference,
                    }
                )
        row["fcff_after_sbc"] = calculated_adjusted

    for annual_row in annual_rows:
        attach_owner_fcff(annual_row, str(annual_row.get("date") or "annual"))
    attach_owner_fcff(current_row, str(current_row.get("date") or "current"))
    sbc_annual_years = sum(_number(row.get("fcff_after_sbc")) is not None for row in annual_rows)
    sbc_treatment_complete = bool(
        _number(current_row.get("fcff_after_sbc")) is not None
        and len(annual_rows) >= 3
        and sbc_annual_years == len(annual_rows)
        and not sbc_reconciliation_failures
    )
    key_metrics_ttm = key_metrics_ttm or {}
    ratios_ttm = ratios_ttm or {}
    market_currency = str(
        profile.get("currency")
        or (quote or {}).get("currency")
        or ""
    ).upper().strip() or None
    estimates, estimate_validation = _future_estimates(
        analyst_estimates,
        _date_text(current_row.get("date")),
        _positive(current_row.get("revenue")),
        market_currency,
    )
    estimate_metadata_usable = bool(
        estimate_validation.get("currency_complete") is True
        and estimate_validation.get("provenance_complete") is True
        and int(estimate_validation.get("conflicting_duplicate_years") or 0) == 0
    )
    archetype = classify_archetype(
        profile,
        current_row,
        estimates if estimate_metadata_usable else [],
        annual_rows,
    )
    reported_shares = _positive(current_row.get("diluted_shares"))
    price_validation = validate_market_price(profile, quote, prices, reported_shares, expected_ticker)
    market_currency = str(price_validation.get("currency") or market_currency or "").upper().strip() or None
    estimate_growth_usage = _estimate_growth_usage_validation(
        estimates,
        _positive(current_row.get("revenue")) or 1.0,
        price_validation.get("as_of") or _date_text(current_row.get("date")),
        archetype,
    )
    estimate_validation["growth_usage"] = estimate_growth_usage
    estimate_margin_usage = _estimate_operating_margin_usage_validation(
        estimates,
        annual_rows,
        current_row,
        archetype,
    )
    estimate_validation["operating_margin_usage"] = estimate_margin_usage
    estimate_ebitda_coverage = int(estimate_validation.get("ebitda_coverage_years") or 0)
    if archetype == "financial":
        estimate_path_usable = False
    elif archetype == "capacity_cycle":
        estimate_path_usable = (
            len(estimates) >= 3
            and estimate_growth_usage["passed"]
            and estimate_margin_usage["passed"]
            and estimate_metadata_usable
        )
    else:
        estimate_path_usable = (
            len(estimates) >= 3
            and estimate_ebitda_coverage >= 3
            and estimate_growth_usage["passed"]
            and estimate_margin_usage["passed"]
            and estimate_metadata_usable
        )
    forecast_estimates = estimates if estimate_path_usable else []
    estimate_validation["used_in_valuation"] = estimate_path_usable
    estimate_validation["exclusion_reason"] = (
        None
        if estimate_path_usable or not estimates
        else "consensus failed currency, provenance, revision, growth or operating-margin validation and was excluded rather than clipped"
    )
    shares = _positive(price_validation.get("valuation_shares"))
    share_dilution = (
        _share_dilution_policy(annual_rows, reported_shares, shares)
        if reported_shares is not None and shares is not None
        else None
    )
    # Enterprise value is a present value. Applying year-five shares to every
    # cash flow would penalize near-term value without recognizing financing
    # proceeds. Until an explicit issuance schedule exists, use the reconciled
    # current listing denominator and disclose observed dilution separately.
    model_shares = shares
    financial_currency = str(current_row.get("reported_currency") or "").upper().strip() or None
    currency_consistent = financial_currency is not None and market_currency is not None and financial_currency == market_currency
    annual_currencies = {
        str(row.get("reported_currency") or "").upper().strip()
        for row in annual_rows
        if str(row.get("reported_currency") or "").strip()
    }
    annual_currency_explicit_years = sum(
        bool(str(row.get("reported_currency") or "").strip()) for row in annual_rows
    )
    historical_currency_consistent = bool(
        annual_rows
        and annual_currency_explicit_years == len(annual_rows)
        and financial_currency is not None
        and annual_currencies == {financial_currency}
    )
    ttm_validation_status = str(((ttm_row or {}).get("ttm_validation") or {}).get("status") or "missing")
    latest_annual_date = _date_text(annual_rows[-1].get("date")) if annual_rows else None
    current_financial_date = _date_text(current_row.get("date"))
    latest_to_current_days = (
        (pd.to_datetime(current_financial_date) - pd.to_datetime(latest_annual_date)).days
        if latest_annual_date and current_financial_date
        else None
    )
    annual_history_validation["latest_annual_date"] = latest_annual_date
    annual_history_validation["current_financial_date"] = current_financial_date
    annual_history_validation["latest_to_current_days"] = latest_to_current_days
    annual_history_validation["maximum_latest_to_current_days"] = 550
    annual_history_stale = bool(
        ttm_row
        and latest_to_current_days is not None
        and latest_to_current_days > 550
    )
    if annual_history_stale:
        annual_history_validation["passed"] = False
        annual_history_validation["stale_relative_to_ttm"] = True
    if not annual_history_validation["passed"]:
        blocked = _blocked_valuation(
            archetype=archetype,
            reason=(
                "El historial anual está demasiado alejado de los últimos doce meses."
                if annual_history_stale
                else "El historial anual contiene una fecha inválida, futura o duplicada con cifras incompatibles."
            ),
            price_validation=price_validation,
            limitations=["Solo se aceptan estados publicados y una observación por ejercicio fiscal."],
        )
        blocked["annual_history_validation"] = annual_history_validation
        return _json_safe(blocked)
    if price_validation.get("status") in {"blocked", "inconsistent"}:
        return _blocked_valuation(
            archetype=archetype,
            reason=(price_validation.get("blockers") or ["No se pudo confirmar la identidad y escala del instrumento."])[0],
            price_validation=price_validation,
            limitations=["No se calcula un rango por acción con datos de mercado incompatibles o de otro instrumento."],
        )
    invalid_balance_fields = [
        field
        for field in (
            "cash",
            "total_debt",
            "total_assets",
            "diluted_shares",
            "goodwill_and_intangibles",
            "preferred_stock",
            "minority_interest",
            "unfunded_pension_liability",
            "lease_liabilities_not_in_debt",
            "non_operating_investments",
        )
        if (value := _number(current_row.get(field))) is not None and value < 0
    ]
    if invalid_balance_fields:
        return _blocked_valuation(
            archetype=archetype,
            reason="Los estados contienen saldos negativos en campos que requieren una magnitud positiva.",
            price_validation=price_validation,
            limitations=[f"Campos inválidos: {', '.join(invalid_balance_fields)}."],
        )
    if current_row.get("interest_expense_sign_ambiguous") is True or any(
        row.get("interest_expense_sign_ambiguous") is True for row in annual_rows
    ):
        return _blocked_valuation(
            archetype=archetype,
            reason="El signo del gasto o ingreso neto por intereses es ambiguo.",
            price_validation=price_validation,
            limitations=["Se requiere separar gasto financiero e ingreso por caja antes de convertir FCF en FCFF."],
        )
    ttm_financial_age = _age_days((ttm_row or {}).get("date")) if ttm_row else None
    if ttm_row and (ttm_financial_age is None or ttm_financial_age > MAX_FINANCIAL_DATA_AGE_DAYS):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="La fecha de los últimos doce meses es inválida o demasiado antigua para valorar hoy.",
            price_validation=price_validation,
            limitations=[
                f"Edad financiera observada: {ttm_financial_age if ttm_financial_age is not None else 'inválida'}; máximo: {MAX_FINANCIAL_DATA_AGE_DAYS} días."
            ],
        )
        blocked["financial_data_validation"] = {
            "passed": False,
            "date": _date_text((ttm_row or {}).get("date")),
            "age_days": ttm_financial_age,
            "maximum_age_days": MAX_FINANCIAL_DATA_AGE_DAYS,
        }
        return _json_safe(blocked)
    if archetype == "specialized_real_assets":
        return _blocked_valuation(
            archetype=archetype,
            reason="Esta empresa requiere AFFO y NAV; un DCF corporativo no es apropiado.",
            price_validation=price_validation,
            limitations=["Faltan AFFO, deuda por activo y tasas de capitalización comparables."],
        )
    if archetype == "early_stage":
        return _blocked_valuation(
            archetype=archetype,
            reason="Una empresa temprana requiere un modelo de hitos y probabilidad; no se aplica un DCF genérico.",
            price_validation=price_validation,
            limitations=["Se requieren hitos, probabilidad de éxito, caja disponible, consumo de caja y dilución esperada."],
        )
    if archetype == "specialized_security":
        return _blocked_valuation(
            archetype=archetype,
            reason="Este instrumento requiere un modelo específico de activos, distribuciones o estructura societaria.",
            price_validation=price_validation,
            limitations=["No se aplica un DCF corporativo genérico a fondos, SPAC, BDC o royalty trusts."],
        )
    if archetype == "specialized_financial":
        return _blocked_valuation(
            archetype=archetype,
            reason="La actividad financiera requiere un modelo específico antes de publicar un rango.",
            price_validation=price_validation,
            limitations=["Se necesitan capital regulatorio, activos administrados, comisiones, exposición de balance y una taxonomía de negocio confirmada."],
        )
    if archetype == "unknown":
        return _blocked_valuation(
            archetype=archetype,
            reason="Falta una clasificación sectorial suficiente para elegir el método de valoración.",
            price_validation=price_validation,
            limitations=["Se requieren sector e industria explícitos para distinguir financieras, activos reales, ciclos, software y empresas tempranas."],
        )
    if share_dilution is not None and share_dilution.get("passed") is not True:
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="La dilución histórica no puede proyectarse sin un calendario explícito de emisiones y financiación.",
            price_validation=price_validation,
            limitations=["No se publica un valor por acción cuando el crecimiento del denominador supera 15% anual o el historial de acciones es insuficiente."],
        )
        blocked["share_dilution"] = share_dilution
        blocked["reliability"]["readiness_gates"]["share_dilution_support"] = {
            "passed": False,
            "observed": share_dilution,
        }
        blocked["reliability"]["decision_ready_blockers"].append("share_dilution_support")
        return _json_safe(blocked)
    if archetype != "financial" and not sbc_treatment_complete:
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="El costo de la compensación en acciones no está completo para todos los ejercicios utilizados.",
            price_validation=price_validation,
            limitations=["Falta SBC explícito o la reconciliación FCFF menos SBC en al menos un período; BLS no trata un dato ausente como cero."],
        )
        blocked["stock_compensation_treatment"] = {
            "complete": False,
            "annual_years": sbc_annual_years,
            "required_annual_years": len(annual_rows),
            "reconciliation_failures": sbc_reconciliation_failures,
        }
        blocked["reliability"]["readiness_gates"]["stock_compensation_treatment"] = {
            "passed": False,
            "annual_years": sbc_annual_years,
            "required_annual_years": len(annual_rows),
            "reconciliation_failures": sbc_reconciliation_failures,
        }
        blocked["reliability"]["decision_ready_blockers"].append("stock_compensation_treatment")
        return _json_safe(blocked)
    if current_row.get("currency_mismatch") is True:
        return _blocked_valuation(
            archetype=archetype,
            reason="Los estados financieros combinan monedas distintas sin conversión.",
            price_validation=price_validation,
            limitations=[f"Monedas detectadas: {', '.join(current_row.get('reported_currencies') or []) or 'sin identificar'}."],
        )
    if financial_currency and market_currency and financial_currency != market_currency:
        return _blocked_valuation(
            archetype=archetype,
            reason="La moneda de los estados financieros no coincide con la moneda de cotización.",
            price_validation=price_validation,
            limitations=["Se requiere una conversión FX fechada antes de calcular un valor por acción."],
        )
    if len(annual_currencies) > 1 or (
        annual_currencies and financial_currency and annual_currencies != {financial_currency}
    ):
        return _blocked_valuation(
            archetype=archetype,
            reason="El historial financiero mezcla monedas o no coincide con la moneda de los últimos doce meses.",
            price_validation=price_validation,
            limitations=[f"Monedas anuales detectadas: {', '.join(sorted(annual_currencies)) or 'sin identificar'}."],
        )
    if market_currency and market_currency != "USD":
        return _blocked_valuation(
            archetype=archetype,
            reason="La curva de descuento disponible está expresada en USD y no puede aplicarse a flujos en otra moneda.",
            price_validation=price_validation,
            limitations=["Se requiere una tasa libre de riesgo, prima de mercado e inflación coherentes con la moneda de los flujos."],
        )
    country = str(profile.get("country") or "").lower().strip()
    is_adr_security = bool(
        profile.get("isAdr") is True
        or profile.get("isADR") is True
        or _positive(profile.get("adrRatio")) is not None
        or _positive(profile.get("adr_ratio")) is not None
    )
    if not country:
        return _blocked_valuation(
            archetype=archetype,
            reason=(
                "Falta el país del emisor subyacente del ADR."
                if is_adr_security
                else "Falta el país del emisor para seleccionar una curva de descuento coherente."
            ),
            price_validation=price_validation,
            limitations=["Se requiere el domicilio del emisor para aplicar riesgo país, convertibilidad y retenciones de forma coherente."],
        )
    developed_markets = {
        "us", "usa", "united states", "united states of america",
        "nl", "netherlands", "gb", "uk", "united kingdom", "ca", "canada",
        "au", "australia", "jp", "japan", "de", "germany", "fr", "france",
        "ch", "switzerland", "se", "sweden", "dk", "denmark", "no", "norway",
        "fi", "finland", "ie", "ireland", "sg", "singapore", "nz", "new zealand",
        "be", "belgium", "at", "austria",
    }
    if country and country not in developed_markets:
        return _blocked_valuation(
            archetype=archetype,
            reason="El emisor requiere una prima de riesgo país y controles de convertibilidad que aún no están fechados en el modelo.",
            price_validation=price_validation,
            limitations=["No se aplica automáticamente una curva estadounidense a un emisor domiciliado fuera de Estados Unidos."],
        )
    fundamental_scale_validation = validate_fundamental_scale(
        current_row,
        annual_rows,
        price_validation,
        key_metrics_ttm,
        archetype,
    )

    if not fundamental_scale_validation.get("passed"):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="No se pudo reconciliar la escala de los estados financieros con precio, acciones y capitalización.",
            price_validation=price_validation,
            limitations=fundamental_scale_validation.get("blockers") or ["La escala financiera requiere revisión."],
        )
        blocked["fundamental_scale_validation"] = fundamental_scale_validation
        return _json_safe(blocked)

    if ttm_validation_status == "provider_ttm_mismatch":
        return _blocked_valuation(
            archetype=archetype,
            reason="Los últimos doce meses no concuerdan con el estado TTM independiente del proveedor.",
            price_validation=price_validation,
            limitations=["La valoración queda bloqueada hasta reconciliar ingresos, caja operativa y capex TTM."],
        )
    # Inspect the accepted raw consensus, not only the subset that passed the
    # margin-transition gate. Otherwise a uniformly loss-making outlook can be
    # excluded and silently replaced by a profitable historical fallback.
    forward_ebitda = [
        value
        for row in estimates
        if (value := _number(row.get("ebitdaAvg"))) is not None
    ]
    if estimate_metadata_usable and len(forward_ebitda) >= 3 and all(value <= 0 for value in forward_ebitda):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="Las estimaciones anuales disponibles anticipan pérdidas operativas; un margen positivo implícito no sería defendible.",
            price_validation=price_validation,
            limitations=["Se requiere un modelo explícito de transición a rentabilidad, consumo de caja y financiación."],
        )
        blocked["estimate_validation"] = estimate_validation
        return _json_safe(blocked)
    if estimate_metadata_usable and len(forward_ebitda) >= 3 and forward_ebitda[-1] <= 0:
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="Las estimaciones recientes anticipan una transición a pérdidas operativas que el modelo genérico no puede sustituir por una historia rentable.",
            price_validation=price_validation,
            limitations=["Se requiere un modelo explícito de deterioro, consumo de caja, financiación y eventual recuperación."],
        )
        blocked["estimate_validation"] = estimate_validation
        return _json_safe(blocked)
    cycle_terminal_revenue = _positive(estimates[-1].get("revenueAvg")) if estimates else None
    cycle_historical_revenues = [
        revenue_value
        for row in annual_rows
        if (revenue_value := _positive(row.get("revenue"))) is not None
    ]
    if (
        archetype == "capacity_cycle"
        and estimate_metadata_usable
        and len(estimates) >= 3
        and cycle_terminal_revenue is not None
        and cycle_historical_revenues
        and cycle_terminal_revenue < 0.50 * min(cycle_historical_revenues)
    ):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="Las estimaciones recientes anticipan una contracción por debajo del ciclo histórico verificable.",
            price_validation=price_validation,
            limitations=["Un promedio de ciclo no puede reemplazar una posible ruptura estructural de demanda, capacidad o cuota de mercado."],
        )
        blocked["estimate_validation"] = estimate_validation
        return _json_safe(blocked)
    economically_conflicting_consensus = bool(
        archetype != "capacity_cycle"
        and estimate_metadata_usable
        and len(estimates) >= 3
        and (
            (
                bool(estimate_growth_usage.get("checks"))
                and estimate_growth_usage.get("passed") is not True
            )
            or (
                bool(estimate_margin_usage.get("checks"))
                and estimate_margin_usage.get("passed") is not True
            )
        )
    )
    if economically_conflicting_consensus:
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="Las estimaciones recientes y el régimen histórico son económicamente incompatibles.",
            price_validation=price_validation,
            limitations=["BLS no descarta evidencia futura adversa o extraordinaria para volver automáticamente a una tendencia histórica más favorable."],
        )
        blocked["estimate_validation"] = estimate_validation
        return _json_safe(blocked)

    if not current_row or shares is None or _positive(current_row.get("revenue")) is None:
        return _blocked_valuation(
            archetype=archetype,
            reason="Faltan ingresos, acciones o estados financieros actuales.",
            price_validation=price_validation,
            limitations=["No se publica un valor por acción sin un denominador reconciliado."],
        )

    if archetype != "financial" and _positive(current_row.get("total_equity")) is None:
        return _blocked_valuation(
            archetype=archetype,
            reason="El patrimonio contable no es positivo y no existe una estructura de capital objetivo verificable.",
            price_validation=price_validation,
            limitations=["No se asigna deuda cero ni un WACC no apalancado por defecto cuando el patrimonio contable es nulo o negativo."],
        )

    capital = _cost_of_capital(
        profile,
        current_row,
        price_validation,
        archetype,
        annual_rows=annual_rows,
    )
    revenue = float(current_row["revenue"])
    cash_raw = _number(current_row.get("cash"))
    debt_raw = _number(current_row.get("total_debt"))
    cash = cash_raw if cash_raw is not None else None
    debt = debt_raw if debt_raw is not None else None
    optional_bridge_fields = (
        "preferred_stock",
        "minority_interest",
        "unfunded_pension_liability",
        "lease_liabilities_not_in_debt",
        "non_operating_investments",
    )
    bridge_inputs = {field: _number(current_row.get(field)) for field in optional_bridge_fields}
    missing_bridge_fields = [field for field, value in bridge_inputs.items() if value is None]
    sensitivity_claim_fields = {
        "preferred_stock",
        "minority_interest",
        "unfunded_pension_liability",
    }
    hard_missing_bridge_fields = [
        field for field in missing_bridge_fields if field not in sensitivity_claim_fields
    ]
    latest_annual_bridge_row = annual_rows[-1] if annual_rows else {}
    book_equity_for_bridge = (
        _positive(current_row.get("total_equity"))
        or _positive(latest_annual_bridge_row.get("total_equity"))
    )
    book_capital_for_bridge = (
        (book_equity_for_bridge or 0.0) + (debt or 0.0)
        if book_equity_for_bridge is not None
        else None
    )
    unresolved_claims: list[dict[str, Any]] = []
    source_records_by_id = {
        str(record.get("source_id") or "").strip(): record
        for record in source_records
        if str(record.get("source_id") or "").strip()
    }
    source_target_names = {
        "preferred_stock": "preferredStock",
        "minority_interest": "minorityInterest",
        "unfunded_pension_liability": "unfundedPensionLiability",
    }
    for field in missing_bridge_fields:
        if field not in sensitivity_claim_fields:
            continue
        candidate_upper_bound = _number(current_row.get(f"{field}_upper_bound"))
        upper_bound_basis = str(current_row.get(f"{field}_upper_bound_basis") or "").strip()
        upper_bound_source_id = str(current_row.get(f"{field}_upper_bound_source_id") or "").strip()
        upper_bound_as_of = _date_text(current_row.get(f"{field}_upper_bound_as_of"))
        upper_bound_currency = str(current_row.get(f"{field}_upper_bound_currency") or "").upper().strip()
        upper_bound_unit = str(current_row.get(f"{field}_upper_bound_unit") or "").upper().strip()
        source_record = source_records_by_id.get(upper_bound_source_id) or {}
        source_enrichments = [
            item
            for item in (source_record.get("field_enrichments") or [])
            if isinstance(item, dict) and item.get("field") == field
        ]
        matching_enrichments = [
            item
            for item in source_enrichments
            if _date_text(item.get("source_as_of")) == upper_bound_as_of
            and str(item.get("basis") or "").strip() == upper_bound_basis
        ]
        source_field_supported = bool(
            source_target_names.get(field) in (source_record.get("targets_covered") or [])
            and matching_enrichments
        )
        amount_verified = bool(
            candidate_upper_bound is not None
            and any(
                (
                    _number(item.get("value")) is not None
                    and math.isclose(
                        float(candidate_upper_bound),
                        float(_number(item.get("value")) or 0.0),
                        rel_tol=1e-6,
                        abs_tol=max(1e-6, abs(float(candidate_upper_bound)) * 1e-6),
                    )
                )
                or (
                    _number(item.get("upper_bound")) is not None
                    and 0 <= float(candidate_upper_bound) <= float(_number(item.get("upper_bound")) or 0.0)
                )
                for item in matching_enrichments
            )
        )
        source_verified = bool(
            source_record
            and str(source_record.get("status") or "").lower() == "ok"
            and (
                not upper_bound_source_id.startswith("sec:companyfacts:")
                or _authentic_sec_company_facts_record(source_record, expected_ticker)
            )
            and source_field_supported
            and amount_verified
        )
        bound_date = pd.to_datetime(upper_bound_as_of, errors="coerce")
        current_date = pd.to_datetime(current_row.get("date"), errors="coerce")
        bound_age_days = (
            int((current_date - bound_date).days)
            if not pd.isna(bound_date) and not pd.isna(current_date)
            else None
        )
        metadata_verified = bool(
            upper_bound_as_of
            and bound_age_days is not None
            and 0 <= bound_age_days <= 550
            and financial_currency
            and upper_bound_currency == financial_currency
            and upper_bound_unit == financial_currency
        )
        defensible = bool(
            candidate_upper_bound is not None
            and candidate_upper_bound >= 0
            and upper_bound_basis
            and upper_bound_source_id
            and source_verified
            and metadata_verified
        )
        unresolved_claims.append(
            {
                "field": field,
                "lower_bound": 0.0,
                "upper_bound": candidate_upper_bound if defensible else None,
                "basis": upper_bound_basis if defensible else "not_observed_no_source_backed_bound",
                "source_id": upper_bound_source_id or None,
                "source_verified": source_verified,
                "amount_verified": amount_verified,
                "metadata_verified": metadata_verified,
                "as_of": upper_bound_as_of,
                "currency": upper_bound_currency or None,
                "unit": upper_bound_unit or None,
                "age_days": bound_age_days,
                "defensible": defensible,
                "policy": "source_backed_claim_bound_required_when_the_balance_sheet_value_is_not_observed",
            }
        )
    unresolved_claim_fields = [
        field for field in missing_bridge_fields if field in sensitivity_claim_fields
    ]
    unresolved_claims_bounded = bool(
        len(unresolved_claims) == len(unresolved_claim_fields)
        and all(item.get("defensible") is True for item in unresolved_claims)
    )
    bridge_uncertainty_upper = sum(
        _number(item.get("upper_bound")) or 0.0 for item in unresolved_claims
    )
    bridge_uncertainty_materiality = _ratio(
        bridge_uncertainty_upper,
        book_capital_for_bridge,
    )
    bridge_uncertainty_supported = unresolved_claims_bounded
    pension_claim = max(0.0, bridge_inputs["unfunded_pension_liability"] or 0.0)
    validated_price_for_bridge = _positive(price_validation.get("price"))
    market_cap_for_bridge = (
        validated_price_for_bridge * shares
        if validated_price_for_bridge is not None and shares > 0
        else None
    )
    revenue_materiality_threshold = abs(revenue) * 0.005
    market_cap_materiality_threshold = (
        market_cap_for_bridge * 0.01 if market_cap_for_bridge is not None else None
    )
    bridge_materiality_candidates = [revenue_materiality_threshold]
    if market_cap_for_bridge is not None:
        bridge_materiality_candidates.append(market_cap_materiality_threshold)
    pension_materiality_threshold = max(1e-9, min(bridge_materiality_candidates))
    pension_material = pension_claim > pension_materiality_threshold
    pension_source_id = str(current_row.get("unfunded_pension_liability_source_id") or "").strip()
    pension_source_record = source_records_by_id.get(pension_source_id) or {}
    pension_basis = str(current_row.get("unfunded_pension_liability_basis") or "").strip()
    pension_as_of = _date_text(current_row.get("unfunded_pension_liability_as_of"))
    pension_date = pd.to_datetime(pension_as_of, errors="coerce")
    pension_current_date = pd.to_datetime(current_row.get("date"), errors="coerce")
    pension_age_days = (
        int((pension_current_date - pension_date).days)
        if not pd.isna(pension_current_date) and not pd.isna(pension_date)
        else None
    )
    pension_enrichments = [
        item
        for item in (pension_source_record.get("field_enrichments") or [])
        if isinstance(item, dict)
        and item.get("field") == "unfunded_pension_liability"
        and item.get("frame") == "balance_ttm"
        and _date_text(item.get("date")) == _date_text(current_row.get("date"))
        and _date_text(item.get("source_as_of")) == pension_as_of
        and str(item.get("basis") or "").strip() == pension_basis
        and _number(item.get("value")) is not None
        and math.isclose(
            float(_number(item.get("value")) or 0.0),
            pension_claim,
            rel_tol=1e-8,
            abs_tol=max(1e-9, pension_claim * 1e-8),
        )
    ]
    pension_source_backed = bool(
        pension_source_id == "sec:companyfacts:balance"
        and _authentic_sec_company_facts_record(pension_source_record, expected_ticker)
        and str(pension_source_record.get("status") or "").lower() == "ok"
        and "unfundedPensionLiability" in (pension_source_record.get("targets_covered") or [])
        and pension_basis == "benefit_obligation_less_plan_assets"
        and pension_as_of
        and pension_age_days is not None
        and 0 <= pension_age_days <= 550
        and pension_enrichments
    )
    pension_claim_passed = bool(not pension_material or pension_source_backed)
    unreconciled_pension_periods = (
        []
        if pension_claim_passed
        else [_date_text(current_row.get("date")) or "unknown"]
    )
    pension_claim_reconciliation = {
        "passed": pension_claim_passed,
        "material": pension_material,
        "materiality_threshold": pension_materiality_threshold,
        "source_backed": pension_source_backed,
        "source_id": pension_source_id or None,
        "as_of": pension_as_of,
        "age_days": pension_age_days,
        "unreconciled_periods": unreconciled_pension_periods,
        "policy": (
            "immaterial_claim_deducted_without_changing_the_decision"
            if not pension_material
            else "deduct_source_backed_net_pension_deficit_as_a_senior_claim_and_retain_reported_contributions_as_recurring_owner_cost"
            if pension_source_backed
            else "show_full_to_zero_claim_sensitivity_until_the_net_pension_deficit_is_source_backed"
        ),
    }
    cash_separation = _operating_cash_separation(current_row, archetype) if archetype != "financial" else None
    annual_cash_separations: list[dict[str, Any]] = []
    if archetype != "financial":
        for annual_row in annual_rows:
            annual_cash_separation = _operating_cash_separation(annual_row, archetype)
            annual_cash_separations.append(annual_cash_separation)
            annual_row["operating_fcff_after_sbc"] = annual_cash_separation.get("operating_fcff_after_sbc")
        current_row["operating_fcff_after_sbc"] = (cash_separation or {}).get("operating_fcff_after_sbc")
    bridge_assets = (
        (_number((cash_separation or {}).get("assets_added_to_equity")) or 0.0)
        if archetype != "financial"
        else (cash or 0.0) + (bridge_inputs["non_operating_investments"] or 0.0)
    )
    pension_sensitivity_applied = bool(pension_material and not pension_claim_passed)
    exact_bridge_obligations_before_pension = (debt or 0.0) + sum(
        bridge_inputs[field] or 0.0
        for field in (
            "preferred_stock",
            "minority_interest",
            "lease_liabilities_not_in_debt",
        )
    )
    pension_scenario_obligations = (
        {"bear": pension_claim, "base": pension_claim * 0.5, "bull": 0.0}
        if pension_sensitivity_applied
        else {"bear": pension_claim, "base": pension_claim, "bull": pension_claim}
    )
    scenario_bridge_obligations = {
        "bear": exact_bridge_obligations_before_pension + pension_scenario_obligations["bear"] + bridge_uncertainty_upper,
        "base": exact_bridge_obligations_before_pension + pension_scenario_obligations["base"] + bridge_uncertainty_upper * 0.5,
        "bull": exact_bridge_obligations_before_pension + pension_scenario_obligations["bull"],
    }
    bridge_obligations = scenario_bridge_obligations["base"]
    bridge_exact = not missing_bridge_fields and not pension_sensitivity_applied
    bridge_calculation_complete = bool(
        not hard_missing_bridge_fields and bridge_uncertainty_supported
    )
    equity_bridge = {
        "cash_and_equivalents": cash,
        "operating_cash_reserve": (cash_separation or {}).get("operating_cash_reserve"),
        "excess_cash": (cash_separation or {}).get("excess_cash"),
        "estimated_after_tax_non_operating_income": (cash_separation or {}).get("estimated_after_tax_non_operating_income"),
        "non_operating_investments": bridge_inputs["non_operating_investments"],
        "total_debt": debt,
        "preferred_stock": bridge_inputs["preferred_stock"],
        "minority_interest": bridge_inputs["minority_interest"],
        "unfunded_pension_liability": bridge_inputs["unfunded_pension_liability"],
        "unfunded_pension_liability_basis": current_row.get("unfunded_pension_liability_basis"),
        "unfunded_pension_liability_as_of": current_row.get("unfunded_pension_liability_as_of"),
        "unfunded_pension_liability_source_id": current_row.get("unfunded_pension_liability_source_id"),
        "lease_liabilities_not_in_debt": bridge_inputs["lease_liabilities_not_in_debt"],
        "assets_added": bridge_assets,
        "obligations_deducted": bridge_obligations,
        "scenario_obligations": scenario_bridge_obligations,
        "pension_scenario_obligations": pension_scenario_obligations,
        "pension_claim_reconciliation": pension_claim_reconciliation,
        "missing_optional_fields": missing_bridge_fields,
        "unresolved_claims": unresolved_claims,
        "uncertainty_upper_bound": bridge_uncertainty_upper,
        "uncertainty_to_book_capital": bridge_uncertainty_materiality,
        "exact": bridge_exact,
        "complete": bridge_exact,
        "calculation_complete": bridge_calculation_complete,
        "cash_separation": cash_separation,
    }
    historical_cash_separation_complete = bool(
        archetype == "financial"
        or (
            len(annual_cash_separations) == len(annual_rows)
            and len(annual_rows) >= 3
            and all(item.get("complete") is True for item in annual_cash_separations)
        )
    )
    if not bridge_calculation_complete or (
        archetype != "financial"
        and ((cash_separation or {}).get("complete") is not True or not historical_cash_separation_complete)
    ):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="El puente entre valor empresa y patrimonio o la separación de caja no está completo.",
            price_validation=price_validation,
            limitations=["Caja, inversiones, deuda y arrendamientos deben reconciliarse; una obligación no observada solo puede continuar con un límite respaldado por una fuente identificable."],
        )
        blocked["equity_bridge"] = equity_bridge
        blocked["operating_cash_separation"] = cash_separation
        blocked["historical_cash_separation"] = {
            "complete": historical_cash_separation_complete,
            "observed_years": sum(item.get("complete") is True for item in annual_cash_separations),
            "required_years": len(annual_rows),
        }
        blocked["reliability"]["readiness_gates"]["equity_bridge_completeness"] = {
            "passed": False,
            "missing_optional_fields": missing_bridge_fields,
            "hard_missing_fields": hard_missing_bridge_fields,
            "unresolved_claims": unresolved_claims,
        }
        blocked["reliability"]["readiness_gates"]["operating_cash_separation"] = {
            "passed": False,
            "current": cash_separation,
            "historical_complete": historical_cash_separation_complete,
        }
        blocked["reliability"]["decision_ready_blockers"].extend(
            ["equity_bridge_completeness", "operating_cash_separation"]
        )
        return _json_safe(blocked)
    book_equity_for_capital = _positive(current_row.get("total_equity")) or 0.0
    other_capital_claims = sum(
        max(0.0, bridge_inputs[field] or 0.0)
        for field in (
            "preferred_stock",
            "minority_interest",
            "unfunded_pension_liability",
            "lease_liabilities_not_in_debt",
        )
    ) + bridge_uncertainty_upper
    other_claims_to_book_capital = _ratio(
        other_capital_claims,
        (debt or 0.0) + book_equity_for_capital,
    )
    capital_structure_support = bool(
        archetype == "financial"
        or (
            book_equity_for_capital > 0
            and other_claims_to_book_capital is not None
            and other_claims_to_book_capital <= 0.10
        )
    )
    current_ebitda = _positive(current_row.get("ebitda"))
    cycle_margins: dict[str, Any] | None = None
    cycle_revenue: dict[str, Any] | None = None
    structural_cycle_break = False
    historical_trend = _historical_trend_support(annual_rows)
    reinvestment_evidence = _reinvestment_support(annual_rows)
    reinvestment_baseline_growth = (
        _number(historical_trend.get("normalized_growth"))
        if historical_trend.get("passed") is True
        else _number(assumptions.get("base_revenue_growth"))
    )
    reinvestment_baseline_source = (
        "verified_historical_trend"
        if historical_trend.get("passed") is True
        else "explicit_assumption"
        if reinvestment_baseline_growth is not None
        else "missing"
    )
    reinvestment_evidence["baseline_growth"] = reinvestment_baseline_growth
    reinvestment_evidence["baseline_source"] = reinvestment_baseline_source
    reinvestment_evidence["baseline_complete"] = reinvestment_baseline_growth is not None
    historical_tangible_roes: list[float] = []

    if (
        archetype not in {"financial", "capacity_cycle"}
        and not estimate_path_usable
        and historical_trend.get("passed") is not True
    ):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="No hay una trayectoria futura respaldada por consenso validado ni por suficiente historia operativa.",
            price_validation=price_validation,
            limitations=["Sin consenso utilizable se requieren al menos cinco ejercicios consecutivos para construir escenarios históricos."],
        )
        blocked["estimate_validation"] = estimate_validation
        blocked["historical_trend_normalization"] = historical_trend
        blocked["reliability"]["readiness_gates"]["future_estimate_support"] = {
            "passed": False,
            "observed_years": len(estimates),
            "required_years": 3,
            "basis": "insufficient",
            "consensus_used": False,
            "validation": estimate_validation,
        }
        blocked["reliability"]["decision_ready_blockers"].append("future_estimate_support")
        return _json_safe(blocked)

    if (
        archetype not in {"financial", "capacity_cycle"}
        and estimate_path_usable
        and reinvestment_baseline_growth is None
    ):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="Falta una trayectoria base verificable para separar crecimiento normal de crecimiento incremental.",
            price_validation=price_validation,
            limitations=["Sin una base histórica o un supuesto explícito, el modelo no puede calcular la reinversión exigida por las estimaciones."],
        )
        blocked["reinvestment_support"] = reinvestment_evidence
        blocked["reliability"]["readiness_gates"]["growth_reinvestment_support"] = {
            "passed": False,
            "baseline_growth": None,
            "required": "verified_historical_trend_or_explicit_growth_baseline",
        }
        blocked["reliability"]["decision_ready_blockers"].append("growth_reinvestment_support")
        return _json_safe(blocked)

    if (
        archetype != "financial"
        and (archetype != "capacity_cycle" or estimate_path_usable)
        and reinvestment_evidence.get("passed") is not True
    ):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="No hay suficiente evidencia de capital necesario para financiar el crecimiento.",
            price_validation=price_validation,
            limitations=["Se requieren al menos tres ejercicios con ingresos y capital invertido para no convertir crecimiento en caja sin reinversión."],
        )
        blocked["reinvestment_support"] = reinvestment_evidence
        return _json_safe(blocked)

    if archetype == "financial":
        equity = _positive(current_row.get("total_equity"))
        goodwill = _number(current_row.get("goodwill_and_intangibles"))
        preferred_stock = _number(current_row.get("preferred_stock"))
        net_income = _number(current_row.get("net_income"))
        if equity is None or goodwill is None or preferred_stock is None or net_income is None:
            return _blocked_valuation(
                archetype=archetype,
                reason="Faltan patrimonio común tangible o utilidad para el modelo de ingreso residual.",
                price_validation=price_validation,
                limitations=["Se requieren patrimonio, goodwill, intangibles y acciones preferentes para no sobrestimar el valor contable común."],
            )
        tangible_common_equity = equity - max(0.0, goodwill) - max(0.0, preferred_stock)
        if tangible_common_equity <= 0:
            return _blocked_valuation(
                archetype=archetype,
                reason="El patrimonio común tangible no es positivo.",
                price_validation=price_validation,
                limitations=["El modelo de ingreso residual no es interpretable con patrimonio común tangible nulo o negativo."],
            )
        book_value_per_share = tangible_common_equity / model_shares
        current_roe = net_income / tangible_common_equity
        if not -0.25 <= current_roe <= 0.50:
            return _blocked_valuation(
                archetype=archetype,
                reason="La rentabilidad sobre patrimonio común tangible requiere reconciliación antes de valorarla.",
                price_validation=price_validation,
                limitations=[f"ROE tangible observado: {current_roe:.1%}; rango admitido: -25% a 50%."],
            )
        historical_tangible_roes = []
        for row in annual_rows:
            historical_equity = _number(row.get("total_equity"))
            historical_goodwill = _number(row.get("goodwill_and_intangibles"))
            historical_preferred = _number(row.get("preferred_stock"))
            if historical_equity is None or historical_goodwill is None or historical_preferred is None:
                continue
            historical_tce = historical_equity - max(0.0, historical_goodwill) - max(0.0, historical_preferred)
            if historical_tce <= 0:
                continue
            ratio = _ratio(row.get("net_income"), historical_tce)
            if ratio is not None and -0.25 <= ratio <= 0.50:
                historical_tangible_roes.append(ratio)
        normalized_roe = _clamp(
            0.6 * current_roe
            + 0.4 * (median(historical_tangible_roes) if historical_tangible_roes else current_roe),
            -0.2,
            0.45,
        )
        scenarios: list[dict[str, Any]] = []
        for name, roe_delta, rate_delta in (("bear", -0.04, 0.012), ("base", 0.0, 0.0), ("bull", 0.04, -0.008)):
            rate = _clamp(capital["cost_of_equity"] + rate_delta, 0.065, 0.2)
            scenario_roe = _clamp(normalized_roe + roe_delta, -0.2, 0.50)
            value, pv_terminal = _residual_income_value(book_value_per_share, scenario_roe, rate, 0.02)
            scenarios.append(
                {
                    "name": name,
                    "method": "residual_income",
                    "assumptions": {"normalized_roe": scenario_roe, "cost_of_equity": rate, "terminal_growth": 0.02},
                    "forecast": [],
                    "pv_terminal_value": pv_terminal * model_shares,
                    "terminal_value_share": pv_terminal / value if value > 0 else None,
                    "enterprise_value": None,
                    "equity_value": value * model_shares,
                    "intrinsic_value_per_share": value,
                }
            )
        method = "residual_income"
        cash_flow_basis = "residual_income"
        base_cash_flow = None
        discount_rate = capital["cost_of_equity"]
        terminal_growth = 0.02
    else:
        calculated_fcff = _number(current_row.get("fcff"))
        provider_fcff = _number(key_metrics_ttm.get("freeCashFlowToFirmTTM"))
        observed_fcff = _number(current_row.get("operating_fcff_after_sbc"))
        fcff = _positive(observed_fcff)
        fcfe = (
            _positive(key_metrics_ttm.get("freeCashFlowToEquityTTM"))
            if key_metrics_ttm.get("freeCashFlowToEquityReconciled") is True
            else None
        )
        if archetype == "capacity_cycle":
            cycle_margins = _cycle_margin_distribution(annual_rows, "operating_fcff_after_sbc")
            cycle_revenue = _cycle_revenue_distribution(annual_rows)
            scale_ttm_validation = (ttm_row or {}).get("ttm_validation") or {}
            scale_sec_families = scale_ttm_validation.get("sec_quarterly_families") or {}
            scale_sec_metrics = {
                str(metric)
                for metric in (scale_ttm_validation.get("sec_reconciled_metrics") or [])
            }
            scale_provider_checks = scale_ttm_validation.get("provider_ttm_checks") or []

            def scale_metric_reconciled(metric: str) -> bool:
                family = scale_sec_families.get(metric) or {}
                if scale_ttm_validation.get("discrete_periods_confirmed") is not True:
                    return False
                if family:
                    return bool(
                        family.get("passed") is True
                        and family.get("coverage_complete") is True
                        and metric in scale_sec_metrics
                    )
                return metric in scale_sec_metrics

            scale_revenue_reconciled = scale_metric_reconciled("revenue")
            scale_shares_reconciled = bool(
                scale_metric_reconciled("diluted_shares")
                and price_validation.get("denominator_reconciled") is True
                and model_shares is not None
            )
            scale_inputs_reconciled = bool(
                scale_revenue_reconciled
                and scale_shares_reconciled
            )

            provider_balance_date = _date_text(scale_ttm_validation.get("provider_ttm_balance_date"))
            current_financial_date = pd.to_datetime(current_row.get("date"), errors="coerce")
            provider_balance_timestamp = pd.to_datetime(provider_balance_date, errors="coerce")
            provider_balance_age_days = (
                int((current_financial_date - provider_balance_timestamp).days)
                if not pd.isna(current_financial_date) and not pd.isna(provider_balance_timestamp)
                else None
            )
            provider_balance_date_current = bool(
                provider_balance_age_days is not None
                and 0 <= provider_balance_age_days <= 45
            )
            provider_balance_currency = str(
                scale_ttm_validation.get("provider_ttm_balance_currency") or ""
            ).upper().strip() or None
            requirements_currency_reconciled = bool(
                currency_consistent
                and historical_currency_consistent
                and scale_ttm_validation.get("currency_reconciled") is True
                and scale_ttm_validation.get("provider_ttm_balance_currency_reconciled") is True
                and financial_currency
                and market_currency
                and provider_balance_currency == financial_currency == market_currency
            )

            def bridge_metric_reconciliation(metric: str) -> dict[str, Any]:
                current_value = _number((ttm_row or {}).get(metric))
                candidates = [
                    check
                    for check in scale_provider_checks
                    if str(check.get("metric") or "") == metric
                ]
                if current_value is None or len(candidates) != 1:
                    return {
                        "metric": metric,
                        "passed": False,
                        "current_value": current_value,
                        "calculated_value": None,
                        "provider_value": None,
                        "difference": None,
                        "maximum_difference": None,
                        "basis": "provider_ttm_balance",
                    }
                check = candidates[0]
                calculated_value = _number(check.get("calculated_value"))
                provider_value = _number(check.get("provider_value"))
                maximum_difference = _number(check.get("maximum_difference"))
                difference = (
                    abs(provider_value - current_value)
                    / max(abs(provider_value), abs(current_value), 1.0)
                    if provider_value is not None
                    else None
                )
                passed = bool(
                    scale_ttm_validation.get("discrete_periods_confirmed") is True
                    and provider_balance_date_current
                    and scale_ttm_validation.get("provider_ttm_balance_currency_reconciled") is True
                    and provider_balance_date
                    and check.get("passed") is True
                    and calculated_value is not None
                    and provider_value is not None
                    and maximum_difference is not None
                    and 0 <= maximum_difference <= 0.05
                    and difference is not None
                    and difference <= maximum_difference
                    and abs(calculated_value - current_value)
                    <= max(1e-9, abs(current_value) * 1e-8)
                )
                return {
                    "metric": metric,
                    "passed": passed,
                    "current_value": current_value,
                    "calculated_value": calculated_value,
                    "provider_value": provider_value,
                    "difference": difference,
                    "maximum_difference": maximum_difference,
                    "basis": "provider_ttm_balance",
                }

            bridge_materiality_threshold = pension_materiality_threshold
            provider_bridge_metrics = (
                "cash",
                "total_debt",
                "non_operating_investments",
                "preferred_stock",
                "minority_interest",
                "lease_liabilities_not_in_debt",
            )
            required_provider_bridge_metrics = ["cash", "total_debt"] + [
                metric
                for metric in provider_bridge_metrics[2:]
                if abs(_number((ttm_row or {}).get(metric)) or 0.0) > bridge_materiality_threshold
            ]
            bridge_reconciliation_metrics = {
                metric: bridge_metric_reconciliation(metric)
                for metric in required_provider_bridge_metrics
            }
            pension_value = max(0.0, _number((ttm_row or {}).get("unfunded_pension_liability")) or 0.0)
            pension_material = pension_value > bridge_materiality_threshold
            pension_source_id = str(
                (ttm_row or {}).get("unfunded_pension_liability_source_id") or ""
            ).strip()
            pension_source_record = source_records_by_id.get(pension_source_id) or {}
            pension_as_of = _date_text((ttm_row or {}).get("unfunded_pension_liability_as_of"))
            pension_date = pd.to_datetime(pension_as_of, errors="coerce")
            financial_date = pd.to_datetime(current_row.get("date"), errors="coerce")
            pension_age_days = (
                int((financial_date - pension_date).days)
                if not pd.isna(pension_date) and not pd.isna(financial_date)
                else None
            )
            pension_reconciled = bool(
                not pension_material
                or (
                    pension_source_id
                    and str(pension_source_record.get("status") or "").lower() == "ok"
                    and pension_as_of
                    and pension_age_days is not None
                    and 0 <= pension_age_days <= 550
                    and pension_claim_reconciliation.get("passed") is True
                )
            )
            if pension_material:
                bridge_reconciliation_metrics["unfunded_pension_liability"] = {
                    "metric": "unfunded_pension_liability",
                    "passed": pension_reconciled,
                    "current_value": pension_value,
                    "calculated_value": pension_value,
                    "provider_value": pension_value if pension_reconciled else None,
                    "difference": 0.0 if pension_reconciled else None,
                    "maximum_difference": 0.0,
                    "basis": "source_backed_pension_claim",
                    "source_id": pension_source_id or None,
                    "as_of": pension_as_of,
                }
            required_bridge_metrics = [
                *required_provider_bridge_metrics,
                *(["unfunded_pension_liability"] if pension_material else []),
            ]
            equity_bridge_inputs_reconciled = bool(
                requirements_currency_reconciled
                and required_bridge_metrics
                and all(
                    bridge_reconciliation_metrics.get(metric, {}).get("passed") is True
                    for metric in required_bridge_metrics
                )
            )
            equity_bridge_reconciliation = {
                "passed": equity_bridge_inputs_reconciled,
                "materiality_threshold": bridge_materiality_threshold,
                "materiality_revenue_threshold": revenue_materiality_threshold,
                "materiality_market_cap_threshold": market_cap_materiality_threshold,
                "materiality_market_cap": market_cap_for_bridge,
                "materiality_valuation_shares": shares,
                "materiality_share_basis": "reconciled_listing_shares",
                "required_metrics": required_bridge_metrics,
                "metrics": [bridge_reconciliation_metrics[metric] for metric in required_bridge_metrics],
                "provider_balance_date": provider_balance_date,
                "provider_balance_date_age_days": provider_balance_age_days,
                "provider_balance_date_current": provider_balance_date_current,
                "financial_currency": financial_currency,
                "market_currency": market_currency,
                "provider_balance_currency": provider_balance_currency,
                "currency_reconciled": requirements_currency_reconciled,
            }
            historical_cycle_revenues = [
                value
                for observation in cycle_revenue.get("observations", [])
                if (value := _positive(observation.get("revenue"))) is not None
            ]
            current_to_historical_peak = (
                revenue / max(historical_cycle_revenues)
                if historical_cycle_revenues
                else None
            )
            current_revenue_level_supported = bool(
                current_to_historical_peak is not None
                and 0.25 <= current_to_historical_peak <= 1.75
            )
            structural_cycle_break = bool(
                current_to_historical_peak is not None
                and not current_revenue_level_supported
                and scale_inputs_reconciled
            )
            current_level_usable_for_research = current_revenue_level_supported
            cycle_revenue.update(
                {
                    "current_revenue": revenue,
                    "historical_peak_revenue": max(historical_cycle_revenues) if historical_cycle_revenues else None,
                    "current_to_historical_peak": current_to_historical_peak,
                    "supported_current_level_floor": 0.25,
                    "supported_current_level_ceiling": 1.75,
                    "maximum_structural_break_multiple": 4.0,
                    "current_level_supported": current_revenue_level_supported,
                    "current_level_usable_for_research": current_level_usable_for_research,
                    "structural_break": structural_cycle_break,
                    "scale_inputs_reconciled": scale_inputs_reconciled,
                    "scale_revenue_reconciled": scale_revenue_reconciled,
                    "scale_shares_reconciled": scale_shares_reconciled,
                }
            )
            cycle_margins["observed_current_fcff"] = _number(current_row.get("fcff_after_sbc"))
            cycle_margins["observed_current_operating_fcff"] = observed_fcff
            current_cycle_margin = _ratio(observed_fcff, revenue)
            historical_cycle_margins = [
                value
                for observation in cycle_margins.get("observations", [])
                if (value := _number(observation.get("margin"))) is not None
            ]
            supported_margin_floor = (
                max(-0.25, min(historical_cycle_margins) - 0.10)
                if historical_cycle_margins
                else None
            )
            supported_margin_ceiling = (
                min(0.65, max(historical_cycle_margins) + 0.15)
                if historical_cycle_margins
                else None
            )
            current_regime_supported = bool(
                current_cycle_margin is not None
                and supported_margin_floor is not None
                and supported_margin_ceiling is not None
                and supported_margin_floor <= current_cycle_margin <= supported_margin_ceiling
            )
            cycle_margins.update(
                {
                    "current_margin": current_cycle_margin,
                    "supported_current_margin_floor": supported_margin_floor,
                    "supported_current_margin_ceiling": supported_margin_ceiling,
                    "current_regime_supported": current_regime_supported,
                }
            )
            if not current_level_usable_for_research:
                requirements_equity_bridge_complete = bool(
                    cash is not None
                    and debt is not None
                    and (cash_separation or {}).get("complete") is True
                    and equity_bridge.get("exact") is True
                    and equity_bridge_inputs_reconciled
                )
                scale_reconciliation_gap = (
                    []
                    if scale_inputs_reconciled
                    else ["ttm_scale_inputs_reconciliation"]
                )
                equity_bridge_gap = (
                    []
                    if equity_bridge_inputs_reconciled
                    else ["ttm_equity_bridge_reconciliation"]
                ) + (
                    []
                    if cash is not None
                    and debt is not None
                    and equity_bridge.get("exact") is True
                    and (cash_separation or {}).get("complete") is True
                    else ["equity_bridge_completeness"]
                )
                structural_scale_bridge = {
                    "passed": False,
                    "required": True,
                    "observed_ttm_to_historical_peak": current_to_historical_peak,
                    "scale_inputs_reconciled": scale_inputs_reconciled,
                    "equity_bridge_inputs_reconciled": equity_bridge_inputs_reconciled,
                    "equity_bridge_reconciliation": equity_bridge_reconciliation,
                    "reconciled_metrics": sorted(scale_sec_metrics),
                    "missing": scale_reconciliation_gap
                    + ([] if requirements_currency_reconciled else ["currency_consistency"])
                    + equity_bridge_gap + [
                        "capacity_and_asset_turnover_support",
                        "organic_or_acquisition_revenue_bridge",
                        "segment_reconciliation",
                    ],
                    "policy": "a_reconciled_ttm_proves_the_reported_scale_not_its_sustainable_economics",
                }
                normalized_margin = _positive(cycle_margins.get("base"))
                requirements_cycle_coverage_complete = bool(
                    cycle_margins.get("coverage_complete") is True
                    and cycle_revenue.get("coverage_complete") is True
                )
                requirements_discount_rate = _positive(capital.get("wacc"))
                requirements_price_status = str(price_validation.get("status") or "").lower()
                requirements_price_context = (
                    "validated"
                    if requirements_price_status == "validated" and price_validation.get("usable") is True
                    else "provider_reconciled"
                    if requirements_price_status == "provider_reconciled"
                    and price_validation.get("research_usable") is True
                    else None
                )
                requirements_price_usable = bool(
                    requirements_price_context
                    and price_validation.get("fresh") is True
                    and _positive(price_validation.get("price")) is not None
                    and _date_text(price_validation.get("as_of"))
                )
                requirement_result = (
                    _reverse_dcf(
                        price=_positive(price_validation.get("price")),
                        revenue=revenue,
                        cash_flow_margin=normalized_margin,
                        cash=bridge_assets,
                        debt=scenario_bridge_obligations["base"],
                        shares=model_shares,
                        discount_rate=requirements_discount_rate,
                        terminal_growth=0.02,
                        method="market_implied_operating_requirements",
                    )
                    if structural_cycle_break
                    and requirements_price_usable
                    and requirements_cycle_coverage_complete
                    and requirements_equity_bridge_complete
                    and normalized_margin is not None
                    and requirements_discount_rate is not None
                    and model_shares is not None
                    else {
                        "available": False,
                        "status": (
                            "price_not_research_usable"
                            if structural_cycle_break and not requirements_price_usable
                            else "insufficient_cycle_coverage"
                            if structural_cycle_break and not requirements_cycle_coverage_complete
                            else "equity_bridge_incomplete"
                            if structural_cycle_break and not requirements_equity_bridge_complete
                            else "missing_inputs"
                        ),
                        "implied_revenue_cagr": None,
                        "bound": None,
                    }
                )
                blocked = _blocked_valuation(
                    archetype=archetype,
                    reason=(
                        "Los últimos doce meses confirman un cambio de escala contable, pero falta explicar económicamente ese salto."
                        if structural_cycle_break
                        else "El nivel de ingresos de los últimos doce meses queda fuera del ciclo histórico verificable."
                    ),
                    price_validation=price_validation,
                    limitations=[
                        "Antes de publicar valor razonable se requiere reconciliar capacidad, rotación de activos, adquisiciones o desinversiones y segmentos."
                    ],
                )
                blocked["cycle_revenue_normalization"] = cycle_revenue
                blocked["cycle_normalization"] = cycle_margins
                blocked["financial_data_as_of"] = _date_text(current_row.get("date"))
                blocked["structural_scale_bridge"] = structural_scale_bridge
                blocked["equity_bridge"] = equity_bridge
                blocked["operating_cash_separation"] = cash_separation
                blocked["market_requirements"] = {
                    "available": requirement_result.get("available") is True,
                    "status": requirement_result.get("status"),
                    "implied_revenue_cagr": _number(requirement_result.get("implied_revenue_cagr")),
                    "implied_revenue_cagr_bound": requirement_result.get("bound"),
                    "normalized_margin": normalized_margin,
                    "discount_rate": requirements_discount_rate,
                    "terminal_growth": 0.02,
                    "horizon_years": 5,
                    "price_context": requirements_price_context,
                    "reference_price": _positive(price_validation.get("price")) if requirements_price_usable else None,
                    "market_data_as_of": _date_text(price_validation.get("as_of")) if requirements_price_usable else None,
                    "currency": price_validation.get("currency") if requirements_price_usable else None,
                    "assets_added": bridge_assets if requirements_equity_bridge_complete else None,
                    "obligations_deducted": (
                        scenario_bridge_obligations["base"]
                        if requirements_equity_bridge_complete
                        else None
                    ),
                }
                blocked["estimate_validation"] = estimate_validation
                blocked["stock_compensation_treatment"] = {
                    "complete": sbc_treatment_complete,
                    "current_stock_based_compensation": _number(current_row.get("stock_based_compensation")),
                    "reported_fcff": _number(current_row.get("fcff")),
                    "fcff_after_sbc": _number(current_row.get("fcff_after_sbc")),
                    "annual_years": sbc_annual_years,
                    "reconciliation_failures": sbc_reconciliation_failures,
                    "future_dilution_modeled": False,
                }
                blocked["reliability"]["readiness_gates"]["structural_scale_bridge"] = structural_scale_bridge
                blocked["reliability"]["decision_ready_blockers"].append("structural_scale_bridge")
                return _json_safe(blocked)
            if (
                observed_fcff is None
                or cash is None
                or debt is None
                or not cycle_margins.get("available")
                or not cycle_revenue.get("available")
                or int(cycle_margins.get("years") or 0) < 5
                or (_number(cycle_margins.get("base")) or 0) <= 0
            ):
                return _blocked_valuation(
                    archetype=archetype,
                    reason="No hay un ciclo financiero completo y reconciliado para normalizar la valoración.",
                    price_validation=price_validation,
                    limitations=["Se requieren al menos cinco años de FCFF, incluidos años débiles, además de caja y deuda actuales."],
                )
            method = "through_cycle_fcff_dcf"
            cash_flow_basis = "through_cycle_operating_FCFF_after_SBC"
            base_cash_flow = revenue * float(cycle_margins["base"])
            cash_flow_key = "operating_fcff_after_sbc"
            discount_rate = capital["wacc"]
        elif fcff is not None and cash is not None and debt is not None:
            method = "forward_fcff_dcf"
            cash_flow_basis = "operating_FCFF_after_SBC"
            base_cash_flow = fcff
            cash_flow_key = "operating_fcff_after_sbc"
            discount_rate = capital["wacc"]
        elif fcfe is not None:
            method = "forward_fcfe_dcf"
            cash_flow_basis = "FCFE"
            base_cash_flow = fcfe
            cash_flow_key = "free_cash_flow"
            discount_rate = capital["cost_of_equity"]
        else:
            return _blocked_valuation(
                archetype=archetype,
                reason="No hay FCFF o FCFE positivo para sostener una valoración.",
                price_validation=price_validation,
                limitations=["No se capitaliza un FCFE sin reconciliar deuda emitida y amortizada, ni se sustituye un flujo negativo por un margen positivo supuesto."],
            )

        current_conversion = _ratio(base_cash_flow, current_ebitda)
        historical_conversion = _historical_conversion(annual_rows, cash_flow_key) if cash_flow_basis != "FCFE" else None
        if archetype == "capacity_cycle":
            conversion = None
        elif current_conversion is not None and historical_conversion is not None:
            conversion = _clamp(0.3 * current_conversion + 0.7 * historical_conversion, 0.03, 0.85)
        else:
            conversion = None
        current_margin = _ratio(base_cash_flow, revenue)
        historical_margin = _historical_margin(annual_rows, cash_flow_key) if cash_flow_basis != "FCFE" else None
        if archetype == "capacity_cycle" and cycle_margins:
            cash_flow_margin = _number(cycle_margins.get("base"))
        elif current_margin is not None:
            cash_flow_margin = _clamp(0.3 * current_margin + 0.7 * (historical_margin if historical_margin is not None else current_margin), 0.005, 0.55)
        else:
            cash_flow_margin = historical_margin
        terminal_growth = 0.02 if archetype in {"capacity_cycle", "asset_heavy"} else 0.025
        scenarios = []
        for name, rate_delta in (("bear", 0.015), ("base", 0.0), ("bull", -0.01)):
            forecast = _forecast_path(
                estimates=forecast_estimates,
                scenario=name,
                starting_revenue=revenue,
                starting_cash_flow=base_cash_flow,
                starting_ebitda=current_ebitda,
                conversion=conversion,
                cash_flow_margin=cash_flow_margin,
                fallback_growth=(
                    _number(historical_trend.get(name))
                    if historical_trend.get("passed") is True
                    else _number(assumptions.get("base_revenue_growth"))
                ),
                archetype=archetype,
                terminal_growth=terminal_growth,
                valuation_date=price_validation.get("as_of") or _date_text(current_row.get("date")),
                sales_to_capital=_number(reinvestment_evidence.get("normalized_sales_to_capital")),
                reinvestment_baseline_growth=reinvestment_baseline_growth,
                cycle_margins=cycle_margins,
                cycle_revenue=cycle_revenue,
            )
            scenario = _discounted_cash_flow(
                name=name,
                method=method,
                forecast=forecast,
                discount_rate=_clamp(discount_rate + rate_delta, 0.04, 0.32),
                terminal_growth=terminal_growth + ({"bear": -0.005, "base": 0.0, "bull": 0.005}[name]),
                cash=bridge_assets,
                debt=scenario_bridge_obligations[name],
                shares=model_shares,
            )
            if scenario:
                scenarios.append(scenario)
        if len(scenarios) != 3:
            return _blocked_valuation(
                archetype=archetype,
                reason="No fue posible construir tres escenarios coherentes.",
                price_validation=price_validation,
                limitations=["Faltan márgenes o conversiones de caja defendibles."],
            )

    by_name = {scenario["name"]: scenario for scenario in scenarios}
    base_value = _positive(by_name.get("base", {}).get("intrinsic_value_per_share"))
    ordered_scenario_values = [
        _positive(by_name.get(name, {}).get("intrinsic_value_per_share"))
        for name in ("bear", "base", "bull")
    ]
    scenario_values = sorted(value for value in ordered_scenario_values if value is not None)
    if base_value is None or len(scenario_values) != 3:
        return _blocked_valuation(
            archetype=archetype,
            reason="Los escenarios no producen valores por acción comparables.",
            price_validation=price_validation,
            limitations=["La valoración no supera los controles de unidad y denominador."],
        )
    if not (
        ordered_scenario_values[0] <= ordered_scenario_values[1] <= ordered_scenario_values[2]
    ):
        blocked = _blocked_valuation(
            archetype=archetype,
            reason="Los escenarios no conservan el orden económico bear, base y bull.",
            price_validation=price_validation,
            limitations=["Un escenario favorable no puede producir menos valor que el escenario base o adverso."],
        )
        blocked["scenario_order_validation"] = {
            "passed": False,
            "bear": ordered_scenario_values[0],
            "base": ordered_scenario_values[1],
            "bull": ordered_scenario_values[2],
        }
        return _json_safe(blocked)

    methods = [{"key": method, "role": "primary", "value_per_share": base_value, "weight": 1.0, "currency": price_validation.get("currency")}]
    central_value = base_value
    method_disagreement: float | None = None
    if archetype != "financial" and base_cash_flow is not None:
        normalized_cash_flow = base_cash_flow
        if method in {"forward_fcff_dcf", "through_cycle_fcff_dcf"}:
            earnings_power_equity = normalized_cash_flow / max(0.035, discount_rate - terminal_growth) + bridge_assets - bridge_obligations
        else:
            earnings_power_equity = normalized_cash_flow / max(0.035, discount_rate - terminal_growth)
        earnings_power = max(0.0, earnings_power_equity / model_shares)
        if earnings_power > 0:
            method_disagreement = abs(base_value - earnings_power) / max(base_value, earnings_power)
            methods.append(
                {
                    "key": "normalized_cash_earnings",
                    "role": "cross_check",
                    "value_per_share": earnings_power,
                    "weight": 0.0,
                    "currency": price_validation.get("currency"),
                    "independence": "correlated_with_primary",
                }
            )

    low_value = min(scenario_values[0], central_value)
    high_value = max(scenario_values[-1], central_value)
    terminal_share = _number(by_name["base"].get("terminal_value_share")) or 0.0
    scenario_terminal_shares = [
        value
        for scenario in scenarios
        if (value := _number(scenario.get("terminal_value_share"))) is not None
    ]
    maximum_terminal_share = max(scenario_terminal_shares) if scenario_terminal_shares else 1.0
    range_ratio = _ratio(high_value, low_value)
    range_width_to_central = _ratio(high_value - low_value, central_value)
    range_informative = bool(
        range_ratio is not None
        and range_width_to_central is not None
        and range_ratio <= 5.0
        and range_width_to_central <= 2.5
    )
    limitations: list[str] = []
    reasons: list[str] = []
    score = 0.12
    financial_age_days = _age_days(current_row.get("date"))
    fresh_financial_data = bool(
        ttm_row
        and financial_age_days is not None
        and financial_age_days <= MAX_FINANCIAL_DATA_AGE_DAYS
    )
    ttm_validation = (ttm_row or {}).get("ttm_validation") or {}
    ttm_structure_validated = ttm_validation.get("status") == "validated"
    cycle_coverage_complete = archetype != "capacity_cycle" or bool((cycle_margins or {}).get("coverage_complete"))
    historical_cash_flow_evidence = _historical_cash_flow_evidence(
        annual_rows,
        "net_income" if archetype == "financial" else cash_flow_key,
    )
    cash_flow_support_basis = "generic_historical_cash_flow_regime"
    cash_flow_support_observed: dict[str, Any] = historical_cash_flow_evidence
    if archetype == "capacity_cycle":
        cash_flow_support_basis = "capacity_cycle_normalization"
        cash_flow_support_observed = {
            "margin_coverage_complete": (cycle_margins or {}).get("coverage_complete") is True,
            "revenue_coverage_complete": (cycle_revenue or {}).get("coverage_complete") is True,
            "current_regime_supported": (cycle_margins or {}).get("current_regime_supported") is True,
            "current_revenue_usable_for_research": (
                (cycle_revenue or {}).get("current_level_usable_for_research") is True
            ),
            "normalized_base_margin": _number((cycle_margins or {}).get("base")),
            "generic_cash_flow_evidence": historical_cash_flow_evidence,
        }
        cash_flow_regime_supported = bool(
            cash_flow_support_observed["margin_coverage_complete"]
            and cash_flow_support_observed["revenue_coverage_complete"]
            and cash_flow_support_observed["current_regime_supported"]
            and cash_flow_support_observed["current_revenue_usable_for_research"]
            and (_number(cash_flow_support_observed["normalized_base_margin"]) or 0.0) > 0
        )
    else:
        cash_flow_regime_supported = bool(
            historical_cash_flow_evidence.get("passed") is True
            and (
                archetype == "financial"
                or historical_cash_flow_evidence.get("persistent_positive_regime") is True
            )
        )
    if archetype == "financial":
        future_estimate_support = len(historical_tangible_roes) >= 3
        forward_support_basis = "residual_income_history" if future_estimate_support else "insufficient"
    elif archetype == "capacity_cycle":
        historical_cycle_support = bool(
            cycle_coverage_complete
            and (cycle_revenue or {}).get("coverage_complete") is True
            and (cycle_margins or {}).get("current_regime_supported") is True
            and (cycle_revenue or {}).get("current_level_usable_for_research") is True
            and (_number((cycle_margins or {}).get("base")) or 0.0) > 0
        )
        future_estimate_support = historical_cycle_support
        forward_support_basis = (
            "validated_consensus"
            if estimate_path_usable and historical_cycle_support
            else ("historical_cycle_normalization" if historical_cycle_support else "insufficient")
        )
    else:
        historical_trend_usable = bool(
            historical_trend.get("passed") is True
            and cash_flow_regime_supported
        )
        future_estimate_support = estimate_path_usable or historical_trend_usable
        forward_support_basis = (
            "validated_consensus"
            if estimate_path_usable
            else "historical_trend_normalization"
            if historical_trend_usable
            else "insufficient"
        )
    independent_cross_check = bool(
        method_disagreement is not None
        and any(method_row.get("independence") == "distinct_method_family" for method_row in methods)
    )
    if price_validation.get("status") == "validated":
        score += 0.22
        reasons.append("Precio contrastado con cierre y/o capitalización.")
    elif price_validation.get("status") == "provider_reconciled":
        score += 0.16
        limitations.append("Precio y capitalización concuerdan dentro de FMP, pero falta una fuente de mercado independiente.")
    elif price_validation.get("status") == "single_source":
        score += 0.08
        limitations.append("La cotización tiene una sola fuente confirmada.")
    else:
        limitations.extend(price_validation.get("blockers") or ["La cotización no está validada."])
    if fresh_financial_data and ttm_structure_validated:
        score += 0.20
        reasons.append("Los últimos doce meses se construyen con cuatro trimestres y concuerdan con el estado TTM del proveedor.")
    elif fresh_financial_data:
        score += 0.10
        limitations.append("Las fechas trimestrales son consecutivas, pero el proveedor no confirmó que cada fila sea un trimestre discreto.")
    elif ttm_row:
        limitations.append("Los estados de los últimos doce meses están desactualizados para una decisión actual.")
    else:
        limitations.append("Solo hay estados anuales; el rango no es apto para una decisión actual.")
    if future_estimate_support:
        score += 0.18
        if forward_support_basis == "historical_cycle_normalization":
            reasons.append("La trayectoria futura se apoya en un ciclo completo de ingresos y márgenes observados; el consenso rechazado no se usa.")
        elif forward_support_basis == "residual_income_history":
            reasons.append("El valor se apoya en patrimonio común tangible y rentabilidad histórica normalizada.")
        elif forward_support_basis == "historical_trend_normalization":
            reasons.append("La trayectoria futura usa al menos cinco ejercicios consecutivos de crecimiento y caja, sin depender de consenso externo.")
        else:
            reasons.append("La trayectoria futura cuenta con al menos tres años anuales y un driver de caja verificable.")
    elif len(estimates) >= 3:
        score += 0.06
        limitations.append("Las estimaciones disponibles fallan los controles de crecimiento o margen y no se usan en la valoración.")
    elif archetype != "financial":
        limitations.append("Faltan estimaciones futuras suficientes; se usa una transición histórica limitada.")
    if archetype != "financial":
        if estimate_validation.get("provenance_complete") is True:
            score += 0.03
        else:
            limitations.append("Las estimaciones no informan fecha de observación reciente y número mínimo de analistas para tratarlas como consenso validado.")
    if any(check.get("key") == "price_times_shares_vs_market_cap" and check.get("passed") for check in price_validation.get("checks", [])):
        score += 0.12
    if cash_flow_basis in {"operating_FCFF_after_SBC", "through_cycle_operating_FCFF_after_SBC", "residual_income"}:
        score += 0.10
    else:
        score += 0.05
        limitations.append("Se usa FCFE porque no hay FCFF verificable; no se resta deuda nuevamente.")
    if cash_flow_regime_supported:
        score += 0.06
        reasons.append("El flujo o resultado normalizado cuenta con respaldo histórico suficiente.")
    else:
        limitations.append("El historial no demuestra un régimen de caja suficientemente persistente para sostener una valoración genérica.")
    if archetype != "financial" and (cash_separation or {}).get("complete") is not True:
        limitations.append("No se pudo separar la caja operativa del efectivo excedente ni retirar su renta estimada del FCFF.")
    if archetype != "financial" and reinvestment_evidence.get("passed") is True:
        reasons.append("El crecimiento por encima de la trayectoria histórica descuenta la inversión incremental necesaria.")
    if not capital_structure_support:
        limitations.append("Las obligaciones fuera de deuda superan 10% del capital contable y no tienen un costo de capital explícito.")
    if capital.get("dated_capital_market_inputs") is not True:
        limitations.append("La tasa libre de riesgo y la prima de mercado son parámetros de política sin fecha de mercado; impiden una lectura final.")
    if method_disagreement is None:
        limitations.append("Falta un segundo método aplicable para contrastar el valor central.")
    elif method_disagreement <= 0.45:
        score += 0.06
    else:
        score -= min(0.18, method_disagreement * 0.15)
        limitations.append("Los métodos de contraste difieren de forma material.")
    if archetype == "capacity_cycle":
        if cycle_coverage_complete:
            score += 0.08
            reasons.append("El margen de caja incorpora al menos siete años, con fases débiles y fuertes del ciclo.")
        else:
            limitations.append("El historial permite un rango exploratorio, pero no demuestra todavía un ciclo completo.")
        limitations.append(
            "El contraste de caja usa la misma normalización cíclica; se publica un rango de investigación, no un valor central definitivo."
        )
    if archetype == "capacity_cycle" and structural_cycle_break:
        limitations.append(
            "Los ingresos TTM confirman un cambio de escala frente al ciclo histórico; "
            "los ingresos revierten hacia referencias observadas y el margen converge a una mezcla explícita del ciclo y el TTM validado, "
            "y la cifra central permanece retenida."
        )
    if currency_consistent:
        score += 0.04
    else:
        limitations.append("La moneda reportada por los estados no está explícita; el rango no puede considerarse final.")
    if not historical_currency_consistent:
        limitations.append("No todos los ejercicios históricos informan explícitamente la misma moneda que los últimos doce meses.")
    if equity_bridge["complete"]:
        score += 0.03
    elif equity_bridge["calculation_complete"]:
        limitations.append("Una obligación de balance no observada se incorpora como sensibilidad; el rango es investigativo y no admite una cifra central.")
    else:
        limitations.append("El puente de valor empresa a patrimonio no confirma todos los ajustes opcionales de balance.")
    if pension_sensitivity_applied:
        limitations.append(
            "La obligación de pensión se muestra entre deducción completa y cero para evitar contar dos veces aportes ya incluidos en caja; la cifra central permanece retenida."
        )
    if (share_dilution or {}).get("passed") is True:
        score += 0.03
        if (share_dilution or {}).get("observed_annual_dilution", 0) > 0:
            limitations.append("La dilución histórica se informa, pero no se aplica mecánicamente sin un calendario explícito de emisiones y fondos recibidos.")
    else:
        limitations.append("Falta historial suficiente de acciones diluidas para proyectar el denominador por acción.")
    if not range_informative:
        score -= 0.18
        limitations.append("Los escenarios producen un rango demasiado amplio para orientar una decisión.")
    if maximum_terminal_share > 0.90:
        score -= 0.18
        limitations.append("Algún escenario depende en más de 90% del valor terminal.")
    if terminal_share > 0.85:
        score -= 0.22
        limitations.append("Más de 85% del valor depende del período terminal.")
    elif terminal_share > 0.75:
        score -= 0.08
        limitations.append("Más de 75% del valor depende del período terminal.")
    if forecast_estimates:
        max_dispersion = max(
            (_number(row.get("revenueHigh")) - _number(row.get("revenueLow"))) / max(_number(row.get("revenueAvg")) or 1.0, 1.0)
            for row in forecast_estimates
        )
        if max_dispersion > 0.65:
            score -= 0.10
            limitations.append("La dispersión de estimaciones es alta; el consenso solo actúa como referencia.")
    score = _clamp(score, 0.0, 1.0)
    readiness_gates = {
        "validated_price": {
            "passed": price_validation.get("status") == "validated",
            "observed": price_validation.get("status"),
            "required": "validated",
        },
        "fresh_market_data": {
            "passed": price_validation.get("fresh") is True,
            "observed_age_days": price_validation.get("age_days"),
            "maximum_age_days": MAX_MARKET_DATA_AGE_DAYS,
        },
        "fresh_financial_data": {
            "passed": fresh_financial_data,
            "observed_age_days": financial_age_days,
            "maximum_age_days": MAX_FINANCIAL_DATA_AGE_DAYS,
            "required_period": "TTM",
        },
        "ttm_structure": {
            "passed": ttm_structure_validated,
            "observed": ttm_validation.get("status") or "missing",
            "required": "four sequential quarters reconciled to an explicit provider TTM statement",
        },
        "future_estimate_support": {
            "passed": future_estimate_support,
            "observed_years": len(estimates),
            "required_years": None if archetype == "financial" else 3,
            "basis": forward_support_basis,
            "consensus_used": estimate_path_usable,
            "validation": estimate_validation,
        },
        "estimate_provenance": {
            "passed": archetype == "financial" or not estimate_path_usable or estimate_validation.get("provenance_complete") is True,
            "observed": {
                "observation_dates": estimate_validation.get("observation_dates") or [],
                "analyst_counts": estimate_validation.get("analyst_counts") or [],
            },
        },
        "estimate_currency": {
            "passed": archetype == "financial" or not estimate_path_usable or estimate_validation.get("currency_complete") is True,
            "market_currency": market_currency,
            "accepted_currencies": estimate_validation.get("accepted_currencies") or [],
            "explicit_years": estimate_validation.get("currency_explicit_years") or 0,
        },
        "historical_cash_flow_support": {
            "passed": cash_flow_regime_supported,
            "basis": cash_flow_support_basis,
            "observed": cash_flow_support_observed,
        },
        "operating_cash_separation": {
            "passed": archetype == "financial" or (cash_separation or {}).get("complete") is True,
            "observed": cash_separation,
            "required": "separate operating liquidity, excess cash and non-operating income",
        },
        "growth_reinvestment_support": {
            "passed": (
                archetype == "financial"
                or (archetype == "capacity_cycle" and not estimate_path_usable)
                or (
                    reinvestment_evidence.get("passed") is True
                    and reinvestment_evidence.get("baseline_complete") is True
                )
            ),
            "observed": reinvestment_evidence,
            "required": "at least three historical sales-to-capital observations",
        },
        "capital_structure_support": {
            "passed": capital_structure_support,
            "other_claims_to_book_capital": other_claims_to_book_capital,
            "maximum_without_explicit_cost": 0.10,
        },
        "dated_capital_market_inputs": {
            "passed": capital.get("dated_capital_market_inputs") is True,
            "source": capital.get("capital_market_input_source"),
            "as_of": capital.get("capital_market_inputs_as_of"),
        },
        "historical_tangible_book_support": {
            "passed": archetype != "financial" or len(historical_tangible_roes) >= 3,
            "observed_years": len(historical_tangible_roes) if archetype == "financial" else None,
            "required_years": 3 if archetype == "financial" else None,
        },
        "currency_consistency": {
            "passed": currency_consistent,
            "market_currency": market_currency,
            "financial_currency": financial_currency,
        },
        "historical_currency_consistency": {
            "passed": historical_currency_consistent,
            "annual_currencies": sorted(annual_currencies),
            "explicit_years": annual_currency_explicit_years,
            "required_years": len(annual_rows),
        },
        "equity_bridge_completeness": {
            "passed": equity_bridge["complete"],
            "missing_optional_fields": missing_bridge_fields,
            "calculation_complete": equity_bridge["calculation_complete"],
            "unresolved_claims": unresolved_claims,
        },
        "pension_claim_reconciliation": pension_claim_reconciliation,
        "share_dilution_support": {
            "passed": (share_dilution or {}).get("passed") is True,
            "observed": share_dilution,
        },
        "stock_compensation_treatment": {
            "passed": archetype == "financial" or sbc_treatment_complete,
            "annual_years": sbc_annual_years,
            "required_annual_years": 3 if archetype != "financial" else None,
            "reconciliation_failures": sbc_reconciliation_failures,
            "policy": "subtract stock-based compensation from FCFF because future dilution and option proceeds are not modeled",
        },
        "cycle_coverage": {
            "passed": cycle_coverage_complete and (
                archetype != "capacity_cycle" or (cycle_revenue or {}).get("coverage_complete") is True
            ) and (
                archetype != "capacity_cycle" or (cycle_margins or {}).get("current_regime_supported") is True
            ),
            "observed_years": (cycle_margins or {}).get("years") if archetype == "capacity_cycle" else None,
            "required_years": 7 if archetype == "capacity_cycle" else None,
        },
        "cycle_regime_continuity": {
            "passed": archetype != "capacity_cycle" or not structural_cycle_break,
            "structural_break": structural_cycle_break if archetype == "capacity_cycle" else None,
            "required": "no unresolved structural break for a decision-ready central estimate",
        },
        "fundamental_scale_reconciliation": {
            "passed": fundamental_scale_validation.get("passed") is True,
            "checks": fundamental_scale_validation.get("checks") or [],
        },
        "method_agreement": {
            "passed": method_disagreement is not None and method_disagreement <= MAX_DECISION_READY_METHOD_DISAGREEMENT,
            "observed": method_disagreement,
            "maximum": MAX_DECISION_READY_METHOD_DISAGREEMENT,
        },
        "independent_cross_check": {
            "passed": independent_cross_check,
            "observed": [
                method_row.get("key")
                for method_row in methods
                if method_row.get("role") == "cross_check" and method_row.get("independence") == "distinct_method_family"
            ],
            "required": "at least one distinct valuation method family",
        },
        "range_informativeness": {
            "passed": range_informative,
            "high_to_low": range_ratio,
            "width_to_central": range_width_to_central,
            "maximum_high_to_low": 5.0,
            "maximum_width_to_central": 2.5,
        },
        "terminal_value_dependence": {
            "passed": maximum_terminal_share <= MAX_DECISION_READY_TERMINAL_VALUE_SHARE,
            "observed": maximum_terminal_share,
            "base_observed": terminal_share,
            "maximum": MAX_DECISION_READY_TERMINAL_VALUE_SHARE,
        },
    }
    decision_ready_blockers = [key for key, gate in readiness_gates.items() if not gate["passed"]]
    if decision_ready_blockers:
        score = min(score, 0.74)
    if any(key in decision_ready_blockers for key in ("fresh_market_data", "currency_consistency")):
        score = min(score, 0.49)
    elif "validated_price" in decision_ready_blockers and price_validation.get("status") != "provider_reconciled":
        score = min(score, 0.49)
    elif any(
        key in decision_ready_blockers
        for key in (
            "fresh_financial_data",
            "ttm_structure",
            "cycle_coverage",
            "future_estimate_support",
            "historical_cash_flow_support",
            "operating_cash_separation",
            "growth_reinvestment_support",
            "capital_structure_support",
            "range_informativeness",
            "share_dilution_support",
            "equity_bridge_completeness",
        )
    ):
        score = min(score, 0.64)
    elif any(key in decision_ready_blockers for key in ("method_agreement", "independent_cross_check")):
        score = min(score, 0.69)
    if score >= 0.78 and not decision_ready_blockers:
        status = "decision_ready"
        confidence = "high"
        usable = True
    elif (
        score >= 0.50
        and fresh_financial_data
        and ttm_structure_validated
        and future_estimate_support
        and cash_flow_regime_supported
        and (archetype == "financial" or (cash_separation or {}).get("complete") is True)
        and capital_structure_support
        and historical_currency_consistent
        and (archetype == "financial" or sbc_treatment_complete)
        and equity_bridge["calculation_complete"]
        and (share_dilution or {}).get("passed") is True
        and range_informative
        and maximum_terminal_share <= 0.90
        and price_validation.get("status") in {"validated", "provider_reconciled", "single_source"}
    ):
        status = "research_grade"
        confidence = "medium"
        usable = True
    else:
        status = "not_decision_ready"
        confidence = "low" if score > 0 else "blocked"
        usable = False

    published_central_value = central_value if equity_bridge["exact"] else None
    market_cap = _positive(price_validation.get("market_cap"))
    enterprise_value = (
        _number(market_cap + bridge_obligations - bridge_assets)
        if market_cap is not None and archetype != "financial"
        else None
    )
    current_fcf = _number(current_row.get("operating_fcff_after_sbc"))
    current_ebitda = _number(current_row.get("ebitda"))
    current_equity = _positive(current_row.get("total_equity"))
    current_net_income = _positive(current_row.get("net_income"))
    reverse_margin = _ratio(base_cash_flow, revenue) if base_cash_flow is not None else None
    reverse = _reverse_dcf(
        price=_positive(price_validation.get("price")),
        revenue=revenue,
        cash_flow_margin=reverse_margin,
        cash=bridge_assets,
        debt=bridge_obligations,
        shares=model_shares,
        discount_rate=discount_rate,
        terminal_growth=terminal_growth,
        method=method if method in {"forward_fcff_dcf", "through_cycle_fcff_dcf", "forward_fcfe_dcf"} else "forward_fcfe_dcf",
    ) if archetype != "financial" and price_validation.get("status") == "validated" else {
        "available": False,
        "status": "unverified_price" if archetype != "financial" else "not_applicable",
        "reason": (
            "El DCF inverso requiere un precio corroborado por una fuente independiente."
            if archetype != "financial"
            else "No aplica a financieras."
        ),
        "weight": 0,
    }

    return _json_safe({
        "model_version": MODEL_VERSION,
        "available": True,
        "status": status,
        "archetype": archetype,
        "primary_method": method,
        "cash_flow_basis": cash_flow_basis,
        "current_price": price_validation.get("price"),
        "currency": price_validation.get("currency"),
        "market_data_as_of": price_validation.get("as_of"),
        "financial_data_as_of": _date_text(current_row.get("date")),
        "financial_currency": financial_currency,
        "price_validation": price_validation,
        "range": {"low": low_value, "central": published_central_value, "high": high_value},
        "selected_value": published_central_value,
        "scenarios": scenarios,
        "methods": methods,
        "reverse_dcf": reverse,
        "multiples": {
            "market_cap": market_cap,
            "enterprise_value": enterprise_value,
            "ev_to_sales": _ratio(enterprise_value, revenue) if archetype != "financial" else None,
            "ev_to_ebitda": _ratio(enterprise_value, current_ebitda) if archetype != "financial" else None,
            "price_to_fcf": _ratio(market_cap, current_fcf) if archetype != "financial" else None,
            "price_to_book": _ratio(market_cap, current_equity) if archetype == "financial" else None,
            "price_to_earnings": _ratio(market_cap, current_net_income) if archetype == "financial" else None,
        },
        "model_policy": {
            "primary": method,
            "cross_checks": [method_row["key"] for method_row in methods if method_row["role"] == "cross_check"],
            "excluded": ["reverse_dcf_as_intrinsic_value", "universal_dcf", "market_price_anchor"],
            "consensus_role": "bounded_reference_not_ground_truth",
            "consensus_used": estimate_path_usable,
        },
        "cost_of_capital": capital,
        "equity_bridge": equity_bridge,
        "share_dilution": share_dilution,
        "stock_compensation_treatment": {
            "complete": archetype == "financial" or sbc_treatment_complete,
            "current_stock_based_compensation": _number(current_row.get("stock_based_compensation")),
            "reported_fcff": _number(current_row.get("fcff")),
            "fcff_after_sbc": _number(current_row.get("fcff_after_sbc")),
            "annual_years": sbc_annual_years,
            "reconciliation_failures": sbc_reconciliation_failures,
            "future_dilution_modeled": False,
        },
        "operating_cash_separation": cash_separation,
        "cycle_normalization": cycle_margins if archetype == "capacity_cycle" else None,
        "cycle_revenue_normalization": cycle_revenue if archetype == "capacity_cycle" else None,
        "historical_trend_normalization": historical_trend,
        "reinvestment_support": reinvestment_evidence,
        "annual_history_validation": annual_history_validation,
        "estimate_validation": estimate_validation,
        "historical_cash_flow_evidence": historical_cash_flow_evidence,
        "fundamental_scale_validation": fundamental_scale_validation,
        "reliability": {
            "usable": usable,
            "status": confidence,
            "score": score,
            "reasons": reasons,
            "limitations": limitations,
            "method_disagreement": method_disagreement,
            "terminal_value_share": terminal_share,
            "maximum_terminal_value_share": maximum_terminal_share,
            "range_informativeness": {
                "passed": range_informative,
                "high_to_low": range_ratio,
                "width_to_central": range_width_to_central,
            },
            "readiness_gates": readiness_gates,
            "decision_ready_blockers": decision_ready_blockers,
        },
    })


def _build_screening_analysis(
    *,
    annual_rows: list[dict[str, Any]],
    ttm_row: dict[str, Any] | None,
    valuation: dict[str, Any],
) -> dict[str, Any]:
    """Return a useful, explicitly non-fair-value read for incomplete cases.

    This layer never fills missing facts with sector priors and never promotes
    itself to an intrinsic valuation. It only recombines observed market and
    statement values into a capital, cash-burn, and simple-multiple snapshot.
    """

    normalized_rows, _ = _normalize_annual_history(annual_rows)
    current_row = dict(ttm_row or (normalized_rows[-1] if normalized_rows else {}))
    price_validation = valuation.get("price_validation") or {}
    price = _positive(price_validation.get("price"))
    shares = _positive(price_validation.get("valuation_shares")) or _positive(current_row.get("diluted_shares"))
    market_cap = _positive(price_validation.get("market_cap"))
    if market_cap is None and price is not None and shares is not None:
        market_cap = price * shares

    revenue = _number(current_row.get("revenue"))
    free_cash_flow = _number(current_row.get("free_cash_flow"))
    cash = _number(current_row.get("cash"))
    total_debt = _number(current_row.get("total_debt"))
    net_cash = cash - total_debt if cash is not None and total_debt is not None else None
    enterprise_value = (
        market_cap + total_debt - cash
        if market_cap is not None and total_debt is not None and cash is not None
        else None
    )

    annual_burn = None
    for candidate in (
        free_cash_flow,
        _number(current_row.get("fcff")),
        _number(current_row.get("cash_from_operations")),
    ):
        if candidate is not None and candidate < 0:
            annual_burn = abs(candidate)
            break
    runway_years = cash / annual_burn if cash is not None and cash > 0 and annual_burn else None
    funding_need = max((annual_burn * 2.0) - cash, 0.0) if cash is not None and annual_burn else None
    illustrative_dilution = None
    if funding_need is not None and price is not None and shares is not None and price > 0 and shares > 0:
        new_shares = funding_need / (price * 0.80)
        illustrative_dilution = new_shares / (shares + new_shares) if new_shares > 0 else 0.0
    runway_pressure = (
        "urgent"
        if runway_years is not None and runway_years < 1.0
        else "high"
        if runway_years is not None and runway_years < 2.0
        else "moderate"
        if runway_years is not None and runway_years < 3.0
        else "manageable"
        if runway_years is not None
        else "unknown"
    )

    cash_per_share = _ratio(cash, shares)
    net_cash_per_share = _ratio(net_cash, shares)
    premium_to_net_cash = (
        (price / net_cash_per_share) - 1.0
        if price is not None and net_cash_per_share is not None and net_cash_per_share > 0
        else None
    )
    archetype = str(valuation.get("archetype") or "unknown")
    useful_values = [price, market_cap, revenue, free_cash_flow, cash, total_debt, shares]

    return _json_safe(
        {
            "version": "screening_analysis_v1",
            "available": any(value is not None for value in useful_values),
            "posture": "screen_grade",
            "kind": "early_stage" if archetype == "early_stage" else "fundamental_snapshot",
            "fair_value_published": False,
            "currency": price_validation.get("currency"),
            "market_data_as_of": price_validation.get("as_of"),
            "financial_data_as_of": _date_text(current_row.get("date")),
            "observed": {
                "current_price": price,
                "market_cap": market_cap,
                "revenue": revenue,
                "free_cash_flow": free_cash_flow,
                "cash": cash,
                "total_debt": total_debt,
                "diluted_shares": shares,
                "net_cash": net_cash,
                "enterprise_value": enterprise_value,
            },
            "ratios": {
                "ev_to_revenue": _ratio(enterprise_value, revenue) if revenue is not None and revenue > 0 else None,
                "fcf_yield": _ratio(free_cash_flow, market_cap),
                "net_cash_to_market_cap": _ratio(net_cash, market_cap),
            },
            "runway": {
                "annual_burn": annual_burn,
                "years": runway_years,
                "months": runway_years * 12.0 if runway_years is not None else None,
                "funding_need_for_24_months": funding_need,
                "illustrative_dilution_at_20pct_discount": illustrative_dilution,
                "pressure": runway_pressure,
            },
            "market_read": {
                "operations_value": enterprise_value,
                "cash_per_share": cash_per_share,
                "net_cash_per_share": net_cash_per_share,
                "premium_to_net_cash": premium_to_net_cash,
            },
            "limitations": [
                "No es un valor razonable ni una recomendación.",
                "El valor operativo simple sólo resta caja y suma deuda; no sustituye un puente completo de derechos senior.",
                "La dilución ilustrativa supone una ampliación al 20% de descuento y sólo cubre hasta 24 meses de consumo observado.",
            ],
        }
    )


def build_institutional_valuation(
    *,
    annual_rows: list[dict[str, Any]],
    ttm_row: dict[str, Any] | None,
    profile: dict[str, Any],
    quote: dict[str, Any] | None,
    prices: Any,
    analyst_estimates: Any,
    key_metrics_ttm: dict[str, Any] | None,
    ratios_ttm: dict[str, Any] | None,
    assumptions: dict[str, Any],
    expected_ticker: str | None = None,
    source_records: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    valuation = _build_institutional_valuation_model(
        annual_rows=annual_rows,
        ttm_row=ttm_row,
        profile=profile,
        quote=quote,
        prices=prices,
        analyst_estimates=analyst_estimates,
        key_metrics_ttm=key_metrics_ttm,
        ratios_ttm=ratios_ttm,
        assumptions=assumptions,
        expected_ticker=expected_ticker,
        source_records=source_records,
    )
    if valuation.get("status") != "decision_ready":
        valuation["screening_analysis"] = _build_screening_analysis(
            annual_rows=annual_rows,
            ttm_row=ttm_row,
            valuation=valuation,
        )
    return _json_safe(valuation)
