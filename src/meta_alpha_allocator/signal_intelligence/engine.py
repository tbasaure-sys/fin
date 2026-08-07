from __future__ import annotations

from datetime import timedelta
from typing import Any

import numpy as np
import pandas as pd

from .contracts import SIGNAL_CONFIG_FINGERPRINT, SIGNAL_CONFIG_VERSION, SIGNAL_ENGINE_VERSION, SIGNAL_SCHEMA_VERSION, TECHNICAL_BURN_IN_BARS


MIN_READY_BARS = TECHNICAL_BURN_IN_BARS


def _as_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if np.isfinite(parsed) else None


def _vote(value: Any, positive: float, negative: float) -> int:
    number = _as_float(value)
    if number is None:
        return 0
    if number >= positive:
        return 1
    if number <= negative:
        return -1
    return 0


def _direction_from_votes(votes: list[int]) -> tuple[int, str, bool]:
    usable = [vote for vote in votes if vote]
    if len(usable) < 2:
        return 0, "unavailable", False
    total = sum(usable)
    if total >= 2:
        direction = 1
    elif total <= -2:
        direction = -1
    else:
        direction = 0
    if direction == 0:
        state = "neutral"
    else:
        state = "positive" if direction > 0 else "negative"
    return direction, state, True


def _family(
    key: str,
    state: str,
    direction: int,
    available: bool,
    votes: list[dict[str, Any]],
    *,
    evidence_level: str = "moderate",
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "state": state,
        "direction": direction,
        "available": bool(available),
        "evidenceLevel": evidence_level if available else "low",
        "votes": votes,
        "evidence": evidence or {},
    }


def _prepare_bars(bars: pd.DataFrame, as_of: Any = None) -> pd.DataFrame:
    if not isinstance(bars, pd.DataFrame):
        raise TypeError("bars must be a pandas DataFrame")
    required = {"date", "high", "low", "close"}
    missing = required.difference(bars.columns)
    if missing:
        raise ValueError(f"bars missing columns: {', '.join(sorted(missing))}")
    frame = bars.copy()
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce", utc=True).dt.tz_convert(None)
    if frame["date"].isna().any():
        raise ValueError("bars contain invalid dates")
    if frame["date"].duplicated().any():
        raise ValueError("bars contain duplicate dates")
    numeric = [column for column in ("open", "high", "low", "close", "adj_close", "volume") if column in frame]
    for column in numeric:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    if frame[["high", "low", "close"]].isna().any().any():
        raise ValueError("bars contain missing price values")
    if (frame["low"] > frame["high"]).any():
        raise ValueError("bars contain invalid OHLC ranges")
    frame = frame.sort_values("date", kind="stable").reset_index(drop=True)
    if as_of is not None:
        cutoff = pd.to_datetime(as_of, errors="raise", utc=True).tz_convert(None)
        frame = frame.loc[frame["date"] <= cutoff].reset_index(drop=True)
    return frame


def _ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False, min_periods=span).mean()


def _atr(frame: pd.DataFrame, period: int = 14) -> pd.Series:
    previous_close = frame["close"].shift(1)
    true_range = pd.concat(
        [frame["high"] - frame["low"], (frame["high"] - previous_close).abs(), (frame["low"] - previous_close).abs()],
        axis=1,
    ).max(axis=1)
    return true_range.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    relative = gain / loss.replace(0, np.nan)
    result = 100 - (100 / (1 + relative))
    result = result.where(loss.ne(0), 100)
    return result


def _rolling_percentile(series: pd.Series, window: int = 252) -> pd.Series:
    def percentile(values: np.ndarray) -> float:
        if len(values) == 0 or not np.isfinite(values[-1]):
            return np.nan
        finite = values[np.isfinite(values)]
        if len(finite) < 20:
            return np.nan
        return float(np.mean(finite <= values[-1]))

    return series.rolling(window, min_periods=20).apply(percentile, raw=True)


