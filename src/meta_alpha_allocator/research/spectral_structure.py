from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import PathConfig, ResearchSettings
from ..utils import ensure_directory


@dataclass
class SpectralRiskArtifacts:
    panel: pd.DataFrame
    summary: dict


def _safe_corr(window_returns: pd.DataFrame) -> pd.DataFrame:
    valid = window_returns.dropna(axis=1, thresh=max(int(len(window_returns) * 0.7), 12)).copy()
    if valid.shape[1] < 3:
        return pd.DataFrame()
    valid = valid.loc[:, valid.std(ddof=0).replace(0.0, np.nan).notna()]
    if valid.shape[1] < 3:
        return pd.DataFrame()
    return valid.corr().replace([np.inf, -np.inf], np.nan).dropna(axis=0, how="all").dropna(axis=1, how="all")


def _spectral_metrics(window_returns: pd.DataFrame) -> dict[str, float]:
    corr = _safe_corr(window_returns)
    if corr.empty or corr.shape[0] < 3:
        return {
            "n_assets": np.nan,
            "eig1_share": np.nan,
            "eig12_share": np.nan,
            "spectral_entropy": np.nan,
            "effective_dimension": np.nan,
            "lambda_ratio": np.nan,
            "avg_corr": np.nan,
        }
    matrix = corr.to_numpy(dtype=float)
    eigvals = np.linalg.eigvalsh(matrix)
    eigvals = np.clip(eigvals, 1e-8, None)
    eigvals = np.sort(eigvals)
    probs = eigvals / eigvals.sum()
    entropy = float(-(probs * np.log(probs)).sum())
    off_diag = matrix[np.triu_indices_from(matrix, k=1)]
    return {
        "n_assets": float(matrix.shape[0]),
        "eig1_share": float(eigvals[-1] / eigvals.sum()),
        "eig12_share": float((eigvals[-1] + eigvals[-2]) / eigvals.sum()),
        "spectral_entropy": entropy,
        "effective_dimension": float(np.exp(entropy)),
        "lambda_ratio": float(eigvals[-1] / eigvals[-2]),
        "avg_corr": float(np.nanmean(off_diag)) if len(off_diag) else np.nan,
    }


def _expanding_percentile(series: pd.Series, *, high_is_risky: bool) -> pd.Series:
    history: list[float] = []
    values: list[float] = []
    for raw in series:
        if pd.isna(raw):
            values.append(np.nan)
            continue
        current = float(raw)
        history.append(current)
        arr = np.asarray(history, dtype=float)
        percentile = float((arr <= current).mean())
        values.append(percentile if high_is_risky else 1.0 - percentile)
    return pd.Series(values, index=series.index, dtype=float)


def _nearest_psd(cov: np.ndarray) -> np.ndarray:
    sym = (cov + cov.T) / 2.0
    eigvals, eigvecs = np.linalg.eigh(sym)
    eigvals = np.clip(eigvals, 1e-8, None)
    return eigvecs @ np.diag(eigvals) @ eigvecs.T


def _estimate_regime_params(
    returns: pd.DataFrame,
    mask: pd.Series,
    *,
    regime: str,
) -> tuple[np.ndarray, np.ndarray, int]:
    subset = returns.loc[mask.reindex(returns.index).fillna(False)]
    subset = subset.dropna(how="all")
    if len(subset) < max(40, returns.shape[1] * 4):
        subset = returns.copy()
    subset = subset.fillna(0.0)
    mu = subset.mean().clip(-0.0015, 0.0015).to_numpy(dtype=float)
    cov = subset.cov().to_numpy(dtype=float)
    cov = _nearest_psd(cov)

    vols = np.sqrt(np.clip(np.diag(cov), 1e-8, None))
    corr = cov / np.outer(vols, vols)
    corr = np.nan_to_num(corr, nan=0.0)
    np.fill_diagonal(corr, 1.0)

    if regime == "compressed":
        vols = vols * 1.15
        corr = np.clip(corr * 1.10, -0.95, 0.99)
        np.fill_diagonal(corr, 1.0)
    else:
        vols = vols * 0.95
        corr = np.sign(corr) * np.minimum(np.abs(corr), np.abs(corr) * 0.92)
        np.fill_diagonal(corr, 1.0)

    adjusted = np.outer(vols, vols) * corr
    return mu, _nearest_psd(adjusted), int(len(subset))


def _simulate_paths(
    *,
    mu_open: np.ndarray,
    cov_open: np.ndarray,
    mu_compressed: np.ndarray,
    cov_compressed: np.ndarray,
    weights: np.ndarray,
    horizon: int,
    n_paths: int,
    p_compressed: float,
    seed: int,
) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    compressed_flags = rng.random(n_paths) < p_compressed
    open_paths = int((~compressed_flags).sum())
    compressed_paths = int(compressed_flags.sum())
    samples = np.zeros((n_paths, horizon, len(weights)), dtype=float)
    if open_paths:
        samples[~compressed_flags] = rng.multivariate_normal(mu_open, cov_open, size=(open_paths, horizon))
    if compressed_paths:
        samples[compressed_flags] = rng.multivariate_normal(mu_compressed, cov_compressed, size=(compressed_paths, horizon))
    portfolio_daily = samples @ weights
    wealth = np.cumprod(1.0 + portfolio_daily, axis=1)
    running_max = np.maximum.accumulate(wealth, axis=1)
    drawdowns = wealth / running_max - 1.0
    return wealth, drawdowns


