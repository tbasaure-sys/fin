from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import io
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
import pandas as pd


XBRL_FACT_CANDIDATES: dict[str, tuple[str, ...]] = {
    "xbrl_cash": (
        "cashandcashequivalents",
        "cashandcash equivalents",
        "efectivoyequivalentesalefectivo",
    ),
    "xbrl_revenue": (
        "revenue",
        "revenuefromcontractswithcustomers",
        "ingresosdeactividadesordinarias",
        "ingresosordinarios",
    ),
    "xbrl_net_income": (
        "profitloss",
        "profitlossattributabletoownersofparent",
        "gananciaperdida",
        "gananciaperdidaatribuiblealospropietariosdelacontroladora",
    ),
    "xbrl_equity": (
        "equity",
        "equityattributabletoownersofparent",
        "patrimoniototal",
    ),
    "xbrl_liabilities": (
        "liabilities",
        "liabilitiestotal",
        "pasivostotales",
    ),
}


@dataclass(frozen=True)
class ContextInfo:
    context_id: str
    end_date: datetime | None
    instant_date: datetime | None


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _normalize_name(value: str) -> str:
    return "".join(char for char in _local_name(value).lower() if char.isalnum())


def _parse_date(text: str | None) -> datetime | None:
    if not text:
        return None
    try:
        return datetime.fromisoformat(text[:10])
    except ValueError:
        return None


def _parse_numeric(text: str | None) -> float | None:
    if text is None:
        return None
    candidate = str(text).strip()
    if not candidate:
        return None
    candidate = candidate.replace(",", "")
    try:
        value = float(candidate)
    except ValueError:
        return None
    if np.isnan(value) or np.isinf(value):
        return None
    return value


def _read_xml_candidates(path: Path) -> list[tuple[str, bytes]]:
    suffix = path.suffix.lower()
    if suffix in {".xbrl", ".xml", ".html", ".xhtml"}:
        return [(path.name, path.read_bytes())]
    if suffix == ".zip":
        docs: list[tuple[str, bytes]] = []
        with zipfile.ZipFile(path) as archive:
            for name in archive.namelist():
                lowered = name.lower()
                if lowered.endswith((".xbrl", ".xml", ".xhtml", ".html")):
                    docs.append((name, archive.read(name)))
        return docs
    return []


def _parse_contexts(root: ET.Element) -> dict[str, ContextInfo]:
    contexts: dict[str, ContextInfo] = {}
    for element in root.iter():
        if _local_name(element.tag) != "context":
            continue
        context_id = element.attrib.get("id")
        if not context_id:
            continue
        instant = None
        end_date = None
        for child in element.iter():
            local = _local_name(child.tag)
            if local == "instant":
                instant = _parse_date(child.text)
            elif local == "endDate":
                end_date = _parse_date(child.text)
        contexts[context_id] = ContextInfo(context_id=context_id, end_date=end_date, instant_date=instant)
    return contexts


def _choose_fact(group: pd.DataFrame, prefer_duration: bool) -> float | None:
    if group.empty:
        return None
    ranked = group.copy()
    if prefer_duration:
        ranked["sort_date"] = ranked["end_date"].fillna(ranked["instant_date"])
    else:
        ranked["sort_date"] = ranked["instant_date"].fillna(ranked["end_date"])
    ranked = ranked.dropna(subset=["sort_date", "value"])
    if ranked.empty:
        return None
    ranked = ranked.sort_values("sort_date")
    return float(ranked.iloc[-1]["value"])


def _extract_from_root(root: ET.Element) -> dict[str, float | None]:
    contexts = _parse_contexts(root)
    rows: list[dict[str, Any]] = []
    for element in root.iter():
        context_ref = element.attrib.get("contextRef")
        if not context_ref or context_ref not in contexts:
            continue
        value = _parse_numeric(element.text)
        if value is None:
            continue
        rows.append(
            {
                "concept": _normalize_name(element.tag),
                "value": value,
                "context_id": context_ref,
                "instant_date": contexts[context_ref].instant_date,
                "end_date": contexts[context_ref].end_date,
            }
        )
    frame = pd.DataFrame(rows)
    if frame.empty:
        return {}

    payload: dict[str, float | None] = {}
    for key, aliases in XBRL_FACT_CANDIDATES.items():
        subset = frame.loc[frame["concept"].isin({_normalize_name(alias) for alias in aliases})]
        payload[key] = _choose_fact(subset, prefer_duration=key in {"xbrl_revenue", "xbrl_net_income"})
    return payload


def _infer_ticker(path_name: str, universe: pd.DataFrame) -> str | None:
    lowered = path_name.lower()
    for row in universe.to_dict(orient="records"):
        ticker = str(row.get("ticker") or "")
        stem = ticker.replace(".SN", "").replace("-", "").lower()
        aliases = [stem, str(row.get("name") or "").replace(" ", "").replace("-", "").lower()]
        extra = str(row.get("cmf_aliases") or "")
        aliases.extend(part.strip().replace(" ", "").replace("-", "").lower() for part in extra.split("|") if part.strip())
        if any(alias and alias in lowered for alias in aliases):
            return ticker
    return None


def load_local_xbrl_fundamentals(paths, universe: pd.DataFrame) -> pd.DataFrame:
    search_roots = [
        paths.artifact_root / "chile" / "xbrl" / "raw",
        paths.project_root / "artifacts" / "chile" / "xbrl" / "raw",
        paths.output_root / "chile" / "xbrl" / "raw",
    ]
    records: list[dict[str, Any]] = []
    for root in search_roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_dir():
                continue
            for doc_name, payload in _read_xml_candidates(path):
                ticker = _infer_ticker(doc_name, universe) or _infer_ticker(path.name, universe)
                if not ticker:
                    continue
                try:
                    root_xml = ET.fromstring(payload)
                except ET.ParseError:
                    continue
                facts = _extract_from_root(root_xml)
                if not facts:
                    continue
                records.append({"ticker": ticker, **facts, "xbrl_source_file": path.name})

    if not records:
        return pd.DataFrame(columns=["ticker"])
    frame = pd.DataFrame(records).sort_values("xbrl_source_file").drop_duplicates(subset=["ticker"], keep="last")
    frame["xbrl_margin"] = frame["xbrl_net_income"] / frame["xbrl_revenue"]
    frame["xbrl_leverage"] = frame["xbrl_liabilities"] / frame["xbrl_equity"]
    frame["xbrl_cash_buffer"] = frame["xbrl_cash"] / frame["xbrl_liabilities"]
    return frame.replace({np.inf: np.nan, -np.inf: np.nan})
