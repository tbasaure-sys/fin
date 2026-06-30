#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

import run_aurora_factor_null as factor_null
import run_aurora_omega_two_stage_ranker as omega_ranker


ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_factor_orthogonal_audit"
TARGET_COL = "research_priority_target"
ORTH_TARGET_COL = "research_priority_target_factor_resid"
BELIEF_TARGET_COL = "expectation_violation_score"
RETURN_COL = "ann_return_3y_fwd"


@dataclass
class AuditBundle:
    fold_metrics: pd.DataFrame
    predictions: pd.DataFrame
    leaderboard: pd.DataFrame
    factor_report: list[tuple[str, str | None, float]]
    summary: dict[str, Any]


def residualize_by_year(target: pd.Series, factors: pd.DataFrame, years: pd.Series) -> pd.Series:
    resid = pd.Series(np.nan, index=target.index, dtype=float)
    for _, idx in years.groupby(years).groups.items():
        idx = list(idx)
        resid.loc[idx] = factor_null.residualize(target.loc[idx].to_numpy(dtype=float), factors.loc[idx])
    return resid


def make_factor_gbr() -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        max_depth=3,
        max_iter=300,
        learning_rate=0.05,
        l2_regularization=1.0,
        min_samples_leaf=20,
        random_state=0,
    )


def decile_spread_for(frame: pd.DataFrame, pred_col: str, target_col: str) -> float:
    rows = factor_null.eval_static_signal(frame, "year", target_col, "sector" if "sector" in frame.columns else None, frame[pred_col])
    return factor_null.summarize(rows)["mean_spread"]


def score_prediction_frame(scored: pd.DataFrame, model_name: str, pred_col: str, val_year: int) -> dict[str, Any]:
    out = {
        "model": model_name,
        "val_year": int(val_year),
        "rows": int(scored[pred_col].notna().sum()),
        "return_ic": factor_null.ic(scored[pred_col], scored[RETURN_COL]),
        "return_spread": factor_null.decile_spread(scored[pred_col], scored[RETURN_COL]),
        "sector_neutral_return_ic": factor_null.sector_neutral_ic(
            scored[pred_col],
            scored[RETURN_COL],
            scored["sector"] if "sector" in scored.columns else None,
        ),
        "belief_ic": factor_null.ic(scored[pred_col], scored[BELIEF_TARGET_COL]) if BELIEF_TARGET_COL in scored.columns else np.nan,
        "orth_target_ic": factor_null.ic(scored[pred_col], scored[ORTH_TARGET_COL]) if ORTH_TARGET_COL in scored.columns else np.nan,
    }
    if BELIEF_TARGET_COL in scored.columns:
        out["belief_spread"] = factor_null.decile_spread(scored[pred_col], scored[BELIEF_TARGET_COL])
    else:
        out["belief_spread"] = np.nan
    return out


def summarize_leaderboard(metrics: pd.DataFrame) -> pd.DataFrame:
    if metrics.empty:
        return pd.DataFrame()
    return (
        metrics.groupby("model", as_index=False)
        .agg(
            folds=("val_year", "count"),
            mean_return_ic=("return_ic", "mean"),
            sd_return_ic=("return_ic", "std"),
            mean_return_spread=("return_spread", "mean"),
            positive_return_spread_share=("return_spread", lambda s: float((s > 0).mean())),
            mean_sector_neutral_return_ic=("sector_neutral_return_ic", "mean"),
            mean_belief_ic=("belief_ic", "mean"),
            mean_belief_spread=("belief_spread", "mean"),
            mean_orth_target_ic=("orth_target_ic", "mean"),
        )
        .sort_values(["mean_return_ic", "mean_return_spread"], ascending=False)
        .reset_index(drop=True)
    )


def add_posthoc_residual(pred: pd.Series, factors: pd.DataFrame, years: pd.Series) -> pd.Series:
    return residualize_by_year(pred, factors, years)


