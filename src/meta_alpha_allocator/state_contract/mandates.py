from __future__ import annotations

BLS_PRIME_DEFAULT = {
    'name': 'bls_prime_default',
    'max_drawdown_floor': 0.20,
    'max_turnover_by_mode': {
        'protect': 0.06,
        'observe': 0.10,
        'stage': 0.16,
        'act': 0.22,
    },
    'allowed_sleeves_by_mode': {
        'protect': ['defensive_compounders', 'index_hedge', 'cash_equivalents'],
        'observe': ['defensive_compounders', 'index_hedge', 'cash_equivalents'],
        'stage': ['defensive_compounders', 'index_hedge', 'oversold_rebound'],
        'act': ['defensive_compounders', 'index_hedge', 'oversold_rebound', 'selective_growth'],
    },
    'forbidden_sleeves_by_mode': {
        'protect': ['net_new_risk_adds', 'crowded_thematic_growth'],
        'observe': ['crowded_thematic_growth'],
        'stage': [],
        'act': [],
    },
    'hedge_floor_by_mode': {
        'protect': 0.18,
        'observe': 0.12,
        'stage': 0.08,
        'act': 0.05,
    },
    'single_name_cap_by_mode': {
        'protect': 0.0,
        'observe': 0.01,
        'stage': 0.03,
        'act': 0.05,
    },
    'gross_add_cap_by_mode': {
        'protect': 0.0,
        'observe': 0.04,
        'stage': 0.10,
        'act': 0.18,
    },
}
