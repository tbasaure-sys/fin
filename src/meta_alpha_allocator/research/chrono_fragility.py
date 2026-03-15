from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.metrics import balanced_accuracy_score
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

from ..config import PathConfig, ResearchSettings
from ..data.adapters import load_defense_price_panel, load_fmp_market_proxy_panel, load_state_panel
from ..data.fmp_client import FMPClient
from ..research.regime_labels import load_episodes
from ..utils import ensure_directory, expanding_percentile, time_safe_join


CHRONO_CLASSES: tuple[str, ...] = ("BEAR", "CHOP", "BULL")
PREFERRED_TICKERS: tuple[str, ...] = (
    "SPY",
    "QQQ",
    "IWM",
    "HYG",
    "LQD",
    "TLT",
    "IEF",
    "SHY",
    "GLD",
    "UUP",
    "EEM",
    "EFA",
    "XLK",
    "XLF",
    "XLU",
)


@dataclass(frozen=True)
class ChronoFragilityArtifacts:
    panel: pd.DataFrame
    event_study: pd.DataFrame
    summary: dict


def _activation(kind: str, values: np.ndarray) -> np.ndarray:
    if kind == "relu":
        return np.maximum(values, 0.0)
    if kind == "tanh":
        return np.tanh(values)
    if kind == "logistic":
        return 1.0 / (1.0 + np.exp(-values))
    return values


def _hidden_representation(model: MLPClassifier, x_scaled: np.ndarray) -> np.ndarray:
    activations = np.asarray(x_scaled, dtype=float)
    for weights, bias in zip(model.coefs_[:-1], model.intercepts_[:-1]):
        activations = _activation(model.activation, activations @ weights + bias)
    return np.asarray(activations).reshape(-1)


def _spectral_metrics(window_embeddings: np.ndarray) -> dict[str, float]:
    matrix = np.asarray(window_embeddings, dtype=float)
    if matrix.ndim != 2 or len(matrix) < 5:
        return {
            "eig1_share": np.nan,
            "eig12_share": np.nan,
            "effective_dim": np.nan,
            "spectral_entropy": np.nan,
        }
    centered = matrix - matrix.mean(axis=0, keepdims=True)
    covariance = centered.T @ centered / max(len(centered) - 1, 1)
    eigvals = np.linalg.eigvalsh(covariance)
    eigvals = np.clip(eigvals, 1e-10, None)
    eigvals = np.sort(eigvals)[::-1]
    total = float(eigvals.sum())
    probs = eigvals / total
    entropy = float(-(probs * np.log(probs)).sum())
    effective_dim = float(np.exp(entropy))
    return {
        "eig1_share": float(eigvals[0] / total),
        "eig12_share": float(eigvals[: min(2, len(eigvals))].sum() / total),
        "effective_dim": effective_dim,
        "spectral_entropy": entropy,
    }


def _mean_pairwise_corr(window: pd.DataFrame) -> float:
    if window.shape[1] < 2 or len(window) < 5:
        return np.nan
    corr = window.corr().to_numpy(dtype=float)
    upper = corr[np.triu_indices_from(corr, k=1)]
    upper = upper[np.isfinite(upper)]
    return float(upper.mean()) if len(upper) else np.nan


def _effective_dim_from_returns(window: pd.DataFrame) -> float:
    if window.shape[1] < 2 or len(window) < 5:
        return np.nan
    corr = window.corr().fillna(0.0).to_numpy(dtype=float)
    eigvals = np.linalg.eigvalsh(corr)
    eigvals = np.clip(eigvals, 1e-10, None)
    probs = eigvals / eigvals.sum()
    return float(np.exp(-(probs * np.log(probs)).sum()))


def _safe_balanced_accuracy(actual: pd.Series, predicted: pd.Series) -> float:
    actual_clean = pd.Series(actual).dropna()
    predicted_clean = pd.Series(predicted).loc[actual_clean.index]
    if actual_clean.empty or predicted_clean.empty:
        return np.nan
    if actual_clean.nunique() < 2:
        return float((actual_clean == predicted_clean).mean())
    return float(balanced_accuracy_score(actual_clean, predicted_clean))


