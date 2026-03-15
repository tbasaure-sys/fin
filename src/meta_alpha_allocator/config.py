from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FINANCE_ROOT = PROJECT_ROOT.parent
CT_ROOT = FINANCE_ROOT.parent

# When running on Railway/Vercel/any cloud host, set META_ALLOCATOR_CLOUD=1
# to activate safe defaults that don't assume a local filesystem layout.
_IS_CLOUD = os.environ.get("META_ALLOCATOR_CLOUD", "").strip() in {"1", "true", "yes"}

# In cloud mode the "local-only" roots fall back to subdirs inside the project
# so the server boots without FileNotFoundError even when those dirs are absent.
_SAFE_FINANCE_ROOT = PROJECT_ROOT / "_local_data" / "finance"
_SAFE_CT_ROOT = PROJECT_ROOT / "_local_data" / "ct"


def _env_path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name, str(default))).expanduser()


def _cloud_path(name: str, local_default: Path, cloud_default: Path) -> Path:
    """Return env-var path if set, else cloud_default (cloud) or local_default (dev)."""
    if name in os.environ:
        return Path(os.environ[name]).expanduser()
    return cloud_default if _IS_CLOUD else local_default


@dataclass(frozen=True)
class PathConfig:
    project_root: Path = field(default_factory=lambda: _env_path("META_ALLOCATOR_PROJECT_ROOT", PROJECT_ROOT))

    # These two are only needed when running the full research pipeline locally.
    # In cloud (dashboard-serve only) they default to safe no-op paths so
    # load_state_panel() and other adapters can fall back gracefully instead
    # of raising FileNotFoundError at import time.
    finance_root: Path = field(
        default_factory=lambda: _cloud_path(
            "META_ALLOCATOR_FINANCE_ROOT", FINANCE_ROOT, _SAFE_FINANCE_ROOT
        )
    )
    ct_root: Path = field(
        default_factory=lambda: _cloud_path(
            "META_ALLOCATOR_CT_ROOT", CT_ROOT, _SAFE_CT_ROOT
        )
    )
    fin_model_root: Path = field(
        default_factory=lambda: _cloud_path(
            "META_ALLOCATOR_FIN_MODEL_ROOT",
            FINANCE_ROOT / "Fin_model",
            _SAFE_FINANCE_ROOT / "Fin_model",
        )
    )
    portfolio_manager_root: Path = field(
        default_factory=lambda: _cloud_path(
            "META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT",
            FINANCE_ROOT / "portfolio_manager",
            _SAFE_FINANCE_ROOT / "portfolio_manager",
        )
    )
    polymarket_root: Path = field(
        default_factory=lambda: _cloud_path(
            "META_ALLOCATOR_POLYMARKET_ROOT",
            CT_ROOT / "polymarket_paper_trader",
            _SAFE_CT_ROOT / "polymarket_paper_trader",
        )
    )
    caria_data_root: Path = field(
        default_factory=lambda: _cloud_path(
            "META_ALLOCATOR_CARIA_DATA_ROOT",
            CT_ROOT / "01_Framework_Core" / "manuscripts" / "research" / "caria_publication" / "data",
            _SAFE_CT_ROOT / "caria_data",
        )
    )
    output_root: Path = field(default_factory=lambda: _env_path("META_ALLOCATOR_OUTPUT_ROOT", PROJECT_ROOT / "output"))
    cache_root: Path = field(default_factory=lambda: _env_path("META_ALLOCATOR_CACHE_ROOT", PROJECT_ROOT / "cache"))


