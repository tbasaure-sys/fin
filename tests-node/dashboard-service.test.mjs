import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWorkspaceDashboard } from "../lib/server/normalizers.js";

test("normalizeWorkspaceDashboard returns terminal-ready modules for empty snapshots", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-03-16T01:36:46.568441+00:00",
      overview: {},
      portfolio: {},
      screener: { rows: [] },
      status: { warnings: ["no current allocator payload or cached snapshot is available"], panels: [] },
      risk: { spectral: {} },
      international: {},
      sectors: {},
      forecast: {},
    },
    watchlist: [],
    alerts: [],
    savedViews: [],
  });

  assert.equal(dashboard.workspace_summary.id, "alpha-retail");
  assert.equal(dashboard.module_refs.length, 9);
  assert.equal(dashboard.module_refs[0].id, "portfolio");
  assert.equal(dashboard.module_refs[1].id, "actions");
  assert.equal(dashboard.module_refs[2].title, "Capital Protocol");
  assert.equal(dashboard.modules.actions.title, "Next Best Moves");
  assert.equal(dashboard.modules.command.title, "Capital Protocol");
  assert.ok(dashboard.alerts.length >= 1);
  assert.equal(dashboard.portfolio_state.watchlist_count, 0);
  assert.equal(dashboard.modules.portfolio.holdings[0].ticker, "SGOV");
  assert.equal(dashboard.alpha_briefing.topIdeas[0].symbol, "TSM");
  assert.ok(dashboard.modules.command.supportDependency.length > 0);
});

test("normalizeWorkspaceDashboard uses quote payloads when backend portfolio quotes exist", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-03-16T01:36:46.568441+00:00",
      overview: { recommended_action: "beta_040" },
      portfolio: {
        quotes: [
          { ticker: "SPY", price: 512.4, return_1d: 0.01, source: "fmp_or_fallback" },
          { ticker: "GLD", price: 214.2, return_1d: -0.002, source: "cache" },
        ],
      },
      screener: { rows: [] },
      status: { warnings: [], panels: [] },
      risk: { spectral: {} },
      international: {},
      sectors: {},
      forecast: {},
    },
    watchlist: [],
    alerts: [],
    savedViews: [],
  });

  assert.equal(dashboard.market_ribbon[0].symbol, "SPY");
  assert.equal(dashboard.market_ribbon[1].status, "cache");
  assert.equal(dashboard.workspace_summary.primary_stance, "Keep risk moderate");
});

test("normalizeWorkspaceDashboard builds live next best moves from screener and portfolio data", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      overview: {
        recommended_action: "beta_040",
        selected_hedge: "TLT",
      },
      portfolio: {
        alignment: {
          beta_target: 0.4,
          portfolio_beta: 0.48,
        },
        top_holdings: [
          { ticker: "ASTS", sector: "Technology", upside: -0.4, weight: 0.05 },
          { ticker: "SGOV", sector: "ETF", weight: 0.08 },
          { ticker: "TLT", sector: "ETF", weight: 0.07 },
        ],
        simulation_rank: [
          { ticker: "TSM", suggested_position: 0.025, prob_loss: 0.34 },
          { ticker: "ASTS", suggested_position: 0.01, prob_loss: 0.62 },
        ],
      },
      screener: {
        rows: [
          {
            ticker: "TSM",
            is_current_holding: false,
            suggested_position: 0.025,
            discovery_score: 0.81,
            momentum_6m: 0.22,
            valuation_gap: -0.18,
            thesis_bucket: "quality growth",
          },
          {
            ticker: "ASTS",
            is_current_holding: true,
            discovery_score: 0.24,
            valuation_gap: -0.52,
            thesis_bucket: "special situation",
          },
        ],
      },
      status: { warnings: [], panels: [] },
      risk: { spectral: {} },
      international: {},
      sectors: {},
      forecast: {},
    },
    watchlist: [],
    alerts: [],
    savedViews: [],
    commandHistory: [],
  });

  assert.equal(dashboard.modules.actions.actions[0].ticker, "TSM");
  assert.equal(dashboard.modules.actions.actions[0].sourceLabel, "Live research");
  assert.match(dashboard.modules.actions.actions[0].funding, /TLT|SGOV/);
  assert.equal(dashboard.modules.actions.actions[1].ticker, "ASTS");
  assert.equal(dashboard.modules.actions.actions[2].ticker, "TLT");
  assert.match(dashboard.modules.actions.actions[0].whyNow, /Portfolio risk is/);
  assert.ok(dashboard.modules.actions.actions[0].invalidation);
  assert.ok(dashboard.modules.command.decisionRights);
  assert.ok(dashboard.modules.command.stepDownTrials.length === 3);
});

