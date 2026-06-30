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

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

import run_aurora_factor_null as factor_null


ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_live_violation_audit"
RETURN_COL = "ann_return_3y_fwd"
EXPOST_COL = "expectation_violation_score"
LIVE_SCORE_COL = "live_base_rate_violation_score"
WEIGHTS = {
    "growth": 0.25,
    "margin": 0.25,
    "roic": 0.25,
    "fcf": 0.15,
    "multiple": 0.10,
}
COMPONENTS = {
    "growth": {
        "realized": "realized_revenue_cagr_3y",
        "implied": "implied_revenue_cagr",
        "conditioners": ["revenue_growth_3y", "roic_proxy"],
    },
    "margin": {
        "realized": "realized_ebit_margin_3y",
        "implied": "implied_terminal_ebit_margin",
        "conditioners": ["operating_margin", "gross_margin"],
    },
    "roic": {
        "realized": "realized_roic_3y",
        "implied": "implied_incremental_roic",
        "conditioners": ["roic_proxy", "debt_assets"],
    },
    "fcf": {
        "realized": "realized_fcf_margin_3y",
        "implied": "fcf_margin",
        "conditioners": ["fcf_margin", "capex_intensity"],
    },
    "multiple": {
        "realized": "realized_multiple_change_3y",
        "implied": None,
        "conditioners": ["ev_to_sales", "revenue_growth_3y"],
    },
}


@dataclass
class LiveViolationBundle:
    fold_metrics: pd.DataFrame
    predictions: pd.DataFrame
    leaderboard: pd.DataFrame
    summary: dict[str, Any]


def year_zscore(s: pd.Series, years: pd.Series) -> pd.Series:
    def _z(block: pd.Series) -> pd.Series:
        block = pd.to_numeric(block, errors="coerce")
        sd = block.std(ddof=0)
        if not np.isfinite(sd) or sd <= 1e-9:
            return pd.Series(0.0, index=block.index)
        return (block - block.mean()) / sd

    return s.groupby(years, group_keys=False).apply(_z)


