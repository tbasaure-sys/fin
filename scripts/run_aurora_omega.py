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

from aurora_omega.data import build_omega_bundle
from aurora_omega.outputs import write_valuation_mri
from aurora_omega.train import TrainConfig, evaluate_omega, train_omega


ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_omega"


def load_router_module() -> Any:
    path = ROOT / "scripts" / "run_aurora_router_local.py"
    spec = importlib.util.spec_from_file_location("aurora_router_local", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["aurora_router_local"] = module
    spec.loader.exec_module(module)
    return module


def prepare_featured_panel(max_tickers: int | None, force_panel_rebuild: bool) -> pd.DataFrame:
    router = load_router_module()
    router.load_env_file()
    api_key = os.environ.get("FMP_API_KEY") or os.environ.get("FINANCIAL_MODELING_PREP_API_KEY")
    tickers = sorted(set(router.CORE_UNIVERSE))
    if max_tickers:
        tickers = tickers[:max_tickers]
    panel = router.build_or_load_panel(api_key, tickers, force=force_panel_rebuild)
    featured = router.add_lens_predictions(router.add_features(panel))
    featured["omega_regime"] = featured.apply(router.classify_spine_regime, axis=1)
    featured["omega_primary_question"] = featured["omega_regime"].map(router.primary_question_for_regime)
    expectations = featured.apply(router.reverse_dcf_expectations, axis=1)
    anchors = featured.apply(lambda row: router.anchor_lens_checks(row, router.classify_spine_regime(row), router.reverse_dcf_expectations(row)), axis=1)
    featured["omega_expectations_pressure"] = [item["valuation_pressure_score"] for item in expectations]
    featured["omega_feasibility_score"] = [
        router.score_expectation_feasibility(row, exp)["score"]
        for (_, row), exp in zip(featured.iterrows(), expectations)
    ]
    featured["omega_downside_anchor_score"] = [item["asset_value"]["score"] for item in anchors]
    return featured


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-tickers", type=int, default=None)
    parser.add_argument("--force-panel-rebuild", action="store_true")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--d-model", type=int, default=128)
    parser.add_argument("--device", default="auto")
    args = parser.parse_args()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    artifact_dir = ARTIFACT_ROOT / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)

    featured = prepare_featured_panel(args.max_tickers, args.force_panel_rebuild)
    bundle = build_omega_bundle(featured)
    cfg = TrainConfig(epochs=args.epochs, batch_size=args.batch_size, d_model=args.d_model, device=args.device)
    model, train_report = train_omega(bundle, cfg, artifact_dir)
    eval_out = evaluate_omega(model, bundle, cfg)
    memos = write_valuation_mri(bundle, eval_out, artifact_dir)

    manifest = {
        "mode": "aurora_omega_v0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "artifact_dir": str(artifact_dir),
        "panel_rows": int(len(featured)),
        "tickers": int(featured["ticker"].nunique()),
        "train_rows": int(len(bundle.train)),
        "val_rows": int(len(bundle.val)),
        "features": bundle.feature_cols,
        "regimes": bundle.regimes,
        "questions": bundle.questions,
        "train": train_report,
        "validation": eval_out["metrics"],
        "mri_count": len(memos),
        "production_candidate": False,
        "status": "omega_shadow_foundation_model_v0",
    }
    (artifact_dir / "omega_manifest.json").write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(artifact_dir), encoding="utf-8")
    print(json.dumps(manifest, indent=2, default=str))


if __name__ == "__main__":
    main()