def non_factor_feature_columns(
    feature_cols: list[str],
    numeric_cols: list[str],
    cat_cols: list[str],
    factor_report: list[tuple[str, str | None, float]],
) -> tuple[list[str], list[str], list[str]]:
    factor_cols: set[str] = set()
    for _, col, cov in factor_report:
        if col is None or cov <= 0.0:
            continue
        clean_col = col.replace(" (empty)", "")
        factor_cols.add(clean_col)
        if clean_col.endswith("_year_z"):
            factor_cols.add(clean_col.removesuffix("_year_z"))
        if clean_col.endswith("_sector_z"):
            factor_cols.add(clean_col.removesuffix("_sector_z"))
    expanded: set[str] = set()
    for col in factor_cols:
        expanded.add(col)
        expanded.add(f"{col}_year_z")
        expanded.add(f"{col}_sector_z")
    out_features = [col for col in feature_cols if col not in expanded]
    return (
        out_features,
        [col for col in numeric_cols if col in out_features],
        [col for col in cat_cols if col in out_features],
    )


def run_audit(data: pd.DataFrame, existing_pred_file: str | None) -> AuditBundle:
    data = data.copy().reset_index(drop=True)
    data["year"] = data["year"].astype(int)
    factors, factor_composite, factor_report = factor_null.build_factor_matrix(data, "year")
    data[ORTH_TARGET_COL] = residualize_by_year(data[TARGET_COL], factors, data["year"])
    data["factor_composite"] = factor_composite

    feature_cols, numeric_cols, cat_cols = omega_ranker.build_feature_columns(data)
    leaked_feature_cols = {ORTH_TARGET_COL}
    feature_cols = [col for col in feature_cols if col not in leaked_feature_cols and not col.endswith("_factor_resid")]
    numeric_cols = [col for col in numeric_cols if col in feature_cols]
    cat_cols = [col for col in cat_cols if col in feature_cols]
    non_factor_features, non_factor_numeric, non_factor_cat = non_factor_feature_columns(
        feature_cols,
        numeric_cols,
        cat_cols,
        factor_report,
    )
    pred_lookup = None
    if existing_pred_file:
        pred_lookup = factor_null.read_table(Path(existing_pred_file))

    rows: list[dict[str, Any]] = []
    pred_rows: list[pd.DataFrame] = []
    for val_year, train_mask, val_mask in factor_null.fold_masks(data["year"].to_numpy()):
        train = data.loc[train_mask].dropna(subset=[RETURN_COL, TARGET_COL, ORTH_TARGET_COL]).copy()
        val = data.loc[val_mask].dropna(subset=[RETURN_COL]).copy()
        if len(train) < 80 or val.empty:
            continue

        raw_model = omega_ranker.make_model("hist_gbr", omega_ranker.active_numeric_cols(train, numeric_cols), cat_cols)
        raw_model.fit(train[feature_cols], train[TARGET_COL])

        orth_model = omega_ranker.make_model("hist_gbr", omega_ranker.active_numeric_cols(train, numeric_cols), cat_cols)
        orth_model.fit(train[feature_cols], train[ORTH_TARGET_COL])

        orth_no_factor_model = omega_ranker.make_model(
            "hist_gbr",
            omega_ranker.active_numeric_cols(train, non_factor_numeric),
            non_factor_cat,
        )
        orth_no_factor_model.fit(train[non_factor_features], train[ORTH_TARGET_COL])

        factor_train_idx = train.index.to_numpy()
        factor_val_idx = val.index.to_numpy()
        factor_model = make_factor_gbr()
        factor_model.fit(factors.loc[factor_train_idx].fillna(0.0), train[RETURN_COL])

        scored = val[
            [
                "ticker",
                "year",
                "sector",
                "omega_regime",
                RETURN_COL,
                TARGET_COL,
                ORTH_TARGET_COL,
                BELIEF_TARGET_COL,
            ]
        ].copy()
        scored["factor_composite"] = val["factor_composite"]
        scored["factor_hist_gbr"] = factor_model.predict(factors.loc[factor_val_idx].fillna(0.0))
        scored["raw_target_hist_gbr"] = raw_model.predict(val[feature_cols])
        scored["orth_target_hist_gbr"] = orth_model.predict(val[feature_cols])
        scored["orth_target_no_factor_hist_gbr"] = orth_no_factor_model.predict(val[non_factor_features])
        scored["raw_target_hist_gbr_resid"] = add_posthoc_residual(scored["raw_target_hist_gbr"], factors.loc[factor_val_idx], scored["year"])
        scored["orth_target_hist_gbr_resid"] = add_posthoc_residual(scored["orth_target_hist_gbr"], factors.loc[factor_val_idx], scored["year"])
        scored["orth_target_no_factor_hist_gbr_resid"] = add_posthoc_residual(
            scored["orth_target_no_factor_hist_gbr"],
            factors.loc[factor_val_idx],
            scored["year"],
        )

        if pred_lookup is not None:
            year_pred = pred_lookup.loc[pred_lookup["year"].astype(int).eq(int(val_year))].copy()
            for col in ["blend_v2", "blend_selector_v1"]:
                if col in year_pred.columns:
                    merged = scored[["ticker", "year"]].merge(year_pred[["ticker", "year", col]], on=["ticker", "year"], how="left")
                    scored[col] = merged[col].to_numpy()
                    scored[f"{col}_resid"] = add_posthoc_residual(scored[col], factors.loc[factor_val_idx], scored["year"])

        scored["val_year"] = int(val_year)
        pred_rows.append(scored)

        model_cols = [
            "factor_composite",
            "factor_hist_gbr",
            "raw_target_hist_gbr",
            "raw_target_hist_gbr_resid",
            "orth_target_hist_gbr",
            "orth_target_hist_gbr_resid",
            "orth_target_no_factor_hist_gbr",
            "orth_target_no_factor_hist_gbr_resid",
        ]
        if "blend_v2" in scored.columns:
            model_cols.extend(["blend_v2", "blend_v2_resid"])
        if "blend_selector_v1" in scored.columns:
            model_cols.extend(["blend_selector_v1", "blend_selector_v1_resid"])

        for model_col in model_cols:
            rows.append(score_prediction_frame(scored, model_col, model_col, int(val_year)))

    metrics = pd.DataFrame(rows)
    predictions = pd.concat(pred_rows, ignore_index=True) if pred_rows else pd.DataFrame()
    leaderboard = summarize_leaderboard(metrics)
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_rows": int(len(data)),
        "factor_count": int(factors.shape[1]),
        "factor_report": [
            {"name": name, "column": col, "coverage": None if pd.isna(cov) else float(cov)}
            for name, col, cov in factor_report
        ],
        "target": TARGET_COL,
        "orthogonal_target": ORTH_TARGET_COL,
        "return_col": RETURN_COL,
        "belief_target_col": BELIEF_TARGET_COL,
        "feature_count": int(len(feature_cols)),
        "non_factor_feature_count": int(len(non_factor_features)),
    }
    return AuditBundle(metrics, predictions, leaderboard, factor_report, summary)


