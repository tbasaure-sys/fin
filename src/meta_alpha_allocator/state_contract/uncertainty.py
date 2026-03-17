from __future__ import annotations

from typing import Any

from .research_artifacts import build_research_provenance

CONTRACT_VERSION = 'state_contract_v1'
MODEL_VERSION = 'bls_state_v1.1'


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _count_present(values: list[Any]) -> float:
    if not values:
        return 0.0
    present = 0
    for value in values:
        if value is None:
            continue
        present += 1
    return present / len(values)


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _first_row(research_artifacts: dict[str, Any], key: str) -> dict[str, Any]:
    frame = research_artifacts.get(key, {}).get('frame')
    if frame is None or frame.empty:
        return {}
    return frame.iloc[0].to_dict()


def build_uncertainty(snapshot: dict[str, Any], measured_state: dict[str, Any], *, research_artifacts: dict[str, Any] | None = None) -> dict[str, Any]:
    research_artifacts = research_artifacts or {}
    provenance = build_research_provenance(research_artifacts)
    stale_values = []
    for key in ['risk', 'portfolio', 'screener', 'forecast', 'statement_intelligence']:
        try:
            stale = snapshot.get(key, {}).get('stale_days')
            if stale is not None:
                stale_values.append(float(stale))
        except (TypeError, ValueError):
            continue
    max_stale = max(stale_values) if stale_values else 0.0
    warnings = snapshot.get('status', {}).get('warnings', []) or []
    measured_coverage = _count_present(list(measured_state.values()))

    recoverability_summary = _first_row(research_artifacts, 'recoverability_summary')
    prob_summary = _first_row(research_artifacts, 'prob_recoverability_summary')
    shock_support = research_artifacts.get('shock_support_summary', {}).get('frame')
    tightening_summary = _first_row(research_artifacts, 'tightening_summary')
    intervention_table = research_artifacts.get('state_dependent_intervention', {}).get('frame')

    calibration_signals = []
    spearman = recoverability_summary.get('spearman_rho_mean')
    cost_lift = recoverability_summary.get('cost_lift_top20_minus_bottom20_mean')
    if spearman is not None:
        calibration_signals.append(_clamp01(0.5 + (float(spearman) * 2.5)))
    if cost_lift is not None:
        calibration_signals.append(_clamp01(0.5 + (float(cost_lift) * 4.0)))
    auc = prob_summary.get('no_relief_model_auc_oof')
    if auc is not None:
        calibration_signals.append(_clamp01(float(auc)))
    if shock_support is not None and not shock_support.empty and 'auc_oof' in shock_support.columns:
        calibration_signals.append(_clamp01(float(shock_support['auc_oof'].mean())))
    tightening_auc = tightening_summary.get('auc_oof')
    if tightening_auc is not None:
        calibration_signals.append(_clamp01(float(tightening_auc)))
    if intervention_table is not None and not intervention_table.empty and 'metric' in intervention_table.columns and 'value' in intervention_table.columns:
        auc_rows = intervention_table.loc[intervention_table['metric'] == 'auc_test_full', 'value']
        if not auc_rows.empty:
            calibration_signals.append(_clamp01(float(auc_rows.iloc[0])))

    calibration_component = _clamp01(_mean(calibration_signals) if calibration_signals else 0.68)
    episode_counts = []
    for key, column in [
        ('recoverability_summary', 'episodes_total'),
        ('prob_recoverability_summary', 'n_challenge'),
        ('tightening_summary', 'n_obs'),
    ]:
        row = _first_row(research_artifacts, key)
        value = row.get(column)
        if value is not None:
            try:
                episode_counts.append(float(value))
            except (TypeError, ValueError):
                pass
    sample_support = min(_mean([min(count / 250.0, 1.0) for count in episode_counts]), 1.0) if episode_counts else 0.0
    coverage_component = _clamp01(max(measured_coverage, provenance.get('coverage_ratio', 0.0), sample_support))
    stability_component = _clamp01(0.82 - 0.015 * max_stale - 0.02 * len(warnings))

    holdings_coverage = snapshot.get('statement_intelligence', {}).get('holdings_coverage')
    if holdings_coverage is None:
        holdings_coverage = snapshot.get('statement_intelligence', {}).get('coverage')
    try:
        holdings_coverage = float(holdings_coverage)
    except (TypeError, ValueError):
        holdings_coverage = 0.5
    data_component = _clamp01(0.55 + 0.45 * holdings_coverage - 0.05 * len(provenance.get('missing_required', [])))

    evidence_authority = min(
        coverage_component,
        3.0 / max(sum(1.0 / max(component, 1e-6) for component in [calibration_component, coverage_component, stability_component]), 1e-6),
    )
    hygiene_authority = _clamp01(0.7 * data_component + 0.2 * (1.0 - min(max_stale / 30.0, 1.0)) + 0.1 * (0.0 if provenance.get('root_conflict') else 1.0))
    authority_policy_gate = min(evidence_authority, hygiene_authority)
    if authority_policy_gate >= 0.72:
        evidence_tier = 'production'
    elif authority_policy_gate >= 0.48:
        evidence_tier = 'beta'
    else:
        evidence_tier = 'alpha'
    return {
        'calibration_component': calibration_component,
        'coverage_component': coverage_component,
        'stability_component': stability_component,
        'data_component': data_component,
        'evidence_tier': evidence_tier,
        'model_version': MODEL_VERSION,
        'contract_version': CONTRACT_VERSION,
        'authority_score': authority_policy_gate,
        'authority': {
            'evidence_authority': evidence_authority,
            'hygiene_authority': hygiene_authority,
            'authority_policy_gate': authority_policy_gate,
            'evidence_tier': evidence_tier,
        },
        'provenance_summary': {
            'root_family': provenance.get('root_family'),
            'coverage_ratio': provenance.get('coverage_ratio'),
            'missing_required': provenance.get('missing_required', []),
            'root_conflict': provenance.get('root_conflict', False),
        },
        'research_sources': sorted(research_artifacts.keys()),
        'feature_missing_count': int(len([value for value in measured_state.values() if value is None])),
        'probability_package_metrics': [],
    }
