"""Point-in-time, walk-forward validation for Signal Genome.

This module is deliberately separate from the daily descriptive run. A run can
be technically ready while this evaluator still returns ``descriptive_only``.
No result from this module is a ranking, sizing instruction, or alpha score.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from statistics import NormalDist
from typing import Any, Mapping

import numpy as np
import pandas as pd

from .contracts import QUALIFICATION_MIN_BARS
from .engine import compute_market_state_history


@dataclass(frozen=True)
class ValidationConfig:
    primary_horizon: int = 21
    secondary_horizons: tuple[int, ...] = (5, 63)
    burn_in: int = 504
    bootstrap_repetitions: int = 2_000
    block_size: int = 21
    min_assets: int = 6
    min_asset_days: int = 1_000
    min_fold_stability: float = 0.60
    max_bh_q: float = 0.10
    seed: int = 20260801


def _safe_mean(values: list[float]) -> float | None:
    return float(np.mean(values)) if values else None


def _max_drawdown(values: list[float]) -> float | None:
    if not values:
        return None
    wealth = np.cumprod(1 + np.asarray(values, dtype=float))
    peaks = np.maximum.accumulate(wealth)
    return float(np.min(wealth / peaks - 1))


def _block_bootstrap_pvalue(values: list[float], *, block_size: int, repetitions: int, seed: int) -> float | None:
    if len(values) < 2:
        return None
    array = np.asarray(values, dtype=float)
    centered = array - np.mean(array)
    rng = np.random.default_rng(seed)
    block_size = max(1, min(int(block_size), len(centered)))
    blocks = [centered[index : index + block_size] for index in range(len(centered) - block_size + 1)]
    if not blocks:
        return None
    samples = []
    repetitions = max(1, int(repetitions))
    for _ in range(repetitions):
        draw = []
        while len(draw) < len(centered):
            draw.extend(blocks[int(rng.integers(0, len(blocks)))])
        samples.append(float(np.mean(draw[: len(centered)])))
    observed = abs(float(np.mean(array)))
    p_value = np.mean(np.abs(samples) >= observed)
    return float(max(1.0 / repetitions, min(1.0, p_value)))


def _benjamini_hochberg(p_values: list[float | None]) -> list[float | None]:
    valid = [(index, value) for index, value in enumerate(p_values) if value is not None and np.isfinite(value)]
    adjusted: list[float | None] = [None] * len(p_values)
    if not valid:
        return adjusted
    ordered = sorted(valid, key=lambda item: item[1])
    running = 1.0
    total = len(ordered)
    for rank in range(total, 0, -1):
        index, value = ordered[rank - 1]
        running = min(running, float(value) * total / rank)
        adjusted[index] = min(1.0, running)
    return adjusted


def _asset_frame(asset: Any) -> tuple[str, pd.DataFrame, str]:
    if isinstance(asset, tuple) and len(asset) == 2:
        frame, asset_class = asset
    elif isinstance(asset, Mapping) and "bars" in asset:
        frame, asset_class = asset["bars"], asset.get("assetClass", "equity")
    else:
        frame, asset_class = asset, "equity"
    if not isinstance(frame, pd.DataFrame):
        raise TypeError("validation assets must contain pandas DataFrames")
    return "", frame, str(asset_class)


def _observations_for_asset(
    asset_key: str,
    bars: pd.DataFrame,
    asset_class: str,
    horizons: tuple[int, ...],
) -> list[dict[str, Any]]:
    frame = bars.copy()
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce", utc=True).dt.tz_convert(None).dt.normalize()
    frame = frame.sort_values("date", kind="stable").reset_index(drop=True)
    history = compute_market_state_history(frame, asset_key=asset_key, asset_class=asset_class)
    if not history:
        return []
    positions = {value.date().isoformat(): index for index, value in enumerate(frame["date"])}
    close = pd.to_numeric(frame["close"], errors="coerce").to_numpy(dtype=float)
    records = []
    for run in history:
        date_key = str(run.get("asOfDate") or "")
        position = positions.get(date_key)
        if position is None:
            continue
        direction = 1 if run.get("state") == "trend_up" else -1 if run.get("state") == "trend_down" else 0
        if direction == 0:
            continue
        for horizon in horizons:
            end = position + horizon
            if end >= len(close) or not np.isfinite(close[position]) or not np.isfinite(close[end]) or close[position] == 0:
                continue
            path = close[position + 1 : end + 1] / close[position] - 1
            path = path[np.isfinite(path)]
            if len(path) != horizon:
                continue
            records.append(
                {
                    "assetKey": asset_key,
                    "assetClass": asset_class,
                    "asOfDate": date_key,
                    "state": run["state"],
                    "direction": direction,
                    "horizon": horizon,
                    "forwardReturn": float(close[end] / close[position] - 1),
                    "mae": float(np.min(path)),
                    "mfe": float(np.max(path)),
                }
            )
    return records


def evaluate_signal_validation(
    assets: Mapping[str, Any],
    *,
    config: ValidationConfig | None = None,
) -> dict[str, Any]:
    """Evaluate multiple assets point-in-time and apply the publication gate."""

    config = config or ValidationConfig()
    horizons = (config.primary_horizon, *config.secondary_horizons)
    required_bars = max(config.burn_in, QUALIFICATION_MIN_BARS)
    observations: list[dict[str, Any]] = []
    asset_counts: dict[str, int] = {}
    for asset_key, raw_asset in assets.items():
        _ignored, frame, asset_class = _asset_frame(raw_asset)
        asset_counts[asset_class] = asset_counts.get(asset_class, 0) + 1
        if len(frame) < required_bars:
            continue
        observations.extend(_observations_for_asset(str(asset_key), frame, asset_class, horizons))

    primary = [row for row in observations if row["horizon"] == config.primary_horizon]
    groups: list[dict[str, Any]] = []
    p_values: list[float | None] = []
    for (asset_class, state), rows in sorted(_group_rows(primary, ("assetClass", "state")).items()):
        returns = [float(row["forwardReturn"]) for row in rows]
        direction = 1 if state == "trend_up" else -1
        signed = [direction * value for value in returns]
        p_value = _block_bootstrap_pvalue(
            signed,
            block_size=config.block_size,
            repetitions=config.bootstrap_repetitions,
            seed=config.seed + len(groups),
        )
        assets_in_group = {row["assetKey"] for row in rows}
        fold_values = _fold_stability(rows, direction)
        groups.append(
            {
                "assetClass": asset_class,
                "state": state,
                "assetCount": len(assets_in_group),
                "assetDays": len(rows),
                "meanReturn": _safe_mean(returns),
                "hitRate": float(np.mean([value > 0 for value in signed])) if signed else None,
                "mae": _safe_mean([float(row["mae"]) for row in rows]),
                "mfe": _safe_mean([float(row["mfe"]) for row in rows]),
                "drawdown": _max_drawdown(returns),
                "foldStability": fold_values,
                "pValue": p_value,
            }
        )
        p_values.append(p_value)

    q_values = _benjamini_hochberg(p_values)
    for group, q_value in zip(groups, q_values):
        group["bhQ"] = q_value

    qualified_groups = [
        group
        for group in groups
        if group["assetCount"] >= config.min_assets
        and group["assetDays"] >= config.min_asset_days
        and (group["foldStability"] or 0) >= config.min_fold_stability
        and group["bhQ"] is not None
        and group["bhQ"] <= config.max_bh_q
    ]
    qualified_classes = sorted({group["assetClass"] for group in qualified_groups})
    return {
        "schemaVersion": "signal-validation.v1",
        "primaryHorizon": config.primary_horizon,
        "secondaryHorizons": list(config.secondary_horizons),
        "burnIn": required_bars,
        "status": "qualified" if qualified_groups else "descriptive_only",
        "evidencePromoted": bool(qualified_groups),
        "qualification": {
            "minAssets": config.min_assets,
            "minAssetDays": config.min_asset_days,
            "minFoldStability": config.min_fold_stability,
            "maxBhQ": config.max_bh_q,
            "qualifiedGroups": len(qualified_groups),
            "qualifiedClasses": qualified_classes,
            "message": "historical evidence passed the preregistered gate" if qualified_groups else "evidencia predictiva no estable",
        },
        "assets": asset_counts,
        "groups": groups,
        "observations": len(observations),
    }


def _group_rows(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> dict[tuple[str, ...], list[dict[str, Any]]]:
    grouped: dict[tuple[str, ...], list[dict[str, Any]]] = {}
    for row in rows:
        key = tuple(str(row[name]) for name in keys)
        grouped.setdefault(key, []).append(row)
    return grouped


def _fold_stability(rows: list[dict[str, Any]], direction: int) -> float | None:
    folds = _group_rows(rows, ("assetKey",))
    values = []
    for asset_rows in folds.values():
        ordered = sorted(asset_rows, key=lambda row: row["asOfDate"])
        chunks = np.array_split(np.arange(len(ordered)), min(5, len(ordered)))
        for chunk in chunks:
            if len(chunk) == 0:
                continue
            mean = np.mean([direction * ordered[int(index)]["forwardReturn"] for index in chunk])
            values.append(bool(mean > 0))
    return float(np.mean(values)) if values else None
