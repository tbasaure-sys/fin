#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

import run_aurora_factor_null as factor_null
import run_aurora_sec_filing_change_audit as sec_audit
import run_aurora_sec_locked_risk_audit as locked_risk


ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_analyst_revision_target_audit"
CACHE_ROOT = ROOT / "artifacts" / "aurora_revision_cache" / "fmp_grades_historical"
FMP_STABLE = "https://financialmodelingprep.com/stable"
RETURN_COL = "ann_return_3y_fwd"
DEFAULT_SIGNAL = "risk_text_stability"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def require_fmp_key() -> str:
    load_env_file(ROOT / ".env.local")
    key = os.environ.get("FMP_API_KEY") or os.environ.get("FINANCIAL_MODELING_PREP_API_KEY")
    if not key:
        raise RuntimeError(
            "FMP_API_KEY or FINANCIAL_MODELING_PREP_API_KEY is required for analyst revision targets."
        )
    return key


def fmp_grades_history(symbol: str, api_key: str, pause: float, force_refresh: bool) -> list[dict[str, Any]]:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_ROOT / f"{symbol.upper().replace('/', '_')}.json"
    if cache_path.exists() and not force_refresh:
        try:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, list) else []
        except Exception:
            pass

    response = requests.get(
        f"{FMP_STABLE}/grades-historical",
        params={"symbol": symbol, "apikey": api_key},
        timeout=30,
    )
    if pause > 0:
        time.sleep(pause)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        payload = []
    cache_path.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def rating_score(row: pd.Series) -> float:
    counts = {
        "analystRatingsStrongBuy": 2.0,
        "analystRatingsBuy": 1.0,
        "analystRatingsHold": 0.0,
        "analystRatingsSell": -1.0,
        "analystRatingsStrongSell": -2.0,
    }
    total = 0.0
    weighted = 0.0
    for col, weight in counts.items():
        value = pd.to_numeric(row.get(col), errors="coerce")
        if pd.notna(value) and value > 0:
            total += float(value)
            weighted += float(value) * weight
    if total <= 0:
        return np.nan
    return weighted / total


def history_frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame(columns=["date", "rating_score", "analyst_count"])
    hist = pd.DataFrame(rows).copy()
    hist["date"] = pd.to_datetime(hist.get("date"), errors="coerce").dt.tz_localize(None)
    rating_cols = [
        "analystRatingsStrongBuy",
        "analystRatingsBuy",
        "analystRatingsHold",
        "analystRatingsSell",
        "analystRatingsStrongSell",
    ]
    for col in rating_cols:
        hist[col] = pd.to_numeric(hist.get(col), errors="coerce")
    hist["rating_score"] = hist.apply(rating_score, axis=1)
    hist["analyst_count"] = hist[rating_cols].fillna(0).sum(axis=1)
    hist = hist.dropna(subset=["date", "rating_score"]).sort_values("date")
    return hist


def score_at_or_before(hist: pd.DataFrame, date: pd.Timestamp, max_stale_days: int) -> tuple[float, pd.Timestamp | None]:
    if hist.empty or pd.isna(date):
        return np.nan, None
    before = hist.loc[hist["date"] <= date].copy()
    if before.empty:
        return np.nan, None
    row = before.iloc[-1]
    if (date - row["date"]).days > max_stale_days:
        return np.nan, None
    return float(row["rating_score"]), row["date"]


def score_at_or_after(hist: pd.DataFrame, date: pd.Timestamp, max_forward_days: int) -> tuple[float, pd.Timestamp | None]:
    if hist.empty or pd.isna(date):
        return np.nan, None
    after = hist.loc[hist["date"] >= date].copy()
    if after.empty:
        return np.nan, None
    row = after.iloc[0]
    if (row["date"] - date).days > max_forward_days:
        return np.nan, None
    return float(row["rating_score"]), row["date"]


