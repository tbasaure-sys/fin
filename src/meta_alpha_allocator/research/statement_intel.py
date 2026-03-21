from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import PathConfig, ResearchSettings
from ..data.fmp_client import FMPClient
from ..utils import ensure_directory
from .earnings_cash_kernel import run_earnings_cash_kernel


@dataclass(frozen=True)
class StatementIntelArtifacts:
    panel: pd.DataFrame
    summary: dict


def _safe_semicolon_csv(path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path, sep=";", decimal=",", thousands=".")


def _bounded_score(series: pd.Series, *, reverse: bool = False, neutral: float = 0.5) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    if reverse:
        numeric = -numeric
    ranked = numeric.rank(pct=True)
    return ranked.fillna(neutral).clip(0.0, 1.0)


def _statement_bucket(row: pd.Series) -> str:
    if row["statement_score"] >= 0.72 and row["compounder_score"] >= 0.62 and row["financial_health_score"] >= 0.65:
        return "robust"
    if row["valuation_context_score"] >= 0.65 and row["financial_health_score"] >= 0.45:
        return "improving"
    if row["risk_penalty_score"] <= 0.30 and row["financial_health_score"] <= 0.35:
        return "fragile"
    return "speculative"


def _build_commentary(row: pd.Series) -> str:
    strengths: list[str] = []
    risks: list[str] = []
    if row.get("gross_margin", 0) and row["gross_margin"] > 0.45:
        strengths.append("strong gross margin")
    if row.get("ebitda_margin", 0) and row["ebitda_margin"] > 0.18:
        strengths.append("healthy EBITDA margin")
    if row.get("roic", 0) and row["roic"] > 0.12:
        strengths.append("solid capital efficiency")
    if row.get("fcf_yield", 0) and row["fcf_yield"] > 0.03:
        strengths.append("positive free cash flow support")
    if row.get("compounder_score", 0) and row["compounder_score"] > 0.68:
        strengths.append("compounder-like reinvestment profile")
    if row.get("valuation_gap", 0) and row["valuation_gap"] > 0.20:
        strengths.append("valuation support")
    if pd.notna(row.get("debt_to_ebitda")) and row["debt_to_ebitda"] > 4.0:
        risks.append("elevated leverage")
    if pd.notna(row.get("ebitda_margin")) and row["ebitda_margin"] < 0:
        risks.append("negative EBITDA margin")
    if pd.notna(row.get("roic")) and row["roic"] < 0:
        risks.append("negative ROIC")
    if pd.notna(row.get("fcf_yield")) and row["fcf_yield"] < 0:
        risks.append("negative free cash flow yield")
    if pd.notna(row.get("valuation_gap")) and row["valuation_gap"] < -0.20:
        risks.append("stretched valuation")
    if pd.notna(row.get("beta")) and row["beta"] > 1.8:
        risks.append("high market sensitivity")
    strength_text = ", ".join(strengths[:3]) if strengths else "limited accounting support"
    risk_text = ", ".join(risks[:3]) if risks else "no major balance-sheet or valuation red flag"
    return f"Strengths: {strength_text}. Risks: {risk_text}."


