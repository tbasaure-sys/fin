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
  assert.equal(dashboard.modules.actions.title, "Next Best Moves");
  assert.ok(dashboard.alerts.length >= 1);
  assert.equal(dashboard.portfolio_state.watchlist_count, 0);
  assert.equal(dashboard.modules.portfolio.holdings[0].ticker, "SGOV");
  assert.equal(dashboard.alpha_briefing.topIdeas[0].symbol, "TSM");
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
});
