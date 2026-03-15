from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import pandas as pd

from ..utils import performance_summary


EPISODE_PRIORITY = {
    "crash": 0,
    "tightening": 1,
    "qe": 2,
    "mania": 3,
    "easing": 4,
    "normal": 5,
}


@dataclass(frozen=True)
class Episode:
    name: str
    start: pd.Timestamp
    end: pd.Timestamp
    regime: str
    group: str

    def contains(self, date: pd.Timestamp) -> bool:
        return self.start <= date <= self.end


def load_episodes() -> list[Episode]:
    raw_episodes = {
        "crashes": [
            {"name": "1929_crash", "start": "1929-09-01", "end": "1932-06-01", "regime": "crash"},
            {"name": "1987_black_monday", "start": "1987-10-01", "end": "1987-12-01", "regime": "crash"},
            {"name": "2000_dotcom", "start": "2000-03-01", "end": "2002-10-01", "regime": "crash"},
            {"name": "2008_financial_crisis", "start": "2007-10-01", "end": "2009-03-01", "regime": "crash"},
            {"name": "2020_covid", "start": "2020-02-01", "end": "2020-03-31", "regime": "crash"},
        ],
        "manias": [
            {"name": "1990s_tech_mania", "start": "1995-01-01", "end": "2000-03-01", "regime": "mania"},
            {"name": "2005_housing_bubble", "start": "2003-01-01", "end": "2006-12-01", "regime": "mania"},
            {"name": "2017_crypto_mania", "start": "2017-01-01", "end": "2017-12-01", "regime": "mania"},
            {"name": "2020_meme_stocks", "start": "2020-08-01", "end": "2021-02-01", "regime": "mania"},
        ],
        "policy_regimes": [
            {"name": "volcker_tightening", "start": "1979-08-01", "end": "1982-08-01", "regime": "tightening"},
            {"name": "greenspan_put", "start": "1987-11-01", "end": "2006-01-01", "regime": "easing"},
            {"name": "qe1", "start": "2008-11-01", "end": "2010-03-01", "regime": "qe"},
            {"name": "qe2", "start": "2010-11-01", "end": "2011-06-01", "regime": "qe"},
            {"name": "qe3", "start": "2012-09-01", "end": "2014-10-01", "regime": "qe"},
            {"name": "taper_tantrum", "start": "2013-05-01", "end": "2013-09-01", "regime": "tightening"},
            {"name": "covid_qe", "start": "2020-03-01", "end": "2021-11-01", "regime": "qe"},
            {"name": "2022_tightening", "start": "2022-03-01", "end": "2023-07-01", "regime": "tightening"},
        ],
    }
    episodes: list[Episode] = []
    for group, rows in raw_episodes.items():
        for row in rows:
            episodes.append(
                Episode(
                    name=row["name"],
                    start=pd.to_datetime(row["start"]),
                    end=pd.to_datetime(row["end"]),
                    regime=row["regime"],
                    group=group,
                )
            )
    return episodes


def build_daily_regime_frame(dates: Iterable[pd.Timestamp]) -> pd.DataFrame:
    ordered = pd.DatetimeIndex(sorted(pd.to_datetime(list(dates)).unique()))
    episodes = load_episodes()
    rows: list[dict[str, object]] = []
    for date in ordered:
        active = [episode for episode in episodes if episode.contains(date)]
        active = sorted(active, key=lambda episode: (EPISODE_PRIORITY.get(episode.regime, 99), episode.start))
        primary = active[0] if active else None
        rows.append(
            {
                "date": date,
                "regime_label": primary.regime if primary is not None else "normal",
                "episode_name": primary.name if primary is not None else None,
                "episode_group": primary.group if primary is not None else None,
                "active_episodes": "|".join(episode.name for episode in active) if active else None,
                "active_regimes": "|".join(dict.fromkeys(episode.regime for episode in active)) if active else None,
            }
        )
    return pd.DataFrame(rows)


def summarize_performance_by_regime(returns: pd.Series, regime_frame: pd.DataFrame) -> list[dict[str, object]]:
    frame = pd.DataFrame({"date": pd.to_datetime(returns.index), "returns": returns.values}).merge(regime_frame, on="date", how="left")
    summaries: list[dict[str, object]] = []
    for regime, group in frame.groupby("regime_label", dropna=False):
        clean = pd.Series(group["returns"].values, index=pd.to_datetime(group["date"]))
        payload = performance_summary(clean)
        payload.update({"regime": regime or "unknown", "observations": int(len(group))})
        summaries.append(payload)
    return sorted(summaries, key=lambda row: (row["regime"] != "normal", str(row["regime"])))


def summarize_performance_by_episode(returns: pd.Series, regime_frame: pd.DataFrame, *, min_observations: int = 10) -> list[dict[str, object]]:
    frame = pd.DataFrame({"date": pd.to_datetime(returns.index), "returns": returns.values}).merge(regime_frame, on="date", how="left")
    summaries: list[dict[str, object]] = []
    episodes = frame.dropna(subset=["episode_name"]).groupby("episode_name", dropna=False)
    for episode_name, group in episodes:
        if len(group) < min_observations:
            continue
        clean = pd.Series(group["returns"].values, index=pd.to_datetime(group["date"]))
        payload = performance_summary(clean)
        payload.update(
            {
                "episode_name": str(episode_name),
                "episode_group": group["episode_group"].iloc[0],
                "regime": group["regime_label"].iloc[0],
                "start": str(pd.to_datetime(group["date"]).min().date()),
                "end": str(pd.to_datetime(group["date"]).max().date()),
                "observations": int(len(group)),
            }
        )
        summaries.append(payload)
    return sorted(summaries, key=lambda row: row["start"])
