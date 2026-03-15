from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..config import PathConfig, ResearchSettings
from ..utils import ensure_directory


@dataclass(frozen=True)
class ForecastArtifacts:
    feature_frame: pd.DataFrame
    predictions: pd.DataFrame
    summary: dict


FEATURE_COLUMNS: tuple[str, ...] = (
    "ret_1d",
    "ret_5d",
    "ret_20d",
    "ret_60d",
    "vol_20d",
    "drawdown_20d",
    "crash_prob",
    "tail_risk_score",
    "legitimacy_risk",
    "crowding_pct",
    "tension_pct",
    "memory_p_fail",
    "recurrence",
)


def _safe_return(series: pd.Series, periods: int) -> pd.Series:
    return series / series.shift(periods) - 1.0


def _build_feature_frame(proxy_prices: pd.DataFrame, state_panel: pd.DataFrame, tickers: tuple[str, ...], horizons: tuple[int, ...]) -> pd.DataFrame:
    returns = proxy_prices.sort_index().ffill().pct_change()
    state = state_panel.copy()
    state["date"] = pd.to_datetime(state["date"]).astype("datetime64[ns]")
    for column in FEATURE_COLUMNS[6:]:
        if column not in state.columns:
            state[column] = 0.5
    rows: list[pd.DataFrame] = []
    for ticker in tickers:
        if ticker not in proxy_prices.columns:
            continue
        price = proxy_prices[ticker].dropna()
        if price.empty:
            continue
        ret_1d = price.pct_change()
        ret_5d = _safe_return(price, 5)
        ret_20d = _safe_return(price, 20)
        ret_60d = _safe_return(price, 60)
        vol_20d = ret_1d.rolling(20).std()
        drawdown_20d = price / price.rolling(20).max() - 1.0
        frame = pd.DataFrame(
            {
                "date": price.index,
                "ticker": ticker,
                "ret_1d": ret_1d.values,
                "ret_5d": ret_5d.values,
                "ret_20d": ret_20d.values,
                "ret_60d": ret_60d.values,
                "vol_20d": vol_20d.values,
                "drawdown_20d": drawdown_20d.values,
            }
        )
        for horizon in horizons:
            frame[f"target_{horizon}d"] = (price.shift(-horizon) / price - 1.0).values
        rows.append(frame)
    if not rows:
        return pd.DataFrame(columns=["date", "ticker", *FEATURE_COLUMNS])
    feature_frame = pd.concat(rows, ignore_index=True)
    feature_frame["date"] = pd.to_datetime(feature_frame["date"]).astype("datetime64[ns]")
    state_cols = ["date", "crash_prob", "tail_risk_score", "legitimacy_risk", "crowding_pct", "tension_pct", "memory_p_fail", "recurrence"]
    merged = pd.merge_asof(
        feature_frame.sort_values("date"),
        state[state_cols].sort_values("date"),
        on="date",
        direction="backward",
        allow_exact_matches=True,
    )
    return merged.sort_values(["ticker", "date"]).reset_index(drop=True)


def _monthly_refit_dates(dates: pd.Series) -> set[pd.Timestamp]:
    month_period = pd.to_datetime(dates).dt.to_period("M")
    changed = month_period != month_period.shift(1)
    return set(pd.to_datetime(dates.loc[changed]))


def _fit_and_predict(train: pd.DataFrame, test: pd.DataFrame, target_col: str) -> pd.Series:
    model = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("model", Ridge(alpha=1.0)),
        ]
    )
    model.fit(train[list(FEATURE_COLUMNS)], train[target_col])
    return pd.Series(model.predict(test[list(FEATURE_COLUMNS)]), index=test.index)


