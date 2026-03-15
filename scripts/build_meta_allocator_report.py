from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from docx import Document
from docx.enum.section import WD_SECTION_START
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = PROJECT_ROOT / "output"
RESEARCH_ROOT = OUTPUT_ROOT / "research" / "latest"
PRODUCTION_ROOT = OUTPUT_ROOT / "production" / "latest"
POLICY_ROOT = OUTPUT_ROOT / "policy" / "latest"
DOC_ROOT = OUTPUT_ROOT / "doc"
TMP_ROOT = PROJECT_ROOT / "tmp" / "docs"


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _pct(value: float) -> str:
    if pd.isna(value):
        return "-"
    return f"{value * 100:.1f}%"


def _num(value: float, digits: int = 2) -> str:
    if pd.isna(value):
        return "-"
    return f"{value:.{digits}f}"


def _shade(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def _style(document: Document) -> None:
    section = document.sections[0]
    section.top_margin = Inches(0.7)
    section.bottom_margin = Inches(0.7)
    section.left_margin = Inches(0.8)
    section.right_margin = Inches(0.8)
    for style_name, size in [("Normal", 10.5), ("Title", 22), ("Heading 1", 15), ("Heading 2", 12)]:
        style = document.styles[style_name]
        style.font.name = "Aptos"
        style.font.size = Pt(size)


def _bullet(document: Document, text: str) -> None:
    paragraph = document.add_paragraph(style="List Bullet")
    paragraph.add_run(text)


def _table(document: Document, headers: list[str], rows: list[list[str]]) -> None:
    table = document.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"
    for idx, header in enumerate(headers):
        cell = table.rows[0].cells[idx]
        cell.text = header
        _shade(cell, "D8EAF6")
    for row in rows:
        cells = table.add_row().cells
        for idx, value in enumerate(row):
            cells[idx].text = value


def _growth_chart(daily_returns: pd.DataFrame, out_path: Path) -> None:
    cumulative = (1.0 + daily_returns[["spy", "state_overlay", "meta_allocator"]].fillna(0.0)).cumprod()
    plt.figure(figsize=(9.4, 4.8))
    plt.plot(cumulative.index, cumulative["spy"], label="SPY buy and hold", linewidth=2.1, color="#16324f")
    plt.plot(cumulative.index, cumulative["state_overlay"], label="Heuristic state overlay", linewidth=2.0, color="#0f8a6d")
    plt.plot(cumulative.index, cumulative["meta_allocator"], label="Legacy full allocator", linewidth=1.7, color="#b86128")
    plt.title("Growth of $1")
    plt.ylabel("Cumulative wealth")
    plt.grid(alpha=0.25)
    plt.legend(frameon=False)
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=180)
    plt.close()


def _overlay_chart(daily_returns: pd.DataFrame, policy_returns: pd.DataFrame, out_path: Path) -> None:
    joined = pd.concat(
        [
            daily_returns[["spy"]].rename(columns={"spy": "benchmark_spy"}),
            policy_returns[["heuristic_state_overlay", "policy_overlay", "vol_target", "trend_following"]],
        ],
        axis=1,
        sort=False,
    ).fillna(0.0)
    cumulative = (1.0 + joined).cumprod()
    plt.figure(figsize=(9.4, 4.8))
    plt.plot(cumulative.index, cumulative["benchmark_spy"], label="SPY", linewidth=1.8, color="#16324f")
    plt.plot(cumulative.index, cumulative["heuristic_state_overlay"], label="Heuristic overlay", linewidth=1.9, color="#1f9d83")
    plt.plot(cumulative.index, cumulative["policy_overlay"], label="Policy overlay", linewidth=2.1, color="#9e4d0f")
    plt.plot(cumulative.index, cumulative["vol_target"], label="Vol target", linewidth=1.5, color="#6d6d6d")
    plt.plot(cumulative.index, cumulative["trend_following"], label="Trend following", linewidth=1.5, color="#7647a2")
    plt.title("Overlay Comparison")
    plt.ylabel("Cumulative wealth")
    plt.grid(alpha=0.25)
    plt.legend(frameon=False, ncol=2)
    plt.tight_layout()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out_path, dpi=180)
    plt.close()


