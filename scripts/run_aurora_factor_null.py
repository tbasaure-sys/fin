#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

try:
    from sklearn.ensemble import HistGradientBoostingRegressor

    HAVE_SK = True
except Exception:
    HAVE_SK = False


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_PARQUET = (
    ROOT
    / "artifacts"
    / "aurora_omega_v8_dataset"
    / "20260629_190419"
    / "aurora_omega_v8_dataset.parquet"
)
DEFAULT_RANKER_PRED_FILE = (
    ROOT
    / "artifacts"
    / "aurora_omega_v8_ranker"
    / "20260630_013956"
    / "two_stage_val_predictions.csv"
)

ID_CANDIDATES = ["ticker", "permno", "id", "symbol", "gvkey", "cik"]
YEAR_CANDIDATES = ["year", "fyear", "fiscal_year", "obs_year", "date_year"]
RETURN_CANDIDATES = ["ann_return_3y_fwd", "ret_3y_fwd", "fwd_return_3y", "forward_return_3y"]
SECTOR_CANDIDATES = ["gics_sector", "sector", "gsector", "industry_sector", "naics_sector"]

FACTOR_SPECS = [
    ("value_pb", -1, ["pb", "pb_year_z", "price_to_book", "p_to_b"]),
    ("value_pe", -1, ["pe", "price_to_earnings", "p_to_e"]),
    ("value_ev_sales", -1, ["ev_to_sales", "enterprise_value_to_sales"]),
    ("value_ev_ebitda", -1, ["ev_to_ebitda", "enterprise_value_to_ebitda"]),
    ("value_fcf", +1, ["fcf_yield", "fcf_to_price", "free_cash_flow_yield", "fcfy"]),
    ("quality_roic", +1, ["roic_proxy", "roic", "return_on_invested_capital"]),
    ("quality_roe", +1, ["roe", "return_on_equity"]),
    ("quality_roa", +1, ["roa", "return_on_assets"]),
    ("quality_gm", +1, ["gross_margin", "gross_profitability", "gross_profit_to_assets"]),
    ("quality_opm", +1, ["operating_margin", "oper_margin", "ebit_margin", "op_margin"]),
    ("momentum_1y", +1, ["ret_1y_trailing", "mom_12_1", "momentum_12_1", "momentum", "mom12m"]),
    ("momentum_3y", +1, ["ret_3y_trailing", "mom_36_1", "momentum_36_1", "mom36m"]),
    ("size", -1, ["log_mktcap", "log_market_cap", "ln_mktcap", "market_cap", "mktcap", "mcap", "size"]),
    ("leverage", -1, ["debt_assets", "debt_to_equity", "leverage", "net_debt_to_ebitda", "lev"]),
    ("lowvol", -1, ["vol_1y_trailing", "realized_vol", "volatility", "vol_12m", "idio_vol", "ivol"]),
]

VAL_YEARS = [2018, 2019, 2020, 2021, 2022, 2023]
TRAIN_MAX_OFFSET = 3
N_BINS = 10


def resolve(df: pd.DataFrame, candidates: list[str]) -> str | None:
    lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand in df.columns:
            return cand
        if cand.lower() in lower:
            return lower[cand.lower()]
    return None


def xs_rank(s: pd.Series) -> pd.Series:
    r = s.rank(method="average")
    n = int(r.notna().sum())
    if n <= 1:
        return pd.Series(np.nan, index=s.index)
    return (r - 1.0) / (n - 1.0) - 0.5


def build_factor_matrix(df: pd.DataFrame, year_col: str) -> tuple[pd.DataFrame, pd.Series, list[tuple[str, str | None, float]]]:
    factors = pd.DataFrame(index=df.index)
    report: list[tuple[str, str | None, float]] = []
    for name, sign, candidates in FACTOR_SPECS:
        col = None
        cov = np.nan
        empty_match = None
        for candidate in candidates:
            candidate_col = resolve(df, [candidate])
            if candidate_col is None:
                continue
            candidate_cov = float(df[candidate_col].notna().mean())
            if candidate_cov > 0.0:
                col = candidate_col
                cov = candidate_cov
                break
            if empty_match is None:
                empty_match = candidate_col
        if col is None:
            if empty_match is not None:
                report.append((name, f"{empty_match} (empty)", 0.0))
            else:
                report.append((name, None, np.nan))
            continue
        factors[name] = df.groupby(year_col)[col].transform(xs_rank) * sign
        report.append((name, col, cov))
    composite = factors.mean(axis=1, skipna=True) if factors.shape[1] else pd.Series(np.nan, index=df.index)
    return factors, composite, report


