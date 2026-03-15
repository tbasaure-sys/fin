from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ..config import PathConfig, ResearchSettings
from ..data.adapters import load_defense_price_panel, load_fmp_market_proxy_panel
from ..data.fred_client import FREDClient
from ..data.fmp_client import FMPClient
from ..utils import ensure_directory
from .market_structure import build_market_structure_features


@dataclass
class TailRiskArtifacts:
    panel: pd.DataFrame
    summary: dict


def _effective_dimension(returns: pd.DataFrame) -> float:
    if returns.shape[1] < 3:
        return np.nan
    corr = returns.corr().replace([np.inf, -np.inf], np.nan).fillna(0.0)
    eigvals = np.linalg.eigvalsh(corr.to_numpy())
    eigvals = eigvals[eigvals > 1e-8]
    if len(eigvals) == 0:
        return np.nan
    probs = eigvals / eigvals.sum()
    return float(np.exp(-(probs * np.log(probs)).sum()))


def _market_feature_frame(proxy_prices: pd.DataFrame, state: pd.DataFrame, fred_panel: pd.DataFrame | None = None) -> pd.DataFrame:
    prices = proxy_prices.sort_index().ffill().dropna(how="all")
    returns = prices.pct_change()
    spy = prices["SPY"]
    spy_ret = returns["SPY"]

    features = pd.DataFrame(index=prices.index)
    features["spy_ret_1d"] = spy_ret
    features["spy_mom_5d"] = spy.pct_change(5)
    features["spy_mom_10d"] = spy.pct_change(10)
    features["spy_mom_20d"] = spy.pct_change(20)
    features["spy_vol_5d"] = spy_ret.rolling(5).std()
    features["spy_vol_10d"] = spy_ret.rolling(10).std()
    features["spy_vol_20d"] = spy_ret.rolling(20).std()
    features["spy_skew_20d"] = spy_ret.rolling(20).skew()
    features["spy_kurt_20d"] = spy_ret.rolling(20).kurt()
    features["spy_drawdown_20d"] = spy / spy.rolling(20).max() - 1.0
    features["breadth_5d"] = (returns.rolling(5).mean() > 0).mean(axis=1)
    features["breadth_20d"] = (returns.rolling(20).mean() > 0).mean(axis=1)
    features["dispersion_20d"] = returns.rolling(20).std().mean(axis=1)
    features["mean_corr_20d"] = returns.rolling(20).corr(spy_ret).groupby(level=0).mean().mean(axis=1)
    features["d_eff_20d"] = returns.rolling(20).apply(lambda _: np.nan, raw=False).iloc[:, 0]

    deff_values: list[float] = []
    dates: list[pd.Timestamp] = []
    for date in prices.index:
        window = returns.loc[:date].tail(20).dropna(axis=1, how="all")
        dates.append(date)
        if len(window) < 10:
            deff_values.append(np.nan)
            continue
        deff_values.append(_effective_dimension(window.dropna(how="any", axis=1)))
    features["d_eff_20d"] = pd.Series(deff_values, index=dates)

    for left, right, name in [
        ("HYG", "LQD", "credit_spread_proxy"),
        ("TLT", "IEF", "term_proxy"),
        ("XLK", "XLU", "cyclical_defensive_proxy"),
    ]:
        if left in prices.columns and right in prices.columns:
            ratio = prices[left] / prices[right]
            features[name] = ratio.pct_change(20)

    if "UUP" in prices.columns:
        features["usd_trend_20d"] = prices["UUP"].pct_change(20)
    if "GLD" in prices.columns and "DBC" in prices.columns:
        features["commodity_balance_20d"] = (prices["GLD"] / prices["DBC"]).pct_change(20)

    market_structure = build_market_structure_features(prices)
    features = features.join(market_structure.set_index("date"), how="left")
    features["breadth_20d"] = features["breadth_20d"].combine_first(features["pct_positive_20d"])
    features["dispersion_20d"] = features["dispersion_20d"].combine_first(features["return_dispersion_20d"])
    features["mean_corr_20d"] = features["mean_corr_20d"].combine_first(features["avg_pair_corr_60d"])

    if "GLD" in prices.columns:
        gold = prices["GLD"]
        features["gold_return_1m"] = gold.pct_change(20)
        features["gold_return_3m"] = gold.pct_change(60)
        features["gold_volatility_30d"] = gold.pct_change().rolling(30).std() * np.sqrt(252.0)
        gold_ma200 = gold.rolling(200).mean()
        features["gold_above_ma200"] = (gold > gold_ma200).astype(float)
        features["gold_crisis_signal"] = (features["gold_return_1m"] > 0.08).astype(float)
        features["gold_vs_spy_3m"] = features["gold_return_3m"] - spy.pct_change(60)

    if "UUP" in prices.columns:
        usd = prices["UUP"]
        features["dollar_return_1m"] = usd.pct_change(20)
        features["dollar_return_3m"] = usd.pct_change(60)
        usd_ma200 = usd.rolling(200).mean()
        features["dollar_above_ma200"] = (usd > usd_ma200).astype(float)
        features["dollar_strong"] = (features["dollar_return_3m"] > 0.05).astype(float)
        features["dollar_weak"] = (features["dollar_return_3m"] < -0.05).astype(float)

    if "DBC" in prices.columns:
        commodity = prices["DBC"]
        features["commodity_return_1m"] = commodity.pct_change(20)
        features["commodity_return_3m"] = commodity.pct_change(60)
        features["commodity_volatility_30d"] = commodity.pct_change().rolling(30).std() * np.sqrt(252.0)

    if "GLD" in prices.columns and "DBC" in prices.columns:
        ratio = prices["GLD"] / prices["DBC"].replace(0.0, np.nan)
        ratio_ma = ratio.rolling(200).mean()
        features["gold_commodity_ratio"] = ratio
        features["gold_commodity_ratio_high"] = (ratio > ratio_ma * 1.15).astype(float)
        features["gold_commodity_ratio_rising"] = (ratio.pct_change(60) > 0.15).astype(float)

    merged_state = state.copy()
    merged_state["date"] = pd.to_datetime(merged_state["date"])
    merged_state = merged_state.set_index("date").sort_index()
    features = features.join(merged_state, how="left").ffill()

    if fred_panel is not None and not fred_panel.empty:
        macro = fred_panel.copy()
        macro["date"] = pd.to_datetime(macro["date"])
        macro = macro.set_index("date").sort_index().reindex(features.index).ffill()
        if "DGS10" in macro.columns:
            features["fred_10y"] = macro["DGS10"] / 100.0
        if "DGS2" in macro.columns:
            features["fred_2y"] = macro["DGS2"] / 100.0
        if "T10Y2Y" in macro.columns:
            features["fred_term_spread"] = macro["T10Y2Y"] / 100.0
        elif {"DGS10", "DGS2"}.issubset(set(macro.columns)):
            features["fred_term_spread"] = (macro["DGS10"] - macro["DGS2"]) / 100.0
        if "FEDFUNDS" in macro.columns:
            features["fred_fed_funds"] = macro["FEDFUNDS"] / 100.0
        if "M2SL" in macro.columns:
            features["fred_m2_yoy"] = macro["M2SL"].pct_change(252)
        if "WALCL" in macro.columns:
            features["fred_balance_sheet_yoy"] = macro["WALCL"].pct_change(252)
        if "BAMLC0A0CM" in macro.columns:
            features["fred_ig_spread"] = macro["BAMLC0A0CM"] / 100.0
        if "BAMLH0A0HYM2" in macro.columns:
            features["fred_hy_spread"] = macro["BAMLH0A0HYM2"] / 100.0
        if {"BAMLC0A0CM", "BAMLH0A0HYM2"}.issubset(set(macro.columns)):
            features["fred_hy_ig_gap"] = (macro["BAMLH0A0HYM2"] - macro["BAMLC0A0CM"]) / 100.0
        if "DCOILWTICO" in macro.columns:
            oil = macro["DCOILWTICO"].replace(0.0, np.nan)
            features["oil_return_1m"] = oil.pct_change(20)
            features["oil_return_3m"] = oil.pct_change(60)
            features["oil_volatility_30d"] = oil.pct_change().rolling(30).std() * np.sqrt(252.0)
            features["oil_crash"] = (features["oil_return_3m"] < -0.25).astype(float)
            features["oil_spike"] = (features["oil_return_3m"] > 0.25).astype(float)
        if "DTWEXBGS" in macro.columns and "dollar_return_3m" not in features.columns:
            dollar = macro["DTWEXBGS"].replace(0.0, np.nan)
            features["dollar_return_1m"] = dollar.pct_change(20)
            features["dollar_return_3m"] = dollar.pct_change(60)
            features["dollar_strong"] = (features["dollar_return_3m"] > 0.05).astype(float)
            features["dollar_weak"] = (features["dollar_return_3m"] < -0.05).astype(float)

    if {"gold_return_3m", "dollar_return_3m"}.issubset(set(features.columns)):
        features["gold_dollar_both_rising"] = (
            (features["gold_return_3m"] > 0.05) & (features["dollar_return_3m"] > 0.05)
        ).astype(float)
    if {"dollar_return_3m", "gold_return_3m", "oil_return_3m"}.issubset(set(features.columns)):
        features["qe_commodity_signal"] = (
            (features["dollar_return_3m"] < -0.03)
            & (features["gold_return_3m"] > 0.03)
            & (features["oil_return_3m"] > 0.0)
        ).astype(float)
        features["tightening_commodity_signal"] = (
            (features["dollar_return_3m"] > 0.03) & (features["gold_return_3m"] < 0.0)
        ).astype(float)

    return features.reset_index(names="date")


