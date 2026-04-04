from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .analogs import build_analogs
from .balance_sheet import build_recoverability_balance_sheet
from .failure_modes import build_failure_modes
from .healing import build_healing_dynamics
from .legitimacy import build_legitimacy_surface
from .measured import (
    _portfolio_factor_dimension,
    _portfolio_fragility_exposure,
    _portfolio_liquidity_buffer,
    build_measured_state,
)
from .policy import build_policy_state
from .policy_v2 import build_policy_state_v2
from .probabilistic import build_probabilistic_state
from .recoverability_budget import build_recoverability_budget
from .repairs import build_repair_candidates
from .sponsorship import build_rebound_sponsorship
from .transitions import build_transition_memory
from .uncertainty import build_uncertainty


CONTRACT_VERSION_V2 = "state_contract_v2"
MODEL_VERSION_V2 = "bls_state_v2.1"


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _compute_hhi(holdings: list[dict[str, Any]]) -> float:
    return _clamp01(sum(max(_num(row.get("weight"), 0.0), 0.0) ** 2 for row in holdings))


def _action_family_for_repair(row: dict[str, Any]) -> str:
    trade_text = " ".join(row.get("trade_set", []))
    lowered = trade_text.lower()
    if "hedge" in lowered:
        return "hedge_raise"
    if "fund" in lowered and "trim" in lowered:
        return "funded_rotation"
    if "trim" in lowered:
        return "trim_concentration"
    return "single_name_add"


