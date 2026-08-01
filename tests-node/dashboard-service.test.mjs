import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWorkspaceDashboard } from "../lib/server/normalizers.js";

test("an empty workspace explains that no other user's portfolio is being shown", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "empty-user",
    snapshot: {
      generated_at: "2026-07-20T12:00:00.000Z",
      overview: {},
      portfolio: {
        holdings: [],
        holdings_source: "workspace_portfolio_empty",
        holdings_source_label: "Sin cartera confirmada",
        holdings_source_available: false,
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

  assert.equal(dashboard.modules.portfolio.holdingsSource.connected, false);
  assert.match(dashboard.modules.portfolio.holdingsSource.detail, /no hay una cartera confirmada/i);
  assert.ok(dashboard.data_control.notes.some((note) => /no se muestran posiciones ni métricas de otro usuario/i.test(note)));
});

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
  assert.equal(dashboard.module_refs.length, 2);
  assert.equal(dashboard.module_refs[0].id, "actions");
  assert.equal(dashboard.module_refs[1].id, "command");
  assert.equal(dashboard.modules.actions.title, "Current guidance");
  assert.equal(dashboard.modules.command.title, "Decision Rules");
  assert.ok(dashboard.alerts.length >= 1);
  assert.equal(dashboard.portfolio_state.watchlist_count, 0);
  assert.equal(dashboard.modules.portfolio.holdings.length, 0);
  assert.equal(dashboard.alpha_briefing.topIdeas.length, 0);
  assert.ok(dashboard.modules.command.supportDependency.length > 0);
  assert.equal(dashboard.modules.portfolio.charts.growthComparison.length, 0);
  assert.equal(dashboard.modules.portfolio.charts.sectorExposure.length, 0);
  assert.equal(dashboard.modules.portfolio.charts.valuationDistribution.length, 0);
  assert.equal(dashboard.modules.scanner.rows.length, 0);
  assert.equal(dashboard.modules.scanner.ideaMap.length, 0);
  assert.equal(dashboard.modules.risk.signalBars.length, 0);
  assert.match(dashboard.data_control.analysisSource, /latest completed session/i);
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
  assert.equal(dashboard.workspace_summary.primary_stance, "Stay measured");
});

