from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .research.regime_labels import build_daily_regime_frame


SCENARIO_CONFIG: dict[str, dict[str, object]] = {
    "soft_landing": {
        "historical_regime": "normal",
        "beta_anchor": 0.85,
        "hedge_weights": {"SHY": 0.30, "BIL": 0.30, "IEF": 0.15, "UUP": 0.10, "GLD": 0.10, "TLT": 0.05},
        "summary": "Growth holds up, fragility is contained, and broad participation supports risk.",
    },
    "reflation_qe": {
        "historical_regime": "qe",
        "beta_anchor": 0.75,
        "hedge_weights": {"GLD": 0.38, "IEF": 0.18, "SHY": 0.18, "BIL": 0.10, "UUP": 0.08, "TLT": 0.08},
        "summary": "Liquidity and macro easing dominate, favoring reflation assets and gold.",
    },
    "mania_rotation": {
        "historical_regime": "mania",
        "beta_anchor": 0.65,
        "hedge_weights": {"UUP": 0.28, "SHY": 0.24, "BIL": 0.20, "GLD": 0.12, "IEF": 0.10, "TLT": 0.06},
        "summary": "Leadership narrows, momentum concentrates, and upside remains tradable but fragile.",
    },
    "tightening_stress": {
        "historical_regime": "tightening",
        "beta_anchor": 0.40,
        "hedge_weights": {"UUP": 0.32, "SHY": 0.26, "IEF": 0.16, "BIL": 0.16, "GLD": 0.06, "TLT": 0.04},
        "summary": "Rates and credit tighten, pushing the system toward cash, dollar strength, and lower beta.",
    },
    "recession_crash": {
        "historical_regime": "crash",
        "beta_anchor": 0.20,
        "hedge_weights": {"SHY": 0.32, "IEF": 0.26, "GLD": 0.18, "BIL": 0.14, "UUP": 0.06, "TLT": 0.04},
        "summary": "Tail risk and contagion dominate, so capital preservation and defense matter most.",
    },
}


@dataclass(frozen=True)
class ScenarioSynthesis:
    prior: dict[str, float]
    likelihood: dict[str, float]
    posterior: dict[str, float]
    expected_beta: float
    preferred_hedge: str
    hedge_scores: dict[str, float]
    dominant_scenario: str
    secondary_scenario: str | None
    narrative: list[str]


def _bounded(value: float | int | None, low: float, high: float, neutral: float = 0.5) -> float:
    if value is None or pd.isna(value):
        return neutral
    if high <= low:
        return neutral
    clipped = float(np.clip((float(value) - low) / (high - low), 0.0, 1.0))
    return clipped


def _historical_prior(feature_history: pd.DataFrame) -> dict[str, float]:
    if feature_history.empty or "date" not in feature_history.columns:
        base = 1.0 / len(SCENARIO_CONFIG)
        return {scenario: base for scenario in SCENARIO_CONFIG}
    regime_frame = build_daily_regime_frame(pd.to_datetime(feature_history["date"]).unique())
    counts = regime_frame["regime_label"].value_counts().to_dict()
    weights: dict[str, float] = {}
    alpha = 1.0
    total = 0.0
    for scenario, config in SCENARIO_CONFIG.items():
        regime = str(config["historical_regime"])
        value = float(counts.get(regime, 0.0) + alpha)
        weights[scenario] = value
        total += value
    return {scenario: value / total for scenario, value in weights.items()}


