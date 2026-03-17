from pathlib import Path
import zipfile

from meta_alpha_allocator.chile.xbrl import load_local_xbrl_fundamentals
from meta_alpha_allocator.config import PathConfig
import pandas as pd


SAMPLE_XBRL = """<?xml version="1.0" encoding="UTF-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2021-03-24/ifrs-full">
  <xbrli:context id="c_instant">
    <xbrli:entity><xbrli:identifier scheme="http://example.com">TEST</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:context id="c_duration">
    <xbrli:entity><xbrli:identifier scheme="http://example.com">TEST</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <ifrs-full:CashAndCashEquivalents contextRef="c_instant">1200</ifrs-full:CashAndCashEquivalents>
  <ifrs-full:Revenue contextRef="c_duration">10000</ifrs-full:Revenue>
  <ifrs-full:ProfitLoss contextRef="c_duration">900</ifrs-full:ProfitLoss>
  <ifrs-full:Equity contextRef="c_instant">5000</ifrs-full:Equity>
  <ifrs-full:Liabilities contextRef="c_instant">3000</ifrs-full:Liabilities>
</xbrli:xbrl>
"""


def test_load_local_xbrl_fundamentals_reads_zip_instances(tmp_path: Path) -> None:
    raw_dir = tmp_path / "artifacts" / "chile" / "xbrl" / "raw"
    raw_dir.mkdir(parents=True)
    zip_path = raw_dir / "falabella_sample.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("falabella_2025.xbrl", SAMPLE_XBRL)

    universe = pd.DataFrame(
        [
            {
                "ticker": "FALABELLA.SN",
                "name": "Falabella",
                "sector": "Consumer Cyclical",
                "theme": "Retail",
                "cmf_aliases": "falabella",
            }
        ]
    )
    paths = PathConfig(project_root=tmp_path, artifact_root=tmp_path / "artifacts", output_root=tmp_path / "output")

    frame = load_local_xbrl_fundamentals(paths, universe)

    assert not frame.empty
    row = frame.iloc[0]
    assert row["ticker"] == "FALABELLA.SN"
    assert row["xbrl_cash"] == 1200
    assert row["xbrl_revenue"] == 10000
    assert row["xbrl_net_income"] == 900
    assert round(row["xbrl_margin"], 4) == 0.09
