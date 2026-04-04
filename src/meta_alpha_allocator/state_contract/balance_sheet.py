from __future__ import annotations

from typing import Any


def _num(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        parsed = float(value)
        return default if parsed != parsed else parsed
    except (TypeError, ValueError):
        return default


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _mean(values: list[float]) -> float:
    clean = [float(value) for value in values]
    return sum(clean) / len(clean) if clean else 0.0


def _status_label(net_freedom: float, reserve: float) -> str:
    if net_freedom >= 0.62 and reserve >= 0.45:
        return "accretive"
    if net_freedom >= 0.45 and reserve >= 0.24:
        return "balanced"
    return "stressed"


def _fmt_score(value: float) -> str:
    return f"{_clamp01(value) * 100:.1f}%"


def _normalized_factor_dimension(measured_state: dict[str, Any]) -> float:
    return _clamp01(_num(measured_state.get("portfolio_factor_dimension"), 1.0) / 4.0)


def _structural_freedom(measured_state: dict[str, Any]) -> float:
    effective_dimension = _clamp01(_num(measured_state.get("market_effective_dimension"), 1.0) / 6.0)
    breadth = _clamp01(_num(measured_state.get("breadth"), 0.5))
    corr_penalty = 1.0 - _clamp01(_num(measured_state.get("median_pairwise_corr"), 0.5))
    dominance_penalty = 1.0 - _clamp01(_num(measured_state.get("market_dominance_share"), 0.5))
    return _clamp01(
        0.35 * effective_dimension
        + 0.30 * breadth
        + 0.20 * corr_penalty
        + 0.15 * dominance_penalty
    )


def _healing_quality(
    probabilistic_state: dict[str, Any],
    healing_dynamics: dict[str, Any] | None,
    rebound_sponsorship: dict[str, Any] | None,
) -> float:
    healing_velocity = max(_num((healing_dynamics or {}).get("healing_velocity"), 0.0), 0.0)
    restoration = _clamp01(_num(probabilistic_state.get("p_structural_restoration"), 0.0))
    support_dependency = _clamp01(_num((rebound_sponsorship or {}).get("support_dependency"), 0.0))
    return _clamp01(0.45 * healing_velocity + 0.40 * restoration + 0.15 * (1.0 - support_dependency))


def _repair_capacity(
    recoverability_budget: dict[str, Any] | None,
    repair_candidates: list[dict[str, Any]] | None,
) -> float:
    budget_capacity = _clamp01(_num((recoverability_budget or {}).get("repair_gain_capacity"), 0.0))
    if budget_capacity > 0:
        return budget_capacity
    top_repair = (repair_candidates or [None])[0] or {}
    return _clamp01(max(_num(top_repair.get("delta_recoverability"), 0.0), 0.0))


def _legitimacy_slack(legitimacy_surface: dict[str, Any] | None, policy_state: dict[str, Any]) -> float:
    action_surface = (legitimacy_surface or {}).get("action_surface") or []
    if action_surface:
        growth_actions = [
            row for row in action_surface
            if row.get("action_family") in {"gross_beta_add", "single_name_add", "funded_rotation"}
        ]
        if growth_actions:
            normalized = []
            for row in growth_actions:
                score = _clamp01(_num(row.get("legitimacy_score"), 0.0))
                normalized.append(max(score - 0.40, 0.0) / 0.60)
            return _clamp01(_mean(normalized))

    gross_add = _clamp01(_num(policy_state.get("max_gross_add"), 0.0) / 0.16)
    single_add = _clamp01(_num(policy_state.get("max_single_name_add"), 0.0) / 0.05)
    return _clamp01(0.65 * gross_add + 0.35 * single_add)


def build_recoverability_balance_sheet(
    snapshot: dict[str, Any],
    measured_state: dict[str, Any],
    probabilistic_state: dict[str, Any],
    policy_state: dict[str, Any],
    uncertainty: dict[str, Any],
    *,
    recoverability_budget: dict[str, Any] | None = None,
    healing_dynamics: dict[str, Any] | None = None,
    rebound_sponsorship: dict[str, Any] | None = None,
    legitimacy_surface: dict[str, Any] | None = None,
    failure_modes: dict[str, Any] | None = None,
    transition_memory: dict[str, Any] | None = None,
    repair_candidates: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    del snapshot
    recoverability_budget = recoverability_budget or {}
    healing_dynamics = healing_dynamics or {}
    rebound_sponsorship = rebound_sponsorship or {}
    legitimacy_surface = legitimacy_surface or {}
    failure_modes = failure_modes or {}
    transition_memory = transition_memory or {}
    repair_candidates = repair_candidates or []

    liquidity = _clamp01(_num(measured_state.get("portfolio_liquidity_buffer"), 0.0))
    freedom = _structural_freedom(measured_state)
    authority = _clamp01(
        _num(uncertainty.get("authority_score"), _num((uncertainty.get("authority") or {}).get("authority_policy_gate"), 0.0))
    )
    healing = _healing_quality(probabilistic_state, healing_dynamics, rebound_sponsorship)
    repair = _repair_capacity(recoverability_budget, repair_candidates)

    phantom = _clamp01(_num(probabilistic_state.get("p_phantom_rebound"), 0.0))
    compression = _clamp01(_num(measured_state.get("market_compression"), 0.0))
    concentration = _clamp01(_num(measured_state.get("portfolio_hhi"), 0.0))
    fragility = _clamp01(_num(measured_state.get("portfolio_fragility_exposure"), 0.0))
    transition_entropy = _clamp01(_num(transition_memory.get("state_entropy"), 0.0))
    extreme_drawdown = _clamp01(_num(probabilistic_state.get("p_extreme_drawdown"), 0.0))

    remaining_budget = _clamp01(_num(recoverability_budget.get("remaining_budget"), 0.0))
    hedge_floor = _clamp01(_num(policy_state.get("hedge_floor"), 0.0) / 0.25)
    legitimacy_slack = _legitimacy_slack(legitimacy_surface, policy_state)

    asset_rows = [
        {
            "id": "liquidity_buffer",
            "label": "Liquidity buffer",
            "value": liquidity,
            "detail": "Cash-like ballast and easy-to-move capital that keeps forced selling risk lower.",
        },
        {
            "id": "structural_freedom",
            "label": "Structural freedom",
            "value": freedom,
            "detail": "Breadth, effective dimension, and lower mode dominance keep the book less trapped.",
        },
        {
            "id": "authority_reserve",
            "label": "Authority reserve",
            "value": authority,
            "detail": "How much the current evidence deserves to speak loudly rather than tentatively.",
        },
        {
            "id": "healing_quality",
            "label": "Healing quality",
            "value": healing,
            "detail": "Improvement that looks structural rather than just visible in price.",
        },
        {
            "id": "repair_capacity",
            "label": "Repair capacity",
            "value": repair,
            "detail": "How much recoverability the current best repair path can realistically create.",
        },
    ]
    liability_rows = [
        {
            "id": "phantom_rebound",
            "label": "Phantom rebound tax",
            "value": phantom,
            "detail": "Visible price relief that can still fail to reopen the structure underneath.",
        },
        {
            "id": "compression_drag",
            "label": "Compression drag",
            "value": compression,
            "detail": "A tighter market mode means less real independence across positions.",
        },
        {
            "id": "concentration_burden",
            "label": "Concentration burden",
            "value": concentration,
            "detail": "Too much capital tied to too few positions narrows future choices.",
        },
        {
            "id": "fragility_transfer",
            "label": "Fragility transfer",
            "value": fragility,
            "detail": "Weak holdings can drag stress through the rest of the book.",
        },
        {
            "id": "transition_entropy",
            "label": "Transition entropy",
            "value": transition_entropy,
            "detail": "When nearby states split into many outcomes, the cost of being wrong rises.",
        },
        {
            "id": "tail_loss",
            "label": "Tail loss burden",
            "value": extreme_drawdown,
            "detail": "The part of the book still too exposed to a harder downside path.",
        },
    ]

    asset_total = _clamp01(_mean([row["value"] for row in asset_rows]))
    liability_total = _clamp01(_mean([row["value"] for row in liability_rows]))
    optionality_reserve = _clamp01(
        0.40 * remaining_budget
        + 0.25 * liquidity
        + 0.20 * authority
        + 0.15 * (1.0 - transition_entropy)
    )
    phantom_tax = _clamp01(0.60 * phantom + 0.20 * compression + 0.20 * fragility)
    net_freedom = _clamp01(0.50 + ((asset_total - liability_total) * 0.75))
    spending_capacity = _clamp01(
        0.45 * optionality_reserve
        + 0.30 * legitimacy_slack
        + 0.25 * (1.0 - phantom_tax)
    )
    accounting_state = _status_label(net_freedom, optionality_reserve)

    top_repair = repair_candidates[0] if repair_candidates else None
    dominant_failure = str(failure_modes.get("dominant_failure_mode") or "none_material").replace("_", " ")
    budget_state = str(recoverability_budget.get("budget_state") or "unknown")

    if accounting_state == "accretive":
        headline = "The book is earning future freedom faster than it is burning it."
    elif accounting_state == "balanced":
        headline = "The book still has room, but each new move must justify the optionality it spends."
    else:
        headline = "The book is burning recoverability faster than it is creating it."

    spend_rule = (
        "Spend optionality carefully."
        if spending_capacity >= 0.55
        else "Only spend optionality on moves that clearly widen future freedom."
        if spending_capacity >= 0.35
        else "Do not spend optionality on broad risk adds right now."
    )
    repair_note = (
        f"Best current repair can add {_fmt_score(max(_num(top_repair.get('delta_recoverability'), 0.0), 0.0))} of recoverability."
        if top_repair
        else "No repair candidate is currently creating much recoverability."
    )

    reserve_rows = [
        {
            "id": "optionality_reserve",
            "label": "Optionality reserve",
            "value": optionality_reserve,
            "detail": "How much room you still have after a plausible wrong move.",
        },
        {
            "id": "legitimacy_slack",
            "label": "Legitimacy slack",
            "value": legitimacy_slack,
            "detail": "How much action rights remain open for risk adds and funded rotations.",
        },
        {
            "id": "spending_capacity",
            "label": "Spendable capacity",
            "value": spending_capacity,
            "detail": "How much of your remaining freedom can be spent without breaking the book.",
        },
        {
            "id": "hedge_floor",
            "label": "Defense reserve",
            "value": hedge_floor,
            "detail": "Minimum defensive ballast the system wants to preserve.",
        },
    ]

    return {
        "version": "recoverability_balance_sheet_v1",
        "accounting_state": accounting_state,
        "headline": headline,
        "summary": (
            "This treats future freedom as an accounting object. Assets create recoverability. "
            "Liabilities consume it. Reserves decide whether the portfolio can afford new risk."
        ),
        "asset_total": asset_total,
        "liability_total": liability_total,
        "net_freedom": net_freedom,
        "optionality_reserve": optionality_reserve,
        "phantom_tax": phantom_tax,
        "legitimacy_slack": legitimacy_slack,
        "spending_capacity": spending_capacity,
        "budget_state": budget_state,
        "dominant_failure_mode": dominant_failure,
        "assets": asset_rows,
        "liabilities": liability_rows,
        "reserves": reserve_rows,
        "spend_rule": spend_rule,
        "repair_note": repair_note,
        "top_repair": top_repair,
        "notes": [
            f"Budget state: {budget_state}.",
            f"Phantom tax: {_fmt_score(phantom_tax)}.",
            f"Net freedom: {_fmt_score(net_freedom)}.",
            f"Dominant failure mode: {dominant_failure}.",
        ],
    }
