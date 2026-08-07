"""Audit quarantined Pine files into aggregate metadata only.

The command never writes or prints source text, filenames, titles, or formulas.
It is intentionally separate from the production Signal Genome runtime.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from meta_alpha_allocator.signal_intelligence.audit import build_quarantine_manifest  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit a quarantined indicator corpus without exporting source metadata")
    parser.add_argument("--root", type=Path, default=ROOT / "_local_data" / "tradingview_top100")
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    files = []
    for path in sorted(args.root.rglob("*.txt")):
        files.append((path.name, path.read_text(encoding="utf-8", errors="replace")))
    manifest = build_quarantine_manifest(files)
    encoded = json.dumps(manifest, ensure_ascii=True, sort_keys=True, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    else:
        sys.stdout.write(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
