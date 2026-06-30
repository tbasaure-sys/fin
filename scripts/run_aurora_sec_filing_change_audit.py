#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import numpy as np
import pandas as pd
import requests
from sklearn.feature_extraction.text import TfidfVectorizer

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

import run_aurora_factor_null as factor_null


ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_sec_filing_change_audit"
CACHE_ROOT = ROOT / "artifacts" / "aurora_sec_filing_change_cache"
SEC_COMPANY_TICKERS = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_SUBMISSION_FILE = "https://data.sec.gov/submissions/{name}"
SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_nodash}/{primary_doc}"
RETURN_COL = "ann_return_3y_fwd"
USER_AGENT = os.environ.get("SEC_USER_AGENT", "TomasBasaure/tbasaurel1997@gmail.com")


@dataclass
class FilingRecord:
    ticker: str
    cik: str
    accession: str
    form: str
    filing_date: str
    report_date: str
    primary_doc: str
    fiscal_year: int
    url: str
    text_path: str
    risk_path: str
    text_chars: int
    risk_chars: int


def request_json(url: str) -> Any:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}, timeout=30)
    resp.raise_for_status()
    time.sleep(0.12)
    return resp.json()


def request_text(url: str) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"}, timeout=45)
    resp.raise_for_status()
    time.sleep(0.12)
    return resp.text


def normalize_text(raw: str) -> str:
    raw = re.sub(r"<script\b[^>]*>.*?</script>", " ", raw, flags=re.I | re.S)
    raw = re.sub(r"<style\b[^>]*>.*?</style>", " ", raw, flags=re.I | re.S)
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = html.unescape(raw)
    raw = re.sub(r"\s+", " ", raw)
    return raw.strip()


def extract_risk_factors(text: str) -> str:
    lower = text.lower()
    starts = [m.start() for m in re.finditer(r"\bitem\s+1a\s*[\.:：-]?\s+risk\s+factors\b", lower)]
    if not starts:
        return ""
    candidates = []
    for start in starts:
        search_from = start + 20
        end_match = re.search(
            r"\bitem\s+1b\s*[\.:：-]?\s+unresolved\b|\bitem\s+2\s*[\.:：-]?\s+properties\b|\bitem\s+2\s*[\.:：-]?\b",
            lower[search_from:],
        )
        end = search_from + end_match.start() if end_match else min(len(text), start + 250_000)
        segment = text[start:end].strip()
        if len(segment) >= 1_000:
            candidates.append(segment)
    if not candidates:
        return ""
    return max(candidates, key=len)


def load_ticker_cik_map(cache_dir: Path) -> dict[str, str]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / "company_tickers.json"
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
    else:
        payload = request_json(SEC_COMPANY_TICKERS)
        path.write_text(json.dumps(payload), encoding="utf-8")
    out: dict[str, str] = {}
    for row in payload.values():
        ticker = str(row.get("ticker", "")).upper()
        cik = str(row.get("cik_str", "")).zfill(10)
        if ticker and cik.strip("0"):
            out[ticker] = cik
    return out


def collect_recent_filings(ticker: str, cik: str, start_year: int, end_year: int, cache_dir: Path) -> list[dict[str, Any]]:
    path = cache_dir / "submissions" / f"CIK{cik}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        payload = json.loads(path.read_text(encoding="utf-8"))
    else:
        payload = request_json(SEC_SUBMISSIONS.format(cik=cik))
        path.write_text(json.dumps(payload), encoding="utf-8")
    filing_blocks = [payload.get("filings", {}).get("recent", {})]
    for file_meta in payload.get("filings", {}).get("files", []):
        name = file_meta.get("name")
        if not name:
            continue
        file_path = cache_dir / "submissions" / name
        if file_path.exists():
            file_payload = json.loads(file_path.read_text(encoding="utf-8"))
        else:
            file_payload = request_json(SEC_SUBMISSION_FILE.format(name=name))
            file_path.write_text(json.dumps(file_payload), encoding="utf-8")
        filing_blocks.append(file_payload)
    rows = []
    seen = set()
    for recent in filing_blocks:
        forms = recent.get("form", [])
        accessions = recent.get("accessionNumber", [])
        filing_dates = recent.get("filingDate", [])
        report_dates = recent.get("reportDate", [])
        primary_docs = recent.get("primaryDocument", [])
        for form, accession, filing_date, report_date, primary_doc in zip(forms, accessions, filing_dates, report_dates, primary_docs):
            if form != "10-K" or not report_date or not filing_date or not primary_doc:
                continue
            if accession in seen:
                continue
            seen.add(accession)
            try:
                fiscal_year = int(str(report_date)[:4])
            except Exception:
                continue
            if start_year <= fiscal_year <= end_year:
                rows.append(
                    {
                        "ticker": ticker,
                        "cik": cik,
                        "accession": accession,
                        "form": form,
                        "filing_date": filing_date,
                        "report_date": report_date,
                        "primary_doc": primary_doc,
                        "fiscal_year": fiscal_year,
                    }
                )
    return rows