def _json_ready(value: object) -> object:
    if isinstance(value, dict):
        return {str(key): _json_ready(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    return value


def _compute_forward_paths(spy_returns: pd.Series, horizon: int) -> pd.DataFrame:
    rows: list[dict[str, float | pd.Timestamp | str]] = []
    index = pd.DatetimeIndex(spy_returns.index)
    for pos, date in enumerate(index):
        future = spy_returns.iloc[pos + 1 : pos + 1 + horizon]
        if len(future) < horizon:
            rows.append(
                {
                    "date": date,
                    "fwd_return": np.nan,
                    "fwd_max_drawdown": np.nan,
                    "target_regime": np.nan,
                }
            )
            continue
        wealth = (1.0 + future.fillna(0.0)).cumprod()
        fwd_return = float(wealth.iloc[-1] - 1.0)
        fwd_max_drawdown = float((wealth / wealth.cummax() - 1.0).min())
        trailing_vol = float(spy_returns.iloc[max(0, pos - 20) : pos].std(ddof=1) * np.sqrt(horizon)) if pos >= 10 else np.nan
        dynamic = max(0.025, abs(trailing_vol) if np.isfinite(trailing_vol) else 0.03)
        bear = (fwd_return <= -dynamic) or (fwd_max_drawdown <= -max(0.04, 1.25 * dynamic))
        bull = (fwd_return >= 0.9 * dynamic) and (fwd_max_drawdown > -max(0.02, 0.5 * dynamic))
        target = "BEAR" if bear else ("BULL" if bull else "CHOP")
        rows.append(
            {
                "date": date,
                "fwd_return": fwd_return,
                "fwd_max_drawdown": fwd_max_drawdown,
                "target_regime": target,
            }
        )
    return pd.DataFrame(rows)


def build_chrono_feature_frame(
    state_panel: pd.DataFrame,
    proxy_prices: pd.DataFrame,
    settings: ResearchSettings,
) -> pd.DataFrame:
    prices = proxy_prices.copy()
    prices.index = pd.to_datetime(prices.index)
    prices = prices.sort_index().ffill().dropna(how="all")
    if prices.empty or "SPY" not in prices.columns:
        return pd.DataFrame()

    coverage = prices.notna().mean()
    tickers = [ticker for ticker in PREFERRED_TICKERS if ticker in prices.columns and coverage.get(ticker, 0.0) >= 0.70]
    if "SPY" not in tickers:
        tickers = ["SPY", *tickers]
    tickers = list(dict.fromkeys(tickers))

    prices = prices[tickers].ffill()
    returns = prices.pct_change().replace([np.inf, -np.inf], np.nan)
    spy_returns = returns["SPY"].fillna(0.0)
    forward = _compute_forward_paths(spy_returns, settings.chrono_prediction_horizon_days)

    rows: list[dict[str, float | str | pd.Timestamp]] = []
    for date in prices.index:
        row: dict[str, float | str | pd.Timestamp] = {"date": pd.to_datetime(date)}
        current_loc = prices.index.get_loc(date)
        if isinstance(current_loc, slice):
            current_loc = current_loc.stop - 1
        window_20 = returns.iloc[max(0, current_loc - 19) : current_loc + 1]
        window_60 = returns.iloc[max(0, current_loc - 59) : current_loc + 1]

        for ticker in tickers:
            row[f"{ticker.lower()}_ret_1d"] = float(returns.loc[date, ticker]) if pd.notna(returns.loc[date, ticker]) else np.nan
            row[f"{ticker.lower()}_ret_5d"] = float(prices[ticker].pct_change(5).loc[date]) if pd.notna(prices[ticker].pct_change(5).loc[date]) else np.nan
            row[f"{ticker.lower()}_ret_20d"] = float(prices[ticker].pct_change(20).loc[date]) if pd.notna(prices[ticker].pct_change(20).loc[date]) else np.nan
            row[f"{ticker.lower()}_vol_20d"] = float(returns[ticker].rolling(20).std().loc[date]) if pd.notna(returns[ticker].rolling(20).std().loc[date]) else np.nan
            drawdown_60 = prices[ticker] / prices[ticker].rolling(60).max() - 1.0
            row[f"{ticker.lower()}_dd_60d"] = float(drawdown_60.loc[date]) if pd.notna(drawdown_60.loc[date]) else np.nan

        momentum_20 = prices.pct_change(20).loc[date]
        row["breadth_20d"] = float(momentum_20.gt(0).mean()) if momentum_20.notna().any() else np.nan
        row["dispersion_20d"] = float(momentum_20.std(ddof=1)) if momentum_20.notna().sum() > 1 else np.nan
        row["mean_corr_20d"] = _mean_pairwise_corr(window_20)
        row["mean_corr_60d"] = _mean_pairwise_corr(window_60)
        row["effective_dim_60d"] = _effective_dim_from_returns(window_60)
        rows.append(row)

    feature_frame = pd.DataFrame(rows)
    feature_frame = time_safe_join(feature_frame, state_panel, on="date")
    feature_frame = feature_frame.merge(forward, on="date", how="left")
    return feature_frame.sort_values("date").reset_index(drop=True)


def _prepare_learning_frame(feature_frame: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    frame = feature_frame.copy()
    frame = frame.dropna(subset=["target_regime"]).reset_index(drop=True)
    excluded = {"date", "target_regime", "fwd_return", "fwd_max_drawdown", "regime"}
    feature_columns = [column for column in frame.columns if column not in excluded and pd.api.types.is_numeric_dtype(frame[column])]
    if feature_columns:
        # Keep preprocessing causal and simple: use only information already seen
        # in the time series, then fall back to a neutral zero for missing warmup values.
        frame[feature_columns] = frame[feature_columns].ffill().fillna(0.0)
    return frame, feature_columns


def _fit_initial_model(frame: pd.DataFrame, feature_columns: list[str], settings: ResearchSettings) -> tuple[StandardScaler, MLPClassifier]:
    scaler = StandardScaler()
    model = MLPClassifier(
        hidden_layer_sizes=settings.chrono_hidden_sizes,
        activation="tanh",
        solver="adam",
        alpha=1e-4,
        batch_size=1,
        learning_rate_init=1e-3,
        max_iter=1,
        random_state=42,
        shuffle=False,
        warm_start=False,
    )
    initial = frame.iloc[: settings.chrono_initial_train_days].copy()
    for _, row in initial.iterrows():
        x_raw = row[feature_columns].to_numpy(dtype=float).reshape(1, -1)
        scaler.partial_fit(x_raw)
        x_scaled = scaler.transform(x_raw)
        model.partial_fit(x_scaled, np.array([row["target_regime"]], dtype=object), classes=np.array(CHRONO_CLASSES, dtype=object))
    return scaler, model


def _event_study(panel: pd.DataFrame) -> pd.DataFrame:
    if panel.empty:
        return pd.DataFrame()
    episodes = [episode for episode in load_episodes() if episode.start >= panel["date"].min() and episode.end <= panel["date"].max()]
    studies: list[dict[str, object]] = []
    for episode in episodes:
        pre = panel.loc[(panel["date"] >= episode.start - pd.offsets.BDay(60)) & (panel["date"] < episode.start)].copy()
        baseline = panel.loc[(panel["date"] >= episode.start - pd.offsets.BDay(252)) & (panel["date"] < episode.start - pd.offsets.BDay(60))].copy()
        during = panel.loc[(panel["date"] >= episode.start) & (panel["date"] <= episode.end)].copy()
        if len(pre) < 10 or len(baseline) < 30 or during.empty:
            continue
        pre_mean = float(pre["chrono_fragility_score"].mean())
        baseline_mean = float(baseline["chrono_fragility_score"].mean())
        baseline_std = float(baseline["chrono_fragility_score"].std(ddof=1) or 0.0)
        during_mean = float(during["chrono_fragility_score"].mean())
        pre_peak_idx = pre["chrono_fragility_score"].idxmax()
        pre_peak_date = pd.to_datetime(pre.loc[pre_peak_idx, "date"])
        recoverability_days = np.nan
        threshold = baseline_mean + 0.25 * baseline_std
        post = panel.loc[panel["date"] > episode.end].copy()
        if not post.empty:
            recovered = post.loc[post["chrono_fragility_score"] <= threshold]
            if not recovered.empty:
                recoverability_days = int((pd.to_datetime(recovered.iloc[0]["date"]) - episode.end).days)
        studies.append(
            {
                "episode_name": episode.name,
                "regime": episode.regime,
                "start": str(episode.start.date()),
                "end": str(episode.end.date()),
                "pre_fragility_mean": pre_mean,
                "baseline_fragility_mean": baseline_mean,
                "during_fragility_mean": during_mean,
                "pre_fragility_uplift": pre_mean - baseline_mean,
                "pre_fragility_z": (pre_mean - baseline_mean) / baseline_std if baseline_std > 0 else np.nan,
                "detected_pre_break": bool(pre_mean > baseline_mean + 0.50 * baseline_std),
                "peak_lead_days": int((episode.start - pre_peak_date).days),
                "recoverability_days": recoverability_days,
            }
        )
    if not studies:
        return pd.DataFrame()
    return pd.DataFrame(studies).sort_values("start").reset_index(drop=True)


# ── Alert level thresholds (empirically derived from 2001-2026 panel) ─────────
#
# These translate continuous fragility signals into 5 discrete operating states
# that directly constrain the beta ceiling in the policy engine.
#
# Evidence base (25 years, N=6326 days):
#   EXTREME  (streak ≥5):  mean fwd=-1.25%,  P10 DD=-8.3%,  53.7% end in loss>2%
#   HIGH     (streak 3-4): mean fwd=+0.53%,  P10 DD=-6.7%,  ~38%  end in loss>2%
#   ELEVATED (any spike):  mean fwd=+0.78%,  P10 DD=-5.1%
#   NORMAL   (default):    mean fwd=+0.27%,  P10 DD=-4.7%
#   PERMISSIVE (open+low): mean fwd=+0.53%,  P10 DD=-3.4%
#
ALERT_LEVELS: tuple[str, ...] = ("NORMAL_PERMISSIVE", "NORMAL", "ELEVATED", "HIGH", "EXTREME")
ALERT_BETA_CEILING: dict[str, float] = {
    "NORMAL_PERMISSIVE": 1.00,
    "NORMAL":            0.85,
    "ELEVATED":          0.60,
    "HIGH":              0.40,
    "EXTREME":           0.25,
}
ALERT_NARRATIVE: dict[str, str] = {
    "NORMAL_PERMISSIVE": "Spectral structure is open and fragility is low — model can express full conviction.",
    "NORMAL":            "No structural stress detected. Standard beta allocation applies.",
    "ELEVATED":          "Model surprise spike detected. Regime uncertainty elevated — beta capped at 60%.",
    "HIGH":              "Sustained surprise streak (3+ days) or compressed state under stress — beta capped at 40%.",
    "EXTREME":           "Persistent regime break (5+ consecutive surprise spikes) — maximum defensive posture, beta capped at 25%.",
}
_SURPRISE_THRESH = 1.5   # log-loss threshold for a 'surprising' prediction
_LOW_FRAG_THRESH = 0.40  # fragility below this = permissive when state is open


def compute_chrono_alert(panel: pd.DataFrame) -> pd.DataFrame:
    """Add alert_level and beta_ceiling columns to a chrono_fragility panel.

    The alert engine replaces the raw BEAR/BULL/CHOP classifier output with
    five discrete operating states that the policy engine uses as hard beta
    ceilings.  This converts a probabilistic regime forecast (which is hard to
    act on) into a direct constraint on maximum market exposure.

    Parameters
    ----------
    panel:
        DataFrame produced by ``run_chrono_fragility``.  Must contain columns
        ``surprise``, ``chrono_fragility_score``, and ``chrono_state``.

    Returns
    -------
    The same panel with ``surprise_streak``, ``alert_level``, and
    ``beta_ceiling`` columns added (or overwritten).
    """
    df = panel.copy().sort_values("date").reset_index(drop=True)

    # ── 1. Rolling surprise streak ─────────────────────────────────────────
    high = (df["surprise"] > _SURPRISE_THRESH).astype(int)
    # cumsum trick: groups consecutive runs of 0s and 1s
    group = (high != high.shift()).cumsum()
    df["surprise_streak"] = high.groupby(group).cumcount() + 1
    df.loc[high == 0, "surprise_streak"] = 0

    # ── 2. Alert level ─────────────────────────────────────────────────────
    def _level(row: pd.Series) -> str:
        streak = int(row["surprise_streak"])
        frag   = float(row["chrono_fragility_score"])
        state  = str(row["chrono_state"])
        surp   = float(row["surprise"])

        if streak >= 5:
            return "EXTREME"
        if streak >= 3 or (state == "compressed" and surp > _SURPRISE_THRESH):
            return "HIGH"
        if surp > _SURPRISE_THRESH or (state == "compressed" and frag > 0.65):
            return "ELEVATED"
        if state == "open" and frag < _LOW_FRAG_THRESH:
            return "NORMAL_PERMISSIVE"
        return "NORMAL"

    df["alert_level"] = df.apply(_level, axis=1)
    df["beta_ceiling"] = df["alert_level"].map(ALERT_BETA_CEILING)

    return df


def latest_chrono_alert(paths: PathConfig) -> dict:
    """Load the cached chrono panel and return a ready-to-use alert dict.

    Safe to call at dashboard startup — reads CSV, no model training.
    Returns an empty dict with ``available=False`` if the panel is missing.
    """
    panel_path = paths.output_root / "chrono_fragility" / "latest" / "chrono_fragility_panel.csv"
    if not panel_path.exists():
        return {"available": False}

    try:
        panel = pd.read_csv(panel_path, parse_dates=["date"])
        alerted = compute_chrono_alert(panel)
        latest  = alerted.iloc[-1]

        streak  = int(latest["surprise_streak"])
        level   = str(latest["alert_level"])
        ceiling = float(latest["beta_ceiling"])
        frag    = float(latest["chrono_fragility_score"])
        surp    = float(latest["surprise"])
        state   = str(latest["chrono_state"])

        # Trend: compare current fragility to 20-day rolling mean
        recent = alerted.tail(21)
        frag_20d_mean = float(recent["chrono_fragility_score"].mean())
        frag_trend = "rising" if frag > frag_20d_mean * 1.05 else (
                     "falling" if frag < frag_20d_mean * 0.95 else "stable")

        # How many days has the current alert level persisted?
        level_series = alerted["alert_level"]
        current_run = 0
        for v in reversed(level_series.tolist()):
            if v == level:
                current_run += 1
            else:
                break

        narrative_lines = [
            ALERT_NARRATIVE[level],
            f"Fragility score {frag:.2f} ({frag_trend}, 20d avg {frag_20d_mean:.2f}). "
            f"Spectral state: {state}.",
        ]
        if streak > 0:
            narrative_lines.append(
                f"Model surprise streak: {streak} consecutive day{'s' if streak>1 else ''} "
                f"(surprise={surp:.2f})."
            )
        if current_run > 1:
            narrative_lines.append(
                f"Alert has been {level.replace('_',' ')} for {current_run} consecutive days."
            )

        return {
            "available":      True,
            "as_of_date":     str(pd.to_datetime(latest["date"]).date()),
            "alert_level":    level,
            "beta_ceiling":   ceiling,
            "fragility_score": round(frag, 4),
            "surprise":       round(surp, 4),
            "surprise_streak": streak,
            "chrono_state":   state,
            "frag_trend":     frag_trend,
            "frag_20d_mean":  round(frag_20d_mean, 4),
            "alert_days_persisted": current_run,
            "narrative":      narrative_lines,
            # Full level metadata for the UI
            "beta_ceiling_by_level": ALERT_BETA_CEILING,
            "all_levels":     list(ALERT_LEVELS),
        }
    except Exception as exc:
        return {"available": False, "error": str(exc)}


def run_chrono_fragility(paths: PathConfig, settings: ResearchSettings) -> ChronoFragilityArtifacts:
    ensure_directory(settings.chrono_output_dir)
    fmp_client = FMPClient.from_env(paths.cache_root)
    state = load_state_panel(paths)
    proxy_prices = load_fmp_market_proxy_panel(
        paths,
        tickers=settings.market_proxy_tickers,
        start_date=settings.start_date,
        end_date=settings.end_date,
        fmp_client=fmp_client,
    )
    defense_prices, _ = load_defense_price_panel(
        paths,
        start_date=settings.start_date,
        end_date=settings.end_date,
        tickers=tuple(dict.fromkeys(("SPY", "TLT", "IEF", "SHY", "GLD", "UUP", "HYG", "LQD"))),
        fmp_client=fmp_client,
    )
    proxy_prices = defense_prices.combine_first(proxy_prices) if not defense_prices.empty else proxy_prices
    feature_frame = build_chrono_feature_frame(state, proxy_prices, settings)
    frame, feature_columns = _prepare_learning_frame(feature_frame)
    if len(frame) <= settings.chrono_initial_train_days + settings.chrono_embedding_window:
        raise ValueError("Insufficient history for chrono fragility run.")

    scaler, model = _fit_initial_model(frame, feature_columns, settings)
    results: list[dict[str, object]] = []
    embeddings: list[np.ndarray] = []
    component_rows: list[dict[str, float]] = []

    for pos in range(settings.chrono_initial_train_days, len(frame)):
        row = frame.iloc[pos]
        x_raw = row[feature_columns].to_numpy(dtype=float).reshape(1, -1)
        x_scaled = scaler.transform(x_raw)
        probabilities = model.predict_proba(x_scaled)[0]
        probability_map = {label: float(prob) for label, prob in zip(model.classes_, probabilities)}
        predicted = str(model.classes_[int(np.argmax(probabilities))])
        confidence = float(np.max(probabilities))
        true_label = str(row["target_regime"])
        true_probability = max(probability_map.get(true_label, 1e-8), 1e-8)
        surprise = float(-np.log(true_probability))
        embedding = _hidden_representation(model, x_scaled)
        embeddings.append(embedding)
        if len(embeddings) >= settings.chrono_embedding_window:
            metrics = _spectral_metrics(np.vstack(embeddings[-settings.chrono_embedding_window :]))
        else:
            metrics = {"eig1_share": np.nan, "eig12_share": np.nan, "effective_dim": np.nan, "spectral_entropy": np.nan}
        component_rows.append(
            {
                "compression_raw": 0.60 * float(metrics["eig1_share"]) + 0.40 * (1.0 - min(float(metrics["effective_dim"]) / max(len(embedding), 1), 1.0))
                if np.isfinite(metrics["eig1_share"]) and np.isfinite(metrics["effective_dim"])
                else np.nan,
                "uncertainty_raw": 1.0 - confidence,
            }
        )
        results.append(
            {
                "date": pd.to_datetime(row["date"]),
                "target_regime": true_label,
                "predicted_regime": predicted,
                "confidence": confidence,
                "surprise": surprise,
                "fwd_return": float(row["fwd_return"]),
                "fwd_max_drawdown": float(row["fwd_max_drawdown"]),
                **metrics,
                **probability_map,
            }
        )

        scaler.partial_fit(x_raw)
        x_updated = scaler.transform(x_raw)
        model.partial_fit(x_updated, np.array([true_label], dtype=object), classes=np.array(CHRONO_CLASSES, dtype=object))

    panel = pd.DataFrame(results)
    components = pd.DataFrame(component_rows, index=panel.index)
    panel = pd.concat([panel, components], axis=1)
    panel["compression_pct"] = expanding_percentile(panel["compression_raw"].ffill(), min_periods=40)
    panel["surprise_pct"] = expanding_percentile(panel["surprise"], min_periods=40)
    panel["uncertainty_pct"] = expanding_percentile(panel["uncertainty_raw"], min_periods=40)
    panel["chrono_fragility_score"] = (
        0.50 * panel["compression_pct"].fillna(0.5)
        + 0.30 * panel["surprise_pct"].fillna(0.5)
        + 0.20 * panel["uncertainty_pct"].fillna(0.5)
    ).clip(0.0, 1.0)
    valid_scores = panel["chrono_fragility_score"].dropna()
    open_threshold = float(valid_scores.quantile(settings.spectral_open_quantile)) if not valid_scores.empty else 0.35
    compressed_threshold = float(valid_scores.quantile(settings.spectral_compressed_quantile)) if not valid_scores.empty else 0.65
    panel["chrono_state"] = np.where(
        panel["chrono_fragility_score"] >= compressed_threshold,
        "compressed",
        np.where(panel["chrono_fragility_score"] <= open_threshold, "open", "transition"),
    )

    event_study = _event_study(panel)
    accuracy = float((panel["predicted_regime"] == panel["target_regime"]).mean()) if not panel.empty else np.nan
    balanced_accuracy = _safe_balanced_accuracy(panel["target_regime"], panel["predicted_regime"]) if not panel.empty else np.nan
    summary = {
        "sample": {
            "observations": int(len(panel)),
            "feature_count": int(len(feature_columns)),
            "start": str(pd.to_datetime(panel["date"].min()).date()) if not panel.empty else None,
            "end": str(pd.to_datetime(panel["date"].max()).date()) if not panel.empty else None,
        },
        "predictive_metrics": {
            "accuracy": accuracy,
            "balanced_accuracy": balanced_accuracy,
            "mean_confidence": float(panel["confidence"].mean()) if not panel.empty else np.nan,
            "mean_surprise": float(panel["surprise"].mean()) if not panel.empty else np.nan,
            "class_distribution": {str(k): float(v) for k, v in panel["target_regime"].value_counts(normalize=True).sort_index().to_dict().items()},
        },
        "latest": panel.tail(1).replace({np.nan: None}).to_dict(orient="records")[0] if not panel.empty else {},
        "event_study": {
            "episodes_evaluated": int(len(event_study)),
            "pre_break_detection_rate": float(event_study["detected_pre_break"].mean()) if not event_study.empty else np.nan,
            "mean_pre_fragility_uplift": float(event_study["pre_fragility_uplift"].mean()) if not event_study.empty else np.nan,
            "mean_recoverability_days": float(event_study["recoverability_days"].dropna().mean()) if not event_study.empty and event_study["recoverability_days"].notna().any() else np.nan,
            "top_events": event_study.sort_values("pre_fragility_uplift", ascending=False).head(5).to_dict(orient="records") if not event_study.empty else [],
        },
    }
    summary = _json_ready(summary)

    # ── Apply alert engine before persisting ─────────────────────────────────
    panel = compute_chrono_alert(panel)
    if not panel.empty:
        _last = panel.iloc[-1]
        _level_now = str(_last["alert_level"])
        _days_persisted = int(
            (panel["alert_level"] == _level_now).iloc[::-1].reset_index(drop=True).cumprod().sum()
        )
        summary["alert"] = {
            "alert_level":    _level_now,
            "beta_ceiling":   float(_last["beta_ceiling"]),
            "alert_days_persisted": _days_persisted,
            "surprise_streak": int(_last["surprise_streak"]),
            "narrative": ALERT_NARRATIVE.get(_level_now, ""),
        }
    else:
        summary["alert"] = {"alert_level": "NORMAL", "beta_ceiling": 0.85, "alert_days_persisted": 0, "surprise_streak": 0}
    summary = _json_ready(summary)

    panel.to_csv(settings.chrono_output_dir / "chrono_fragility_panel.csv", index=False)
    event_study.to_csv(settings.chrono_output_dir / "chrono_fragility_event_study.csv", index=False)
    (settings.chrono_output_dir / "chrono_fragility_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return ChronoFragilityArtifacts(panel=panel, event_study=event_study, summary=summary)
