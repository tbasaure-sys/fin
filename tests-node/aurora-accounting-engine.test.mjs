import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraAccountingEngine } from "../lib/aurora-accounting-engine.js";
import { compileAuroraBeliefObject } from "../lib/aurora-belief-compiler.js";
import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";

const softwareSnapshot = {
  company: {
    ticker: "SOFT",
    name: "Software Compounder",
    sector: "Technology",
    industry: "Software",
  },
  market: { price: 120 },
  financials: {
    incomeStatements: [
      { date: "2020-12-31", revenue: 700, ebit: 120, researchAndDevelopmentExpenses: 90 },
      { date: "2021-12-31", revenue: 820, ebit: 140, researchAndDevelopmentExpenses: 105 },
      { date: "2022-12-31", revenue: 960, ebit: 160, researchAndDevelopmentExpenses: 120 },
      { date: "2023-12-31", revenue: 1120, ebit: 190, researchAndDevelopmentExpenses: 145 },
      { date: "2024-12-31", revenue: 1300, ebit: 220, researchAndDevelopmentExpenses: 170 },
    ],
    balanceSheets: [
      {
        date: "2024-12-31",
        totalDebt: 160,
        totalStockholdersEquity: 900,
        cashAndCashEquivalents: 220,
        goodwill: 180,
        operatingLeaseLiability: 45,
      },
    ],
    cashFlows: [
      {
        date: "2024-12-31",
        operatingCashFlow: 310,
        capitalExpenditure: -55,
        stockBasedCompensation: 65,
      },
    ],
  },
};

test("accounting engine capitalizes R&D and keeps SBC as economic cost", () => {
  const accounting = buildAuroraAccountingEngine(softwareSnapshot, { taxRate: 0.22 });

  assert.equal(accounting.version, "aurora_accounting_engine_v1");
  assert.equal(accounting.policy.rdLifeYears, 5);
  assert.ok(accounting.adjustments.rdAsset > 0);
  assert.ok(accounting.adjustments.rdAmortization > 0);
  assert.ok(accounting.economic.adjustedEbit > accounting.reported.ebit);
  assert.equal(accounting.adjustments.sbcEconomicCost, 65);
  assert.ok(accounting.economic.adjustedInvestedCapital > accounting.reported.investedCapital);
  assert.ok(Number.isFinite(accounting.economic.adjustedRoic));
  assert.equal(accounting.drivers.roic, accounting.economic.adjustedRoic);
});

test("accounting engine can disable R&D capitalization by policy", () => {
  const accounting = buildAuroraAccountingEngine(softwareSnapshot, {
    capitalizeResearchAndDevelopment: false,
    taxRate: 0.22,
  });

  assert.equal(accounting.adjustments.rdAsset, 0);
  assert.equal(accounting.adjustments.rdAmortization, 0);
  assert.equal(accounting.economic.adjustedEbit, accounting.reported.ebit);
});

test("compiler prefers accounting drivers before reported ratios", () => {
  const accounting = buildAuroraAccountingEngine(softwareSnapshot);
  const compiled = compileAuroraBeliefObject({
    ...softwareSnapshot,
    accounting,
  });

  assert.equal(compiled.accounting.version, "aurora_accounting_engine_v1");
  assert.equal(compiled.drivers.roic, accounting.drivers.roic);
  assert.equal(compiled.drivers.margin, accounting.drivers.margin);
  assert.equal(compiled.sourceLineage.roic.source, "accounting engine adjusted ROIC");
  assert.equal(compiled.sourceLineage.baseFcf.source, "accounting engine adjusted free cash flow");
});

test("manual driver overrides still win over accounting engine values", () => {
  const accounting = buildAuroraAccountingEngine(softwareSnapshot);
  const compiled = compileAuroraBeliefObject({
    ...softwareSnapshot,
    accounting,
    drivers: {
      roic: 0.42,
    },
  });

  assert.equal(compiled.drivers.roic, 0.42);
  assert.equal(compiled.sourceLineage.roic.override, true);
  assert.equal(compiled.sourceLineage.roic.rawSource, "accounting engine adjusted ROIC");
});

test("pipeline includes accounting engine output and compiles from economic drivers", () => {
  const result = runAuroraBeliefPipeline({
    ...softwareSnapshot,
    documents: [
      {
        type: "10-K filing",
        source: "SEC",
        text: "Internal controls were effective and management emphasized capital discipline.",
      },
    ],
  });

  assert.equal(result.accounting.version, "aurora_accounting_engine_v1");
  assert.equal(result.compiled.accounting.version, "aurora_accounting_engine_v1");
  assert.equal(result.compiled.drivers.roic, result.accounting.drivers.roic);
});