def download_filing_text(row: dict[str, Any], cache_dir: Path) -> FilingRecord | None:
    cik = row["cik"]
    cik_int = str(int(cik))
    accession_nodash = row["accession"].replace("-", "")
    url = SEC_ARCHIVES.format(cik_int=cik_int, accession_nodash=accession_nodash, primary_doc=row["primary_doc"])
    text_dir = cache_dir / "texts" / row["ticker"]
    text_dir.mkdir(parents=True, exist_ok=True)
    text_path = text_dir / f"{row['fiscal_year']}_{row['accession']}.txt"
    risk_path = text_dir / f"{row['fiscal_year']}_{row['accession']}.risk.txt"
    risk_cache_path = str(risk_path)
    if text_path.exists():
        text = text_path.read_text(encoding="utf-8", errors="ignore")
        risk = extract_risk_factors(text)
        try:
            risk_path.write_text(risk, encoding="utf-8", errors="ignore")
        except OSError as exc:
            print(f"[warn] could not cache risk text {risk_path}: {exc}")
            safe_risk_path = text_dir / f"risk_{row['fiscal_year']}_{accession_nodash}.txt"
            safe_risk_path.write_text(risk, encoding="utf-8", errors="ignore")
            risk_cache_path = str(safe_risk_path)
    else:
        try:
            raw = request_text(url)
        except Exception as exc:
            print(f"[warn] failed {row['ticker']} {row['fiscal_year']} {url}: {exc}")
            return None
        text = normalize_text(raw)
        risk = extract_risk_factors(text)
        text_path.write_text(text, encoding="utf-8", errors="ignore")
        try:
            risk_path.write_text(risk, encoding="utf-8", errors="ignore")
        except OSError as exc:
            print(f"[warn] could not cache risk text {risk_path}: {exc}")
            safe_risk_path = text_dir / f"risk_{row['fiscal_year']}_{accession_nodash}.txt"
            safe_risk_path.write_text(risk, encoding="utf-8", errors="ignore")
            risk_cache_path = str(safe_risk_path)
    return FilingRecord(
        ticker=row["ticker"],
        cik=cik,
        accession=row["accession"],
        form=row["form"],
        filing_date=row["filing_date"],
        report_date=row["report_date"],
        primary_doc=row["primary_doc"],
        fiscal_year=int(row["fiscal_year"]),
        url=url,
        text_path=str(text_path),
        risk_path=risk_cache_path,
        text_chars=len(text),
        risk_chars=len(risk),
    )


def cosine_similarities(texts: list[str]) -> list[float]:
    if len(texts) < 2:
        return []
    vectorizer = TfidfVectorizer(min_df=1, max_features=60_000, ngram_range=(1, 2), stop_words="english")
    matrix = vectorizer.fit_transform(texts)
    sims = []
    for i in range(1, matrix.shape[0]):
        sim = (matrix[i] @ matrix[i - 1].T).toarray()[0, 0]
        sims.append(float(sim))
    return sims


def jaccard_tokens(left: str, right: str) -> float:
    token_re = re.compile(r"[a-zA-Z][a-zA-Z]{2,}")
    a = set(t.lower() for t in token_re.findall(left))
    b = set(t.lower() for t in token_re.findall(right))
    if not a or not b:
        return np.nan
    return float(len(a & b) / len(a | b))