def write_bundle(bundle: AuditBundle, artifact_dir: Path) -> None:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    bundle.fold_metrics.to_csv(artifact_dir / "fold_metrics.csv", index=False)
    bundle.predictions.to_csv(artifact_dir / "val_predictions.csv", index=False)
    bundle.leaderboard.to_csv(artifact_dir / "leaderboard.csv", index=False)
    summary = {**bundle.summary, "leaderboard": bundle.leaderboard.to_dict(orient="records"), "artifact_dir": str(artifact_dir)}
    (artifact_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="AURORA factor-orthogonal target audit")
    parser.add_argument("--dataset", default=str(factor_null.DEFAULT_DATASET_PARQUET))
    parser.add_argument("--existing-pred-file", default=str(factor_null.DEFAULT_RANKER_PRED_FILE))
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()

    dataset = Path(args.dataset)
    if not dataset.exists():
        raise FileNotFoundError(dataset)
    pred_file = args.existing_pred_file if args.existing_pred_file and Path(args.existing_pred_file).exists() else None
    data = pd.read_parquet(dataset)
    bundle = run_audit(data, pred_file)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    artifact_dir = Path(args.output_dir) if args.output_dir else ARTIFACT_ROOT / timestamp
    write_bundle(bundle, artifact_dir)
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(artifact_dir), encoding="utf-8")

    print(json.dumps({**bundle.summary, "artifact_dir": str(artifact_dir), "leaderboard": bundle.leaderboard.to_dict(orient="records")}, indent=2, default=str))


if __name__ == "__main__":
    main()
