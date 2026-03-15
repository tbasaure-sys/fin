from __future__ import annotations

import numpy as np
import pandas as pd


FEATURE_PRIORS = {
    "residual_momentum": 1.0,
    "momentum_intermediate": 0.8,
    "short_reversal": 0.4,
    "quality": 0.7,
    "value": 0.5,
    "beta": -0.3,
    "idio_vol": -0.6,
    "liquidity": 0.2,
    "crowding": -0.7,
    "crowding_unwind": 0.8,
}


def compute_daily_feature_ics(train_panel: pd.DataFrame, feature_columns: list[str], label_column: str = "fwd_return") -> pd.DataFrame:
    rows: list[dict[str, float | pd.Timestamp]] = []
    subset = train_panel[["date", *feature_columns, label_column]].dropna(subset=[label_column]).copy()
    for date, group in subset.groupby("date"):
        row: dict[str, float | pd.Timestamp] = {"date": pd.to_datetime(date)}
        if len(group) < 10:
            for feature in feature_columns:
                row[feature] = np.nan
            rows.append(row)
            continue
        label_rank = group[label_column].rank(pct=True)
        for feature in feature_columns:
            feature_rank = group[feature].rank(pct=True)
            corr = feature_rank.corr(label_rank)
            row[feature] = float(corr) if pd.notna(corr) else np.nan
        rows.append(row)
    if not rows:
        return pd.DataFrame(columns=["date", *feature_columns])
    return pd.DataFrame(rows).sort_values("date").reset_index(drop=True)


def estimate_feature_weights(train_panel: pd.DataFrame, feature_columns: list[str], label_column: str = "fwd_return") -> pd.Series:
    if train_panel.empty:
        return pd.Series(1.0 / len(feature_columns), index=feature_columns)
    daily_ics = compute_daily_feature_ics(train_panel, feature_columns, label_column=label_column)
    return estimate_feature_weights_from_ics(daily_ics, feature_columns)


def estimate_feature_weights_from_ics(daily_ics: pd.DataFrame, feature_columns: list[str]) -> pd.Series:
    if daily_ics.empty:
        return pd.Series(1.0 / len(feature_columns), index=feature_columns)
    empirical = daily_ics[feature_columns].mean(skipna=True).reindex(feature_columns).fillna(0.0)
    prior = pd.Series({feature: FEATURE_PRIORS.get(feature, 0.0) for feature in feature_columns}, index=feature_columns)
    weight_series = 0.65 * empirical + 0.35 * prior
    if weight_series.abs().sum() == 0:
        return pd.Series(1.0 / len(feature_columns), index=feature_columns)
    return weight_series / weight_series.abs().sum()


def compute_selection_diagnostics(scored: pd.DataFrame, top_n: int) -> dict[str, float]:
    if scored.empty:
        return {"selection_strength": 0.5, "breadth": 0.0, "top_spread": 0.0}
    ordered = scored.sort_values("selection_score", ascending=False).copy()
    top = ordered.head(top_n)
    middle = ordered.iloc[len(ordered) // 3 : 2 * len(ordered) // 3]
    bottom = ordered.tail(top_n)
    top_mean = float(top["selection_score"].mean()) if not top.empty else 0.0
    middle_mean = float(middle["selection_score"].mean()) if not middle.empty else 0.0
    bottom_mean = float(bottom["selection_score"].mean()) if not bottom.empty else 0.0
    top_spread = top_mean - middle_mean
    full_spread = top_mean - bottom_mean
    breadth = float((ordered["selection_score"] > 0).mean())
    normalized = float(np.clip(0.50 + 4.0 * top_spread + 2.0 * full_spread + 0.25 * (breadth - 0.5), 0.0, 1.0))
    return {
        "selection_strength": normalized,
        "breadth": breadth,
        "top_spread": full_spread,
    }


def score_cross_section(panel: pd.DataFrame, feature_columns: list[str], weights: pd.Series) -> pd.DataFrame:
    scored = panel.copy()
    for feature in feature_columns:
        scored[f"{feature}__rank"] = scored.groupby("date")[feature].rank(pct=True)
    score = pd.Series(0.0, index=scored.index)
    for feature in feature_columns:
        centered = scored[f"{feature}__rank"].fillna(0.5) - 0.5
        score = score + centered * float(weights.get(feature, 0.0))
    scored["selection_score_raw"] = score
    scored["selection_score"] = (
        scored["selection_score_raw"]
        + 0.10 * (scored["residual_momentum__rank"].fillna(0.5) - 0.5)
        + 0.08 * (scored["crowding_unwind__rank"].fillna(0.5) - 0.5)
    )
    scored["selection_rank"] = scored.groupby("date")["selection_score"].rank(pct=True)
    return scored
