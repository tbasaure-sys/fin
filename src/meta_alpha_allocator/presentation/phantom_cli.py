from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from ..config import PathConfig


def _pct(value: float | None, digits: int = 1) -> str:
    if value is None or pd.isna(value):
        return "n/a"
    return f"{value * 100:.{digits}f}%"


def _num(value: float | None, digits: int = 2) -> str:
    if value is None or pd.isna(value):
        return "n/a"
    return f"{value:.{digits}f}"


def _load_json_if_exists(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _load_csv_if_exists(path: Path) -> pd.DataFrame:
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def _rule(char: str = "-", width: int = 92) -> str:
    return char * width


def _section(title: str, width: int = 92) -> str:
    text = f"[ {title} ]"
    return text + " " + "-" * max(width - len(text) - 1, 0)


def _format_metric_row(items: list[tuple[str, str]], width: int = 92) -> str:
    chunks = [f"{label}: {value}" for label, value in items]
    return " | ".join(chunks)


def _top_rows(frame: pd.DataFrame, columns: list[str], limit: int = 5) -> list[str]:
    if frame.empty:
        return ["n/a"]
    rows: list[str] = []
    for _, row in frame.head(limit).iterrows():
        values = [str(row.get(col, "")) for col in columns]
        rows.append(" | ".join(values))
    return rows


def render_phantom_terminal(
    payload: dict,
    research_summary: dict | None = None,
    policy_summary: dict | None = None,
    sector_map: pd.DataFrame | None = None,
    international_map: pd.DataFrame | None = None,
    hedge_ranking: pd.DataFrame | None = None,
) -> str:
    research_summary = research_summary or {}
    policy_summary = policy_summary or {}
    sector_map = sector_map if sector_map is not None else pd.DataFrame()
    international_map = international_map if international_map is not None else pd.DataFrame()
    hedge_ranking = hedge_ranking if hedge_ranking is not None else pd.DataFrame()

    overlay = payload.get("overlay_report", {})
    policy = payload.get("policy_decision", {})
    tail = payload.get("tail_risk", {})
    hedge_summary = overlay.get("hedge_summary", {})
    state = overlay.get("state", {})

    lines = [
        _rule("="),
        "PHANTOM TERMINAL :: LIVE META ALLOCATOR",
        _rule("="),
        _format_metric_row(
            [
                ("Date", str(policy.get("date", overlay.get("as_of_date", "n/a")))),
                ("Regime", str(state.get("regime", "n/a"))),
                ("Beta target", _pct(payload.get("beta_target"))),
                ("Selected hedge", str(payload.get("selected_hedge", "n/a"))),
                ("Confidence", _pct(payload.get("policy_confidence"))),
            ]
        ),
        _format_metric_row(
            [
                ("Crash prob", _pct(state.get("crash_prob"))),
                ("Tail risk", _pct(state.get("tail_risk_score"))),
                ("Legitimacy risk", _pct(state.get("legitimacy_risk"))),
                ("Alt action", str(payload.get("best_alternative_action", "n/a"))),
                ("Best hedge now", str(payload.get("best_hedge_now", "n/a"))),
            ]
        ),
        "",
        _section("Why This Action"),
    ]
    why = policy.get("explanation_fields", {}).get("why_this_action", [])
    if why:
        lines.extend([f"- {item}" for item in why])
    else:
        lines.append("- n/a")
    flips = policy.get("explanation_fields", {}).get("conditions_that_flip_decision", [])
    lines.append("")
    lines.append(_section("Flip Conditions"))
    lines.extend([f"- {item}" for item in flips] if flips else ["- n/a"])

    lines.extend(
        [
            "",
            _section("Strategy Metrics"),
            _format_metric_row(
                [
                    ("Policy CAGR", _pct(policy_summary.get("policy_overlay", {}).get("annual_return"))),
                    ("Policy Sharpe", _num(policy_summary.get("policy_overlay", {}).get("sharpe"))),
                    ("Policy MaxDD", _pct(policy_summary.get("policy_overlay", {}).get("max_drawdown"))),
                ]
            ),
            _format_metric_row(
                [
                    ("Heuristic CAGR", _pct(research_summary.get("state_overlay", {}).get("annual_return"))),
                    ("Heuristic Sharpe", _num(research_summary.get("state_overlay", {}).get("sharpe"))),
                    ("Heuristic MaxDD", _pct(research_summary.get("state_overlay", {}).get("max_drawdown"))),
                ]
            ),
            _format_metric_row(
                [
                    ("SPY CAGR", _pct(research_summary.get("benchmark_spy", {}).get("annual_return"))),
                    ("SPY Sharpe", _num(research_summary.get("benchmark_spy", {}).get("sharpe"))),
                    ("SPY MaxDD", _pct(research_summary.get("benchmark_spy", {}).get("max_drawdown"))),
                ]
            ),
        ]
    )

    if policy_summary.get("high_vs_low_confidence"):
        hi = policy_summary["high_vs_low_confidence"].get("high", {})
        lo = policy_summary["high_vs_low_confidence"].get("low", {})
        lines.extend(
            [
                _format_metric_row(
                    [
                        ("High-conf Sharpe", _num(hi.get("sharpe"))),
                        ("High-conf CAGR", _pct(hi.get("annual_return"))),
                        ("Low-conf Sharpe", _num(lo.get("sharpe"))),
                        ("Low-conf CAGR", _pct(lo.get("annual_return"))),
                    ]
                )
            ]
        )

    lines.extend(
        [
            "",
            _section("Tail Risk"),
            _format_metric_row(
                [
                    ("5d loss prob", _pct(tail.get("tail_loss_5d"))),
                    ("10d loss prob", _pct(tail.get("tail_loss_10d"))),
                    ("20d loss prob", _pct(tail.get("tail_loss_20d"))),
                    ("Composite", _pct(tail.get("tail_risk_score"))),
                ]
            ),
            "",
            _section("Hedge Intel"),
        ]
    )
    if hedge_ranking.empty:
        lines.append("n/a")
    else:
        lines.append("ticker | score | carry_60d | drawdown_63d | corr_spy_63d | view")
        for row in _top_rows(hedge_ranking, ["ticker", "hedge_score", "carry_60d", "drawdown_63d", "corr_spy_63d", "view"], limit=6):
            lines.append(row)

    lines.extend(["", _section("Sector Scanner")])
    if sector_map.empty:
        lines.append("n/a")
    else:
        lines.append("sector | proxy_ticker | opportunity_score | mom_60d | view")
        for row in _top_rows(sector_map, ["sector", "proxy_ticker", "opportunity_score", "mom_60d", "view"], limit=6):
            lines.append(row)

    lines.extend(["", _section("International Map")])
    if international_map.empty:
        lines.append("n/a")
    else:
        lines.append("market | ticker | opportunity_score | mom_60d | view")
        for row in _top_rows(international_map, ["market", "ticker", "opportunity_score", "mom_60d", "view"], limit=6):
            lines.append(row)

    lines.extend(
        [
            "",
            _section("Status"),
            _format_metric_row(
                [
                    ("Primary hedge", str(hedge_summary.get("primary_hedge", "n/a"))),
                    ("Secondary hedge", str(hedge_summary.get("secondary_hedge", "n/a"))),
                    ("UST best hedge", str(hedge_summary.get("us_treasuries_best_hedge", "n/a"))),
                    ("Expected utility", _num(payload.get("policy_expected_utility"), 4)),
                ]
            ),
            _rule("="),
        ]
    )
    return "\n".join(lines)


def load_render_context(paths: PathConfig) -> tuple[dict | None, dict | None, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    research_summary = _load_json_if_exists(paths.output_root / "research" / "latest" / "research_summary.json")
    policy_summary = _load_json_if_exists(paths.output_root / "policy" / "latest" / "policy_backtest_summary.json")
    sector_map = _load_csv_if_exists(paths.output_root / "production" / "latest" / "current_sector_map.csv")
    international_map = _load_csv_if_exists(paths.output_root / "production" / "latest" / "current_international_map.csv")
    hedge_ranking = _load_csv_if_exists(paths.output_root / "production" / "latest" / "current_hedge_ranking.csv")
    return research_summary, policy_summary, sector_map, international_map, hedge_ranking
