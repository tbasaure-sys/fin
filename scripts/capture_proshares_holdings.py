from __future__ import annotations

import argparse
from pathlib import Path
from urllib.request import Request, urlopen

from meta_alpha_allocator.compelled_flow.proshares import archive_holdings_snapshot


parser = argparse.ArgumentParser(description="Archive one immutable ProShares daily holdings snapshot.")
parser.add_argument("--ticker", default="TQQQ")
parser.add_argument(
    "--url",
    default="https://accounts.profunds.com/etfdata/psdlyhld.csv",
)
parser.add_argument(
    "--archive-root",
    type=Path,
    default=Path("artifacts/compelled_flow_pilot_v1/holdings_archive"),
)
args = parser.parse_args()

request = Request(args.url, headers={"User-Agent": "BLSPrime-CompelledFlow/1.0"})
with urlopen(request, timeout=60) as response:
    raw = response.read().decode("utf-8-sig")

paths = archive_holdings_snapshot(raw, args.ticker, args.archive_root)
print(paths["raw_path"])
print(paths["summary_path"])