test("normalizeWorkspaceDashboard drops zero gaps from portfolio performance history", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-06-16T12:00:00.000Z",
      overview: {},
      portfolio: {
        holdings: [{ ticker: "SPY", weight: 1, market_value_usd: 10000 }],
        current_mix_vs_spy: [
          { date: "2026-06-01", portfolio_growth: 1, spy_growth: 1 },
          { date: "2026-06-02", portfolio_growth: 0, spy_growth: 0 },
          { date: "2026-06-03", portfolio_growth: 1.04, spy_growth: 1.01 },
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

  const chart = dashboard.modules.portfolio.charts.growthComparison;
  assert.equal(chart.length, 2);
  assert.deepEqual(chart.map((row) => row.date), ["2026-06-01", "2026-06-03"]);
  assert.ok(chart.every((row) => row.portfolio > 0 && row.benchmark > 0));
  assert.equal(dashboard.modules.portfolio.analytics.totalReturnLabel, "Historial corto");
});

test("normalizeWorkspaceDashboard hides suspicious alternating portfolio performance history", () => {
  const currentMix = Array.from({ length: 32 }, (_, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    portfolio_growth: index % 2 === 0 ? 1 : 1.24,
    spy_growth: 1 + (index * 0.001),
  }));

  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-07-06T12:00:00.000Z",
      overview: {},
      portfolio: {
        analytics: {
          "Total return incl. dividends": 0.12,
          "Total P&L incl. realized/dividends": 1200,
          "Active cost basis": 10000,
        },
        holdings: [{ ticker: "SPY", weight: 1, market_value_usd: 11200 }],
        current_mix_vs_spy: currentMix,
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

  const portfolioModule = dashboard.modules.portfolio;

  assert.equal(portfolioModule.analytics.hasPerformanceHistory, false);
  assert.equal(portfolioModule.analytics.performanceSeriesWarning, "suspicious_alternating_snapshots");
  assert.equal(portfolioModule.analytics.totalReturnLabel, "Historial corto");
  assert.equal(portfolioModule.analytics.totalReturnInclDividends, 0.12);
  assert.ok(portfolioModule.charts.growthComparison.every((row) => row.portfolio === null));
});

test("normalizeWorkspaceDashboard preserves portfolio manager fields for the workspace", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-06-16T12:00:00.000Z",
      overview: {},
      portfolio: {
        holdings_source: "local_overlay",
        analytics: {
          "Total return incl. dividends": 0.319,
          "Total P&L incl. realized/dividends": 1967.74,
          "Active cost basis": 6167.95,
        },
        holdings: [
          {
            ticker: "NBIS",
            google_finance_ticker: "NASDAQ:NBIS",
            company: "Nebius Group",
            theme: "AI infrastructure / cloud",
            sector: "Technology",
            region: "Europe / global",
            currency: "USD",
            quantity: 2.05,
            avg_cost_usd: 83.55,
            dividends_received_usd: 0,
            analysis_value_usd: 475.76,
            broker_value_usd: 475.76,
            broker_total_gain_usd: 303.75,
            broker_day_gain_usd: 4.25,
            broker_day_pct: 0.009,
            value_source: "Broker snapshot",
            market_cap_usd: 12_400_000_000,
            pe_ratio: 18.6,
            eps: 2.14,
            quality_score: 3,
            risk_score: 5,
            analyst_thesis: "High-beta AI infrastructure exposure.",
            current_action: "Watch sizing",
            weight: 0.059,
          },
        ],
        transactions: [
          {
            source: "Trade confirmation",
            trade_date: "2026-06-10",
            ticker: "NBIS",
            action: "Buy",
            shares: 2.05,
            price: 83.55,
            amount_usd: 171.28,
            notes: "Statement baseline.",
          },
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

  const holding = dashboard.modules.portfolio.holdings[0];
  assert.equal(holding.company, "Nebius Group");
  assert.equal(holding.googleFinanceTicker, "NASDAQ:NBIS");
  assert.equal(holding.theme, "AI infrastructure / cloud");
  assert.equal(holding.region, "Europe / global");
  assert.equal(holding.qualityScore, 3);
  assert.equal(holding.riskScore, 5);
  assert.equal(holding.currentAction, "Watch sizing");
  assert.equal(holding.thesis, "High-beta AI infrastructure exposure.");
  assert.equal(holding.dayReturnLabel, "+0.9%");
  assert.equal(holding.analysisValueUsd, 475.76);
  assert.equal(holding.valueSource, "Broker snapshot");
  assert.equal(holding.marketCapUsd, 12_400_000_000);
  assert.equal(holding.peRatio, 18.6);
  assert.equal(holding.eps, 2.14);
  assert.equal(holding.totalPnlInclDividendsUsd, 303.75);
  assert.equal(holding.totalReturnInclDividendsLabel, "+177.3%");
  assert.equal(dashboard.modules.portfolio.transactions[0].action, "Buy");
  assert.equal(dashboard.modules.portfolio.analytics.totalReturnInclDividends, 0.319);
});

test("normalizeWorkspaceDashboard derives honest P&L and return from holding cost basis", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "cost-basis-user",
    snapshot: {
      generated_at: "2026-07-20T12:00:00.000Z",
      overview: {},
      portfolio: {
        holdings_source: "ui_editable_overlay",
        analytics: {
          "Holdings Count": 2,
          "Current Value": 2300,
          "Cost Basis": 2000,
          "Unrealized Return": 0.15,
        },
        holdings: [
          {
            ticker: "AAPL",
            quantity: 10,
            avg_cost_usd: 100,
            market_value_usd: 1500,
            weight: 1500 / 2300,
          },
          {
            ticker: "MSFT",
            quantity: 5,
            avg_cost_usd: 200,
            market_value_usd: 800,
            weight: 800 / 2300,
          },
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

  const portfolio = dashboard.modules.portfolio;
  assert.equal(portfolio.holdings[0].costBasisUsd, 1000);
  assert.equal(portfolio.holdings[0].unrealizedPnlUsd, 500);
  assert.equal(portfolio.holdings[1].unrealizedPnlUsd, -200);
  assert.equal(portfolio.analytics.activeCostBasisUsd, 2000);
  assert.equal(portfolio.analytics.unrealizedPnlUsd, 300);
  assert.equal(portfolio.analytics.totalPnlInclRealizedDividendsUsd, 300);
  assert.equal(portfolio.analytics.totalReturnInclDividends, 0.15);
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
  assert.equal(dashboard.modules.actions.actions[0].sourceLabel, "Filtro vivo");
  assert.match(dashboard.modules.actions.actions[0].funding, /TLT|SGOV/);
  assert.equal(dashboard.modules.actions.actions[1].ticker, "ASTS");
  assert.equal(dashboard.modules.actions.actions[2].ticker, "TLT");
  assert.match(dashboard.modules.actions.actions[0].whyNow, /riesgo de la cartera/i);
  assert.match(dashboard.modules.actions.actions[0].watchFor, /indicador cuantitativo|señal del filtro/i);
  assert.doesNotMatch(
    `${dashboard.modules.actions.actions[0].whyNow} ${dashboard.modules.actions.actions[0].watchFor}`,
    /fair value|valor razonable|precio objetivo/i,
  );
  assert.ok(dashboard.modules.actions.actions[0].invalidation);
  assert.ok(dashboard.modules.command.decisionRights);
  assert.ok(dashboard.modules.command.stepDownTrials.length === 3);
  assert.equal(dashboard.primary_action.ticker, "TSM");
  assert.equal(dashboard.secondary_actions[0].ticker, "ASTS");
  assert.equal(dashboard.state_summary.stance, "Stay measured");
  assert.ok(dashboard.evidence_drawer.headline);
  assert.equal(dashboard.escrow.items.length, 0);
  assert.ok(dashboard.memory.weeklyBrief.length > 0);
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
  const stockEvidence = [
    dashboard.edge_board.stocks[0].note,
    ...dashboard.edge_board.stocks[0].support,
  ].join(" ");
  assert.doesNotMatch(stockEvidence, /confirmed by|value gap|valuation gap/i);
  assert.match(stockEvidence, /quantitative filter|screening signal/i);
  assert.match(stockEvidence, /not (?:a )?traced valuation/i);
  assert.ok(dashboard.edge_board.drilldowns.length >= 4);
});

test("normalizeWorkspaceDashboard prefers canonical BLS contract data when present", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-03-17T10:00:00.000Z",
      overview: { recommended_action: "beta_040", vix: 24.3 },
      portfolio: {},
      screener: { rows: [] },
      status: { warnings: [], panels: [], contract_status: "canonical_valid" },
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
          source: "research_artifact_neighbors_v1",
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
          authority: {
            evidence_authority: 0.52,
            hygiene_authority: 0.71,
            authority_policy_gate: 0.52,
            evidence_tier: "beta",
          },
        },
        research_provenance: {
          artifacts: [],
          coverage_ratio: 0.4,
          missing_required: [],
          root_family: "linux_local",
          root_conflict: false,
        },
        status: {
          contract_status: "canonical_valid",
          contract_validation: { valid: true, error_count: 0, errors: [], mode: "warn" },
        },
      },
    },
    watchlist: [],
    alerts: [],
    savedViews: [],
  });

  assert.equal(dashboard.contract_status, "canonical_valid");
  assert.equal(dashboard.stress_mode.topMove.source, "canonical_repair_candidate");
  assert.equal(dashboard.modules.risk.clusterDecomposition.dominant, "G-dominated");
  assert.equal(dashboard.modules.risk.reboundConfidence.state, "Conditional");
  assert.equal(dashboard.modules.spectral.reboundQuality.state, "Palliative");
  assert.equal(dashboard.modules.command.protocolLabel, "Observe Mode");
  assert.equal(dashboard.modules.actions.actions[0].sourceLabel, "Reglas vivas");
});

