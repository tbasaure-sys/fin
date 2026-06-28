from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset


LENS_NAMES = [
    "dcf",
    "roicFade",
    "reverseDcf",
    "residualIncome",
    "assetValue",
    "unitEconomics",
    "bottleneck",
    "realOptions",
    "capitalCycle",
]

NUMERIC_FEATURES = [
    "revenue_growth_1y",
    "revenue_growth_3y",
    "ebit_margin",
    "fcf_margin",
    "fcf_yield",
    "gross_margin",
    "operating_margin",
    "net_margin",
    "roic_proxy",
    "excess_roic_proxy",
    "roe",
    "roa",
    "debt_assets",
    "cash_assets",
    "asset_turnover",
    "capex_intensity",
    "working_capital_intensity",
    "ret_1y_trailing",
    "ret_3y_trailing",
    "vol_1y_trailing",
    "drawdown_3y_trailing",
    "risk_free_10y",
    "risk_free_delta_1y",
    "macro_cost_anchor",
    "ev_to_sales",
    "pb",
    "ev_to_sales_year_z",
    "pb_year_z",
    "bottleneck_proxy_year_z",
    "optionality_proxy_year_z",
    "capital_cycle_proxy_year_z",
]

TARGET_RETURN_COLS = ["ann_return_1y_fwd", "ann_return_3y_fwd"]
REGIME_COL = "omega_regime"
QUESTION_COL = "omega_primary_question"


@dataclass
class OmegaBundle:
    train: Dataset
    val: Dataset
    frame: pd.DataFrame
    feature_cols: list[str]
    lens_cols: list[str]
    regimes: list[str]
    questions: list[str]
    feature_mean: np.ndarray
    feature_std: np.ndarray


class OmegaDataset(Dataset):
    def __init__(
        self,
        current_x: np.ndarray,
        seq_x: np.ndarray,
        lens_targets: np.ndarray,
        return_targets: np.ndarray,
        return_mask: np.ndarray,
        regime_y: np.ndarray,
        question_y: np.ndarray,
        scalar_targets: np.ndarray,
        row_index: np.ndarray,
    ) -> None:
        self.current_x = torch.tensor(current_x, dtype=torch.float32)
        self.seq_x = torch.tensor(seq_x, dtype=torch.float32)
        self.lens_targets = torch.tensor(lens_targets, dtype=torch.float32)
        self.return_targets = torch.tensor(return_targets, dtype=torch.float32)
        self.return_mask = torch.tensor(return_mask, dtype=torch.float32)
        self.regime_y = torch.tensor(regime_y, dtype=torch.long)
        self.question_y = torch.tensor(question_y, dtype=torch.long)
        self.scalar_targets = torch.tensor(scalar_targets, dtype=torch.float32)
        self.row_index = torch.tensor(row_index, dtype=torch.long)

    def __len__(self) -> int:
        return int(self.current_x.shape[0])

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        return {
            "current_x": self.current_x[idx],
            "seq_x": self.seq_x[idx],
            "lens_targets": self.lens_targets[idx],
            "return_targets": self.return_targets[idx],
            "return_mask": self.return_mask[idx],
            "regime_y": self.regime_y[idx],
            "question_y": self.question_y[idx],
            "scalar_targets": self.scalar_targets[idx],
            "row_index": self.row_index[idx],
        }


