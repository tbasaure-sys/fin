from __future__ import annotations

import argparse
import json
from pathlib import Path

from meta_alpha_allocator.compelled_flow.validation import validate_prediction_package


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate compelled-flow predictions against hashed external snapshots."
    )
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--calendar", type=Path, required=True)
    parser.add_argument("--snapshot-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report = validate_prediction_package(
        predictions_path=args.predictions,
        calendar_path=args.calendar,
        snapshot_manifest_path=args.snapshot_manifest,
    )
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 2 if report.get("status") == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