test("normalizeWorkspaceDashboard derives escrow readiness and memory events for the simplified workspace", () => {
  const snapshot = {
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
      ],
    },
    status: { warnings: [], panels: [] },
    risk: { spectral: {} },
    international: {},
    sectors: {},
    forecast: {},
  };

  const seeded = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot,
    watchlist: [],
    alerts: [],
    savedViews: [],
    commandHistory: [],
    escrowDecisions: [],
    decisionEvents: [],
  });

  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot,
    watchlist: [],
    alerts: [],
    savedViews: [],
    commandHistory: [],
    escrowDecisions: [
      {
        id: "escrow-1",
        actionId: seeded.primary_action.id,
        title: seeded.primary_action.title,
        summary: seeded.primary_action.summary,
        sizeLabel: seeded.primary_action.sizeLabel,
        sizeValue: seeded.primary_action.sizeValue,
        readiness: 0.42,
        status: "staged",
        maturityConditions: ["Breadth improves"],
        invalidationConditions: ["Sponsorship weakens"],
        expiresAt: "2026-03-27T00:00:00.000Z",
      },
    ],
    decisionEvents: [
      {
        id: "decision-1",
        actionId: seeded.primary_action.id,
        title: seeded.primary_action.title,
        userResponse: "staged",
        note: "Moved into escrow.",
        occurredAt: "2026-03-20T12:00:00.000Z",
      },
      {
        id: "decision-2",
        actionId: seeded.primary_action.id,
        title: seeded.primary_action.title,
        userResponse: "deferred",
        note: "Waiting for confirmation.",
        occurredAt: "2026-03-19T12:00:00.000Z",
      },
    ],
  });

  assert.equal(dashboard.escrow.items.length, 1);
  assert.equal(dashboard.escrow.items[0].status, "ready");
  assert.ok(dashboard.escrow.items[0].readiness > 0.9);
  assert.equal(dashboard.memory.recentEvents[0].response, "Guardada");
  assert.equal(dashboard.memory.stats.staged, 1);
  assert.equal(dashboard.memory.stats.deferred, 1);
  assert.ok(dashboard.memory.weeklyBrief.some((line) => /mirar/i.test(line)));
});

test("normalizeWorkspaceDashboard exposes plan and access control when billing is present", () => {
  const dashboard = normalizeWorkspaceDashboard({
    workspaceId: "alpha-retail",
    snapshot: {
      generated_at: "2026-03-16T01:36:46.568441+00:00",
      overview: {},
      portfolio: {},
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
    billingPlan: {
      id: "pro",
      label: "Pro",
      status: "active",
      access: {
        privateWorkspace: true,
        upgradeRequired: false,
      },
      capabilities: {
        privateWorkspace: true,
        stagedActions: true,
      },
    },
  });

  assert.equal(dashboard.plan.id, "pro");
  assert.equal(dashboard.workspace_summary.plan_id, "pro");
  assert.equal(dashboard.access_control.privateWorkspace, true);
  assert.equal(dashboard.data_control.plan.id, "pro");
});
