#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

import run_aurora_factor_null as factor_null
import run_aurora_sec_filing_change_audit as sec_audit


ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_sec_locked_risk_audit"
RETURN_COL = "ann_return_3y_fwd"
LOCKED_SIGNAL = "risk_text_stability"


def residualize_pooled_year_fe(frame: pd.DataFrame, signal: pd.Series, factors: pd.DataFrame) -> pd.Series:
    y = signal.to_numpy(dtype=float)
    finite = np.isfinite(y)
    factor_block = factors.fillna(0.0).to_numpy(dtype=float)
    years = pd.get_dummies(frame["year"].astype(str), prefix="year", drop_first=True, dtype=float)
    x = np.column_stack([factor_block, years.to_numpy(dtype=float)])
    finite &= np.isfinite(x).all(axis=1)
    if finite.sum() < x.shape[1] + 5:
        return pd.Series(np.nan, index=frame.index)
    xf = np.column_stack([np.ones(finite.sum()), x[finite]])
    beta, *_ = np.linalg.lstsq(xf, y[finite], rcond=None)
    resid = np.full(len(frame), np.nan, dtype=float)
    resid[finite] = y[finite] - xf @ beta
    return pd.Series(resid, index=frame.index)


def residualize_within_year(frame: pd.DataFrame, signal: pd.Series, factors: pd.DataFrame) -> pd.Series:
    out = pd.Series(np.nan, index=frame.index, dtype=float)
    for _, idx in frame.groupby("year").groups.items():
        idx = list(idx)
        out.loc[idx] = factor_null.residualize(signal.loc[idx], factors.loc[idx])
    return out


def summarize_signal(frame: pd.DataFrame, signal: pd.Series, seed: int, permutations: int, bootstrap: int) -> dict[str, Any]:
    stats = sec_audit.summarize_signal(frame, signal, RETURN_COL, n_bootstrap=bootstrap, seed=seed)
    perm = sec_audit.permutation_null(frame, signal, n_permutations=permutations, seed=seed)
    return {**stats, **perm, "rows": int(signal.notna().sum())}


def subperiod_rows(frame: pd.DataFrame, signal_cols: list[str], seed: int, permutations: int, bootstrap: int) -> pd.DataFrame:
    rows = []
    periods = {
        "pre_2020": frame["year"] <= 2019,
        "post_2020": frame["year"] >= 2020,
        "all": frame["year"].notna(),
    }
    for period, mask in periods.items():
        part = frame.loc[mask].copy()
        if len(part) < 50:
            continue
        for col in signal_cols:
            rows.append({"period": period, "signal": col, **summarize_signal(part, part[col], seed, permutations, bootstrap)})
    return pd.DataFrame(rows)


def extraction_audit(frame: pd.DataFrame) -> dict[str, Any]:
    risk_chars = pd.to_numeric(frame.get("risk_chars"), errors="coerce")
    out: dict[str, Any] = {
        "rows": int(len(frame)),
        "tickers": int(frame["ticker"].nunique()) if "ticker" in frame else None,
        "risk_chars_zero": int((risk_chars.fillna(0) == 0).sum()),
        "risk_chars_missing": int(risk_chars.isna().sum()),
        "risk_chars_quantiles": {
            str(q): float(risk_chars.quantile(q)) if risk_chars.notna().any() else None
            for q in [0.0, 0.01, 0.05, 0.5, 0.95, 0.99, 1.0]
        },
    }
    audit_cols = ["ticker", "year", "filing_date", "asof_date", "risk_chars", "risk_text_change", "risk_text_stability"]
    have_cols = [c for c in audit_cols if c in frame.columns]
    out["small_risk_examples"] = (
        frame.loc[risk_chars.fillna(0) < 1_000, have_cols]
        .sort_values(["risk_chars", "ticker", "year"], na_position="first")
        .head(25)
        .to_dict(orient="records")
    )
    out["largest_change_examples"] = (
        frame.loc[frame["risk_text_change"].notna(), have_cols]
        .sort_values("risk_text_change", ascending=False)
        .head(25)
        .to_dict(orient="records")
    )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-registered AURORA SEC Risk Factors stability audit")
    parser.add_argument("--merged-input", required=True)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--permutations", type=int, default=1000)
    parser.add_argument("--bootstrap", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=101)
    parser.add_argument("--min-year", type=int, default=None)
    parser.add_argument("--max-year", type=int, default=None)
    args = parser.parse_args()

    frame = pd.read_csv(args.merged_input)
    if args.min_year is not None:
        frame = frame.loc[frame["year"] >= args.min_year].copy()
    if args.max_year is not None:
        frame = frame.loc[frame["year"] <= args.max_year].copy()
    sec_audit.add_directional_signals(frame)
    factors, _, factor_report = factor_null.build_factor_matrix(frame, "year")
    frame["risk_text_stability_resid_within_year"] = residualize_within_year(frame, frame[LOCKED_SIGNAL], factors)
    frame["risk_text_stability_resid_pooled_year_fe"] = residualize_pooled_year_fe(frame, frame[LOCKED_SIGNAL], factors)

    locked_cols = [
        LOCKED_SIGNAL,
        "risk_text_stability_resid_within_year",
        "risk_text_stability_resid_pooled_year_fe",
    ]
    leaderboard = pd.DataFrame(
        [
            {"signal": col, **summarize_signal(frame, frame[col], args.seed, args.permutations, args.bootstrap)}
            for col in locked_cols
        ]
    ).sort_values("mean_return_ic", ascending=False)
    subperiod = subperiod_rows(frame, locked_cols, args.seed + 1, max(100, args.permutations // 4), args.bootstrap)
    audit = extraction_audit(frame)
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "merged_input": str(args.merged_input),
        "locked_hypothesis": "Risk Factors stability is positive. More Risk Factors change is worse.",
        "rows": int(len(frame)),
        "tickers": int(frame["ticker"].nunique()),
        "year_min": int(frame["year"].min()),
        "year_max": int(frame["year"].max()),
        "filter_min_year": args.min_year,
        "filter_max_year": args.max_year,
        "permutations": int(args.permutations),
        "bootstrap": int(args.bootstrap),
        "seed": int(args.seed),
        "factor_report": factor_report,
        "leaderboard": leaderboard.to_dict(orient="records"),
        "extraction_audit": audit,
    }

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.output_dir) if args.output_dir else ARTIFACT_ROOT / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(out_dir / "locked_panel.csv", index=False)
    leaderboard.to_csv(out_dir / "leaderboard.csv", index=False)
    subperiod.to_csv(out_dir / "subperiod.csv", index=False)
    (out_dir / "extraction_audit.json").write_text(json.dumps(audit, indent=2, default=str), encoding="utf-8")
    summary = {**summary, "artifact_dir": str(out_dir)}
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(out_dir), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
