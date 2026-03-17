from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from .probability_calibration import apply_piecewise_calibrator, build_isotonic_calibrator

FEATURE_COLUMNS = ['D_eff', 'stress_score', 'eq_breadth_20', 'cross_corr_60', 'VIX', 'phantom_score', 'fragility_pct', 'drawdown_proxy', 'dominance_proxy']
TARGET_COLUMNS = {
    'g_dominance': 'y_g_dominance',
    'r_dominance': 'y_r_dominance',
    'visible_correction': 'y_visible_correction',
    'phantom_rebound': 'y_phantom_rebound',
    'portfolio_recoverability': 'y_portfolio_recoverability',
    'extreme_drawdown': 'y_extreme_drawdown',
}


def _fit_scaler(frame: pd.DataFrame) -> tuple[dict[str, float], dict[str, float]]:
    medians = {}
    iqrs = {}
    for col in FEATURE_COLUMNS:
        series = pd.to_numeric(frame[col], errors='coerce').dropna()
        median = float(series.median()) if not series.empty else 0.0
        iqr = float(series.quantile(0.75) - series.quantile(0.25)) if not series.empty else 1.0
        iqr = iqr if iqr > 1e-6 else max(float(series.std()) if not np.isnan(series.std()) else 1.0, 1.0)
        medians[col] = median
        iqrs[col] = iqr
    return medians, iqrs


def _apply_scaler(frame: pd.DataFrame, medians: dict[str, float], iqrs: dict[str, float]) -> pd.DataFrame:
    scaled = frame.copy()
    for col in FEATURE_COLUMNS:
        series = pd.to_numeric(frame[col], errors='coerce')
        scaled[col] = ((series - medians.get(col, 0.0)) / max(iqrs.get(col, 1.0), 1e-6)).fillna(0.0)
    return scaled


