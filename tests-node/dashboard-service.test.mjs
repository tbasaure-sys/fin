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
  assert.equal(dashboard.module_refs.length, 4);
  assert.equal(dashboard.module_refs[0].id, "actions");
  assert.equal(dashboard.module_refs[1].id, "command");
  assert.equal(dashboard.module_refs[2].title, "Portfolio");
  assert.equal(dashboard.modules.actions.title, "What to do now");
  assert.equal(dashboard.modules.command.title, "Capital Protocol");
  assert.ok(dashboard.alerts.length >= 1);
  assert.equal(dashboard.portfolio_state.watchlist_count, 0);
  assert.equal(dashboard.modules.portfolio.holdings[0].ticker, "SGOV");
  assert.equal(dashboard.alpha_briefing.topIdeas[0].symbol, "TSM");
  assert.ok(dashboard.modules.command.supportDependency.length > 0);
  assert.ok(dashboard.modules.portfolio.charts.growthComparison.length > 0);
  assert.ok(dashboard.modules.portfolio.charts.sectorExposure.length > 0);
  assert.ok(dashboard.modules.portfolio.charts.valuationDistribution.length > 0);
  assert.ok(dashboard.modules.scanner.rows.length > 0);
  assert.ok(dashboard.modules.scanner.ideaMap.length > 0);
  assert.ok(dashboard.modules.risk.signalBars.length > 0);
  assert.equal(dashboard.modules.chile.title, "Chile Desk");
  assert.match(dashboard.data_control.analysisSource, /fallback/i);
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
  assert.match(dashboard.modules.scanner.sourceLabel, /live screener/i);
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

test("normalizeWorkspaceDashboard exposes Chile Desk when chile market payload exists", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-03-16T01:36:46.568441+00:00",
      chile_market: {
        headline: "Chile breadth is constructive, with SQM-B.SN leading the opportunity map.",
        benchmark: { ticker: "^IPSA", price: 7123.4, return_1m: 0.03, return_3m: 0.07 },
        fx: { ticker: "CLP=X", price: 0.00103, return_1m: -0.02 },
        overview: { coverage_count: 12 },
        sector_map: [
          { sector: "Basic Materials", avg_score: 0.72, avg_return_3m: 0.09 },
          { sector: "Financial Services", avg_score: 0.64, avg_return_3m: 0.05 },
        ],
        preferred: [
          { ticker: "SQM-B.SN", sector: "Basic Materials", opportunity_score: 0.74, return_3m: 0.11, quality_score: 0.61, independence_score: 0.58, theme: "Lithium" },
        ],
        rows: [
          { ticker: "SQM-B.SN", sector: "Basic Materials", opportunity_score: 0.74, return_3m: 0.11, quality_score: 0.61, independence_score: 0.58, value_score: 0.52, momentum_score: 0.68, theme: "Lithium" },
          { ticker: "BSANTANDER.SN", sector: "Financial Services", opportunity_score: 0.66, return_3m: 0.07, quality_score: 0.54, independence_score: 0.47, value_score: 0.59, momentum_score: 0.55, theme: "Banking" },
        ],
        leaders: [{ ticker: "SQM-B.SN", sector: "Basic Materials", return_1m: 0.06 }],
        laggards: [{ ticker: "FALABELLA.SN", sector: "Consumer Cyclical", return_1m: -0.04 }],
      },
      screener: { rows: [] },
      portfolio: {},
      status: { warnings: [], panels: [{ name: "chile_market", status: "fresh", stale_days: 0 }] },
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

  assert.equal(dashboard.modules.chile.title, "Chile Desk");
  assert.equal(dashboard.modules.chile.rows[0].ticker, "SQM-B.SN");
  assert.equal(dashboard.modules.chile.benchmarkLabel, "^IPSA");
  assert.ok(dashboard.modules.chile.charts.opportunityMap.length >= 1);
});

test("normalizeWorkspaceDashboard prefers canonical BLS contract data when present", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-03-17T10:00:00.000Z",
      overview: { recommended_action: "beta_040", vix: 24.3 },
      portfolio: {},
      screener: { rows: [] },
      status: { warnings: [], panels: [], contract_status: "canonical" },
      risk: { spectral: {} },
      international: {},
      sectors: {},
      forecast: {},
      bls_state_v1: {
        contract_version: "state_contract_v1",
        model_version: "bls_state_v1.0",
        as_of: "2026-03-17",
        portfolio_id: "default",
        horizon_days: 20,
        measured_state: {
          market_effective_dimension: 4.2,
          market_dominance_share: 0.62,
          market_compression: 0.71,
          breadth: 0.33,
          median_pairwise_corr: 0.58,
          portfolio_hhi: 0.14,
          portfolio_factor_dimension: 2.2,
          portfolio_fragility_exposure: 0.66,
          portfolio_liquidity_buffer: 0.18,
          portfolio_drawdown: -0.12,
          benchmark_drawdown: -0.09,
          macro_vix: 24.3,
        },
        probabilistic_state: {
          horizon_days: 20,
          p_structural_dominance: 0.78,
          p_regime_shock_dominance: 0.31,
          cluster_type: "G-dominated",
          p_visible_correction: 0.57,
          p_structural_restoration: 0.29,
          p_phantom_rebound: 0.40,
          p_portfolio_recoverability: 0.46,
          p_extreme_drawdown: 0.18,
          authority_score: 0.52,
        },
        policy_state: {
          mode: "observe",
          max_gross_add: 0.04,
          max_single_name_add: 0.01,
          hedge_floor: 0.06,
          allowed_sleeves: ["defensive_compounders"],
          forbidden_sleeves: ["crowded_optional_high_beta"],
          review_cadence: "48h",
          rebalance_delay: "1d",
          required_confirmation: "breadth_up_and_dom_down",
          invalidation_rules: ["p_portfolio_recoverability_below_0_42"],
        },
        repair_candidates: [
          {
            id: "repair_01",
            trade_set: ["trim NAME_A 1.5%", "add NAME_B 1.0%", "add hedge 0.5%"],
            delta_recoverability: 0.07,
            delta_phantom: -0.05,
            delta_extreme_drawdown: -0.03,
            repair_efficiency: 1.42,
            classification: "real_repair",
            binding_constraints: ["single_name_cap"],
            funding_source: "NAME_A",
            invalidation: ["authority falls below 0.45"],
          },
        ],
        analogs: [
          {
            analog_id: "analog_01",
            as_of: "2024-08-01",
            distance: 0.11,
            cluster_type: "G-dominated",
            p_visible_correction_realized: 0.58,
            p_structural_restoration_realized: 0.34,
            days_to_visible_correction: 12,
            days_to_structural_restoration: 45,
            max_drawdown_from_state: -0.14,
            summary_tags: ["tight-breadth"],
          },
        ],
        uncertainty: {
          calibration_component: 0.63,
          coverage_component: 0.52,
          stability_component: 0.68,
          data_component: 0.91,
          evidence_tier: "beta",
          model_version: "bls_state_v1.0",
          contract_version: "state_contract_v1",
        },
      },
    },
    watchlist: [],
    alerts: [],
    savedViews: [],
  });

  assert.equal(dashboard.contract_status, "canonical");
  assert.equal(dashboard.modules.risk.clusterDecomposition.dominant, "G-dominated");
  assert.equal(dashboard.modules.risk.reboundConfidence.state, "Conditional");
  assert.equal(dashboard.modules.spectral.reboundQuality.state, "Palliative");
  assert.equal(dashboard.modules.command.protocolLabel, "Observe now");
  assert.equal(dashboard.modules.actions.actions[0].sourceLabel, "Canonical contract");
});
