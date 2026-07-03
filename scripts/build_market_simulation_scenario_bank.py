from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


DEFAULT_RUN_ID = "fhs_v9_5_run_20260703_003826"
SCALE_BPS = 10_000
DAILY_RETURN_CLIP = (-0.80, 1.50)
TERMINAL_RETURN_CLIP = (-0.95, 2.50)


def _terminal_returns_bps(paths: np.ndarray) -> np.ndarray:
    clipped_daily = np.clip(paths.astype(np.float32), DAILY_RETURN_CLIP[0], DAILY_RETURN_CLIP[1])
    terminal = np.prod(1.0 + clipped_daily, axis=1, dtype=np.float32) - 1.0
    terminal = np.clip(terminal, TERMINAL_RETURN_CLIP[0], TERMINAL_RETURN_CLIP[1])
    return np.rint(terminal * SCALE_BPS).astype("<i2")


def _write_int16_matrix(path: Path, matrix: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(np.ascontiguousarray(matrix, dtype="<i2").tobytes(order="C"))


def build_bank(
    input_npz: Path,
    output_dir: Path,
    run_id: str,
    role: str,
    served_as_primary: bool,
    primary_engine: str,
    disclosure: str,
) -> dict[str, object]:
    payload = np.load(input_npz, allow_pickle=False)
    symbols = [str(value) for value in payload["columns"].tolist()]
    stress_multipliers = payload["stress_multipliers"].astype(np.float32)
    multiplier_values = sorted(float(value) for value in np.unique(stress_multipliers))
    multiplier_codes = np.array([multiplier_values.index(float(value)) for value in stress_multipliers], dtype=np.uint8)

    base_bps = _terminal_returns_bps(payload["synthetic_returns_base"])
    stress_bps = _terminal_returns_bps(payload["synthetic_returns"])

    base_path = output_dir / "scenario_bank_terminal_base_i16.bin"
    stress_path = output_dir / "scenario_bank_terminal_stress_i16.bin"
    multiplier_path = output_dir / "scenario_bank_multiplier_codes_u8.bin"
    _write_int16_matrix(base_path, base_bps)
    _write_int16_matrix(stress_path, stress_bps)
    multiplier_path.write_bytes(multiplier_codes.tobytes(order="C"))

    manifest = {
        "schemaVersion": 1,
        "runId": run_id,
        "createdFrom": input_npz.name,
        "role": role,
        "servedAsPrimary": bool(served_as_primary),
        "primaryEngine": primary_engine,
        "disclosure": disclosure,
        "scenarioCount": int(base_bps.shape[0]),
        "assetCount": int(base_bps.shape[1]),
        "horizonDays": int(payload["synthetic_returns_base"].shape[1]),
        "symbols": symbols,
        "scaleBps": SCALE_BPS,
        "dailyReturnClip": list(DAILY_RETURN_CLIP),
        "terminalReturnClip": list(TERMINAL_RETURN_CLIP),
        "files": {
            "baseTerminalReturnsI16": base_path.name,
            "stressTerminalReturnsI16": stress_path.name,
            "stressMultiplierCodesU8": multiplier_path.name,
        },
        "stressMultiplierValues": multiplier_values,
        "sourceArrays": {
            "base": "synthetic_returns_base",
            "stress": "synthetic_returns",
        },
        "notes": [
            "Terminal returns are computed from daily paths after clipping invalid/extreme daily model returns.",
            "Terminal returns are capped before int16 quantization; use this as an adverse stress book, not a standalone price forecast.",
            "Endpoint should serve this bank as primary only when matched portfolio-weight coverage is sufficient.",
        ],
    }
    manifest_path = output_dir / "scenario_bank_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a compact deployable market-simulation scenario bank.")
    parser.add_argument("--input", required=True, type=Path, help="Path to synthetic_scenarios.npz")
    parser.add_argument("--output-dir", default=Path("artifacts/market_simulation/latest/scenario_bank"), type=Path)
    parser.add_argument("--run-id", default=DEFAULT_RUN_ID)
    parser.add_argument("--role", default="fhs_v9_stress_served_primary_when_covered")
    parser.add_argument("--served-as-primary", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--primary-engine", default="fhs_v9_stress_factor_bank_projection")
    parser.add_argument(
        "--disclosure",
        default=(
            "This bank is the deployable PIT FHS stress engine for matched portfolio weight. "
            "It is an adverse scenario book, not a complete unconditional forecast distribution."
        ),
    )
    args = parser.parse_args()

    manifest = build_bank(
        args.input,
        args.output_dir,
        args.run_id,
        args.role,
        args.served_as_primary,
        args.primary_engine,
        args.disclosure,
    )
    print(json.dumps({
        "outputDir": str(args.output_dir),
        "scenarioCount": manifest["scenarioCount"],
        "assetCount": manifest["assetCount"],
        "role": manifest["role"],
    }, indent=2))


if __name__ == "__main__":
    main()
