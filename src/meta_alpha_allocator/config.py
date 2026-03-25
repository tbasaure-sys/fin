from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path
from typing import Callable, TypeVar


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FINANCE_ROOT = PROJECT_ROOT.parent
CT_ROOT = FINANCE_ROOT.parent
T = TypeVar("T")

def _looks_like_cloud_host() -> bool:
    indicators = (
        "META_ALLOCATOR_CLOUD",
        "RAILWAY_ENVIRONMENT",
        "RAILWAY_SERVICE_ID",
        "RAILWAY_PROJECT_ID",
        "VERCEL",
        "FLY_APP_NAME",
        "K_SERVICE",
        "RENDER",
    )
    for name in indicators:
        value = os.environ.get(name, "").strip().lower()
        if value and value not in {"0", "false", "no"}:
            return True
    return False


# When running on Railway/Vercel/any cloud host, prefer safe defaults that do
# not assume a local filesystem layout.
_IS_CLOUD = _looks_like_cloud_host()

# In cloud mode the "local-only" roots fall back to subdirs inside the project
# so the server boots without FileNotFoundError even when those dirs are absent.
_SAFE_FINANCE_ROOT = PROJECT_ROOT / "cloud_data" / "finance"
_SAFE_CT_ROOT = PROJECT_ROOT / "cloud_data" / "ct"


def _env_path(name: str, default: Path) -> Path:
    return Path(os.environ.get(name, str(default))).expanduser()


def _env_text(name: str, default: str) -> str:
    value = os.environ.get(name)
    return value.strip() if isinstance(value, str) and value.strip() else default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_optional_text(name: str, default: str | None) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return default
    text = value.strip()
    return text or None


def _env_tuple(name: str, default: tuple[T, ...], caster: Callable[[str], T]) -> tuple[T, ...]:
    raw = os.environ.get(name)
    if not raw or not raw.strip():
        return default
    items: list[T] = []
    for chunk in raw.split(","):
        text = chunk.strip()
        if not text:
            continue
        try:
            items.append(caster(text))
        except Exception:
            return default
    return tuple(items) if items else default


def _env_pair_tuple(name: str, default: tuple[tuple[str, str], ...]) -> tuple[tuple[str, str], ...]:
    raw = os.environ.get(name)
    if not raw or not raw.strip():
        return default
    pairs: list[tuple[str, str]] = []
    for chunk in raw.split(","):
        text = chunk.strip()
        if not text or ":" not in text:
            return default
        left, right = text.split(":", 1)
        left = left.strip()
        right = right.strip()
        if not left or not right:
            return default
        pairs.append((left, right))
    return tuple(pairs) if pairs else default


def _cloud_path(name: str, local_default: Path, cloud_default: Path) -> Path:
    """Return env-var path if set, else cloud_default (cloud) or local_default (dev)."""
    if name in os.environ:
        return Path(os.environ[name]).expanduser()
    return cloud_default if _IS_CLOUD else local_default


def _first_existing_path(*candidates: Path) -> Path | None:
    for candidate in candidates:
        expanded = candidate.expanduser()
        if expanded.exists():
            return expanded
    return None


def _local_or_cloud_path(name: str, local_candidates: tuple[Path, ...], cloud_default: Path) -> Path:
    if name in os.environ:
        return Path(os.environ[name]).expanduser()
    if _IS_CLOUD:
        return cloud_default
    return _first_existing_path(*local_candidates) or local_candidates[0]