def _scenario_scores(row: pd.Series) -> dict[str, float]:
    crash = _bounded(row.get("crash_prob"), 0.15, 0.85)
    tail = _bounded(row.get("tail_risk_score"), 0.10, 0.80)
    legitimacy = _bounded(row.get("legitimacy_risk"), 0.15, 0.80)
    breadth = _bounded(row.get("breadth_20d", row.get("pct_positive_20d")), 0.30, 0.75)
    dispersion = _bounded(row.get("dispersion_20d"), 0.008, 0.035)
    pair_corr = _bounded(row.get("avg_pair_corr_60d", row.get("mean_corr_20d")), 0.15, 0.80)
    momentum_concentration = _bounded(row.get("momentum_concentration_60d"), 0.20, 2.20)
    term_spread = _bounded(row.get("fred_term_spread"), -0.02, 0.02)
    hy_spread = _bounded(row.get("fred_hy_spread"), 0.02, 0.07)
    m2_yoy = _bounded(row.get("fred_m2_yoy"), -0.05, 0.15)
    balance_sheet = _bounded(row.get("fred_balance_sheet_yoy"), -0.12, 0.15)
    gold = _bounded(row.get("gold_return_3m"), -0.08, 0.15)
    dollar = _bounded(row.get("dollar_return_3m"), -0.08, 0.12)
    oil = _bounded(row.get("oil_return_3m"), -0.35, 0.35)
    spy_drawdown = _bounded(row.get("spy_drawdown_20d"), -0.20, 0.02)

    return {
        "soft_landing": (
            0.24 * (1.0 - crash)
            + 0.18 * breadth
            + 0.16 * term_spread
            + 0.14 * (1.0 - hy_spread)
            + 0.14 * (1.0 - pair_corr)
            + 0.14 * (1.0 - legitimacy)
        ),
        "reflation_qe": (
            0.18 * m2_yoy
            + 0.18 * balance_sheet
            + 0.17 * gold
            + 0.15 * (1.0 - dollar)
            + 0.16 * oil
            + 0.16 * breadth
        ),
        "mania_rotation": (
            0.21 * momentum_concentration
            + 0.18 * (1.0 - tail)
            + 0.16 * (1.0 - hy_spread)
            + 0.15 * (1.0 - pair_corr)
            + 0.15 * (1.0 - spy_drawdown)
            + 0.15 * (1.0 - dollar)
        ),
        "tightening_stress": (
            0.20 * (1.0 - term_spread)
            + 0.20 * hy_spread
            + 0.18 * dollar
            + 0.16 * legitimacy
            + 0.14 * tail
            + 0.12 * (1.0 - breadth)
        ),
        "recession_crash": (
            0.24 * crash
            + 0.22 * tail
            + 0.16 * hy_spread
            + 0.14 * pair_corr
            + 0.12 * (1.0 - oil)
            + 0.12 * (1.0 - breadth)
        ),
    }


def build_scenario_synthesis(feature_history: pd.DataFrame, latest_row: pd.Series) -> ScenarioSynthesis:
    prior = _historical_prior(feature_history)
    raw_scores = _scenario_scores(latest_row)
    likelihood = {scenario: float(np.exp(2.4 * (score - 0.5))) for scenario, score in raw_scores.items()}

    posterior_unnormalized = {scenario: prior[scenario] * likelihood[scenario] for scenario in SCENARIO_CONFIG}
    total = sum(posterior_unnormalized.values()) or 1.0
    posterior = {scenario: value / total for scenario, value in posterior_unnormalized.items()}

    hedge_scores: dict[str, float] = {}
    expected_beta = 0.0
    for scenario, probability in posterior.items():
        config = SCENARIO_CONFIG[scenario]
        expected_beta += probability * float(config["beta_anchor"])
        for hedge, weight in dict(config["hedge_weights"]).items():
            hedge_scores[hedge] = hedge_scores.get(hedge, 0.0) + probability * float(weight)

    ranked = sorted(posterior.items(), key=lambda item: item[1], reverse=True)
    dominant = ranked[0][0]
    secondary = ranked[1][0] if len(ranked) > 1 else None
    preferred_hedge = max(hedge_scores.items(), key=lambda item: item[1])[0] if hedge_scores else "BIL"

    narrative = [
        f"Posterior leans to {dominant.replace('_', ' ')} at {posterior[dominant]:.0%}.",
        SCENARIO_CONFIG[dominant]["summary"],
    ]
    if secondary is not None:
        narrative.append(f"Secondary scenario is {secondary.replace('_', ' ')} at {posterior[secondary]:.0%}.")

    return ScenarioSynthesis(
        prior={key: float(value) for key, value in prior.items()},
        likelihood={key: float(value) for key, value in likelihood.items()},
        posterior={key: float(value) for key, value in posterior.items()},
        expected_beta=float(np.clip(expected_beta, 0.15, 0.90)),
        preferred_hedge=preferred_hedge,
        hedge_scores={key: float(value) for key, value in hedge_scores.items()},
        dominant_scenario=dominant,
        secondary_scenario=secondary,
        narrative=narrative,
    )


def nearest_beta(beta_target: float, levels: tuple[float, ...]) -> float:
    return min(levels, key=lambda level: abs(level - float(beta_target)))
