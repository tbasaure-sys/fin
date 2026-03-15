from __future__ import annotations

import json
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler

from ..config import PathConfig, ResearchSettings
from ..models import PolicyAction, PolicyDecision
from ..production.reporting import build_hedge_ranking, build_international_opportunity_map, build_sector_opportunity_map
from ..research.behavioral_edges import compute_behavioral_state
from ..research.decision_audit import DecisionAudit
from ..research.chrono_fragility import ALERT_BETA_CEILING, latest_chrono_alert
from ..scenario_weighting import SCENARIO_CONFIG, build_scenario_synthesis, nearest_beta
from ..utils import ensure_directory, performance_summary


BETA_LEVELS: tuple[float, ...] = (1.00, 0.85, 0.70, 0.55, 0.40, 0.25)
HEDGE_CANDIDATES: tuple[str, ...] = ("SHY", "IEF", "GLD", "UUP", "BIL", "TLT")
DEFAULT_POLICY_ACTIONS: tuple[PolicyAction, ...] = tuple(
    PolicyAction(
        action_id=f"beta_{int(round(beta * 100)):03d}",
        core_weight=beta,
        defense_weight=1.0 - beta,
        hedge_ticker="BIL",
    )
    for beta in BETA_LEVELS
)
POLICY_REGIME_TO_ACTION: dict[str, str] = {
    "DEFENSIVE": "beta_025",
    "NEUTRAL": "beta_055",
    "RISK_ON": "beta_100",
}
POLICY_ACTION_TO_REGIME: dict[str, str] = {
    "beta_025": "DEFENSIVE",
    "beta_040": "DEFENSIVE",
    "beta_055": "NEUTRAL",
    "beta_070": "NEUTRAL",
    "beta_085": "RISK_ON",
    "beta_100": "RISK_ON",
    "balanced_equity_cash": "NEUTRAL",
    "risk_on_equity": "RISK_ON",
    "defensive_cash": "DEFENSIVE",
}
SCENARIO_POSTERIOR_COLUMNS: tuple[str, ...] = tuple(
    f"scenario_{scenario}_posterior" for scenario in SCENARIO_CONFIG
)

FEATURE_COLUMNS: tuple[str, ...] = (
    "crash_prob",
    "tail_risk_score",
    "legitimacy_risk",
    "crowding_pct",
    "tension_pct",
    "memory_p_fail",
    "recurrence",
    "tail_loss_5d",
    "tail_loss_10d",
    "tail_loss_20d",
    "spy_mom_20d",
    "spy_vol_20d",
    "spy_drawdown_20d",
    "breadth_20d",
    "dispersion_20d",
    "mean_corr_20d",
    "d_eff_20d",
    "avg_pair_corr_60d",
    "pct_positive_20d",
    "advance_decline_ratio",
    "momentum_concentration_60d",
    "realized_cross_sectional_vol",
    "fred_term_spread",
    "fred_hy_spread",
    "fred_hy_ig_gap",
    "fred_m2_yoy",
    "fred_balance_sheet_yoy",
    "gold_return_3m",
    "dollar_return_3m",
    "oil_return_3m",
    "gold_commodity_ratio",
    "gold_dollar_both_rising",
    "qe_commodity_signal",
    "tightening_commodity_signal",
    "sector_top_score",
    "sector_spread",
    "international_top_score",
    "international_spread",
    "hedge_top_score",
    "hedge_second_score",
    "hedge_score_gap",
    "consensus_fragility_score",
    "belief_capacity_misalignment",
    "uup_score",
    "shy_score",
    "ief_score",
    "gld_score",
    "tlt_score",
    "bil_score",
    "scenario_expected_beta",
    *SCENARIO_POSTERIOR_COLUMNS,
)

# Audit-derived features injected by DecisionAudit.rolling_error_features().
# These are optional — the model gracefully ignores them if absent.
AUDIT_FEATURE_COLUMNS: tuple[str, ...] = (
    "audit_error_rate_21d",
    "audit_error_rate_63d",
    "audit_error_rate_252d",
    "audit_utility_gap_21d",
    "audit_utility_gap_63d",
    "audit_consecutive_errors",
    "audit_confidence_bias_63d",
)


@dataclass
class PolicyModelArtifacts:
    model: Pipeline | None
    encoder: LabelEncoder | None
    feature_columns: list[str]
    mean_utilities: dict[str, float]
    fallback_action: str
    used_fallback: bool
    training_samples: int = 0
    non_overlap_samples: int = 0


@dataclass
class PolicyArtifacts:
    feature_frame: pd.DataFrame
    labeled_frame: pd.DataFrame
    daily_returns: pd.DataFrame
    decisions_history: pd.DataFrame
    summary: dict


def _neutral_policy_row(date: pd.Timestamp) -> dict[str, float | str]:
    return {
        "date": pd.to_datetime(date),
        "regime": "NEUTRAL",
        "crash_prob": 0.5,
        "tail_risk_score": 0.5,
        "legitimacy_risk": 0.5,
        "crowding_pct": 0.5,
        "tension_pct": 0.5,
        "memory_p_fail": 0.5,
        "recurrence": 0.5,
        "tail_loss_5d": 0.5,
        "tail_loss_10d": 0.5,
        "tail_loss_20d": 0.5,
    }


def _state_at_date(state_panel: pd.DataFrame, date: pd.Timestamp) -> pd.Series:
    eligible = state_panel.loc[state_panel["date"] <= pd.to_datetime(date)]
    if eligible.empty:
        return pd.Series(_neutral_policy_row(date))
    row = eligible.iloc[-1].copy()
    row["date"] = pd.to_datetime(row["date"])
    return row


def _beta_action_id(beta: float) -> str:
    return f"beta_{int(round(beta * 100)):03d}"


def _beta_from_action_id(action_id: str) -> float:
    if action_id.startswith("beta_"):
        try:
            return float(action_id.split("_", 1)[1]) / 100.0
        except Exception:
            return 0.70
    mapping = {
        "risk_on_equity": 1.00,
        "balanced_equity_cash": 0.70,
        "defensive_cash": 0.00,
    }
    return mapping.get(action_id, 0.70)


def _regime_from_action_id(action_id: str) -> str:
    return POLICY_ACTION_TO_REGIME.get(action_id, "NEUTRAL")


def _action_id_from_regime(regime: str) -> str:
    return POLICY_REGIME_TO_ACTION.get(str(regime).upper(), POLICY_REGIME_TO_ACTION["NEUTRAL"])


def _select_non_overlapping_rows(frame: pd.DataFrame, horizon_days: int) -> pd.DataFrame:
    if frame.empty:
        return frame.copy()
    ordered = frame.sort_values("date").copy()
    min_gap = pd.offsets.BusinessDay(max(int(horizon_days), 1))
    selected_idx: list[int] = []
    next_allowed = pd.Timestamp.min
    for idx, row in ordered.iterrows():
        date = pd.to_datetime(row["date"])
        if date < next_allowed:
            continue
        selected_idx.append(idx)
        next_allowed = date + min_gap
    return ordered.loc[selected_idx].copy()


def _logistic_coef_for_label(clf: LogisticRegression, labels: list[str], label: str) -> np.ndarray:
    if len(labels) == 2:
        positive_label = labels[1]
        coef = clf.coef_[0]
        return coef if label == positive_label else -coef
    label_idx = labels.index(label)
    return clf.coef_[label_idx]


