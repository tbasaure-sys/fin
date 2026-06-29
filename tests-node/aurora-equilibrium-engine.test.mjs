import assert from "node:assert/strict";
import test from "node:test";

import { buildAuroraEquilibriumEngine } from "../lib/aurora-equilibrium-engine.js";
import { runAuroraBeliefPipeline } from "../lib/aurora-belief-pipeline.js";

const physicalSnapshot = {
  company: {
    ticker: "SEMI",
    name: "Semiconductor Capacity Co",
    sector: "Technology",
    industry: "Semiconductor equipment",
  },
  productMarket: {
    capacity: 100,
    demand: 118,
    utilization: 0.95,
    inventory: 70,
    normalInventory: 100,
    productPrice: 100,
    marginalCost: 62,
    announcedCapacity: 8,
    leadTimeMonths: 18,
  },
  equityMarket: {
    floatMarketValue: 10000,
    buybacks: 400,
    issuance: 0,
    etfFlows: 120,
    shortPressure: 60,
  },
};

test("equilibrium engine models physical capacity pressure", () => {
  const engine = buildAuroraEquilibriumEngine(physicalSnapshot, { builtAt: "2026-06-29T00:00:00.000Z" });

  assert.equal(engine.version, "aurora_equilibrium_engine_v1");
  assert.equal(engine.builtAt, "2026-06-29T00:00:00.000Z");
  assert.equal(engine.productMarket.archetype, "physical_capacity");
  assert.ok(engine.productMarket.pricingPressure > 0.1);
  assert.ok(engine.productMarket.constraints.includes("high_utilization"));
  assert.ok(engine.drivers.demandSupply > 0.5);
  assert.ok(engine.drivers.bottleneckPower > 0.45);
});

test("equilibrium engine models SaaS retention and CAC pressure", () => {
  const engine = buildAuroraEquilibriumEngine({
    company: { ticker: "SAAS", sector: "Technology", industry: "Software SaaS" },
    productMarket: {
      customers: 1000,
      arpu: 1200,
      netRevenueRetention: 1.18,
      grossRevenueRetention: 0.9,
      logoChurn: 0.08,
      cacPaybackMonths: 14,
      salesProductivity: 1.2,
    },
  });

  assert.equal(engine.productMarket.archetype, "saas");
  assert.ok(engine.productMarket.revenueRunRate > 0);
  assert.ok(engine.productMarket.pricingPressure > 0);
});

test("equilibrium engine models marketplace balance", () => {
  const engine = buildAuroraEquilibriumEngine({
    company: { ticker: "MKT", sector: "Technology", industry: "Marketplace platform" },
    productMarket: {
      activeUsers: 100,
      transactionsPerUser: 12,
      averageTicket: 50,
      takeRate: 0.18,
      buyerGrowth: 0.22,
      sellerGrowth: 0.08,
    },
  });

  assert.equal(engine.productMarket.archetype, "marketplace");
  assert.equal(engine.productMarket.gmv, 60000);
  assert.equal(engine.productMarket.revenue, 10800);
  assert.ok(engine.productMarket.pricingPressure > 0);
});

test("equilibrium engine models banking capital and funding pressure", () => {
  const engine = buildAuroraEquilibriumEngine({
    company: { ticker: "BANK", sector: "Financial Services", industry: "Bank" },
    productMarket: {
      depositBeta: 0.72,
      loanGrowth: 0.02,
      creditLossRate: 0.035,
      cet1: 0.085,
      rwaGrowth: 0.08,
    },
  });

  assert.equal(engine.productMarket.archetype, "banking");
  assert.ok(engine.productMarket.pricingPressure < 0);
  assert.ok(engine.productMarket.constraints.includes("low_cet1"));
  assert.ok(engine.productMarket.constraints.includes("high_credit_losses"));
});

test("equilibrium engine keeps equity flow pressure separate from product economics", () => {
  const engine = buildAuroraEquilibriumEngine({
    ...physicalSnapshot,
    equityMarket: {
      floatMarketValue: 10000,
      issuance: 900,
      shortPressure: 300,
      buybacks: 0,
      etfFlows: -100,
    },
    financingNeed: 500,
  });

  assert.ok(engine.productMarket.pricingPressure > 0);
  assert.ok(engine.equityMarket.expectedPriceImpact < 0);
  assert.equal(engine.reflexivity.priceHurtsFundamentals, true);
  assert.equal(engine.aggregate.risk, "high_negative_pressure");
});

test("pipeline includes equilibrium and can request equilibrium pressure review", () => {
  const result = runAuroraBeliefPipeline({
    company: { ticker: "REFL", name: "Reflexive Co", sector: "Technology", industry: "Semiconductor equipment" },
    market: { price: 120, beta: 1.2, marketCap: 900 },
    macro: { riskFreeRate: 0.044, equityRiskPremium: 0.052 },
    financials: {
      incomeStatements: [
        { date: "2023-12-31", revenue: 100, ebit: 20 },
        { date: "2024-12-31", revenue: 116, ebit: 24 },
      ],
      balanceSheets: [{ date: "2024-12-31", totalDebt: 400, totalStockholdersEquity: 220, cashAndCashEquivalents: 40 }],
      cashFlows: [{ date: "2024-12-31", operatingCashFlow: 25, capitalExpenditure: -12 }],
    },
    productMarket: {
      capacity: 100,
      demand: 116,
      utilization: 0.94,
      inventory: 80,
      normalInventory: 100,
    },
    equityMarket: {
      floatMarketValue: 1000,
      issuance: 160,
      shortPressure: 80,
      etfFlows: -40,
    },
    financingNeed: 150,
  });

  assert.equal(result.equilibrium.version, "aurora_equilibrium_engine_v1");
  assert.equal(result.decision.state, "equilibrium_pressure_review");
});