def _title_block(document: Document, research_summary: dict, policy_summary: dict, current_policy: dict) -> None:
    title = document.add_paragraph()
    title.style = "Title"
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.add_run("Meta Allocator Report").bold = True

    subtitle = document.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.add_run("New methodology, full backtest, production decision, and implementation structure").italic = True

    meta = document.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.add_run(
        "Research window: "
        f"{research_summary['oos_blocks'][0]['start']} to {research_summary['oos_blocks'][-1]['end']} | "
        f"Live policy date: {current_policy['date']}"
    )

    note = document.add_paragraph()
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    note.add_run(
        "Current core methodology: state engine plus learned beta sizing plus dynamic hedge switching."
    ).bold = True


def _executive_summary(document: Document, research_summary: dict, policy_summary: dict) -> None:
    document.add_heading("1. Executive Summary", level=1)
    document.add_paragraph(
        "The project has now been reframed around one central decision problem: how much equity risk to hold, "
        "and what hedge to use when risk should be reduced. This is a cleaner and more defensible objective "
        "than forcing a stock picker to carry the full burden."
    )
    _bullet(
        document,
        f"SPY buy and hold: CAGR {_pct(research_summary['benchmark_spy']['annual_return'])}, "
        f"Sharpe {_num(research_summary['benchmark_spy']['sharpe'])}, max drawdown {_pct(research_summary['benchmark_spy']['max_drawdown'])}.",
    )
    _bullet(
        document,
        f"Heuristic state overlay: CAGR {_pct(research_summary['state_overlay']['annual_return'])}, "
        f"Sharpe {_num(research_summary['state_overlay']['sharpe'])}, max drawdown {_pct(research_summary['state_overlay']['max_drawdown'])}.",
    )
    _bullet(
        document,
        f"Policy overlay: CAGR {_pct(policy_summary['policy_overlay']['annual_return'])}, "
        f"Sharpe {_num(policy_summary['policy_overlay']['sharpe'])}, max drawdown {_pct(policy_summary['policy_overlay']['max_drawdown'])}.",
    )
    _bullet(
        document,
        "Conclusion: the new policy overlay now improves on the heuristic overlay in Sharpe and drawdown, "
        "but it still does not beat the strongest simple benchmark such as trend following.",
    )


def _plain_language(document: Document, current_policy: dict) -> None:
    document.add_heading("2. The Idea In Plain Language", level=1)
    document.add_paragraph(
        "A simple investor in SPY stays fully exposed almost all the time. This system does something more specific: "
        "it tries to decide how much equity exposure is justified today, and what protection asset is best if the answer is not 100%."
    )
    _bullet(document, "Question 1: how dangerous is the current regime?")
    _bullet(document, "Question 2: should equity exposure be high, medium, or low?")
    _bullet(document, "Question 3: if risk should be reduced, is the best hedge SHY, IEF, GLD, UUP, BIL, or TLT?")
    document.add_paragraph(
        "The live recommendation today is easy to read even for a non-technical user: "
        f"hold roughly {_pct(current_policy['beta_target'])} in SPY and use {current_policy['selected_hedge']} as the main hedge."
    )


