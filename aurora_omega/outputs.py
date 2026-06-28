from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .data import LENS_NAMES, OmegaBundle


def write_valuation_mri(bundle: OmegaBundle, eval_out: dict[str, Any], artifact_dir: Path, limit: int = 400) -> list[dict[str, Any]]:
    frame = bundle.frame.iloc[eval_out["row_index"]].copy().reset_index(drop=True)
    frame["omega_pred_1y"] = eval_out["pred_returns"][:, 0]
    frame["omega_pred_3y"] = eval_out["pred_returns"][:, 1]
    frame["omega_moe_3y"] = eval_out["omega_return"]
    frame["omega_regime_pred"] = [bundle.regimes[int(i)] for i in eval_out["regime_pred"]]
    frame["omega_question_pred"] = [bundle.questions[int(i)] for i in eval_out["question_pred"]]
    for idx, name in enumerate(LENS_NAMES):
        frame[f"omega_weight_{name}"] = eval_out["lens_weights"][:, idx]

    latest = frame.sort_values(["ticker", "year"]).groupby("ticker", as_index=False).tail(1)
    memos: list[dict[str, Any]] = []
    for _, row in latest.head(limit).iterrows():
        weights = {name: float(row[f"omega_weight_{name}"]) for name in LENS_NAMES}
        top_lenses = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:3]
        uncertainty = float(1.0 - max(weights.values()))
        memo = {
            "ticker": row["ticker"],
            "year": int(row["year"]),
            "asof_date": row.get("asof_date"),
            "valuation_mri_version": "omega_v0",
            "predicted_regime": row["omega_regime_pred"],
            "primary_question": row["omega_question_pred"],
            "predicted_returns": {
                "1y": float(row["omega_pred_1y"]),
                "3y": float(row["omega_pred_3y"]),
                "moe_3y": float(row["omega_moe_3y"]),
            },
            "lens_weights": weights,
            "top_lenses": [{"lens": lens, "weight": weight} for lens, weight in top_lenses],
            "neural_business_state": {
                "expectations_pressure": float(row.get("omega_expectations_pressure", np.nan)),
                "feasibility": float(row.get("omega_feasibility_score", np.nan)),
                "downside_anchor": float(row.get("omega_downside_anchor_score", np.nan)),
                "router_uncertainty_proxy": uncertainty,
            },
            "abstain": bool(uncertainty > 0.72),
        }
        memos.append(memo)

    artifact_dir.mkdir(parents=True, exist_ok=True)
    (artifact_dir / "valuation_mri.jsonl").write_text(
        "\n".join(json.dumps(memo, default=str) for memo in memos) + ("\n" if memos else ""),
        encoding="utf-8",
    )
    frame.to_csv(artifact_dir / "omega_validation_predictions.csv", index=False)
    return memos