def build_change_panel(records: list[FilingRecord]) -> pd.DataFrame:
    meta = pd.DataFrame([r.__dict__ for r in records]).sort_values(["ticker", "fiscal_year"])
    rows = []
    for ticker, group in meta.groupby("ticker"):
        group = group.sort_values("fiscal_year").reset_index(drop=True)
        texts = [Path(p).read_text(encoding="utf-8", errors="ignore") for p in group["text_path"]]
        risks = [Path(p).read_text(encoding="utf-8", errors="ignore") if str(p) and Path(p).exists() else "" for p in group["risk_path"]]
        sims = cosine_similarities(texts)
        for i in range(len(group)):
            row = group.iloc[i].to_dict()
            if i == 0:
                row.update(
                    {
                        "filing_cosine_similarity": np.nan,
                        "filing_text_change": np.nan,
                        "filing_log_text_growth": np.nan,
                        "risk_jaccard_similarity": np.nan,
                        "risk_text_change": np.nan,
                        "risk_log_text_growth": np.nan,
                    }
                )
            else:
                sim = sims[i - 1] if i - 1 < len(sims) else np.nan
                risk_sim = jaccard_tokens(risks[i], risks[i - 1])
                row.update(
                    {
                        "filing_cosine_similarity": sim,
                        "filing_text_change": 1.0 - sim if np.isfinite(sim) else np.nan,
                        "filing_log_text_growth": float(np.log((len(texts[i]) + 1) / (len(texts[i - 1]) + 1))),
                        "risk_jaccard_similarity": risk_sim,
                        "risk_text_change": 1.0 - risk_sim if np.isfinite(risk_sim) else np.nan,
                        "risk_log_text_growth": float(np.log((len(risks[i]) + 1) / (len(risks[i - 1]) + 1))),
                    }
                )
            rows.append(row)
    return pd.DataFrame(rows)


def zscore_by_year(frame: pd.DataFrame, col: str) -> pd.Series:
    def _z(s: pd.Series) -> pd.Series:
        sd = s.std(ddof=0)
        if not np.isfinite(sd) or sd <= 1e-9:
            return pd.Series(0.0, index=s.index)
        return (s - s.mean()) / sd

    return frame.groupby("year", group_keys=False)[col].apply(_z)


def add_directional_signals(merged: pd.DataFrame) -> None:
    for source, dest in [
        ("filing_text_change", "filing_text_stability"),
        ("risk_text_change", "risk_text_stability"),
        ("filing_change_combo", "filing_stability_combo"),
    ]:
        if source in merged.columns:
            merged[dest] = -merged[source]


