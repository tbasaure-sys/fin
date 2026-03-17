from __future__ import annotations

from typing import Any

from sklearn.isotonic import IsotonicRegression

def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def build_isotonic_calibrator(raw_scores: list[float], targets: list[float]) -> dict[str, Any]:
    if not raw_scores or not targets:
        return {'x': [0.0, 1.0], 'y': [0.5, 0.5]}
    model = IsotonicRegression(out_of_bounds='clip')
    model.fit(raw_scores, targets)
    x = [float(value) for value in model.X_thresholds_]
    y = [clamp01(value) for value in model.y_thresholds_]
    if len(x) == 1:
        x = [0.0, 1.0]
        y = [y[0], y[0]]
    return {'x': x, 'y': y}


def build_piecewise_calibrator(raw_scores: list[float], targets: list[float], bins: int = 10) -> dict[str, Any]:
    pairs = sorted((clamp01(score), clamp01(target)) for score, target in zip(raw_scores, targets))
    if not pairs:
        return {'bins': [{'max_score': 1.0, 'value': 0.5}]}
    bucket_size = max(len(pairs) // max(bins, 1), 1)
    out = []
    for start in range(0, len(pairs), bucket_size):
        chunk = pairs[start:start + bucket_size]
        max_score = chunk[-1][0]
        avg_target = sum(target for _, target in chunk) / len(chunk)
        out.append({'max_score': max_score, 'value': clamp01(avg_target)})
    if out[-1]['max_score'] < 1.0:
        out[-1]['max_score'] = 1.0
    return {'bins': out}


def apply_piecewise_calibrator(score: float, calibrator: dict[str, Any] | None) -> float:
    value = clamp01(score)
    if calibrator and 'x' in calibrator and 'y' in calibrator:
        xs = calibrator.get('x') or [0.0, 1.0]
        ys = calibrator.get('y') or [value, value]
        if value <= xs[0]:
            return clamp01(ys[0])
        for idx in range(1, len(xs)):
            if value <= xs[idx]:
                x0, x1 = xs[idx - 1], xs[idx]
                y0, y1 = ys[idx - 1], ys[idx]
                if abs(x1 - x0) < 1e-9:
                    return clamp01(y1)
                ratio = (value - x0) / (x1 - x0)
                return clamp01(y0 + ratio * (y1 - y0))
        return clamp01(ys[-1])
    bins = (calibrator or {}).get('bins') or []
    if not bins:
        return value
    for row in bins:
        if value <= row.get('max_score', 1.0):
            return clamp01(row.get('value', value))
    return clamp01(bins[-1].get('value', value))