def _resolve_hedge_ticker(feature_row: pd.Series) -> str:
    primary = str(feature_row.get("best_hedge") or "").upper()
    secondary = str(feature_row.get("second_hedge") or "").upper()
    gap = float(feature_row.get("hedge_score_gap", 0.0) or 0.0)
    tail_risk = float(feature_row.get("tail_risk_score", 0.5) or 0.5)
    candidates = [ticker for ticker in [primary, secondary] if ticker in HEDGE_CANDIDATES]
    if candidates and gap >= 0.05:
        return candidates[0]
    if tail_risk >= 0.75:
        return "SHY" if "SHY" in HEDGE_CANDIDATES else "BIL"
    if candidates:
        return candidates[0]
    return "BIL"


def _policy_weight_map_from_components(beta_weight: float, hedge_ticker: str) -> pd.Series:
    beta = float(np.clip(beta_weight, 0.0, 1.0))
    hedge = hedge_ticker if hedge_ticker in HEDGE_CANDIDATES else "BIL"
    weights = pd.Series({"SPY": beta, hedge: 1.0 - beta}, dtype=float)
    weights = weights.groupby(level=0).sum()
    if weights.sum() <= 0:
        return pd.Series({"BIL": 1.0}, dtype=float)
    return weights / weights.sum()


def _policy_weight_map(action: PolicyAction) -> pd.Series:
    return _policy_weight_map_from_components(action.core_weight, action.hedge_ticker)


def _max_drawdown_from_returns(returns: pd.Series) -> float:
    wealth = (1.0 + returns.fillna(0.0)).cumprod()
    if wealth.empty:
        return 0.0
    return float((wealth / wealth.cummax() - 1.0).min())


def _downside_deviation(returns: pd.Series) -> float:
    downside = returns[returns < 0]
    if downside.empty:
        return 0.0
    return float(np.sqrt((downside**2).mean()))


def _action_utility(forward_returns: pd.Series) -> float:
    if forward_returns.empty:
        return np.nan
    path = forward_returns.fillna(0.0)
    cumulative5 = float((1.0 + path.head(5)).prod() - 1.0)
    cumulative10 = float((1.0 + path.head(10)).prod() - 1.0)
    cumulative20 = float((1.0 + path.head(20)).prod() - 1.0)
    max_dd = abs(_max_drawdown_from_returns(path.head(20)))
    downside = _downside_deviation(path.head(20))
    return (
        0.20 * cumulative5
        + 0.30 * cumulative10
        + 0.50 * cumulative20
        - 1.10 * max_dd
        - 0.65 * downside
    )


def _policy_baselines(full_returns: pd.DataFrame) -> pd.DataFrame:
    spy = full_returns.get("SPY", pd.Series(0.0, index=full_returns.index)).fillna(0.0)
    ief = full_returns.get("IEF", pd.Series(0.0, index=full_returns.index)).fillna(0.0)
    bil = full_returns.get("BIL", pd.Series(0.0, index=full_returns.index)).fillna(0.0)
    gld = full_returns.get("GLD", pd.Series(0.0, index=full_returns.index)).fillna(0.0)

    static_60_40 = (0.60 * spy + 0.40 * ief).rename("static_60_40")

    rolling_vol = spy.rolling(20).std() * np.sqrt(252.0)
    target_weight = (0.10 / rolling_vol.replace(0.0, np.nan)).clip(lower=0.0, upper=1.0).fillna(0.5)
    vol_target = (target_weight * spy + (1.0 - target_weight) * bil).rename("vol_target")

    trend_signal = (spy.add(1.0).cumprod() > spy.add(1.0).cumprod().rolling(200).mean()).fillna(False).astype(float)
    trend_following = (trend_signal * spy + (1.0 - trend_signal) * bil).rename("trend_following")
    defensive_mix = (0.50 * bil + 0.50 * gld).rename("defensive_mix")
    return pd.concat([static_60_40, vol_target, trend_following, defensive_mix], axis=1)


def _policy_rebalance_dates(index: pd.DatetimeIndex, weekday: int) -> pd.DatetimeIndex:
    dates = pd.DatetimeIndex(index).sort_values().unique()
    selected = [date for date in dates if date.weekday() == weekday]
    if dates[-1] not in selected:
        selected.append(dates[-1])
    return pd.DatetimeIndex(sorted(set(selected)))