def block_bootstrap_ci(values: list[float], n_bootstrap: int, seed: int) -> tuple[float, float]:
    clean = np.array([v for v in values if np.isfinite(v)], dtype=float)
    if len(clean) < 2 or n_bootstrap <= 0:
        return np.nan, np.nan
    rng = np.random.default_rng(seed)
    means = []
    for _ in range(n_bootstrap):
        sample = rng.choice(clean, size=len(clean), replace=True)
        means.append(float(np.mean(sample)))
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def permute_returns_by_year(frame: pd.DataFrame, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    out = frame.copy()
    shuffled = []
    for _, group in out.groupby("year", sort=False):
        values = group[RETURN_COL].to_numpy(dtype=float).copy()
        finite = np.isfinite(values)
        values[finite] = rng.permutation(values[finite])
        shuffled.append(pd.Series(values, index=group.index))
    out[f"{RETURN_COL}_permuted"] = pd.concat(shuffled).sort_index()
    return out


def summarize_signal(
    frame: pd.DataFrame,
    signal: pd.Series,
    ret_col: str,
    n_bootstrap: int,
    seed: int,
) -> dict[str, Any]:
    folds = factor_null.eval_static_signal(frame, "year", ret_col, "sector" if "sector" in frame.columns else None, signal)
    stats = factor_null.summarize(folds)
    fold_ics = [row["ic"] for row in folds]
    lo, hi = block_bootstrap_ci(fold_ics, n_bootstrap=n_bootstrap, seed=seed)
    return {
        "folds": int(stats["folds"]),
        "mean_return_ic": stats["mean_ic"],
        "sd_return_ic": stats["sd_ic"],
        "boot_ci_low": lo,
        "boot_ci_high": hi,
        "mean_return_spread": stats["mean_spread"],
        "positive_spread_share": stats["pos_spread"],
        "mean_sector_neutral_ic": stats["mean_sn_ic"],
    }


def permutation_null(
    frame: pd.DataFrame,
    signal: pd.Series,
    n_permutations: int,
    seed: int,
) -> dict[str, float]:
    if n_permutations <= 0:
        return {"perm_mean_ic": np.nan, "perm_sd_ic": np.nan, "perm_p_abs": np.nan}
    obs = summarize_signal(frame, signal, RETURN_COL, n_bootstrap=0, seed=seed)["mean_return_ic"]
    vals = []
    for i in range(n_permutations):
        perm = permute_returns_by_year(frame, seed + 10_000 + i)
        vals.append(summarize_signal(perm, signal, f"{RETURN_COL}_permuted", n_bootstrap=0, seed=seed)["mean_return_ic"])
    arr = np.array(vals, dtype=float)
    finite = np.isfinite(arr)
    if not finite.any() or not np.isfinite(obs):
        return {"perm_mean_ic": np.nan, "perm_sd_ic": np.nan, "perm_p_abs": np.nan}
    arr = arr[finite]
    return {
        "perm_mean_ic": float(np.mean(arr)),
        "perm_sd_ic": float(np.std(arr, ddof=1)) if len(arr) > 1 else np.nan,
        "perm_p_abs": float((np.sum(np.abs(arr) >= abs(obs)) + 1) / (len(arr) + 1)),
    }


def evaluate_signals(merged: pd.DataFrame, n_permutations: int, n_bootstrap: int, seed: int) -> pd.DataFrame:
    factors, _, _ = factor_null.build_factor_matrix(merged, "year")
    add_directional_signals(merged)
    eval_cols = [
        "filing_text_change",
        "filing_text_stability",
        "risk_text_change",
        "risk_text_stability",
        "filing_log_text_growth",
        "risk_log_text_growth",
        "filing_change_combo",
        "filing_stability_combo",
    ]
    rows = []
    for col in eval_cols:
        if col not in merged.columns or merged[col].notna().sum() < 20:
            continue
        resid_col = f"{col}_resid"
        merged[resid_col] = np.nan
        for year, idx in merged.groupby("year").groups.items():
            idx = list(idx)
            merged.loc[idx, resid_col] = factor_null.residualize(merged.loc[idx, col], factors.loc[idx])
        for name, pred_col in [(col, col), (resid_col, resid_col)]:
            stats = summarize_signal(merged, merged[pred_col], RETURN_COL, n_bootstrap=n_bootstrap, seed=seed)
            perm = permutation_null(merged, merged[pred_col], n_permutations=n_permutations, seed=seed)
            rows.append(
                {
                    "signal": name,
                    "rows": int(merged[pred_col].notna().sum()),
                    **stats,
                    **perm,
                }
            )
    return pd.DataFrame(rows).sort_values(["mean_return_ic", "mean_return_spread"], ascending=False)


def choose_tickers(dataset: pd.DataFrame, max_tickers: int, explicit: str | None) -> list[str]:
    if explicit:
        return [t.strip().upper() for t in explicit.split(",") if t.strip()]
    preferred = [
        "AAPL",
        "MSFT",
        "AMZN",
        "GOOGL",
        "META",
        "NVDA",
        "ADBE",
        "AMD",
        "AMAT",
        "AVGO",
        "JPM",
        "BAC",
        "AXP",
        "BA",
        "CAT",
        "DE",
        "COST",
        "HD",
        "WMT",
        "KO",
        "PEP",
        "LLY",
        "JNJ",
        "ABBV",
        "UNH",
        "XOM",
        "CVX",
        "NEE",
        "LIN",
        "BLK",
    ]
    available = set(dataset["ticker"].astype(str).str.upper().unique())
    selected = [ticker for ticker in preferred if ticker in available]
    if len(selected) < max_tickers:
        for ticker in dataset["ticker"].drop_duplicates().astype(str).str.upper():
            if ticker not in selected:
                selected.append(ticker)
            if len(selected) >= max_tickers:
                break
    return selected[:max_tickers]


def run_audit(args: argparse.Namespace) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    if args.merged_input:
        merged = pd.read_csv(args.merged_input)
        add_directional_signals(merged)
        leaderboard = evaluate_signals(merged, n_permutations=args.permutations, n_bootstrap=args.bootstrap, seed=args.seed)
        filings = pd.DataFrame()
        summary = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "dataset": str(args.dataset),
            "merged_input": str(args.merged_input),
            "tickers_requested": sorted(merged["ticker"].dropna().astype(str).str.upper().unique().tolist()),
            "tickers_with_filings": int(merged["ticker"].nunique()),
            "filing_rows": None,
            "merged_rows": int(len(merged)),
            "year_min": int(merged["year"].min()) if len(merged) else None,
            "year_max": int(merged["year"].max()) if len(merged) else None,
            "missing": [],
            "method": "eval-only rerun from merged SEC filing-change panel",
            "permutations": int(args.permutations),
            "bootstrap": int(args.bootstrap),
            "seed": int(args.seed),
        }
        return filings, merged, leaderboard, summary

    dataset = pd.read_parquet(args.dataset)
    tickers = choose_tickers(dataset, args.max_tickers, args.tickers)
    cache_dir = Path(args.cache_dir)
    ticker_map = load_ticker_cik_map(cache_dir)
    records: list[FilingRecord] = []
    missing = []
    print(f"[sec] user-agent: {USER_AGENT}")
    print(f"[slice] requested tickers: {tickers}")
    for n, ticker in enumerate(tickers, start=1):
        if n == 1 or n % 25 == 0 or n == len(tickers):
            print(f"[sec] processing {n}/{len(tickers)} {ticker} records={len(records)} missing={len(missing)}", flush=True)
        cik = ticker_map.get(ticker.upper())
        if not cik:
            missing.append({"ticker": ticker, "reason": "missing_cik"})
            continue
        rows = collect_recent_filings(ticker, cik, args.start_year - 1, args.end_year, cache_dir)
        if len(rows) < 2:
            missing.append({"ticker": ticker, "reason": "too_few_10k"})
            continue
        for row in rows:
            rec = download_filing_text(row, cache_dir)
            if rec is not None and rec.text_chars >= args.min_text_chars:
                records.append(rec)
    filings = build_change_panel(records) if records else pd.DataFrame()
    if filings.empty:
        raise RuntimeError("No usable filings collected")
    filings = filings.loc[filings["fiscal_year"].between(args.start_year, args.end_year)].copy()
    base = dataset.copy()
    required = {"ticker", "year", RETURN_COL}
    missing_required = sorted(required - set(base.columns))
    if missing_required:
        raise RuntimeError(f"Dataset missing required columns: {missing_required}")
    merged = base.merge(
        filings.rename(columns={"fiscal_year": "year"}),
        on=["ticker", "year"],
        how="inner",
    )
    if "asof_date" in merged.columns:
        merged["asof_date_dt"] = pd.to_datetime(merged["asof_date"], errors="coerce")
        merged["filing_date_dt"] = pd.to_datetime(merged["filing_date"], errors="coerce")
        before = len(merged)
        merged = merged.loc[
            merged["asof_date_dt"].notna()
            & merged["filing_date_dt"].notna()
            & (merged["filing_date_dt"] <= merged["asof_date_dt"])
        ].copy()
        print(f"[pit] filing_date <= asof_date retained {len(merged)}/{before} merged rows")
    for col in ["filing_text_change", "risk_text_change", "filing_log_text_growth", "risk_log_text_growth"]:
        if col in merged.columns:
            merged[f"{col}_z"] = zscore_by_year(merged, col)
    merged["filing_change_combo"] = (
        0.55 * merged["filing_text_change_z"].fillna(0.0)
        + 0.25 * merged["risk_text_change_z"].fillna(0.0)
        + 0.10 * merged["filing_log_text_growth_z"].fillna(0.0)
        + 0.10 * merged["risk_log_text_growth_z"].fillna(0.0)
    )
    leaderboard = evaluate_signals(merged, n_permutations=args.permutations, n_bootstrap=args.bootstrap, seed=args.seed)
    summary = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "dataset": str(args.dataset),
        "tickers_requested": tickers,
        "tickers_with_filings": int(filings["ticker"].nunique()),
        "filing_rows": int(len(filings)),
        "merged_rows": int(len(merged)),
        "year_min": int(merged["year"].min()) if len(merged) else None,
        "year_max": int(merged["year"].max()) if len(merged) else None,
        "missing": missing,
        "method": "10-K consecutive filing change, TF-IDF cosine + risk-factor token Jaccard, no LLM",
        "permutations": int(args.permutations),
        "bootstrap": int(args.bootstrap),
        "seed": int(args.seed),
    }
    return filings, merged, leaderboard, summary


