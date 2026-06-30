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
import run_aurora_sec_locked_risk_audit as locked_risk


ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_sec_peer_relative_audit"
RETURN_COL = "ann_return_3y_fwd"


def peer_zscore(frame: pd.DataFrame, col: str, group_cols: list[str], min_group: int) -> pd.Series:
    def _z(s: pd.Series) -> pd.Series:
        valid = s.dropna()
        if len(valid) < min_group:
            return pd.Series(np.nan, index=s.index)
        sd = valid.std(ddof=0)
        if not np.isfinite(sd) or sd <= 1e-12:
            return pd.Series(np.nan, index=s.index)
        return (s - valid.mean()) / sd

    return frame.groupby(group_cols, group_keys=False)[col].apply(_z)


def summarize(frame: pd.DataFrame, signal_cols: list[str], seed: int, permutations: int, bootstrap: int) -> pd.DataFrame:
    factors, _, factor_report = factor_null.build_factor_matrix(frame, "year")
    frame["risk_text_stability_peer_z_resid_within_year"] = locked_risk.residualize_within_year(
        frame, frame["risk_text_stability_peer_z"], factors
    )
    frame["risk_text_stability_peer_z_resid_pooled_year_fe"] = locked_risk.residualize_pooled_year_fe(
        frame, frame["risk_text_stability_peer_z"], factors
    )
    rows = []
    for col in signal_cols:
        rows.append(
            {
                "signal": col,
                **sec_audit.summarize_signal(frame, frame[col], RETURN_COL, n_bootstrap=bootstrap, seed=seed),
                **sec_audit.permutation_null(frame, frame[col], n_permutations=permutations, seed=seed),
                "rows": int(frame[col].notna().sum()),
            }
        )
    out = pd.DataFrame(rows).sort_values("mean_return_ic", ascending=False)
    out.attrs["factor_report"] = factor_report
    return out


def run(args: argparse.Namespace) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    frame = pd.read_csv(args.merged_input)
    if args.min_year is not None:
        frame = frame.loc[frame["year"] >= args.min_year].copy()
    if args.max_year is not None:
        frame = frame.loc[frame["year"] <= args.max_year].copy()
    sec_audit.add_directional_signals(frame)
    if "sector" not in frame.columns:
        raise RuntimeError("Merged panel must include sector for peer-relative audit")
    frame["sector_clean"] = frame["sector"].fillna("Unknown").astype(str)
    frame["risk_text_stability_peer_z"] = peer_zscore(
        frame, "risk_text_stability", ["year", "sector_clean"], min_group=args.min_peer_group
    )
    frame["risk_text_change_peer_z"] = -frame["risk_text_stability_peer_z"]

    signals = [
        "risk_text_stability_peer_z",
        "risk_text_stability_peer_z_resid_within_year",
        "risk_text_stability_peer_z_resid_pooled_year_fe",
    ]
    leaderboard = summarize(frame, signals, args.seed, args.permutations, args.bootstrap)

    subperiod_rows = []
    for label, mask in {
        "pre_2020": frame["year"] <= 2019,
        "post_2020": frame["year"] >= 2020,
        "all": frame["year"].notna(),
    }.items():
        part = frame.loc[mask].copy()
        if len(part) < 50:
            continue
        part_leader = summarize(part, signals, args.seed + 7, max(100, args.permutations // 4), args.bootstrap)
        part_leader.insert(0, "period", label)
        subperiod_rows.append(part_leader)
    subperiod = pd.concat(subperiod_rows, ignore_index=True) if subperiod_rows else pd.DataFrame()

    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "merged_input": str(args.merged_input),
        "locked_hypothesis": "Company-specific Risk Factors stability versus sector-year peers is positive.",
        "rows": int(len(frame)),
        "tickers": int(frame["ticker"].nunique()),
        "year_min": int(frame["year"].min()),
        "year_max": int(frame["year"].max()),
        "filter_min_year": args.min_year,
        "filter_max_year": args.max_year,
        "min_peer_group": int(args.min_peer_group),
        "peer_signal_rows": int(frame["risk_text_stability_peer_z"].notna().sum()),
        "permutations": int(args.permutations),
        "bootstrap": int(args.bootstrap),
        "seed": int(args.seed),
        "factor_report": leaderboard.attrs.get("factor_report", []),
        "leaderboard": leaderboard.to_dict(orient="records"),
    }
    return frame, leaderboard, subperiod, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="AURORA SEC peer-relative Risk Factors stability audit")
    parser.add_argument("--merged-input", required=True)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--min-year", type=int, default=None)
    parser.add_argument("--max-year", type=int, default=None)
    parser.add_argument("--min-peer-group", type=int, default=5)
    parser.add_argument("--permutations", type=int, default=1000)
    parser.add_argument("--bootstrap", type=int, default=3000)
    parser.add_argument("--seed", type=int, default=301)
    args = parser.parse_args()

    frame, leaderboard, subperiod, summary = run(args)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.output_dir) if args.output_dir else ARTIFACT_ROOT / timestamp
    out_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(out_dir / "peer_relative_panel.csv", index=False)
    leaderboard.to_csv(out_dir / "leaderboard.csv", index=False)
    subperiod.to_csv(out_dir / "subperiod.csv", index=False)
    summary = {**summary, "artifact_dir": str(out_dir)}
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(out_dir), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
