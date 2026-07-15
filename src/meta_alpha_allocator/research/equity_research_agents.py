from __future__ import annotations

from dataclasses import dataclass
import json
import os
import re
from typing import Any

import requests


AGENT_LAYER_VERSION = "equity_research_agent_layer_v1"
CLAIM_TAGS = {"sourced_fact", "calculated_metric", "assumption", "interpretation", "uncertainty"}
DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1"
DEFAULT_LLM_MODEL = "gpt-4o-mini"


@dataclass(frozen=True)
class FinalOrchestratorConfig:
    enabled: bool
    api_key: str | None
    model: str
    base_url: str
    timeout_seconds: float = 25.0
    max_tokens: int = 900

    @classmethod
    def from_env(cls) -> "FinalOrchestratorConfig":
        enabled = str(os.environ.get("EQUITY_RESEARCH_LLM_ENABLED", "")).strip().lower() in {"1", "true", "yes", "on"}
        api_key = os.environ.get("EQUITY_RESEARCH_LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
        model = os.environ.get("EQUITY_RESEARCH_LLM_MODEL") or DEFAULT_LLM_MODEL
        base_url = (os.environ.get("EQUITY_RESEARCH_LLM_BASE_URL") or DEFAULT_LLM_BASE_URL).rstrip("/")
        timeout = _safe_float(os.environ.get("EQUITY_RESEARCH_LLM_TIMEOUT_SECONDS")) or 25.0
        max_tokens = int(_safe_float(os.environ.get("EQUITY_RESEARCH_LLM_MAX_TOKENS")) or 900)
        return cls(
            enabled=enabled,
            api_key=api_key,
            model=model,
            base_url=base_url,
            timeout_seconds=max(5.0, timeout),
            max_tokens=max(200, min(max_tokens, 2000)),
        )


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _compact_json(payload: Any, *, limit: int = 12000) -> str:
    text = json.dumps(payload, sort_keys=True, default=str)
    if len(text) <= limit:
        return text
    return text[:limit] + "...[truncated]"


def _parse_jsonish_analysis(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        nested = value.get("memo_patch")
        if isinstance(nested, str):
            parsed_nested = _parse_jsonish_analysis(nested)
            if parsed_nested:
                return {**value, **parsed_nested}
        return value
    text = str(value or "").strip()
    if not text:
        return {}
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
    candidate = (fenced.group(1) if fenced else text).strip()
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return {"memo_patch": text.replace("```json", "").replace("```", "").strip()}
    return parsed if isinstance(parsed, dict) else {"memo_patch": text}


def _fmt_pct(value: Any) -> str:
    number = _safe_float(value)
    return "n/a" if number is None else f"{number * 100:.1f}%"


def _fmt_currency(value: Any) -> str:
    number = _safe_float(value)
    if number is None:
        return "n/a"
    if abs(number) >= 1_000_000_000:
        return f"${number / 1_000_000_000:,.1f}B"
    if abs(number) >= 1_000_000:
        return f"${number / 1_000_000:,.1f}M"
    return f"${number:,.0f}"


def _claim(
    claim_id: str,
    text: str,
    claim_tag: str,
    *,
    evidence_refs: list[str] | None = None,
    metric_refs: list[str] | None = None,
) -> dict[str, Any]:
    if claim_tag not in CLAIM_TAGS:
        raise ValueError(f"Unsupported claim tag: {claim_tag}")
    return {
        "id": claim_id,
        "text": text,
        "claim_tag": claim_tag,
        "evidence_refs": evidence_refs or [],
        "metric_refs": metric_refs or [],
    }


def _agent(
    agent_id: str,
    name: str,
    role: str,
    *,
    status: str,
    summary: str,
    depends_on: list[str],
    claims: list[dict[str, Any]],
    open_questions: list[str] | None = None,
    handoff: str | None = None,
) -> dict[str, Any]:
    confidence = 0.85
    if status == "needs_attention":
        confidence = 0.55
    elif status == "blocked":
        confidence = 0.25
    return {
        "id": agent_id,
        "name": name,
        "role": role,
        "status": status,
        "confidence": confidence,
        "depends_on": depends_on,
        "summary": summary,
        "claims": claims,
        "open_questions": open_questions or [],
        "handoff": handoff,
    }


def _source_status(records: list[dict[str, Any]], source_id: str) -> str | None:
    for record in records:
        if record.get("source_id") == source_id:
            return record.get("status")
    return None


def _valuation_is_backed(valuation: dict[str, Any]) -> bool:
    reliability = valuation.get("reliability") or {}
    price_validation = valuation.get("price_validation") or {}
    return bool(
        valuation.get("model_version") == "institutional_valuation_v3"
        and valuation.get("available")
        and valuation.get("status") == "decision_ready"
        and reliability.get("usable") is True
        and reliability.get("status") == "high"
        and price_validation.get("usable") is True
        and price_validation.get("status") == "validated"
    )


def _valuation_range(valuation: dict[str, Any]) -> tuple[float | None, float | None, float | None]:
    value_range = valuation.get("range") or {}
    return (
        _safe_float(value_range.get("low")),
        _safe_float(value_range.get("central")),
        _safe_float(value_range.get("high")),
    )


def _status_from_audit(audit: dict[str, Any], *, requires_valuation: bool = False, valuation: dict[str, Any] | None = None) -> str:
    if requires_valuation:
        candidate = valuation or {}
        if not candidate.get("available") or not (candidate.get("reliability") or {}).get("usable"):
            return "blocked"
        if not _valuation_is_backed(candidate):
            return "needs_attention"
    if audit.get("status") == "needs_attention":
        return "needs_attention"
    return "ready"


def build_agent_outputs(
    *,
    ticker: str,
    profile: dict[str, Any],
    rows: list[dict[str, Any]],
    ratios: dict[str, Any],
    valuation: dict[str, Any],
    quality_flags: list[dict[str, Any]],
    audit: dict[str, Any],
    sources: list[dict[str, Any]],
    filings: list[dict[str, Any]],
) -> dict[str, Any]:
    coverage = audit.get("coverage") or {}
    latest = rows[-1] if rows else {}
    profile_source_ok = _source_status(sources, "fmp:profile") == "ok"
    statement_ids = coverage.get("statement_source_ids") or []
    statement_refs = [str(source_id) for source_id in statement_ids]
    filings_ok = _source_status(sources, "sec:submissions") == "ok"
    range_low, range_central, range_high = _valuation_range(valuation)
    backed = _valuation_is_backed(valuation) and audit.get("status") == "pass"
    research_range = (
        valuation.get("status") == "research_grade"
        and range_low is not None
        and range_high is not None
    )
    current_price = _safe_float(valuation.get("current_price"))
    implied_growth = (valuation.get("reverse_dcf") or {}).get("implied_revenue_cagr")
    audit_findings = audit.get("findings") or []

    agents = [
        _agent(
            "orchestrator_agent",
            "Orchestrator",
            "Coordinates provider state, evidence coverage, audit status, and downstream agent readiness.",
            status=_status_from_audit(audit),
            depends_on=["sources.records", "sources.coverage", "audit.findings"],
            summary=f"Run state is {audit.get('status')} with {coverage.get('score', 0)}% evidence coverage.",
            claims=[
                _claim(
                    "orchestrator.coverage",
                    f"Evidence coverage is {coverage.get('score', 0)}% across {coverage.get('covered_expected_metrics', 0)}/{coverage.get('expected_metrics', 0)} required metrics.",
                    "calculated_metric",
                    metric_refs=["sources.coverage.score", "sources.coverage.covered_expected_metrics"],
                ),
                _claim(
                    "orchestrator.statement_authority",
                    f"Statement authority is: {coverage.get('statement_authority', 'not assessed')}.",
                    "sourced_fact" if statement_refs else "uncertainty",
                    evidence_refs=statement_refs,
                    metric_refs=["sources.coverage.statement_authority"],
                ),
            ],
            open_questions=coverage.get("missing_expected_metrics") or [],
            handoff="Downstream agents must downgrade conviction when coverage is incomplete.",
        ),
        _agent(
            "company_profile_agent",
            "Company Profile Agent",
            "Summarizes business identity, listing metadata, and filing availability.",
            status="ready" if profile_source_ok else "needs_attention",
            depends_on=["fmp:profile", "sec:submissions"],
            summary=f"{profile.get('companyName') or ticker} is classified as {profile.get('sector') or 'n/a'} / {profile.get('industry') or 'n/a'}.",
            claims=[
                _claim(
                    "profile.identity",
                    f"{profile.get('companyName') or ticker} trades as {ticker}.",
                    "sourced_fact" if profile_source_ok else "uncertainty",
                    evidence_refs=["fmp:profile"] if profile_source_ok else [],
                    metric_refs=["company_profile.name"],
                ),
                _claim(
                    "profile.filings",
                    f"{len(filings)} recent SEC filing metadata records are available.",
                    "sourced_fact" if filings_ok else "uncertainty",
                    evidence_refs=["sec:submissions"] if filings_ok else [],
                    metric_refs=["filings.recent"],
                ),
            ],
            open_questions=[] if profile_source_ok else ["Profile source is unavailable or empty."],
        ),
        _agent(
            "financial_quality_agent",
            "Financial Quality Agent",
            "Interprets cash conversion, ROIC, dilution, leverage, and accounting quality flags.",
            status=_status_from_audit(audit),
            depends_on=statement_refs + ["financials.ratios", "financials.quality_flags"],
            summary=f"Latest FCF margin is {_fmt_pct(ratios.get('fcf_margin'))}, ROIC is {_fmt_pct(ratios.get('roic'))}, and {len(quality_flags)} accounting flags were triggered.",
            claims=[
                _claim(
                    "quality.fcf_margin",
                    f"Latest free cash flow margin is {_fmt_pct(ratios.get('fcf_margin'))}.",
                    "calculated_metric",
                    metric_refs=["financials.ratios.fcf_margin"],
                ),
                _claim(
                    "quality.roic",
                    f"Latest ROIC is {_fmt_pct(ratios.get('roic'))}.",
                    "calculated_metric",
                    metric_refs=["financials.ratios.roic"],
                ),
                _claim(
                    "quality.flags",
                    f"{len(quality_flags)} accounting quality flags were triggered by deterministic checks.",
                    "calculated_metric",
                    metric_refs=["financials.quality_flags"],
                ),
            ],
            open_questions=[item.get("title", "Review accounting flag") for item in quality_flags],
        ),
        _agent(
            "valuation_agent",
            "Valuation Agent",
            "Explains the routed valuation range, its reliability gates, and market-implied expectations without recalculating them.",
            status=_status_from_audit(audit, requires_valuation=True, valuation=valuation),
            depends_on=statement_refs + ["valuation.scenarios", "valuation.reverse_dcf", "valuation.multiples"],
            summary=(
                (
                    f"Decision-ready range is {_fmt_currency(range_low)} to {_fmt_currency(range_high)}, with a central estimate of {_fmt_currency(range_central)}; "
                    f"current price is {_fmt_currency(current_price)}."
                    if backed
                    else (
                        f"Preliminary range is {_fmt_currency(range_low)} to {_fmt_currency(range_high)}; the central estimate is withheld because reliability gates are still open."
                        if research_range
                        else f"Valuation is blocked: {valuation.get('reason', 'required reliability gates remain open')}."
                    )
                )
                if valuation.get("available")
                else f"Valuation is blocked: {valuation.get('reason', 'missing required valuation inputs')}."
            ),
            claims=(
                [
                    _claim(
                        "valuation.range",
                        f"The routed valuation range is {_fmt_currency(range_low)} to {_fmt_currency(range_high)}.",
                        "calculated_metric",
                        metric_refs=["valuation.range.low", "valuation.range.high"],
                    ),
                    _claim(
                        "valuation.central_value",
                        f"The decision-ready central estimate is {_fmt_currency(range_central)}.",
                        "calculated_metric",
                        metric_refs=["valuation.range.central"],
                    ),
                    _claim(
                        "valuation.reverse_dcf",
                        f"Current price implies {_fmt_pct(implied_growth)} revenue CAGR under the reverse DCF setup.",
                        "calculated_metric" if implied_growth is not None else "uncertainty",
                        metric_refs=["valuation.reverse_dcf.implied_revenue_cagr"],
                    ),
                ]
                if backed
                else (
                    [
                        _claim(
                            "valuation.range",
                            f"A preliminary range of {_fmt_currency(range_low)} to {_fmt_currency(range_high)} is available, but no precise value is decision-ready.",
                            "uncertainty",
                            metric_refs=["valuation.range.low", "valuation.range.high", "valuation.reliability"],
                        ),
                        _claim(
                            "valuation.reliability_gate",
                            "The central estimate must not be presented as backed until all reliability and price-validation gates pass.",
                            "uncertainty",
                            metric_refs=["valuation.status", "valuation.reliability", "valuation.price_validation"],
                        ),
                    ]
                    if research_range
                    else [
                        _claim(
                            "valuation.blocked",
                            f"No valuation range is published: {valuation.get('reason', 'missing required valuation inputs')}.",
                            "uncertainty",
                            metric_refs=["valuation.reason", "valuation.reliability"],
                        )
                    ]
                )
            ),
            open_questions=(valuation.get("reliability") or {}).get("limitations", []) if valuation.get("available") else [valuation.get("reason", "Missing required valuation inputs")],
        ),
        _agent(
            "risk_agent",
            "Risk Agent",
            "Maps audit findings, quality flags, leverage, cash conversion, and valuation fragility.",
            status="needs_attention" if audit_findings or quality_flags else "ready",
            depends_on=["audit.findings", "financials.quality_flags", "financials.ratios"],
            summary=f"Risk map has {len(audit_findings)} audit findings and {len(quality_flags)} accounting quality flags.",
            claims=[
                _claim(
                    "risk.audit_findings",
                    f"The audit produced {len(audit_findings)} findings.",
                    "calculated_metric",
                    metric_refs=["audit.findings"],
                ),
                _claim(
                    "risk.net_debt",
                    f"Latest net debt is {_fmt_currency(ratios.get('net_debt'))}.",
                    "calculated_metric",
                    metric_refs=["financials.ratios.net_debt"],
                ),
            ],
            open_questions=[finding.get("message", "Review audit finding") for finding in audit_findings],
        ),
        _agent(
            "catalyst_agent",
            "Catalyst Agent",
            "Tracks filing cadence and known event metadata available to this run.",
            status="ready" if filings else "needs_attention",
            depends_on=["sec:submissions"],
            summary=(
                f"Latest filing metadata: {filings[0].get('form')} filed {filings[0].get('filing_date')}."
                if filings
                else "No SEC filing metadata is available in this run."
            ),
            claims=[
                _claim(
                    "catalyst.latest_filing",
                    (
                        f"Latest filing metadata record is {filings[0].get('form')} filed {filings[0].get('filing_date')}."
                        if filings
                        else "Latest filing metadata is unavailable."
                    ),
                    "sourced_fact" if filings_ok and filings else "uncertainty",
                    evidence_refs=["sec:submissions"] if filings_ok and filings else [],
                    metric_refs=["filings.recent.0"],
                ),
                _claim(
                    "catalyst.calendar_gap",
                    "Earnings dates, investor days, and product/regulatory catalysts are not yet sourced in this run.",
                    "uncertainty",
                    metric_refs=["catalysts.calendar"],
                ),
            ],
            open_questions=["Add earnings calendar and transcript sources."] if filings else ["Configure SEC_USER_AGENT or filing metadata source."],
        ),
        _agent(
            "red_team_agent",
            "Red-Team Agent",
            "Attacks the thesis, assumptions, accounting quality, and valuation dependence.",
            status="ready" if rows else "blocked",
            depends_on=["audit.findings", "financials.ratios", "valuation.reverse_dcf"],
            summary="The bear case starts with evidence quality, accounting flags, FCF durability, and implied growth pressure.",
            claims=[
                _claim(
                    "red_team.evidence_attack",
                    f"A skeptical analyst should not lean on this memo until evidence coverage is high; current coverage is {coverage.get('score', 0)}%.",
                    "interpretation",
                    metric_refs=["sources.coverage.score"],
                ),
                _claim(
                    "red_team.valuation_attack",
                    (
                        f"The reverse DCF requires {_fmt_pct(implied_growth)} implied revenue CAGR under current assumptions."
                        if backed and implied_growth is not None
                        else "No precise market-implied growth claim is published until the valuation passes every reliability gate."
                    ),
                    "calculated_metric" if backed and implied_growth is not None else "uncertainty",
                    metric_refs=["valuation.reverse_dcf.implied_revenue_cagr"],
                ),
                _claim(
                    "red_team.quality_attack",
                    f"Cash conversion is {_fmt_pct(ratios.get('cash_conversion'))}, so earnings quality must be checked before underwriting margin durability.",
                    "calculated_metric",
                    metric_refs=["financials.ratios.cash_conversion"],
                ),
            ],
            open_questions=[
                "What assumption breaks first if growth slows?",
                "Are margins normalized or cycle peak?",
                "Do sourced filings contradict provider-standardized numbers?",
            ],
        ),
        _agent(
            "editor_auditor_agent",
            "Editor/Auditor Agent",
            "Checks that agent prose separates sourced facts, calculations, assumptions, interpretations, and uncertainty.",
            status=_status_from_audit(audit),
            depends_on=["sources.data_points", "audit.coverage", "agents.claims"],
            summary="Report language is constrained to tagged claims and deterministic outputs.",
            claims=[
                _claim(
                    "editor.claim_policy",
                    "Agents may interpret and challenge outputs, but they do not calculate financial metrics or invent missing provider data.",
                    "interpretation",
                    metric_refs=["agents.policy"],
                ),
                _claim(
                    "editor.audit_gate",
                    f"Audit status is {audit.get('status')}; high-conviction language should be gated on pass status.",
                    "calculated_metric",
                    metric_refs=["audit.status"],
                ),
            ],
            open_questions=coverage.get("missing_expected_metrics") or [],
        ),
    ]
    claims = [
        {"agent_id": agent["id"], "agent_name": agent["name"], **claim}
        for agent in agents
        for claim in agent.get("claims", [])
    ]
    return {
        "version": AGENT_LAYER_VERSION,
        "mode": "local_first_multi_agent_desk",
        "policy": "Specialist agents run from audited deterministic outputs; Python remains the only calculation layer. At most one final OpenAI-compatible orchestrator call may synthesize the finished bundle.",
        "input_contract": {
            "financials": "normalized annual rows from provider or SEC Company Facts",
            "valuation": "archetype-routed range, method cross-checks, reverse valuation, and reliability gates",
            "audit": "coverage and source-quality gate",
        },
        "execution": {
            "specialist_agents": "deterministic",
            "specialist_llm_calls": 0,
            "final_orchestrator_max_calls": 1,
        },
        "latest_period": latest.get("date"),
        "agents": agents,
        "claims": claims,
    }


def _final_orchestrator_payload(
    *,
    ticker: str,
    profile: dict[str, Any],
    rows: list[dict[str, Any]],
    ratios: dict[str, Any],
    valuation: dict[str, Any],
    quality_flags: list[dict[str, Any]],
    audit: dict[str, Any],
    agent_outputs: dict[str, Any],
    filings: list[dict[str, Any]],
) -> dict[str, Any]:
    latest = rows[-1] if rows else {}
    backed = _valuation_is_backed(valuation) and audit.get("status") == "pass"
    range_low, range_central, range_high = _valuation_range(valuation)
    return {
        "ticker": ticker,
        "company": {
            "name": profile.get("companyName") or ticker,
            "sector": profile.get("sector"),
            "industry": profile.get("industry"),
            "country": profile.get("country"),
        },
        "latest_period": latest.get("date"),
        "audit": {
            "status": audit.get("status"),
            "coverage": audit.get("coverage"),
            "findings": audit.get("findings", [])[:8],
        },
        "financials": {
            "latest_revenue": ratios.get("latest_revenue"),
            "latest_fcf": ratios.get("latest_fcf"),
            "revenue_cagr_5y": ratios.get("revenue_cagr_5y"),
            "fcf_margin": ratios.get("fcf_margin"),
            "roic": ratios.get("roic"),
            "cash_conversion": ratios.get("cash_conversion"),
            "net_debt": ratios.get("net_debt"),
            "latest_debt": latest.get("total_debt"),
            "latest_cash": latest.get("cash"),
        },
        "valuation": {
            "available": valuation.get("available"),
            "model_version": valuation.get("model_version"),
            "status": valuation.get("status"),
            "decision_ready": backed,
            "archetype": valuation.get("archetype"),
            "primary_method": valuation.get("primary_method"),
            "currency": valuation.get("currency"),
            "market_data_as_of": valuation.get("market_data_as_of"),
            "financial_data_as_of": valuation.get("financial_data_as_of"),
            "current_price": valuation.get("current_price") if backed else None,
            "range": {"low": range_low, "high": range_high} if valuation.get("available") else None,
            "central_estimate": range_central if backed else None,
            "precision_withheld": bool(valuation.get("available") and not backed),
            "reliability": valuation.get("reliability"),
            "price_validation": valuation.get("price_validation"),
            "reverse_dcf": valuation.get("reverse_dcf"),
            "multiples": valuation.get("multiples"),
        },
        "quality_flags": quality_flags[:8],
        "filings": filings[:5],
        "agent_summaries": [
            {
                "id": agent.get("id"),
                "status": agent.get("status"),
                "summary": agent.get("summary"),
                "open_questions": agent.get("open_questions", [])[:4],
            }
            for agent in agent_outputs.get("agents", [])
        ],
    }


def _call_openai_compatible_chat(config: FinalOrchestratorConfig, payload: dict[str, Any]) -> str:
    system_prompt = (
        "You are the final orchestrator/editor for an equity research operating system. "
        "You receive only audited deterministic outputs. Do not invent data, do not recalculate numbers, "
        "do not cite sources that are not in the payload, and tag uncertainty explicitly. "
        "If valuation.decision_ready is false, never state or infer a central, base, fair, target, or backed value; "
        "describe only the supplied preliminary range and the open reliability gates. "
        "Return concise JSON with keys: executive_judgment, strongest_points, red_team, open_questions, memo_patch."
    )
    user_prompt = (
        "Synthesize the finished bundle into an institutional, skeptical final analyst layer. "
        "Use only this JSON payload:\n"
        f"{_compact_json(payload)}"
    )
    response = requests.post(
        f"{config.base_url}/chat/completions",
        headers={
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": config.max_tokens,
        },
        timeout=config.timeout_seconds,
    )
    response.raise_for_status()
    data = response.json()
    return str(data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()


def run_final_orchestrator_llm(
    *,
    ticker: str,
    profile: dict[str, Any],
    rows: list[dict[str, Any]],
    ratios: dict[str, Any],
    valuation: dict[str, Any],
    quality_flags: list[dict[str, Any]],
    audit: dict[str, Any],
    agent_outputs: dict[str, Any],
    filings: list[dict[str, Any]],
    config: FinalOrchestratorConfig | None = None,
    llm_client: Any | None = None,
    enabled: bool | None = None,
) -> dict[str, Any]:
    config = config or FinalOrchestratorConfig.from_env()
    is_enabled = config.enabled if enabled is None else enabled
    result: dict[str, Any] = {
        "enabled": bool(is_enabled),
        "status": "disabled",
        "model": config.model,
        "base_url": config.base_url,
        "call_budget": {"max_calls": 1, "actual_calls": 0},
        "analysis": None,
    }
    if not is_enabled:
        return result
    if not _valuation_is_backed(valuation) or audit.get("status") != "pass":
        result.update(
            {
                "enabled": False,
                "status": "withheld",
                "reason": "valuation_not_decision_ready",
                "analysis": {
                    "executive_judgment": "",
                    "strongest_points": [],
                    "red_team": [],
                    "open_questions": ["Close every valuation reliability gate before requesting a final judgment."],
                },
            }
        )
        return result
    if not config.api_key and llm_client is None:
        result.update({"status": "unavailable", "error": "No EQUITY_RESEARCH_LLM_API_KEY or OPENAI_API_KEY configured."})
        return result

    payload = _final_orchestrator_payload(
        ticker=ticker,
        profile=profile,
        rows=rows,
        ratios=ratios,
        valuation=valuation,
        quality_flags=quality_flags,
        audit=audit,
        agent_outputs=agent_outputs,
        filings=filings,
    )
    try:
        result["call_budget"]["actual_calls"] = 1
        raw_text = llm_client.complete(payload, config) if llm_client is not None else _call_openai_compatible_chat(config, payload)
        analysis = _parse_jsonish_analysis(raw_text)
        result.update({"status": "ok", "analysis": analysis})
        return result
    except Exception as exc:  # noqa: BLE001
        result.update({"status": "error", "error": str(exc)})
        return result
