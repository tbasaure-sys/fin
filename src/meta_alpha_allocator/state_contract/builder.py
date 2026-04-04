from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING

from .analogs import build_analogs
from .balance_sheet import build_recoverability_balance_sheet
from .measured import build_measured_state
from .policy import build_policy_state
from .probabilistic import build_probabilistic_state
from .research_artifacts import build_research_provenance, load_research_artifacts
from .repairs import build_repair_candidates
from .uncertainty import CONTRACT_VERSION, MODEL_VERSION, build_uncertainty
from .validation import ContractValidationError, validate_contract, validation_mode

if TYPE_CHECKING:
    from ..config import PathConfig


def build_bls_state_contract_v1(snapshot: dict, *, horizon_days: int = 20, paths: 'PathConfig | None' = None) -> dict:
    research_artifacts = load_research_artifacts(paths)
    measured_state = build_measured_state(snapshot)
    uncertainty = build_uncertainty(snapshot, measured_state, research_artifacts=research_artifacts)
    probabilistic_state = build_probabilistic_state(snapshot, measured_state, uncertainty, horizon_days=horizon_days, research_artifacts=research_artifacts)
    uncertainty = {
        **uncertainty,
        "probability_layer_source": probabilistic_state.get("source"),
        "probability_model_package_version": probabilistic_state.get("model_package_version"),
        "probability_package_metrics": probabilistic_state.get("package_metrics", []),
        "probability_package_invalidation_reason": probabilistic_state.get("package_invalidation_reason"),
        "artifact_fingerprint_hash": probabilistic_state.get("artifact_fingerprint_hash"),
    }
    policy_state = build_policy_state(snapshot, measured_state, probabilistic_state, uncertainty)
    analogs = build_analogs(snapshot, probabilistic_state, measured_state=measured_state, research_artifacts=research_artifacts)
    repair_candidates = build_repair_candidates(snapshot, measured_state, probabilistic_state, policy_state)
    balance_sheet = build_recoverability_balance_sheet(
        snapshot,
        measured_state,
        probabilistic_state,
        policy_state,
        uncertainty,
        repair_candidates=repair_candidates,
    )
    contract = {
        'contract_version': CONTRACT_VERSION,
        'model_version': MODEL_VERSION,
        'as_of': snapshot.get('as_of_date') or snapshot.get('overview', {}).get('as_of_date'),
        'portfolio_id': 'default',
        'horizon_days': horizon_days,
        'measured_state': measured_state,
        'probabilistic_state': probabilistic_state,
        'policy_state': policy_state,
        'repair_candidates': repair_candidates,
        'analogs': analogs,
        'balance_sheet': balance_sheet,
        'research_provenance': build_research_provenance(research_artifacts),
        'uncertainty': {
            key: value
            for key, value in uncertainty.items()
            if key != 'authority_score'
        },
    }
    validation = validate_contract(contract)
    mode = validation_mode()
    if not validation.valid and mode == "strict":
        raise ContractValidationError("; ".join(validation.get("errors", [])))
    contract_hash = hashlib.sha256(json.dumps(contract, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    contract['status'] = {
        'contract_status': 'canonical_valid' if validation.valid else 'canonical_invalid_warn',
        'contract_hash': contract_hash,
        'contract_validation': validation,
    }
    return contract