def _methodology(document: Document, current_policy: dict) -> None:
    document.add_heading("3. Methodology", level=1)
    document.add_paragraph(
        "The current methodology is no longer a generic allocator. It is a two-part overlay:"
    )
    _bullet(document, "State engine: estimates fragility using Fin_model signals, tail-risk probabilities, macro variables, and cross-asset structure.")
    _bullet(document, "Decision engine: learns a beta bucket and then pairs it with the highest-ranked hedge from the hedge engine.")

    document.add_heading("4. Data And Feature Stack", level=1)
    _bullet(document, "Price history: S&P 500 universe prices plus ETF proxies for sectors, rates, gold, dollar, and international markets.")
    _bullet(document, "Macro and liquidity: FRED term spread, Fed funds, M2, balance sheet, and credit spreads.")
    _bullet(document, "State inputs: crash probability, legitimacy risk, crowding, tension, recurrence, and multi-horizon tail-loss probabilities.")
    _bullet(document, "Opportunity context: sector and international maps are retained as supporting context, not as the main decision driver.")
    _bullet(document, "Hedge features: down-market behavior, stress behavior, correlation to SPY, carry, volatility, and recent drawdown.")

    document.add_heading("5. Learning Target", level=1)
    document.add_paragraph(
        "The learned overlay does not try to predict exact returns. Instead, for each historical date it asks: "
        "which beta bucket would have produced the best forward utility over the next 5, 10, and 20 trading days, "
        "given the hedge that the hedge engine would have selected at that time?"
    )
    _bullet(document, "Utility rewards forward compounding.")
    _bullet(document, "Utility penalizes drawdown and downside deviation.")
    _bullet(document, "Training is walk-forward with embargo and monthly refits.")
    _bullet(document, "When confidence is low, the system can fall back to a neutral bucket instead of pretending certainty.")

    document.add_heading("6. Current Production Decision", level=1)
    _bullet(document, f"Date: {current_policy['date']}")
    _bullet(document, f"Recommended beta bucket: {_pct(current_policy['beta_target'])}")
    _bullet(document, f"Selected hedge: {current_policy['selected_hedge']}")
    _bullet(document, f"Alternative action: {current_policy['alternative_action']}")
    _bullet(document, f"Model confidence: {_pct(current_policy['confidence'])}")
    for line in current_policy["explanation_fields"]["why_this_action"]:
        _bullet(document, f"Why: {line}")


def _implementation_structure(document: Document) -> None:
    document.add_heading("7. Implementation Structure", level=1)
    document.add_paragraph(
        "The implementation is now organized so the system can be maintained and extended without rethinking the whole repo each time."
    )
    _table(
        document,
        ["Layer", "Responsibility", "Current Output"],
        [
            ["Data", "Load local history, FMP market proxies, FRED macro series, and defensive ETF history", "clean panels for prices, state, volume, macro"],
            ["Research", "Build state features, tail-risk probabilities, hedge rankings, and walk-forward backtests", "research_summary.json, policy_backtest_summary.json"],
            ["Decision", "Map state into beta bucket plus hedge choice", "current_policy_decision.json"],
            ["Production", "Emit live policy, sector/international context, and hedge ranking", "current_allocator_decision.json and supporting csv files"],
        ],
    )
    document.add_paragraph(
        "The most important design choice is separation of concerns. The state engine senses conditions, "
        "the hedge engine ranks protection assets, and the policy engine only decides exposure size."
    )


