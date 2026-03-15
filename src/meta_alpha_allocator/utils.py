from __future__ import annotations

from typing import Iterable

import numpy as np
import pandas as pd


def ensure_directory(path: str | pd.Timestamp | object) -> None:
    if hasattr(path, "mkdir"):
        path.mkdir(parents=True, exist_ok=True)


def to_datetime_index(frame: pd.DataFrame) -> pd.DataFrame:
    out = frame.copy()
    if not isinstance(out.index, pd.DatetimeIndex):
        out.index = pd.to_datetime(out.index)
    out = out.sort_index()
    return out


def expanding_percentile(series: pd.Series, min_periods: int = 20) -> pd.Series:
    values = series.astype(float)
    result = []
    history: list[float] = []
    for value in values:
        history.append(value)
        clean = pd.Series(history, dtype="float64").dropna()
        if len(clean) < min_periods or not np.isfinite(value):
            result.append(np.nan)
            continue
        pct = clean.rank(pct=True).iloc[-1]
        result.append(float(pct))
    return pd.Series(result, index=series.index, name=series.name)


def time_safe_join(
    left: pd.DataFrame,
    right: pd.DataFrame,
    on: str = "date",
    by: str | None = None,
) -> pd.DataFrame:
    left_sorted = left.sort_values([c for c in [by, on] if c is not None]).copy()
    right_sorted = right.sort_values([c for c in [by, on] if c is not None]).copy()
    left_sorted[on] = pd.to_datetime(left_sorted[on]).astype("datetime64[ns]")
    right_sorted[on] = pd.to_datetime(right_sorted[on]).astype("datetime64[ns]")
    return pd.merge_asof(
        left_sorted,
        right_sorted,
        on=on,
        by=by,
        direction="backward",
        allow_exact_matches=True,
    )


def _normalize_positive(weights: pd.Series) -> pd.Series:
    clean = weights.fillna(0.0).clip(lower=0.0)
    total = clean.sum()
    if total <= 0:
        return clean
    return clean / total


def cap_weights(
    raw_weights: pd.Series,
    max_position: float,
    sector_map: pd.Series | None = None,
    max_sector: float | None = None,
) -> pd.Series:
    weights = _normalize_positive(raw_weights)
    if weights.sum() <= 0:
        return weights

    sector_names = sector_map.reindex(weights.index).fillna("Unknown") if sector_map is not None else pd.Series("Unknown", index=weights.index)

    for _ in range(25):
        weights = weights.clip(upper=max_position)
        if max_sector is not None:
            sector_weights = weights.groupby(sector_names).sum()
            for sector_name, sector_weight in sector_weights.items():
                if sector_weight > max_sector:
                    members = sector_names[sector_names == sector_name].index
                    weights.loc[members] *= max_sector / sector_weight

        total = weights.sum()
        if total <= 0:
            return weights

        deficit = 1.0 - total
        if deficit <= 1e-10:
            break

        headroom = pd.Series(max_position, index=weights.index) - weights
        if max_sector is not None:
            sector_weights = weights.groupby(sector_names).sum()
            sector_headroom = sector_names.map(lambda name: max(max_sector - sector_weights.get(name, 0.0), 0.0))
            headroom = np.minimum(headroom, sector_headroom)
            headroom = pd.Series(headroom, index=weights.index)
        headroom = headroom.clip(lower=0.0)
        if headroom.sum() <= 0:
            break
        weights = weights + deficit * headroom / headroom.sum()

    return _normalize_positive(weights)


def compute_turnover(previous: pd.Series, current: pd.Series) -> float:
    prev = previous.fillna(0.0)
    curr = current.fillna(0.0)
    all_names = prev.index.union(curr.index)
    return float((curr.reindex(all_names, fill_value=0.0) - prev.reindex(all_names, fill_value=0.0)).abs().sum())


def sigmoid(value: float) -> float:
    return float(1.0 / (1.0 + np.exp(-value)))


def rowwise_percentile_rank(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.rank(axis=1, pct=True)


def performance_summary(returns: pd.Series) -> dict[str, float]:
    clean = returns.fillna(0.0)
    if clean.empty:
        return {
            "total_return": 0.0,
            "annual_return": 0.0,
            "annual_vol": 0.0,
            "sharpe": 0.0,
            "max_drawdown": 0.0,
        }
    wealth = (1.0 + clean).cumprod()
    total_return = float(wealth.iloc[-1] - 1.0)
    years = max(len(clean) / 252.0, 1 / 252.0)
    annual_return = float(wealth.iloc[-1] ** (1.0 / years) - 1.0)
    annual_vol = float(clean.std(ddof=1) * np.sqrt(252.0)) if len(clean) > 1 else 0.0
    sharpe = float(annual_return / annual_vol) if annual_vol > 0 else 0.0
    drawdown = wealth / wealth.cummax() - 1.0
    max_dd = float(drawdown.min()) if not drawdown.empty else 0.0
    return {
        "total_return": total_return,
        "annual_return": annual_return,
        "annual_vol": annual_vol,
        "sharpe": sharpe,
        "max_drawdown": max_dd,
    }


def split_equal_blocks(index: Iterable[pd.Timestamp], n_blocks: int = 3) -> list[pd.DatetimeIndex]:
    ordered = pd.DatetimeIndex(sorted(pd.to_datetime(list(index))))
    if len(ordered) == 0:
        return []
    block_size = max(len(ordered) // n_blocks, 1)
    blocks: list[pd.DatetimeIndex] = []
    for i in range(n_blocks):
        start = i * block_size
        end = None if i == n_blocks - 1 else (i + 1) * block_size
        block = ordered[start:end]
        if len(block) > 0:
            blocks.append(block)
    return blocks