def _path_records(wealth: np.ndarray) -> list[dict[str, float]]:
    p10 = np.quantile(wealth, 0.10, axis=0)
    p50 = np.quantile(wealth, 0.50, axis=0)
    p90 = np.quantile(wealth, 0.90, axis=0)
    records: list[dict[str, float]] = []
    for step in range(wealth.shape[1]):
        records.append(
            {
                "step": int(step + 1),
                "p10": float(p10[step]),
                "p50": float(p50[step]),
                "p90": float(p90[step]),
            }
        )
    return records


def _terminal_histogram(terminal_returns: np.ndarray, bins: int = 14) -> list[dict[str, float]]:
    counts, edges = np.histogram(terminal_returns, bins=bins)
    return [
        {
            "x0": float(edges[idx]),
            "x1": float(edges[idx + 1]),
            "count": int(count),
        }
        for idx, count in enumerate(counts)
    ]


def _summarize_simulation(
    wealth: np.ndarray,
    drawdowns: np.ndarray,
    *,
    horizon: int,
) -> dict[str, float | list[dict[str, float]]]:
    terminal = wealth[:, -1] - 1.0
    max_dd = drawdowns.min(axis=1)
    var_95 = float(np.quantile(terminal, 0.05))
    tail = terminal[terminal <= var_95]
    return {
        "horizon_days": int(horizon),
        "expected_return": float(np.mean(terminal)),
        "median_return": float(np.median(terminal)),
        "probability_loss": float(np.mean(terminal < 0.0)),
        "probability_drawdown_10": float(np.mean(max_dd <= -0.10)),
        "probability_drawdown_15": float(np.mean(max_dd <= -0.15)),
        "var_95": var_95,
        "cvar_95": float(np.mean(tail)) if len(tail) else var_95,
        "worst_decile_return": float(np.quantile(terminal, 0.10)),
        "best_decile_return": float(np.quantile(terminal, 0.90)),
        "path_percentiles": _path_records(wealth),
        "terminal_histogram": _terminal_histogram(terminal),
    }