def main() -> None:
    parser = argparse.ArgumentParser(description="AURORA SEC filing-change thin-slice audit")
    parser.add_argument("--dataset", default=str(factor_null.DEFAULT_DATASET_PARQUET))
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--cache-dir", default=str(CACHE_ROOT))
    parser.add_argument("--max-tickers", type=int, default=30)
    parser.add_argument("--tickers", default=None, help="comma-separated override")
    parser.add_argument("--start-year", type=int, default=2014)
    parser.add_argument("--end-year", type=int, default=2023)
    parser.add_argument("--min-text-chars", type=int, default=50_000)
    parser.add_argument("--permutations", type=int, default=0)
    parser.add_argument("--bootstrap", type=int, default=0)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--merged-input", default=None, help="skip SEC downloads and rerun evaluation from a merged_signals.csv")
    args = parser.parse_args()

    filings, merged, leaderboard, summary = run_audit(args)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    artifact_dir = Path(args.output_dir) if args.output_dir else ARTIFACT_ROOT / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)
    if not filings.empty:
        filings.to_csv(artifact_dir / "filings.csv", index=False)
    merged.to_csv(artifact_dir / "merged_signals.csv", index=False)
    leaderboard.to_csv(artifact_dir / "leaderboard.csv", index=False)
    summary = {**summary, "artifact_dir": str(artifact_dir), "leaderboard": leaderboard.to_dict(orient="records")}
    (artifact_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(artifact_dir), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    main()
