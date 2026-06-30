from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[1]
DATASET_ROOT = ROOT / "artifacts" / "aurora_omega_v8_dataset"
ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_omega_v8_ranker"

SEED = 7
GAP_YEARS = 3
STAGE1_INNER_GAP_YEARS = 1
BELIEF_BLEND_WEIGHT = 0.25
REGIME_BELIEF_BLEND_WEIGHTS = {
    "regulated_utility_infrastructure": 0.25,
    "quality_compounder": 0.30,
    "commodity_resource": 0.30,
    "bottleneck_oligopoly": 0.30,
    "asset_heavy_cyclical": 0.20,
    "general_intrinsic": 0.25,
    "financial_book_capital": 0.15,
    "expensive_compounder": 0.05,
    "pre_profit_platform": 0.10,
}
EXPENSIVE_COMPOUNDER_PENALTY = 0.30
EXPENSIVE_COMPOUNDER_FEASIBILITY_OFFSET = 0.05
BOTTLENECK_OVERLAY_WEIGHT = 0.10
EXPENSIVE_COMPOUNDER_QUALITY_OFFSET = 0.15
EXPENSIVE_COMPOUNDER_FCF_OFFSET = 0.02
EXPENSIVE_COMPOUNDER_DEBT_PENALTY = 0.02
EXPENSIVE_COMPOUNDER_SELECTOR_MAX_QUALITY = 1.00
ROLLING_VAL_YEARS = list(range(2018, 2024))
CATEGORICAL_COLS = [
    "sector",
    "industry",
    "country",
    "economic_regime",
    "omega_regime",
    "omega_primary_question",
]
EXACT_EXCLUDE = {
    "ticker",
    "fiscal_date",
    "asof_date",
    "price_t0",
    "future_price_t0",
    "return_1y_fwd",
    "return_3y_fwd",
    "ann_return_1y_fwd",
    "ann_return_3y_fwd",
    "expectation_violation_score",
    "expectation_violation_observed",
    "research_priority_target",
}
PREFIX_EXCLUDE = ("future_", "realized_")
SUBSTRING_EXCLUDE = ("_violation",)


@dataclass
class EvalBundle:
    fold_metrics: pd.DataFrame
    predictions: pd.DataFrame
    leaderboard: pd.DataFrame
    regime_diagnostics: pd.DataFrame
    sector_neutral_diagnostics: pd.DataFrame
    overlap_table: pd.DataFrame


def is_feature_col(col: str) -> bool:
    if col in EXACT_EXCLUDE:
        return False
    if any(col.startswith(prefix) for prefix in PREFIX_EXCLUDE):
        return False
    if any(token in col for token in SUBSTRING_EXCLUDE):
        return False
    return True


def load_dataset(dataset_path: str | None) -> pd.DataFrame:
    if dataset_path:
        path = Path(dataset_path)
    else:
        latest = (DATASET_ROOT / "LATEST.txt").read_text(encoding="utf-8").strip()
        path = Path(latest) / "aurora_omega_v8_dataset.parquet"
    return pd.read_parquet(path)


def build_feature_columns(data: pd.DataFrame) -> tuple[list[str], list[str], list[str]]:
    feature_cols = [col for col in data.columns if is_feature_col(col)]
    numeric_cols = [
        col for col in feature_cols
        if col not in CATEGORICAL_COLS and pd.api.types.is_numeric_dtype(data[col]) and data[col].notna().any()
    ]
    cat_cols = [col for col in CATEGORICAL_COLS if col in data.columns]
    return feature_cols, numeric_cols, cat_cols


def active_numeric_cols(frame: pd.DataFrame, numeric_cols: list[str]) -> list[str]:
    return [col for col in numeric_cols if col in frame.columns and frame[col].notna().any()]


def make_preprocessor(numeric_cols: list[str], cat_cols: list[str]) -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline([
                    ("impute", SimpleImputer(strategy="median")),
                    ("scale", StandardScaler()),
                ]),
                numeric_cols,
            ),
            (
                "cat",
                Pipeline([
                    ("impute", SimpleImputer(strategy="most_frequent")),
                    ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                ]),
                cat_cols,
            ),
        ],
        remainder="drop",
    )


