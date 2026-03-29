from __future__ import annotations

import json
import sys

from ..research.phantom_diversification import PhantomDiversificationError, analyze_portfolio


def main() -> None:
  try:
    payload = json.load(sys.stdin)
    result = analyze_portfolio(
      payload.get("holdings") or [],
      workspace_id=payload.get("workspace_id"),
    )
    json.dump(result, sys.stdout)
  except PhantomDiversificationError as error:
    json.dump({"error": str(error)}, sys.stdout)
    raise SystemExit(1) from error
  except Exception as error:  # pragma: no cover - defensive CLI path
    json.dump({"error": f"Unexpected phantom diversification failure: {error}"}, sys.stdout)
    raise SystemExit(1) from error


if __name__ == "__main__":
  main()