def _normalize_weights(holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    total = sum(max(_num(row.get("weight"), 0.0), 0.0) for row in holdings)
    if total <= 0:
        return holdings
    normalized = []
    for row in holdings:
        normalized.append({**row, "weight": max(_num(row.get("weight"), 0.0), 0.0) / total})
    return normalized


def _discovery_lookup(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for row in snapshot.get("screener", {}).get("rows", []) or []:
        ticker = str(row.get("ticker") or "").upper()
        if ticker:
            lookup[ticker] = row
    return lookup


def _seed_holdings(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    portfolio = snapshot.get("portfolio", {})
    raw = portfolio.get("holdings") or portfolio.get("top_holdings") or []
    holdings = []
    for row in raw:
        ticker = str(row.get("ticker") or "").upper()
        if not ticker:
            continue
        holdings.append(
            {
                "ticker": ticker,
                "weight": max(_num(row.get("weight"), 0.0), 0.0),
                "asset_type": row.get("asset_type") or ("etf" if ticker in {"SGOV", "SHY", "BIL", "SHV", "VGSH", "JPST"} else "equity"),
                "sector": row.get("sector") or "Unknown",
                "momentum_6m": _num(row.get("momentum_6m"), 0.0),
                "upside": _num(row.get("upside"), 0.0),
            }
        )
    return _normalize_weights(holdings)


def _find_or_create_holding(
    holdings: list[dict[str, Any]],
    ticker: str,
    discovery: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    for row in holdings:
        if str(row.get("ticker")).upper() == ticker:
            return row
    template = discovery.get(ticker, {})
    row = {
        "ticker": ticker,
        "weight": 0.0,
        "asset_type": template.get("asset_type") or ("etf" if ticker in {"SGOV", "SHY", "BIL", "SHV", "VGSH", "JPST"} else "equity"),
        "sector": template.get("sector") or "Unknown",
        "momentum_6m": _num(template.get("momentum_6m"), 0.0),
        "upside": _num(template.get("valuation_gap"), _num(template.get("upside"), 0.0)),
    }
    holdings.append(row)
    return row


def _fund_from_book(holdings: list[dict[str, Any]], amount: float, protected: set[str] | None = None) -> None:
    protected = protected or set()
    remaining = max(amount, 0.0)
    cash = next((row for row in holdings if row.get("ticker") == "SGOV"), None)
    if cash is not None:
        draw = min(_num(cash.get("weight"), 0.0), remaining)
        cash["weight"] = max(_num(cash.get("weight"), 0.0) - draw, 0.0)
        remaining -= draw
    if remaining <= 0:
        return
    for row in sorted(holdings, key=lambda item: _num(item.get("weight"), 0.0), reverse=True):
        ticker = str(row.get("ticker") or "").upper()
        if ticker in protected or ticker == "SGOV":
            continue
        available = max(_num(row.get("weight"), 0.0) - 0.01, 0.0)
        draw = min(available, remaining)
        row["weight"] = max(_num(row.get("weight"), 0.0) - draw, 0.0)
        remaining -= draw
        if remaining <= 0:
            break


def _apply_trade_set(
    snapshot: dict[str, Any],
    row: dict[str, Any],
    policy_state: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    simulated_snapshot = deepcopy(snapshot)
    holdings = _seed_holdings(snapshot)
    discovery = _discovery_lookup(snapshot)
    trade_set = row.get("trade_set") or []

    for instruction in trade_set:
        text = str(instruction)
        trim_match = re.search(r"Trim\s+([A-Z]{2,6})\s+by\s+(\d+)%", text)
        if trim_match:
            ticker = trim_match.group(1).upper()
            trim_amount = max(float(trim_match.group(2)) / 100.0, 0.0)
            holding = _find_or_create_holding(holdings, ticker, discovery)
            actual_trim = min(_num(holding.get("weight"), 0.0), trim_amount)
            holding["weight"] = max(_num(holding.get("weight"), 0.0) - actual_trim, 0.0)
            cash = _find_or_create_holding(holdings, "SGOV", discovery)
            cash["weight"] = _num(cash.get("weight"), 0.0) + actual_trim
            continue

        hedge_match = re.search(r"via\s+([A-Z]{2,6})\s+to\s+at\s+least\s+(\d+)%", text)
        if hedge_match:
            ticker = hedge_match.group(1).upper()
            target = max(float(hedge_match.group(2)) / 100.0, 0.0)
            hedge = _find_or_create_holding(holdings, ticker, discovery)
            current = _num(hedge.get("weight"), 0.0)
            if current < target:
                needed = target - current
                _fund_from_book(holdings, needed, protected={ticker})
                hedge["weight"] = current + needed
            continue

        add_match = re.search(r"(Fund|Add)\s+([A-Z]{2,6})", text)
        if add_match:
            ticker = add_match.group(2).upper()
            target_size = max(_num(policy_state.get("max_single_name_add"), 0.04), 0.03)
            suggested = _num(discovery.get(ticker, {}).get("suggested_position"), target_size)
            size = min(max(suggested, 0.03), max(target_size, 0.04))
            _fund_from_book(holdings, size, protected={ticker})
            holding = _find_or_create_holding(holdings, ticker, discovery)
            holding["weight"] = _num(holding.get("weight"), 0.0) + size

    holdings = [row for row in holdings if _num(row.get("weight"), 0.0) > 1e-5]
    holdings = _normalize_weights(holdings)
    portfolio = simulated_snapshot.setdefault("portfolio", {})
    portfolio["holdings"] = deepcopy(holdings)
    portfolio["top_holdings"] = deepcopy(sorted(holdings, key=lambda item: _num(item.get("weight"), 0.0), reverse=True)[:10])
    analytics = portfolio.setdefault("analytics", {})
    analytics["Concentration HHI"] = round(_compute_hhi(holdings), 6)
    alignment = portfolio.setdefault("alignment", {})
    hedge_weight = next((_num(item.get("weight"), 0.0) for item in holdings if str(item.get("ticker")).upper() in {"SHY", "BIL", "SHV", "VGSH"}), 0.0)
    alignment["selected_hedge_weight"] = hedge_weight
    alignment["portfolio_beta"] = max(0.0, 1.0 - hedge_weight)
    return simulated_snapshot, {"holdings": holdings}


def _enrich_repairs(
    snapshot: dict[str, Any],
    repair_candidates: list[dict],
    uncertainty: dict[str, Any],
    base_policy_state: dict[str, Any],
    base_recoverability_budget: dict[str, Any],
    base_healing_dynamics: dict[str, Any],
    base_sponsorship: dict[str, Any],
    base_failure_modes: dict[str, Any],
    base_transition_memory: dict[str, Any],
    base_legitimacy_surface: dict[str, Any],
) -> list[dict]:
    enriched = []
    for row in repair_candidates:
        action_family = _action_family_for_repair(row)
        simulated_snapshot, _ = _apply_trade_set(snapshot, row, base_policy_state)
        simulated_measured = build_measured_state(simulated_snapshot)
        simulated_prob = build_probabilistic_state(
            simulated_snapshot,
            simulated_measured,
            uncertainty,
            horizon_days=int(_num(snapshot.get("bls_state_v2", {}).get("horizon_days"), 20)),
        )
        simulated_budget = build_recoverability_budget(
            simulated_measured,
            simulated_prob,
            base_healing_dynamics,
            base_sponsorship,
            [],
        )
        simulated_failure = build_failure_modes(
            simulated_measured,
            simulated_prob,
            base_healing_dynamics,
            base_sponsorship,
            simulated_budget,
            base_transition_memory,
        )
        provisional_legitimacy = build_legitimacy_surface(
            simulated_snapshot,
            simulated_prob,
            base_policy_state,
            uncertainty,
            simulated_budget,
            base_healing_dynamics,
            base_sponsorship,
            simulated_failure,
        )
        simulated_policy = build_policy_state_v2(
            simulated_prob,
            uncertainty,
            simulated_budget,
            base_healing_dynamics,
            base_sponsorship,
            provisional_legitimacy,
            simulated_failure,
        )
        simulated_legitimacy = build_legitimacy_surface(
            simulated_snapshot,
            simulated_prob,
            simulated_policy,
            uncertainty,
            simulated_budget,
            base_healing_dynamics,
            base_sponsorship,
            simulated_failure,
        )
        base_legit_row = next((item for item in base_legitimacy_surface.get("action_surface", []) if item.get("action_family") == action_family), None)
        simulated_legit_row = next((item for item in simulated_legitimacy.get("action_surface", []) if item.get("action_family") == action_family), None)
        delta_legitimacy = _num(simulated_legit_row.get("legitimacy_score") if simulated_legit_row else None, 0.0) - _num(
            base_legit_row.get("legitimacy_score") if base_legit_row else None, 0.0
        )
        delta_budget = _num(simulated_budget.get("remaining_budget"), 0.0) - _num(base_recoverability_budget.get("remaining_budget"), 0.0)
        base_failure = str(base_failure_modes.get("dominant_failure_mode") or "none_material")
        new_failure = str(simulated_failure.get("dominant_failure_mode") or "none_material")
        failure_relief = 0.0 if new_failure == base_failure else (0.30 if new_failure == "none_material" else 0.15)
        healing_support = max(_num(simulated_budget.get("repair_gain_capacity"), 0.0), 0.0)

        enriched.append({
            **row,
            "delta_budget_remaining": delta_budget,
            "delta_legitimacy": delta_legitimacy,
            "failure_mode_relief": failure_relief,
            "healing_support": healing_support,
            "simulated_mode": simulated_policy.get("mode"),
        })
    return enriched


def build_bls_state_contract_v2(snapshot: dict, *, horizon_days: int = 20) -> dict:
    measured_state = build_measured_state(snapshot)
    uncertainty = build_uncertainty(snapshot, measured_state)
    probabilistic_state = build_probabilistic_state(snapshot, measured_state, uncertainty, horizon_days=horizon_days)
    analogs = build_analogs(snapshot, probabilistic_state)
    transition_memory = build_transition_memory(snapshot, measured_state, probabilistic_state)
    healing_dynamics = build_healing_dynamics(snapshot, measured_state)
    rebound_sponsorship = build_rebound_sponsorship(measured_state, probabilistic_state, healing_dynamics, transition_memory)

    legacy_policy = build_policy_state(snapshot, measured_state, probabilistic_state, uncertainty)
    seed_repairs = build_repair_candidates(snapshot, measured_state, probabilistic_state, legacy_policy)
    recoverability_budget = build_recoverability_budget(
        measured_state,
        probabilistic_state,
        healing_dynamics,
        rebound_sponsorship,
        seed_repairs,
    )
    failure_modes = build_failure_modes(
        measured_state,
        probabilistic_state,
        healing_dynamics,
        rebound_sponsorship,
        recoverability_budget,
        transition_memory,
    )
    provisional_legitimacy = build_legitimacy_surface(
        snapshot,
        probabilistic_state,
        legacy_policy,
        uncertainty,
        recoverability_budget,
        healing_dynamics,
        rebound_sponsorship,
        failure_modes,
    )
    policy_state = build_policy_state_v2(
        probabilistic_state,
        uncertainty,
        recoverability_budget,
        healing_dynamics,
        rebound_sponsorship,
        provisional_legitimacy,
        failure_modes,
    )
    legitimacy_surface = build_legitimacy_surface(
        snapshot,
        probabilistic_state,
        policy_state,
        uncertainty,
        recoverability_budget,
        healing_dynamics,
        rebound_sponsorship,
        failure_modes,
    )
    base_repairs = build_repair_candidates(snapshot, measured_state, probabilistic_state, policy_state)
    recoverability_budget = build_recoverability_budget(
        measured_state,
        probabilistic_state,
        healing_dynamics,
        rebound_sponsorship,
        base_repairs,
    )
    policy_state = build_policy_state_v2(
        probabilistic_state,
        uncertainty,
        recoverability_budget,
        healing_dynamics,
        rebound_sponsorship,
        legitimacy_surface,
        failure_modes,
    )
    legitimacy_surface = build_legitimacy_surface(
        snapshot,
        probabilistic_state,
        policy_state,
        uncertainty,
        recoverability_budget,
        healing_dynamics,
        rebound_sponsorship,
        failure_modes,
    )
    repair_candidates = _enrich_repairs(
        snapshot,
        base_repairs,
        uncertainty,
        policy_state,
        recoverability_budget,
        healing_dynamics,
        rebound_sponsorship,
        failure_modes,
        transition_memory,
        legitimacy_surface,
    )
    balance_sheet = build_recoverability_balance_sheet(
        snapshot,
        measured_state,
        probabilistic_state,
        policy_state,
        uncertainty,
        recoverability_budget=recoverability_budget,
        healing_dynamics=healing_dynamics,
        rebound_sponsorship=rebound_sponsorship,
        legitimacy_surface=legitimacy_surface,
        failure_modes=failure_modes,
        transition_memory=transition_memory,
        repair_candidates=repair_candidates,
    )
    return {
        "contract_version": CONTRACT_VERSION_V2,
        "model_version": MODEL_VERSION_V2,
        "as_of": snapshot.get("as_of_date") or snapshot.get("overview", {}).get("as_of_date"),
        "portfolio_id": "default",
        "horizon_days": horizon_days,
        "measured_state": measured_state,
        "probabilistic_state": probabilistic_state,
        "policy_state": policy_state,
        "recoverability_budget": recoverability_budget,
        "healing_dynamics": healing_dynamics,
        "rebound_sponsorship": rebound_sponsorship,
        "legitimacy_surface": legitimacy_surface,
        "failure_modes": failure_modes,
        "transition_memory": transition_memory,
        "repair_candidates": repair_candidates,
        "analogs": analogs,
        "balance_sheet": balance_sheet,
        "uncertainty": {
            key: value
            for key, value in uncertainty.items()
            if key != "authority_score"
        },
    }