def make_model(model_name: str, numeric_cols: list[str], cat_cols: list[str]):
    preprocessor = make_preprocessor(numeric_cols, cat_cols)
    if model_name == "ridge":
        estimator = Ridge(alpha=1.0)
    elif model_name == "hist_gbr":
        estimator = HistGradientBoostingRegressor(
            max_depth=6,
            learning_rate=0.05,
            max_iter=250,
            random_state=SEED,
        )
    elif model_name == "rf":
        estimator = RandomForestRegressor(
            n_estimators=400,
            min_samples_leaf=4,
            random_state=SEED,
            n_jobs=-1,
        )
    else:
        raise ValueError(f"Unknown model: {model_name}")
    return Pipeline([("prep", preprocessor), ("model", estimator)])


def formula_baseline(frame: pd.DataFrame) -> pd.Series:
    return (
        0.32 * frame["omega_feasibility_score"].fillna(0.5)
        - 0.28 * frame["omega_expectations_pressure"].fillna(0.5)
        + 0.18 * frame["omega_downside_anchor_score"].fillna(0.5)
        + 0.12 * frame["omega_book_anchor_score"].fillna(0.5)
        + 0.10 * frame["omega_reverse_dcf_score"].fillna(0.5)
        + 0.08 * frame["pred_reverseDcf"].fillna(0.0)
        + 0.06 * frame["pred_assetValue"].fillna(0.0)
    )


def year_spearman(frame: pd.DataFrame, pred_col: str, target_col: str, min_rows: int = 8) -> float:
    values: list[float] = []
    for _, sub in frame.dropna(subset=[pred_col, target_col]).groupby("year"):
        if len(sub) < min_rows:
            continue
        corr = spearmanr(sub[pred_col], sub[target_col], nan_policy="omit").correlation
        if pd.notna(corr):
            values.append(float(corr))
    return float(np.mean(values)) if values else np.nan


