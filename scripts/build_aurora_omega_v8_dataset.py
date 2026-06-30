from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_omega_v8_dataset"


def load_router_module() -> Any:
    path = ROOT / "scripts" / "run_aurora_router_local.py"
    spec = importlib.util.spec_from_file_location("aurora_router_local", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["aurora_router_local"] = module
    spec.loader.exec_module(module)
    return module


def safe_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return np.nan
        out = float(value)
        return out if np.isfinite(out) else np.nan
    except Exception:
        return np.nan


def zscore_by_year(frame: pd.DataFrame, col: str) -> pd.Series:
    def _z(s: pd.Series) -> pd.Series:
        s = pd.to_numeric(s, errors="coerce")
        sd = s.std(ddof=0)
        if not np.isfinite(sd) or sd <= 1e-9:
            return pd.Series(np.nan, index=s.index)
        return (s - s.mean()) / sd

    return frame.groupby("year", group_keys=False)[col].apply(_z)


def load_cached_panel_subset(router: Any, requested_tickers: list[str]) -> tuple[pd.DataFrame | None, str | None]:
    exact_path = router.LOCAL_ROOT / f"panel_{router.PANEL_VERSION}_{len(requested_tickers)}.parquet"
    if exact_path.exists():
        panel = pd.read_parquet(exact_path)
        return panel, str(exact_path)

    candidates: list[tuple[int, Path]] = []
    for path in router.LOCAL_ROOT.glob(f"panel_{router.PANEL_VERSION}_*.parquet"):
        try:
            candidates.append((int(path.stem.rsplit("_", 1)[-1]), path))
        except Exception:
            continue
    for _, path in sorted(candidates, key=lambda item: item[0], reverse=True):
        panel = pd.read_parquet(path)
        if "ticker" not in panel.columns:
            continue
        available = set(panel["ticker"].astype(str).unique())
        if available.intersection(requested_tickers):
            return panel, str(path)
    return None, None


def prepare_featured_panel(max_tickers: int | None, force_panel_rebuild: bool) -> pd.DataFrame:
    router = load_router_module()
    router.load_env_file()
    api_key = os.environ.get("FMP_API_KEY") or os.environ.get("FINANCIAL_MODELING_PREP_API_KEY")
    tickers = sorted(set(router.CORE_UNIVERSE))
    if max_tickers:
        tickers = tickers[:max_tickers]
    panel = None
    panel_source = None
    if not force_panel_rebuild:
        panel, panel_source = load_cached_panel_subset(router, tickers)
    if panel is None:
        panel = router.build_or_load_panel(api_key, tickers, force=force_panel_rebuild)
        panel_source = f"built_or_loaded:{len(tickers)}"
    panel = panel.copy()
    panel["ticker"] = panel["ticker"].astype(str)
    featured = panel.loc[panel["ticker"].isin(tickers)].copy()
    if featured.empty:
        raise RuntimeError(f"No rows left after filtering cached panel to requested tickers ({len(tickers)}).")

    featured = router.add_lens_predictions(router.add_features(featured))
    featured = featured.loc[featured["ticker"].astype(str).isin(tickers)].copy()
    featured["omega_regime"] = featured.apply(router.classify_spine_regime, axis=1)
    featured["omega_primary_question"] = featured["omega_regime"].map(router.primary_question_for_regime)
    expectations = featured.apply(router.reverse_dcf_expectations, axis=1)
    anchors = featured.apply(
        lambda row: router.anchor_lens_checks(row, router.classify_spine_regime(row), router.reverse_dcf_expectations(row)),
        axis=1,
    )
    featured["implied_revenue_cagr"] = [item["implied_revenue_cagr"] for item in expectations]
    featured["implied_terminal_ebit_margin"] = [item["implied_terminal_ebit_margin"] for item in expectations]
    featured["implied_incremental_roic"] = [item["implied_incremental_roic"] for item in expectations]
    featured["implied_reinvestment_rate"] = [item["implied_reinvestment_rate"] for item in expectations]
    featured["implied_duration_score"] = [item["duration_risk"] for item in expectations]
    featured["omega_expectations_pressure"] = [item["valuation_pressure_score"] for item in expectations]
    featured["omega_feasibility_score"] = [
        router.score_expectation_feasibility(row, exp)["score"] for (_, row), exp in zip(featured.iterrows(), expectations)
    ]
    featured["omega_downside_anchor_score"] = [item["asset_value"]["score"] for item in anchors]
    featured["omega_book_anchor_score"] = [item["residual_income"]["score"] for item in anchors]
    featured["omega_reverse_dcf_score"] = [
        item["reverse_dcf"].get("score", item["reverse_dcf"].get("pressure_score", np.nan))
        for item in anchors
    ]
    featured.attrs["panel_source"] = panel_source
    featured.attrs["requested_tickers"] = tickers
    return featured


def build_realized_future_labels(featured: pd.DataFrame) -> pd.DataFrame:
    current = featured.copy()
    future = featured.copy()
    future["year"] = future["year"] - 3
    keep = [
        "ticker",
        "year",
        "revenue",
        "ebit_margin",
        "fcf_margin",
        "roic_proxy",
        "ev_to_sales",
        "pb",
        "price_t0",
        "operating_margin",
        "gross_margin",
        "net_margin",
    ]
    future = future[keep].rename(
        columns={
            "revenue": "future_revenue",
            "ebit_margin": "future_ebit_margin",
            "fcf_margin": "future_fcf_margin",
            "roic_proxy": "future_roic_proxy",
            "ev_to_sales": "future_ev_to_sales",
            "pb": "future_pb",
            "price_t0": "future_price_t0",
            "operating_margin": "future_operating_margin",
            "gross_margin": "future_gross_margin",
            "net_margin": "future_net_margin",
        }
    )
    data = current.merge(future, on=["ticker", "year"], how="left")
    data["realized_revenue_cagr_3y"] = np.where(
        (data["revenue"] > 0) & (data["future_revenue"] > 0),
        np.power(data["future_revenue"] / data["revenue"], 1 / 3) - 1,
        np.nan,
    )
    data["realized_ebit_margin_3y"] = pd.to_numeric(data["future_ebit_margin"], errors="coerce")
    data["realized_operating_margin_3y"] = pd.to_numeric(data["future_operating_margin"], errors="coerce")
    data["realized_gross_margin_3y"] = pd.to_numeric(data["future_gross_margin"], errors="coerce")
    data["realized_net_margin_3y"] = pd.to_numeric(data["future_net_margin"], errors="coerce")
    data["realized_roic_3y"] = pd.to_numeric(data["future_roic_proxy"], errors="coerce")
    data["realized_fcf_margin_3y"] = pd.to_numeric(data["future_fcf_margin"], errors="coerce")
    data["realized_ev_to_sales_3y"] = pd.to_numeric(data["future_ev_to_sales"], errors="coerce")
    data["realized_pb_3y"] = pd.to_numeric(data["future_pb"], errors="coerce")
    data["realized_multiple_change_3y"] = np.where(
        (data["ev_to_sales"] > 0) & (data["future_ev_to_sales"] > 0),
        np.log(data["future_ev_to_sales"] / data["ev_to_sales"]),
        np.nan,
    )
    data["realized_price_change_3y_from_panel"] = np.where(
        (data["price_t0"] > 0) & (data["future_price_t0"] > 0),
        np.log(data["future_price_t0"] / data["price_t0"]),
        np.nan,
    )
    return data


def build_expectation_violations(data: pd.DataFrame) -> pd.DataFrame:
    out = data.copy()
    out["growth_violation_3y"] = out["realized_revenue_cagr_3y"] - out["implied_revenue_cagr"]
    out["margin_violation_3y"] = out["realized_ebit_margin_3y"] - out["implied_terminal_ebit_margin"]
    out["roic_violation_3y"] = out["realized_roic_3y"] - out["implied_incremental_roic"]
    out["fcf_violation_3y"] = out["realized_fcf_margin_3y"] - out["fcf_margin"]
    out["multiple_violation_3y"] = -(out["realized_multiple_change_3y"])
    out["growth_violation_z"] = zscore_by_year(out, "growth_violation_3y")
    out["margin_violation_z"] = zscore_by_year(out, "margin_violation_3y")
    out["roic_violation_z"] = zscore_by_year(out, "roic_violation_3y")
    out["fcf_violation_z"] = zscore_by_year(out, "fcf_violation_3y")
    out["multiple_violation_z"] = zscore_by_year(out, "multiple_violation_3y")
    out["expectation_violation_score"] = (
        0.25 * out["growth_violation_z"].fillna(0.0)
        + 0.25 * out["margin_violation_z"].fillna(0.0)
        + 0.25 * out["roic_violation_z"].fillna(0.0)
        + 0.15 * out["fcf_violation_z"].fillna(0.0)
        + 0.10 * out["multiple_violation_z"].fillna(0.0)
    )
    out["expectation_violation_observed"] = out[
        ["growth_violation_3y", "margin_violation_3y", "roic_violation_3y", "fcf_violation_3y"]
    ].notna().sum(axis=1) >= 3
    out["research_priority_target"] = (
        0.35 * out["expectation_violation_score"].fillna(0.0)
        + 0.25 * zscore_by_year(out, "ann_return_3y_fwd").fillna(0.0)
        + 0.15 * (-zscore_by_year(out, "drawdown_3y_trailing").fillna(0.0))
        + 0.15 * out["omega_feasibility_score"].fillna(0.0)
        + 0.10 * (1 - out["omega_expectations_pressure"].fillna(0.5))
    )
    return out


def dataset_summary(data: pd.DataFrame) -> dict[str, Any]:
    observed = data.loc[data["expectation_violation_observed"]].copy()
    return {
        "rows": int(len(data)),
        "observed_rows": int(len(observed)),
        "tickers": int(data["ticker"].nunique()),
        "year_min": int(data["year"].min()) if len(data) else None,
        "year_max": int(data["year"].max()) if len(data) else None,
        "observed_share": float(len(observed) / max(1, len(data))),
        "mean_expectation_violation_score": safe_float(observed["expectation_violation_score"].mean()),
        "mean_ann_return_3y_fwd": safe_float(observed["ann_return_3y_fwd"].mean()),
        "regime_counts": {str(k): int(v) for k, v in data["omega_regime"].value_counts(dropna=False).to_dict().items()},
        "question_counts": {str(k): int(v) for k, v in data["omega_primary_question"].value_counts(dropna=False).to_dict().items()},
        "coverage": {
            "growth": float(observed["growth_violation_3y"].notna().mean()) if len(observed) else 0.0,
            "margin": float(observed["margin_violation_3y"].notna().mean()) if len(observed) else 0.0,
            "roic": float(observed["roic_violation_3y"].notna().mean()) if len(observed) else 0.0,
            "fcf": float(observed["fcf_violation_3y"].notna().mean()) if len(observed) else 0.0,
            "multiple": float(observed["multiple_violation_3y"].notna().mean()) if len(observed) else 0.0,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-tickers", type=int, default=None)
    parser.add_argument("--force-panel-rebuild", action="store_true")
    parser.add_argument("--output-dir", default=None)
    args = parser.parse_args()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    artifact_dir = Path(args.output_dir) if args.output_dir else ARTIFACT_ROOT / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)

    featured = prepare_featured_panel(args.max_tickers, args.force_panel_rebuild)
    dataset = build_expectation_violations(build_realized_future_labels(featured))
    summary = dataset_summary(dataset)
    summary["panel_source"] = featured.attrs.get("panel_source")
    summary["requested_tickers"] = int(len(featured.attrs.get("requested_tickers", [])))

    dataset.to_parquet(artifact_dir / "aurora_omega_v8_dataset.parquet", index=False)
    dataset.head(250).to_csv(artifact_dir / "aurora_omega_v8_dataset_head.csv", index=False)
    (artifact_dir / "aurora_omega_v8_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(artifact_dir), encoding="utf-8")
    print(json.dumps({"artifact_dir": str(artifact_dir), **summary}, indent=2, default=str))


if __name__ == "__main__":
    main()
