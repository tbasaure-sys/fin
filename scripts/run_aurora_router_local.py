from __future__ import annotations

import argparse
import json
import math
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import requests
import yfinance as yf
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[1]
LOCAL_ROOT = ROOT / "_local_data" / "aurora_router"
RAW_ROOT = LOCAL_ROOT / "raw_fmp"
ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_router"
SPINE_ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_spine_v1"
TACTICAL_ARTIFACT_ROOT = ROOT / "artifacts" / "aurora_tactical_1y"
FMP_STABLE = "https://financialmodelingprep.com/stable"

START_YEAR = 2014
LAST_FEATURE_YEAR = 2023
TRAIN_END_YEAR = 2020
VAL_START_YEAR = 2021
PANEL_VERSION = "aurora_v4_point_in_time_20260628"
FORWARD_YEARS = [1, 3]
MODEL_NAMES = [
    "dcf",
    "roicFade",
    "reverseDcf",
    "residualIncome",
    "assetValue",
    "unitEconomics",
    "bottleneck",
    "realOptions",
    "capitalCycle",
]
HORIZON_METHODS = {
    1: MODEL_NAMES,
    # Capital cycle is useful as a tactical 1Y supply-response lens, but it
    # diluted the intrinsic 3Y router in validation. Keep it diagnostic only.
    3: [method for method in MODEL_NAMES if method != "capitalCycle"],
}
SPINE_METHOD_WEIGHTS = {
    "expensive_compounder": {"reverseDcf": 0.45, "roicFade": 0.25, "dcf": 0.15, "assetValue": 0.15},
    "quality_compounder": {"roicFade": 0.35, "reverseDcf": 0.25, "dcf": 0.25, "residualIncome": 0.15},
    "financial_book_capital": {"residualIncome": 0.55, "assetValue": 0.25, "reverseDcf": 0.20},
    "asset_heavy_cyclical": {"assetValue": 0.45, "reverseDcf": 0.25, "residualIncome": 0.15, "capitalCycle": 0.15},
    "commodity_resource": {"assetValue": 0.40, "capitalCycle": 0.35, "reverseDcf": 0.15, "residualIncome": 0.10},
    "pre_profit_platform": {"reverseDcf": 0.40, "unitEconomics": 0.25, "realOptions": 0.25, "assetValue": 0.10},
    "bottleneck_oligopoly": {"reverseDcf": 0.35, "bottleneck": 0.30, "roicFade": 0.20, "dcf": 0.15},
    "regulated_utility_infrastructure": {"dcf": 0.45, "residualIncome": 0.35, "assetValue": 0.20},
    "turnaround_disrupted": {"assetValue": 0.45, "reverseDcf": 0.30, "capitalCycle": 0.15, "residualIncome": 0.10},
    "general_intrinsic": {"reverseDcf": 0.35, "assetValue": 0.25, "roicFade": 0.20, "dcf": 0.20},
}

CORE_UNIVERSE = [
    "AAPL","MSFT","GOOGL","GOOG","AMZN","META","NVDA","AVGO","ORCL","CRM","ADBE","NOW","INTU","IBM","ACN","SHOP","SNOW","PANW","CRWD","DDOG","NET","MDB","TEAM","WDAY","PLTR","UBER","ABNB","BKNG","EXPE","SPOT","NFLX","DIS","EA","TTWO","ROKU",
    "ASML","TSM","AMD","INTC","QCOM","TXN","MU","LRCX","AMAT","KLAC","ADI","NXPI","MCHP","ON","MRVL","MPWR","TER","CDNS","SNPS","ANSS","KEYS","APH","GLW","DELL","HPQ","STX","WDC",
    "V","MA","AXP","PYPL","FI","FIS","GPN","COIN","SQ","NU","SOFI","MELI","SE",
    "JPM","BAC","WFC","C","GS","MS","SCHW","BLK","BX","KKR","TROW","USB","PNC","TFC","COF","DFS","AIG","ALL","TRV","CB","PGR","MET","PRU","AFL","MMC","AON","AJG","ICE","CME","MCO","SPGI","BRK-B",
    "COST","WMT","TGT","HD","LOW","TJX","ROST","NKE","LULU","SBUX","MCD","CMG","YUM","DPZ","KO","PEP","MNST","KDP","PG","CL","KMB","EL","CHD","CLX","MDLZ","HSY","GIS","KHC","KR","DG","DLTR",
    "UNH","ELV","CI","HUM","CNC","JNJ","LLY","NVO","MRK","PFE","ABBV","AMGN","GILD","BMY","REGN","VRTX","BIIB","ZTS","TMO","DHR","A","ILMN","IDXX","ISRG","SYK","MDT","BSX","ABT","EW","HOLX","IQV","HCA","UHS","DVA","CVS","MCK","COR","CAH","GEHC",
    "CAT","DE","GE","HON","MMM","ITW","ETN","EMR","PH","ROK","DOV","XYL","IR","TT","CARR","OTIS","JCI","BA","LMT","RTX","NOC","GD","TDG","HEI","UPS","FDX","UNP","CSX","NSC","ODFL","DAL","UAL","LUV","RCL","CCL",
    "XOM","CVX","COP","EOG","SLB","HAL","PSX","VLO","MPC","OXY","LNG","KMI","WMB","EPD","ENB","LIN","APD","SHW","ECL","DD","DOW","NUE","STLD","FCX","NEM","GOLD","ALB","SQM","MOS","CF","RIO","BHP","VALE",
    "NEE","DUK","SO","D","AEP","EXC","SRE","PEG","XEL","ED","AWK","PLD","AMT","EQIX","CCI","DLR","SPG","O","WELL","VICI","PSA","CBRE",
    "TSLA","TM","F","GM","RIVN","LCID","AZO","ORLY","AAP","LEN","DHI","PHM","NVR","TOL","MAS","BLDR","POOL","WHR","HAS","MAT",
    "BABA","JD","PDD","BIDU","SONY","SAP","TMUS","ERIC","NOK","ARM",
]


def load_env_file() -> None:
    for name in [".env.local", ".env"]:
        path = ROOT / name
        if not path.exists():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def safe_float(value: Any) -> float:
    try:
        if value is None or value == "":
            return np.nan
        out = float(value)
        return out if np.isfinite(out) else np.nan
    except Exception:
        return np.nan


def finite_or(value: Any, fallback: float = 0.0) -> float:
    out = safe_float(value)
    return out if np.isfinite(out) else fallback


def clamp(value: float, lower: float, upper: float) -> float:
    return float(np.clip(finite_or(value), lower, upper))


def band(value: float, cuts: list[tuple[float, str]], fallback: str) -> str:
    if not np.isfinite(value):
        return fallback
    for threshold, label in cuts:
        if value <= threshold:
            return label
    return fallback


def as_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ["data", "historical", "results"]:
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
        return [payload] if payload else []
    return []


def get_year(record: dict[str, Any]) -> str | None:
    year = (
        record.get("calendarYear")
        or record.get("fiscalYear")
        or record.get("year")
        or str(record.get("date") or "")[:4]
        or str(record.get("fillingDate") or record.get("filingDate") or "")[:4]
    )
    year = str(year or "")[:4]
    return year if year.isdigit() else None


def by_year(records: Any) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for record in as_records(records):
        year = get_year(record)
        if year:
            out[year] = record
    return out


def safe_date(value: Any) -> pd.Timestamp | None:
    ts = pd.to_datetime(value, errors="coerce")
    if pd.isna(ts):
        return None
    if getattr(ts, "tzinfo", None) is not None:
        ts = ts.tz_convert(None)
    return pd.Timestamp(ts).tz_localize(None) if getattr(ts, "tzinfo", None) is not None else pd.Timestamp(ts)


def get_asof_date(income: dict[str, Any], balance: dict[str, Any], cashflow: dict[str, Any], fiscal_date: Any) -> pd.Timestamp:
    for record in [income, balance, cashflow]:
        for key in ["acceptedDate", "accepted_date", "fillingDate", "filingDate"]:
            ts = safe_date(record.get(key))
            if ts is not None:
                return ts + pd.Timedelta(days=1)
    fiscal = safe_date(fiscal_date) or pd.Timestamp(f"{START_YEAR}-12-31")
    return fiscal + pd.Timedelta(days=75)


def price_frame(payload: Any) -> pd.DataFrame:
    frame = pd.DataFrame(as_records(payload))
    if frame.empty or "date" not in frame.columns:
        return pd.DataFrame(columns=["date", "price"])
    price_col = next((col for col in ["adjClose", "close", "price"] if col in frame.columns), None)
    if price_col is None:
        return pd.DataFrame(columns=["date", "price"])
    frame = frame[["date", price_col]].rename(columns={price_col: "price"})
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce").dt.tz_localize(None)
    frame["price"] = pd.to_numeric(frame["price"], errors="coerce")
    return frame.dropna().sort_values("date").reset_index(drop=True)


def price_on_or_after(prices: pd.DataFrame, date: pd.Timestamp, max_days: int = 21) -> float:
    if prices.empty:
        return np.nan
    sub = prices.loc[prices["date"] >= date].sort_values("date")
    if sub.empty or (sub.iloc[0]["date"] - date).days > max_days:
        return np.nan
    return safe_float(sub.iloc[0]["price"])


def price_on_or_before(prices: pd.DataFrame, date: pd.Timestamp, max_days: int = 21) -> float:
    if prices.empty:
        return np.nan
    sub = prices.loc[prices["date"] <= date].sort_values("date")
    if sub.empty or (date - sub.iloc[-1]["date"]).days > max_days:
        return np.nan
    return safe_float(sub.iloc[-1]["price"])


def trailing_features(prices: pd.DataFrame, date: pd.Timestamp) -> dict[str, float]:
    hist = prices.loc[prices["date"] <= date].sort_values("date")
    if len(hist) < 80:
        return {"ret_1y_trailing": np.nan, "ret_3y_trailing": np.nan, "vol_1y_trailing": np.nan, "drawdown_3y_trailing": np.nan}
    px = hist["price"].astype(float)
    ret = px.pct_change().dropna()
    p0 = px.iloc[-1]
    p_1y = px.iloc[-252] if len(px) >= 252 else np.nan
    p_3y = px.iloc[-756] if len(px) >= 756 else np.nan
    window = px.tail(min(len(px), 756))
    drawdown = window / window.cummax() - 1
    return {
        "ret_1y_trailing": p0 / p_1y - 1 if np.isfinite(p_1y) and p_1y > 0 else np.nan,
        "ret_3y_trailing": (p0 / p_3y) ** (1 / 3) - 1 if np.isfinite(p_3y) and p_3y > 0 else np.nan,
        "vol_1y_trailing": float(ret.tail(252).std() * np.sqrt(252)) if len(ret) >= 80 else np.nan,
        "drawdown_3y_trailing": float(drawdown.min()) if len(drawdown) else np.nan,
    }