def decile_spread(frame: pd.DataFrame, pred_col: str, target_col: str, min_year_rows: int = 20) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for year, sub in frame.dropna(subset=[pred_col, target_col]).groupby("year"):
        if len(sub) < min_year_rows:
            continue
        ordered = sub.sort_values(pred_col)
        bucket = max(3, len(ordered) // 10)
        bottom = ordered.head(bucket)
        top = ordered.tail(bucket)
        rows.append(
            {
                "year": int(year),
                "rows": int(len(sub)),
                "top_mean": float(top[target_col].mean()),
                "bottom_mean": float(bottom[target_col].mean()),
                "spread": float(top[target_col].mean() - bottom[target_col].mean()),
            }
        )
    if not rows:
        return {"by_year": [], "mean_spread": np.nan, "positive_share": np.nan}
    table = pd.DataFrame(rows)
    return {
        "by_year": rows,
        "mean_spread": float(table["spread"].mean()),
        "positive_share": float((table["spread"] > 0).mean()),
    }


def add_sector_neutral_return(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame.copy()
    out["sector_neutral_return_3y"] = (
        out["ann_return_3y_fwd"] - out.groupby(["year", "sector"])["ann_return_3y_fwd"].transform("mean")
    )
    return out


def year_zscore(frame: pd.DataFrame, col: str) -> pd.Series:
    def _z(s: pd.Series) -> pd.Series:
        s = pd.to_numeric(s, errors="coerce")
        sd = s.std(ddof=0)
        if not np.isfinite(sd) or sd <= 1e-9:
            return pd.Series(0.0, index=s.index)
        return (s - s.mean()) / sd

    return frame.groupby("year", group_keys=False)[col].apply(_z)


def add_year_zscore(frame: pd.DataFrame, col: str) -> None:
    frame[f"{col}_z"] = year_zscore(frame, col)


def compute_blend_v2(frame: pd.DataFrame) -> pd.Series:
    weight = frame["omega_regime"].map(REGIME_BELIEF_BLEND_WEIGHTS).fillna(BELIEF_BLEND_WEIGHT).astype(float)
    score = (1.0 - weight) * frame["single_stage_hist_gbr_z"] + weight * frame["stage1_belief_probe_z"]

    expensive_mask = frame["omega_regime"].eq("expensive_compounder")
    expensive_pressure = (
        frame["omega_expectations_pressure_z"].fillna(0.0)
        + frame["implied_duration_score_z"].fillna(0.0)
    ) / 2.0
    score = score.where(
        ~expensive_mask,
        score
        - EXPENSIVE_COMPOUNDER_PENALTY * expensive_pressure
        + EXPENSIVE_COMPOUNDER_FEASIBILITY_OFFSET * frame["omega_feasibility_score_z"].fillna(0.0),
    )

    bottleneck_mask = frame["omega_regime"].eq("bottleneck_oligopoly")
    score = score.where(
        ~bottleneck_mask,
        score + BOTTLENECK_OVERLAY_WEIGHT * frame["bottleneck_proxy_year_z_z"].fillna(0.0),
    )
    return score


def compute_blend_v3(frame: pd.DataFrame) -> pd.Series:
    score = compute_blend_v2(frame).copy()
    expensive_mask = frame["omega_regime"].eq("expensive_compounder")
    expensive_quality = (
        frame["roic_proxy_year_z_z"].fillna(0.0)
        + frame["operating_margin_year_z_z"].fillna(0.0)
    ) / 2.0
    score = score.where(
        ~expensive_mask,
        score
        + EXPENSIVE_COMPOUNDER_QUALITY_OFFSET * expensive_quality
        + EXPENSIVE_COMPOUNDER_FCF_OFFSET * frame["fcf_yield_year_z_z"].fillna(0.0)
        - EXPENSIVE_COMPOUNDER_DEBT_PENALTY * frame["debt_assets_year_z_z"].fillna(0.0),
    )
    return score


def compute_blend_selector_v1(frame: pd.DataFrame) -> pd.Series:
    blend_v2 = compute_blend_v2(frame)
    blend_v3 = compute_blend_v3(frame)
    expensive_quality = (
        frame["roic_proxy_year_z_z"].fillna(0.0)
        + frame["operating_margin_year_z_z"].fillna(0.0)
    ) / 2.0
    expensive_quality = (
        expensive_quality
        + 0.15 * frame["fcf_yield_year_z_z"].fillna(0.0)
        - 0.15 * frame["debt_assets_year_z_z"].fillna(0.0)
    )
    repair_mask = (
        frame["omega_regime"].eq("expensive_compounder")
        & (expensive_quality <= EXPENSIVE_COMPOUNDER_SELECTOR_MAX_QUALITY)
    )
    return blend_v2.where(~repair_mask, blend_v3)


def top_bucket(frame: pd.DataFrame, pred_col: str) -> set[str]:
    ordered = frame.sort_values(pred_col)
    bucket = max(3, len(ordered) // 10)
    return set(ordered.tail(bucket)["ticker"].astype(str))


def crossfit_stage1_predictions(
    train_data: pd.DataFrame,
    feature_cols: list[str],
    numeric_cols: list[str],
    cat_cols: list[str],
    stage1_model_name: str,
    inner_gap_years: int,
) -> pd.Series:
    preds = pd.Series(np.nan, index=train_data.index, dtype=float)
    observed = train_data.loc[train_data["expectation_violation_observed"]].copy()
    years = sorted(train_data["year"].dropna().astype(int).unique())
    for pred_year in years:
        fit = observed.loc[observed["year"] <= pred_year - inner_gap_years].dropna(subset=["expectation_violation_score"]).copy()
        pred_rows = train_data.loc[train_data["year"] == pred_year].copy()
        if len(fit) < 80 or pred_rows.empty:
            continue
        model = make_model(stage1_model_name, active_numeric_cols(fit, numeric_cols), cat_cols)
        model.fit(fit[feature_cols], fit["expectation_violation_score"])
        preds.loc[pred_rows.index] = model.predict(pred_rows[feature_cols])
    return preds


def fit_predict_stage1(
    train_data: pd.DataFrame,
    val_data: pd.DataFrame,
    feature_cols: list[str],
    numeric_cols: list[str],
    cat_cols: list[str],
    stage1_model_name: str,
) -> tuple[pd.Series, pd.Series]:
    stage1_train = crossfit_stage1_predictions(
        train_data,
        feature_cols,
        numeric_cols,
        cat_cols,
        stage1_model_name,
        STAGE1_INNER_GAP_YEARS,
    )
    observed = train_data.loc[train_data["expectation_violation_observed"]].dropna(subset=["expectation_violation_score"]).copy()
    if len(observed) < 80:
        return stage1_train, pd.Series(np.nan, index=val_data.index, dtype=float)
    model = make_model(stage1_model_name, active_numeric_cols(observed, numeric_cols), cat_cols)
    model.fit(observed[feature_cols], observed["expectation_violation_score"])
    stage1_val = pd.Series(model.predict(val_data[feature_cols]), index=val_data.index, dtype=float)
    return stage1_train, stage1_val


def regime_table(scored: pd.DataFrame, pred_col: str, target_col: str) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for regime, sub in scored.groupby("omega_regime"):
        if len(sub) < 30:
            continue
        rows.append(
            {
                "omega_regime": str(regime),
                "rows": int(len(sub)),
                "return_ic": year_spearman(sub, pred_col, "ann_return_3y_fwd", min_rows=6),
                "target_ic": year_spearman(sub, pred_col, target_col, min_rows=6),
                "decile_spread": decile_spread(sub, pred_col, "ann_return_3y_fwd", min_year_rows=10)["mean_spread"],
            }
        )
    return pd.DataFrame(rows).sort_values(["return_ic", "decile_spread"], ascending=False, na_position="last")


def sector_neutral_table(scored: pd.DataFrame, pred_col: str) -> pd.DataFrame:
    neutral = add_sector_neutral_return(scored)
    rows: list[dict[str, Any]] = []
    for year, sub in neutral.groupby("year"):
        if len(sub) < 20:
            continue
        corr = spearmanr(sub[pred_col], sub["sector_neutral_return_3y"], nan_policy="omit").correlation
        rows.append(
            {
                "year": int(year),
                "rows": int(len(sub)),
                "sector_neutral_return_ic": None if pd.isna(corr) else float(corr),
                "sector_neutral_spread": decile_spread(sub, pred_col, "sector_neutral_return_3y", min_year_rows=20)["mean_spread"],
            }
        )
    return pd.DataFrame(rows)


def summarize_predictions(scored: pd.DataFrame, pred_col: str, target_col: str, model_name: str) -> dict[str, Any]:
    spread = decile_spread(scored, pred_col, "ann_return_3y_fwd")
    return {
        "model": model_name,
        "folds": int(scored["year"].nunique()),
        "mean_target_mae": float(mean_absolute_error(scored[target_col], scored[pred_col])),
        "mean_target_ic": year_spearman(scored, pred_col, target_col),
        "mean_return_ic": year_spearman(scored, pred_col, "ann_return_3y_fwd"),
        "mean_decile_spread": spread["mean_spread"],
        "positive_spread_share": spread["positive_share"],
    }


def run_two_stage_experiment(data: pd.DataFrame, stage1_model_name: str, stage2_model_name: str) -> EvalBundle:
    feature_cols, numeric_cols, cat_cols = build_feature_columns(data)
    stage2_rows: list[pd.DataFrame] = []
    baseline_rows: list[pd.DataFrame] = []
    fold_metrics: list[dict[str, Any]] = []
    overlap_rows: list[dict[str, Any]] = []

    for val_year in ROLLING_VAL_YEARS:
        train = data.loc[data["year"] <= (val_year - GAP_YEARS)].copy()
        val = data.loc[data["year"] == val_year].copy()
        train = train.dropna(subset=["research_priority_target", "ann_return_3y_fwd"])
        val = val.dropna(subset=["research_priority_target", "ann_return_3y_fwd"])
        if len(train) < 200 or len(val) < 20:
            continue

        stage1_train_pred, stage1_val_pred = fit_predict_stage1(train, val, feature_cols, numeric_cols, cat_cols, stage1_model_name)

        train_aug = train.copy()
        val_aug = val.copy()
        train_aug["stage1_belief_probe"] = stage1_train_pred
        val_aug["stage1_belief_probe"] = stage1_val_pred

        stage2_train = train_aug.dropna(subset=["stage1_belief_probe", "research_priority_target"]).copy()
        if len(stage2_train) < 80:
            continue

        stage2_feature_cols = feature_cols + ["stage1_belief_probe"]
        stage2_numeric_cols = numeric_cols + ["stage1_belief_probe"]
        stage2_model = make_model(stage2_model_name, active_numeric_cols(stage2_train, stage2_numeric_cols), cat_cols)
        stage2_model.fit(stage2_train[stage2_feature_cols], stage2_train["research_priority_target"])
        val_aug["two_stage_pred"] = stage2_model.predict(val_aug[stage2_feature_cols])

        baseline_model = make_model("hist_gbr", active_numeric_cols(train, numeric_cols), cat_cols)
        baseline_model.fit(train[feature_cols], train["research_priority_target"])
        val_aug["single_stage_hist_gbr"] = baseline_model.predict(val[feature_cols])

        baseline_rf = make_model("rf", active_numeric_cols(train, numeric_cols), cat_cols)
        baseline_rf.fit(train[feature_cols], train["research_priority_target"])
        val_aug["single_stage_rf"] = baseline_rf.predict(val[feature_cols])

        val_aug["formula_baseline"] = formula_baseline(val_aug)
        for z_col in [
            "single_stage_hist_gbr",
            "stage1_belief_probe",
            "omega_expectations_pressure",
            "omega_feasibility_score",
            "implied_duration_score",
            "bottleneck_proxy_year_z",
            "roic_proxy_year_z",
            "operating_margin_year_z",
            "fcf_yield_year_z",
            "debt_assets_year_z",
        ]:
            add_year_zscore(val_aug, z_col)
        val_aug["belief_adjusted_blend"] = (
            (1.0 - BELIEF_BLEND_WEIGHT) * val_aug["single_stage_hist_gbr_z"]
            + BELIEF_BLEND_WEIGHT * val_aug["stage1_belief_probe_z"]
        )
        val_aug["regime_belief_weight"] = val_aug["omega_regime"].map(REGIME_BELIEF_BLEND_WEIGHTS).fillna(BELIEF_BLEND_WEIGHT)
        val_aug["blend_v2"] = compute_blend_v2(val_aug)
        val_aug["blend_v3"] = compute_blend_v3(val_aug)
        val_aug["blend_selector_v1"] = compute_blend_selector_v1(val_aug)
        val_aug["val_year"] = int(val_year)

        stage2_rows.append(
            val_aug[
                [
                    "ticker",
                    "year",
                    "sector",
                    "omega_regime",
                    "ann_return_3y_fwd",
                    "research_priority_target",
                    "stage1_belief_probe",
                    "two_stage_pred",
                    "single_stage_hist_gbr",
                    "single_stage_rf",
                    "belief_adjusted_blend",
                    "blend_v2",
                    "blend_v3",
                    "blend_selector_v1",
                    "regime_belief_weight",
                    "omega_expectations_pressure",
                    "omega_feasibility_score",
                    "implied_duration_score",
                    "bottleneck_proxy_year_z",
                    "roic_proxy_year_z",
                    "operating_margin_year_z",
                    "fcf_yield_year_z",
                    "debt_assets_year_z",
                    "formula_baseline",
                ]
            ].copy()
        )

        for name, pred_col in [
            ("two_stage", "two_stage_pred"),
            ("single_stage_hist_gbr", "single_stage_hist_gbr"),
            ("single_stage_rf", "single_stage_rf"),
            ("belief_adjusted_blend", "belief_adjusted_blend"),
            ("blend_v2", "blend_v2"),
            ("blend_v3", "blend_v3"),
            ("blend_selector_v1", "blend_selector_v1"),
            ("formula_baseline", "formula_baseline"),
        ]:
            scored = val_aug[["ticker", "year", "sector", "omega_regime", "ann_return_3y_fwd", "research_priority_target", pred_col]].copy()
            spread = decile_spread(scored, pred_col, "ann_return_3y_fwd")
            fold_metrics.append(
                {
                    "model": name,
                    "val_year": int(val_year),
                    "train_rows": int(len(train)),
                    "stage2_train_rows": int(len(stage2_train)) if name == "two_stage" else int(len(train)),
                    "val_rows": int(len(val_aug)),
                    "target_mae": float(mean_absolute_error(scored["research_priority_target"], scored[pred_col])),
                    "target_ic": year_spearman(scored, pred_col, "research_priority_target"),
                    "return_ic": year_spearman(scored, pred_col, "ann_return_3y_fwd"),
                    "decile_spread": spread["mean_spread"],
                    "positive_spread_share": spread["positive_share"],
                }
            )

        overlap_rows.append(
            {
                "val_year": int(val_year),
                "two_stage_vs_hist_gbr_jaccard": jaccard(
                    top_bucket(val_aug[["ticker", "two_stage_pred"]].copy(), "two_stage_pred"),
                    top_bucket(val_aug[["ticker", "single_stage_hist_gbr"]].copy(), "single_stage_hist_gbr"),
                ),
                "blend_vs_hist_gbr_jaccard": jaccard(
                    top_bucket(val_aug[["ticker", "belief_adjusted_blend"]].copy(), "belief_adjusted_blend"),
                    top_bucket(val_aug[["ticker", "single_stage_hist_gbr"]].copy(), "single_stage_hist_gbr"),
                ),
                "blend_v2_vs_hist_gbr_jaccard": jaccard(
                    top_bucket(val_aug[["ticker", "blend_v2"]].copy(), "blend_v2"),
                    top_bucket(val_aug[["ticker", "single_stage_hist_gbr"]].copy(), "single_stage_hist_gbr"),
                ),
                "blend_v3_vs_hist_gbr_jaccard": jaccard(
                    top_bucket(val_aug[["ticker", "blend_v3"]].copy(), "blend_v3"),
                    top_bucket(val_aug[["ticker", "single_stage_hist_gbr"]].copy(), "single_stage_hist_gbr"),
                ),
                "blend_selector_v1_vs_hist_gbr_jaccard": jaccard(
                    top_bucket(val_aug[["ticker", "blend_selector_v1"]].copy(), "blend_selector_v1"),
                    top_bucket(val_aug[["ticker", "single_stage_hist_gbr"]].copy(), "single_stage_hist_gbr"),
                ),
                "two_stage_vs_rf_jaccard": jaccard(
                    top_bucket(val_aug[["ticker", "two_stage_pred"]].copy(), "two_stage_pred"),
                    top_bucket(val_aug[["ticker", "single_stage_rf"]].copy(), "single_stage_rf"),
                ),
            }
        )

    predictions = pd.concat(stage2_rows, ignore_index=True) if stage2_rows else pd.DataFrame()
    folds = pd.DataFrame(fold_metrics)
    overlap_table = pd.DataFrame(overlap_rows)

    leaderboard = (
        folds.groupby("model", as_index=False)
        .agg(
            folds=("val_year", "count"),
            mean_target_mae=("target_mae", "mean"),
            mean_target_ic=("target_ic", "mean"),
            mean_return_ic=("return_ic", "mean"),
            mean_decile_spread=("decile_spread", "mean"),
            positive_spread_share=("positive_spread_share", "mean"),
        )
        .sort_values(["mean_return_ic", "mean_decile_spread"], ascending=False)
        .reset_index(drop=True)
        if not folds.empty
        else pd.DataFrame()
    )

    regime_frames = []
    neutral_frames = []
    for name, pred_col in [
        ("two_stage", "two_stage_pred"),
        ("single_stage_hist_gbr", "single_stage_hist_gbr"),
        ("single_stage_rf", "single_stage_rf"),
        ("belief_adjusted_blend", "belief_adjusted_blend"),
        ("blend_v2", "blend_v2"),
        ("blend_v3", "blend_v3"),
        ("blend_selector_v1", "blend_selector_v1"),
        ("formula_baseline", "formula_baseline"),
    ]:
        if predictions.empty:
            continue
        scored = predictions[["ticker", "year", "sector", "omega_regime", "ann_return_3y_fwd", "research_priority_target", pred_col]].copy()
        regime = regime_table(scored, pred_col, "research_priority_target")
        if not regime.empty:
            regime["model"] = name
            regime_frames.append(regime)
        neutral = sector_neutral_table(scored, pred_col)
        if not neutral.empty:
            neutral["model"] = name
            neutral_frames.append(neutral)

    regime_diag = pd.concat(regime_frames, ignore_index=True) if regime_frames else pd.DataFrame()
    sector_diag = pd.concat(neutral_frames, ignore_index=True) if neutral_frames else pd.DataFrame()
    return EvalBundle(
        fold_metrics=folds,
        predictions=predictions,
        leaderboard=leaderboard,
        regime_diagnostics=regime_diag,
        sector_neutral_diagnostics=sector_diag,
        overlap_table=overlap_table,
    )


def jaccard(left: set[str], right: set[str]) -> float:
    union = left | right
    if not union:
        return np.nan
    return float(len(left & right) / len(union))


def write_bundle(bundle: EvalBundle, artifact_dir: Path) -> None:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    bundle.fold_metrics.to_csv(artifact_dir / "two_stage_fold_metrics.csv", index=False)
    bundle.predictions.to_csv(artifact_dir / "two_stage_val_predictions.csv", index=False)
    bundle.leaderboard.to_csv(artifact_dir / "two_stage_leaderboard.csv", index=False)
    bundle.regime_diagnostics.to_csv(artifact_dir / "two_stage_regime_diagnostics.csv", index=False)
    bundle.sector_neutral_diagnostics.to_csv(artifact_dir / "two_stage_sector_neutral_diagnostics.csv", index=False)
    bundle.overlap_table.to_csv(artifact_dir / "two_stage_top_decile_overlap.csv", index=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-path", default=None)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--stage1-model", default="rf", choices=["rf", "hist_gbr", "ridge"])
    parser.add_argument("--stage2-model", default="hist_gbr", choices=["rf", "hist_gbr", "ridge"])
    args = parser.parse_args()

    data = load_dataset(args.dataset_path)
    bundle = run_two_stage_experiment(data, stage1_model_name=args.stage1_model, stage2_model_name=args.stage2_model)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    artifact_dir = Path(args.output_dir) if args.output_dir else ARTIFACT_ROOT / timestamp
    write_bundle(bundle, artifact_dir)
    (ARTIFACT_ROOT / "LATEST.txt").parent.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(artifact_dir), encoding="utf-8")

    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "artifact_dir": str(artifact_dir),
        "stage1_model": args.stage1_model,
        "stage2_model": args.stage2_model,
        "fold_years": ROLLING_VAL_YEARS,
        "gap_years": GAP_YEARS,
        "stage1_inner_gap_years": STAGE1_INNER_GAP_YEARS,
        "belief_blend_weight": BELIEF_BLEND_WEIGHT,
        "regime_belief_blend_weights": REGIME_BELIEF_BLEND_WEIGHTS,
        "blend_v2_policy": {
            "expensive_compounder_penalty": EXPENSIVE_COMPOUNDER_PENALTY,
            "expensive_compounder_feasibility_offset": EXPENSIVE_COMPOUNDER_FEASIBILITY_OFFSET,
            "bottleneck_overlay_weight": BOTTLENECK_OVERLAY_WEIGHT,
        },
        "blend_v3_policy": {
            "expensive_compounder_quality_offset": EXPENSIVE_COMPOUNDER_QUALITY_OFFSET,
            "expensive_compounder_fcf_offset": EXPENSIVE_COMPOUNDER_FCF_OFFSET,
            "expensive_compounder_debt_penalty": EXPENSIVE_COMPOUNDER_DEBT_PENALTY,
        },
        "blend_selector_v1_policy": {
            "base": "blend_v2",
            "guarded_repair": "use blend_v3 for expensive_compounder rows with quality score <= threshold",
            "expensive_compounder_selector_max_quality": EXPENSIVE_COMPOUNDER_SELECTOR_MAX_QUALITY,
            "status": "diagnostic challenger, not production selected",
        },
        "leaderboard": bundle.leaderboard.to_dict(orient="records"),
        "mean_overlap_two_stage_vs_hist_gbr": None if bundle.overlap_table.empty else float(bundle.overlap_table["two_stage_vs_hist_gbr_jaccard"].mean()),
        "mean_overlap_blend_vs_hist_gbr": None if bundle.overlap_table.empty else float(bundle.overlap_table["blend_vs_hist_gbr_jaccard"].mean()),
        "mean_overlap_blend_v2_vs_hist_gbr": None if bundle.overlap_table.empty else float(bundle.overlap_table["blend_v2_vs_hist_gbr_jaccard"].mean()),
        "mean_overlap_blend_v3_vs_hist_gbr": None if bundle.overlap_table.empty else float(bundle.overlap_table["blend_v3_vs_hist_gbr_jaccard"].mean()),
        "mean_overlap_blend_selector_v1_vs_hist_gbr": None if bundle.overlap_table.empty else float(bundle.overlap_table["blend_selector_v1_vs_hist_gbr_jaccard"].mean()),
        "mean_overlap_two_stage_vs_rf": None if bundle.overlap_table.empty else float(bundle.overlap_table["two_stage_vs_rf_jaccard"].mean()),
    }
    (artifact_dir / "two_stage_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
