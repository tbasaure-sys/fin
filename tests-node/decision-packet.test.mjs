import test from "node:test";
import assert from "node:assert/strict";

import { buildDecisionPacket } from "../lib/server/decision-packet.js";

test("buildDecisionPacket answers the six v2 workspace questions", () => {
  const packet = buildDecisionPacket({
    workspace_summary: {
      id: "alpha-retail",
      last_updated: "2026-05-31T20:00:00.000Z",
      market_data_label: "May 31, 2026",
    },
    state_summary: {
      stance: "Wait before adding broad risk",
      decisionSummary: "Cash is available, but hidden overlap is still the binding constraint.",
      evidenceStrength: "Usable",
      mainRisk: "Repeated growth and rates exposure",
    },
    personal_finance: {
      inputs: {
        monthlyIncome: 10000,
        fixedExpenses: 3500,
        variableExpenses: 1800,
        safetyBuffer: 1000,
        targetMonthlyInvestment: 2500,
        baseCurrency: "USD",
      },
      metrics: {
        monthlyInvestable: 3700,
        targetCoverage: 1.48,
      },
    },
    modules: {
      portfolio: {
        analytics: {
          holdingsCount: 6,
        },
        holdings: [
          { ticker: "AAPL", weight: "20%" },
          { ticker: "MSFT", weight: "18%" },
          { ticker: "NVDA", weight: "16%" },
        ],
      },
      risk: {
        clusterDecomposition: {
          dominantLabel: "Mega-cap growth concentration",
        },
      },
    },
    xray: {
      holdingsCount: 6,
      recoveryShare: "42%",
      fragileShare: "38%",
      concentration: {
        topFive: "72%",
      },
      carriers: [
        { ticker: "AAPL" },
        { ticker: "MSFT" },
        { ticker: "NVDA" },
      ],
    },
    recoverability_balance_sheet: {
      phantomTax: "31%",
      netFreedom: "44%",
      repairNote: "Review overlap before adding similar risk.",
    },
    confidence_panel: {
      confidenceBand: "Usable",
      disproofConditions: ["Real diversification improves."],
    },
    primary_action: {
      id: "action-review-risk",
      title: "Review biggest risk",
      summary: "Confirm whether new money would repeat an existing bet.",
    },
    secondary_actions: [
      {
        id: "action-research-tsm",
        ticker: "TSM",
        title: "Investigate TSM",
        summary: "Quality candidate, but check portfolio fit first.",
      },
    ],
  });

  assert.equal(packet.schemaVersion, "decision_packet.v1");
  assert.equal(packet.workspaceId, "alpha-retail");
  assert.equal(packet.status, "current");
  assert.equal(packet.headline.title, "Review biggest risk");
  assert.equal(packet.answers.canInvest.status, "allowed");
  assert.equal(packet.answers.biggestRisk.dominantRisk, "Mega-cap growth concentration");
  assert.equal(packet.answers.diversification.status, "overstated");
  assert.equal(packet.answers.opportunities.count, 2);
  assert.match(packet.answers.wrongness.couldBeWrongIf, /Real diversification/i);
  assert.ok(packet.changedSinceLastTime.length >= 3);
  assert.ok(packet.audit.inputSnapshotHash);
});

test("buildDecisionPacket gives useful setup guidance when money and holdings are missing", () => {
  const packet = buildDecisionPacket({
    workspace_summary: {
      id: "empty-workspace",
      last_updated: "2026-05-31T20:00:00.000Z",
    },
    state_summary: {
      stance: "Workspace needs setup",
      decisionSummary: "Add a money plan and positions to unlock the full brief.",
      evidenceStrength: "Weak",
    },
    personal_finance: {
      inputs: {},
      metrics: {},
    },
    modules: {
      portfolio: {
        holdings: [],
      },
    },
  });

  assert.equal(packet.answers.canInvest.status, "setup_needed");
  assert.equal(packet.answers.biggestRisk.status, "setup_needed");
  assert.equal(packet.answers.diversification.status, "setup_needed");
  assert.equal(packet.recommendation.confidence, "weak");
  assert.equal(packet.actions.primary.status, "review");
});