@dataclass
class FmpDownloader:
    api_key: str
    pause: float = 0.1
    retries: int = 5

    def cache_path(self, symbol: str, endpoint: str) -> Path:
        safe_symbol = symbol.replace("-", "_").replace(".", "_")
        return RAW_ROOT / safe_symbol / f"{endpoint}.json"

    def get(self, symbol: str, endpoint: str, params: dict[str, Any] | None = None) -> Any:
        path = self.cache_path(symbol, endpoint)
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        path.parent.mkdir(parents=True, exist_ok=True)
        query = dict(params or {})
        query["symbol"] = symbol
        query["apikey"] = self.api_key
        last_error = None
        for attempt in range(self.retries):
            try:
                response = requests.get(f"{FMP_STABLE}/{endpoint}", params=query, timeout=30)
                if response.status_code == 429:
                    time.sleep(max(1.0, 2**attempt))
                    continue
                response.raise_for_status()
                payload = response.json()
                path.write_text(json.dumps(payload), encoding="utf-8")
                time.sleep(self.pause)
                return payload
            except Exception as exc:
                last_error = exc
                time.sleep(max(0.5, 2**attempt))
        raise RuntimeError(f"FMP download failed for {symbol} {endpoint}: {last_error}")

    def symbol_pack(self, symbol: str) -> dict[str, Any]:
        return {
            "income": self.get(symbol, "income-statement", {"period": "annual", "limit": 24}),
            "balance": self.get(symbol, "balance-sheet-statement", {"period": "annual", "limit": 24}),
            "cashflow": self.get(symbol, "cash-flow-statement", {"period": "annual", "limit": 24}),
            "metrics": self.get(symbol, "key-metrics", {"period": "annual", "limit": 24}),
            "ratios": self.get(symbol, "ratios", {"period": "annual", "limit": 24}),
            "profile": self.get(symbol, "profile"),
            "prices": self.get(symbol, "historical-price-eod/light", {"from": f"{START_YEAR - 4}-01-01"}),
        }


def normalize_tnx_to_decimal(series: pd.Series) -> np.ndarray:
    raw = pd.to_numeric(series, errors="coerce")
    return np.where(raw.abs() > 0.20, raw / 100.0, raw)


def macro_annual(force: bool = False) -> pd.DataFrame:
    path = LOCAL_ROOT / f"macro_annual_{PANEL_VERSION}.csv"
    if path.exists() and not force:
        cached = pd.read_csv(path)
        if cached["risk_free_10y"].between(0.0, 0.085).all():
            return cached
    raw = yf.download("^TNX", start=f"{START_YEAR-4}-01-01", end=f"{LAST_FEATURE_YEAR+4}-12-31", progress=False, auto_adjust=True)
    if raw.empty:
        years = list(range(START_YEAR - 4, LAST_FEATURE_YEAR + 4))
        macro = pd.DataFrame({"year": years, "risk_free_10y": np.nan})
    else:
        close = raw["Close"]
        if isinstance(close, pd.DataFrame):
            close = close.iloc[:, 0]
        tmp = pd.DataFrame({"date": pd.to_datetime(close.index).tz_localize(None), "tnx_close": close.values})
        tmp["risk_free_10y"] = normalize_tnx_to_decimal(tmp["tnx_close"])
        tmp["year"] = tmp["date"].dt.year
        macro = tmp.groupby("year", as_index=False).agg(risk_free_10y=("risk_free_10y", "last"))
    macro["risk_free_10y"] = pd.to_numeric(macro["risk_free_10y"], errors="coerce").clip(0.0, 0.12).ffill().bfill()
    if not macro["risk_free_10y"].between(0.0, 0.085).all():
        raise RuntimeError("Macro sanity failed: risk_free_10y outside 0%-8.5%.")
    macro["risk_free_delta_1y"] = macro["risk_free_10y"].diff().fillna(0)
    macro["macro_cost_anchor"] = (macro["risk_free_10y"] + 0.045).clip(0.045, 0.16)
    path.parent.mkdir(parents=True, exist_ok=True)
    macro.to_csv(path, index=False)
    return macro


def build_rows_for_symbol(symbol: str, pack: dict[str, Any], macro_by_year: dict[int, dict[str, float]]) -> list[dict[str, Any]]:
    income, balance, cashflow = map(by_year, [pack["income"], pack["balance"], pack["cashflow"]])
    metrics, ratios = map(by_year, [pack["metrics"], pack["ratios"]])
    prices = price_frame(pack["prices"])
    profile_records = as_records(pack.get("profile"))
    profile = profile_records[0] if profile_records else {}
    rows: list[dict[str, Any]] = []
    for year in sorted(set(income) | set(balance) | set(cashflow) | set(metrics) | set(ratios)):
        if not str(year).isdigit():
            continue
        y = int(year)
        if y < START_YEAR or y > LAST_FEATURE_YEAR:
            continue
        inc, bal, cf, met, rat = income.get(year, {}), balance.get(year, {}), cashflow.get(year, {}), metrics.get(year, {}), ratios.get(year, {})
        fiscal_date = inc.get("date") or cf.get("date") or bal.get("date") or f"{year}-12-31"
        asof = get_asof_date(inc, bal, cf, fiscal_date)
        p0 = price_on_or_after(prices, asof)
        future: dict[str, float] = {}
        for horizon in FORWARD_YEARS:
            p1 = price_on_or_before(prices, asof + pd.DateOffset(years=horizon))
            future[f"return_{horizon}y_fwd"] = (p1 / p0 - 1) if np.isfinite(p0) and np.isfinite(p1) and p0 > 0 else np.nan
            future[f"ann_return_{horizon}y_fwd"] = ((p1 / p0) ** (1 / horizon) - 1) if np.isfinite(p0) and np.isfinite(p1) and p0 > 0 else np.nan
        revenue = safe_float(inc.get("revenue"))
        ebit = safe_float(inc.get("operatingIncome"))
        assets = safe_float(bal.get("totalAssets"))
        debt = safe_float(bal.get("totalDebt"))
        equity = safe_float(bal.get("totalStockholdersEquity"))
        cfo = safe_float(cf.get("operatingCashFlow"))
        capex = abs(safe_float(cf.get("capitalExpenditure")))
        fcf = safe_float(cf.get("freeCashFlow"))
        if not np.isfinite(fcf) and np.isfinite(cfo) and np.isfinite(capex):
            fcf = cfo - capex
        macro = macro_by_year.get(y, {})
        rows.append({
            "ticker": symbol,
            "year": y,
            "fiscal_date": str(fiscal_date),
            "asof_date": str(asof.date()),
            "price_t0": p0,
            "sector": profile.get("sector") or "",
            "industry": profile.get("industry") or "",
            "country": profile.get("country") or "",
            "revenue": revenue,
            "ebit": ebit,
            "net_income": safe_float(inc.get("netIncome")),
            "assets": assets,
            "debt": debt,
            "equity": equity,
            "cfo": cfo,
            "capex": capex,
            "fcf": fcf,
            "cash": safe_float(bal.get("cashAndShortTermInvestments") or bal.get("cashAndCashEquivalents")),
            "liabilities": safe_float(bal.get("totalLiabilities")),
            "inventory": safe_float(bal.get("inventory")),
            "receivables": safe_float(bal.get("netReceivables") or bal.get("accountsReceivables")),
            "market_cap": safe_float(met.get("marketCap")) or safe_float(profile.get("mktCap")),
            "enterprise_value": safe_float(met.get("enterpriseValue")),
            "pe": safe_float(met.get("peRatio") or rat.get("priceEarningsRatio")),
            "pb": safe_float(met.get("pbRatio") or rat.get("priceBookValueRatio")),
            "ev_to_sales": safe_float(met.get("evToSales")),
            "ev_to_ebitda": safe_float(met.get("enterpriseValueOverEBITDA")),
            "roe": safe_float(rat.get("returnOnEquity")),
            "roa": safe_float(rat.get("returnOnAssets")),
            "gross_margin": safe_float(rat.get("grossProfitMargin")),
            "operating_margin": safe_float(rat.get("operatingProfitMargin")),
            "net_margin": safe_float(rat.get("netProfitMargin")),
            "current_ratio": safe_float(rat.get("currentRatio")),
            "debt_to_equity": safe_float(rat.get("debtEquityRatio")),
            "risk_free_10y": safe_float(macro.get("risk_free_10y")),
            "risk_free_delta_1y": safe_float(macro.get("risk_free_delta_1y")),
            "macro_cost_anchor": safe_float(macro.get("macro_cost_anchor")),
            **trailing_features(prices, asof),
            **future,
        })
    return rows


def build_or_load_panel(api_key: str | None, tickers: list[str], force: bool) -> pd.DataFrame:
    panel_path = LOCAL_ROOT / f"panel_{PANEL_VERSION}_{len(tickers)}.parquet"
    if panel_path.exists() and not force:
        panel = pd.read_parquet(panel_path)
        if len(panel) and {"ticker", "year", "asof_date"}.issubset(panel.columns):
            return panel
    if not api_key:
        raise RuntimeError(
            f"FMP_API_KEY is required because cached panel was not found at {panel_path} "
            "or --force-panel-rebuild was used. The key is not written to artifacts."
        )
    macro = macro_annual(force=force)
    macro_lookup = macro.set_index("year").to_dict("index")
    downloader = FmpDownloader(api_key=api_key, pause=float(os.environ.get("FMP_REQUEST_PAUSE_SECONDS", "0.08")))
    rows: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for index, symbol in enumerate(tickers, start=1):
        try:
            pack = downloader.symbol_pack(symbol)
            rows.extend(build_rows_for_symbol(symbol, pack, macro_lookup))
        except Exception as exc:
            errors.append({"ticker": symbol, "error": str(exc)})
        if index % 10 == 0 or index == len(tickers):
            print(f"downloaded/parsed {index}/{len(tickers)} tickers, rows={len(rows)}, errors={len(errors)}", flush=True)
    panel = pd.DataFrame(rows)
    if panel.empty:
        raise RuntimeError("No FMP panel rows built.")
    if not panel["risk_free_10y"].between(0.0, 0.085).all():
        raise RuntimeError("Panel macro sanity failed: risk_free_10y outside expected range.")
    panel_path.parent.mkdir(parents=True, exist_ok=True)
    panel.to_parquet(panel_path, index=False)
    pd.DataFrame(errors, columns=["ticker", "error"]).to_csv(LOCAL_ROOT / f"errors_{PANEL_VERSION}_{len(tickers)}.csv", index=False)
    return panel


def zscore(series: pd.Series) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce")
    std = s.std(ddof=0)
    if not np.isfinite(std) or std == 0:
        return pd.Series(0.0, index=series.index)
    return ((s - s.mean()) / std).clip(-5, 5)