test("normalizeWorkspaceDashboard prefers backend protocol payload when it exists", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      overview: {
        recommended_action: "beta_040",
      },
      protocol: {
        protocol: "challenge_and_stage",
        protocol_label: "Challenge And Stage",
        trust_score: 0.61,
        trust_state: "Stage",
        decision_rights: "Stage position",
        autonomy_score: 0.49,
        frontier_distance: -0.04,
        recoverability_budget: "Tight",
        support_dependency: {
          passive_flows: 0.33,
          valuation_tolerance: 0.27,
        },
        protective_value: {
          cash: 0.12,
          duration: 0.18,
        },
        step_down_trials: [
          {
            name: "Flow withdrawal",
            shock: "Reduce passive support by 20%",
            autonomy_score: 0.42,
            verdict: "Needs staged response",
          },
        ],
        disproof_sleeve: ["Defensive dividend quality"],
        notes: ["Decision rights are currently stage position."],
      },
      screener: { rows: [] },
      portfolio: {},
      status: { warnings: [], panels: [] },
      risk: { spectral: {} },
      international: {},
      sectors: {},
      forecast: {},
    },
    watchlist: [],
    alerts: [],
    savedViews: [],
  });

  assert.equal(dashboard.modules.command.protocolLabel, "Challenge And Stage");
  assert.equal(dashboard.modules.command.trustState, "Stage");
  assert.equal(dashboard.modules.command.decisionRights, "Stage position");
  assert.equal(dashboard.modules.command.supportDependency[0].label, "Passive Flows");
  assert.equal(dashboard.modules.command.stepDownTrials[0].verdict, "Needs staged response");
});

test("normalizeWorkspaceDashboard filters current holdings out of stock ideas", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      portfolio: {
        top_holdings: [
          { ticker: "ASML", sector: "Technology", weight: 0.04 },
        ],
      },
      screener: {
        source_file: "discovery_screener.csv",
        rows: [
          {
            ticker: "ASML",
            sector: "Technology",
            is_current_holding: true,
            discovery_score: 0.9,
            valuation_gap: -0.2,
            momentum_6m: 0.3,
          },
          {
            ticker: "TSM",
            sector: "Technology",
            is_current_holding: false,
            screen_origin: "discovery",
            discovery_score: 0.8,
            valuation_gap: -0.1,
            momentum_6m: 0.2,
          },
        ],
      },
      status: { warnings: [], panels: [] },
      overview: {},
      risk: { spectral: {} },
      international: {},
      sectors: {},
      forecast: {},
    },
    watchlist: [],
    alerts: [],
    savedViews: [],
  });

  assert.equal(dashboard.modules.scanner.rows[0].ticker, "TSM");
  assert.ok(!dashboard.modules.scanner.rows.some((row) => row.ticker === "ASML"));
  assert.match(dashboard.modules.scanner.insight, /excludes names already sitting in the portfolio/i);
  assert.ok(dashboard.modules.scanner.ideaMap.length >= 1);
  assert.equal(dashboard.modules.scanner.confirmation[0].ticker, "TSM");
});

test("normalizeWorkspaceDashboard exposes explicit edge board lanes", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      overview: {},
      portfolio: {
        top_holdings: [{ ticker: "ASML", sector: "Technology", weight: 0.04 }],
      },
      screener: {
        rows: [
          {
            ticker: "TSM",
            is_current_holding: false,
            screen_origin: "discovery",
            discovery_score: 0.82,
            valuation_gap: -0.12,
            momentum_6m: 0.25,
          },
        ],
      },
      sectors: {
        preferred: [
          { sector: "Semiconductors", score: 0.84, view: "preferred" },
        ],
      },
      international: {
        preferred: [
          { label: "Taiwan", ticker: "TSM", score: 0.78, momentum: 0.25 },
        ],
      },
      risk: {
        spectral: {},
        macro: {
          dollar_return_3m: -0.04,
          gold_commodity_ratio: 1.2,
        },
      },
      status: { warnings: [], panels: [] },
      forecast: {},
    },
    watchlist: [],
    alerts: [],
    savedViews: [],
  });

  assert.equal(dashboard.edge_board.sectors[0].label, "Semiconductors");
  assert.equal(dashboard.edge_board.countries[0].label, "Taiwan");
  assert.equal(dashboard.edge_board.currencies[0].label, "TWD");
  assert.equal(dashboard.edge_board.stocks[0].label, "TSM");
  assert.ok(dashboard.edge_board.stocks[0].expression);
  assert.ok(dashboard.edge_board.stocks[0].support.length >= 2);
  assert.ok(dashboard.edge_board.drilldowns.length >= 4);
});
