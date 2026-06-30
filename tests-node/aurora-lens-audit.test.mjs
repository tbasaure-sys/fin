import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraLabelFactory, buildAuroraLensAudit } from "../lib/aurora-lens-audit.js";

function makeRows() {
  return [
    {
      ticker: "BOTT1",
      year: 2020,
      sector: "Semiconductors",
      regime: "bottleneck",
      targetReturn: 0.22,
      pred_dcf: 0.12,
      pred_roicFade: 0.18,
      pred_bottleneck: 0.215,
      pred_assetValue: 0.04,
    },
    {
      ticker: "BOTT2",
      year: 2021,
      sector: "Semiconductors",
      regime: "bottleneck",
      targetReturn: 0.18,
      pred_dcf: 0.1,
      pred_roicFade: 0.16,
      pred_bottleneck: 0.19,
      pred_assetValue: 0.03,
    },
    {
      ticker: "QUAL1",
      year: 2021,
      sector: "Software",
      regime: "quality_compounder",
      targetReturn: 0.13,
      pred_dcf: 0.11,
      pred_roicFade: 0.132,
      pred_bottleneck: 0.125,
      pred_assetValue: 0.02,
    },
    {
      ticker: "ASSET1",
      year: 2022,
      sector: "Energy",
      regime: "asset_heavy",
      targetReturn: -0.04,
      pred_dcf: 0.07,
      pred_roicFade: 0.05,
      pred_bottleneck: -0.01,
      pred_assetValue: -0.035,
    },
    {
      ticker: "MUSHY",
      year: 2022,
      sector: "Industrials",
      regime: "balanced",
      targetReturn: 0.052,
      pred_dcf: 0.05,
      pred_roicFade: 0.049,
      pred_bottleneck: 0.054,
      pred_assetValue: 0.048,
    },
  ];
}

test("AURORA lens audit ranks differentiated lenses and exposes cuts", () => {
  const audit = buildAuroraLensAudit(makeRows(), {
    lensKeys: ["dcf", "roicFade", "bottleneck", "assetValue"],
    minRows: 5,
    minHighConvictionShare: 0.4,
    maxBestLensShare: 0.7,
    minPositiveIc: 0,
  });

  assert.equal(audit.version, "aurora_lens_audit_v1");
  assert.equal(audit.rowCount, 5);
  assert.equal(audit.rankedByMae[0].key, "bottleneck");
  assert.ok(audit.metrics.bottleneck.mae < audit.metrics.dcf.mae);
  assert.ok(audit.byYear["2021"].rows >= 2);
  assert.ok(audit.bySector.Semiconductors.rows >= 2);
  assert.ok(audit.byRegime.bottleneck.rows >= 2);
  assert.equal(audit.gates.enoughRows, true);
  assert.equal(audit.gates.lensForecastsPresent, true);
});

test("AURORA label factory creates high-conviction and indeterminate labels", () => {
  const labels = buildAuroraLabelFactory(makeRows(), {
    lensKeys: ["dcf", "roicFade", "bottleneck", "assetValue"],
    minErrorMargin: 0.015,
    regretTemperature: 0.04,
  });

  const byTicker = Object.fromEntries(labels.labels.map((row) => [row.ticker, row]));
  assert.equal(byTicker.BOTT1.label, "bottleneck");
  assert.equal(byTicker.ASSET1.label, "assetValue");
  assert.equal(byTicker.MUSHY.label, "indeterminate");
  assert.ok(byTicker.BOTT1.reliability.bottleneck > byTicker.BOTT1.reliability.dcf);
  assert.ok(labels.summary.highConvictionShare >= 0.4);
  assert.ok(labels.summary.indeterminateShare > 0);
});

test("AURORA lens audit blocks residual training when labels are mushy", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    ticker: `FLAT${index}`,
    year: 2020 + (index % 3),
    sector: "Mixed",
    regime: "balanced",
    targetReturn: 0.05 + index * 0.001,
    pred_dcf: 0.05,
    pred_roicFade: 0.0505,
    pred_bottleneck: 0.0495,
    pred_assetValue: 0.0502,
  }));
  const audit = buildAuroraLensAudit(rows, {
    lensKeys: ["dcf", "roicFade", "bottleneck", "assetValue"],
    minRows: 10,
    minHighConvictionShare: 0.25,
  });

  assert.equal(audit.gates.enoughRows, true);
  assert.equal(audit.gates.enoughHighConvictionLabels, false);
  assert.equal(audit.readyForResidualTraining, false);
  assert.ok(audit.labelFactory.summary.indeterminateShare > 0.5);
});