def add_features(panel: pd.DataFrame) -> pd.DataFrame:
    df = panel.sort_values(["ticker", "year"]).copy()
    df["revenue_growth_1y"] = df.groupby("ticker")["revenue"].pct_change().replace([np.inf, -np.inf], np.nan)
    df["revenue_growth_3y"] = df.groupby("ticker")["revenue"].pct_change(3).replace([np.inf, -np.inf], np.nan) / 3
    df["ebit_margin"] = df["ebit"] / df["revenue"].replace(0, np.nan)
    df["fcf_margin"] = df["fcf"] / df["revenue"].replace(0, np.nan)
    df["fcf_yield"] = df["fcf"] / df["market_cap"].replace(0, np.nan)
    df["debt_assets"] = df["debt"] / df["assets"].replace(0, np.nan)
    df["cash_assets"] = df["cash"] / df["assets"].replace(0, np.nan)
    df["asset_turnover"] = df["revenue"] / df["assets"].replace(0, np.nan)
    df["capex_intensity"] = df["capex"] / df["revenue"].replace(0, np.nan)
    df["working_capital_intensity"] = (df["inventory"].fillna(0) + df["receivables"].fillna(0)) / df["revenue"].replace(0, np.nan)
    df["roic_proxy"] = df["ebit"] * 0.78 / (df["debt"].fillna(0) + df["equity"].replace(0, np.nan))
    df["excess_roic_proxy"] = df["roic_proxy"] - df["macro_cost_anchor"]
    df["bottleneck_proxy"] = zscore(df["gross_margin"].fillna(df["operating_margin"])) + zscore(df["revenue_growth_3y"]) - zscore(df["capex_intensity"])
    df["optionality_proxy"] = zscore(df["revenue_growth_3y"]) + zscore(df["ret_3y_trailing"]) + zscore(df["vol_1y_trailing"])
    cyclical_sector = df["sector"].fillna("").str.lower().str.contains("energy|materials|industrial|utilities|real estate|consumer cyclical")
    df["cyclical_sector_flag"] = cyclical_sector.astype(float)
    df["capital_cycle_proxy"] = (
        0.35 * zscore(df["fcf_yield"])
        + 0.25 * zscore(df["asset_turnover"])
        + 0.20 * zscore(df["operating_margin"])
        - 0.30 * zscore(df["capex_intensity"])
        - 0.20 * zscore(df["debt_assets"])
        - 0.10 * zscore(df["ret_3y_trailing"])
        + 0.20 * df["cyclical_sector_flag"]
    )
    rel_cols = ["ev_to_sales", "pb", "fcf_yield", "roic_proxy", "revenue_growth_3y", "gross_margin", "operating_margin", "debt_assets", "capex_intensity", "working_capital_intensity", "asset_turnover", "bottleneck_proxy", "optionality_proxy", "capital_cycle_proxy", "excess_roic_proxy"]
    for col in rel_cols:
        if col in df.columns:
            df[f"{col}_year_z"] = df.groupby("year")[col].transform(zscore)
            df[f"{col}_sector_z"] = df.groupby(["year", "sector"])[col].transform(lambda s: zscore(s) if s.notna().sum() >= 5 else np.nan)
    df["economic_regime"] = df.apply(classify_economic_regime, axis=1)
    return df


def classify_economic_regime(row: pd.Series) -> str:
    sector = str(row.get("sector") or "").lower()
    industry = str(row.get("industry") or "").lower()
    roic = safe_float(row.get("roic_proxy"))
    cost = safe_float(row.get("macro_cost_anchor"))
    growth = safe_float(row.get("revenue_growth_3y"))
    fcf_yield = safe_float(row.get("fcf_yield"))
    debt_assets = safe_float(row.get("debt_assets"))
    gross_margin = safe_float(row.get("gross_margin"))
    capex_intensity = safe_float(row.get("capex_intensity"))
    pb_z = safe_float(row.get("pb_year_z"))
    ev_sales_z = safe_float(row.get("ev_to_sales_year_z"))
    bottleneck_z = safe_float(row.get("bottleneck_proxy_year_z"))
    optionality_z = safe_float(row.get("optionality_proxy_year_z"))

    if any(token in sector for token in ["financial", "bank", "insurance"]) or any(token in industry for token in ["bank", "insurance", "asset management"]):
        return "financial_balance_sheet"
    if np.isfinite(pb_z) and np.isfinite(ev_sales_z) and pb_z < -0.75 and ev_sales_z < -0.55 and (not np.isfinite(debt_assets) or debt_assets < 0.75):
        return "asset_value_discount"
    if np.isfinite(bottleneck_z) and bottleneck_z > 0.85 and (not np.isfinite(gross_margin) or gross_margin > 0.28):
        return "bottleneck_power"
    if np.isfinite(growth) and growth > 0.10 and np.isfinite(optionality_z) and optionality_z > 0.45:
        return "real_options_growth"
    if np.isfinite(roic) and np.isfinite(cost) and roic - cost > 0.055 and np.isfinite(fcf_yield) and fcf_yield > 0:
        return "quality_compounder"
    if any(token in sector for token in ["energy", "materials", "utilities", "real estate", "industrial"]):
        return "capital_cycle_asset"
    if np.isfinite(capex_intensity) and capex_intensity > 0.10:
        return "asset_heavy_reinvestment"
    return "balanced_business"


def classify_spine_regime(row: pd.Series) -> str:
    sector = str(row.get("sector") or "").lower()
    industry = str(row.get("industry") or "").lower()
    roic = finite_or(row.get("roic_proxy"), np.nan)
    growth = finite_or(row.get("revenue_growth_3y"), np.nan)
    fcf_margin = finite_or(row.get("fcf_margin"), np.nan)
    debt_assets = finite_or(row.get("debt_assets"), np.nan)
    pb = finite_or(row.get("pb"), np.nan)
    ev_sales = finite_or(row.get("ev_to_sales"), np.nan)
    asset_turnover = finite_or(row.get("asset_turnover"), np.nan)
    capex_intensity = finite_or(row.get("capex_intensity"), np.nan)
    cyclical_flag = finite_or(row.get("cyclical_sector_flag"), 0.0)
    bottleneck_z = finite_or(row.get("bottleneck_proxy_year_z"), np.nan)
    asset_discount = finite_or(row.get("pb_year_z"), 0.0) < -0.65 and finite_or(row.get("ev_to_sales_year_z"), 0.0) < -0.50

    if any(token in f"{sector} {industry}" for token in ["bank", "insurance", "financial", "asset management", "capital markets"]):
        return "financial_book_capital"
    if any(token in sector for token in ["utilities", "real estate"]) or any(token in industry for token in ["reit", "utility", "infrastructure"]):
        return "regulated_utility_infrastructure"
    if any(token in sector for token in ["energy", "materials"]) or any(token in industry for token in ["oil", "gas", "mining", "steel", "chemical", "commodity"]):
        return "commodity_resource"
    if (np.isfinite(asset_turnover) and asset_turnover > 0.65 and cyclical_flag > 0) or (np.isfinite(capex_intensity) and capex_intensity > 0.10 and cyclical_flag > 0):
        return "asset_heavy_cyclical"
    if asset_discount and (not np.isfinite(debt_assets) or debt_assets < 0.75):
        return "turnaround_disrupted"
    if np.isfinite(growth) and growth > 0.18 and (not np.isfinite(fcf_margin) or fcf_margin < 0.03):
        return "pre_profit_platform"
    if np.isfinite(bottleneck_z) and bottleneck_z > 0.75 and np.isfinite(roic) and roic > 0.10:
        return "bottleneck_oligopoly"
    if (np.isfinite(ev_sales) and ev_sales > 8.0) or (np.isfinite(pb) and pb > 8.0):
        return "expensive_compounder"
    if np.isfinite(roic) and roic > 0.12 and np.isfinite(fcf_margin) and fcf_margin > 0.08 and (not np.isfinite(debt_assets) or debt_assets < 0.35):
        return "quality_compounder"
    return "general_intrinsic"


def primary_question_for_regime(regime: str) -> str:
    questions = {
        "expensive_compounder": "Are market-implied expectations feasible?",
        "quality_compounder": "How long can excess ROIC persist?",
        "financial_book_capital": "Does book capital create value above cost of equity?",
        "asset_heavy_cyclical": "Where are we in the supply response cycle?",
        "commodity_resource": "Is normalized commodity economics better than spot expectations?",
        "pre_profit_platform": "Are unit economics improving enough to justify optionality?",
        "bottleneck_oligopoly": "Is scarcity durable and monetizable?",
        "regulated_utility_infrastructure": "Is the regulated spread adequate versus cost of capital?",
        "turnaround_disrupted": "Is asset value a floor or a value trap?",
        "general_intrinsic": "Which intrinsic value lens deserves trust first?",
    }
    return questions.get(regime, questions["general_intrinsic"])


def reverse_dcf_expectations(row: pd.Series) -> dict[str, Any]:
    current_growth = clamp(row.get("revenue_growth_3y"), -0.20, 0.35)
    current_margin = clamp(row.get("operating_margin"), -0.20, 0.45)
    roic = clamp(row.get("roic_proxy"), -0.10, 0.50)
    cost = clamp(row.get("macro_cost_anchor"), 0.045, 0.16)
    fcf_yield = clamp(row.get("fcf_yield"), -0.15, 0.20)
    ev_sales_z = clamp(row.get("ev_to_sales_year_z"), -3.0, 3.0)
    pb_z = clamp(row.get("pb_year_z"), -3.0, 3.0)
    valuation_pressure = max(ev_sales_z, 0.0) * 0.65 + max(pb_z, 0.0) * 0.35

    implied_revenue_cagr = clamp(0.04 + current_growth * 0.25 + valuation_pressure * 0.030 - fcf_yield * 0.18 + max(cost - 0.08, 0.0) * 0.45, -0.05, 0.32)
    implied_terminal_margin = clamp(current_margin + valuation_pressure * 0.025 - max(fcf_yield, 0.0) * 0.08, -0.05, 0.45)
    implied_incremental_roic = clamp(cost + 0.025 + valuation_pressure * 0.025 + max(roic - cost, 0.0) * 0.20 - max(fcf_yield, 0.0) * 0.10, 0.02, 0.45)
    implied_reinvestment_rate = clamp(implied_revenue_cagr / max(implied_incremental_roic, 0.04), 0.0, 1.0)
    duration_risk = clamp(valuation_pressure / 3.0 + max(cost - 0.065, 0.0) * 4.0 - max(fcf_yield, 0.0), 0.0, 1.0)

    return {
        "implied_revenue_cagr": implied_revenue_cagr,
        "implied_terminal_ebit_margin": implied_terminal_margin,
        "implied_incremental_roic": implied_incremental_roic,
        "implied_reinvestment_rate": implied_reinvestment_rate,
        "duration_risk": duration_risk,
        "valuation_pressure_score": clamp(valuation_pressure / 2.5, 0.0, 1.0),
        "current_revenue_growth_3y": current_growth,
        "current_operating_margin": current_margin,
        "current_roic_proxy": roic,
        "cost_anchor": cost,
    }