def _clean(a, b) -> tuple[np.ndarray, np.ndarray]:
    aa = np.asarray(a, dtype=float)
    bb = np.asarray(b, dtype=float)
    mask = np.isfinite(aa) & np.isfinite(bb)
    return aa[mask], bb[mask]


def ic(scores, rets) -> float:
    s, r = _clean(scores, rets)
    if len(s) < 5 or np.allclose(s, s[0]) or np.allclose(r, r[0]):
        return np.nan
    return float(spearmanr(s, r).correlation)


def decile_spread(scores, rets, n_bins: int = N_BINS) -> float:
    s, r = _clean(scores, rets)
    if len(s) < 10:
        return np.nan
    nb = max(2, min(n_bins, len(s) // 10))
    try:
        bins = pd.qcut(pd.Series(s).rank(method="first"), nb, labels=False, duplicates="drop").to_numpy()
    except ValueError:
        return np.nan
    return float(r[bins == bins.max()].mean() - r[bins == bins.min()].mean())


def sector_neutral_ic(scores, rets, sectors) -> float:
    if sectors is None:
        return np.nan
    frame = pd.DataFrame({"s": scores, "r": rets, "sec": sectors}).replace([np.inf, -np.inf], np.nan).dropna()
    if len(frame) < 5:
        return np.nan
    frame["s"] = frame["s"] - frame.groupby("sec")["s"].transform("mean")
    frame["r"] = frame["r"] - frame.groupby("sec")["r"].transform("mean")
    if np.allclose(frame["s"].to_numpy(), frame["s"].to_numpy()[0]) or np.allclose(frame["r"].to_numpy(), frame["r"].to_numpy()[0]):
        return np.nan
    return float(spearmanr(frame["s"], frame["r"]).correlation)


def residualize(signal, factor_block: pd.DataFrame) -> np.ndarray:
    y = np.asarray(signal, dtype=float)
    x = factor_block.fillna(0.0).to_numpy(dtype=float)
    finite = np.isfinite(y)
    if finite.sum() < (x.shape[1] + 2):
        return np.full_like(y, np.nan)
    xf = np.column_stack([np.ones(finite.sum()), x[finite]])
    yf = y[finite]
    beta, *_ = np.linalg.lstsq(xf, yf, rcond=None)
    resid = np.full_like(y, np.nan)
    resid[finite] = yf - xf @ beta
    return resid


def fold_masks(years: np.ndarray):
    for val_year in VAL_YEARS:
        val_mask = years == val_year
        if val_mask.sum() == 0:
            continue
        train_mask = years <= (val_year - TRAIN_MAX_OFFSET)
        yield val_year, train_mask, val_mask


def summarize(per_fold: list[dict[str, float]]) -> dict[str, float]:
    ics = np.array([row["ic"] for row in per_fold], dtype=float)
    spreads = np.array([row["spread"] for row in per_fold], dtype=float)
    sn = np.array([row["sn_ic"] for row in per_fold], dtype=float)
    folds = int(np.isfinite(ics).sum())
    mean_ic = float(np.nanmean(ics)) if folds else np.nan
    sd_ic = float(np.nanstd(ics, ddof=1)) if folds > 1 else np.nan
    return {
        "folds": folds,
        "mean_ic": mean_ic,
        "sd_ic": sd_ic,
        "se_ic": float(sd_ic / np.sqrt(folds)) if folds and np.isfinite(sd_ic) else np.nan,
        "mean_spread": float(np.nanmean(spreads)) if np.isfinite(spreads).any() else np.nan,
        "pos_spread": float(np.nanmean(spreads > 0)) if np.isfinite(spreads).any() else np.nan,
        "mean_sn_ic": float(np.nanmean(sn)) if np.isfinite(sn).any() else np.nan,
    }


def eval_static_signal(
    df: pd.DataFrame,
    year_col: str,
    ret_col: str,
    sec_col: str | None,
    signal: pd.Series,
) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    years = df[year_col].to_numpy()
    for _, _, val_mask in fold_masks(years):
        idx = np.where(val_mask)[0]
        s = signal.iloc[idx].to_numpy(dtype=float)
        r = df[ret_col].iloc[idx].to_numpy(dtype=float)
        sec = df[sec_col].iloc[idx].to_numpy() if sec_col else None
        out.append({"ic": ic(s, r), "spread": decile_spread(s, r), "sn_ic": sector_neutral_ic(s, r, sec)})
    return out


def eval_residual_signal(
    df: pd.DataFrame,
    year_col: str,
    ret_col: str,
    sec_col: str | None,
    signal: pd.Series,
    factors: pd.DataFrame,
) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    years = df[year_col].to_numpy()
    for _, _, val_mask in fold_masks(years):
        idx = np.where(val_mask)[0]
        resid = residualize(signal.iloc[idx].to_numpy(dtype=float), factors.iloc[idx])
        r = df[ret_col].iloc[idx].to_numpy(dtype=float)
        sec = df[sec_col].iloc[idx].to_numpy() if sec_col else None
        out.append({"ic": ic(resid, r), "spread": decile_spread(resid, r), "sn_ic": sector_neutral_ic(resid, r, sec)})
    return out


def eval_factor_gbr(df: pd.DataFrame, year_col: str, ret_col: str, sec_col: str | None, factors: pd.DataFrame):
    if not HAVE_SK or factors.empty:
        return None
    xall = factors.fillna(0.0).to_numpy(dtype=float)
    yall = df[ret_col].to_numpy(dtype=float)
    out: list[dict[str, float]] = []
    for _, train_mask, val_mask in fold_masks(df[year_col].to_numpy()):
        train_idx = np.where(train_mask & np.isfinite(yall))[0]
        val_idx = np.where(val_mask)[0]
        if len(train_idx) < 50:
            out.append({"ic": np.nan, "spread": np.nan, "sn_ic": np.nan})
            continue
        model = HistGradientBoostingRegressor(
            max_depth=3,
            max_iter=300,
            learning_rate=0.05,
            l2_regularization=1.0,
            min_samples_leaf=20,
            random_state=0,
        )
        model.fit(xall[train_idx], yall[train_idx])
        pred = model.predict(xall[val_idx])
        ret = yall[val_idx]
        sec = df[sec_col].iloc[val_idx].to_numpy() if sec_col else None
        out.append({"ic": ic(pred, ret), "spread": decile_spread(pred, ret), "sn_ic": sector_neutral_ic(pred, ret, sec)})
    return out


def fmt(x: float, digits: int = 4) -> str:
    return "   nan" if x is None or not np.isfinite(x) else f"{x:+.{digits}f}"


def print_table(rows: list[tuple[str, dict[str, float]]]) -> None:
    header = f"{'Model':32s} {'Folds':>5s} {'Mean IC':>9s} {'IC SD':>8s} {'IC SE':>8s} {'Spread':>9s} {'Pos>0':>6s} {'SN IC':>8s}"
    print(header)
    print("-" * len(header))
    for name, stats in rows:
        pos = "  nan" if not np.isfinite(stats["pos_spread"]) else f"{stats['pos_spread']:.2f}"
        print(
            f"{name:32s} {stats['folds']:>5d} {fmt(stats['mean_ic']):>9s} "
            f"{fmt(stats['sd_ic']):>8s} {fmt(stats['se_ic']):>8s} "
            f"{fmt(stats['mean_spread']):>9s} {pos:>6s} {fmt(stats['mean_sn_ic']):>8s}"
        )


def verdict(factor_lin, factor_gbr, aurora_raw, aurora_resid) -> None:
    print("\n" + "=" * 72)
    print("VERDICT")
    print("=" * 72)
    best_factor = factor_lin["mean_ic"]
    if factor_gbr is not None and np.isfinite(factor_gbr["mean_ic"]):
        best_factor = float(np.nanmax([best_factor, factor_gbr["mean_ic"]]))
    delta = aurora_raw["mean_ic"] - best_factor
    candidates = [aurora_raw["sd_ic"], factor_lin["sd_ic"]]
    if factor_gbr is not None:
        candidates.append(factor_gbr["sd_ic"])
    noise = float(np.nanmax([x for x in candidates if x is not None])) if candidates else np.nan

    print(f"AURORA raw IC ...................... {fmt(aurora_raw['mean_ic'])}")
    print(f"best factor-only IC ............... {fmt(best_factor)}")
    print(f"edge over factors (delta) ......... {fmt(delta)}")
    print(f"cross-fold SD of IC (noise floor) . {fmt(noise)}   (overlapping folds -> true uncertainty is larger)")
    if np.isfinite(delta) and np.isfinite(noise):
        if delta <= noise:
            print("  -> AURORA does NOT clearly exceed factor beta: edge is within fold-to-fold noise.")
        else:
            print("  -> AURORA exceeds factor-only by more than one fold SD. Necessary, not sufficient.")

    residual_ic = aurora_resid["mean_ic"]
    residual_se = aurora_resid["se_ic"]
    print(f"\nAURORA _|_ factors residual IC .... {fmt(residual_ic)}  (SE {fmt(residual_se)})")
    if np.isfinite(residual_ic) and np.isfinite(residual_se) and residual_se > 0:
        if abs(residual_ic) <= 2.0 * residual_se:
            print("  -> Orthogonal signal NOT distinguishable from zero (|IC| <= 2 SE): belief channel looks EMPTY.")
        else:
            print("  -> Residual exceeds 2 SE: candidate orthogonal signal. Confirm with --permute and wider validation.")
    print("=" * 72)


def read_table(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".parquet":
        return pd.read_parquet(path)
    return pd.read_csv(path)


def attach_signal(
    df: pd.DataFrame,
    id_col: str,
    year_col: str,
    signal_col: str,
    ranker_pred_file: str | None,
    ranker_pred_col: str,
) -> tuple[pd.Series, str]:
    if ranker_pred_file:
        path = Path(ranker_pred_file)
        if not path.exists():
            sys.exit(f"[fatal] ranker prediction file not found: {path}")
        pred = read_table(path)
        pid = resolve(pred, ID_CANDIDATES)
        pyr = resolve(pred, YEAR_CANDIDATES)
        pcol = ranker_pred_col if ranker_pred_col in pred.columns else resolve(pred, [ranker_pred_col, "pred", "score", "yhat", "prediction"])
        if not (pid and pyr and pcol):
            sys.exit(f"[fatal] could not resolve id/year/pred in {path}")
        merged = df[[id_col, year_col]].merge(
            pred[[pid, pyr, pcol]].rename(columns={pid: id_col, pyr: year_col, pcol: "_aurora_signal"}),
            on=[id_col, year_col],
            how="left",
        )
        coverage = float(merged["_aurora_signal"].notna().mean())
        print(f"[signal] model predictions from {path.name}, column {pcol} (coverage {coverage:.1%})")
        return merged["_aurora_signal"], f"AURORA preds [{pcol}]"

    col = resolve(df, [signal_col])
    if col is None:
        sys.exit(f"[fatal] AURORA signal column '{signal_col}' not found")
    print(f"[signal] target/proxy column {col}")
    return df[col], f"AURORA proxy [{col}]"


def run(df: pd.DataFrame, signal_col: str, ranker_pred_file: str | None, ranker_pred_col: str, permute: bool) -> None:
    id_col = resolve(df, ID_CANDIDATES)
    year_col = resolve(df, YEAR_CANDIDATES)
    ret_col = resolve(df, RETURN_CANDIDATES)
    sec_col = resolve(df, SECTOR_CANDIDATES)

    print("\n[columns]")
    print(f"  id     : {id_col}")
    print(f"  year   : {year_col}")
    print(f"  return : {ret_col}")
    print(f"  sector : {sec_col if sec_col else '(none -> sector-neutral skipped)'}")
    for col, label in [(id_col, "id"), (year_col, "year"), (ret_col, "forward return")]:
        if col is None:
            sys.exit(f"[fatal] could not resolve {label} column")

    df = df.dropna(subset=[year_col]).copy()
    df[year_col] = df[year_col].astype(int)
    factors, composite, factor_report = build_factor_matrix(df, year_col)

    print("\n[factors] (name -> matched column @ coverage)")
    used = 0
    for name, col, cov in factor_report:
        if col is None:
            print(f"  {name:18s} -> MISSING")
        elif cov <= 0.0:
            print(f"  {name:18s} -> {col:28s} @ {cov:5.1%}")
        else:
            print(f"  {name:18s} -> {col:28s} @ {cov:5.1%}")
            used += 1
    print(f"  => {used}/{len(FACTOR_SPECS)} factors available")
    if used == 0:
        sys.exit("[fatal] no factor columns matched")

    signal, signal_label = attach_signal(df, id_col, year_col, signal_col, ranker_pred_file, ranker_pred_col)

    print(f"\n[folds] train rows after purge / val rows (purge keeps u <= v - {TRAIN_MAX_OFFSET})")
    years = df[year_col].to_numpy()
    returns = df[ret_col].to_numpy(dtype=float)
    for val_year, train_mask, val_mask in fold_masks(years):
        print(f"  val {val_year}: train={int((train_mask & np.isfinite(returns)).sum()):>5d}  val={int(val_mask.sum()):>4d}")

    if permute:
        rng = np.random.default_rng(2024)
        df = df.copy()
        for _, group in df.groupby(year_col):
            values = group[ret_col].to_numpy().copy()
            rng.shuffle(values)
            df.loc[group.index, ret_col] = values

    factor_lin = summarize(eval_static_signal(df, year_col, ret_col, sec_col, composite))
    factor_gbr_rows = eval_factor_gbr(df, year_col, ret_col, sec_col, factors)
    factor_gbr = summarize(factor_gbr_rows) if factor_gbr_rows is not None else None
    aurora_raw = summarize(eval_static_signal(df, year_col, ret_col, sec_col, signal))
    aurora_resid = summarize(eval_residual_signal(df, year_col, ret_col, sec_col, signal, factors))

    title = "RESULTS" + (" [PERMUTED RETURNS -- expect IC near 0]" if permute else "")
    print(f"\n{title}\n")
    rows = [("Factor composite (linear)", factor_lin)]
    if factor_gbr is not None:
        rows.append(("Factor HistGBR (factors only)", factor_gbr))
    rows.append((f"{signal_label} (raw)", aurora_raw))
    rows.append((f"{signal_label} _|_ factors", aurora_resid))
    print_table(rows)

    if not permute:
        verdict(factor_lin, factor_gbr, aurora_raw, aurora_resid)


def make_synthetic(n_tickers=297, years=range(2014, 2024), belief_coef=0.30, leak=0.0, seed=0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for year in years:
        for i in range(n_tickers):
            value, quality, mom, size = rng.normal(size=4)
            belief = rng.normal()
            ret = 0.20 * value + 0.15 * quality + 0.12 * mom - 0.12 * size + belief_coef * belief + rng.normal()
            target = 0.5 * value + 0.4 * quality + 0.3 * mom + 0.6 * belief + leak * ret + 0.30 * rng.normal()
            rows.append(
                {
                    "ticker": f"T{i:03d}",
                    "year": year,
                    "pb": -value,
                    "roic_proxy": quality,
                    "ret_1y_trailing": mom,
                    "market_cap": size,
                    "ann_return_3y_fwd": ret,
                    "research_priority_target": target,
                    "sector": f"S{i % 11}",
                }
            )
    return pd.DataFrame(rows)


def selftest() -> None:
    print("#" * 72)
    print("# SELF-TEST A: orthogonal belief signal PRESENT")
    print("#" * 72)
    run(make_synthetic(belief_coef=0.30, seed=1), "research_priority_target", None, "pred", permute=False)
    print("\n\n" + "#" * 72)
    print("# SELF-TEST B: NO orthogonal signal")
    print("#" * 72)
    run(make_synthetic(belief_coef=0.0, seed=2), "research_priority_target", None, "pred", permute=False)
    print("\n\n" + "#" * 72)
    print("# SELF-TEST C: permutation null")
    print("#" * 72)
    run(make_synthetic(belief_coef=0.30, seed=1), "research_priority_target", None, "pred", permute=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="AURORA factor-null harness")
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET_PARQUET), help="V8 dataset parquet")
    parser.add_argument("--signal-col", default="research_priority_target", help="AURORA target/proxy column")
    parser.add_argument("--ranker-pred-file", default=None, help="optional OOS ranker predictions csv/parquet")
    parser.add_argument("--ranker-pred-col", default="blend_v2", help="prediction column to use when --ranker-pred-file is set")
    parser.add_argument("--permute", action="store_true", help="shuffle forward returns inside each year")
    parser.add_argument("--selftest", action="store_true", help="run synthetic discrimination tests")
    parser.add_argument("--use-latest-ranker", action="store_true", help="use the latest checked-in V8 ranker prediction artifact")
    args = parser.parse_args()

    if args.selftest:
        selftest()
        return

    dataset = Path(args.dataset)
    if not dataset.exists():
        sys.exit(f"[fatal] dataset not found: {dataset}")
    ranker_pred_file = str(DEFAULT_RANKER_PRED_FILE) if args.use_latest_ranker else args.ranker_pred_file
    df = pd.read_parquet(dataset)
    print(f"[load] {dataset}: {len(df):,} rows, {df.shape[1]} cols")
    run(df.reset_index(drop=True), args.signal_col, ranker_pred_file, args.ranker_pred_col, args.permute)


if __name__ == "__main__":
    main()
