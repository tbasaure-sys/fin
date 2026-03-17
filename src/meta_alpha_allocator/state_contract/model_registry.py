from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PACKAGE_FILENAME = 'probability_models_v1.json'
METRICS_FILENAME = 'probability_metrics_v1.json'
MANIFEST_FILENAME = 'probability_feature_manifest_v1.json'
PACKAGE_VERSION = 'probability_packages_v5'


def _package_root(snapshot: dict[str, Any]) -> Path:
    output_root = Path(snapshot.get('_output_root') or Path(__file__).resolve().parents[3] / 'output')
    return output_root / 'state_contract' / 'latest'


def load_probability_package(snapshot: dict[str, Any]) -> dict[str, Any] | None:
    path = _package_root(snapshot) / PACKAGE_FILENAME
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return None


def load_probability_manifest(snapshot: dict[str, Any]) -> dict[str, Any] | None:
    path = _package_root(snapshot) / MANIFEST_FILENAME
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return None


def save_probability_package(snapshot: dict[str, Any], package: dict[str, Any], *, artifact_fingerprint: dict[str, Any] | None = None) -> dict[str, str]:
    root = _package_root(snapshot)
    root.mkdir(parents=True, exist_ok=True)
    package_path = root / PACKAGE_FILENAME
    metrics_path = root / METRICS_FILENAME
    manifest_path = root / MANIFEST_FILENAME
    package_json = json.dumps(package, indent=2)
    package_path.write_text(package_json, encoding='utf-8')
    metrics_path.write_text(json.dumps(package.get('metrics', []), indent=2), encoding='utf-8')
    manifest = {
        'version': PACKAGE_VERSION,
        'feature_columns': package.get('feature_columns', []),
        'artifact_fingerprint_hash': (artifact_fingerprint or {}).get('fingerprint_hash'),
        'artifact_fingerprint_inputs': (artifact_fingerprint or {}).get('artifacts', []),
        'built_at_utc': datetime.now(tz=timezone.utc).isoformat(),
        'package_hash': hashlib.sha256(package_json.encode('utf-8')).hexdigest(),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return {'package_path': str(package_path), 'metrics_path': str(metrics_path), 'manifest_path': str(manifest_path)}