def _ols_tstat(series: pd.Series, window: int = 20) -> pd.Series:
    x = np.arange(window, dtype=float)

    def calculate(values: np.ndarray) -> float:
        if len(values) != window or not np.isfinite(values).all():
            return np.nan
        slope, intercept = np.polyfit(x, values, 1)
        residuals = values - (intercept + slope * x)
        sxx = float(np.sum((x - x.mean()) ** 2))
        if sxx == 0 or window <= 2:
            return np.nan
        standard_error = np.sqrt(float(np.sum(residuals**2)) / (window - 2) / sxx)
        return float(slope / standard_error) if standard_error > 0 else float(np.sign(slope) * np.inf)

    return series.rolling(window, min_periods=window).apply(calculate, raw=True)


def _dmi(frame: pd.DataFrame, period: int = 14) -> tuple[pd.Series, pd.Series, pd.Series]:
    high_delta = frame["high"].diff()
    low_delta = -frame["low"].diff()
    plus_dm = high_delta.where((high_delta > low_delta) & (high_delta > 0), 0.0)
    minus_dm = low_delta.where((low_delta > high_delta) & (low_delta > 0), 0.0)
    previous_close = frame["close"].shift(1)
    true_range = pd.concat(
        [frame["high"] - frame["low"], (frame["high"] - previous_close).abs(), (frame["low"] - previous_close).abs()],
        axis=1,
    ).max(axis=1)
    smooth_tr = true_range.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    plus_di = 100 * plus_dm.ewm(alpha=1 / period, adjust=False, min_periods=period).mean() / smooth_tr
    minus_di = 100 * minus_dm.ewm(alpha=1 / period, adjust=False, min_periods=period).mean() / smooth_tr
    denominator = (plus_di + minus_di).replace(0, np.nan)
    dx = 100 * (plus_di - minus_di).abs() / denominator
    adx = dx.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    return plus_di, minus_di, adx


def _relative_frame(frame: pd.DataFrame, benchmark: pd.DataFrame | None) -> pd.DataFrame | None:
    if benchmark is None:
        return None
    if not isinstance(benchmark, pd.DataFrame) or not {"date", "close"}.issubset(benchmark.columns):
        raise ValueError("benchmark requires date and close columns")
    prepared = benchmark[["date", "close"]].copy()
    prepared["date"] = pd.to_datetime(prepared["date"], errors="coerce", utc=True).dt.tz_convert(None)
    prepared["close"] = pd.to_numeric(prepared["close"], errors="coerce")
    if prepared["date"].isna().any() or prepared["close"].isna().any():
        raise ValueError("benchmark contains invalid dates or close values")
    if prepared["date"].duplicated().any():
        raise ValueError("benchmark contains duplicate dates")
    prepared = prepared.sort_values("date", kind="stable").reset_index(drop=True)
    return frame[["date", "close"]].merge(
        prepared[["date", "close"]].rename(columns={"close": "benchmark_close"}),
        on="date",
        how="left",
    )