@dataclass(frozen=True)
class ResearchSettings:
    start_date: str = "2015-10-08"
    end_date: str | None = None
    train_lookback_days: int = 756
    embargo_days: int = 21
    forward_horizon_days: int = 21
    weekly_rebalance_weekday: int = 4
    retrain_frequency: str = "monthly"
    top_n: int = 20
    max_position: float = 0.05
    max_sector: float = 0.25
    transaction_cost_bps: float = 10.0
    min_assets_per_day: int = 25
    tail_horizons: tuple[int, ...] = (5, 10, 20)
    tail_loss_thresholds: tuple[float, ...] = (-0.01, -0.02, -0.035)
    policy_min_training_samples: int = 80
    policy_retrain_frequency: str = "monthly"
    policy_confidence_threshold: float = 0.42
    forecast_min_training_samples: int = 252
    forecast_retrain_frequency: str = "monthly"
    forecast_horizons: tuple[int, ...] = (5, 10, 20)
    spectral_window_days: int = 60
    spectral_history_points: int = 180
    spectral_open_quantile: float = 0.35
    spectral_compressed_quantile: float = 0.65
    monte_carlo_horizons: tuple[int, ...] = (21, 63)
    monte_carlo_paths: int = 1500
    forecast_tickers: tuple[str, ...] = ("SPY", "SHY", "IEF", "GLD", "UUP", "BIL")
    market_proxy_tickers: tuple[str, ...] = (
        "SPY",
        "QQQ",
        "IWM",
        "TLT",
        "IEF",
        "SHY",
        "BIL",
        "HYG",
        "LQD",
        "GLD",
        "DBC",
        "UUP",
        "XLB",
        "XLK",
        "XLC",
        "XLF",
        "XLE",
        "XLV",
        "XLI",
        "XLY",
        "XLP",
        "XLU",
        "XLRE",
        "EEM",
        "EFA",
        "VGK",
        "EWJ",
        "FXI",
        "EWC",
        "EWZ",
        "INDA",
    )
    sector_proxy_map: tuple[tuple[str, str], ...] = (
        ("Basic Materials", "XLB"),
        ("Communication", "XLC"),
        ("Communication Services", "XLC"),
        ("Consumer Discretionary", "XLY"),
        ("Consumer Cyclical", "XLY"),
        ("Consumer Staples", "XLP"),
        ("Consumer Defensive", "XLP"),
        ("Energy", "XLE"),
        ("Financial", "XLF"),
        ("Financial Services", "XLF"),
        ("Health Care", "XLV"),
        ("Healthcare", "XLV"),
        ("Industrials", "XLI"),
        ("Materials", "XLB"),
        ("Real Estate", "XLRE"),
        ("Information Technology", "XLK"),
        ("Technology", "XLK"),
        ("Utilities", "XLU"),
    )
    international_proxy_map: tuple[tuple[str, str], ...] = (
        ("Developed ex US", "EFA"),
        ("Emerging Markets", "EEM"),
        ("Europe", "VGK"),
        ("Japan", "EWJ"),
        ("China", "FXI"),
        ("Canada", "EWC"),
        ("Brazil", "EWZ"),
        ("India", "INDA"),
    )
    hedge_tickers: tuple[str, ...] = ("IEF", "TLT", "SHY", "BIL", "GLD", "UUP")
    fred_series: tuple[str, ...] = (
        "DGS10",
        "DGS2",
        "T10Y2Y",
        "FEDFUNDS",
        "M2SL",
        "WALCL",
        "BAMLC0A0CM",
        "BAMLH0A0HYM2",
        "DCOILWTICO",
        "DTWEXBGS",
    )
    feature_columns: tuple[str, ...] = (
        "residual_momentum",
        "momentum_intermediate",
        "short_reversal",
        "quality",
        "value",
        "beta",
        "idio_vol",
        "liquidity",
        "crowding",
        "crowding_unwind",
    )
    output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "research" / "latest")
    tail_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "tail_risk" / "latest")
    policy_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "policy" / "latest")
    forecast_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "forecast" / "latest")
    spectral_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "spectral" / "latest")
    statement_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "statement_intel" / "latest")
    statement_kernel_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "statement_kernel" / "latest")


@dataclass(frozen=True)
class AllocatorSettings:
    base_core_weight: float = 0.35
    base_defense_weight: float = 0.15
    base_selection_weight: float = 0.50
    max_position: float = 0.05
    max_sector: float = 0.25
    min_selection_weight: float = 0.05
    min_defense_weight: float = 0.10
    defensive_threshold: float = 0.65
    crisis_threshold: float = 0.80
    primary_core_ticker: str = "SPY"
    defense_cash_ticker: str = "BIL"
    output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "production" / "latest")


@dataclass(frozen=True)
class DashboardSettings:
    # In cloud mode default to 0.0.0.0 so Railway/Render/Fly can bind the port.
    # Locally keep 127.0.0.1 unless overridden.
    host: str = field(
        default_factory=lambda: os.environ.get(
            "META_ALLOCATOR_HOST",
            "0.0.0.0" if _IS_CLOUD else "127.0.0.1",
        )
    )
    port: int = field(default_factory=lambda: int(os.environ.get("PORT", os.environ.get("META_ALLOCATOR_PORT", "8765"))))
    auto_refresh_seconds: int = 300
    market_lookback_days: int = 252
    chart_history_points: int = 260
    output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "dashboard" / "latest")