def _prediction_summary(predictions: pd.DataFrame, horizon: int) -> list[dict]:
    rows: list[dict] = []
    for ticker, group in predictions.groupby("ticker"):
        actual_col = f"actual_{horizon}d"
        pred_col = f"predicted_{horizon}d"
        clean = group[[pred_col, actual_col]].dropna()
        if clean.empty:
            continue
        pred_std = float(clean[pred_col].std(ddof=1)) if len(clean) > 1 else 0.0
        actual_std = float(clean[actual_col].std(ddof=1)) if len(clean) > 1 else 0.0
        corr = float(clean[pred_col].corr(clean[actual_col])) if len(clean) > 2 and pred_std > 0 and actual_std > 0 else np.nan
        mae = float((clean[pred_col] - clean[actual_col]).abs().mean())
        directional = float((np.sign(clean[pred_col]) == np.sign(clean[actual_col])).mean())
        rows.append(
            {
                "ticker": ticker,
                "horizon_days": horizon,
                "ic": corr,
                "mae": mae,
                "directional_accuracy": directional,
                "sample_size": int(len(clean)),
            }
        )
    return rows


def run_forecast_baselines(
    paths: PathConfig,
    settings: ResearchSettings,
    state_panel: pd.DataFrame,
    proxy_prices: pd.DataFrame,
) -> ForecastArtifacts:
    ensure_directory(settings.forecast_output_dir)
    feature_frame = _build_feature_frame(proxy_prices, state_panel, settings.forecast_tickers, settings.forecast_horizons)
    if feature_frame.empty:
        summary = {"latest": {}, "metrics": [], "warnings": ["forecast feature frame is empty"]}
        return ForecastArtifacts(feature_frame=feature_frame, predictions=pd.DataFrame(), summary=summary)

    predictions = feature_frame[["date", "ticker"]].copy()
    refit_dates = _monthly_refit_dates(feature_frame["date"])
    warnings: list[str] = []

    for horizon in settings.forecast_horizons:
        target_col = f"target_{horizon}d"
        pred_col = f"predicted_{horizon}d"
        actual_col = f"actual_{horizon}d"
        predictions[actual_col] = feature_frame[target_col]
        predictions[pred_col] = np.nan

        for ticker, group in feature_frame.groupby("ticker"):
            group = group.sort_values("date").reset_index()
            current_train: pd.DataFrame | None = None
            for idx, row in group.iterrows():
                date = row["date"]
                train = group.loc[group["date"] < date].dropna(subset=[target_col])
                if len(train) < settings.forecast_min_training_samples:
                    continue
                if current_train is None or date in refit_dates:
                    current_train = train.copy()
                test = group.loc[[idx]]
                try:
                    pred = _fit_and_predict(current_train, test, target_col).iloc[0]
                except Exception as exc:
                    warnings.append(f"{ticker} {horizon}d baseline failed: {exc}")
                    break
                predictions.loc[test["index"], pred_col] = pred

    metric_rows: list[dict] = []
    for horizon in settings.forecast_horizons:
        metric_rows.extend(_prediction_summary(predictions, horizon))

    latest_rows = predictions.sort_values("date").groupby("ticker").tail(1).copy()
    latest_payload: dict[str, dict] = {}
    for _, row in latest_rows.iterrows():
        latest_payload[str(row["ticker"])] = {
            f"predicted_{horizon}d": None if pd.isna(row.get(f"predicted_{horizon}d")) else float(row[f"predicted_{horizon}d"])
            for horizon in settings.forecast_horizons
        }
        latest_payload[str(row["ticker"])]["date"] = str(pd.to_datetime(row["date"]).date())

    summary = {
        "latest": latest_payload,
        "metrics": metric_rows,
        "warnings": sorted(set(warnings)),
    }
    predictions.to_csv(settings.forecast_output_dir / "forecast_backtest.csv", index=False)
    latest_rows.to_csv(settings.forecast_output_dir / "latest_forecasts.csv", index=False)
    (settings.forecast_output_dir / "forecast_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return ForecastArtifacts(feature_frame=feature_frame, predictions=predictions, summary=summary)
