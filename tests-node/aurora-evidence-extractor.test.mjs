import assert from "node:assert/strict";
import test from "node:test";

import { compileAuroraBeliefObject } from "../lib/aurora-belief-compiler.js";
import { evidenceForBeliefCompiler, extractAuroraEvidenceSignals, summarizeAuroraEvidence } from "../lib/aurora-evidence-extractor.js";

const supportiveSemiEvidence = {
  documents: [
    {
      id: "asml-call",
      type: "earnings call",
      source: "company transcript",
      text:
        "Management described multi-year demand visibility supported by a large backlog. The company remains capacity constrained, lead times are long, and customers have accepted disciplined pricing actions. Gross margin expanded due to mix and operating leverage.",
    },
    {
      id: "asml-10k",
      type: "10-K filing",
      source: "SEC",
      text:
        "Internal controls were effective and the company reported no material weakness. Capital discipline remains central to investment decisions and management continues share repurchases.",
    },
  ],
};

test("evidence extractor turns bottleneck language into structured signals", () => {
  const extracted = extractAuroraEvidenceSignals(supportiveSemiEvidence, { extractedAt: "2026-06-29T00:00:00.000Z" });

  assert.equal(extracted.version, "aurora_evidence_extractor_v1");
  assert.equal(extracted.extractedAt, "2026-06-29T00:00:00.000Z");
  assert.ok(extracted.textSignals.pricingPower > 0.6);
  assert.ok(extracted.textSignals.demandVisibility > 0.6);
  assert.ok(extracted.textSignals.capacityConstraint > 0.6);
  assert.ok(extracted.textSignals.accountingTrust > 0.6);
  assert.ok(extracted.textSignals.marginPressure < 0.45);
  assert.ok(extracted.claims.some((claim) => claim.type === "capacity_constraint"));
  assert.ok(extracted.quality.score > 0.7);
});

test("adverse text raises risk flags and weakens demand/pricing evidence", () => {
  const extracted = extractAuroraEvidenceSignals({
    documents: [
      {
        type: "news",
        source: "market report",
        text:
          "The sector faces inventory correction and demand weakness. Price cuts and discounting increased as excess capacity came online. Management warned that gross margin declined due to cost inflation and mix headwind.",
      },
    ],
  });

  assert.ok(extracted.textSignals.marginPressure > 0.6);
  assert.ok(extracted.textSignals.pricingPower < 0.45);
  assert.ok(extracted.textSignals.demandVisibility < 0.45);
  assert.ok(extracted.textSignals.capacityConstraint < 0.45);
  assert.ok(extracted.riskFlags.some((risk) => risk.key === "margin_pressure"));
});

test("accounting warnings lower accounting trust", () => {
  const extracted = extractAuroraEvidenceSignals({
    documents: [
      {
        type: "10-K filing",
        source: "SEC",
        text:
          "The company disclosed a material weakness in internal controls and a restatement of prior financial statements. Management also recorded an impairment during the period.",
      },
    ],
  });

  assert.ok(extracted.textSignals.accountingTrust < 0.45);
  assert.ok(extracted.riskFlags.some((risk) => risk.key === "accounting_quality"));
});

test("compiler evidence shape plugs into belief compiler and supports bottleneck lens", () => {
  const evidence = evidenceForBeliefCompiler(supportiveSemiEvidence);
  const compiled = compileAuroraBeliefObject({
    company: {
      ticker: "ASML",
      name: "ASML Holding NV",
      sector: "Technology",
      industry: "Semiconductor equipment",
    },
    market: { price: 800, beta: 1.12 },
    macro: { riskFreeRate: 0.044, equityRiskPremium: 0.052, inflation: 0.024 },
    financials: {
      incomeStatements: [
        { date: "2021-12-31", revenue: 180, ebit: 52 },
        { date: "2022-12-31", revenue: 210, ebit: 63 },
        { date: "2023-12-31", revenue: 250, ebit: 76 },
        { date: "2024-12-31", revenue: 300, ebit: 93 },
      ],
      balanceSheets: [{ date: "2024-12-31", totalDebt: 18, totalStockholdersEquity: 285, cashAndCashEquivalents: 42 }],
      cashFlows: [{ date: "2024-12-31", operatingCashFlow: 36, capitalExpenditure: -8 }],
    },
    evidence,
  });

  assert.ok(compiled.evidenceSignals.bottleneckPower > 0.7);
  assert.ok(compiled.beliefObject.lensLegitimacy.some((lens) => lens.key === "bottleneck" && lens.legitimacy > 0.5));
});

test("summary exposes strongest signals, claims, and risks", () => {
  const summary = summarizeAuroraEvidence(supportiveSemiEvidence);

  assert.equal(summary.version, "aurora_evidence_summary_v1");
  assert.ok(summary.strongestSignals.length > 0);
  assert.ok(summary.topClaims.length > 0);
  assert.equal(Array.isArray(summary.topRisks), true);
});