@dataclass(frozen=True)
class PathConfig:
    project_root: Path = field(default_factory=lambda: _env_path("META_ALLOCATOR_PROJECT_ROOT", PROJECT_ROOT))
    artifact_root: Path = field(default_factory=lambda: _env_path("META_ALLOCATOR_ARTIFACT_ROOT", PROJECT_ROOT / "artifacts"))

    # These two are only needed when running the full research pipeline locally.
    # In cloud (dashboard-serve only) they default to safe no-op paths so
    # load_state_panel() and other adapters can fall back gracefully instead
    # of raising FileNotFoundError at import time.
    finance_root: Path = field(
        default_factory=lambda: _local_or_cloud_path(
            "META_ALLOCATOR_FINANCE_ROOT",
            (
                PROJECT_ROOT / "_local_data" / "finance",
                FINANCE_ROOT,
            ),
            _SAFE_FINANCE_ROOT,
        )
    )
    ct_root: Path = field(
        default_factory=lambda: _local_or_cloud_path(
            "META_ALLOCATOR_CT_ROOT",
            (
                PROJECT_ROOT / "_local_data" / "ct",
                CT_ROOT,
            ),
            _SAFE_CT_ROOT,
        )
    )
    fin_model_root: Path = field(
        default_factory=lambda: _env_path(
            "META_ALLOCATOR_FIN_MODEL_ROOT",
            _first_existing_path(
                PROJECT_ROOT / "_local_data" / "finance" / "Fin_model",
                FINANCE_ROOT / "Fin_model",
            ) or (_SAFE_FINANCE_ROOT / "Fin_model" if _IS_CLOUD else PROJECT_ROOT / "_local_data" / "finance" / "Fin_model"),
        )
    )
    portfolio_manager_root: Path = field(
        default_factory=lambda: _env_path(
            "META_ALLOCATOR_PORTFOLIO_MANAGER_ROOT",
            _first_existing_path(
                PROJECT_ROOT / "_local_data" / "finance" / "portfolio_manager",
                FINANCE_ROOT / "portfolio_manager",
            ) or (_SAFE_FINANCE_ROOT / "portfolio_manager" if _IS_CLOUD else PROJECT_ROOT / "_local_data" / "finance" / "portfolio_manager"),
        )
    )
    polymarket_root: Path = field(
        default_factory=lambda: _env_path(
            "META_ALLOCATOR_POLYMARKET_ROOT",
            _first_existing_path(
                PROJECT_ROOT / "_local_data" / "ct" / "polymarket_paper_trader",
                CT_ROOT / "polymarket_paper_trader",
            ) or (_SAFE_CT_ROOT / "polymarket_paper_trader" if _IS_CLOUD else PROJECT_ROOT / "_local_data" / "ct" / "polymarket_paper_trader"),
        )
    )
    caria_data_root: Path = field(
        default_factory=lambda: _env_path(
            "META_ALLOCATOR_CARIA_DATA_ROOT",
            _first_existing_path(
                PROJECT_ROOT / "_local_data" / "ct" / "caria_data",
                CT_ROOT / "01_Framework_Core" / "manuscripts" / "research" / "caria_publication" / "data",
            ) or (_SAFE_CT_ROOT / "caria_data" if _IS_CLOUD else PROJECT_ROOT / "_local_data" / "ct" / "caria_data"),
        )
    )
    output_root: Path = field(default_factory=lambda: _env_path("META_ALLOCATOR_OUTPUT_ROOT", PROJECT_ROOT / "output"))
    cache_root: Path = field(default_factory=lambda: _env_path("META_ALLOCATOR_CACHE_ROOT", PROJECT_ROOT / "cache"))

    def portfolio_manager_latest_roots(self) -> tuple[Path, ...]:
        return (
            self.portfolio_manager_root / "output" / "latest",
            self.portfolio_manager_root / "latest_inputs",
        )

    def resolve_portfolio_manager_latest_root(self, *required_files: str) -> Path:
        for root in self.portfolio_manager_latest_roots():
            if all((root / name).exists() for name in required_files):
                return root
        return self.portfolio_manager_latest_roots()[0]