def make_edges(train: pd.Series, bins: int = 4) -> np.ndarray:
    values = pd.to_numeric(train, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    if len(values) < 20 or values.nunique() < 3:
        return np.array([])
    qs = np.linspace(0, 1, bins + 1)[1:-1]
    edges = np.unique(np.nanquantile(values.to_numpy(dtype=float), qs))
    return edges[np.isfinite(edges)]


def apply_bins(values: pd.Series, edges: np.ndarray) -> pd.Series:
    if len(edges) == 0:
        return pd.Series("all", index=values.index)
    arr = pd.to_numeric(values, errors="coerce").to_numpy(dtype=float)
    labels = np.digitize(arr, edges, right=False).astype(object)
    labels[~np.isfinite(arr)] = "missing"
    return pd.Series(labels, index=values.index).astype(str)


def grouped_base_rate_predict(
    train: pd.DataFrame,
    val: pd.DataFrame,
    target_col: str,
    conditioners: list[str],
    min_group_rows: int = 12,
) -> tuple[pd.Series, pd.Series]:
    usable_conditioners = [col for col in conditioners if col in train.columns and train[col].notna().any()]
    train_work = train.copy()
    val_work = val.copy()
    bin_cols: list[str] = []
    for col in usable_conditioners:
        edges = make_edges(train_work[col])
        bin_col = f"__bin_{col}"
        train_work[bin_col] = apply_bins(train_work[col], edges)
        val_work[bin_col] = apply_bins(val_work[col], edges)
        bin_cols.append(bin_col)

    group_cols = [col for col in ["omega_regime"] + bin_cols if col in train_work.columns]
    train_valid = train_work.dropna(subset=[target_col]).copy()
    global_median = float(train_valid[target_col].median()) if len(train_valid) else np.nan
    regime_medians = train_valid.groupby("omega_regime")[target_col].median().to_dict() if "omega_regime" in train_valid.columns else {}
    sector_medians = train_valid.groupby("sector")[target_col].median().to_dict() if "sector" in train_valid.columns else {}

    grouped: dict[tuple[Any, ...], tuple[float, int]] = {}
    if group_cols:
        counts = train_valid.groupby(group_cols, dropna=False)[target_col].agg(["median", "count"]).reset_index()
        for _, row in counts.iterrows():
            key = tuple(row[col] for col in group_cols)
            grouped[key] = (float(row["median"]), int(row["count"]))

    preds: list[float] = []
    support: list[int] = []
    for idx, row in val_work.iterrows():
        pred = np.nan
        n = 0
        if group_cols:
            key = tuple(row[col] for col in group_cols)
            if key in grouped and grouped[key][1] >= min_group_rows:
                pred, n = grouped[key]
        if not np.isfinite(pred) and "omega_regime" in val_work.columns:
            regime = row.get("omega_regime")
            if regime in regime_medians:
                pred = float(regime_medians[regime])
                n = int((train_valid["omega_regime"] == regime).sum())
        if not np.isfinite(pred) and "sector" in val_work.columns:
            sector = row.get("sector")
            if sector in sector_medians:
                pred = float(sector_medians[sector])
                n = int((train_valid["sector"] == sector).sum())
        if not np.isfinite(pred):
            pred = global_median
            n = int(len(train_valid))
        preds.append(pred)
        support.append(n)

    return pd.Series(preds, index=val.index, dtype=float), pd.Series(support, index=val.index, dtype=float)


def build_live_violation_for_fold(train: pd.DataFrame, val: pd.DataFrame) -> pd.DataFrame:
    out = val.copy()
    supports = []
    for name, spec in COMPONENTS.items():
        pred_col = f"base_rate_{name}"
        support_col = f"base_rate_{name}_support"
        pred, support = grouped_base_rate_predict(train, val, spec["realized"], spec["conditioners"])
        out[pred_col] = pred
        out[support_col] = support
        supports.append(support_col)
        if name == "multiple":
            out[f"live_{name}_gap"] = -out[pred_col]
        else:
            implied_col = spec["implied"]
            out[f"live_{name}_gap"] = out[pred_col] - out[implied_col]

    score = pd.Series(0.0, index=out.index)
    for name, weight in WEIGHTS.items():
        z = year_zscore(out[f"live_{name}_gap"], out["year"]).fillna(0.0)
        out[f"live_{name}_gap_z"] = z
        score = score + weight * z
    out[LIVE_SCORE_COL] = score
    out["live_base_rate_support_min"] = out[supports].min(axis=1)
    out["live_base_rate_support_mean"] = out[supports].mean(axis=1)
    return out


def eval_col(frame: pd.DataFrame, model: str, pred_col: str) -> dict[str, Any]:
    return {
        "model": model,
        "folds": int(frame[["year", pred_col]].dropna().groupby("year").ngroups),
        "mean_return_ic": factor_null.summarize(
            factor_null.eval_static_signal(frame, "year", RETURN_COL, "sector" if "sector" in frame.columns else None, frame[pred_col])
        )["mean_ic"],
        "mean_return_spread": factor_null.summarize(
            factor_null.eval_static_signal(frame, "year", RETURN_COL, "sector" if "sector" in frame.columns else None, frame[pred_col])
        )["mean_spread"],
        "positive_return_spread_share": factor_null.summarize(
            factor_null.eval_static_signal(frame, "year", RETURN_COL, "sector" if "sector" in frame.columns else None, frame[pred_col])
        )["pos_spread"],
        "mean_sector_neutral_return_ic": factor_null.summarize(
            factor_null.eval_static_signal(frame, "year", RETURN_COL, "sector" if "sector" in frame.columns else None, frame[pred_col])
        )["mean_sn_ic"],
        "mean_expost_violation_ic": factor_null.summarize(
            factor_null.eval_static_signal(frame, "year", EXPOST_COL, "sector" if "sector" in frame.columns else None, frame[pred_col])
        )["mean_ic"] if EXPOST_COL in frame.columns else np.nan,
    }


def run_audit(data: pd.DataFrame, ranker_pred_file: str | None) -> LiveViolationBundle:
    data = data.copy().reset_index(drop=True)
    data["year"] = data["year"].astype(int)
    factors, factor_composite, factor_report = factor_null.build_factor_matrix(data, "year")
    data["factor_composite"] = factor_composite

    ranker_pred = factor_null.read_table(Path(ranker_pred_file)) if ranker_pred_file and Path(ranker_pred_file).exists() else None
    fold_frames: list[pd.DataFrame] = []
    fold_metrics: list[dict[str, Any]] = []
    years = data["year"].to_numpy()
    for val_year, train_mask, val_mask in factor_null.fold_masks(years):
        train = data.loc[train_mask & data["expectation_violation_observed"].fillna(False)].copy()
        val = data.loc[val_mask].copy()
        if len(train) < 80 or val.empty:
            continue
        scored = build_live_violation_for_fold(train, val)
        scored["factor_composite"] = val["factor_composite"]
        factor_train = train.dropna(subset=[RETURN_COL]).copy()
        factor_train_idx = factor_train.index.to_numpy()
        factor_val_idx = val.index.to_numpy()
        factor_model = factor_null.HistGradientBoostingRegressor(
            max_depth=3,
            max_iter=300,
            learning_rate=0.05,
            l2_regularization=1.0,
            min_samples_leaf=20,
            random_state=0,
        )
        factor_model.fit(factors.loc[factor_train_idx].fillna(0.0), factor_train[RETURN_COL])
        scored["factor_hist_gbr"] = factor_model.predict(factors.loc[factor_val_idx].fillna(0.0))

        for pred_col in [LIVE_SCORE_COL, "factor_composite", "factor_hist_gbr", EXPOST_COL]:
            if pred_col in scored.columns:
                scored[f"{pred_col}_resid"] = factor_null.residualize(scored[pred_col], factors.loc[factor_val_idx])

        if ranker_pred is not None:
            year_pred = ranker_pred.loc[ranker_pred["year"].astype(int).eq(int(val_year))].copy()
            for col in ["blend_v2", "blend_selector_v1"]:
                if col in year_pred.columns:
                    merged = scored[["ticker", "year"]].merge(year_pred[["ticker", "year", col]], on=["ticker", "year"], how="left")
                    scored[col] = merged[col].to_numpy()
                    scored[f"{col}_resid"] = factor_null.residualize(scored[col], factors.loc[factor_val_idx])

        scored["val_year"] = int(val_year)
        fold_frames.append(scored)
        for col in [
            LIVE_SCORE_COL,
            f"{LIVE_SCORE_COL}_resid",
            "factor_composite",
            "factor_hist_gbr",
            EXPOST_COL,
            f"{EXPOST_COL}_resid",
            "blend_v2",
            "blend_v2_resid",
            "blend_selector_v1",
            "blend_selector_v1_resid",
        ]:
            if col in scored.columns:
                row = eval_col(scored, col, col)
                row["val_year"] = int(val_year)
                fold_metrics.append(row)

    predictions = pd.concat(fold_frames, ignore_index=True) if fold_frames else pd.DataFrame()
    fold_df = pd.DataFrame(fold_metrics)
    leaderboard = (
        fold_df.groupby("model", as_index=False)
        .agg(
            folds=("mean_return_ic", "count"),
            mean_return_ic=("mean_return_ic", "mean"),
            sd_return_ic=("mean_return_ic", "std"),
            mean_return_spread=("mean_return_spread", "mean"),
            positive_return_spread_share=("positive_return_spread_share", "mean"),
            mean_sector_neutral_return_ic=("mean_sector_neutral_return_ic", "mean"),
            mean_expost_violation_ic=("mean_expost_violation_ic", "mean"),
        )
        .sort_values(["mean_return_ic", "mean_return_spread"], ascending=False)
        .reset_index(drop=True)
        if not fold_df.empty
        else pd.DataFrame()
    )
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset_rows": int(len(data)),
        "factor_count": int(factors.shape[1]),
        "factor_report": [
            {"name": name, "column": col, "coverage": None if pd.isna(cov) else float(cov)}
            for name, col, cov in factor_report
        ],
        "live_score": LIVE_SCORE_COL,
        "return_col": RETURN_COL,
        "expost_ceiling": EXPOST_COL,
        "components": COMPONENTS,
        "weights": WEIGHTS,
    }
    return LiveViolationBundle(fold_df, predictions, leaderboard, summary)


def write_bundle(bundle: LiveViolationBundle, artifact_dir: Path) -> None:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    bundle.fold_metrics.to_csv(artifact_dir / "fold_metrics.csv", index=False)
    bundle.predictions.to_csv(artifact_dir / "val_predictions.csv", index=False)
    bundle.leaderboard.to_csv(artifact_dir / "leaderboard.csv", index=False)
    summary = {**bundle.summary, "artifact_dir": str(artifact_dir), "leaderboard": bundle.leaderboard.to_dict(orient="records")}
    (artifact_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="AURORA live no-look-ahead violation audit")
    parser.add_argument("--dataset", default=str(factor_null.DEFAULT_DATASET_PARQUET))
    parser.add_argument("--ranker-pred-file", default=str(factor_null.DEFAULT_RANKER_PRED_FILE))
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()
    dataset = Path(args.dataset)
    if not dataset.exists():
        raise FileNotFoundError(dataset)
    pred_file = args.ranker_pred_file if args.ranker_pred_file and Path(args.ranker_pred_file).exists() else None
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