def build_policy_state_frame(
    rebalance_dates: pd.DatetimeIndex,
    state_panel: pd.DataFrame,
    proxy_prices: pd.DataFrame,
    settings: ResearchSettings,
    latest_scored_by_date: dict[pd.Timestamp, pd.DataFrame] | None = None,
) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    empty_scored = pd.DataFrame(columns=["date", "ticker", "sector", "selection_score", "quality", "residual_momentum", "crowding"])
    for date in rebalance_dates:
        state_row = _state_at_date(state_panel, date)
        scored = empty_scored
        if latest_scored_by_date is not None and pd.to_datetime(date) in latest_scored_by_date:
            scored = latest_scored_by_date[pd.to_datetime(date)]

        sector_map = build_sector_opportunity_map(scored, proxy_prices, date, state_row, settings)
        international_map = build_international_opportunity_map(proxy_prices, date, state_row, settings)
        hedge_ranking = build_hedge_ranking(proxy_prices, date, state_row, settings)

        sector_top = float(sector_map["opportunity_score"].iloc[0]) if not sector_map.empty else 0.5
        sector_second = float(sector_map["opportunity_score"].iloc[1]) if len(sector_map) > 1 else sector_top
        intl_top = float(international_map["opportunity_score"].iloc[0]) if not international_map.empty else 0.5
        intl_second = float(international_map["opportunity_score"].iloc[1]) if len(international_map) > 1 else intl_top
        hedge_top = float(hedge_ranking["hedge_score"].iloc[0]) if not hedge_ranking.empty else 0.5
        hedge_second = float(hedge_ranking["hedge_score"].iloc[1]) if len(hedge_ranking) > 1 else hedge_top
        hedge_scores = {str(row["ticker"]).lower(): float(row["hedge_score"]) for _, row in hedge_ranking.iterrows()} if not hedge_ranking.empty else {}

        row = {
            "date": pd.to_datetime(date),
            "regime": state_row.get("regime", "NEUTRAL"),
            "crash_prob": float(state_row.get("crash_prob", 0.5)),
            "tail_risk_score": float(state_row.get("tail_risk_score", 0.5)),
            "legitimacy_risk": float(state_row.get("legitimacy_risk", 0.5)),
            "crowding_pct": float(state_row.get("crowding_pct", 0.5)),
            "tension_pct": float(state_row.get("tension_pct", 0.5)),
            "memory_p_fail": float(state_row.get("memory_p_fail", 0.5)),
            "recurrence": float(state_row.get("recurrence", 0.5)),
            "tail_loss_5d": float(state_row.get("tail_loss_5d", 0.5)),
            "tail_loss_10d": float(state_row.get("tail_loss_10d", 0.5)),
            "tail_loss_20d": float(state_row.get("tail_loss_20d", 0.5)),
            "spy_mom_20d": float(state_row.get("spy_mom_20d", np.nan)),
            "spy_vol_20d": float(state_row.get("spy_vol_20d", np.nan)),
            "spy_drawdown_20d": float(state_row.get("spy_drawdown_20d", np.nan)),
            "breadth_20d": float(state_row.get("breadth_20d", np.nan)),
            "dispersion_20d": float(state_row.get("dispersion_20d", np.nan)),
            "mean_corr_20d": float(state_row.get("mean_corr_20d", np.nan)),
            "d_eff_20d": float(state_row.get("d_eff_20d", np.nan)),
            "avg_pair_corr_60d": float(state_row.get("avg_pair_corr_60d", np.nan)),
            "pct_positive_20d": float(state_row.get("pct_positive_20d", np.nan)),
            "advance_decline_ratio": float(state_row.get("advance_decline_ratio", np.nan)),
            "momentum_concentration_60d": float(state_row.get("momentum_concentration_60d", np.nan)),
            "realized_cross_sectional_vol": float(state_row.get("realized_cross_sectional_vol", np.nan)),
            "fred_term_spread": float(state_row.get("fred_term_spread", np.nan)),
            "fred_hy_spread": float(state_row.get("fred_hy_spread", np.nan)),
            "fred_hy_ig_gap": float(state_row.get("fred_hy_ig_gap", np.nan)),
            "fred_m2_yoy": float(state_row.get("fred_m2_yoy", np.nan)),
            "fred_balance_sheet_yoy": float(state_row.get("fred_balance_sheet_yoy", np.nan)),
            "gold_return_3m": float(state_row.get("gold_return_3m", np.nan)),
            "dollar_return_3m": float(state_row.get("dollar_return_3m", np.nan)),
            "oil_return_3m": float(state_row.get("oil_return_3m", np.nan)),
            "gold_commodity_ratio": float(state_row.get("gold_commodity_ratio", np.nan)),
            "gold_dollar_both_rising": float(state_row.get("gold_dollar_both_rising", np.nan)),
            "qe_commodity_signal": float(state_row.get("qe_commodity_signal", np.nan)),
            "tightening_commodity_signal": float(state_row.get("tightening_commodity_signal", np.nan)),
            "sector_top_score": sector_top,
            "sector_spread": sector_top - sector_second,
            "international_top_score": intl_top,
            "international_spread": intl_top - intl_second,
            "hedge_top_score": hedge_top,
            "hedge_second_score": hedge_second,
            "hedge_score_gap": hedge_top - hedge_second,
            "uup_score": hedge_scores.get("uup", np.nan),
            "shy_score": hedge_scores.get("shy", np.nan),
            "ief_score": hedge_scores.get("ief", np.nan),
            "gld_score": hedge_scores.get("gld", np.nan),
            "tlt_score": hedge_scores.get("tlt", np.nan),
            "bil_score": hedge_scores.get("bil", np.nan),
            "top_sector": str(sector_map.iloc[0]["sector"]) if not sector_map.empty else None,
            "top_market": str(international_map.iloc[0]["market"]) if not international_map.empty else None,
            "best_hedge": str(hedge_ranking.iloc[0]["ticker"]) if not hedge_ranking.empty else None,
            "second_hedge": str(hedge_ranking.iloc[1]["ticker"]) if len(hedge_ranking) > 1 else None,
        }
        row.update(compute_behavioral_state(row))
        rows.append(row)
    frame = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
    if frame.empty:
        return frame

    scenario_expected_beta: list[float] = []
    scenario_dominant: list[str | None] = []
    scenario_secondary: list[str | None] = []
    scenario_posteriors: dict[str, list[float]] = {column: [] for column in SCENARIO_POSTERIOR_COLUMNS}
    for idx, row in frame.iterrows():
        history = frame.iloc[:idx].copy()
        synthesis = build_scenario_synthesis(history, row)
        scenario_expected_beta.append(float(synthesis.expected_beta))
        scenario_dominant.append(synthesis.dominant_scenario)
        scenario_secondary.append(synthesis.secondary_scenario)
        for scenario, probability in synthesis.posterior.items():
            scenario_posteriors[f"scenario_{scenario}_posterior"].append(float(probability))

    frame["scenario_expected_beta"] = scenario_expected_beta
    frame["dominant_scenario"] = scenario_dominant
    frame["secondary_scenario"] = scenario_secondary
    for column, values in scenario_posteriors.items():
        frame[column] = values
    return frame


def label_policy_actions(
    feature_frame: pd.DataFrame,
    proxy_returns: pd.DataFrame,
    actions: tuple[PolicyAction, ...] = DEFAULT_POLICY_ACTIONS,
    transaction_cost_bps: float = 10.0,
    min_forward_spread: float = 0.02,
    min_utility_gap: float = 0.005,
) -> pd.DataFrame:
    labeled = feature_frame.copy()
    utility_columns: list[str] = []
    for action in actions:
        action_id = action.action_id
        utilities: list[float] = []
        forward_20s: list[float] = []
        for _, row in labeled.iterrows():
            date = row["date"]
            hold_index = proxy_returns.loc[proxy_returns.index > pd.to_datetime(date)].head(20).index
            if len(hold_index) < 20:
                utilities.append(np.nan)
                forward_20s.append(np.nan)
                continue
            hedge_ticker = _resolve_hedge_ticker(row)
            beta = _beta_from_action_id(action_id)
            weights = _policy_weight_map_from_components(beta, hedge_ticker)
            path = proxy_returns.reindex(columns=weights.index, fill_value=0.0).loc[hold_index].mul(weights, axis=1).sum(axis=1)
            utility = _action_utility(path)
            utility -= transaction_cost_bps / 10000.0
            utilities.append(float(utility))
            forward_20s.append(float((1.0 + path).prod() - 1.0))
        labeled[f"utility__{action_id}"] = utilities
        labeled[f"fwd20__{action_id}"] = forward_20s
        utility_columns.append(f"utility__{action_id}")

    utility_frame = labeled[utility_columns]
    all_missing = utility_frame.isna().all(axis=1)
    labeled["best_action"] = utility_frame.fillna(-np.inf).idxmax(axis=1).str.replace("utility__", "", regex=False)
    labeled.loc[all_missing, "best_action"] = np.nan
    labeled["best_action_utility"] = utility_frame.max(axis=1)
    labeled.loc[all_missing, "best_action_utility"] = np.nan

    regime_rows: list[dict[str, object]] = []
    for idx, row in labeled.iterrows():
        if bool(all_missing.loc[idx]):
            regime_rows.append(
                {
                    "best_regime": np.nan,
                    "best_regime_action": np.nan,
                    "best_regime_utility": np.nan,
                    "best_regime_forward_20": np.nan,
                    "second_best_regime": np.nan,
                    "second_best_regime_utility": np.nan,
                    "second_best_regime_forward_20": np.nan,
                    "regime_utility_gap": np.nan,
                    "regime_forward_gap": np.nan,
                    "label_is_actionable": False,
                    "training_label": np.nan,
                }
            )
            continue

        regime_stats: list[dict[str, object]] = []
        for regime in ("DEFENSIVE", "NEUTRAL", "RISK_ON"):
            regime_actions = [action.action_id for action in actions if _regime_from_action_id(action.action_id) == regime]
            if not regime_actions:
                continue
            regime_utility_series = pd.Series(
                {action_id: row.get(f"utility__{action_id}", np.nan) for action_id in regime_actions},
                dtype=float,
            ).dropna()
            if regime_utility_series.empty:
                continue
            best_regime_action = str(regime_utility_series.idxmax())
            regime_stats.append(
                {
                    "regime": regime,
                    "action": best_regime_action,
                    "utility": float(regime_utility_series.loc[best_regime_action]),
                    "forward_20": float(row.get(f"fwd20__{best_regime_action}", np.nan)),
                }
            )

        if not regime_stats:
            regime_rows.append(
                {
                    "best_regime": np.nan,
                    "best_regime_action": np.nan,
                    "best_regime_utility": np.nan,
                    "best_regime_forward_20": np.nan,
                    "second_best_regime": np.nan,
                    "second_best_regime_utility": np.nan,
                    "second_best_regime_forward_20": np.nan,
                    "regime_utility_gap": np.nan,
                    "regime_forward_gap": np.nan,
                    "label_is_actionable": False,
                    "training_label": np.nan,
                }
            )
            continue

        ranked = sorted(regime_stats, key=lambda item: item["utility"], reverse=True)
        best = ranked[0]
        second = ranked[1] if len(ranked) > 1 else None
        utility_gap = float(best["utility"] - second["utility"]) if second is not None else np.nan
        forward_gap = float(best["forward_20"] - second["forward_20"]) if second is not None else np.nan
        actionable = bool(
            pd.notna(utility_gap)
            and pd.notna(forward_gap)
            and utility_gap >= float(min_utility_gap)
            and forward_gap >= float(min_forward_spread)
        )
        regime_rows.append(
            {
                "best_regime": str(best["regime"]),
                "best_regime_action": str(best["action"]),
                "best_regime_utility": float(best["utility"]),
                "best_regime_forward_20": float(best["forward_20"]),
                "second_best_regime": str(second["regime"]) if second is not None else np.nan,
                "second_best_regime_utility": float(second["utility"]) if second is not None else np.nan,
                "second_best_regime_forward_20": float(second["forward_20"]) if second is not None else np.nan,
                "regime_utility_gap": utility_gap,
                "regime_forward_gap": forward_gap,
                "label_is_actionable": actionable,
                "training_label": str(best["regime"]) if actionable else np.nan,
            }
        )

    regime_frame = pd.DataFrame(regime_rows, index=labeled.index)
    labeled = pd.concat([labeled, regime_frame], axis=1)
    return labeled