def score_expectation_feasibility(row: pd.Series, expectations: dict[str, Any]) -> dict[str, Any]:
    growth_gap = expectations["implied_revenue_cagr"] - clamp(row.get("revenue_growth_3y"), -0.20, 0.35)
    margin_gap = expectations["implied_terminal_ebit_margin"] - clamp(row.get("operating_margin"), -0.20, 0.45)
    roic_gap = expectations["implied_incremental_roic"] - clamp(row.get("roic_proxy"), -0.10, 0.50)
    leverage_penalty = max(clamp(row.get("debt_assets"), 0.0, 1.5) - 0.55, 0.0) * 0.35
    bottleneck_bonus = max(clamp(row.get("bottleneck_proxy_year_z"), -3.0, 3.0), 0.0) * 0.05
    quality_bonus = max(clamp(row.get("excess_roic_proxy"), -0.20, 0.35), 0.0) * 0.60
    penalty = max(growth_gap, 0.0) * 1.15 + max(margin_gap, 0.0) * 0.90 + max(roic_gap, 0.0) * 0.85 + leverage_penalty
    score = clamp(0.72 - penalty + bottleneck_bonus + quality_bonus, 0.0, 1.0)
    return {
        "score": score,
        "band": band(score, [(0.34, "low"), (0.57, "medium"), (0.78, "high")], "very_high"),
        "growth_gap": float(growth_gap),
        "margin_gap": float(margin_gap),
        "roic_gap": float(roic_gap),
        "leverage_penalty": float(leverage_penalty),
    }


def anchor_lens_checks(row: pd.Series, regime: str, expectations: dict[str, Any]) -> dict[str, Any]:
    fcf_yield = clamp(row.get("fcf_yield"), -0.15, 0.20)
    debt_assets = clamp(row.get("debt_assets"), 0.0, 1.5)
    pb_z = clamp(row.get("pb_year_z"), -3.0, 3.0)
    residual_spread = clamp(row.get("roe"), -0.30, 0.50) - expectations["cost_anchor"]
    asset_score = clamp(0.45 + (-pb_z) * 0.12 + fcf_yield * 1.10 - debt_assets * 0.25, 0.0, 1.0)
    residual_score = clamp(0.48 + residual_spread * 1.15 - debt_assets * 0.08, 0.0, 1.0)
    capital_cycle_score = clamp(0.50 + clamp(row.get("capital_cycle_proxy_year_z"), -3.0, 3.0) * 0.13, 0.0, 1.0)
    bottleneck_score = clamp(0.45 + clamp(row.get("bottleneck_proxy_year_z"), -3.0, 3.0) * 0.14, 0.0, 1.0)
    reverse_pressure = expectations["valuation_pressure_score"]
    return {
        "reverse_dcf": {
            "conclusion": band(reverse_pressure, [(0.25, "undemanding"), (0.55, "reasonable"), (0.78, "demanding")], "extreme"),
            "pressure_score": reverse_pressure,
        },
        "asset_value": {
            "conclusion": band(asset_score, [(0.30, "weak downside anchor"), (0.55, "moderate downside anchor"), (0.76, "strong downside anchor")], "very strong downside anchor"),
            "score": asset_score,
        },
        "residual_income": {
            "conclusion": "primary" if regime == "financial_book_capital" else ("supporting" if residual_score >= 0.50 else "not primary"),
            "score": residual_score,
        },
        "capital_cycle": {
            "conclusion": band(capital_cycle_score, [(0.38, "negative"), (0.58, "neutral"), (0.74, "positive")], "very positive"),
            "score": capital_cycle_score,
        },
        "bottleneck": {
            "conclusion": band(bottleneck_score, [(0.42, "weak"), (0.60, "possible"), (0.78, "strong")], "very strong"),
            "score": bottleneck_score,
        },
    }


def identify_falsifiers(row: pd.Series, regime: str, expectations: dict[str, Any], anchors: dict[str, Any]) -> list[str]:
    falsifiers = [
        f"Revenue CAGR below {max(expectations['implied_revenue_cagr'] - 0.04, -0.05):.1%} while valuation pressure stays high",
        f"Operating margin fails to approach {expectations['implied_terminal_ebit_margin']:.1%}",
        f"Incremental ROIC below {max(expectations['implied_incremental_roic'] - 0.03, 0.02):.1%}",
    ]
    if regime in {"asset_heavy_cyclical", "commodity_resource"}:
        falsifiers.append("Industry capacity additions accelerate faster than demand growth")
    if regime == "bottleneck_oligopoly":
        falsifiers.append("Backlog, pricing, or gross margin no longer confirms bottleneck power")
    if regime == "financial_book_capital":
        falsifiers.append("ROE spread over cost of equity turns negative or credit losses impair book value")
    if anchors["asset_value"]["score"] < 0.35:
        falsifiers.append("No tangible or book-capital anchor appears when earnings power weakens")
    if clamp(row.get("debt_assets"), 0.0, 1.5) > 0.60:
        falsifiers.append("Leverage keeps cost of capital disconnected from operating quality")
    return falsifiers[:6]


def evidence_confidence(row: pd.Series, feasibility: dict[str, Any], anchors: dict[str, Any]) -> dict[str, Any]:
    required = ["revenue", "ebit", "fcf", "assets", "equity", "market_cap", "price_t0", "risk_free_10y"]
    completeness = sum(np.isfinite(safe_float(row.get(col))) for col in required) / len(required)
    anchor_strength = float(np.mean([
        anchors["asset_value"]["score"],
        anchors["residual_income"]["score"],
        anchors["capital_cycle"]["score"],
        anchors["bottleneck"]["score"],
    ]))
    feasibility_score = float(feasibility["score"])
    overall = clamp(0.45 * completeness + 0.30 * feasibility_score + 0.25 * anchor_strength, 0.0, 1.0)
    return {
        "overall": overall,
        "band": band(overall, [(0.40, "low"), (0.62, "medium"), (0.80, "high")], "very_high"),
        "data_completeness": float(completeness),
        "anchor_strength": anchor_strength,
        "feasibility_score": feasibility_score,
    }


def spine_weights_for_regime(regime: str) -> dict[str, float]:
    return SPINE_METHOD_WEIGHTS.get(regime, SPINE_METHOD_WEIGHTS["general_intrinsic"])


def spine_composite_for_row(row: pd.Series, regime: str) -> float:
    weights = spine_weights_for_regime(regime)
    total = 0.0
    used = 0.0
    for method, weight in weights.items():
        value = safe_float(row.get(f"pred_{method}"))
        if np.isfinite(value):
            total += value * weight
            used += weight
    return float(total / used) if used > 0 else np.nan


def aurora_spine_memo(row: pd.Series) -> dict[str, Any]:
    regime = classify_spine_regime(row)
    expectations = reverse_dcf_expectations(row)
    feasibility = score_expectation_feasibility(row, expectations)
    anchors = anchor_lens_checks(row, regime, expectations)
    confidence = evidence_confidence(row, feasibility, anchors)
    weights = spine_weights_for_regime(regime)
    composite = spine_composite_for_row(row, regime)
    falsifiers = identify_falsifiers(row, regime, expectations, anchors)
    abstain = confidence["overall"] < 0.45 or feasibility["score"] < 0.25
    return {
        "ticker": row.get("ticker"),
        "year": int(row.get("year")),
        "asof_date": row.get("asof_date"),
        "horizon": "3Y",
        "regime": regime,
        "primary_question": primary_question_for_regime(regime),
        "market_implied_expectations": expectations,
        "feasibility": feasibility,
        "anchor_lenses": anchors,
        "spine_composite_expected_return": composite,
        "spine_weights": weights,
        "falsifiers": falsifiers,
        "confidence": confidence,
        "abstain_from_precise_fair_value": bool(abstain),
        "product_status": "production_memo_candidate" if not abstain else "memo_with_abstention",
    }