def run_statement_intelligence(paths: PathConfig, settings: ResearchSettings) -> StatementIntelArtifacts:
    ensure_directory(settings.statement_output_dir)
    fmp_client = FMPClient.from_env(paths.cache_root)
    latest_root = paths.resolve_portfolio_manager_latest_root(
        "screener.csv",
        "valuation_summary.csv",
        "holdings_normalized.csv",
    )
    screener = _safe_semicolon_csv(latest_root / "screener.csv")
    valuation = _safe_semicolon_csv(latest_root / "valuation_summary.csv")
    holdings = _safe_semicolon_csv(latest_root / "holdings_normalized.csv")
    portfolio_summary_path = latest_root / "portfolio_summary.json"
    portfolio_summary = json.loads(portfolio_summary_path.read_text(encoding="utf-8").replace("NaN", "null")) if portfolio_summary_path.exists() else {}
    top_ideas = pd.DataFrame(portfolio_summary.get("top_ideas", []))

    panel = screener.copy()
    if panel.empty:
        summary = {"top_statement_names": [], "risk_names": [], "warnings": ["statement intelligence panel is empty"]}
        return StatementIntelArtifacts(panel=panel, summary=summary)

    kernel_artifacts = run_earnings_cash_kernel(paths, settings, fmp_client=fmp_client)

    panel = panel.merge(
        valuation[["ticker", "fair_value", "upside", "confidence"]].copy(),
        on="ticker",
        how="left",
        suffixes=("", "_valuation"),
    )
    if not top_ideas.empty:
        panel = panel.merge(
            top_ideas[["ticker", "market_cap", "gross_margin", "ebitda_margin", "roic", "fcf_yield", "debt_to_ebitda", "analyst_consensus"]].copy(),
            on="ticker",
            how="left",
            suffixes=("", "_idea"),
        )
    if not holdings.empty:
        panel = panel.merge(
            holdings[["ticker", "weight"]].copy(),
            on="ticker",
            how="left",
            suffixes=("", "_holding"),
        )
    if not kernel_artifacts.latest_panel.empty:
        kernel_columns = [
            "ticker",
            "earnings_cash_kernel_score",
            "earnings_cash_kernel_bucket",
            "earnings_cash_kernel_commentary",
            "kernel_components",
            "kernel_data_quality",
            "ocf_to_net_income",
            "fcf_to_net_income",
            "accrual_intensity",
            "conversion_gap_growth",
            "quarters_available",
        ]
        available_kernel_columns = [column for column in kernel_columns if column in kernel_artifacts.latest_panel.columns]
        panel = panel.merge(kernel_artifacts.latest_panel[available_kernel_columns].copy(), on="ticker", how="left")
    for column, default in {
        "earnings_cash_kernel_score": np.nan,
        "earnings_cash_kernel_bucket": "insufficient_history",
        "earnings_cash_kernel_commentary": "No kernel coverage available.",
        "kernel_components": json.dumps({}),
        "kernel_data_quality": 0.0,
        "ocf_to_net_income": np.nan,
        "fcf_to_net_income": np.nan,
        "accrual_intensity": np.nan,
        "conversion_gap_growth": np.nan,
        "quarters_available": 0,
    }.items():
        if column not in panel.columns:
            panel[column] = default

    numeric_columns = [
        "gross_margin",
        "ebitda_margin",
        "roic",
        "fcf_yield",
        "debt_to_ebitda",
        "forward_pe",
        "ev_to_ebitda",
        "beta",
        "momentum_6m",
        "valuation_gap",
        "composite_score",
        "quality_score",
        "value_score",
        "risk_score",
        "growth_score",
        "suggested_position",
        "weight",
        "upside",
        "earnings_cash_kernel_score",
        "kernel_data_quality",
        "ocf_to_net_income",
        "fcf_to_net_income",
        "accrual_intensity",
        "conversion_gap_growth",
    ]
    for column in numeric_columns:
        if column in panel.columns:
            panel[column] = pd.to_numeric(panel[column], errors="coerce")

    panel["profitability_score"] = (
        0.35 * _bounded_score(panel.get("gross_margin", pd.Series(dtype=float)))
        + 0.35 * _bounded_score(panel.get("ebitda_margin", pd.Series(dtype=float)))
        + 0.30 * _bounded_score(panel.get("roic", pd.Series(dtype=float)))
    )
    panel["capital_efficiency_score"] = (
        0.45 * _bounded_score(panel.get("roic", pd.Series(dtype=float)))
        + 0.30 * _bounded_score(panel.get("gross_margin", pd.Series(dtype=float)))
        + 0.25 * _bounded_score(panel.get("ebitda_margin", pd.Series(dtype=float)))
    )
    panel["cash_generation_score"] = (
        0.60 * _bounded_score(panel.get("fcf_yield", pd.Series(dtype=float)))
        + 0.40 * _bounded_score(panel.get("debt_to_ebitda", pd.Series(dtype=float)), reverse=True)
    )
    panel["cash_conversion_proxy_score"] = (
        0.50 * _bounded_score(panel.get("fcf_yield", pd.Series(dtype=float)))
        + 0.30 * _bounded_score(panel.get("ebitda_margin", pd.Series(dtype=float)))
        + 0.20 * _bounded_score(panel.get("gross_margin", pd.Series(dtype=float)))
    )
    panel["reinvestment_proxy_score"] = (
        0.40 * _bounded_score(panel.get("growth_score", pd.Series(dtype=float)))
        + 0.35 * _bounded_score(panel.get("quality_score", pd.Series(dtype=float)))
        + 0.25 * _bounded_score(panel.get("roic", pd.Series(dtype=float)))
    )
    panel["compounder_score"] = (
        0.35 * panel["capital_efficiency_score"]
        + 0.30 * panel["cash_generation_score"]
        + 0.20 * panel["reinvestment_proxy_score"]
        + 0.15 * _bounded_score(panel.get("gross_margin", pd.Series(dtype=float)))
    ).clip(0.0, 1.0)
    panel["valuation_support_score"] = (
        0.65 * _bounded_score(panel.get("valuation_gap", panel.get("upside", pd.Series(dtype=float))))
        + 0.35 * _bounded_score(panel.get("forward_pe", pd.Series(dtype=float)), reverse=True)
    )
    panel["valuation_context_score"] = (
        0.55 * panel["valuation_support_score"]
        + 0.25 * _bounded_score(panel.get("confidence", pd.Series(dtype=float)))
        + 0.20 * _bounded_score(panel.get("ev_to_ebitda", pd.Series(dtype=float)), reverse=True)
    ).clip(0.0, 1.0)
    panel["market_behavior_score"] = (
        0.50 * _bounded_score(panel.get("momentum_6m", pd.Series(dtype=float)))
        + 0.30 * _bounded_score(panel.get("beta", pd.Series(dtype=float)), reverse=True)
        + 0.20 * _bounded_score(panel.get("risk_score", pd.Series(dtype=float)))
    )
    panel["financial_health_score"] = 0.55 * panel["profitability_score"] + 0.45 * panel["cash_generation_score"]
    panel["risk_penalty_score"] = (
        0.40 * (1.0 - _bounded_score(panel.get("debt_to_ebitda", pd.Series(dtype=float)), reverse=True))
        + 0.30 * (1.0 - _bounded_score(panel.get("beta", pd.Series(dtype=float)), reverse=True))
        + 0.30 * (1.0 - _bounded_score(panel.get("risk_score", pd.Series(dtype=float))))
    )
    panel["statement_score"] = (
        0.30 * panel["financial_health_score"]
        + 0.22 * panel["valuation_context_score"]
        + 0.20 * panel["compounder_score"]
        + 0.15 * panel["market_behavior_score"]
        + 0.13 * _bounded_score(panel.get("composite_score", pd.Series(dtype=float)))
    ).clip(0.0, 1.0)
    panel["statement_conviction_score"] = (
        0.78 * panel["statement_score"]
        + 0.22 * panel.get("earnings_cash_kernel_score", pd.Series(0.5, index=panel.index)).fillna(0.5)
    ).clip(0.0, 1.0)
    panel["statement_bucket"] = panel.apply(_statement_bucket, axis=1)
    panel["statement_commentary"] = panel.apply(_build_commentary, axis=1)
    panel["portfolio_weight"] = panel.get("weight", pd.Series(np.nan, index=panel.index)).fillna(0.0)
    panel["is_current_holding"] = panel["portfolio_weight"] > 0

    sort_cols = ["is_current_holding", "statement_conviction_score", "statement_score", "financial_health_score", "valuation_support_score"]
    panel = panel.sort_values(sort_cols, ascending=[False, False, False, False, False]).reset_index(drop=True)

    top_names = panel[
        [
            "ticker",
            "sector",
            "statement_score",
            "statement_conviction_score",
            "earnings_cash_kernel_score",
            "earnings_cash_kernel_bucket",
            "statement_bucket",
            "statement_commentary",
        ]
    ].head(12)
    top_compounders = panel.sort_values(["compounder_score", "statement_score"], ascending=[False, False])[
        ["ticker", "sector", "compounder_score", "statement_bucket", "statement_commentary"]
    ].head(12)
    top_cash_generators = panel.sort_values(["cash_generation_score", "cash_conversion_proxy_score"], ascending=[False, False])[
        ["ticker", "sector", "cash_generation_score", "cash_conversion_proxy_score", "statement_bucket", "statement_commentary"]
    ].head(12)
    top_kernel_names = panel.sort_values(["earnings_cash_kernel_score", "statement_conviction_score"], ascending=[False, False])[
        [
            "ticker",
            "sector",
            "earnings_cash_kernel_score",
            "earnings_cash_kernel_bucket",
            "statement_conviction_score",
            "earnings_cash_kernel_commentary",
        ]
    ].head(12)
    cash_mismatch_names = panel.sort_values(["earnings_cash_kernel_score", "statement_score"], ascending=[True, False])[
        [
            "ticker",
            "sector",
            "statement_score",
            "earnings_cash_kernel_score",
            "earnings_cash_kernel_bucket",
            "statement_commentary",
            "earnings_cash_kernel_commentary",
        ]
    ].head(12)
    risk_names = panel.sort_values(["risk_penalty_score", "statement_score"], ascending=[False, True])[
        ["ticker", "sector", "risk_penalty_score", "statement_bucket", "statement_commentary"]
    ].head(12)

    summary = {
        "top_statement_names": json.loads(top_names.to_json(orient="records")),
        "top_compounders": json.loads(top_compounders.to_json(orient="records")),
        "top_cash_generators": json.loads(top_cash_generators.to_json(orient="records")),
        "top_kernel_names": json.loads(top_kernel_names.to_json(orient="records")),
        "cash_mismatch_names": json.loads(cash_mismatch_names.to_json(orient="records")),
        "kernel_sector_breadth": kernel_artifacts.summary.get("sector_kernel_breadth", []),
        "kernel_research_utility": kernel_artifacts.summary.get("research_utility", {}),
        "risk_names": json.loads(risk_names.to_json(orient="records")),
        "coverage": int(len(panel)),
        "holdings_coverage": int(panel["is_current_holding"].sum()),
        "warnings": kernel_artifacts.summary.get("warnings", []),
    }
    panel.to_csv(settings.statement_output_dir / "statement_intelligence.csv", index=False)
    (settings.statement_output_dir / "statement_intelligence_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return StatementIntelArtifacts(panel=panel, summary=summary)