def attach_revision_targets(
    frame: pd.DataFrame,
    histories: dict[str, pd.DataFrame],
    window_days: int,
    max_stale_days: int,
) -> pd.DataFrame:
    out = frame.copy()
    asof = pd.to_datetime(out.get("filing_date", out.get("asof_date")), errors="coerce").dt.tz_localize(None)
    if asof.isna().all() and "asof_date" in out:
        asof = pd.to_datetime(out["asof_date"], errors="coerce").dt.tz_localize(None)
    out["revision_asof_date"] = asof
    pre_scores: list[float] = []
    post_scores: list[float] = []
    pre_dates: list[str | None] = []
    post_dates: list[str | None] = []
    for _, row in out.iterrows():
        hist = histories.get(str(row["ticker"]).upper(), pd.DataFrame())
        date = row["revision_asof_date"]
        pre, pre_date = score_at_or_before(hist, date, max_stale_days=max_stale_days)
        post, post_date = score_at_or_after(
            hist, date + pd.Timedelta(days=window_days), max_forward_days=max(45, window_days // 2)
        )
        pre_scores.append(pre)
        post_scores.append(post)
        pre_dates.append(pre_date.date().isoformat() if pre_date is not None else None)
        post_dates.append(post_date.date().isoformat() if post_date is not None else None)
    out["analyst_rating_score_pre"] = pre_scores
    out["analyst_rating_score_post"] = post_scores
    out["analyst_rating_pre_date"] = pre_dates
    out["analyst_rating_post_date"] = post_dates
    out[f"analyst_rating_revision_{window_days}d"] = (
        out["analyst_rating_score_post"] - out["analyst_rating_score_pre"]
    )
    return out


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


def summarize_against_target(
    frame: pd.DataFrame,
    signal: pd.Series,
    target_col: str,
    permutations: int,
    bootstrap: int,
    seed: int,
) -> dict[str, Any]:
    stats = sec_audit.summarize_signal(frame, signal, target_col, n_bootstrap=bootstrap, seed=seed)
    perm = permutation_null_for_target(frame, signal, target_col, n_permutations=permutations, seed=seed)
    return {**stats, **perm, "rows": int(signal.notna().sum())}


def permutation_null_for_target(
    frame: pd.DataFrame,
    signal: pd.Series,
    target_col: str,
    n_permutations: int,
    seed: int,
) -> dict[str, float]:
    if n_permutations <= 0:
        return {"perm_mean_ic": np.nan, "perm_sd_ic": np.nan, "perm_p_abs": np.nan}
    obs = mean_yearly_spearman(frame, signal, frame[target_col])
    vals: list[float] = []
    rng = np.random.default_rng(seed)
    year_groups = [frame.index.get_indexer(list(idx)) for _, idx in frame.groupby("year", sort=False).groups.items()]
    target_values = frame[target_col].to_numpy(dtype=float)
    for _ in range(n_permutations):
        permuted_values = target_values.copy()
        for idx in year_groups:
            values = permuted_values[idx].copy()
            finite = np.isfinite(values)
            values[finite] = rng.permutation(values[finite])
            permuted_values[idx] = values
        vals.append(mean_yearly_spearman(frame, signal, pd.Series(permuted_values, index=frame.index)))
    arr = np.array(vals, dtype=float)
    arr = arr[np.isfinite(arr)]
    if not len(arr) or not np.isfinite(obs):
        return {"perm_mean_ic": np.nan, "perm_sd_ic": np.nan, "perm_p_abs": np.nan}
    return {
        "perm_mean_ic": float(arr.mean()),
        "perm_sd_ic": float(arr.std(ddof=1)) if len(arr) > 1 else np.nan,
        "perm_p_abs": float((np.sum(np.abs(arr) >= abs(obs)) + 1) / (len(arr) + 1)),
    }


def mean_yearly_spearman(frame: pd.DataFrame, signal: pd.Series, target: pd.Series) -> float:
    ics: list[float] = []
    for _, idx in frame.groupby("year", sort=False).groups.items():
        s = signal.loc[idx]
        t = target.loc[idx]
        mask = s.notna() & t.notna()
        if mask.sum() < 8:
            continue
        ic = s.loc[mask].rank().corr(t.loc[mask].rank())
        if pd.notna(ic):
            ics.append(float(ic))
    return float(np.mean(ics)) if ics else np.nan


def run(args: argparse.Namespace) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    api_key = require_fmp_key()
    frame = pd.read_csv(args.merged_input)
    if args.min_year is not None:
        frame = frame.loc[frame["year"] >= args.min_year].copy()
    if args.max_year is not None:
        frame = frame.loc[frame["year"] <= args.max_year].copy()
    if args.max_tickers is not None:
        keep = sorted(frame["ticker"].dropna().astype(str).unique())[: args.max_tickers]
        frame = frame.loc[frame["ticker"].astype(str).isin(keep)].copy()
    sec_audit.add_directional_signals(frame)
    frame["sector_clean"] = frame.get("sector", pd.Series("Unknown", index=frame.index)).fillna("Unknown").astype(str)
    frame["risk_text_stability_peer_z"] = peer_zscore(
        frame, "risk_text_stability", ["year", "sector_clean"], min_group=args.min_peer_group
    )

    histories: dict[str, pd.DataFrame] = {}
    endpoint_errors: list[dict[str, Any]] = []
    tickers = sorted(frame["ticker"].dropna().astype(str).unique())
    for i, ticker in enumerate(tickers, start=1):
        try:
            rows = fmp_grades_history(ticker, api_key, pause=args.pause, force_refresh=args.force_refresh)
            histories[ticker.upper()] = history_frame(rows)
        except Exception as exc:
            endpoint_errors.append({"ticker": ticker, "error": repr(exc)})
        if args.progress_every and (i % args.progress_every == 0 or i == len(tickers)):
            print(f"fetched grades {i}/{len(tickers)}, errors={len(endpoint_errors)}", flush=True)

    frame = attach_revision_targets(
        frame,
        histories=histories,
        window_days=args.window_days,
        max_stale_days=args.max_stale_days,
    )
    target_col = f"analyst_rating_revision_{args.window_days}d"
    eval_frame = frame.dropna(subset=[target_col]).copy()
    if len(eval_frame) < 50:
        raise RuntimeError(f"Too few rows with analyst revision targets: {len(eval_frame)}")

    factors, _, factor_report = factor_null.build_factor_matrix(eval_frame, "year")
    eval_frame["risk_text_stability_resid_within_year"] = locked_risk.residualize_within_year(
        eval_frame, eval_frame[DEFAULT_SIGNAL], factors
    )
    eval_frame["risk_text_stability_resid_pooled_year_fe"] = locked_risk.residualize_pooled_year_fe(
        eval_frame, eval_frame[DEFAULT_SIGNAL], factors
    )
    eval_frame["risk_text_stability_peer_z_resid_within_year"] = locked_risk.residualize_within_year(
        eval_frame, eval_frame["risk_text_stability_peer_z"], factors
    )
    signal_cols = [
        "risk_text_stability",
        "risk_text_stability_resid_within_year",
        "risk_text_stability_resid_pooled_year_fe",
        "risk_text_stability_peer_z",
        "risk_text_stability_peer_z_resid_within_year",
    ]
    leaderboard = pd.DataFrame(
        [
            {
                "signal": col,
                "target": target_col,
                **summarize_against_target(
                    eval_frame,
                    eval_frame[col],
                    target_col=target_col,
                    permutations=args.permutations,
                    bootstrap=args.bootstrap,
                    seed=args.seed,
                ),
            }
            for col in signal_cols
        ]
    ).sort_values("mean_return_ic", ascending=False)

    mechanism_rows = []
    if RETURN_COL in eval_frame.columns:
        mechanism_rows.append(
            {
                "signal": target_col,
                "target": RETURN_COL,
                **summarize_against_target(
                    eval_frame,
                    eval_frame[target_col],
                    target_col=RETURN_COL,
                    permutations=args.permutations,
                    bootstrap=args.bootstrap,
                    seed=args.seed + 99,
                ),
            }
        )
    mechanism = pd.DataFrame(mechanism_rows)

    coverage = {
        "raw_rows": int(len(frame)),
        "raw_tickers": int(frame["ticker"].nunique()),
        "eval_rows": int(len(eval_frame)),
        "eval_tickers": int(eval_frame["ticker"].nunique()),
        "year_min": int(eval_frame["year"].min()),
        "year_max": int(eval_frame["year"].max()),
        "endpoint_errors": endpoint_errors[:50],
        "endpoint_error_count": len(endpoint_errors),
        "history_ticker_count": int(sum(1 for h in histories.values() if len(h))),
        "history_date_min": str(min((h["date"].min() for h in histories.values() if len(h)), default=pd.NaT)),
        "history_date_max": str(max((h["date"].max() for h in histories.values() if len(h)), default=pd.NaT)),
        "target_mean": float(eval_frame[target_col].mean()),
        "target_std": float(eval_frame[target_col].std(ddof=0)),
    }
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "merged_input": str(args.merged_input),
        "hypothesis": (
            "SEC Risk Factors stability/change should anticipate subsequent analyst rating revisions "
            "if the text channel is an attention-gap mechanism."
        ),
        "target_definition": (
            f"FMP grades-historical rating score at roughly filing_date + {args.window_days}d minus "
            "latest rating score available on or before filing_date."
        ),
        "window_days": int(args.window_days),
        "max_stale_days": int(args.max_stale_days),
        "permutations": int(args.permutations),
        "bootstrap": int(args.bootstrap),
        "seed": int(args.seed),
        "coverage": coverage,
        "factor_report": factor_report,
        "leaderboard": leaderboard.to_dict(orient="records"),
        "mechanism": mechanism.to_dict(orient="records"),
    }
    return frame, leaderboard, mechanism, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="AURORA analyst revision target audit from FMP rating history")
    parser.add_argument("--merged-input", required=True)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--window-days", type=int, default=180)
    parser.add_argument("--max-stale-days", type=int, default=120)
    parser.add_argument("--min-year", type=int, default=None)
    parser.add_argument("--max-year", type=int, default=None)
    parser.add_argument("--max-tickers", type=int, default=None)
    parser.add_argument("--min-peer-group", type=int, default=5)
    parser.add_argument("--permutations", type=int, default=1000)
    parser.add_argument("--bootstrap", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=401)
    parser.add_argument("--pause", type=float, default=0.08)
    parser.add_argument("--progress-every", type=int, default=25)
    parser.add_argument("--force-refresh", action="store_true")
    args = parser.parse_args()

    frame, leaderboard, mechanism, summary = run(args)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    out_dir = Path(args.output_dir) if args.output_dir else ARTIFACT_ROOT / f"{timestamp}_{args.window_days}d"
    out_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(out_dir / "analyst_revision_panel.csv", index=False)
    leaderboard.to_csv(out_dir / "leaderboard.csv", index=False)
    mechanism.to_csv(out_dir / "mechanism.csv", index=False)
    summary = {**summary, "artifact_dir": str(out_dir)}
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(out_dir), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
