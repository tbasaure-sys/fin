from __future__ import annotations

import hashlib
import re
from collections import Counter
from typing import Iterable


_VERSION_RE = re.compile(r"//@version\s*=\s*(\d+)", re.IGNORECASE)
_LICENSE_PATTERNS = (
    ("CC-BY-NC-SA", re.compile(r"CC\s*BY\s*[- ]?NC\s*[- ]?SA|creativecommons\.org/licenses/by-nc-sa", re.I)),
    ("MPL-2.0", re.compile(r"SPDX-License-Identifier\s*:\s*MPL-2\.0|Mozilla Public License", re.I)),
    ("MIT", re.compile(r"SPDX-License-Identifier\s*:\s*MIT|MIT License", re.I)),
    ("GPL", re.compile(r"SPDX-License-Identifier\s*:\s*GPL|GNU General Public License", re.I)),
)
_RISK_PATTERNS = (
    ("request.security", re.compile(r"\brequest\.security\s*\(", re.I)),
    ("lookahead_on", re.compile(r"\bbarmerge\.lookahead_on\b", re.I)),
    ("request.security_lower_tf", re.compile(r"\brequest\.security_lower_tf\s*\(", re.I)),
    ("varip", re.compile(r"\bvarip\b", re.I)),
    ("barstate", re.compile(r"\bbarstate\.", re.I)),
    ("volume", re.compile(r"\bvolume\b", re.I)),
    ("alerts", re.compile(r"\balert(?:condition)?\s*\(", re.I)),
)


def _license_for(source: str) -> str:
    for label, pattern in _LICENSE_PATTERNS:
        if pattern.search(source):
            return label
    return "unclassified"


def audit_source(source: str, *, ordinal: int) -> dict[str, object]:
    """Return safe metadata for a quarantined source without returning source text."""

    text = str(source or "")
    version_match = _VERSION_RE.search(text)
    flags = [label for label, pattern in _RISK_PATTERNS if pattern.search(text)]
    return {
        "ordinal": int(ordinal),
        "sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "bytes": len(text.encode("utf-8")),
        "pineVersion": int(version_match.group(1)) if version_match else None,
        "license": _license_for(text),
        "riskFlags": flags,
    }


def build_quarantine_manifest(files: Iterable[tuple[str, str]]) -> dict[str, object]:
    """Build aggregate-only metadata; filenames are deliberately discarded."""

    rows = list(files)
    records = [audit_source(source, ordinal=index) for index, (_name, source) in enumerate(rows, start=1)]
    return {
        "schemaVersion": "tradingview-quarantine.v1",
        "count": len(records),
        "items": records,
        "summary": {
            "pineVersions": dict(sorted(Counter(str(row["pineVersion"]) for row in records).items())),
            "licenses": dict(sorted(Counter(str(row["license"]) for row in records).items())),
            "riskFlags": dict(sorted(Counter(flag for row in records for flag in row["riskFlags"]).items())),
        },
    }