def add_lens_predictions(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    cost = out["macro_cost_anchor"].fillna(0.09)
    growth = out["revenue_growth_3y"].clip(-0.25, 0.35).fillna(0.02)
    fcf_yield = out["fcf_yield"].clip(-0.2, 0.25).fillna(0.02)
    roic = out["roic_proxy"].clip(-0.25, 0.55).fillna(cost + 0.01)
    margin = out["operating_margin"].clip(-0.35, 0.55).fillna(0.08)
    debt = out["debt_assets"].clip(0, 1.5).fillna(0.35)
    asset_z = out.get("pb_year_z", pd.Series(0, index=out.index)).fillna(0)
    sales_z = out.get("ev_to_sales_year_z", pd.Series(0, index=out.index)).fillna(0)
    bottleneck = out.get("bottleneck_proxy_year_z", pd.Series(0, index=out.index)).fillna(0)
    optionality = out.get("optionality_proxy_year_z", pd.Series(0, index=out.index)).fillna(0)
    capital_cycle = out.get("capital_cycle_proxy_year_z", pd.Series(0, index=out.index)).fillna(0)
    tangible_discount = (-0.60 * asset_z - 0.28 * sales_z).clip(-2.5, 2.5)
    balance_sheet_anchor = (
        0.035
        + tangible_discount * 0.028
        + out["cash_assets"].fillna(0.04).clip(0, 0.65) * 0.075
        + out["asset_turnover"].fillna(0.55).clip(0, 3.0) * 0.018
        + fcf_yield.clip(-0.05, 0.18) * 0.42
        - debt * 0.075
        - out["working_capital_intensity"].fillna(0.25).clip(0, 2.0) * 0.010
    )
    out["pred_dcf"] = (fcf_yield + growth * 0.55 + margin * 0.08 - cost * 0.65 - debt * 0.015).clip(-0.35, 0.55)
    out["pred_roicFade"] = (0.02 + (roic - cost) * 0.75 + growth * 0.25 - debt * 0.025).clip(-0.35, 0.55)
    out["pred_reverseDcf"] = (0.06 - sales_z * 0.018 - asset_z * 0.010 + growth * 0.18 - cost * 0.20).clip(-0.35, 0.55)
    out["pred_residualIncome"] = (0.015 + (out["roe"].fillna(roic) - cost) * 0.45 - debt * 0.02 + margin * 0.04).clip(-0.35, 0.55)
    out["pred_assetValue"] = balance_sheet_anchor.clip(-0.35, 0.55)
    out["pred_unitEconomics"] = (growth * 0.55 + margin * 0.16 + out["gross_margin"].fillna(margin) * 0.08 - sales_z * 0.012 - debt * 0.015).clip(-0.35, 0.55)
    out["pred_bottleneck"] = (0.02 + bottleneck * 0.028 + (roic - cost) * 0.22 + growth * 0.20 - out["capex_intensity"].fillna(0.05) * 0.08).clip(-0.35, 0.55)
    out["pred_realOptions"] = (optionality * 0.025 + growth * 0.45 + out["vol_1y_trailing"].fillna(0.25) * 0.025 - sales_z * 0.015 - cost * 0.18).clip(-0.35, 0.55)
    out["pred_capitalCycle"] = (
        0.035
        + capital_cycle * 0.030
        + out["cyclical_sector_flag"].fillna(0) * 0.020
        + fcf_yield.clip(-0.05, 0.18) * 0.35
        + margin.clip(-0.10, 0.35) * 0.08
        - out["capex_intensity"].fillna(0.05).clip(0, 0.45) * 0.13
        - out["ret_3y_trailing"].fillna(0.0).clip(-0.60, 1.25) * 0.025
        - debt * 0.025
    ).clip(-0.35, 0.55)
    return out


def spearman_by_year(frame: pd.DataFrame, pred_col: str, target_col: str) -> float:
    values = []
    for _, sub in frame.groupby("year"):
        if len(sub) >= 8 and sub[pred_col].nunique() > 1 and sub[target_col].nunique() > 1:
            corr = sub[[pred_col, target_col]].corr(method="spearman").iloc[0, 1]
            if np.isfinite(corr):
                values.append(float(corr))
    return float(np.mean(values)) if values else np.nan


SPECIALIZED_LENS_FEATURES = {
    "assetValue": [
        "pb_year_z", "ev_to_sales_year_z", "debt_assets", "cash_assets", "asset_turnover",
        "fcf_yield", "capex_intensity", "ret_3y_trailing", "drawdown_3y_trailing",
    ],
    "reverseDcf": [
        "ev_to_sales_year_z", "pb_year_z", "revenue_growth_3y", "fcf_yield",
        "operating_margin", "ret_1y_trailing", "ret_3y_trailing", "risk_free_delta_1y",
    ],
    "bottleneck": [
        "bottleneck_proxy_year_z", "gross_margin", "operating_margin", "roic_proxy",
        "excess_roic_proxy", "capex_intensity", "revenue_growth_3y",
    ],
    "realOptions": [
        "optionality_proxy_year_z", "revenue_growth_3y", "vol_1y_trailing",
        "ret_3y_trailing", "ev_to_sales_year_z", "gross_margin",
    ],
    "capitalCycle": [
        "capital_cycle_proxy_year_z", "cyclical_sector_flag", "fcf_yield", "asset_turnover",
        "operating_margin", "capex_intensity", "debt_assets", "ret_3y_trailing",
    ],
}


def tune_specialized_lens_models(data: pd.DataFrame, target_col: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    out = data.copy()
    report: dict[str, Any] = {}
    internal_folds = [(2018, 2019), (2019, 2020)]
    if len(out.loc[out["year"] <= 2020]) < 300:
        return out, {"status": "skipped", "reason": "insufficient fit/tune rows"}

    for method, raw_features in SPECIALIZED_LENS_FEATURES.items():
        pred_col = f"pred_{method}"
        features = [col for col in raw_features if col in out.columns]
        if len(features) < 4:
            report[method] = {"status": "skipped", "features": features}
            continue
        alpha_scores: dict[float, list[dict[str, float]]] = {alpha: [] for alpha in [1.0, 3.0, 8.0, 20.0, 55.0, 120.0]}
        for fit_end, tune_year in internal_folds:
            fit_sub = out.loc[out["year"] <= fit_end].dropna(subset=[target_col, pred_col]).copy()
            tune_sub = out.loc[out["year"] == tune_year].dropna(subset=[target_col, pred_col]).copy()
            if len(fit_sub) < 250 or len(tune_sub) < 60:
                continue
            base_tune_mae = float(mean_absolute_error(tune_sub[target_col], tune_sub[pred_col]))
            for alpha in alpha_scores:
                pipe = Pipeline([
                    ("imputer", SimpleImputer(strategy="median")),
                    ("scaler", StandardScaler()),
                    ("model", Ridge(alpha=alpha)),
                ])
                pipe.fit(fit_sub[features], fit_sub[target_col])
                pred = np.clip(pipe.predict(tune_sub[features]), -0.45, 0.65)
                mae = float(mean_absolute_error(tune_sub[target_col], pred))
                alpha_scores[alpha].append({"fit_end": fit_end, "tune_year": tune_year, "base_mae": base_tune_mae, "mae": mae, "improvement": base_tune_mae - mae})
        valid_scores = {
            alpha: folds for alpha, folds in alpha_scores.items()
            if len(folds) == len(internal_folds) and all(fold["improvement"] >= 0.001 for fold in folds)
        }
        if valid_scores:
            best_alpha, best_folds = max(valid_scores.items(), key=lambda item: np.mean([fold["improvement"] for fold in item[1]]))
            full_train = out.loc[out["year"] <= TRAIN_END_YEAR].dropna(subset=[target_col]).copy()
            pipe = Pipeline([
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
                ("model", Ridge(alpha=best_alpha)),
            ])
            pipe.fit(full_train[features], full_train[target_col])
            out[pred_col] = np.clip(pipe.predict(out[features]), -0.45, 0.65)
            report[method] = {
                "status": "applied",
                "model": "ridge_numeric_lens_v2",
                "features": features,
                "alpha": best_alpha,
                "internal_folds": best_folds,
                "mean_internal_improvement": float(np.mean([fold["improvement"] for fold in best_folds])),
                "fit_rows": int(len(full_train)),
            }
        else:
            best_alpha, best_folds = min(
                alpha_scores.items(),
                key=lambda item: np.mean([fold["mae"] for fold in item[1]]) if item[1] else np.inf,
            )
            report[method] = {
                "status": "rejected",
                "model": "ridge_numeric_lens_v2",
                "features": features,
                "alpha": best_alpha,
                "internal_folds": best_folds,
                "reason": "did_not_improve_all_internal_folds",
            }
    return out, report


def calibrate_lens_predictions(data: pd.DataFrame, train_mask: pd.Series, target_col: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    out = data.copy()
    report: dict[str, Any] = {}
    for method in MODEL_NAMES:
        col = f"pred_{method}"
        sub = out.loc[train_mask, [col, target_col]].replace([np.inf, -np.inf], np.nan).dropna()
        if len(sub) < 80 or sub[col].nunique() <= 3:
            report[method] = {"status": "skipped", "rows": int(len(sub))}
            continue
        raw_mae = float(mean_absolute_error(sub[target_col], sub[col]))
        bias = float(np.clip(np.median(sub[target_col] - sub[col]), -0.12, 0.12))
        calibrated_train = (sub[col] + bias).clip(-0.45, 0.65)
        calibrated_mae = float(mean_absolute_error(sub[target_col], calibrated_train))
        if calibrated_mae <= raw_mae + 0.001:
            out[col] = (pd.to_numeric(out[col], errors="coerce") + bias).clip(-0.45, 0.65)
            report[method] = {
                "status": "applied",
                "calibration": "bias_only_rank_preserving",
                "rows": int(len(sub)),
                "raw_train_mae": raw_mae,
                "calibrated_train_mae": calibrated_mae,
                "bias": bias,
            }
        else:
            report[method] = {
                "status": "rejected",
                "calibration": "bias_only_rank_preserving",
                "rows": int(len(sub)),
                "raw_train_mae": raw_mae,
                "calibrated_train_mae": calibrated_mae,
            }
    return out, report


def build_labels(frame: pd.DataFrame, target_col: str, method_names: list[str]) -> pd.DataFrame:
    rows = []
    for idx, row in frame.iterrows():
        target = row[target_col]
        ranked = []
        if not np.isfinite(target):
            continue
        for method in method_names:
            pred = row.get(f"pred_{method}")
            if np.isfinite(pred):
                ranked.append({"method": method, "error": abs(pred - target), "pred": pred})
        ranked = sorted(ranked, key=lambda x: x["error"])
        if len(ranked) < 2:
            continue
        best, second = ranked[0], ranked[1]
        errors = np.array([item["error"] for item in ranked])
        margin = second["error"] - best["error"]
        relative_margin = margin / max(second["error"], 0.05)
        median_edge = float(np.median(errors) - best["error"])
        direction_ok = np.sign(best["pred"]) == np.sign(target)
        high = best["error"] <= 0.18 and margin >= 0.020 and relative_margin >= 0.15 and median_edge >= 0.030 and direction_ok
        rows.append({
            "row_index": idx,
            "ticker": row["ticker"],
            "year": int(row["year"]),
            "sector": row.get("sector", ""),
            "label": best["method"] if high else "indeterminate",
            "best_method": best["method"],
            "best_error": best["error"],
            "margin": margin,
            "relative_margin": relative_margin,
            "median_edge": median_edge,
            "direction_ok": bool(direction_ok),
        })
    return pd.DataFrame(rows)


def lens_weight_from_mae(mae_by_method: dict[str, float], temperature: float, method_names: list[str]) -> np.ndarray:
    values = np.array([mae_by_method.get(method, np.nan) for method in method_names], dtype=float)
    if not np.isfinite(values).any():
        return np.ones(len(method_names)) / len(method_names)
    fallback = np.nanmedian(values[np.isfinite(values)])
    values = np.where(np.isfinite(values), values, fallback)
    raw = np.exp(-(values - np.min(values)) / max(temperature, 1e-6))
    return raw / raw.sum()


def lens_mae(frame: pd.DataFrame, target_col: str, method_names: list[str]) -> dict[str, float]:
    out: dict[str, float] = {}
    for method in method_names:
        col = f"pred_{method}"
        sub = frame[[col, target_col]].replace([np.inf, -np.inf], np.nan).dropna()
        out[method] = float(mean_absolute_error(sub[target_col], sub[col])) if len(sub) else np.nan
    return out


def build_reliability_tables(frame: pd.DataFrame, target_col: str, method_names: list[str], min_group_rows: int = 45) -> dict[str, Any]:
    temperature = 0.022 if "3y" in target_col else 0.035
    global_mae = lens_mae(frame, target_col, method_names)
    tables: dict[str, Any] = {
        "temperature": temperature,
        "method_names": method_names,
        "global": {
            "rows": int(len(frame)),
            "mae": global_mae,
            "weights": lens_weight_from_mae(global_mae, temperature, method_names),
        },
        "by_regime": {},
        "by_sector": {},
    }
    for group_col, table_name in [("economic_regime", "by_regime"), ("sector", "by_sector")]:
        for group, sub in frame.groupby(group_col, dropna=True):
            if len(sub) < min_group_rows:
                continue
            mae = lens_mae(sub, target_col, method_names)
            tables[table_name][str(group)] = {
                "rows": int(len(sub)),
                "mae": mae,
                "weights": lens_weight_from_mae(mae, temperature, method_names),
            }
    return tables


def reliability_weights_for_rows(rows: pd.DataFrame, tables: dict[str, Any], mix: dict[str, float], method_names: list[str]) -> np.ndarray:
    global_w = np.asarray(tables["global"]["weights"], dtype=float)
    all_weights = []
    for _, row in rows.iterrows():
        pieces: list[tuple[float, np.ndarray]] = [(mix.get("global", 0.20), global_w)]
        regime = tables["by_regime"].get(str(row.get("economic_regime") or ""))
        if regime:
            pieces.append((mix.get("regime", 0.55), np.asarray(regime["weights"], dtype=float)))
        sector = tables["by_sector"].get(str(row.get("sector") or ""))
        if sector:
            pieces.append((mix.get("sector", 0.25), np.asarray(sector["weights"], dtype=float)))
        total_mix = sum(weight for weight, _ in pieces)
        combined = sum(weight * values for weight, values in pieces) / max(total_mix, 1e-9)
        all_weights.append(combined / combined.sum())
    return np.vstack(all_weights) if all_weights else np.empty((0, len(method_names)))


def evaluate_reliability_router(train: pd.DataFrame, val: pd.DataFrame, target_col: str, train_mean_w: np.ndarray, uniform_w: np.ndarray, method_names: list[str]) -> tuple[dict[str, Any], np.ndarray]:
    tune = train.loc[train["year"] == TRAIN_END_YEAR].copy()
    fit = train.loc[train["year"] < TRAIN_END_YEAR].copy()
    if len(fit) < 200 or len(tune) < 40:
        fit = train
        tune = train
    method_cols = [f"pred_{m}" for m in method_names]
    mix_candidates = [
        {"name": "global", "regime": 0.0, "sector": 0.0, "global": 1.0},
        {"name": "regime", "regime": 0.75, "sector": 0.0, "global": 0.25},
        {"name": "sector", "regime": 0.0, "sector": 0.75, "global": 0.25},
        {"name": "regime_sector", "regime": 0.55, "sector": 0.25, "global": 0.20},
    ]
    best: dict[str, Any] = {"mae": np.inf, "mix_name": None, "blend": None, "mix": None}
    for mix in mix_candidates:
        tune_tables = build_reliability_tables(fit, target_col, method_names)
        tune_base_w = reliability_weights_for_rows(tune, tune_tables, mix, method_names)
        tune_preds = tune[method_cols].to_numpy(dtype=float)
        for router_weight in np.linspace(0.0, 0.95, 20):
            for uniform_weight in np.linspace(0.0, 0.80, 17):
                train_mean_weight = 1.0 - router_weight - uniform_weight
                if train_mean_weight < -1e-9:
                    continue
                candidate_w = router_weight * tune_base_w + uniform_weight * uniform_w + max(0.0, train_mean_weight) * train_mean_w
                candidate_w = candidate_w / candidate_w.sum(axis=1, keepdims=True)
                forecast = (candidate_w * tune_preds).sum(axis=1)
                mae = mean_absolute_error(tune[target_col], forecast)
                if mae < best["mae"]:
                    best = {
                        "mae": float(mae),
                        "mix_name": mix["name"],
                        "mix": {key: value for key, value in mix.items() if key != "name"},
                        "blend": {
                            "router": float(router_weight),
                            "uniform": float(uniform_weight),
                            "train_mean": float(max(0.0, train_mean_weight)),
                        },
                    }
    final_tables = build_reliability_tables(train, target_col, method_names)
    final_base_w = reliability_weights_for_rows(val, final_tables, best["mix"] or mix_candidates[0], method_names)
    blend = best["blend"] or {"router": 1.0, "uniform": 0.0, "train_mean": 0.0}
    weights = blend["router"] * final_base_w + blend["uniform"] * uniform_w + blend["train_mean"] * train_mean_w
    weights = weights / weights.sum(axis=1, keepdims=True)
    forecast = (weights * val[method_cols].to_numpy(dtype=float)).sum(axis=1)
    top = pd.Series([method_names[i] for i in weights.argmax(axis=1)]).value_counts(normalize=True).to_dict()
    confidence = np.clip(weights.max(axis=1) - np.partition(weights, -2, axis=1)[:, -2], 0, 1)
    high_mask = confidence >= 0.10
    result = {
        "forecast_mae": float(mean_absolute_error(val[target_col], forecast)),
        "forecast_ic": spearman_by_year(val.assign(_forecast=forecast), "_forecast", target_col),
        "avg_confidence": float(np.mean(confidence)),
        "high_confidence_rows": int(high_mask.sum()),
        "high_confidence_mae": float(mean_absolute_error(val.loc[high_mask, target_col], forecast[high_mask])) if high_mask.any() else None,
        "tuning": best,
        "method_top_share": top,
        "global_reliability_weights": {method: float(final_tables["global"]["weights"][i]) for i, method in enumerate(method_names)},
        "available_regime_tables": sorted(final_tables["by_regime"].keys()),
    }
    return result, weights


def evaluate_lens_portfolio(train: pd.DataFrame, val: pd.DataFrame, target_col: str, method_names: list[str]) -> tuple[dict[str, Any], np.ndarray]:
    tune = train.loc[train["year"] == TRAIN_END_YEAR].copy()
    if len(tune) < 40:
        tune = train.copy()
    method_cols = [f"pred_{method}" for method in method_names]
    candidates: list[tuple[str, np.ndarray]] = []

    for method in method_names:
        weights = np.zeros(len(method_names))
        weights[method_names.index(method)] = 1.0
        candidates.append((method, weights))

    for i, first in enumerate(method_names):
        for j, second in enumerate(method_names):
            if j <= i:
                continue
            for first_weight in np.linspace(0.05, 0.95, 19):
                weights = np.zeros(len(method_names))
                weights[i] = first_weight
                weights[j] = 1.0 - first_weight
                candidates.append((f"{first}_{first_weight:.2f}+{second}_{1.0 - first_weight:.2f}", weights))

    for i, first in enumerate(method_names):
        for j, second in enumerate(method_names):
            if j <= i:
                continue
            for k, third in enumerate(method_names):
                if k <= j:
                    continue
                weights = np.zeros(len(method_names))
                weights[[i, j, k]] = 1.0 / 3.0
                candidates.append((f"{first}+{second}+{third}_equal", weights))

    tune_preds = tune[method_cols].to_numpy(dtype=float)
    tune_target = tune[target_col].to_numpy(dtype=float)
    best: dict[str, Any] | None = None
    for name, weights in candidates:
        forecast = tune_preds @ weights
        mae = float(mean_absolute_error(tune_target, forecast))
        if best is None or mae < best["tune_mae"]:
            best = {"name": name, "weights": weights, "tune_mae": mae}

    if best is None:
        weights = np.ones(len(method_names)) / len(method_names)
        best = {"name": "uniform_fallback", "weights": weights, "tune_mae": None}

    base_weights = np.asarray(best["weights"], dtype=float)
    weights = np.tile(base_weights, (len(val), 1))
    forecast = val[method_cols].to_numpy(dtype=float) @ base_weights
    sorted_weights = np.sort(base_weights)
    confidence = float(sorted_weights[-1] - sorted_weights[-2]) if len(sorted_weights) >= 2 else 1.0
    high_mask = np.repeat(confidence >= 0.10, len(val))
    top_method = method_names[int(np.argmax(base_weights))]
    result = {
        "forecast_mae": float(mean_absolute_error(val[target_col], forecast)),
        "forecast_ic": spearman_by_year(val.assign(_forecast=forecast), "_forecast", target_col),
        "avg_confidence": confidence,
        "high_confidence_rows": int(high_mask.sum()),
        "high_confidence_mae": float(mean_absolute_error(val.loc[high_mask, target_col], forecast[high_mask])) if high_mask.any() else None,
        "selection": "best single/pair/equal-triple on train_end_year tune set only",
        "tune_year": TRAIN_END_YEAR,
        "tune_mae": best["tune_mae"],
        "portfolio_name": best["name"],
        "portfolio_weights": {method: float(base_weights[i]) for i, method in enumerate(method_names) if base_weights[i] > 1e-12},
        "method_top_share": {top_method: 1.0},
    }
    return result, weights


def evaluate_router(df: pd.DataFrame, horizon: int, artifact_dir: Path) -> dict[str, Any]:
    target_col = f"ann_return_{horizon}y_fwd"
    method_names = HORIZON_METHODS.get(horizon, MODEL_NAMES)
    data = df.dropna(subset=[target_col]).copy()
    method_cols = [f"pred_{m}" for m in method_names]
    data = data.dropna(subset=method_cols, how="all")
    data, specialized_lens_report = tune_specialized_lens_models(data, target_col)
    train_mask = data["year"] <= TRAIN_END_YEAR
    data, calibration_report = calibrate_lens_predictions(data, train_mask, target_col)
    train = data.loc[data["year"] <= TRAIN_END_YEAR].copy()
    val = data.loc[data["year"] >= VAL_START_YEAR].copy()
    train_labels = build_labels(train, target_col, method_names)
    val_labels = build_labels(val, target_col, method_names)
    usable_train = train_labels.loc[train_labels["label"] != "indeterminate"].copy()
    label_summary = {
        "train_rows": int(len(train)),
        "val_rows": int(len(val)),
        "high_conviction_train_rows": int(len(usable_train)),
        "high_conviction_train_share": float(len(usable_train) / max(1, len(train_labels))),
        "train_label_counts": train_labels["label"].value_counts().to_dict() if len(train_labels) else {},
        "active_methods": method_names,
        "diagnostic_methods": MODEL_NAMES,
    }
    artifact_dir.mkdir(parents=True, exist_ok=True)
    train_labels.to_csv(artifact_dir / f"labels_{horizon}y_train.csv", index=False)
    val_labels.to_csv(artifact_dir / f"labels_{horizon}y_val_diagnostic.csv", index=False)

    lens_metrics = {}
    for method in MODEL_NAMES:
        col = f"pred_{method}"
        lens_metrics[method] = {
            "train_mae": float(mean_absolute_error(train[target_col], train[col])),
            "val_mae": float(mean_absolute_error(val[target_col], val[col])),
            "val_ic": spearman_by_year(val, col, target_col),
            "active_for_horizon": method in method_names,
        }
    best_single = min(method_names, key=lambda method: lens_metrics[method]["train_mae"])
    best_validation_lens = min(MODEL_NAMES, key=lambda method: lens_metrics[method]["val_mae"])
    best_active_validation_lens = min(method_names, key=lambda method: lens_metrics[method]["val_mae"])

    uniform_w = np.ones(len(method_names)) / len(method_names)
    train_counts = usable_train["label"].value_counts(normalize=True).reindex(method_names).fillna(0.0).to_numpy()
    train_mean_w = train_counts / train_counts.sum() if train_counts.sum() else uniform_w

    preds_val = val[method_cols].to_numpy(dtype=float)
    uniform_forecast = preds_val @ uniform_w
    train_mean_forecast = preds_val @ train_mean_w
    best_single_forecast = val[f"pred_{best_single}"].to_numpy(dtype=float)

    feature_numeric = [
        "revenue_growth_1y","revenue_growth_3y","fcf_yield","roic_proxy","excess_roic_proxy","gross_margin","operating_margin","net_margin","debt_assets","cash_assets","capex_intensity","ret_1y_trailing","ret_3y_trailing","vol_1y_trailing","drawdown_3y_trailing","risk_free_10y","risk_free_delta_1y","ev_to_sales_year_z","pb_year_z","bottleneck_proxy_year_z","optionality_proxy_year_z",
    ]
    feature_numeric = [col for col in feature_numeric if col in data.columns]
    feature_categorical = ["sector", "industry", "country"]
    train_hc = train.loc[usable_train["row_index"].values].copy() if len(usable_train) else pd.DataFrame()
    results: dict[str, Any] = {}
    model_forecasts: dict[str, np.ndarray] = {}
    model_weights: dict[str, np.ndarray] = {}

    if len(train_hc) >= 80 and usable_train["label"].nunique() >= 2 and len(val) >= 40:
        preprocess = ColumnTransformer([
            ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]), feature_numeric),
            ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), feature_categorical),
        ])
        x_train = train_hc[feature_numeric + feature_categorical]
        y_train = usable_train["label"].to_numpy()
        x_val = val[feature_numeric + feature_categorical]
        candidates = {
            "logistic": LogisticRegression(max_iter=1000, C=0.35, class_weight="balanced", random_state=7),
            "random_forest": RandomForestClassifier(n_estimators=350, min_samples_leaf=8, max_features="sqrt", class_weight="balanced_subsample", random_state=7, n_jobs=-1),
            "extra_trees": ExtraTreesClassifier(n_estimators=500, min_samples_leaf=8, max_features="sqrt", class_weight="balanced", random_state=7, n_jobs=-1),
        }
        for name, estimator in candidates.items():
            pipe = Pipeline([("preprocess", preprocess), ("model", estimator)])
            pipe.fit(x_train, y_train)
            classes = list(pipe.named_steps["model"].classes_)
            tune = train.loc[train["year"] == TRAIN_END_YEAR].copy()

            def class_proba_to_weights(proba: np.ndarray) -> np.ndarray:
                weights_local = np.zeros((len(proba), len(method_names)))
                for class_index, method in enumerate(classes):
                    if method in method_names:
                        weights_local[:, method_names.index(method)] = proba[:, class_index]
                row_sum = weights_local.sum(axis=1, keepdims=True)
                return np.divide(weights_local, row_sum, out=np.tile(uniform_w, (len(weights_local), 1)), where=row_sum > 1e-12)

            if len(tune) >= 40:
                tune_proba = pipe.predict_proba(tune[feature_numeric + feature_categorical])
                tune_model_w = class_proba_to_weights(tune_proba)
                tune_method_preds = tune[method_cols].to_numpy(dtype=float)
                best_blend = {"mae": np.inf, "model": 0.65, "train_mean": 0.35, "uniform": 0.0}
                for model_weight in np.linspace(0.0, 0.85, 18):
                    for train_mean_weight in np.linspace(0.0, 0.70, 15):
                        uniform_weight = 1.0 - model_weight - train_mean_weight
                        if uniform_weight < -1e-9:
                            continue
                        candidate_w = model_weight * tune_model_w + train_mean_weight * train_mean_w + max(0.0, uniform_weight) * uniform_w
                        candidate_w = candidate_w / candidate_w.sum(axis=1, keepdims=True)
                        candidate_forecast = (candidate_w * tune_method_preds).sum(axis=1)
                        mae = mean_absolute_error(tune[target_col], candidate_forecast)
                        if mae < best_blend["mae"]:
                            best_blend = {
                                "mae": float(mae),
                                "model": float(model_weight),
                                "train_mean": float(train_mean_weight),
                                "uniform": float(max(0.0, uniform_weight)),
                            }
            else:
                best_blend = {"mae": None, "model": 0.65, "train_mean": 0.35, "uniform": 0.0}

            proba = pipe.predict_proba(x_val)
            weights = class_proba_to_weights(proba)
            for class_index, method in enumerate(classes):
                if method in method_names:
                    weights[:, method_names.index(method)] = proba[:, class_index]
            maxp = weights.max(axis=1)
            confidence = np.clip((maxp - (1 / len(method_names))) / (1 - (1 / len(method_names))), 0, 1)
            weights = best_blend["model"] * weights + best_blend["train_mean"] * train_mean_w + best_blend["uniform"] * uniform_w
            weights = weights / weights.sum(axis=1, keepdims=True)
            forecast = (weights * preds_val).sum(axis=1)
            model_forecasts[name] = forecast
            model_weights[name] = weights
            high_mask = confidence >= 0.15
            results[name] = {
                "forecast_mae": float(mean_absolute_error(val[target_col], forecast)),
                "forecast_ic": spearman_by_year(val.assign(_forecast=forecast), "_forecast", target_col),
                "avg_confidence": float(np.mean(confidence)),
                "high_confidence_rows": int(high_mask.sum()),
                "high_confidence_mae": float(mean_absolute_error(val.loc[high_mask, target_col], forecast[high_mask])) if high_mask.any() else None,
                "blend": best_blend,
                "method_top_share": pd.Series([method_names[i] for i in weights.argmax(axis=1)]).value_counts(normalize=True).to_dict(),
            }
    else:
        results["not_trained"] = {"reason": "Insufficient high-conviction train labels or validation rows", **label_summary}

    lens_portfolio_result, lens_portfolio_w = evaluate_lens_portfolio(train, val, target_col, method_names)
    results["lens_portfolio"] = lens_portfolio_result
    model_weights["lens_portfolio"] = lens_portfolio_w

    reliability_result, reliability_w = evaluate_reliability_router(train, val, target_col, train_mean_w, uniform_w, method_names)
    results["reliability_router"] = reliability_result
    model_weights["reliability_router"] = reliability_w

    baseline = {
        "uniform_forecast_mae": float(mean_absolute_error(val[target_col], uniform_forecast)),
        "uniform_forecast_ic": spearman_by_year(val.assign(_uniform=uniform_forecast), "_uniform", target_col),
        "train_mean_forecast_mae": float(mean_absolute_error(val[target_col], train_mean_forecast)),
        "best_single": best_single,
        "best_single_selection": "lowest train MAE among active horizon methods",
        "best_single_forecast_mae": float(mean_absolute_error(val[target_col], best_single_forecast)),
        "best_single_forecast_ic": spearman_by_year(val.assign(_best=best_single_forecast), "_best", target_col),
        "best_validation_diagnostic_lens": best_validation_lens,
        "best_validation_diagnostic_lens_mae": float(lens_metrics[best_validation_lens]["val_mae"]),
        "best_active_validation_diagnostic_lens": best_active_validation_lens,
        "best_active_validation_diagnostic_lens_mae": float(lens_metrics[best_active_validation_lens]["val_mae"]),
    }
    best_model_name = None
    trained = {k: v for k, v in results.items() if "forecast_mae" in v}
    if trained:
        best_model_name = min(trained, key=lambda key: trained[key]["forecast_mae"])
    best_model = trained.get(best_model_name) if best_model_name else None
    gates = {
        "trained_model_exists": bool(best_model),
        "beats_uniform_mae": bool(best_model and best_model["forecast_mae"] < baseline["uniform_forecast_mae"] - 0.0025),
        "beats_train_mean_mae": bool(best_model and best_model["forecast_mae"] < baseline["train_mean_forecast_mae"] - 0.0025),
        "beats_best_single_mae": bool(best_model and best_model["forecast_mae"] < baseline["best_single_forecast_mae"] - 0.0010),
        "beats_uniform_ic": bool(best_model and np.isfinite(best_model["forecast_ic"]) and best_model["forecast_ic"] > baseline["uniform_forecast_ic"] + 0.01),
        "confidence_is_real": bool(best_model and best_model["high_confidence_rows"] >= 30 and best_model["avg_confidence"] >= 0.05),
    }
    if best_model and best_model.get("method_top_share"):
        shares = pd.Series(best_model["method_top_share"]).sort_values(ascending=False)
        top1 = float(shares.iloc[0])
        top2 = float(shares.head(2).sum())
        hhi = float((shares**2).sum())
        gates["not_collapsed"] = top1 <= 0.35 and top2 <= 0.60 and hhi <= 0.22
    else:
        gates["not_collapsed"] = False

    report = {
        "version": "aurora_local_shadow_v1",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "horizon_years": horizon,
        "target_col": target_col,
        "active_methods": method_names,
        "diagnostic_methods": MODEL_NAMES,
        "point_in_time": True,
        "split": {"train_end_year": TRAIN_END_YEAR, "val_start_year": VAL_START_YEAR, "audit_scope": "train_only"},
        "label_policy": "strict_high_conviction_train_only; val labels diagnostic only",
        "specialized_lens_models": specialized_lens_report,
        "lens_calibration": calibration_report,
        "label_summary": label_summary,
        "lens_metrics": lens_metrics,
        "baselines": baseline,
        "models": results,
        "best_model": best_model_name,
        "gates": gates,
        "production_candidate": bool(all(gates.values())),
    }
    (artifact_dir / f"report_{horizon}y.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    return report


def prepare_horizon_data(featured: pd.DataFrame, horizon: int) -> tuple[pd.DataFrame, dict[str, Any], dict[str, Any]]:
    target_col = f"ann_return_{horizon}y_fwd"
    data = featured.dropna(subset=[target_col]).copy()
    method_cols = [f"pred_{method}" for method in MODEL_NAMES]
    data = data.dropna(subset=method_cols, how="all")
    data, specialized_lens_report = tune_specialized_lens_models(data, target_col)
    train_mask = data["year"] <= TRAIN_END_YEAR
    data, calibration_report = calibrate_lens_predictions(data, train_mask, target_col)
    return data, specialized_lens_report, calibration_report


def write_shadow_marker(artifact_dir: Path, reports: list[dict[str, Any]]) -> None:
    marker = {
        "production_candidate": False,
        "reason": "router remains shadow-only unless all forecast, IC, confidence, and concentration gates pass",
        "use": "diagnostic_only",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "reports": {
            f"{report['horizon_years']}y": {
                "production_candidate": report["production_candidate"],
                "best_model": report["best_model"],
                "gates": report["gates"],
            }
            for report in reports
        },
    }
    (artifact_dir / "SHADOW_DO_NOT_PROMOTE.json").write_text(json.dumps(marker, indent=2, default=str), encoding="utf-8")


def run_ml_shadow(featured: pd.DataFrame, horizons: list[int], timestamp: str) -> dict[str, Any]:
    artifact_dir = ARTIFACT_ROOT / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)
    featured.to_parquet(artifact_dir / "model_panel.parquet", index=False)
    (ARTIFACT_ROOT / "LATEST.txt").write_text(str(artifact_dir), encoding="utf-8")
    reports = [evaluate_router(featured, horizon, artifact_dir) for horizon in horizons]
    write_shadow_marker(artifact_dir, reports)
    summary = {
        "mode": "ml_shadow",
        "artifact_dir": str(artifact_dir),
        "panel_rows": int(len(featured)),
        "tickers": int(featured["ticker"].nunique()),
        "reports": reports,
    }
    (artifact_dir / "summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    return {
        "mode": "ml_shadow",
        "artifact_dir": str(artifact_dir),
        "production_candidates": {f"{report['horizon_years']}y": report["production_candidate"] for report in reports},
        "best_models": {f"{report['horizon_years']}y": report["best_model"] for report in reports},
    }


