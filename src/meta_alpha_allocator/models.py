from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class StateRow:
    date: str
    crash_prob: float
    tension_pct: float
    memory_p_fail: float
    recurrence: float
    crowding_pct: float
    regime: str
    legitimacy_risk: float


@dataclass(frozen=True)
class AssetFeatureRow:
    date: str
    ticker: str
    momentum_residual: float
    quality: float
    value: float
    beta: float
    idio_vol: float
    liquidity: float
    crowding: float
    sector: str
    universe_member: bool


@dataclass(frozen=True)
class SleeveSignal:
    date: str
    sleeve: str
    score: float
    confidence: float
    expected_edge: float
    veto_reason: str | None


@dataclass(frozen=True)
class AllocatorDecision:
    date: str
    risk_mode: str
    core_beta_weight: float
    defense_weight: float
    selection_weight: float
    turnover: float


@dataclass(frozen=True)
class PolicyStateRow:
    date: str
    regime: str
    crash_prob: float
    tail_risk_score: float
    legitimacy_risk: float
    crowding_pct: float
    term_spread: float
    credit_spreads: float
    liquidity_proxy: float
    cross_asset_corr: float
    effective_dimension: float
    opportunity_breadth: float
    hedge_relative_score: float


@dataclass(frozen=True)
class PolicyAction:
    action_id: str
    core_weight: float
    defense_weight: float
    hedge_ticker: str
    tilt_target: str | None = None
    tilt_size: float | None = None


@dataclass(frozen=True)
class PolicyDecision:
    date: str
    recommended_action: str
    confidence: float
    expected_utility: float
    alternative_action: str | None
    veto_reason: str | None
    explanation_fields: dict


@dataclass(frozen=True)
class DashboardSnapshot:
    generated_at: str
    as_of_date: str
    overview: dict
    performance: dict
    risk: dict
    forecast: dict
    hedges: dict
    sectors: dict
    international: dict
    chile_market: dict
    portfolio: dict
    protocol: dict
    screener: dict
    statement_intelligence: dict
    status: dict
    decision_packet: dict | None = None
    bls_state_v1: dict | None = None
    bls_state_v2: dict | None = None