def _fit_horizon_model(features: pd.DataFrame, labels: pd.Series) -> tuple[np.ndarray, dict[str, float]]:
    numeric_cols = ["date"] + [column for column in features.columns if column != "date" and pd.api.types.is_numeric_dtype(features[column])]
    valid = features.loc[:, numeric_cols].copy()
    valid["label"] = labels.values
    valid = valid.dropna(subset=["label"])
    if valid["label"].nunique() < 2:
        probs = np.full(len(features), float(valid["label"].mean() if not valid.empty else 0.5))
        return probs, {"event_rate": float(valid["label"].mean() if not valid.empty else 0.0), "used_fallback": True}

    split = int(len(valid) * 0.7)
    train = valid.iloc[:split]
    test = valid.iloc[split:]
    model = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )
    x_train = train.drop(columns=["date", "label"])
    y_train = train["label"].astype(int)
    model.fit(x_train, y_train)
    full_probs = model.predict_proba(valid.drop(columns=["date", "label"]))[:, 1]
    score = float(model.score(test.drop(columns=["date", "label"]), test["label"].astype(int))) if len(test) > 10 else np.nan
    return full_probs, {"event_rate": float(valid["label"].mean()), "test_accuracy": score, "used_fallback": False}


def run_tail_risk_pipeline(
    paths: PathConfig,
    research_settings: ResearchSettings,
    state: pd.DataFrame,
    fmp_client: FMPClient | None = None,
    fred_client: FREDClient | None = None,
) -> TailRiskArtifacts:
    ensure_directory(research_settings.tail_output_dir)
    proxy_prices = load_fmp_market_proxy_panel(
        paths,
        tickers=research_settings.market_proxy_tickers,
        start_date=research_settings.start_date,
        end_date=research_settings.end_date,
        fmp_client=fmp_client,
    )
    defense_panel, _ = load_defense_price_panel(
        paths,
        start_date=research_settings.start_date,
        end_date=research_settings.end_date,
        tickers=("SPY", "IEF", "BIL"),
        fmp_client=fmp_client,
    )
    if proxy_prices.empty:
        proxy_prices = defense_panel.copy()
    else:
        proxy_prices = defense_panel.combine_first(proxy_prices)

    fred_panel = None
    if fred_client is not None:
        fred_panel = fred_client.get_macro_panel(research_settings.fred_series, research_settings.start_date, research_settings.end_date)

    feature_frame = _market_feature_frame(proxy_prices, state, fred_panel=fred_panel)
    horizons = research_settings.tail_horizons
    thresholds = dict(zip(horizons, research_settings.tail_loss_thresholds))
    spy = proxy_prices["SPY"].sort_index()

    panel = feature_frame.copy()
    summary = {"horizons": {}, "latest": {}}
    for horizon in horizons:
        fwd_return = spy.pct_change(horizon).shift(-horizon)
        labels = (fwd_return <= thresholds[horizon]).astype(float).reindex(panel["date"]).reset_index(drop=True)
        probs, stats = _fit_horizon_model(panel, labels)
        panel[f"tail_loss_{horizon}d"] = probs
        panel[f"tail_label_{horizon}d"] = labels
        summary["horizons"][str(horizon)] = {
            "threshold": thresholds[horizon],
            **stats,
        }

    panel["tail_risk_score"] = (
        0.25 * panel["tail_loss_5d"].fillna(0.5)
        + 0.35 * panel["tail_loss_10d"].fillna(0.5)
        + 0.40 * panel["tail_loss_20d"].fillna(0.5)
    ).clip(0.0, 1.0)
    latest = panel.dropna(subset=["tail_risk_score"]).iloc[-1]
    summary["latest"] = {
        "date": str(pd.to_datetime(latest["date"]).date()),
        "tail_loss_5d": float(latest["tail_loss_5d"]),
        "tail_loss_10d": float(latest["tail_loss_10d"]),
        "tail_loss_20d": float(latest["tail_loss_20d"]),
        "tail_risk_score": float(latest["tail_risk_score"]),
    }
    structure_keys = [
        "breadth_20d",
        "dispersion_20d",
        "avg_pair_corr_60d",
        "momentum_concentration_60d",
        "realized_cross_sectional_vol",
        "gold_return_3m",
        "dollar_return_3m",
        "oil_return_3m",
        "gold_commodity_ratio",
    ]
    summary["latest_structure"] = {
        key: (float(latest[key]) if key in latest and pd.notna(latest[key]) else None)
        for key in structure_keys
    }
    if fred_panel is not None and not fred_panel.empty:
        summary["macro_series"] = [column for column in fred_panel.columns if column != "date"]

    panel.to_csv(research_settings.tail_output_dir / "tail_risk_predictions.csv", index=False)
    (research_settings.tail_output_dir / "tail_risk_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return TailRiskArtifacts(panel=panel, summary=summary)
