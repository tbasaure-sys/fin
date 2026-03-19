from __future__ import annotations

import re
from typing import Any

from .fiber import summarize_visible_fiber
from .memory import summarize_decision_memory


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


def _fmt_pct(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{_clamp01(value) * 100:.1f}%"


def _fmt_signed_pct(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value * 100:+.1f}%"


def _first_ticker_from_trade_set(trade_set: list[str]) -> str | None:
    for text in trade_set:
        match = re.search(r"\b([A-Z]{2,6})\b", str(text))
        if match:
            return match.group(1)
    return None


def _humanize_rule(rule: Any) -> str:
    text = str(rule or "").strip()
    match = re.match(r"p_([a-z0-9_]+)_(below|above)_0_(\d+)", text)
    if match:
        feature = match.group(1)
        comparator = "falls below" if match.group(2) == "below" else "rises above"
        pct = match.group(3)
        label_map = {
            "portfolio_recoverability": "recovery chance",
            "phantom_rebound": "false rebound risk",
            "authority_score": "authority score",
        }
        label = label_map.get(feature, feature.replace("_", " "))
        return f"{label} {comparator} {pct}%"
    return text.replace("_", " ")


def _move_tone(classification: str | None, fallback: str) -> str:
    normalized = str(classification or "").lower()
    if normalized == "real_repair":
        return "good"
    if normalized == "optionality_preserving_defense":
        return "warn"
    return fallback


def _build_move_from_repair(repair: dict[str, Any], slot: str, fiber_takeaway: str, recoverability: float, phantom: float) -> dict[str, Any]:
    trade_set = [str(item) for item in (repair.get("trade_set") or []) if str(item).strip()]
    summary = " + ".join(trade_set) if trade_set else "Protect the portfolio"
    ticker = _first_ticker_from_trade_set(trade_set)
    turnover = _num(repair.get("turnover"), 0.0)
    delta_recoverability = _num(repair.get("delta_recoverability"), 0.0)
    delta_phantom = _num(repair.get("delta_phantom"), 0.0)
    delta_extreme = _num(repair.get("delta_extreme_drawdown"), 0.0)
    classification = str(repair.get("classification") or "").replace("_", " ")
    funding = str(repair.get("funding_source") or "No change").replace("_", " ")
    binding_constraints = [str(item) for item in (repair.get("binding_constraints") or []) if str(item).strip()]
    invalidation = [str(item) for item in (repair.get("invalidation") or []) if str(item).strip()]
    title = summary if len(summary) <= 54 else f"{summary[:51]}..."
    move_tone = _move_tone(repair.get("classification"), "neutral")
    slot_tone = {"primary": "good", "secondary": "warn", "caution": "neutral"}.get(slot, "neutral")

    return {
        "id": str(repair.get("id") or f"{slot}-{ticker or 'move'}"),
        "slot": {"primary": "Best now", "secondary": "Also valid", "caution": "Not yet"}.get(slot, "Advice"),
        "slotTone": slot_tone,
        "tone": move_tone,
        "title": title,
        "ticker": ticker,
        "size": _fmt_pct(turnover),
        "funding": funding,
        "summary": summary,
        "why": (
            f"{classification or 'Repair'} improves recovery chance by {_fmt_pct(max(delta_recoverability, 0.0))} "
            f"and shifts false rebound risk by {_fmt_signed_pct(delta_phantom)}."
        ),
        "watchFor": (
            binding_constraints[0]
            if binding_constraints
            else "Keep the move small and reversible until the state becomes clearer."
        ),
        "fiberLine": fiber_takeaway,
        "trigger": _humanize_rule(invalidation[0]) if invalidation else None,
        "sourceLabel": "Canonical repair candidate",
        "effects": [
            {"label": "Recovery chance", "value": _fmt_pct(max(0.0, recoverability + delta_recoverability))},
            {"label": "False rebound risk", "value": _fmt_pct(_clamp01(phantom + delta_phantom))},
            {"label": "Room later", "value": _fmt_pct(max(0.0, 1.0 - turnover))},
            {"label": "Tail loss", "value": _fmt_signed_pct(delta_extreme)},
        ],
    }


def _build_fallback_move(snapshot: dict[str, Any], slot: str, recoverability: float, phantom: float, fiber_takeaway: str) -> dict[str, Any]:
    overview = snapshot.get("overview", {})
    portfolio = snapshot.get("portfolio", {})
    hedge = str(overview.get("selected_hedge") or snapshot.get("hedges", {}).get("selected_hedge") or "cash").upper()
    holdings = portfolio.get("holdings") or portfolio.get("top_holdings") or []
    biggest = None
    if holdings:
        biggest = max(holdings, key=lambda row: _num(row.get("weight"), 0.0))
    label = "Best now" if slot == "primary" else "Also valid" if slot == "secondary" else "Not yet"
    slot_tone = {"primary": "good", "secondary": "warn", "caution": "neutral"}.get(slot, "neutral")

    if slot == "primary":
        return {
            "id": "hold-risk-budget",
            "slot": label,
            "slotTone": slot_tone,
            "tone": "hold",
            "title": f"Keep {hedge} as ballast",
            "ticker": hedge,
            "size": "Keep current size",
            "funding": "No change",
            "summary": f"{hedge} is the sleeve preserving room to act later.",
            "why": f"Recovery chance is {_fmt_pct(recoverability)} and false rebound risk is {_fmt_pct(phantom)}.",
            "watchFor": "Only cut this ballast when recovery chance improves and the bounce remains real.",
            "fiberLine": fiber_takeaway,
            "trigger": "Recovery chance rises and the state becomes more restorative.",
            "sourceLabel": "Decision engine",
            "effects": [
                {"label": "Recovery chance", "value": _fmt_pct(recoverability)},
                {"label": "False rebound risk", "value": _fmt_pct(phantom)},
                {"label": "Room later", "value": "Preserved"},
            ],
        }

    if slot == "secondary":
        biggest_weight = _num(biggest.get("weight"), 0.0) if biggest else 0.0
        return {
            "id": "trim-and-stage",
            "slot": label,
            "slotTone": slot_tone,
            "tone": "trim",
            "title": "Trim the largest position a little",
            "ticker": "Largest position",
            "size": _fmt_pct(min(biggest_weight, 0.05) if biggest_weight else 0.03),
            "funding": f"Fund with {hedge}",
            "summary": f"Small trims can improve room to act without forcing a large opinion.",
            "why": "A small trim preserves optionality while the state is still uncertain.",
            "watchFor": "Keep it reversible and stop if the state weakens further.",
            "fiberLine": fiber_takeaway,
            "trigger": "Recovery chance moves above the staging threshold.",
            "sourceLabel": "Decision engine",
            "effects": [
                {"label": "Recovery chance", "value": _fmt_pct(min(1.0, recoverability + 0.03))},
                {"label": "False rebound risk", "value": _fmt_pct(max(0.0, phantom - 0.01))},
                {"label": "Room later", "value": "Improved"},
            ],
        }

    return {
        "id": "wait-for-confirmation",
        "slot": label,
        "slotTone": slot_tone,
        "tone": "hold",
        "title": "Wait for cleaner confirmation",
        "ticker": "Broad risk",
        "size": "Wait",
        "funding": "Preserve liquidity",
        "summary": "Do not widen the whole book while the state is still ambiguous.",
        "why": f"Recovery chance is {_fmt_pct(recoverability)}, false rebound risk is {_fmt_pct(phantom)}, and similar states are still mixed.",
        "watchFor": "Wait for a more believable rebound before treating a green tape as permission to add risk.",
        "fiberLine": fiber_takeaway,
        "trigger": "Recovery chance improves and visible fiber stops splitting.",
        "sourceLabel": "Decision engine",
        "effects": [
            {"label": "Recovery chance", "value": _fmt_pct(recoverability)},
            {"label": "False rebound risk", "value": _fmt_pct(phantom)},
            {"label": "Room later", "value": "Preserved"},
        ],
    }


def _build_thresholds(recoverability: float, phantom: float, ambiguity: str) -> list[dict[str, Any]]:
    return [
        {
            "id": "recover-high",
            "label": "Recovery chance above 60%",
            "meaning": "Staged adds become easier to justify.",
            "active": recoverability >= 0.6,
        },
        {
            "id": "recover-mid",
            "label": "Recovery chance between 35% and 60%",
            "meaning": "Use small reversible moves and wait for better confirmation.",
            "active": recoverability >= 0.35 and recoverability < 0.6,
        },
        {
            "id": "recover-low",
            "label": "Recovery chance below 35%",
            "meaning": "Protect first. Trims, hedges, and patience matter more than new risk.",
            "active": recoverability < 0.35,
        },
        {
            "id": "phantom",
            "label": "False rebound risk above 45%",
            "meaning": "Green days are suspect until breadth improves underneath.",
            "active": phantom >= 0.45,
        },
        {
            "id": "fiber",
            "label": "Visible fiber ambiguity is high",
            "meaning": "Similar-looking states split later, so prefer small reversible moves.",
            "active": ambiguity == "High",
        },
    ]


def build_decision_packet(snapshot: dict[str, Any]) -> dict[str, Any]:
    try:
        overview = snapshot.get("overview", {}) or {}
        portfolio = snapshot.get("portfolio", {}) or {}
        contract = snapshot.get("bls_state_v2") or snapshot.get("bls_state_v1") or {}
        probabilistic = contract.get("probabilistic_state", {}) if isinstance(contract, dict) else {}
        policy_state = contract.get("policy_state", {}) if isinstance(contract, dict) else {}
        uncertainty = contract.get("uncertainty", {}) if isinstance(contract, dict) else {}
        repair_candidates = list(contract.get("repair_candidates") or []) if isinstance(contract, dict) else []
        fiber = summarize_visible_fiber(contract if isinstance(contract, dict) else {})
        memory = summarize_decision_memory(snapshot)

        recoverability = _num(probabilistic.get("p_portfolio_recoverability"), _num(overview.get("confidence"), 0.0))
        phantom = _num(probabilistic.get("p_phantom_rebound"), 0.0)
        authority = _num(uncertainty.get("authority", {}).get("authority_policy_gate", uncertainty.get("authority_score")), 0.0)
        mode = str(policy_state.get("mode") or "observe").replace("_", " ").strip().title()
        holdings = portfolio.get("holdings") or portfolio.get("top_holdings") or []
        holdings_count = int(portfolio.get("analytics", {}).get("Holdings Count") or len(holdings) or 0)
        biggest = max(holdings, key=lambda row: _num(row.get("weight"), 0.0)) if holdings else None
        biggest_detail = (
            f"Largest position is {_fmt_pct(_num(biggest.get('weight'), 0.0))} of the book."
            if biggest
            else "Portfolio size unavailable"
        )

        moves = sorted(repair_candidates, key=lambda row: (_num(row.get("delta_recoverability"), 0.0), _num(row.get("repair_efficiency"), 0.0)), reverse=True)
        packet_moves = [
            _build_move_from_repair(moves[0], "primary", fiber.get("takeaway", "Comparable-state read unavailable."), recoverability, phantom)
            if len(moves) > 0
            else _build_fallback_move(snapshot, "primary", recoverability, phantom, fiber.get("takeaway", "Comparable-state read unavailable.")),
            _build_move_from_repair(moves[1], "secondary", fiber.get("takeaway", "Comparable-state read unavailable."), recoverability, phantom)
            if len(moves) > 1
            else _build_fallback_move(snapshot, "secondary", recoverability, phantom, fiber.get("takeaway", "Comparable-state read unavailable.")),
            _build_move_from_repair(moves[2], "caution", fiber.get("takeaway", "Comparable-state read unavailable."), recoverability, phantom)
            if len(moves) > 2
            else _build_fallback_move(snapshot, "caution", recoverability, phantom, fiber.get("takeaway", "Comparable-state read unavailable.")),
        ]

        evidence_strength = "Strong" if authority >= 0.68 or fiber.get("ambiguity_label") == "Low" else "Usable" if authority >= 0.46 else "Thin"
        headline = (
            f"{packet_moves[0]['title']} while recovery chance is {_fmt_pct(recoverability)}"
            if packet_moves and packet_moves[0].get("title")
            else "Keep the portfolio recoverable before widening risk"
        )

        memory_narrative = list(memory.get("narrative") or [])
        if fiber.get("available"):
            memory_narrative.insert(0, f"Visible fiber ambiguity is {str(fiber.get('ambiguity_label') or 'unknown').lower()}.")
        if not memory_narrative:
            memory_narrative = ["No decision memory is available yet."]

        summary = "Plain-language advice for this exact portfolio. Start here, then open the deeper modules only if you need to understand why."
        if memory.get("penalty_reason"):
            summary = f"{summary} Recent calibration says: {memory['penalty_reason']}."

        return {
            "id": "advice",
            "kicker": "Decision packet",
            "title": "Just advice",
            "headline": headline,
            "summary": summary,
            "current_read": [
                {
                    "label": "Holdings",
                    "value": str(holdings_count),
                    "detail": biggest_detail,
                },
                {
                    "label": "Recovery chance",
                    "value": _fmt_pct(recoverability),
                    "detail": "Above 60% opens wider staged adds. Below 35% means protect first.",
                },
                {
                    "label": "False rebound risk",
                    "value": _fmt_pct(phantom),
                    "detail": "Higher means green days are easier to fake.",
                },
                {
                    "label": "Evidence strength",
                    "value": evidence_strength,
                    "detail": fiber.get("headline") or "Comparable-state history unavailable.",
                },
            ],
            "moves": packet_moves,
            "thresholds": _build_thresholds(recoverability, phantom, fiber.get("ambiguity_label") or "Unknown"),
            "fiberTakeaway": fiber.get("takeaway") or "Comparable-state read unavailable.",
            "fiberHeadline": fiber.get("headline") or "No comparable states yet",
            "fiberExplanation": fiber.get("explanation") or "This compares the current setup with similar past states.",
            "changeTrigger": str(policy_state.get("required_confirmation") or "").replace("_", " ") if policy_state else None,
            "memory": memory,
            "memoryNarrative": memory_narrative[:4],
            "stateSummary": {
                "mode": mode,
                "recoverability": _fmt_pct(recoverability),
                "phantom": _fmt_pct(phantom),
                "authority": _fmt_pct(authority),
            },
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "id": "advice",
            "kicker": "Decision packet",
            "title": "Just advice",
            "headline": "Decision packet unavailable",
            "summary": f"The decision packet could not be built: {exc}",
            "current_read": [],
            "moves": [],
            "thresholds": [],
            "fiberTakeaway": "Comparable-state read unavailable.",
            "fiberHeadline": "No comparable states yet",
            "fiberExplanation": "This compares the current setup with similar past states to see whether similar-looking situations usually healed, stalled, or got worse.",
            "changeTrigger": None,
            "memory": {"available": False, "narrative": ["Decision memory is unavailable."]},
            "memoryNarrative": ["Decision memory is unavailable."],
            "stateSummary": {},
            "error": str(exc),
        }