def _safe_numeric(frame: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = frame.copy()
    for col in cols:
        if col not in out.columns:
            out[col] = np.nan
        out[col] = pd.to_numeric(out[col], errors="coerce").replace([np.inf, -np.inf], np.nan)
    return out


def _sequence_tensor(frame: pd.DataFrame, values: np.ndarray, max_years: int) -> np.ndarray:
    seq = np.zeros((len(frame), max_years, values.shape[1]), dtype=np.float32)
    ordered = frame[["ticker", "year"]].copy()
    positions_by_ticker: dict[str, list[int]] = {}
    for pos, ticker in enumerate(ordered["ticker"].astype(str)):
        positions_by_ticker.setdefault(ticker, []).append(pos)
    for positions in positions_by_ticker.values():
        positions = sorted(positions, key=lambda idx: int(ordered.iloc[idx]["year"]))
        for offset, pos in enumerate(positions):
            history = positions[max(0, offset - max_years + 1) : offset + 1]
            seq[pos, -len(history) :, :] = values[history]
    return seq


def build_omega_bundle(frame: pd.DataFrame, max_years: int = 8, train_end_year: int = 2020, val_start_year: int = 2021) -> OmegaBundle:
    data = frame.sort_values(["ticker", "year"]).reset_index(drop=True).copy()
    lens_cols = [f"pred_{name}" for name in LENS_NAMES]
    feature_cols = [col for col in NUMERIC_FEATURES if col in data.columns]
    data = _safe_numeric(data, feature_cols + lens_cols + TARGET_RETURN_COLS)
    if REGIME_COL not in data.columns:
        data[REGIME_COL] = "general_intrinsic"
    if QUESTION_COL not in data.columns:
        data[QUESTION_COL] = "Which valuation question deserves trust first?"
    for col, fallback in [
        ("omega_expectations_pressure", 0.5),
        ("omega_feasibility_score", 0.5),
        ("omega_downside_anchor_score", 0.5),
    ]:
        if col not in data.columns:
            data[col] = fallback
        data[col] = pd.to_numeric(data[col], errors="coerce").fillna(fallback).clip(0.0, 1.0)

    train_mask = data["year"] <= train_end_year
    val_mask = data["year"] >= val_start_year
    train_features = data.loc[train_mask, feature_cols].replace([np.inf, -np.inf], np.nan)
    mean = train_features.mean().fillna(0.0).to_numpy(dtype=np.float32)
    std = train_features.std(ddof=0).replace(0.0, 1.0).fillna(1.0).to_numpy(dtype=np.float32)

    features = data[feature_cols].fillna(pd.Series(mean, index=feature_cols)).to_numpy(dtype=np.float32)
    features = np.clip((features - mean) / std, -8.0, 8.0)
    seq = _sequence_tensor(data, features, max_years=max_years)

    lens_targets = data[lens_cols].fillna(0.0).to_numpy(dtype=np.float32)
    returns = data[TARGET_RETURN_COLS].to_numpy(dtype=np.float32)
    return_mask = np.isfinite(returns).astype(np.float32)
    returns = np.nan_to_num(returns, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)

    regimes = sorted(data[REGIME_COL].fillna("general_intrinsic").astype(str).unique())
    questions = sorted(data[QUESTION_COL].fillna("Which valuation question deserves trust first?").astype(str).unique())
    regime_map = {name: idx for idx, name in enumerate(regimes)}
    question_map = {name: idx for idx, name in enumerate(questions)}
    regime_y = data[REGIME_COL].fillna(regimes[0]).astype(str).map(regime_map).to_numpy(dtype=np.int64)
    question_y = data[QUESTION_COL].fillna(questions[0]).astype(str).map(question_map).to_numpy(dtype=np.int64)
    scalar_targets = data[["omega_expectations_pressure", "omega_feasibility_score", "omega_downside_anchor_score"]].to_numpy(dtype=np.float32)
    row_index = np.arange(len(data), dtype=np.int64)

    def subset(mask: pd.Series) -> OmegaDataset:
        idx = np.where(mask.to_numpy())[0]
        return OmegaDataset(
            current_x=features[idx],
            seq_x=seq[idx],
            lens_targets=lens_targets[idx],
            return_targets=returns[idx],
            return_mask=return_mask[idx],
            regime_y=regime_y[idx],
            question_y=question_y[idx],
            scalar_targets=scalar_targets[idx],
            row_index=row_index[idx],
        )

    return OmegaBundle(
        train=subset(train_mask),
        val=subset(val_mask),
        frame=data,
        feature_cols=feature_cols,
        lens_cols=lens_cols,
        regimes=regimes,
        questions=questions,
        feature_mean=mean,
        feature_std=std,
    )
