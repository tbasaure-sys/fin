from __future__ import annotations

from .analogs import build_analogs
from .measured import build_measured_state
from .policy import build_policy_state
from .probabilistic import build_probabilistic_state
from .repairs import build_repair_candidates
from .uncertainty import CONTRACT_VERSION, MODEL_VERSION, build_uncertainty


def build_bls_state_contract_v1(snapshot: dict, *, horizon_days: int = 20) -> dict:
    measured_state = build_measured_state(snapshot)
    uncertainty = build_uncertainty(snapshot, measured_state)
    probabilistic_state = build_probabilistic_state(snapshot, measured_state, uncertainty, horizon_days=horizon_days)
    policy_state = build_policy_state(snapshot, measured_state, probabilistic_state, uncertainty)
    analogs = build_analogs(snapshot, probabilistic_state)
    repair_candidates = build_repair_candidates(snapshot, measured_state, probabilistic_state, policy_state)
    return {
        "contract_version": CONTRACT_VERSION,
        "model_version": MODEL_VERSION,
        "as_of": snapshot.get("as_of_date") or snapshot.get("overview", {}).get("as_of_date"),
        "portfolio_id": "default",
        "horizon_days": horizon_days,
        "measured_state": measured_state,
        "probabilistic_state": probabilistic_state,
        "policy_state": policy_state,
        "repair_candidates": repair_candidates,
        "analogs": analogs,
        "uncertainty": {
            key: value
            for key, value in uncertainty.items()
            if key != "authority_score"
        },
    }