def _results(document: Document, research_summary: dict, policy_summary: dict, daily_returns: pd.DataFrame, policy_returns: pd.DataFrame) -> None:
    document.add_heading("8. Backtest Results", level=1)
    growth_path = TMP_ROOT / "meta_allocator_growth.png"
    overlay_path = TMP_ROOT / "policy_overlay_comparison.png"
    _growth_chart(daily_returns, growth_path)
    _overlay_chart(daily_returns, policy_returns, overlay_path)
    document.add_paragraph("Legacy allocator context:")
    document.add_picture(str(growth_path), width=Inches(6.8))
    document.add_paragraph("Current overlay comparison:")
    document.add_picture(str(overlay_path), width=Inches(6.8))

    _table(
        document,
        ["Strategy", "Total Return", "CAGR", "Vol", "Sharpe", "Max Drawdown"],
        [
            ["SPY buy and hold", _pct(research_summary["benchmark_spy"]["total_return"]), _pct(research_summary["benchmark_spy"]["annual_return"]), _pct(research_summary["benchmark_spy"]["annual_vol"]), _num(research_summary["benchmark_spy"]["sharpe"]), _pct(research_summary["benchmark_spy"]["max_drawdown"])],
            ["Selection standalone", _pct(research_summary["selection_standalone"]["total_return"]), _pct(research_summary["selection_standalone"]["annual_return"]), _pct(research_summary["selection_standalone"]["annual_vol"]), _num(research_summary["selection_standalone"]["sharpe"]), _pct(research_summary["selection_standalone"]["max_drawdown"])],
            ["Heuristic state overlay", _pct(research_summary["state_overlay"]["total_return"]), _pct(research_summary["state_overlay"]["annual_return"]), _pct(research_summary["state_overlay"]["annual_vol"]), _num(research_summary["state_overlay"]["sharpe"]), _pct(research_summary["state_overlay"]["max_drawdown"])],
            ["Policy overlay", _pct(policy_summary["policy_overlay"]["total_return"]), _pct(policy_summary["policy_overlay"]["annual_return"]), _pct(policy_summary["policy_overlay"]["annual_vol"]), _num(policy_summary["policy_overlay"]["sharpe"]), _pct(policy_summary["policy_overlay"]["max_drawdown"])],
        ],
    )

    document.add_heading("9. Benchmarking The Overlay", level=1)
    _table(
        document,
        ["Overlay Benchmark", "CAGR", "Sharpe", "Max Drawdown"],
        [
            ["Heuristic overlay", _pct(policy_summary["heuristic_state_overlay"]["annual_return"]), _num(policy_summary["heuristic_state_overlay"]["sharpe"]), _pct(policy_summary["heuristic_state_overlay"]["max_drawdown"])],
            ["Policy overlay", _pct(policy_summary["policy_overlay"]["annual_return"]), _num(policy_summary["policy_overlay"]["sharpe"]), _pct(policy_summary["policy_overlay"]["max_drawdown"])],
            ["Static 60/40", _pct(policy_summary["static_60_40"]["annual_return"]), _num(policy_summary["static_60_40"]["sharpe"]), _pct(policy_summary["static_60_40"]["max_drawdown"])],
            ["Vol target", _pct(policy_summary["vol_target"]["annual_return"]), _num(policy_summary["vol_target"]["sharpe"]), _pct(policy_summary["vol_target"]["max_drawdown"])],
            ["Trend following", _pct(policy_summary["trend_following"]["annual_return"]), _num(policy_summary["trend_following"]["sharpe"]), _pct(policy_summary["trend_following"]["max_drawdown"])],
        ],
    )
    document.add_paragraph(
        "This is the honest ranking: the policy overlay now beats the heuristic overlay on Sharpe and on drawdown, "
        "but a strong trend-following baseline is still better overall."
    )


def _oos_and_confidence(document: Document, research_summary: dict, policy_summary: dict) -> None:
    document.add_heading("10. Out-of-Sample And Confidence Behavior", level=1)
    _table(
        document,
        ["Block", "Start", "End", "CAGR", "Sharpe", "Max Drawdown"],
        [
            [str(i), block["start"], block["end"], _pct(block["annual_return"]), _num(block["sharpe"]), _pct(block["max_drawdown"])]
            for i, block in enumerate(research_summary["oos_blocks"], start=1)
        ],
    )
    hi = policy_summary["high_vs_low_confidence"]["high"]
    lo = policy_summary["high_vs_low_confidence"]["low"]
    _table(
        document,
        ["Confidence bucket", "CAGR", "Sharpe", "Max Drawdown"],
        [
            ["High confidence", _pct(hi["annual_return"]), _num(hi["sharpe"]), _pct(hi["max_drawdown"])],
            ["Low confidence", _pct(lo["annual_return"]), _num(lo["sharpe"]), _pct(lo["max_drawdown"])],
        ],
    )
    document.add_paragraph(
        "The confidence split is important. High-confidence policy decisions materially outperform low-confidence ones, "
        "which suggests the model is learning something real even if the full overlay is not yet the best benchmark in the stack."
    )