@dataclass(frozen=True)
class ResearchSettings:
    start_date: str = field(default_factory=lambda: _env_text("META_ALLOCATOR_RESEARCH_START_DATE", "2015-10-08"))
    end_date: str | None = field(default_factory=lambda: _env_optional_text("META_ALLOCATOR_RESEARCH_END_DATE", None))
    train_lookback_days: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_TRAIN_LOOKBACK_DAYS", 756))
    embargo_days: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_EMBARGO_DAYS", 21))
    forward_horizon_days: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_FORWARD_HORIZON_DAYS", 21))
    weekly_rebalance_weekday: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_WEEKLY_REBALANCE_WEEKDAY", 4))
    retrain_frequency: str = field(default_factory=lambda: _env_text("META_ALLOCATOR_RETRAIN_FREQUENCY", "monthly"))
    top_n: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_TOP_N", 20))
    max_position: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_MAX_POSITION", 0.05))
    max_sector: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_MAX_SECTOR", 0.25))
    transaction_cost_bps: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_TRANSACTION_COST_BPS", 10.0))
    min_assets_per_day: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_MIN_ASSETS_PER_DAY", 25))
    tail_horizons: tuple[int, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_TAIL_HORIZONS", (5, 10, 20), int))
    tail_loss_thresholds: tuple[float, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_TAIL_LOSS_THRESHOLDS", (-0.01, -0.02, -0.035), float))
    policy_min_training_samples: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_POLICY_MIN_TRAINING_SAMPLES", 24))
    policy_retrain_frequency: str = field(default_factory=lambda: _env_text("META_ALLOCATOR_POLICY_RETRAIN_FREQUENCY", "monthly"))
    policy_confidence_threshold: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_POLICY_CONFIDENCE_THRESHOLD", 0.42))
    policy_label_min_forward_spread: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_POLICY_LABEL_MIN_FORWARD_SPREAD", 0.02))
    policy_label_min_utility_gap: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_POLICY_LABEL_MIN_UTILITY_GAP", 0.005))
    forecast_min_training_samples: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_FORECAST_MIN_TRAINING_SAMPLES", 252))
    forecast_retrain_frequency: str = field(default_factory=lambda: _env_text("META_ALLOCATOR_FORECAST_RETRAIN_FREQUENCY", "monthly"))
    forecast_horizons: tuple[int, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_FORECAST_HORIZONS", (5, 10, 20), int))
    spectral_window_days: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_SPECTRAL_WINDOW_DAYS", 60))
    spectral_history_points: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_SPECTRAL_HISTORY_POINTS", 180))
    spectral_open_quantile: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_SPECTRAL_OPEN_QUANTILE", 0.35))
    spectral_compressed_quantile: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_SPECTRAL_COMPRESSED_QUANTILE", 0.65))
    monte_carlo_horizons: tuple[int, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_MONTE_CARLO_HORIZONS", (21, 63), int))
    monte_carlo_paths: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_MONTE_CARLO_PATHS", 1500))
    chrono_initial_train_days: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_CHRONO_INITIAL_TRAIN_DAYS", 252))
    chrono_prediction_horizon_days: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_CHRONO_PREDICTION_HORIZON_DAYS", 10))
    chrono_embedding_window: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_CHRONO_EMBEDDING_WINDOW", 60))
    chrono_hidden_sizes: tuple[int, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_CHRONO_HIDDEN_SIZES", (32, 12), int))
    forecast_tickers: tuple[str, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_FORECAST_TICKERS", ("SPY", "SHY", "IEF", "GLD", "UUP", "BIL"), str))
    market_proxy_tickers: tuple[str, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_MARKET_PROXY_TICKERS", (
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
    ), str))
    sector_proxy_map: tuple[tuple[str, str], ...] = field(default_factory=lambda: _env_pair_tuple("META_ALLOCATOR_SECTOR_PROXY_MAP", (
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
    )))
    international_proxy_map: tuple[tuple[str, str], ...] = field(default_factory=lambda: _env_pair_tuple("META_ALLOCATOR_INTERNATIONAL_PROXY_MAP", (
        ("Developed ex US", "EFA"),
        ("Emerging Markets", "EEM"),
        ("Europe", "VGK"),
        ("Japan", "EWJ"),
        ("China", "FXI"),
        ("Canada", "EWC"),
        ("Brazil", "EWZ"),
        ("India", "INDA"),
    )))
    hedge_tickers: tuple[str, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_HEDGE_TICKERS", ("IEF", "TLT", "SHY", "BIL", "GLD", "UUP"), str))
    fred_series: tuple[str, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_FRED_SERIES", (
        "DGS10",
        "DGS2",
        "T10Y2Y",
        "FEDFUNDS",
        "VIXCLS",
        "M2SL",
        "WALCL",
        "BAMLC0A0CM",
        "BAMLH0A0HYM2",
        "DCOILWTICO",
        "DTWEXBGS",
    ), str))
    feature_columns: tuple[str, ...] = field(default_factory=lambda: _env_tuple("META_ALLOCATOR_FEATURE_COLUMNS", (
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
    ), str))
    output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "research" / "latest")
    tail_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "tail_risk" / "latest")
    policy_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "policy" / "latest")
    forecast_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "forecast" / "latest")
    spectral_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "spectral" / "latest")
    chrono_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "chrono_fragility" / "latest")
    statement_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "statement_intel" / "latest")
    statement_kernel_output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "statement_kernel" / "latest")


@dataclass(frozen=True)
class AllocatorSettings:
    base_core_weight: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_BASE_CORE_WEIGHT", 0.35))
    base_defense_weight: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_BASE_DEFENSE_WEIGHT", 0.15))
    base_selection_weight: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_BASE_SELECTION_WEIGHT", 0.50))
    max_position: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_ALLOCATOR_MAX_POSITION", 0.05))
    max_sector: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_ALLOCATOR_MAX_SECTOR", 0.25))
    min_selection_weight: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_MIN_SELECTION_WEIGHT", 0.05))
    min_defense_weight: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_MIN_DEFENSE_WEIGHT", 0.10))
    defensive_threshold: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_DEFENSIVE_THRESHOLD", 0.65))
    crisis_threshold: float = field(default_factory=lambda: _env_float("META_ALLOCATOR_CRISIS_THRESHOLD", 0.80))
    primary_core_ticker: str = field(default_factory=lambda: _env_text("META_ALLOCATOR_PRIMARY_CORE_TICKER", "SPY"))
    defense_cash_ticker: str = field(default_factory=lambda: _env_text("META_ALLOCATOR_DEFENSE_CASH_TICKER", "BIL"))
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
    auto_refresh_seconds: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_AUTO_REFRESH_SECONDS", 300))
    market_lookback_days: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_MARKET_LOOKBACK_DAYS", 252))
    chart_history_points: int = field(default_factory=lambda: _env_int("META_ALLOCATOR_CHART_HISTORY_POINTS", 260))
    output_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "output" / "dashboard" / "latest")


def artifact_only_mode() -> bool:
    return os.environ.get("META_ALLOCATOR_ARTIFACT_ONLY", "").strip().lower() in {"1", "true", "yes"}