def _fit_policy_model(train_frame: pd.DataFrame, feature_columns: list[str], settings: ResearchSettings) -> PolicyModelArtifacts:
    valid = train_frame.loc[train_frame["label_is_actionable"].fillna(False)].dropna(subset=["training_label", "best_regime_utility"]).copy()
    fallback_action = _action_id_from_regime("NEUTRAL")
    usable_features = [column for column in feature_columns if column in valid.columns and not valid[column].isna().all()]
    non_overlap = _select_non_overlapping_rows(valid, settings.forward_horizon_days)
    if len(non_overlap) < settings.policy_min_training_samples or non_overlap["training_label"].nunique() < 2 or not usable_features:
        mean_utilities = {"NEUTRAL": float(valid["best_regime_utility"].mean()) if not valid.empty else 0.0}
        return PolicyModelArtifacts(
            model=None,
            encoder=None,
            feature_columns=usable_features or feature_columns,
            mean_utilities=mean_utilities,
            fallback_action=fallback_action,
            used_fallback=True,
            training_samples=len(valid),
            non_overlap_samples=len(non_overlap),
        )

    encoder = LabelEncoder()
    y = encoder.fit_transform(non_overlap["training_label"])
    x = non_overlap[usable_features]
    model = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=2000, class_weight="balanced")),
        ]
    )
    model.fit(x, y)
    mean_utilities = non_overlap.groupby("training_label")["best_regime_utility"].mean().to_dict()
    return PolicyModelArtifacts(
        model=model,
        encoder=encoder,
        feature_columns=usable_features,
        mean_utilities={str(key): float(value) for key, value in mean_utilities.items()},
        fallback_action=fallback_action,
        used_fallback=False,
        training_samples=len(valid),
        non_overlap_samples=len(non_overlap),
    )


def _explain_policy_decision(artifacts: PolicyModelArtifacts, feature_row: pd.Series, chosen_action: str, alternative_action: str | None) -> dict:
    if artifacts.model is None or artifacts.encoder is None:
        chosen_beta = _beta_from_action_id(chosen_action)
        return {
            "why_this_action": [f"Falling back to neutral overlay because model confidence or sample depth is insufficient. Beta target defaults to {chosen_beta:.0%}."],
            "conditions_that_flip_decision": [],
            "top_feature_contributions": {},
        }

    imputed = artifacts.model.named_steps["imputer"].transform(feature_row[artifacts.feature_columns].to_frame().T)
    scaled = artifacts.model.named_steps["scaler"].transform(imputed)[0]
    clf = artifacts.model.named_steps["clf"]
    labels = list(artifacts.encoder.classes_)
    chosen_regime = _regime_from_action_id(chosen_action)
    alternative_regime = _regime_from_action_id(alternative_action) if alternative_action is not None else None
    if chosen_regime not in labels:
        chosen_beta = _beta_from_action_id(chosen_action)
        return {
            "why_this_action": [f"Falling back to neutral overlay because the selected beta bucket was outside the current trained label set. Beta target defaults to {chosen_beta:.0%}."],
            "conditions_that_flip_decision": [],
            "top_feature_contributions": {},
        }
    chosen_coef = _logistic_coef_for_label(clf, labels, chosen_regime)
    contributions = pd.Series(chosen_coef * scaled, index=artifacts.feature_columns).sort_values(ascending=False)
    top_positive = contributions.head(3)
    chosen_beta = _beta_from_action_id(chosen_action)
    regime_text = chosen_regime.replace("_", " ").title()
    reasons = [f"{name} supported the {regime_text} regime and beta target {chosen_beta:.0%}" for name in top_positive.index]

    flip_conditions: list[str] = []
    if alternative_regime is not None and alternative_regime in labels:
        alt_coef = _logistic_coef_for_label(clf, labels, alternative_regime)
        diff = pd.Series((alt_coef - chosen_coef) * scaled, index=artifacts.feature_columns).sort_values(ascending=False)
        for feature in diff.head(3).index:
            direction = "higher" if diff.loc[feature] > 0 else "lower"
            flip_conditions.append(f"{feature} moving {direction} would favor beta target {_beta_from_action_id(alternative_action):.0%}")

    return {
        "why_this_action": reasons,
        "conditions_that_flip_decision": flip_conditions,
        "top_feature_contributions": {str(k): float(v) for k, v in top_positive.items()},
    }