def _why_better(document: Document, research_summary: dict, policy_summary: dict) -> None:
    document.add_heading("11. Why This Can Be Better Than Buy And Hold SPY", level=1)
    document.add_paragraph(
        "The correct claim is not that the system always beats SPY on raw return. It does not. "
        "The better claim is that it gives a more controllable risk profile and a more explicit defense process."
    )
    _bullet(document, f"Policy overlay drawdown: {_pct(policy_summary['policy_overlay']['max_drawdown'])} versus {_pct(research_summary['benchmark_spy']['max_drawdown'])} for SPY.")
    _bullet(document, f"Policy overlay Sharpe: {_num(policy_summary['policy_overlay']['sharpe'])} versus {_num(research_summary['benchmark_spy']['sharpe'])} for SPY.")
    _bullet(document, "The system can rotate between cash-like bills, short Treasuries, intermediate Treasuries, gold, and the dollar instead of assuming one hedge is always best.")
    _bullet(document, "The decision is operationally interpretable: choose a beta bucket and a hedge, not a black-box portfolio.")
    _bullet(document, "A shallower drawdown profile is easier to hold through stress, which matters in real life more than a theoretical optimal line.")


def _limitations(document: Document) -> None:
    document.add_heading("12. Limitations And Next Steps", level=1)
    _bullet(document, "Trend following is still the strongest simple benchmark in the current comparison set.")
    _bullet(document, "The policy overlay still gives up CAGR relative to SPY and to the strongest trend baseline.")
    _bullet(document, "The state model likely still needs calibration work in extreme tail-risk regimes.")
    _bullet(document, "The opportunity mapper is currently supporting context, not yet a validated source of independent return.")
    _bullet(document, "The next rational upgrade is not more stock picking; it is stronger hedge-switching calibration and cleaner beta sizing under regime transitions.")


def _glossary(document: Document) -> None:
    document.add_heading("13. Glossary", level=1)
    _bullet(document, "Beta: how much market exposure is being carried.")
    _bullet(document, "Hedge: the asset used to reduce damage when equities become fragile.")
    _bullet(document, "CAGR: annualized growth rate over the full test.")
    _bullet(document, "Sharpe: return per unit of volatility.")
    _bullet(document, "Max drawdown: worst peak-to-trough decline.")
    _bullet(document, "Out-of-sample: periods not used to fit the model at the time of the decision.")


def build_report() -> Path:
    DOC_ROOT.mkdir(parents=True, exist_ok=True)
    TMP_ROOT.mkdir(parents=True, exist_ok=True)

    research_summary = _load_json(RESEARCH_ROOT / "research_summary.json")
    policy_summary = _load_json(POLICY_ROOT / "policy_backtest_summary.json")
    current_policy = _load_json(POLICY_ROOT / "current_policy_decision.json")
    daily_returns = pd.read_csv(RESEARCH_ROOT / "daily_returns.csv", index_col=0, parse_dates=[0])
    daily_returns.index.name = "date"
    policy_returns = pd.read_csv(POLICY_ROOT / "policy_daily_returns.csv", index_col=0, parse_dates=[0])
    policy_returns.index.name = "date"

    document = Document()
    _style(document)
    _title_block(document, research_summary, policy_summary, current_policy)
    _executive_summary(document, research_summary, policy_summary)
    _plain_language(document, current_policy)
    _methodology(document, current_policy)
    _implementation_structure(document)
    _results(document, research_summary, policy_summary, daily_returns, policy_returns)
    _oos_and_confidence(document, research_summary, policy_summary)
    _why_better(document, research_summary, policy_summary)
    _limitations(document)
    document.add_section(WD_SECTION_START.NEW_PAGE)
    _glossary(document)

    output_path = DOC_ROOT / "meta_allocator_methodology_report.docx"
    document.save(output_path)
    return output_path


if __name__ == "__main__":
    print(build_report())