def run_spectral_structure_pipeline(
    paths: PathConfig,
    research_settings: ResearchSettings,
    proxy_prices: pd.DataFrame,
    current_weights: dict[str, float] | None = None,
    *,
    write_outputs: bool = True,
    monte_carlo_paths: int | None = None,
) -> SpectralRiskArtifacts:
    if write_outputs:
        ensure_directory(research_settings.spectral_output_dir)
    prices = proxy_prices.sort_index().ffill().dropna(how="all")
    returns = prices.pct_change().dropna(how="all")
    window = research_settings.spectral_window_days

    records: list[dict[str, float | str]] = []
    for date in returns.index:
        window_returns = returns.loc[:date].tail(window)
        if len(window_returns) < max(20, window // 2):
            continue
        metrics = _spectral_metrics(window_returns)
        metrics["date"] = pd.Timestamp(date)
        records.append(metrics)

    panel = pd.DataFrame(records).sort_values("date").reset_index(drop=True)
    if panel.empty:
        summary = {
            "latest": {},
            "history": [],
            "monte_carlo": {},
            "warnings": ["insufficient market history for spectral structure"],
        }
        if write_outputs:
            (research_settings.spectral_output_dir / "spectral_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
            panel.to_csv(research_settings.spectral_output_dir / "spectral_state.csv", index=False)
        return SpectralRiskArtifacts(panel=panel, summary=summary)

    panel["eig1_percentile"] = _expanding_percentile(panel["eig1_share"], high_is_risky=True)
    panel["eig12_percentile"] = _expanding_percentile(panel["eig12_share"], high_is_risky=True)
    panel["corr_percentile"] = _expanding_percentile(panel["avg_corr"], high_is_risky=True)
    panel["entropy_percentile"] = _expanding_percentile(panel["spectral_entropy"], high_is_risky=False)
    panel["deff_percentile"] = _expanding_percentile(panel["effective_dimension"], high_is_risky=False)
    panel["compression_score_raw"] = panel[
        ["eig1_percentile", "eig12_percentile", "corr_percentile", "entropy_percentile", "deff_percentile"]
    ].mean(axis=1)
    panel["compression_score"] = panel["compression_score_raw"].rolling(5, min_periods=1).mean().clip(0.0, 1.0)
    panel["freedom_score"] = (1.0 - panel["compression_score"]).clip(0.0, 1.0)
    panel["functional_diversification_loss"] = (
        1.0 - (panel["effective_dimension"] / panel["n_assets"].replace(0.0, np.nan))
    ).clip(0.0, 1.0)

    compressed_threshold = float(panel["compression_score"].quantile(research_settings.spectral_compressed_quantile))
    open_threshold = float(panel["compression_score"].quantile(research_settings.spectral_open_quantile))
    panel["structural_state"] = np.select(
        [panel["compression_score"] >= compressed_threshold, panel["compression_score"] <= open_threshold],
        ["compressed", "open"],
        default="transition",
    )

    latest = panel.iloc[-1]
    p_compressed = float(np.clip(latest["compression_score"], 0.05, 0.95))
    p_open = float(1.0 - p_compressed)

    available_weights = current_weights or {"SPY": 1.0}
    weight_series = pd.Series({ticker: float(weight) for ticker, weight in available_weights.items() if ticker in returns.columns and float(weight) > 0.0})
    if weight_series.empty:
        weight_series = pd.Series({"SPY": 1.0})
    weight_series = weight_series / weight_series.sum()

    asset_returns = returns.reindex(columns=weight_series.index).dropna(how="all").fillna(0.0)
    aligned_states = panel.set_index("date")["structural_state"].reindex(asset_returns.index, method="ffill")
    mu_open, cov_open, n_open = _estimate_regime_params(asset_returns, aligned_states.eq("open"), regime="open")
    mu_compressed, cov_compressed, n_compressed = _estimate_regime_params(asset_returns, aligned_states.eq("compressed"), regime="compressed")

    path_count = int(monte_carlo_paths or research_settings.monte_carlo_paths)
    monte_carlo: dict[str, dict[str, float | list[dict[str, float]]]] = {}
    for idx, horizon in enumerate(research_settings.monte_carlo_horizons):
        wealth, drawdowns = _simulate_paths(
            mu_open=mu_open,
            cov_open=cov_open,
            mu_compressed=mu_compressed,
            cov_compressed=cov_compressed,
            weights=weight_series.to_numpy(dtype=float),
            horizon=horizon,
            n_paths=path_count,
            p_compressed=p_compressed,
            seed=42 + idx,
        )
        monte_carlo[str(horizon)] = _summarize_simulation(wealth, drawdowns, horizon=horizon)

    anchor_horizon = str(max(research_settings.monte_carlo_horizons))
    anchor = monte_carlo.get(anchor_horizon, {})
    structural_beta_ceiling = float(
        np.clip(
            1.0 - (0.70 * p_compressed) - (0.45 * float(anchor.get("probability_loss", 0.0))) - (0.35 * abs(float(anchor.get("cvar_95", 0.0)))),
            0.25,
            1.0,
        )
    )
    if structural_beta_ceiling >= 0.8:
        suggested_stance = "run_risk"
    elif structural_beta_ceiling >= 0.55:
        suggested_stance = "balanced"
    else:
        suggested_stance = "defensive"

    latest_payload = {
        "date": str(pd.to_datetime(latest["date"]).date()),
        "structural_state": latest["structural_state"],
        "compression_score": float(latest["compression_score"]),
        "freedom_score": float(latest["freedom_score"]),
        "functional_diversification_loss": float(latest["functional_diversification_loss"]),
        "eig1_share": float(latest["eig1_share"]),
        "eig12_share": float(latest["eig12_share"]),
        "avg_corr": float(latest["avg_corr"]),
        "effective_dimension": float(latest["effective_dimension"]),
        "n_assets": float(latest["n_assets"]),
        "lambda_ratio": float(latest["lambda_ratio"]),
        "spectral_entropy": float(latest["spectral_entropy"]),
        "p_compressed": p_compressed,
        "p_open": p_open,
        "structural_beta_ceiling": structural_beta_ceiling,
        "suggested_stance": suggested_stance,
        "structural_narrative": [
            f"Primary mode explains {latest['eig1_share']:.0%} of current correlation mass.",
            f"Effective dimension is {latest['effective_dimension']:.1f} across {int(latest['n_assets'])} active assets.",
            f"Current structural state is {latest['structural_state']}, implying {p_compressed:.0%} probability that diversification is functionally compressed.",
        ],
    }

    summary = {
        "latest": latest_payload,
        "history": json.loads(
            panel.tail(research_settings.spectral_history_points)
            .replace({np.nan: None})
            .to_json(orient="records", date_format="iso")
        ),
        "thresholds": {
            "open": open_threshold,
            "compressed": compressed_threshold,
        },
        "portfolio_weights_used": {ticker: float(weight) for ticker, weight in weight_series.items()},
        "regime_samples": {
            "open": n_open,
            "compressed": n_compressed,
        },
        "monte_carlo": monte_carlo,
    }

    if write_outputs:
        panel.to_csv(research_settings.spectral_output_dir / "spectral_state.csv", index=False)
        (research_settings.spectral_output_dir / "spectral_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return SpectralRiskArtifacts(panel=panel, summary=summary)
