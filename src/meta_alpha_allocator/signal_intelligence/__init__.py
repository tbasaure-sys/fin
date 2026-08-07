"""Daily, point-in-time market-state intelligence for BLS Prime."""

from .contracts import CONTEXT_ASSETS, SIGNAL_CONFIG_FINGERPRINT, SIGNAL_CONFIG_VERSION, SIGNAL_ENGINE_VERSION, SIGNAL_SCHEMA_VERSION
from .engine import compute_market_state, compute_market_state_history
from .context import build_context_adapter
from .validation import ValidationConfig, evaluate_signal_validation

__all__ = [
    "CONTEXT_ASSETS",
    "SIGNAL_SCHEMA_VERSION",
    "SIGNAL_ENGINE_VERSION",
    "SIGNAL_CONFIG_VERSION",
    "SIGNAL_CONFIG_FINGERPRINT",
    "compute_market_state",
    "compute_market_state_history",
    "ValidationConfig",
    "evaluate_signal_validation",
    "build_context_adapter",
]