def _temporal_folds(as_of: pd.Series, *, min_train_rows: int = 40, n_folds: int = 4, embargo_days: int = 20) -> list[tuple[np.ndarray, np.ndarray]]:
    dates = pd.to_datetime(as_of, errors='coerce').reset_index(drop=True)
    if len(dates.dropna()) < (n_folds + 1):
        return []
    candidate_starts = np.linspace(min_train_rows, len(dates) - 10, num=n_folds, dtype=int)
    folds: list[tuple[np.ndarray, np.ndarray]] = []
    for start_idx in candidate_starts:
        if start_idx >= len(dates):
            continue
        valid_start_date = dates.iloc[start_idx]
        if pd.isna(valid_start_date):
            continue
        train_cutoff = valid_start_date - pd.Timedelta(days=embargo_days)
        train_idx = np.where(dates <= train_cutoff)[0]
        valid_end = min(start_idx + max((len(dates) - start_idx) // max(n_folds, 1), 10), len(dates))
        valid_idx = np.arange(start_idx, valid_end)
        if len(train_idx) < min_train_rows or len(valid_idx) == 0:
            continue
        folds.append((train_idx, valid_idx))
    return folds


def _build_model() -> LogisticRegression:
    return LogisticRegression(
        solver='lbfgs',
        C=1.0,
        class_weight='balanced',
        max_iter=2000,
        random_state=7,
    )


def build_probability_packages(training: pd.DataFrame, *, embargo_days: int = 20) -> dict[str, Any]:
    if training is None or training.empty:
        return {'feature_columns': FEATURE_COLUMNS, 'targets': {}, 'metrics': []}
    packages = {}
    metrics = []
    for target_name, target_col in TARGET_COLUMNS.items():
        frame = training.dropna(subset=['as_of'] + FEATURE_COLUMNS + [target_col]).copy()
        if frame.empty or len(frame) < 60:
            continue
        frame = frame.sort_values('as_of').reset_index(drop=True)
        y = pd.to_numeric(frame[target_col], errors='coerce').fillna(0.0)
        if y.nunique() < 2:
            continue
        folds = _temporal_folds(frame['as_of'], embargo_days=embargo_days)
        oof_pred = np.full(len(frame), np.nan, dtype=float)
        fold_metrics = []
        for train_idx, valid_idx in folds:
            train_frame = frame.iloc[train_idx][FEATURE_COLUMNS]
            valid_frame = frame.iloc[valid_idx][FEATURE_COLUMNS]
            medians, iqrs = _fit_scaler(train_frame)
            X_train = _apply_scaler(train_frame, medians, iqrs).to_numpy(dtype=float)
            y_train = y.iloc[train_idx].to_numpy(dtype=float)
            X_valid = _apply_scaler(valid_frame, medians, iqrs).to_numpy(dtype=float)
            y_valid = y.iloc[valid_idx].to_numpy(dtype=float)
            if len(np.unique(y_train)) < 2:
                continue
            model = _build_model()
            model.fit(X_train, y_train)
            pred = model.predict_proba(X_valid)[:, 1]
            oof_pred[valid_idx] = pred
            fold_metrics.append({
                'fold_train_rows': int(len(train_idx)),
                'fold_valid_rows': int(len(valid_idx)),
                'fold_positive_rate': float(y_valid.mean()) if len(y_valid) else 0.0,
                'train_max_date': str(frame.iloc[train_idx]['as_of'].max().date()),
                'valid_min_date': str(frame.iloc[valid_idx]['as_of'].min().date()),
                'embargo_days': embargo_days,
            })
        valid_mask = ~np.isnan(oof_pred)
        if valid_mask.sum() < 20:
            continue
        oof_targets = y[valid_mask].to_numpy(dtype=float)
        calibrator = build_isotonic_calibrator(oof_pred[valid_mask].tolist(), oof_targets.tolist())
        oof_calibrated = np.asarray([apply_piecewise_calibrator(score, calibrator) for score in oof_pred[valid_mask]], dtype=float)

        medians, iqrs = _fit_scaler(frame[FEATURE_COLUMNS])
        scaled_full = _apply_scaler(frame[FEATURE_COLUMNS], medians, iqrs)
        final_model = _build_model()
        final_model.fit(scaled_full.to_numpy(dtype=float), y.to_numpy(dtype=float))
        metric_row = {
            'target': target_name,
            'sample_count': int(len(frame)),
            'positive_rate': float(y.mean()),
            'fold_count': int(len(fold_metrics)),
            'brier_oof_raw': float(np.mean((oof_pred[valid_mask] - oof_targets) ** 2)),
            'brier_oof_calibrated': float(np.mean((oof_calibrated - oof_targets) ** 2)),
        }
        if len(np.unique(oof_targets)) >= 2:
            metric_row['auc_oof_raw'] = float(roc_auc_score(oof_targets, oof_pred[valid_mask]))
            metric_row['auc_oof_calibrated'] = float(roc_auc_score(oof_targets, oof_calibrated))
        packages[target_name] = {
            'feature_columns': FEATURE_COLUMNS,
            'scaler': {'median': medians, 'iqr': iqrs},
            'model': {'coef': [float(v) for v in final_model.coef_[0].tolist()], 'intercept': float(final_model.intercept_[0])},
            'calibrator': calibrator,
            'sample_count': int(len(frame)),
            'positive_rate': float(y.mean()),
            'fold_count': int(len(fold_metrics)),
            'fold_metrics': fold_metrics,
            'metrics': metric_row,
        }
        metrics.append(metric_row)
    return {'feature_columns': FEATURE_COLUMNS, 'targets': packages, 'metrics': metrics}


def score_probability(row: dict[str, Any], target_package: dict[str, Any]) -> float:
    scaler = target_package['scaler']
    scaled = []
    for col in FEATURE_COLUMNS:
        value = float(row.get(col, 0.0))
        median = float(scaler['median'].get(col, 0.0))
        iqr = float(scaler['iqr'].get(col, 1.0))
        iqr = iqr if abs(iqr) > 1e-6 else 1.0
        scaled.append((value - median) / iqr)
    linear = np.asarray([scaled], dtype=float) @ np.asarray(target_package['model']['coef']) + float(target_package['model']['intercept'])
    return float(1.0 / (1.0 + np.exp(-linear[0])))