def predict_policy_decision(
    artifacts: PolicyModelArtifacts,
    feature_row: pd.Series,
    settings: ResearchSettings,
) -> PolicyDecision:
    fallback_action = artifacts.fallback_action
    if artifacts.model is None or artifacts.encoder is None:
        explanation = _explain_policy_decision(artifacts, feature_row, fallback_action, None)
        return PolicyDecision(
            date=str(pd.to_datetime(feature_row["date"]).date()),
            recommended_action=fallback_action,
            confidence=0.0,
            expected_utility=float(artifacts.mean_utilities.get(fallback_action, 0.0)),
            alternative_action=None,
            veto_reason="insufficient_training_history",
            explanation_fields=explanation,
        )

    x = feature_row[artifacts.feature_columns].to_frame().T
    probs = artifacts.model.predict_proba(x)[0]
    regime_labels = list(artifacts.encoder.classes_)
    ranked = pd.Series(probs, index=regime_labels).sort_values(ascending=False)
    recommended_regime = str(ranked.index[0])
    recommended_action = _action_id_from_regime(recommended_regime)
    confidence = float(ranked.iloc[0])
    alternative_regime = str(ranked.index[1]) if len(ranked) > 1 else None
    alternative_action = _action_id_from_regime(alternative_regime) if alternative_regime is not None else None
    veto_reason = None
    if confidence < settings.policy_confidence_threshold:
        recommended_action = fallback_action
        veto_reason = "low_confidence_policy"
    expected_utility = float(sum(prob * artifacts.mean_utilities.get(regime, 0.0) for regime, prob in ranked.items()))
    explanation = _explain_policy_decision(artifacts, feature_row, recommended_action, alternative_action)
    explanation["predicted_regime"] = recommended_regime
    if alternative_regime is not None:
        explanation["alternative_regime"] = alternative_regime
    return PolicyDecision(
        date=str(pd.to_datetime(feature_row["date"]).date()),
        recommended_action=recommended_action,
        confidence=confidence,
        expected_utility=expected_utility,
        alternative_action=alternative_action,
        veto_reason=veto_reason,
        explanation_fields=explanation,
    )


def _confidence_bucket(confidence: float, threshold: float) -> str:
    return "high" if float(confidence) >= float(threshold) else "low"


def _learn_blend_weight(
    history: pd.DataFrame,
    *,
    dominant_scenario: str | None,
    confidence: float,
    confidence_threshold: float,
) -> tuple[float, str]:
    candidate_weights = np.array([0.20, 0.35, 0.50, 0.65, 0.80], dtype=float)
    if history.empty:
        return 0.50, "no_history"

    bucket = _confidence_bucket(confidence, confidence_threshold)
    working = history.copy()
    if "confidence_bucket" not in working.columns:
        if "confidence" in working.columns:
            working["confidence_bucket"] = working["confidence"].apply(lambda value: _confidence_bucket(float(value), confidence_threshold))
        else:
            working["confidence_bucket"] = bucket
    else:
        working["confidence_bucket"] = working["confidence_bucket"].fillna(bucket)
    if "dominant_scenario" not in working.columns:
        working["dominant_scenario"] = "unknown"
    if dominant_scenario is None:
        dominant_scenario = "unknown"

    def _select(label: str, selector: pd.Series) -> tuple[pd.DataFrame, str] | None:
        subset = working.loc[selector].copy()
        if len(subset) >= 8:
            return subset, label
        return None

    candidates = [
        _select(
            "scenario_and_confidence",
            (working["dominant_scenario"] == dominant_scenario) & (working["confidence_bucket"] == bucket),
        ),
        _select("scenario_only", working["dominant_scenario"] == dominant_scenario),
        _select("confidence_only", working["confidence_bucket"] == bucket),
        _select("global", pd.Series(True, index=working.index)),
    ]
    chosen = next((item for item in candidates if item is not None), None)
    if chosen is None:
        return 0.50, "no_history"

    subset, source = chosen
    mean_utilities: dict[float, float] = {}
    for weight in candidate_weights:
        blended = [
            nearest_beta(
                float(
                    np.clip(
                        weight * float(row.get("policy_beta_target", row.get("beta_target", 0.55)))
                        + (1.0 - weight) * float(row.get("scenario_expected_beta", row.get("beta_target", 0.55))),
                        min(BETA_LEVELS),
                        max(BETA_LEVELS),
                    )
                ),
                BETA_LEVELS,
            )
            for _, row in subset.iterrows()
        ]
        utility_values = [
            float(row.get(f"utility__{_beta_action_id(beta)}", np.nan))
            for (_, row), beta in zip(subset.iterrows(), blended)
        ]
        valid = pd.Series(utility_values, dtype=float).dropna()
        if not valid.empty:
            mean_utilities[float(weight)] = float(valid.mean())

    if not mean_utilities:
        return 0.50, source
    best_weight = max(mean_utilities.items(), key=lambda item: item[1])[0]
    return best_weight, source


def _blend_with_scenarios(
    decision: PolicyDecision,
    feature_history: pd.DataFrame,
    feature_row: pd.Series,
    *,
    base_hedge: str,
    blend_history: pd.DataFrame | None = None,
    confidence_threshold: float = 0.55,
) -> dict:
    synthesis = build_scenario_synthesis(feature_history, feature_row)
    raw_beta = _beta_from_action_id(decision.recommended_action)
    learned_policy_weight, blend_source = _learn_blend_weight(
        blend_history if blend_history is not None else pd.DataFrame(),
        dominant_scenario=synthesis.dominant_scenario,
        confidence=decision.confidence,
        confidence_threshold=confidence_threshold,
    )
    if decision.veto_reason is not None:
        learned_policy_weight = min(learned_policy_weight, 0.40)
    blended_beta = float(
        np.clip(
            learned_policy_weight * raw_beta + (1.0 - learned_policy_weight) * synthesis.expected_beta,
            min(BETA_LEVELS),
            max(BETA_LEVELS),
        )
    )
    blended_beta = nearest_beta(blended_beta, BETA_LEVELS)
    blended_action = _beta_action_id(blended_beta)
    selected_hedge = base_hedge
    if decision.veto_reason is not None or decision.confidence < 0.50:
        selected_hedge = synthesis.preferred_hedge

    explanation_fields = dict(decision.explanation_fields)
    if blended_action != decision.recommended_action:
        explanation_fields["why_this_action"] = [
            f"Learned blend used {learned_policy_weight:.0%} policy / {1.0 - learned_policy_weight:.0%} scenario from {blend_source}, moving beta from {raw_beta:.0%} to {blended_beta:.0%} under {synthesis.dominant_scenario.replace('_', ' ')}."
        ] + list(explanation_fields.get("why_this_action", []))
    else:
        explanation_fields["why_this_action"] = [
            f"Learned blend used {learned_policy_weight:.0%} policy / {1.0 - learned_policy_weight:.0%} scenario from {blend_source}, confirming beta near {blended_beta:.0%} with {synthesis.dominant_scenario.replace('_', ' ')} dominant."
        ] + list(explanation_fields.get("why_this_action", []))
    explanation_fields["scenario_narrative"] = synthesis.narrative
    explanation_fields["scenario_top_posteriors"] = synthesis.posterior

    return {
        "recommended_action": blended_action,
        "beta_target": blended_beta,
        "selected_hedge": selected_hedge,
        "policy_recommended_action": decision.recommended_action,
        "policy_beta_target": raw_beta,
        "scenario_expected_beta": synthesis.expected_beta,
        "scenario_preferred_hedge": synthesis.preferred_hedge,
        "scenario_dominant": synthesis.dominant_scenario,
        "scenario_secondary": synthesis.secondary_scenario,
        "learned_policy_weight": learned_policy_weight,
        "blend_source": blend_source,
        "scenario_synthesis": {
            "prior": synthesis.prior,
            "likelihood": synthesis.likelihood,
            "posterior": synthesis.posterior,
            "dominant_scenario": synthesis.dominant_scenario,
            "secondary_scenario": synthesis.secondary_scenario,
            "expected_beta": synthesis.expected_beta,
            "preferred_hedge": synthesis.preferred_hedge,
            "hedge_scores": synthesis.hedge_scores,
            "narrative": synthesis.narrative,
            "policy_weight": learned_policy_weight,
            "blend_source": blend_source,
        },
        "explanation_fields": explanation_fields,
    }


