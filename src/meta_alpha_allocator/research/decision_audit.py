"""Decision Audit & Calibration Feedback Engine.

This module closes the feedback loop that was missing: it takes every past
policy decision, aligns it with the realized utility outcome that was
actually achieved, and produces:

1. **Calibration table** — for each (action, confidence_bucket, regime) context,
   what fraction of past decisions were "correct" (recommended == best_ex_post)?

2. **Blame vector** — when a decision was wrong, which input signal was most
   "responsible" for pointing the model in the wrong direction?  Computed by
   correlating each state feature with the utility gap (utility of recommended
   action minus utility of the ex-post best action).

3. **Rolling error features** — a set of numeric features capturing recent
   model reliability that can be injected directly into the policy model as
   additional training features, making the policy *learn* from its own
   recent mistakes.

The rolling error features are the key innovation: rather than just
*showing* the operator that the model has been wrong, they let the model
*adjust its own future confidence* based on its recent track record.

Example integration in policy/engine.py:

    from ..research.decision_audit import DecisionAudit
    audit = DecisionAudit.from_paths(paths)
    extra_features = audit.rolling_error_features(as_of_date)
    state_row = {**state_row, **extra_features}

The extra features are then included in the training panel so future
logistic-regression model training incorporates them automatically.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from ..utils import ensure_directory


# ── Constants ────────────────────────────────────────────────────────────────

# Features used to attribute blame when a decision was wrong.
_BLAME_FEATURES = [
    "crash_prob",
    "tail_risk_score",
    "legitimacy_risk",
    "crowding_pct",
    "fred_term_spread",
    "fred_hy_spread",
    "breadth_20d",
    "spy_mom_20d",
    "spy_vol_20d",
    "momentum_concentration_60d",
    "gold_return_3m",
    "dollar_return_3m",
    "tlt_score",
    "bil_score",
    "gld_score",
    "uup_score",
    "shy_score",
]

# How many trading days back to use for rolling error windows.
_WINDOW_SHORT = 21   # ~1 month
_WINDOW_MED   = 63   # ~3 months
_WINDOW_LONG  = 252  # ~12 months

# All valid policy actions in beta order.
_ACTIONS = ["beta_025", "beta_040", "beta_055", "beta_070", "beta_085", "beta_100"]
_BETA = {"beta_025": 0.25, "beta_040": 0.40, "beta_055": 0.55,
         "beta_070": 0.70, "beta_085": 0.85, "beta_100": 1.00}
_ACTION_TO_REGIME = {
    "beta_025": "DEFENSIVE",
    "beta_040": "DEFENSIVE",
    "beta_055": "NEUTRAL",
    "beta_070": "NEUTRAL",
    "beta_085": "RISK_ON",
    "beta_100": "RISK_ON",
}


# ── Dataclasses ──────────────────────────────────────────────────────────────

@dataclass
class DecisionRecord:
    """A single past decision with its realized outcome."""
    date: pd.Timestamp
    recommended_action: str
    beta_target: float
    confidence: float
    confidence_bucket: str
    regime: str
    # The utility the model achieved with its recommendation.
    utility_achieved: float | None
    # The utility of the ex-post best action.
    utility_best: float | None
    # The ex-post best action.
    best_action_ex_post: str | None
    target_regime: str | None
    predicted_regime: str | None
    # Whether the recommendation matched the ex-post best.
    was_correct: bool | None
    # Utility gap: how much better the best action would have been.
    utility_gap: float | None
    # Context features at decision time (for blame attribution).
    context: dict[str, float] = field(default_factory=dict)


@dataclass
class BlameVector:
    """Which signals were most anti-correlated with decision quality."""
    feature_blame: list[dict[str, Any]]   # [{feature, blame_score, direction}]
    top_culprit: str | None
    narrative: list[str]


@dataclass
class AuditSummary:
    """Full audit output exposed via API."""
    as_of_date: str
    total_decisions: int
    decisions_with_outcome: int

    # Empirical accuracy (recommended == best_ex_post)
    accuracy_overall: float | None
    accuracy_by_action: dict[str, float]
    accuracy_by_regime: dict[str, float]
    accuracy_by_confidence: dict[str, float]

    # Calibration gap: model confidence vs empirical accuracy
    calibration_gap: float | None          # model_confidence - empirical_accuracy
    calibration_narrative: list[str]

    # Rolling error rates (recent reliability)
    rolling_error_rate_21d: float | None   # fraction of wrong decisions last 21 days
    rolling_error_rate_63d: float | None
    rolling_error_rate_252d: float | None
    recent_consecutive_errors: int         # current streak of wrong decisions

    # Utility regret (avg utility gap when wrong)
    mean_utility_gap_63d: float | None
    mean_utility_gap_252d: float | None

    # Blame attribution
    blame: BlameVector | None

    # Recent decision log (last 20)
    recent_decisions: list[dict[str, Any]]

    # Rolling error features to inject into policy model
    rolling_error_features: dict[str, float]

    # Whether the model should self-penalise confidence right now
    confidence_penalty: float              # 0.0 = no penalty, up to ~0.3
    penalty_reason: str


# ── Core engine ──────────────────────────────────────────────────────────────

class DecisionAudit:
    """Builds and exposes the decision audit for the policy engine.

    Parameters
    ----------
    decisions_path : Path
        policy_decisions_history.csv
    state_path : Path
        policy_state_frame.csv  (contains realized utilities)
    output_dir : Path
        Where to write audit JSON outputs.
    """

    def __init__(
        self,
        decisions_path: Path,
        state_path: Path,
        output_dir: Path,
    ) -> None:
        self.output_dir = output_dir
        self._records: list[DecisionRecord] = []
        self._df: pd.DataFrame = pd.DataFrame()
        self._load(decisions_path, state_path)

    # ── Construction ─────────────────────────────────────────────────────

    @classmethod
    def from_paths(cls, paths: Any, output_dir: Path | None = None) -> "DecisionAudit":
        """Build from a PathConfig (as used in production runtime)."""
        policy_dir = paths.output_root / "policy" / "latest"
        out = output_dir or (paths.output_root / "audit" / "latest")
        return cls(
            decisions_path=policy_dir / "policy_decisions_history.csv",
            state_path=policy_dir / "policy_state_frame.csv",
            output_dir=out,
        )

    def _load(self, decisions_path: Path, state_path: Path) -> None:
        if not decisions_path.exists():
            return

        hist = pd.read_csv(decisions_path)
        hist["date"] = pd.to_datetime(hist["date"])

        state = pd.DataFrame()
        if state_path.exists():
            state = pd.read_csv(state_path)
            state["date"] = pd.to_datetime(state["date"])

        # Merge realized utilities from state frame into history.
        util_cols = ["date", "regime", "best_regime", "training_label"] + [c for c in state.columns if c.startswith("utility__")]
        feat_cols = ["date"] + [f for f in _BLAME_FEATURES if f in state.columns]
        if not state.empty:
            hist = hist.merge(state[util_cols].drop_duplicates("date"), on="date", how="left", suffixes=("", "_state"))
            hist = hist.merge(state[feat_cols].drop_duplicates("date"), on="date", how="left", suffixes=("", "_feat"))

        self._df = hist.sort_values("date").reset_index(drop=True)

        # Build record list.
        for _, row in self._df.iterrows():
            action = row.get("recommended_action")
            util_col = f"utility__{action}" if action else None
            util_achieved = float(row[util_col]) if util_col and util_col in row and pd.notna(row[util_col]) else None
            util_best = float(row["best_action_utility"]) if "best_action_utility" in row and pd.notna(row.get("best_action_utility")) else None
            best_ex_post = row.get("best_action_ex_post") if pd.notna(row.get("best_action_ex_post")) else None
            target_regime = None
            if pd.notna(row.get("best_regime_ex_post")):
                target_regime = str(row.get("best_regime_ex_post"))
            elif pd.notna(row.get("training_label")):
                target_regime = str(row.get("training_label"))
            elif pd.notna(row.get("best_regime")):
                target_regime = str(row.get("best_regime"))
            elif best_ex_post:
                target_regime = _ACTION_TO_REGIME.get(str(best_ex_post), "NEUTRAL")
            predicted_regime = None
            if pd.notna(row.get("predicted_regime")):
                predicted_regime = str(row.get("predicted_regime"))
            elif action:
                predicted_regime = _ACTION_TO_REGIME.get(str(action), "NEUTRAL")

            was_correct: bool | None = None
            if predicted_regime and target_regime:
                was_correct = predicted_regime == target_regime

            utility_gap: float | None = None
            if util_achieved is not None and util_best is not None:
                utility_gap = util_best - util_achieved  # > 0 means we left money on the table

            context = {f: float(row[f]) for f in _BLAME_FEATURES if f in row and pd.notna(row.get(f))}

            # Get regime — prefer state frame merge, fall back to heuristic.
            regime = str(row.get("regime", "NEUTRAL")) if pd.notna(row.get("regime")) else "NEUTRAL"

            self._records.append(
                DecisionRecord(
                    date=row["date"],
                    recommended_action=str(action) if action else "unknown",
                    beta_target=float(row.get("beta_target", 0.7)),
                    confidence=float(row.get("confidence", 0.0)),
                    confidence_bucket=str(row.get("confidence_bucket", "low")),
                    regime=regime,
                    utility_achieved=util_achieved,
                    utility_best=util_best,
                    best_action_ex_post=best_ex_post,
                    target_regime=target_regime,
                    predicted_regime=predicted_regime,
                    was_correct=was_correct,
                    utility_gap=utility_gap,
                    context=context,
                )
            )

    # ── Rolling error features (the learning loop) ────────────────────────

    def rolling_error_features(self, as_of_date: pd.Timestamp | None = None) -> dict[str, float]:
        """Return features capturing recent model error rate.

        These are designed to be injected directly into the policy model's
        feature panel so it can *learn* to discount its own confidence when
        it has been systematically wrong recently.

        Feature semantics:
        - audit_error_rate_21d / 63d / 252d : rolling fraction of wrong decisions
        - audit_utility_gap_21d / 63d       : avg utility left on table per decision
        - audit_consecutive_errors          : current streak (normalised 0-1, >10 = 1)
        - audit_confidence_bias_63d         : avg (model_confidence - was_correct)
          > 0 means model is overconfident, < 0 means underconfident
        - audit_regime_error_{regime}       : error rate in current regime context
        """
        df = self._get_eligible(as_of_date)
        if df.empty:
            return self._zero_features()

        def _window_mean(col: str, window: int) -> float | None:
            sub = df.tail(window)
            vals = sub[col].dropna()
            return float(vals.mean()) if len(vals) >= max(window // 4, 5) else None

        # Error rate = 1 - accuracy
        df["was_wrong"] = (~df["was_correct"].fillna(False)).astype(float)
        df["was_correct_float"] = df["was_correct"].fillna(False).astype(float)

        err_21 = _window_mean("was_wrong", _WINDOW_SHORT)
        err_63 = _window_mean("was_wrong", _WINDOW_MED)
        err_252 = _window_mean("was_wrong", _WINDOW_LONG)

        gap_21 = _window_mean("utility_gap", _WINDOW_SHORT)
        gap_63 = _window_mean("utility_gap", _WINDOW_MED)

        # Consecutive error streak.
        streak = 0
        for rec in reversed(self._records):
            if as_of_date and rec.date > as_of_date:
                continue
            if rec.was_correct is None:
                break
            if rec.was_correct:
                break
            streak += 1

        # Confidence bias (overconfidence metric).
        sub_63 = df.tail(_WINDOW_MED)
        conf_bias: float | None = None
        if len(sub_63) >= 10:
            conf_bias = float((sub_63["confidence"] - sub_63["was_correct_float"]).mean())

        # Regime-specific error rate (use current regime from most recent record).
        current_regime = "NEUTRAL"
        for rec in reversed(self._records):
            if as_of_date is None or rec.date <= as_of_date:
                current_regime = rec.regime
                break

        regime_df = df[df["regime"] == current_regime].tail(_WINDOW_MED)
        regime_err: float | None = None
        if len(regime_df) >= 5:
            regime_err = float(regime_df["was_wrong"].mean())

        features: dict[str, float] = {}
        if err_21 is not None:
            features["audit_error_rate_21d"] = err_21
        if err_63 is not None:
            features["audit_error_rate_63d"] = err_63
        if err_252 is not None:
            features["audit_error_rate_252d"] = err_252
        if gap_21 is not None:
            features["audit_utility_gap_21d"] = gap_21
        if gap_63 is not None:
            features["audit_utility_gap_63d"] = gap_63
        features["audit_consecutive_errors"] = min(streak / 10.0, 1.0)
        if conf_bias is not None:
            features["audit_confidence_bias_63d"] = conf_bias
        if regime_err is not None:
            features[f"audit_regime_error_{current_regime.lower()}"] = regime_err

        return features

    def confidence_penalty(self, as_of_date: pd.Timestamp | None = None) -> tuple[float, str]:
        """Compute a penalty [0, 0.35] to subtract from model confidence.

        The penalty increases when:
        - Recent error rate is high relative to historical baseline.
        - There is a long consecutive error streak.
        - The model has been systematically overconfident recently.

        Returns (penalty_value, reason_string).
        """
        feats = self.rolling_error_features(as_of_date)
        if not feats:
            return 0.0, "insufficient history"

        err_63 = feats.get("audit_error_rate_63d", 0.5)
        err_252 = feats.get("audit_error_rate_252d", 0.5)
        streak_norm = feats.get("audit_consecutive_errors", 0.0)
        conf_bias = feats.get("audit_confidence_bias_63d", 0.0)

        # Base penalty from recent vs historical error drift.
        err_delta = max(err_63 - err_252, 0.0)  # only penalise if getting worse
        penalty_err = min(err_delta * 1.5, 0.20)

        # Additional penalty for long streaks.
        penalty_streak = min(streak_norm * 0.15, 0.10)

        # Additional penalty for overconfidence.
        penalty_bias = min(max(conf_bias, 0.0) * 0.5, 0.10)

        total = round(min(penalty_err + penalty_streak + penalty_bias, 0.35), 4)

        reasons = []
        if penalty_err > 0.02:
            reasons.append(f"error rate worse than baseline by {err_delta:.1%} (63d vs 252d)")
        if penalty_streak > 0.02:
            n_streak = round(streak_norm * 10)
            reasons.append(f"{n_streak}+ consecutive wrong decisions")
        if penalty_bias > 0.02:
            reasons.append(f"model overconfident by {conf_bias:.2f} on average (63d)")

        reason = "; ".join(reasons) if reasons else "model performing at baseline"
        return total, reason

    # ── Blame attribution ────────────────────────────────────────────────

    def blame_vector(self, as_of_date: pd.Timestamp | None = None, window: int = 252) -> BlameVector:
        """Identify which signals were most responsible for recent wrong decisions.

        Method: for each wrong decision in the window, we look at the context
        features.  We then compute the Pearson correlation between each feature
        and the utility_gap (positive gap = we picked worse action).  Features
        that are highly positively correlated with large gaps are the "culprits"
        — they were high when we should have been more cautious.
        """
        df = self._get_eligible(as_of_date).tail(window)
        wrong = df[df["was_correct"] == False].copy()  # noqa: E712

        if len(wrong) < 10:
            return BlameVector(feature_blame=[], top_culprit=None, narrative=["insufficient wrong decisions to attribute blame"])

        results = []
        for feat in _BLAME_FEATURES:
            if feat not in wrong.columns or wrong[feat].isna().all():
                continue
            valid = wrong[["utility_gap", feat]].dropna()
            if len(valid) < 10:
                continue
            corr = float(valid.corr().iloc[0, 1])
            if np.isnan(corr):
                continue
            # Positive correlation: feature being high → bigger utility gap (worse decision)
            # Negative: feature being high → smaller gap (decisions less wrong there)
            results.append({
                "feature": feat,
                "blame_score": round(abs(corr), 4),
                "direction": "high_→_worse" if corr > 0 else "low_→_worse",
                "correlation": round(corr, 4),
            })

        results.sort(key=lambda x: x["blame_score"], reverse=True)
        top = results[0]["feature"] if results else None

        # Build human narrative.
        narrative: list[str] = []
        for r in results[:3]:
            feat = r["feature"].replace("_", " ")
            dir_str = "high" if "high" in r["direction"] else "low"
            narrative.append(
                f"{feat} being {dir_str} was associated with worse decisions (blame score {r['blame_score']:.2f})"
            )

        return BlameVector(feature_blame=results[:10], top_culprit=top, narrative=narrative)

    # ── Full summary ─────────────────────────────────────────────────────

    def build_summary(self, as_of_date: pd.Timestamp | None = None) -> AuditSummary:
        """Build the full AuditSummary for API/dashboard consumption."""
        df = self._get_eligible(as_of_date)
        total = len(self._records)
        n_with_outcome = int(df["was_correct"].notna().sum())

        def _acc(sub: pd.DataFrame) -> float | None:
            valid = sub["was_correct"].dropna()
            return float(valid.mean()) if len(valid) >= 5 else None

        acc_overall = _acc(df)
        acc_by_action = {}
        for act in _ACTIONS:
            sub = df[df["recommended_action"] == act]
            a = _acc(sub)
            if a is not None:
                acc_by_action[act] = round(a, 4)

        acc_by_regime = {}
        for regime in df["regime"].dropna().unique():
            a = _acc(df[df["regime"] == regime])
            if a is not None:
                acc_by_regime[str(regime)] = round(a, 4)

        acc_by_conf = {}
        for bucket in ["high", "low"]:
            a = _acc(df[df["confidence_bucket"] == bucket])
            if a is not None:
                acc_by_conf[bucket] = round(a, 4)

        # Calibration gap: compare model confidence to empirical accuracy.
        recent = df.tail(_WINDOW_LONG)
        cal_gap: float | None = None
        cal_narrative: list[str] = []
        if len(recent) >= 20:
            avg_conf = float(recent["confidence"].mean())
            avg_acc = float(recent["was_correct"].dropna().mean()) if recent["was_correct"].notna().any() else None
            if avg_acc is not None:
                cal_gap = round(avg_conf - avg_acc, 4)
                if cal_gap > 0.10:
                    cal_narrative.append(f"Model is systematically overconfident: avg confidence {avg_conf:.1%} vs empirical accuracy {avg_acc:.1%}.")
                elif cal_gap < -0.10:
                    cal_narrative.append(f"Model is underconfident: avg confidence {avg_conf:.1%} vs empirical accuracy {avg_acc:.1%}.")
                else:
                    cal_narrative.append(f"Model calibration is reasonable: avg confidence {avg_conf:.1%}, empirical accuracy {avg_acc:.1%}.")

        # Rolling error rates.
        df["was_wrong"] = (~df["was_correct"].fillna(False)).astype(float)

        def _roll_err(w: int) -> float | None:
            sub = df.tail(w)["was_wrong"].dropna()
            return round(float(sub.mean()), 4) if len(sub) >= max(w // 4, 5) else None

        err_21 = _roll_err(_WINDOW_SHORT)
        err_63 = _roll_err(_WINDOW_MED)
        err_252 = _roll_err(_WINDOW_LONG)

        def _roll_gap(w: int) -> float | None:
            sub = df.tail(w)["utility_gap"].dropna()
            return round(float(sub.mean()), 6) if len(sub) >= max(w // 4, 5) else None

        gap_63 = _roll_gap(_WINDOW_MED)
        gap_252 = _roll_gap(_WINDOW_LONG)

        # Consecutive errors.
        streak = 0
        for rec in reversed(self._records):
            if as_of_date and rec.date > as_of_date:
                continue
            if rec.was_correct is None:
                break
            if rec.was_correct:
                break
            streak += 1

        blame = self.blame_vector(as_of_date)
        penalty, penalty_reason = self.confidence_penalty(as_of_date)
        rolling_feats = self.rolling_error_features(as_of_date)

        recent_log = []
        recs = [r for r in self._records if as_of_date is None or r.date <= as_of_date]
        for rec in reversed(recs[-20:]):
            recent_log.append({
                "date": rec.date.date().isoformat(),
                "recommended": rec.recommended_action,
                "best_ex_post": rec.best_action_ex_post,
                "predicted_regime": rec.predicted_regime,
                "target_regime": rec.target_regime,
                "was_correct": rec.was_correct,
                "confidence": round(rec.confidence, 4),
                "utility_achieved": round(rec.utility_achieved, 6) if rec.utility_achieved is not None else None,
                "utility_best": round(rec.utility_best, 6) if rec.utility_best is not None else None,
                "utility_gap": round(rec.utility_gap, 6) if rec.utility_gap is not None else None,
                "regime": rec.regime,
            })

        return AuditSummary(
            as_of_date=as_of_date.date().isoformat() if as_of_date else pd.Timestamp.today().date().isoformat(),
            total_decisions=total,
            decisions_with_outcome=n_with_outcome,
            accuracy_overall=round(acc_overall, 4) if acc_overall is not None else None,
            accuracy_by_action=acc_by_action,
            accuracy_by_regime=acc_by_regime,
            accuracy_by_confidence=acc_by_conf,
            calibration_gap=cal_gap,
            calibration_narrative=cal_narrative,
            rolling_error_rate_21d=err_21,
            rolling_error_rate_63d=err_63,
            rolling_error_rate_252d=err_252,
            recent_consecutive_errors=streak,
            mean_utility_gap_63d=gap_63,
            mean_utility_gap_252d=gap_252,
            blame=blame,
            recent_decisions=recent_log,
            rolling_error_features=rolling_feats,
            confidence_penalty=penalty,
            penalty_reason=penalty_reason,
        )

    def write_outputs(self, summary: AuditSummary | None = None) -> None:
        """Persist audit summary to output_dir as JSON."""
        if summary is None:
            summary = self.build_summary()
        ensure_directory(self.output_dir)

        def _to_dict(obj: Any) -> Any:
            if hasattr(obj, "__dict__"):
                return {k: _to_dict(v) for k, v in obj.__dict__.items()}
            if isinstance(obj, list):
                return [_to_dict(x) for x in obj]
            if isinstance(obj, dict):
                return {k: _to_dict(v) for k, v in obj.items()}
            if isinstance(obj, float) and np.isnan(obj):
                return None
            return obj

        payload = _to_dict(summary)
        (self.output_dir / "audit_summary.json").write_text(
            json.dumps(payload, indent=2), encoding="utf-8"
        )

    # ── Helpers ───────────────────────────────────────────────────────────

    def _get_eligible(self, as_of_date: pd.Timestamp | None) -> pd.DataFrame:
        """Return records as a DataFrame, filtered to as_of_date."""
        df = self._df.copy()
        if as_of_date is not None:
            df = df[df["date"] <= as_of_date]
        # Only rows where we have either correctness or utility info.
        has_data = df.get("best_regime_ex_post", pd.Series(index=df.index, dtype=object)).notna() | df.get("training_label", pd.Series(index=df.index, dtype=object)).notna() | df.get("best_regime", pd.Series(index=df.index, dtype=object)).notna() | df["best_action_ex_post"].notna() | df.get(
            "utility__beta_100", pd.Series(index=df.index, dtype=float)
        ).notna()
        df = df[has_data].copy() if has_data.any() else df

        # Derive was_correct column if not already present.
        if "was_correct" not in df.columns:
            df["was_correct"] = df.apply(
                lambda r: (
                    (r.get("predicted_regime") or _ACTION_TO_REGIME.get(r.get("recommended_action"), "NEUTRAL"))
                    == (r.get("best_regime_ex_post") or r.get("training_label") or r.get("best_regime") or _ACTION_TO_REGIME.get(r.get("best_action_ex_post"), "NEUTRAL"))
                )
                if pd.notna(r.get("best_regime_ex_post")) or pd.notna(r.get("training_label")) or pd.notna(r.get("best_regime")) or pd.notna(r.get("best_action_ex_post"))
                else None,
                axis=1,
            )

        # utility_gap: best utility - recommended utility.
        if "utility_gap" not in df.columns:
            def _gap(row):
                rec = row.get("recommended_action")
                util_rec_col = f"utility__{rec}" if rec else None
                util_rec = float(row[util_rec_col]) if util_rec_col and util_rec_col in row and pd.notna(row.get(util_rec_col)) else None
                util_best = float(row["best_action_utility"]) if "best_action_utility" in row and pd.notna(row.get("best_action_utility")) else None
                if util_rec is not None and util_best is not None:
                    return util_best - util_rec
                return None
            df["utility_gap"] = df.apply(_gap, axis=1)

        # Bring in blame features from state frame if they were merged.
        for feat in _BLAME_FEATURES:
            if feat not in df.columns:
                feat_alt = f"{feat}_feat"
                if feat_alt in df.columns:
                    df[feat] = df[feat_alt]

        return df

    @staticmethod
    def _zero_features() -> dict[str, float]:
        return {
            "audit_error_rate_21d": 0.5,
            "audit_error_rate_63d": 0.5,
            "audit_error_rate_252d": 0.5,
            "audit_consecutive_errors": 0.0,
            "audit_confidence_bias_63d": 0.0,
        }


# ── Convenience runner ────────────────────────────────────────────────────────

def run_decision_audit(paths: Any) -> AuditSummary:
    """Build, persist, and return the DecisionAudit summary from PathConfig."""
    audit = DecisionAudit.from_paths(paths)
    summary = audit.build_summary()
    audit.write_outputs(summary)
    return summary