def run_aurora_spine_v1(featured: pd.DataFrame, timestamp: str, horizon: int = 3) -> dict[str, Any]:
    target_col = f"ann_return_{horizon}y_fwd"
    artifact_dir = SPINE_ARTIFACT_ROOT / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)
    data, specialized_lens_report, calibration_report = prepare_horizon_data(featured, horizon)
    data["spine_regime"] = data.apply(classify_spine_regime, axis=1)
    data["spine_composite"] = data.apply(lambda row: spine_composite_for_row(row, row["spine_regime"]), axis=1)

    val = data.loc[data["year"] >= VAL_START_YEAR].dropna(subset=[target_col, "spine_composite"]).copy()
    latest = data.sort_values(["ticker", "year"]).groupby("ticker", as_index=False).tail(1).copy()
    memos = [aurora_spine_memo(row) for _, row in latest.iterrows()]

    lens_metrics = {}
    for method in ["reverseDcf", "assetValue", "residualIncome", "roicFade", "dcf", "capitalCycle"]:
        col = f"pred_{method}"
        if col in val.columns:
            sub = val[[target_col, col]].dropna()
            lens_metrics[method] = {
                "val_mae": float(mean_absolute_error(sub[target_col], sub[col])) if len(sub) else None,
                "val_ic": spearman_by_year(sub.assign(year=val.loc[sub.index, "year"]), col, target_col) if len(sub) else None,
            }

    spine_gates = {
        "point_in_time_data": bool({"ticker", "year", "asof_date", "price_t0"}.issubset(data.columns)),
        "reverse_dcf_expectations_computed": bool(all("market_implied_expectations" in memo for memo in memos)),
        "regime_assigned": bool(all(memo.get("regime") for memo in memos)),
        "falsifiers_generated": bool(all(len(memo.get("falsifiers", [])) >= 3 for memo in memos)),
        "abstention_allowed": bool(any(memo.get("abstain_from_precise_fair_value") for memo in memos)),
        "supporting_lenses_available": bool(all(len(memo.get("spine_weights", {})) >= 2 for memo in memos)),
    }

    summary = {
        "mode": "spine_v1",
        "version": "aurora_question_memo_v1",
        "production_scope": "memo_output_candidate_not_return_forecast_router",
        "artifact_dir": str(artifact_dir),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "horizon_years": horizon,
        "target_col": target_col,
        "panel_rows": int(len(data)),
        "latest_memos": int(len(memos)),
        "production_candidate": bool(all(spine_gates.values())),
        "product_gates": spine_gates,
        "validation": {
            "rows": int(len(val)),
            "spine_composite_mae": float(mean_absolute_error(val[target_col], val["spine_composite"])) if len(val) else None,
            "spine_composite_ic": spearman_by_year(val, "spine_composite", target_col) if len(val) else None,
            "lens_metrics": lens_metrics,
        },
        "specialized_lens_models": specialized_lens_report,
        "lens_calibration": calibration_report,
        "regime_counts": pd.Series([memo["regime"] for memo in memos]).value_counts().to_dict(),
        "abstention_share": float(np.mean([memo["abstain_from_precise_fair_value"] for memo in memos])) if memos else None,
    }

    (artifact_dir / "spine_memos.jsonl").write_text(
        "\n".join(json.dumps(memo, default=str) for memo in memos) + ("\n" if memos else ""),
        encoding="utf-8",
    )
    pd.DataFrame(memos).to_csv(artifact_dir / "spine_memos_flat.csv", index=False)
    (artifact_dir / "spine_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    (SPINE_ARTIFACT_ROOT / "LATEST.txt").write_text(str(artifact_dir), encoding="utf-8")
    return {
        "mode": "spine_v1",
        "artifact_dir": str(artifact_dir),
        "production_candidate": summary["production_candidate"],
        "validation": summary["validation"],
        "latest_memos": summary["latest_memos"],
    }


def tactical_score(frame: pd.DataFrame) -> pd.Series:
    score = (
        0.45 * frame.get("capital_cycle_proxy_year_z", pd.Series(0.0, index=frame.index)).fillna(0.0)
        + 0.18 * frame.get("fcf_yield_year_z", pd.Series(0.0, index=frame.index)).fillna(0.0)
        + 0.15 * frame.get("operating_margin_year_z", pd.Series(0.0, index=frame.index)).fillna(0.0)
        + 0.12 * frame.get("bottleneck_proxy_year_z", pd.Series(0.0, index=frame.index)).fillna(0.0)
        - 0.18 * frame.get("capex_intensity_year_z", pd.Series(0.0, index=frame.index)).fillna(0.0)
        - 0.10 * frame.get("ev_to_sales_year_z", pd.Series(0.0, index=frame.index)).fillna(0.0)
        - 0.12 * pd.to_numeric(frame.get("ret_3y_trailing", pd.Series(0.0, index=frame.index)), errors="coerce").fillna(0.0).clip(-0.50, 1.50)
    )
    return score.replace([np.inf, -np.inf], np.nan)


def tactical_decile_metrics(frame: pd.DataFrame, score_col: str, target_col: str) -> dict[str, Any]:
    rows = []
    for year, sub in frame.dropna(subset=[score_col, target_col]).groupby("year"):
        if len(sub) < 30:
            continue
        ordered = sub.sort_values(score_col)
        n = max(3, len(ordered) // 10)
        bottom = ordered.head(n)
        top = ordered.tail(n)
        rows.append({
            "year": int(year),
            "rows": int(len(sub)),
            "top_decile_return": float(top[target_col].mean()),
            "bottom_decile_return": float(bottom[target_col].mean()),
            "decile_spread": float(top[target_col].mean() - bottom[target_col].mean()),
            "top_beats_year_average": bool(top[target_col].mean() > sub[target_col].mean()),
            "bottom_underperforms_year_average": bool(bottom[target_col].mean() < sub[target_col].mean()),
            "top_downside_rate": float((top[target_col] < 0).mean()),
            "bottom_downside_rate": float((bottom[target_col] < 0).mean()),
        })
    if not rows:
        return {"by_year": [], "summary": {}}
    table = pd.DataFrame(rows)
    return {
        "by_year": rows,
        "summary": {
            "mean_decile_spread": float(table["decile_spread"].mean()),
            "positive_spread_share": float((table["decile_spread"] > 0).mean()),
            "top_hit_rate": float(table["top_beats_year_average"].mean()),
            "bottom_underperform_rate": float(table["bottom_underperforms_year_average"].mean()),
            "top_downside_rate": float(table["top_downside_rate"].mean()),
            "bottom_downside_rate": float(table["bottom_downside_rate"].mean()),
        },
    }


def run_tactical_1y(featured: pd.DataFrame, timestamp: str) -> dict[str, Any]:
    horizon = 1
    target_col = "ann_return_1y_fwd"
    artifact_dir = TACTICAL_ARTIFACT_ROOT / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)
    data = featured.dropna(subset=[target_col]).copy()
    data["tactical_score"] = tactical_score(data)
    data["capital_cycle_rank"] = data.groupby("year")["tactical_score"].rank(pct=True)
    val = data.loc[data["year"] >= VAL_START_YEAR].dropna(subset=[target_col, "tactical_score"]).copy()

    ic = spearman_by_year(val, "tactical_score", target_col)
    deciles = tactical_decile_metrics(val, "tactical_score", target_col)
    gates = {
        "ic_positive": bool(np.isfinite(ic) and ic > 0),
        "decile_spread_positive": bool(deciles.get("summary", {}).get("mean_decile_spread", 0) > 0),
        "decile_spread_positive_every_year": bool(deciles.get("summary", {}).get("positive_spread_share", 0) == 1.0),
        "top_hit_rate_above_half": bool(deciles.get("summary", {}).get("top_hit_rate", 0) >= 0.50),
        "no_intrinsic_value_claim": True,
    }
    summary = {
        "mode": "tactical_1y",
        "version": "aurora_capital_cycle_lab_v1",
        "production_scope": "tactical_research_lab_not_intrinsic_valuation",
        "artifact_dir": str(artifact_dir),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "horizon_years": horizon,
        "target_col": target_col,
        "rows": int(len(data)),
        "validation_rows": int(len(val)),
        "production_candidate": bool(all(gates.values())),
        "product_gates": gates,
        "metrics": {
            "spearman_ic_by_year": ic,
            "decile_metrics": deciles,
        },
        "objective": "1Y tactical setup / capital-cycle pressure / expectation reset ranking, not intrinsic valuation",
    }
    cols = [
        "ticker", "year", "asof_date", "sector", "industry", target_col,
        "tactical_score", "capital_cycle_rank", "capital_cycle_proxy_year_z",
        "fcf_yield", "operating_margin", "capex_intensity", "ev_to_sales",
        "ret_3y_trailing", "pred_capitalCycle",
    ]
    cols = [col for col in cols if col in data.columns]
    data[cols].to_csv(artifact_dir / "tactical_scores.csv", index=False)
    (artifact_dir / "tactical_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    (TACTICAL_ARTIFACT_ROOT / "LATEST.txt").write_text(str(artifact_dir), encoding="utf-8")
    return {
        "mode": "tactical_1y",
        "artifact_dir": str(artifact_dir),
        "production_candidate": summary["production_candidate"],
        "research_candidate": summary["production_candidate"],
        "metrics": summary["metrics"],
    }


def summarize_product_status(outputs: list[dict[str, Any]]) -> dict[str, Any]:
    by_mode = {output.get("mode"): output for output in outputs}
    spine = by_mode.get("spine_v1")
    tactical = by_mode.get("tactical_1y")
    shadow = by_mode.get("ml_shadow")
    shadow_candidates = shadow.get("production_candidates", {}) if shadow else {}
    primary_candidate = bool(spine and spine.get("production_candidate"))
    all_modules = [primary_candidate]
    if tactical:
        all_modules.append(bool(tactical.get("production_candidate")))
    if shadow_candidates:
        all_modules.extend(bool(value) for value in shadow_candidates.values())
    return {
        "primary_product": "spine_v1",
        "primary_product_candidate": primary_candidate,
        "primary_product_scope": "question memo / expectations / falsifier engine",
        "all_modules_production_candidate": bool(all(all_modules)) if all_modules else False,
        "module_status": {
            "spine_v1": spine.get("production_candidate") if spine else None,
            "tactical_1y": tactical.get("production_candidate") if tactical else None,
            "ml_shadow": shadow_candidates if shadow else None,
        },
        "interpretation": (
            "AURORA spine_v1 can be treated as the product memo candidate. "
            "tactical_1y and ml_shadow remain research/diagnostic modules unless their own gates pass."
        ),
    }


def main() -> None:
    load_env_file()
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-tickers", type=int, default=None)
    parser.add_argument("--force-panel-rebuild", action="store_true")
    parser.add_argument("--horizons", default="1,3")
    parser.add_argument("--mode", choices=["all", "spine_v1", "tactical_1y", "ml_shadow"], default="all")
    parser.add_argument("--api-key", default=None)
    args = parser.parse_args()
    api_key = args.api_key or os.environ.get("FMP_API_KEY") or os.environ.get("FINANCIAL_MODELING_PREP_API_KEY")
    tickers = sorted(set(CORE_UNIVERSE))
    if args.max_tickers:
        tickers = tickers[: args.max_tickers]
    print(f"AURORA local run: mode={args.mode} tickers={len(tickers)} panel_version={PANEL_VERSION} force={args.force_panel_rebuild}")
    panel = build_or_load_panel(api_key, tickers, force=args.force_panel_rebuild)
    featured = add_lens_predictions(add_features(panel))
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    horizons = [int(item.strip()) for item in args.horizons.split(",") if item.strip()]
    outputs = []
    if args.mode in {"all", "spine_v1"}:
        outputs.append(run_aurora_spine_v1(featured, timestamp, horizon=3))
    if args.mode in {"all", "tactical_1y"}:
        outputs.append(run_tactical_1y(featured, timestamp))
    if args.mode in {"all", "ml_shadow"}:
        outputs.append(run_ml_shadow(featured, horizons, timestamp))
    product_status = summarize_product_status(outputs)
    print(json.dumps({
        "mode": args.mode,
        "panel_rows": int(len(featured)),
        "tickers": int(featured["ticker"].nunique()),
        "product_status": product_status,
        "outputs": outputs,
    }, indent=2, default=str))


if __name__ == "__main__":
    main()