def _inject_audit_features(
    frame: pd.DataFrame,
    decisions_csv: pd.DataFrame | None,
    state_csv: pd.DataFrame | None,
    as_of_date: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Inject rolling audit error features into a policy feature frame.

    Uses only data available *up to* as_of_date to avoid look-ahead bias.
    If no audit data is available, returns the frame unchanged.
    """
    if decisions_csv is None or decisions_csv.empty:
        return frame
    import tempfile
    import pathlib

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = pathlib.Path(tmpdir)
        decisions_csv.to_csv(tmp / "policy_decisions_history.csv", index=False)
        if state_csv is not None:
            state_csv.to_csv(tmp / "policy_state_frame.csv", index=False)

        class _FakePaths:
            output_root = tmp.parent

        # Build audit from partial history up to as_of_date.
        try:
            audit = DecisionAudit(
                decisions_path=tmp / "policy_decisions_history.csv",
                state_path=tmp / "policy_state_frame.csv" if state_csv is not None else tmp / "_missing.csv",
                output_dir=tmp / "audit",
            )
            err_feats = audit.rolling_error_features(as_of_date)
        except Exception:
            return frame

    if not err_feats:
        return frame

    frame = frame.copy()
    for feat, val in err_feats.items():
        frame[feat] = val
    return frame


def run_policy_backtest(
    paths: PathConfig,
    settings: ResearchSettings,
    feature_frame: pd.DataFrame,
    proxy_returns: pd.DataFrame,
    heuristic_overlay: pd.Series,
) -> PolicyArtifacts:
    ensure_directory(settings.policy_output_dir)
    labeled = label_policy_actions(
        feature_frame,
        proxy_returns,
        transaction_cost_bps=settings.transaction_cost_bps,
        min_forward_spread=settings.policy_label_min_forward_spread,
        min_utility_gap=settings.policy_label_min_utility_gap,
    )
    rebalance_dates = pd.DatetimeIndex(pd.to_datetime(labeled["date"])).sort_values().unique()

    previous_weights = pd.Series(dtype=float)
    active_model: PolicyModelArtifacts | None = None
    last_retrain_key: tuple[int, int] | pd.Timestamp | None = None
    policy_returns: list[tuple[pd.Timestamp, float]] = []
    decisions: list[dict[str, object]] = []
    rebalance_decisions: list[dict[str, object]] = []
    blend_learning_history: list[dict[str, object]] = []

    # Accumulate decisions incrementally so we can build rolling audit features
    # with no look-ahead bias at each rebalance date.
    incremental_decisions: list[dict] = []
    state_csv = labeled  # full labeled frame has utility cols for audit

    all_features = list(FEATURE_COLUMNS) + list(AUDIT_FEATURE_COLUMNS)

    for idx, rebalance_date in enumerate(rebalance_dates[:-1]):
        next_date = rebalance_dates[idx + 1]
        train_end = rebalance_date - pd.Timedelta(days=settings.embargo_days)
        train_frame = labeled.loc[labeled["date"] <= train_end].copy()

        # Build audit features from decisions accumulated up to train_end.
        if incremental_decisions:
            inc_df = pd.DataFrame(incremental_decisions)
            inc_df["date"] = pd.to_datetime(inc_df["date"])
            train_frame = _inject_audit_features(train_frame, inc_df, state_csv, as_of_date=train_end)

        retrain_key: tuple[int, int] | pd.Timestamp = (rebalance_date.year, rebalance_date.month) if settings.policy_retrain_frequency == "monthly" else rebalance_date
        if active_model is None or retrain_key != last_retrain_key:
            active_model = _fit_policy_model(train_frame, all_features, settings)
            last_retrain_key = retrain_key

        # Inject audit features into the current feature row too.
        feature_row = labeled.loc[labeled["date"] == rebalance_date].iloc[0].copy()
        if incremental_decisions:
            inc_df = pd.DataFrame(incremental_decisions)
            inc_df["date"] = pd.to_datetime(inc_df["date"])
            err_feats = {}
            try:
                import tempfile, pathlib as _pl
                with tempfile.TemporaryDirectory() as tmpdir:
                    tmp = _pl.Path(tmpdir)
                    inc_df.to_csv(tmp / "policy_decisions_history.csv", index=False)
                    state_csv.to_csv(tmp / "policy_state_frame.csv", index=False)
                    audit = DecisionAudit(
                        decisions_path=tmp / "policy_decisions_history.csv",
                        state_path=tmp / "policy_state_frame.csv",
                        output_dir=tmp / "audit",
                    )
                    err_feats = audit.rolling_error_features(rebalance_date)
            except Exception:
                pass
            for feat, val in err_feats.items():
                feature_row[feat] = val

        decision = predict_policy_decision(active_model, feature_row, settings)
        scenario_payload = _blend_with_scenarios(
            decision,
            train_frame,
            feature_row,
            base_hedge=_resolve_hedge_ticker(feature_row),
            blend_history=pd.DataFrame(blend_learning_history),
            confidence_threshold=settings.policy_confidence_threshold,
        )
        beta_target = float(scenario_payload["beta_target"])
        # ── Chrono alert hard ceiling ─────────────────────────────────────────
        # Apply as hard cap AFTER scenario blending so the alert engine always
        # wins. Safe to skip if paths is None (no cached panel available).
        _chrono_ceiling = 1.0
        if paths is not None:
            try:
                _chrono_alert = latest_chrono_alert(paths)
                if _chrono_alert.get("available"):
                    _chrono_ceiling = float(_chrono_alert["beta_ceiling"])
            except Exception:
                pass
        if beta_target > _chrono_ceiling:
            beta_target = nearest_beta(_chrono_ceiling, BETA_LEVELS)
            scenario_payload = {**scenario_payload, "beta_target": beta_target,
                                "recommended_action": _beta_action_id(beta_target),
                                "chrono_ceiling_applied": True,
                                "chrono_ceiling": _chrono_ceiling}
        hedge_ticker = str(scenario_payload["selected_hedge"])
        weights = _policy_weight_map_from_components(beta_target, hedge_ticker)
        turnover = float((weights.reindex(previous_weights.index.union(weights.index), fill_value=0.0) - previous_weights.reindex(previous_weights.index.union(weights.index), fill_value=0.0)).abs().sum())

        # Capture audit features at this rebalance point for the incremental log.
        audit_feats_snapshot = {k: float(feature_row.get(k, np.nan)) for k in AUDIT_FEATURE_COLUMNS if k in feature_row.index}

        hold_dates = proxy_returns.loc[(proxy_returns.index > rebalance_date) & (proxy_returns.index <= next_date)].index
        for hold_idx, hold_date in enumerate(hold_dates):
            daily_ret = float(proxy_returns.reindex(columns=weights.index, fill_value=0.0).loc[hold_date].mul(weights).sum())
            if hold_idx == 0:
                daily_ret -= turnover * (settings.transaction_cost_bps / 10000.0)
            policy_returns.append((hold_date, daily_ret))
            rec = {
                "date": hold_date,
                "recommended_action": scenario_payload["recommended_action"],
                "policy_recommended_action": scenario_payload["policy_recommended_action"],
                "predicted_regime": _regime_from_action_id(scenario_payload["policy_recommended_action"]),
                "beta_target": beta_target,
                "policy_beta_target": scenario_payload["policy_beta_target"],
                "scenario_expected_beta": scenario_payload["scenario_expected_beta"],
                "learned_policy_weight": scenario_payload["learned_policy_weight"],
                "blend_source": scenario_payload["blend_source"],
                "selected_hedge": hedge_ticker,
                "scenario_preferred_hedge": scenario_payload["scenario_preferred_hedge"],
                "dominant_scenario": scenario_payload["scenario_synthesis"]["dominant_scenario"],
                "confidence": decision.confidence,
                "expected_utility": decision.expected_utility,
                "alternative_action": decision.alternative_action,
                "veto_reason": decision.veto_reason,
                "turnover": turnover,
                "best_action_ex_post": feature_row.get("best_action"),
                "best_regime_ex_post": feature_row.get("best_regime"),
                "training_label": feature_row.get("training_label"),
                "best_action_utility": float(feature_row.get("best_action_utility", np.nan)),
                "best_regime_utility": float(feature_row.get("best_regime_utility", np.nan)),
                "why_this_action": " | ".join(scenario_payload["explanation_fields"].get("why_this_action", [])),
                "conditions_that_flip_decision": " | ".join(scenario_payload["explanation_fields"].get("conditions_that_flip_decision", [])),
                "scenario_narrative": " | ".join(scenario_payload["explanation_fields"].get("scenario_narrative", [])),
                **audit_feats_snapshot,
            }
            decisions.append(rec)
        # Accumulate the rebalance-level record for the incremental audit.
        rebalance_record = {
            "date": rebalance_date,
            "recommended_action": scenario_payload["recommended_action"],
            "predicted_regime": _regime_from_action_id(scenario_payload["recommended_action"]),
            "beta_target": beta_target,
            "confidence": decision.confidence,
            "confidence_bucket": _confidence_bucket(decision.confidence, settings.policy_confidence_threshold),
            "best_action_ex_post": feature_row.get("best_action"),
            "best_regime_ex_post": feature_row.get("best_regime"),
            "best_action_utility": float(feature_row.get("best_action_utility", np.nan)),
            "best_regime_utility": float(feature_row.get("best_regime_utility", np.nan)),
            "regime_forward_gap": float(feature_row.get("regime_forward_gap", np.nan)),
            "regime_utility_gap": float(feature_row.get("regime_utility_gap", np.nan)),
            "label_is_actionable": bool(feature_row.get("label_is_actionable", False)),
        }
        incremental_decisions.append(rebalance_record)
        rebalance_decisions.append(rebalance_record)
        blend_learning_history.append(
            {
                "date": rebalance_date,
                "dominant_scenario": scenario_payload["scenario_dominant"],
                "confidence": decision.confidence,
                "confidence_bucket": _confidence_bucket(decision.confidence, settings.policy_confidence_threshold),
                "policy_beta_target": scenario_payload["policy_beta_target"],
                "scenario_expected_beta": scenario_payload["scenario_expected_beta"],
                **{f"utility__{action.action_id}": float(feature_row.get(f"utility__{action.action_id}", np.nan)) for action in DEFAULT_POLICY_ACTIONS},
            }
        )
        previous_weights = weights

    policy_series = pd.Series({date: value for date, value in policy_returns}).sort_index().rename("policy_overlay")
    decision_frame = pd.DataFrame(decisions).drop_duplicates("date").set_index("date").sort_index() if decisions else pd.DataFrame()
    rebalance_frame = pd.DataFrame(rebalance_decisions).sort_values("date") if rebalance_decisions else pd.DataFrame()
    baselines = _policy_baselines(proxy_returns).reindex(policy_series.index).fillna(0.0)
    heuristic_series = heuristic_overlay.reindex(policy_series.index).fillna(0.0).rename("heuristic_state_overlay")

    if not decision_frame.empty:
        decision_frame["confidence_bucket"] = np.where(decision_frame["confidence"] >= decision_frame["confidence"].median(), "high", "low")
        confidence_perf = {
            bucket: performance_summary(policy_series.reindex(decision_frame.index[decision_frame["confidence_bucket"] == bucket]).fillna(0.0))
            for bucket in ["high", "low"]
        }
    else:
        confidence_perf = {}

    actionable_rebalance = rebalance_frame.loc[rebalance_frame["label_is_actionable"].fillna(False)].copy() if not rebalance_frame.empty else pd.DataFrame()
    non_overlap_actionable = _select_non_overlapping_rows(actionable_rebalance, settings.forward_horizon_days) if not actionable_rebalance.empty else pd.DataFrame()
    if not non_overlap_actionable.empty:
        non_overlap_accuracy = float((non_overlap_actionable["predicted_regime"] == non_overlap_actionable["best_regime_ex_post"]).mean())
    else:
        non_overlap_accuracy = np.nan

    summary = {
        "policy_overlay": performance_summary(policy_series),
        "heuristic_state_overlay": performance_summary(heuristic_series),
        "benchmark_spy": performance_summary(proxy_returns.get("SPY", pd.Series(0.0, index=policy_series.index)).reindex(policy_series.index).fillna(0.0)),
        "static_60_40": performance_summary(baselines["static_60_40"]),
        "vol_target": performance_summary(baselines["vol_target"]),
        "trend_following": performance_summary(baselines["trend_following"]),
        "defensive_mix": performance_summary(baselines["defensive_mix"]),
        "high_vs_low_confidence": confidence_perf,
        "label_diagnostics": {
            "rebalance_points": int(len(rebalance_frame)),
            "actionable_labels": int(len(actionable_rebalance)),
            "non_overlap_actionable_labels": int(len(non_overlap_actionable)),
            "forward_horizon_days": int(settings.forward_horizon_days),
            "min_forward_spread": float(settings.policy_label_min_forward_spread),
            "min_utility_gap": float(settings.policy_label_min_utility_gap),
            "non_overlap_regime_accuracy": non_overlap_accuracy,
            "regime_distribution": {
                str(key): float(value)
                for key, value in actionable_rebalance["best_regime_ex_post"].value_counts(normalize=True).sort_index().to_dict().items()
            }
            if not actionable_rebalance.empty
            else {},
        },
    }
    policy_stats = summary["policy_overlay"]
    heuristic_stats = summary["heuristic_state_overlay"]
    summary["acceptance_checks"] = {
        "beats_heuristic_sharpe": policy_stats["sharpe"] > heuristic_stats["sharpe"],
        "beats_heuristic_cagr_similar_drawdown": (policy_stats["annual_return"] > heuristic_stats["annual_return"]) and (policy_stats["max_drawdown"] >= heuristic_stats["max_drawdown"] - 0.02),
        "lower_drawdown_similar_cagr": (policy_stats["max_drawdown"] > heuristic_stats["max_drawdown"]) and (policy_stats["annual_return"] >= heuristic_stats["annual_return"] - 0.02),
    }

    daily_returns = pd.concat([policy_series, heuristic_series, baselines], axis=1).sort_index()
    (settings.policy_output_dir / "policy_backtest_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    daily_returns.to_csv(settings.policy_output_dir / "policy_daily_returns.csv", index=True)
    labeled.to_csv(settings.policy_output_dir / "policy_state_frame.csv", index=False)
    decision_frame.reset_index().to_csv(settings.policy_output_dir / "policy_decisions_history.csv", index=False)
    if not rebalance_frame.empty:
        rebalance_frame.to_csv(settings.policy_output_dir / "policy_rebalance_history.csv", index=False)

    return PolicyArtifacts(
        feature_frame=feature_frame,
        labeled_frame=labeled,
        daily_returns=daily_returns,
        decisions_history=decision_frame,
        summary=summary,
    )


def build_current_policy_output(
    settings: ResearchSettings,
    feature_history: pd.DataFrame,
    proxy_returns: pd.DataFrame,
    latest_feature_row: pd.Series,
    *,
    paths: "PathConfig | None" = None,
) -> dict:
    labeled_history = label_policy_actions(
        feature_history,
        proxy_returns,
        transaction_cost_bps=settings.transaction_cost_bps,
        min_forward_spread=settings.policy_label_min_forward_spread,
        min_utility_gap=settings.policy_label_min_utility_gap,
    )
    train_end = pd.to_datetime(latest_feature_row["date"]) - pd.Timedelta(days=settings.embargo_days)
    train_frame = labeled_history.loc[labeled_history["date"] <= train_end].copy()

    # ── Audit: load rolling error features and inject into the model ─────────
    audit: DecisionAudit | None = None
    audit_feats: dict[str, float] = {}
    confidence_penalty = 0.0
    penalty_reason = "no audit data available"
    if paths is not None:
        try:
            audit = DecisionAudit.from_paths(paths)
            as_of = pd.to_datetime(latest_feature_row["date"])
            audit_feats = audit.rolling_error_features(as_of)
            confidence_penalty, penalty_reason = audit.confidence_penalty(as_of)
            # Inject audit features into the train frame and the current row.
            for feat, val in audit_feats.items():
                train_frame[feat] = val
                latest_feature_row = latest_feature_row.copy()
                latest_feature_row[feat] = val
        except Exception as exc:
            penalty_reason = f"audit unavailable: {exc}"

    all_features = list(FEATURE_COLUMNS) + list(AUDIT_FEATURE_COLUMNS)
    artifacts = _fit_policy_model(train_frame, all_features, settings)
    decision = predict_policy_decision(artifacts, latest_feature_row, settings)

    # Apply the confidence penalty from the audit engine.
    # The model's raw confidence is reduced, which may push the decision
    # below the confidence threshold and trigger a defensive fallback.
    if confidence_penalty > 0.0 and audit is not None:
        penalised_confidence = max(0.0, decision.confidence - confidence_penalty)
        original_confidence = decision.confidence
        decision = PolicyDecision(
            date=decision.date,
            recommended_action=decision.recommended_action,
            confidence=penalised_confidence,
            expected_utility=decision.expected_utility,
            alternative_action=decision.alternative_action,
            veto_reason=decision.veto_reason,
            explanation_fields=decision.explanation_fields,
        )
        # If penalty drops confidence below threshold, override to defensive.
        if penalised_confidence < settings.policy_confidence_threshold and original_confidence >= settings.policy_confidence_threshold:
            decision = PolicyDecision(
                date=decision.date,
                recommended_action=_action_id_from_regime("NEUTRAL"),
                confidence=penalised_confidence,
                expected_utility=decision.expected_utility,
                alternative_action=decision.recommended_action,
                veto_reason="audit_confidence_penalty",
                explanation_fields={
                    **decision.explanation_fields,
                    "why_this_action": [
                        f"Audit engine penalised model confidence by {confidence_penalty:.1%}: {penalty_reason}.",
                        "Falling back to neutral beta_055.",
                    ] + list(decision.explanation_fields.get("why_this_action", [])),
                },
            )

    blend_history = pd.DataFrame()
    if paths is not None:
        blend_history_path = settings.policy_output_dir / "policy_rebalance_history.csv"
        if blend_history_path.exists():
            try:
                blend_history = pd.read_csv(blend_history_path)
            except Exception:
                blend_history = pd.DataFrame()

    scenario_payload = _blend_with_scenarios(
        decision,
        train_frame,
        latest_feature_row,
        base_hedge=_resolve_hedge_ticker(latest_feature_row),
        blend_history=blend_history,
        confidence_threshold=settings.policy_confidence_threshold,
    )
    beta_target = float(scenario_payload["beta_target"])
    # ── Chrono alert hard ceiling (live decision) ─────────────────────────────
    _chrono_alert_live: dict = {"available": False}
    if paths is not None:
        try:
            _chrono_alert_live = latest_chrono_alert(paths)
            if _chrono_alert_live.get("available"):
                _live_ceiling = float(_chrono_alert_live["beta_ceiling"])
                if beta_target > _live_ceiling:
                    beta_target = nearest_beta(_live_ceiling, BETA_LEVELS)
                    scenario_payload = {**scenario_payload, "beta_target": beta_target,
                                        "recommended_action": _beta_action_id(beta_target)}
        except Exception:
            pass
    hedge_ticker = str(scenario_payload["selected_hedge"])
    payload = asdict(decision)
    payload["recommended_action"] = scenario_payload["recommended_action"]
    payload["policy_recommended_action"] = scenario_payload["policy_recommended_action"]
    payload["beta_target"] = beta_target
    payload["policy_beta_target"] = scenario_payload["policy_beta_target"]
    payload["scenario_expected_beta"] = scenario_payload["scenario_expected_beta"]
    payload["learned_policy_weight"] = scenario_payload["learned_policy_weight"]
    payload["blend_source"] = scenario_payload["blend_source"]
    payload["selected_hedge"] = hedge_ticker
    payload["scenario_preferred_hedge"] = scenario_payload["scenario_preferred_hedge"]
    payload["scenario_synthesis"] = scenario_payload["scenario_synthesis"]
    payload["explanation_fields"] = scenario_payload["explanation_fields"]
    payload["policy_weights"] = _policy_weight_map_from_components(beta_target, hedge_ticker).to_dict()
    payload["behavioral_state"] = {
        "consensus_fragility_score": float(latest_feature_row.get("consensus_fragility_score", np.nan)),
        "belief_capacity_misalignment": float(latest_feature_row.get("belief_capacity_misalignment", np.nan)),
        "consensus_fragility_narrative": list(latest_feature_row.get("consensus_fragility_narrative", []) or []),
    }

    # ── Chrono alert metadata in payload ─────────────────────────────────────
    payload["chrono_alert"] = _chrono_alert_live if _chrono_alert_live.get("available") else {"available": False}

    # ── Audit metadata in payload ─────────────────────────────────────────────
    payload["audit"] = {
        "confidence_penalty": round(confidence_penalty, 4),
        "penalty_reason": penalty_reason,
        "rolling_error_features": {k: round(v, 4) for k, v in audit_feats.items()},
    }
    if audit is not None:
        try:
            summary = audit.build_summary(pd.to_datetime(latest_feature_row["date"]))
            audit.write_outputs(summary)
            payload["audit"]["accuracy_overall"] = summary.accuracy_overall
            payload["audit"]["rolling_error_rate_63d"] = summary.rolling_error_rate_63d
            payload["audit"]["consecutive_errors"] = summary.recent_consecutive_errors
            payload["audit"]["calibration_gap"] = summary.calibration_gap
            payload["audit"]["top_culprit"] = summary.blame.top_culprit if summary.blame else None
            payload["audit"]["calibration_narrative"] = summary.calibration_narrative
            payload["audit"]["blame_narrative"] = summary.blame.narrative if summary.blame else []
        except Exception as exc:
            payload["audit"]["build_error"] = str(exc)

    return payload