def _context_family(context: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize MOSAIC/Compelled Flow context without inventing a proxy signal."""

    source = context if isinstance(context, dict) else {}
    available = source.get("available") is True and source.get("state") in {"favorable", "adverse", "mixed"}
    state = str(source.get("state") or "unavailable") if available else "unavailable"
    direction = source.get("direction") if available else 0
    try:
        direction = int(direction)
    except (TypeError, ValueError):
        direction = 0
    direction = direction if direction in {-1, 0, 1} else 0
    votes = []
    for item in source.get("votes", []) if isinstance(source.get("votes"), list) else []:
        if not isinstance(item, dict):
            continue
        vote = item.get("direction", 0)
        try:
            vote = int(vote)
        except (TypeError, ValueError):
            vote = 0
        votes.append({"primitive": str(item.get("primitive") or "context"), "direction": vote if vote in {-1, 0, 1} else 0})
    return _family(
        "context",
        state,
        direction,
        available,
        votes,
        evidence_level=str(source.get("evidenceLevel") or "moderate") if available else "low",
        evidence={
            "source": str(source.get("source") or "MOSAIC/Compelled Flow") if available else None,
            "warnings": list(source.get("warnings", []))[:8] if isinstance(source.get("warnings"), list) else [],
        },
    )


def _directional_family(
    key: str,
    primitive_values: list[tuple[str, Any]],
    thresholds: list[tuple[float, float]],
) -> dict[str, Any]:
    votes = []
    directions = []
    evidence = {}
    for (primitive, value), (positive, negative) in zip(primitive_values, thresholds):
        direction = _vote(value, positive, negative)
        directions.append(direction)
        votes.append({"primitive": primitive, "direction": direction})
        numeric = _as_float(value)
        if numeric is not None:
            evidence[primitive] = round(numeric, 8)
    direction, state, available = _direction_from_votes(directions)
    usable = [vote for vote in directions if vote]
    evidence_level = "strong" if len(usable) >= 3 and abs(sum(usable)) == len(usable) else "moderate"
    if not available:
        state = "unavailable"
    return _family(key, state, direction, available, votes, evidence_level=evidence_level, evidence=evidence)


def _compute_families(
    frame: pd.DataFrame,
    benchmark: pd.DataFrame | None,
    asset_class: str,
    context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    close = frame["close"]
    atr = _atr(frame)
    ema20 = _ema(close, 20)
    ema50 = _ema(close, 50)
    ema_spread = (ema20 - ema50) / atr.replace(0, np.nan)
    slope_tstat = _ols_tstat(np.log(close.replace(0, np.nan)), 20)
    plus_di, minus_di, adx = _dmi(frame)
    dmi_direction = (plus_di - minus_di).where(adx >= 20)
    trend = _directional_family(
        "trend",
        [("emaSpreadAtr", ema_spread.iloc[-1]), ("slopeTstat", slope_tstat.iloc[-1]), ("dmiDirection", dmi_direction.iloc[-1])],
        [(0.25, -0.25), (1.5, -1.5), (0.01, -0.01)],
    )
    if trend["state"] == "positive":
        trend["state"] = "bullish"
    elif trend["state"] == "negative":
        trend["state"] = "bearish"
    elif trend["state"] == "neutral":
        trend["state"] = "flat"

    rsi = _rsi(close).iloc[-1]
    roc21 = close.pct_change(21)
    roc_percentile = _rolling_percentile(roc21).iloc[-1]
    roc_vote = 1 if _as_float(roc_percentile) is not None and roc_percentile >= 0.6 and roc21.iloc[-1] > 0 else -1 if _as_float(roc_percentile) is not None and roc_percentile <= 0.4 and roc21.iloc[-1] < 0 else 0
    macd = _ema(close, 12) - _ema(close, 26)
    macd_signal = _ema(macd, 9)
    macd_hist_atr = (macd - macd_signal) / atr.replace(0, np.nan)
    momentum = _directional_family(
        "momentum",
        [("rsi", rsi), ("roc21Percentile", roc_vote), ("macdHistogramAtr", macd_hist_atr.iloc[-1])],
        [(55, 45), (0.5, -0.5), (0.05, -0.05)],
    )
    momentum["votes"][1]["value"] = round(float(roc_percentile), 8) if _as_float(roc_percentile) is not None else None
    if momentum["state"] == "positive":
        momentum["state"] = "positive"
    elif momentum["state"] == "negative":
        momentum["state"] = "negative"

    realized21 = np.log(close).diff().rolling(21, min_periods=21).std() * np.sqrt(252)
    realized126 = np.log(close).diff().rolling(126, min_periods=63).std() * np.sqrt(252)
    volatility_ratio = realized21 / realized126.replace(0, np.nan)
    atr_percentile = _rolling_percentile(atr / close.replace(0, np.nan)).iloc[-1]
    range_width = (frame["high"].rolling(20).max() - frame["low"].rolling(20).min()) / close.replace(0, np.nan)
    range_percentile = _rolling_percentile(range_width).iloc[-1]
    volatility_votes = [
        _vote(volatility_ratio.iloc[-1], 1.25, 0.8),
        _vote(atr_percentile, 0.7, 0.3),
        _vote(range_percentile, 0.7, 0.3),
    ]
    volatility_direction, _, volatility_available = _direction_from_votes(volatility_votes)
    volatility_state = "expansion" if volatility_direction > 0 else "compression" if volatility_direction < 0 else "normal" if volatility_available else "unavailable"
    volatility = _family(
        "volatility",
        volatility_state,
        volatility_direction,
        volatility_available,
        [
            {"primitive": "realizedRatio", "direction": volatility_votes[0]},
            {"primitive": "atrPercentile", "direction": volatility_votes[1]},
            {"primitive": "rangePercentile", "direction": volatility_votes[2]},
        ],
        evidence={
            "realizedRatio": _as_float(volatility_ratio.iloc[-1]),
            "atrPercentile": _as_float(atr_percentile),
            "rangePercentile": _as_float(range_percentile),
        },
    )

    prior_high20_series = frame["high"].shift(1).rolling(20, min_periods=20).max()
    prior_low20_series = frame["low"].shift(1).rolling(20, min_periods=20).min()
    prior_high55_series = frame["high"].shift(1).rolling(55, min_periods=55).max()
    prior_low55_series = frame["low"].shift(1).rolling(55, min_periods=55).min()
    prior_high20 = prior_high20_series.iloc[-1]
    prior_low20 = prior_low20_series.iloc[-1]
    prior_high55 = prior_high55_series.iloc[-1]
    prior_low55 = prior_low55_series.iloc[-1]
    current_close = close.iloc[-1]
    breakout20 = 1 if _as_float(prior_high20) is not None and current_close > prior_high20 else -1 if _as_float(prior_low20) is not None and current_close < prior_low20 else 0
    breakout55 = 1 if _as_float(prior_high55) is not None and current_close > prior_high55 else -1 if _as_float(prior_low55) is not None and current_close < prior_low55 else 0
    recent_breakout20 = close > prior_high20_series
    recent_breakdown20 = close < prior_low20_series
    failed_up = bool(recent_breakout20.shift(1).rolling(3, min_periods=1).max().iloc[-1] == 1 and _as_float(prior_high20) is not None and current_close <= prior_high20)
    failed_down = bool(recent_breakdown20.shift(1).rolling(3, min_periods=1).max().iloc[-1] == 1 and _as_float(prior_low20) is not None and current_close >= prior_low20)
    failed_breakout = -1 if failed_up else 1 if failed_down else 0
    pivot_high_confirmed = bool(
        len(frame) >= 4
        and frame["high"].iloc[-3] > frame["high"].iloc[-4]
        and frame["high"].iloc[-3] > frame["high"].iloc[-2]
    )
    pivot_low_confirmed = bool(
        len(frame) >= 4
        and frame["low"].iloc[-3] < frame["low"].iloc[-4]
        and frame["low"].iloc[-3] < frame["low"].iloc[-2]
    )
    pivot_direction = 1 if pivot_low_confirmed and current_close > frame["low"].iloc[-3] else -1 if pivot_high_confirmed and current_close < frame["high"].iloc[-3] else 0
    structure_available = all(_as_float(value) is not None for value in (prior_high20, prior_low20))
    structure = _family(
        "structure",
        "unavailable" if not structure_available else "range",
        0,
        structure_available,
        [],
        evidence={
            "priorHigh20": _as_float(prior_high20),
            "priorLow20": _as_float(prior_low20),
            "priorHigh55": _as_float(prior_high55),
            "priorLow55": _as_float(prior_low55),
        },
    )
    structure_values = [breakout20, breakout55, pivot_direction, failed_breakout]
    structure_votes = [{"primitive": primitive, "direction": direction} for primitive, direction in zip(
        ("breakout20", "breakout55", "pivotConfirmed", "failedBreakout3"), structure_values
    )]
    structure_direction, _, structure_vote_available = _direction_from_votes(structure_values)
    if structure_available:
        structure["direction"] = structure_direction
        structure["votes"] = structure_votes
        structure["available"] = True
        structure["evidenceLevel"] = "strong" if len([vote for vote in structure_values if vote]) >= 3 and abs(sum(structure_values)) == len([vote for vote in structure_values if vote]) else "moderate"
        if failed_breakout:
            structure["state"] = "failed_breakout"
        elif structure_direction > 0:
            structure["state"] = "breakout_up"
        elif structure_direction < 0:
            structure["state"] = "breakout_down"
        else:
            structure["state"] = "range"

    has_volume = "volume" in frame and frame["volume"].notna().sum() >= 20 and frame["volume"].fillna(0).abs().sum() > 0
    if has_volume:
        volume = frame["volume"].astype(float)
        volume_mean = volume.rolling(60, min_periods=20).mean()
        volume_std = volume.rolling(60, min_periods=20).std().replace(0, np.nan)
        volume_z = (volume - volume_mean) / volume_std
        obv_direction = np.sign(close.diff().fillna(0)) * np.where(volume.fillna(0) > 0, volume.fillna(0), 0)
        obv = pd.Series(obv_direction, index=frame.index).cumsum()
        obv_slope = _ols_tstat(obv, 20)
        return_direction = np.sign(close.pct_change(21).iloc[-1])
        participation_direction = int(return_direction) if _as_float(volume_z.iloc[-1]) is not None and volume_z.iloc[-1] >= 0.5 else 0
        confirming = participation_direction != 0 and np.sign(obv_slope.iloc[-1]) == return_direction
        contradicting = participation_direction != 0 and np.sign(obv_slope.iloc[-1]) == -return_direction
        participation_state = "confirming" if confirming else "contradicting" if contradicting else "neutral"
        participation = _family(
            "participation",
            participation_state,
            int(return_direction) if return_direction else 0,
            True,
            [{"primitive": "volumeZ60", "direction": _vote(volume_z.iloc[-1], 0.5, -0.5)}, {"primitive": "obvSlope20", "direction": int(np.sign(obv_slope.iloc[-1])) if _as_float(obv_slope.iloc[-1]) is not None else 0}],
            evidence={"volumeZ60": _as_float(volume_z.iloc[-1]), "obvSlope20": _as_float(obv_slope.iloc[-1])},
        )
    else:
        participation = _family("participation", "unavailable", 0, False, [], evidence={"reason": "volume_unavailable"})

    relative_frame = _relative_frame(frame, benchmark)
    if relative_frame is not None:
        relative_return21 = relative_frame["close"].pct_change(21) - relative_frame["benchmark_close"].pct_change(21)
        relative_return63 = relative_frame["close"].pct_change(63) - relative_frame["benchmark_close"].pct_change(63)
        relative_values = [relative_return21.iloc[-1], relative_return63.iloc[-1]]
        relative_votes = [1 if _as_float(value) is not None and value > 0 else -1 if _as_float(value) is not None and value < 0 else 0 for value in relative_values]
        relative_direction = 1 if all(value > 0 for value in relative_votes) else -1 if all(value < 0 for value in relative_votes) else 0
        relative_state = "outperforming" if relative_direction > 0 else "underperforming" if relative_direction < 0 else "neutral"
        relative = _family(
            "relative",
            relative_state,
            relative_direction,
            all(_as_float(value) is not None for value in relative_values),
            [{"primitive": "excessReturn21", "direction": relative_votes[0]}, {"primitive": "excessReturn63", "direction": relative_votes[1]}],
            evidence={"excessReturn21": _as_float(relative_values[0]), "excessReturn63": _as_float(relative_values[1])},
        )
    else:
        relative = _family("relative", "unavailable", 0, False, [], evidence={"reason": "benchmark_unavailable"})

    return [trend, momentum, volatility, structure, participation, relative, _context_family(context)]


def _overall_state(families: list[dict[str, Any]]) -> tuple[str | None, list[dict[str, Any]]]:
    by_key = {family["key"]: family for family in families}
    trend_direction = by_key["trend"]["direction"] if by_key["trend"]["available"] else 0
    structure_direction = by_key["structure"]["direction"] if by_key["structure"]["available"] else 0
    structure_state = by_key["structure"]["state"]
    volatility_state = by_key["volatility"]["state"]
    disagreements = []
    usable = [family for family in families if family["available"] and family["direction"]]
    for left_index, left in enumerate(usable):
        for right in usable[left_index + 1 :]:
            if left["direction"] * right["direction"] == -1 and left["evidenceLevel"] in {"moderate", "strong"} and right["evidenceLevel"] in {"moderate", "strong"}:
                disagreements.append({"left": left["key"], "right": right["key"], "kind": "direction_conflict"})
    if not by_key["trend"]["available"] or not by_key["structure"]["available"]:
        return "uncertain", disagreements
    if structure_direction and trend_direction and structure_direction != trend_direction:
        return "transition", disagreements
    if trend_direction > 0 and structure_direction > 0:
        return "trend_up", disagreements
    if trend_direction < 0 and structure_direction < 0:
        return "trend_down", disagreements
    if trend_direction == 0 and structure_direction == 0 and structure_state == "range" and volatility_state != "expansion":
        return "range", disagreements
    if volatility_state == "expansion" and structure_state == "range":
        return "transition", disagreements
    return "uncertain", disagreements


def compute_market_state(
    bars: pd.DataFrame,
    *,
    asset_key: str,
    asset_class: str,
    benchmark: pd.DataFrame | None = None,
    context: dict[str, Any] | None = None,
    as_of: Any = None,
    availability: dict[str, Any] | None = None,
    engine_version: str = SIGNAL_ENGINE_VERSION,
) -> dict[str, Any]:
    availability = availability or {}
    rights_approved = availability.get("rightsApproved", True)
    coverage_pct = float(availability.get("coveragePct", 1.0) or 0.0)
    stale = bool(availability.get("stale", False))
    frame = _prepare_bars(bars, as_of=as_of)
    as_of_date = frame["date"].iloc[-1].date().isoformat() if not frame.empty else None
    base = {
        "schemaVersion": SIGNAL_SCHEMA_VERSION,
        "runType": "market_state_eod",
        "subject": {"type": "asset", "key": str(asset_key), "assetClass": str(asset_class)},
        "asOfDate": as_of_date,
        "availableAt": (pd.Timestamp(as_of_date) + timedelta(days=1)).isoformat() + "Z" if as_of_date else None,
        "status": "ready",
        "state": None,
        "technicalReady": False,
        "evidencePromoted": bool(availability.get("evidencePromoted", False)),
        "families": [],
        "disagreements": [],
        "dataQuality": {
            "coveragePct": coverage_pct,
            "barCount": int(len(frame)),
            "stale": stale,
            "rightsApproved": bool(rights_approved),
            **{key: availability[key] for key in ("provider", "lastBarDate", "warnings", "volumeAvailable") if key in availability},
        },
        "receipt": {
            "engineVersion": engine_version,
            "configVersion": SIGNAL_CONFIG_VERSION,
            "configFingerprint": SIGNAL_CONFIG_FINGERPRINT,
            "source": "normalized_eod_bars",
            "inputBarCount": int(len(frame)),
        },
    }
    if not rights_approved:
        base["status"] = "blocked"
        base["dataQuality"]["reason"] = "rights_not_approved"
        return base
    if stale:
        base["status"] = "stale"
        base["dataQuality"]["reason"] = "provider_data_stale"
        return base
    if coverage_pct < 0.95 or len(frame) < MIN_READY_BARS:
        base["status"] = "insufficient_data"
        base["dataQuality"]["reason"] = "coverage_or_history_below_gate"
        return base
    families = _compute_families(frame, benchmark, asset_class, context)
    state, disagreements = _overall_state(families)
    base["technicalReady"] = True
    base["state"] = state
    base["families"] = families
    base["disagreements"] = disagreements
    participation = next((family for family in families if family["key"] == "participation"), None)
    if participation is not None:
        base["dataQuality"]["volumeAvailable"] = participation["available"]
    return base


def compute_market_state_history(
    bars: pd.DataFrame,
    *,
    asset_key: str,
    asset_class: str,
    benchmark: pd.DataFrame | None = None,
    context: dict[str, Any] | None = None,
    availability: dict[str, Any] | None = None,
    engine_version: str = SIGNAL_ENGINE_VERSION,
) -> list[dict[str, Any]]:
    frame = _prepare_bars(bars)
    history = []
    for date in frame["date"]:
        payload = compute_market_state(
            frame,
            asset_key=asset_key,
            asset_class=asset_class,
            benchmark=benchmark,
            context=context,
            as_of=date,
            availability=availability,
            engine_version=engine_version,
        )
        if payload["status"] == "ready":
            history.append(payload)
    return history
