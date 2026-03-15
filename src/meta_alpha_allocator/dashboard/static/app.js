const COLORS = {
  policy: "#ffd37a",
  heuristic: "#52a7ff",
  spy: "#3bd18b",
  meta: "#ff8d5c",
  drawdown: "#ff6a6a",
  gold: "#ffb347",
  teal: "#34d1c6",
  muted: "#9ba6bc",
};

const state = {
  snapshot: null,
  density: "dense",
  countdown: 300,
  countdownId: null,
  screener: {
    search: "",
    sort_by: "discovery_score",
    direction: "desc",
    limit: 50,
  },
};

function fmtPct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function fmtNum(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function regimeBadge(regime) {
  if (regime === "CRISIS") return ["badge badge-red", regime];
  if (regime === "DEFENSIVE") return ["badge badge-gold", regime];
  if (regime === "RISK_ON") return ["badge badge-green", regime];
  return ["badge badge-blue", regime || "NEUTRAL"];
}

function panelStatus(name) {
  const panels = state.snapshot?.status?.panels || [];
  return panels.find((panel) => panel.name === name) || { status: "unknown", stale_days: null };
}

function statusBadge(name) {
  const panel = panelStatus(name);
  const klass = panel.status === "fresh" ? "badge-green" : panel.status === "aging" ? "badge-gold" : panel.status === "stale" ? "badge-red" : "badge-muted";
  const label = panel.stale_days === null ? panel.status : `${panel.status} ${panel.stale_days}d`;
  return `<span class="badge ${klass}">${label}</span>`;
}

function metricCard(label, value, sub = "") {
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-sub">${sub}</div>
    </div>
  `;
}

function lineChart(rows, seriesDefs, { height = 190, min = null, max = null } = {}) {
  if (!rows || !rows.length) return `<div class="muted">No series available.</div>`;
  const width = 900;
  const padding = 24;
  const values = [];
  rows.forEach((row) => seriesDefs.forEach((series) => {
    const value = Number(row[series.key]);
    if (!Number.isNaN(value)) values.push(value);
  }));
  if (!values.length) return `<div class="muted">No numeric data available.</div>`;
  const minValue = min !== null ? min : Math.min(...values);
  const maxValue = max !== null ? max : Math.max(...values);
  const span = maxValue - minValue || 1;
  const pathFor = (key) => rows.map((row, idx) => {
    const x = padding + (idx / Math.max(rows.length - 1, 1)) * (width - padding * 2);
    const value = Number(row[key]);
    const y = height - padding - ((value - minValue) / span) * (height - padding * 2);
    return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const grid = [0.25, 0.5, 0.75].map((ratio) => {
    const y = padding + ratio * (height - padding * 2);
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(255,255,255,0.06)" />`;
  }).join("");
  const paths = seriesDefs.map((series) => `<path d="${pathFor(series.key)}" fill="none" stroke="${series.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />`).join("");
  const legend = `<div class="legend">${seriesDefs.map((series) => `<span class="legend-item"><span class="legend-swatch" style="background:${series.color}"></span>${series.label}</span>`).join("")}</div>`;
  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">${grid}${paths}</svg>${legend}`;
}

function barChart(rows, valueKey, labelKey, color, height = 170) {
  if (!rows || !rows.length) return `<div class="muted">No bars available.</div>`;
  const width = 900;
  const padding = 24;
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 0.0001);
  const barWidth = (width - padding * 2) / rows.length;
  const bars = rows.map((row, idx) => {
    const value = Number(row[valueKey]) || 0;
    const scaled = (value / maxValue) * (height - padding * 2);
    const x = padding + idx * barWidth + 6;
    const y = height - padding - scaled;
    const label = String(row[labelKey] || "").slice(0, 8);
    return `
      <rect x="${x}" y="${y}" width="${barWidth - 12}" height="${scaled}" rx="4" fill="${color}" opacity="0.86"></rect>
      <text x="${x + (barWidth - 12) / 2}" y="${height - 8}" fill="rgba(255,255,255,0.68)" text-anchor="middle" font-size="10">${label}</text>
    `;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">${bars}</svg>`;
}

function histogram(bars, height = 140) {
  if (!bars || !bars.length) return `<div class="muted">No distribution available.</div>`;
  const width = 900;
  const padding = 24;
  const maxCount = Math.max(...bars.map((bar) => Number(bar.count) || 0), 1);
  const barWidth = (width - padding * 2) / bars.length;
  const nodes = bars.map((bar, idx) => {
    const scaled = ((Number(bar.count) || 0) / maxCount) * (height - padding * 2);
    const x = padding + idx * barWidth + 4;
    const y = height - padding - scaled;
    return `<rect x="${x}" y="${y}" width="${barWidth - 8}" height="${scaled}" rx="3" fill="${COLORS.gold}" opacity="0.8"></rect>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">${nodes}</svg>`;
}

function table(columns, rows) {
  if (!rows || !rows.length) return `<div class="muted">No rows available.</div>`;
  const header = columns.map((column) => `<th>${column.label}</th>`).join("");
  const body = rows.map((row) => `
    <tr>${columns.map((column) => `<td class="${column.mono ? "mono" : ""}">${column.render ? column.render(row[column.key], row) : (row[column.key] ?? "-")}</td>`).join("")}</tr>
  `).join("");
  return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function renderTopStrip() {
  const overview = state.snapshot.overview;
  const [regimeClass, regimeLabel] = regimeBadge(overview.regime);
  document.getElementById("top-datetime").textContent = `As of ${fmtDate(overview.as_of_date)}`;
  document.getElementById("top-metrics").innerHTML = [
    metricCard("Regime", `<span class="${regimeClass}">${regimeLabel}</span>`, `Crash ${fmtPct(overview.crash_prob)}`),
    metricCard("Beta target", fmtPct(overview.beta_target), overview.recommended_action || ""),
    metricCard("Selected hedge", overview.selected_hedge || "-", overview.best_hedge_now ? `Best now ${overview.best_hedge_now}` : ""),
    metricCard("Confidence", fmtPct(overview.confidence), `Alt ${overview.alternative_action || "-"}`),
    metricCard("Tail risk", fmtPct(overview.tail_risk_score), `Legitimacy ${fmtPct(overview.legitimacy_risk)}`),
    metricCard("Consensus", fmtPct(overview.consensus_fragility_score), `Belief-capacity ${fmtPct(overview.belief_capacity_misalignment)}`),
    metricCard("Utility", fmtNum(overview.expected_utility, 4), `Refresh ${fmtDate(state.snapshot.generated_at)}`),
  ].join("");
  document.getElementById("last-refresh").textContent = new Date(state.snapshot.generated_at).toLocaleTimeString();
}

function renderWarnings() {
  const warnings = state.snapshot.status?.warnings || [];
  const warningStrip = document.getElementById("warning-strip");
  if (!warnings.length) {
    warningStrip.classList.add("hidden");
    warningStrip.innerHTML = "";
    return;
  }
  warningStrip.classList.remove("hidden");
  warningStrip.innerHTML = warnings.map((warning) => `<div>${warning}</div>`).join("");
}

function renderCommand() {
  const overview = state.snapshot.overview;
  const risk = state.snapshot.risk;
  const portfolio = state.snapshot.portfolio;
  const forecast = state.snapshot.forecast || {};
  const scenario = overview.scenario_synthesis || {};
  const spyBaseline = forecast.latest?.SPY || {};
  const shyBaseline = forecast.latest?.SHY || {};
  const scenarioRows = Object.entries(scenario.posterior || {}).sort((left, right) => Number(right[1]) - Number(left[1])).slice(0, 3);
  const [regimeClass, regimeLabel] = regimeBadge(overview.regime);
  document.getElementById("command-panel").innerHTML = `
    <div class="grid-two">
      <div class="card">
        <h3>Stance</h3>
        <div class="big-readout">${fmtPct(overview.beta_target, 0)}</div>
        <div class="fact-list">
          <div class="fact-row"><span>Regime</span><span class="${regimeClass}">${regimeLabel}</span></div>
          <div class="fact-row"><span>Hedge</span><span class="mono">${overview.selected_hedge || "-"}</span></div>
          <div class="fact-row"><span>Confidence</span><span class="mono">${fmtPct(overview.confidence)}</span></div>
          <div class="fact-row"><span>Status</span><span>${statusBadge("risk")}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Tail Risk</h3>
        <div class="progress-list">
          ${[
            ["5d loss", risk.tail_risk?.tail_loss_5d],
            ["10d loss", risk.tail_risk?.tail_loss_10d],
            ["20d loss", risk.tail_risk?.tail_loss_20d],
          ].map(([label, value]) => `
            <div class="progress-row">
              <div>${label}</div>
              <div class="bar-shell"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, Number(value || 0) * 100))}%;background:${Number(value || 0) > 0.7 ? COLORS.drawdown : COLORS.teal}"></div></div>
              <div class="mono">${fmtPct(value)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Why this action</h3>
      <div class="small-list">${(overview.why_this_action || []).map((item) => `<div>${item}</div>`).join("") || "<div class='muted'>No explanation available.</div>"}</div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Consensus Fragility</h3>
      <div class="grid-two">
        <div class="fact-list">
          <div class="fact-row"><span>Consensus fragility</span><span class="mono">${fmtPct(overview.consensus_fragility_score)}</span></div>
          <div class="fact-row"><span>Belief-capacity mismatch</span><span class="mono">${fmtPct(overview.belief_capacity_misalignment)}</span></div>
        </div>
        <div class="small-list">${(overview.consensus_fragility_narrative || []).map((item) => `<div>${item}</div>`).join("") || "<div class='muted'>No fragility narrative available.</div>"}</div>
      </div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>What flips it</h3>
      <div class="small-list">${(overview.conditions_that_flip || []).map((item) => `<div>${item}</div>`).join("") || "<div class='muted'>No flip conditions available.</div>"}</div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Scenario synthesis</h3>
      <div class="grid-two">
        <div class="fact-list">
          <div class="fact-row"><span>Dominant</span><span>${scenario.dominant_scenario || "-"}</span></div>
          <div class="fact-row"><span>Secondary</span><span>${scenario.secondary_scenario || "-"}</span></div>
          <div class="fact-row"><span>Scenario beta</span><span class="mono">${fmtPct(scenario.expected_beta)}</span></div>
          <div class="fact-row"><span>Preferred hedge</span><span class="mono">${scenario.preferred_hedge || "-"}</span></div>
        </div>
        <div class="progress-list">
          ${scenarioRows.map(([label, value]) => `
            <div class="progress-row">
              <div>${label}</div>
              <div class="bar-shell"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, Number(value || 0) * 100))}%;background:${COLORS.gold}"></div></div>
              <div class="mono">${fmtPct(value)}</div>
            </div>
          `).join("") || "<div class='muted'>No scenario posterior available.</div>"}
        </div>
      </div>
      <div class="small-list" style="margin-top:10px;">${(overview.scenario_narrative || []).map((item) => `<div>${item}</div>`).join("") || "<div class='muted'>No scenario narrative available.</div>"}</div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Baseline forecasts</h3>
      <div class="grid-two">
        <div class="fact-list">
          <div class="fact-row"><span>SPY 5d</span><span class="mono">${fmtPct(spyBaseline.predicted_5d)}</span></div>
          <div class="fact-row"><span>SPY 10d</span><span class="mono">${fmtPct(spyBaseline.predicted_10d)}</span></div>
          <div class="fact-row"><span>SPY 20d</span><span class="mono">${fmtPct(spyBaseline.predicted_20d)}</span></div>
        </div>
        <div class="fact-list">
          <div class="fact-row"><span>SHY 5d</span><span class="mono">${fmtPct(shyBaseline.predicted_5d)}</span></div>
          <div class="fact-row"><span>SHY 10d</span><span class="mono">${fmtPct(shyBaseline.predicted_10d)}</span></div>
          <div class="fact-row"><span>SHY 20d</span><span class="mono">${fmtPct(shyBaseline.predicted_20d)}</span></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Portfolio alignment</h3>
      <div class="small-list">${(portfolio.alignment?.notes || []).map((note) => `<div>${note}</div>`).join("") || "<div class='muted'>Current book is broadly aligned with the system stance.</div>"}</div>
    </div>
  `;
}

function renderPerformance() {
  const performance = state.snapshot.performance;
  const rows = performance.series || [];
  const growthHtml = lineChart(rows, [
    { key: "policy_overlay_growth", label: "Policy overlay", color: COLORS.policy },
    { key: "state_overlay_growth", label: "Heuristic overlay", color: COLORS.heuristic },
    { key: "spy_growth", label: "SPY", color: COLORS.spy },
  ]);
  const drawdownHtml = lineChart(rows, [
    { key: "policy_overlay_drawdown", label: "Policy DD", color: COLORS.policy },
    { key: "state_overlay_drawdown", label: "Heuristic DD", color: COLORS.heuristic },
    { key: "spy_drawdown", label: "SPY DD", color: COLORS.drawdown },
  ], { min: -0.5, max: 0.05 });
  const rollingHtml = lineChart(rows, [
    { key: "policy_overlay_sharpe_63", label: "Policy Sharpe 63d", color: COLORS.policy },
    { key: "state_overlay_sharpe_63", label: "Heuristic Sharpe 63d", color: COLORS.heuristic },
    { key: "spy_sharpe_63", label: "SPY Sharpe 63d", color: COLORS.spy },
  ]);

  const benchmarkTable = table([
    { key: "label", label: "Series" },
    { key: "annual_return", label: "CAGR", render: (value) => fmtPct(value) },
    { key: "sharpe", label: "Sharpe", render: (value) => fmtNum(value) },
    { key: "max_drawdown", label: "MaxDD", render: (value) => fmtPct(value) },
  ], performance.benchmark_table || []);

  const oosBlocks = (performance.oos_blocks || []).map((block) => `
    <div class="card">
      <h3>${block.start} to ${block.end}</h3>
      <div class="fact-list">
        <div class="fact-row"><span>CAGR</span><span class="mono">${fmtPct(block.annual_return)}</span></div>
        <div class="fact-row"><span>Sharpe</span><span class="mono">${fmtNum(block.sharpe)}</span></div>
        <div class="fact-row"><span>MaxDD</span><span class="mono">${fmtPct(block.max_drawdown)}</span></div>
      </div>
    </div>
  `).join("");

  document.getElementById("performance-panel").innerHTML = `
    <div class="grid-three">
      <div class="card"><h3>Policy</h3><div class="big-readout">${fmtNum(performance.summary_metrics?.policy_overlay?.sharpe)}</div><div class="muted">Sharpe</div></div>
      <div class="card"><h3>Heuristic</h3><div class="big-readout">${fmtNum(performance.summary_metrics?.state_overlay?.sharpe)}</div><div class="muted">Sharpe</div></div>
      <div class="card"><h3>SPY</h3><div class="big-readout">${fmtNum(performance.summary_metrics?.benchmark_spy?.sharpe)}</div><div class="muted">Sharpe</div></div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Growth of $1 ${statusBadge("performance")}</h3>
      <div class="chart">${growthHtml}</div>
    </div>
    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Drawdown</h3>
        <div class="chart chart-small">${drawdownHtml}</div>
      </div>
      <div class="card">
        <h3>Rolling Sharpe</h3>
        <div class="chart chart-small">${rollingHtml}</div>
      </div>
    </div>
    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Benchmarks</h3>
        ${benchmarkTable}
      </div>
      <div class="card">
        <h3>OOS blocks</h3>
        <div class="grid-three">${oosBlocks}</div>
      </div>
    </div>
  `;
}

function renderHedges() {
  const hedges = state.snapshot.hedges;
  const ranking = hedges.ranking || [];
  const rows = ranking.slice(0, 6);
  document.getElementById("hedges-panel").innerHTML = `
    <div class="grid-two">
      <div class="card">
        <h3>Current pick</h3>
        <div class="big-readout">${hedges.selected_hedge || "-"}</div>
        <div class="fact-list">
          <div class="fact-row"><span>Best hedge now</span><span class="mono">${hedges.best_hedge_now || "-"}</span></div>
          <div class="fact-row"><span>Alternative</span><span class="mono">${hedges.alternative_hedge || "-"}</span></div>
          <div class="fact-row"><span>UST best</span><span>${hedges.us_treasuries_best_hedge ? "Yes" : "No"}</span></div>
          <div class="fact-row"><span>Status</span><span>${statusBadge("hedges")}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Ranking</h3>
        <div class="progress-list">
          ${rows.map((row) => `
            <div class="progress-row">
              <div class="mono">${row.ticker}</div>
              <div class="bar-shell"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, Number(row.hedge_score || 0) * 100))}%;background:${row.ticker === hedges.selected_hedge ? COLORS.gold : COLORS.heuristic}"></div></div>
              <div class="mono">${fmtPct(row.hedge_score)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:10px;">
      ${table([
        { key: "ticker", label: "Ticker", mono: true },
        { key: "hedge_score", label: "Score", render: (v) => fmtPct(v) },
        { key: "carry_score", label: "Carry", render: (v) => fmtPct(v) },
        { key: "crisis_score", label: "Crisis", render: (v) => fmtPct(v) },
        { key: "corr_spy_63d", label: "Corr", render: (v) => fmtNum(v, 2) },
      ], rows)}
    </div>
  `;
}

function renderSectors() {
  const sectors = state.snapshot.sectors;
  const rows = sectors.records || [];
  const chartHtml = barChart(rows.slice(0, 8), "opportunity_score", "proxy_ticker", COLORS.teal);
  document.getElementById("sectors-panel").innerHTML = `
    <div class="card">
      <h3>Preferred sectors ${statusBadge("sectors")}</h3>
      <div class="chart chart-small">${chartHtml}</div>
    </div>
    <div class="card" style="margin-top:10px;">
      ${table([
        { key: "sector", label: "Sector" },
        { key: "proxy_ticker", label: "Proxy", mono: true },
        { key: "opportunity_score", label: "Score", render: (v) => fmtPct(v) },
        { key: "mom_60d", label: "Mom 60d", render: (v) => fmtPct(v) },
        { key: "view", label: "View" },
      ], rows.slice(0, 8))}
    </div>
  `;
}

function renderInternational() {
  const intl = state.snapshot.international;
  const rows = intl.records || [];
  const chartHtml = barChart(rows.slice(0, 8), "opportunity_score", "ticker", COLORS.blue);
  document.getElementById("international-panel").innerHTML = `
    <div class="card">
      <h3>Preferred markets ${statusBadge("international")}</h3>
      <div class="chart chart-small">${chartHtml}</div>
    </div>
    <div class="card" style="margin-top:10px;">
      ${table([
        { key: "market", label: "Market" },
        { key: "ticker", label: "Proxy", mono: true },
        { key: "opportunity_score", label: "Score", render: (v) => fmtPct(v) },
        { key: "diversification_score", label: "Diversify", render: (v) => fmtPct(v) },
        { key: "mom_60d", label: "Mom 60d", render: (v) => fmtPct(v) },
      ], rows.slice(0, 8))}
    </div>
  `;
}

function renderPortfolio() {
  const portfolio = state.snapshot.portfolio;
  const statementIntel = portfolio.statement_intelligence || {};
  const kernelUtility = statementIntel.kernel_research_utility || {};
  const sectorWeights = portfolio.sector_weights || [];
  const topHoldings = portfolio.top_holdings || [];
  const currentMix = portfolio.current_mix_vs_spy || [];
  const currentMixChart = lineChart(currentMix, [
    { key: "portfolio_growth", label: "Current mix", color: COLORS.gold },
    { key: "spy_growth", label: "SPY", color: COLORS.spy },
  ]);
  document.getElementById("portfolio-panel").innerHTML = `
    <div class="grid-three">
      <div class="card"><h3>Holdings</h3><div class="big-readout">${fmtNum(portfolio.analytics?.["Holdings Count"] || 0, 0)}</div><div class="muted">${statusBadge("portfolio")}</div></div>
      <div class="card"><h3>Portfolio beta</h3><div class="big-readout">${fmtNum(portfolio.analytics?.Beta)}</div><div class="muted">Target ${fmtPct(portfolio.alignment?.beta_target)}</div></div>
      <div class="card"><h3>Top weight</h3><div class="big-readout">${fmtPct(portfolio.analytics?.["Top Position Weight"])}</div><div class="muted">HHI ${fmtNum(portfolio.analytics?.["Concentration HHI"], 3)}</div></div>
    </div>
    <div class="grid-three" style="margin-top:10px;">
      <div class="card"><h3>Kernel spread 21d</h3><div class="big-readout">${fmtPct(kernelUtility.top_bottom_spread_21d)}</div><div class="muted">High vs low cash conversion</div></div>
      <div class="card"><h3>Kernel spread 63d</h3><div class="big-readout">${fmtPct(kernelUtility.top_bottom_spread_63d)}</div><div class="muted">Research utility</div></div>
      <div class="card"><h3>Positive OOS</h3><div class="big-readout">${fmtNum(kernelUtility.positive_oos_blocks_63d || 0, 0)}</div><div class="muted">63d blocks with positive spread</div></div>
    </div>
    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Allocation by sector</h3>
        <div class="chart chart-small">${barChart(sectorWeights.slice(0, 8), "portfolio_weight", "sector", COLORS.gold)}</div>
      </div>
      <div class="card">
        <h3>Current mix vs SPY</h3>
        <div class="chart chart-small">${currentMixChart}</div>
      </div>
    </div>
    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Top holdings</h3>
        ${table([
          { key: "ticker", label: "Ticker", mono: true },
          { key: "weight", label: "Weight", render: (v) => fmtPct(v) },
          { key: "upside", label: "Upside", render: (v) => fmtPct(v) },
          { key: "composite_score", label: "Score", render: (v) => fmtNum(v, 2) },
        ], topHoldings.slice(0, 10))}
      </div>
      <div class="card">
        <h3>Valuation distribution</h3>
        <div class="chart chart-small">${histogram(portfolio.valuation_histogram || [])}</div>
        <div class="small-list" style="margin-top:10px;">${(portfolio.alignment?.notes || []).map((note) => `<div>${note}</div>`).join("") || "<div class='muted'>No alignment warnings.</div>"}</div>
      </div>
    </div>
    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Statement + cash confirmed</h3>
        ${table([
          { key: "ticker", label: "Ticker", mono: true },
          { key: "statement_score", label: "Score", render: (v) => fmtPct(v) },
          { key: "earnings_cash_kernel_score", label: "Kernel", render: (v) => fmtPct(v) },
          { key: "earnings_cash_kernel_bucket", label: "Cash view" },
          { key: "statement_bucket", label: "Bucket" },
          { key: "statement_commentary", label: "Commentary" },
        ], statementIntel.top_statement_names || [])}
      </div>
      <div class="card">
        <h3>Cash conversion mismatches</h3>
        ${table([
          { key: "ticker", label: "Ticker", mono: true },
          { key: "statement_score", label: "Stmt", render: (v) => fmtPct(v) },
          { key: "earnings_cash_kernel_score", label: "Kernel", render: (v) => fmtPct(v) },
          { key: "earnings_cash_kernel_bucket", label: "Cash view" },
          { key: "earnings_cash_kernel_commentary", label: "Commentary" },
        ], statementIntel.cash_mismatch_names || [])}
      </div>
    </div>
    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Top cash-confirmed names</h3>
        ${table([
          { key: "ticker", label: "Ticker", mono: true },
          { key: "earnings_cash_kernel_score", label: "Kernel", render: (v) => fmtPct(v) },
          { key: "statement_conviction_score", label: "Conviction", render: (v) => fmtPct(v) },
          { key: "earnings_cash_kernel_bucket", label: "Bucket" },
          { key: "earnings_cash_kernel_commentary", label: "Commentary" },
        ], statementIntel.top_kernel_names || [])}
      </div>
      <div class="card">
        <h3>Cash breadth by sector</h3>
        ${table([
          { key: "sector", label: "Sector" },
          { key: "coverage", label: "Coverage", render: (v) => fmtNum(v, 0) },
          { key: "median_kernel_score", label: "Median", render: (v) => fmtPct(v) },
          { key: "cash_confirmed_share", label: "Confirmed", render: (v) => fmtPct(v) },
          { key: "earnings_only_share", label: "Earnings only", render: (v) => fmtPct(v) },
        ], statementIntel.kernel_sector_breadth || [])}
      </div>
    </div>
  `;
}

function renderRegimes() {
  const performance = state.snapshot.performance || {};
  const risk = state.snapshot.risk || {};
  const context = risk.historical_context || {};
  const regimeRows = performance.regime_performance || [];
  const episodeRows = performance.episode_performance || [];
  const bestRegime = [...regimeRows].sort((left, right) => Number(right.sharpe || 0) - Number(left.sharpe || 0))[0];
  const worstEpisode = [...episodeRows].sort((left, right) => Number(left.max_drawdown || 0) - Number(right.max_drawdown || 0))[0];
  const currentContextLabel = context.episode_name || context.regime_label || "normal";
  const currentRegimeBadge = regimeBadge((context.regime_label || "normal").toUpperCase() === "NORMAL" ? "NEUTRAL" : (context.regime_label || "NEUTRAL").toUpperCase());

  document.getElementById("regimes-panel").innerHTML = `
    <div class="grid-three">
      <div class="card">
        <h3>Current historical lens</h3>
        <div class="big-readout" style="font-size:28px;">${currentContextLabel}</div>
        <div class="fact-list">
          <div class="fact-row"><span>Regime</span><span class="${currentRegimeBadge[0]}">${context.regime_label || "normal"}</span></div>
          <div class="fact-row"><span>Episode group</span><span>${context.episode_group || "-"}</span></div>
          <div class="fact-row"><span>Active stack</span><span>${context.active_episodes || "-"}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Best historical regime</h3>
        <div class="big-readout" style="font-size:28px;">${bestRegime?.regime || "-"}</div>
        <div class="fact-list">
          <div class="fact-row"><span>Sharpe</span><span class="mono">${fmtNum(bestRegime?.sharpe)}</span></div>
          <div class="fact-row"><span>CAGR</span><span class="mono">${fmtPct(bestRegime?.annual_return)}</span></div>
          <div class="fact-row"><span>Obs</span><span class="mono">${fmtNum(bestRegime?.observations || 0, 0)}</span></div>
        </div>
      </div>
      <div class="card">
        <h3>Hardest episode</h3>
        <div class="big-readout" style="font-size:28px;">${worstEpisode?.episode_name || "-"}</div>
        <div class="fact-list">
          <div class="fact-row"><span>Regime</span><span>${worstEpisode?.regime || "-"}</span></div>
          <div class="fact-row"><span>MaxDD</span><span class="mono">${fmtPct(worstEpisode?.max_drawdown)}</span></div>
          <div class="fact-row"><span>Period</span><span class="mono">${worstEpisode ? `${worstEpisode.start} to ${worstEpisode.end}` : "-"}</span></div>
        </div>
      </div>
    </div>
    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Performance by regime</h3>
        ${table([
          { key: "regime", label: "Regime" },
          { key: "observations", label: "Obs", render: (v) => fmtNum(v, 0) },
          { key: "annual_return", label: "CAGR", render: (v) => fmtPct(v) },
          { key: "sharpe", label: "Sharpe", render: (v) => fmtNum(v) },
          { key: "max_drawdown", label: "MaxDD", render: (v) => fmtPct(v) },
        ], regimeRows)}
      </div>
      <div class="card">
        <h3>Episode lens</h3>
        ${table([
          { key: "episode_name", label: "Episode" },
          { key: "regime", label: "Regime" },
          { key: "annual_return", label: "CAGR", render: (v) => fmtPct(v) },
          { key: "sharpe", label: "Sharpe", render: (v) => fmtNum(v) },
          { key: "max_drawdown", label: "MaxDD", render: (v) => fmtPct(v) },
        ], episodeRows.slice(-8).reverse())}
      </div>
    </div>
  `;
}

async function loadScreener() {
  const query = new URLSearchParams(state.screener).toString();
  const payload = await fetchJson(`/api/screener?${query}`);
  const statementOverlay = new Map((state.snapshot.screener?.statement_overlay || []).map((row) => [row.ticker, row]));
  const rows = (payload.rows || []).map((row) => ({ ...statementOverlay.get(row.ticker), ...row }));
  document.getElementById("screener-panel").innerHTML = table([
    { key: "ticker", label: "Ticker", mono: true },
    { key: "screen_origin", label: "Origin" },
    { key: "sector", label: "Sector" },
    { key: "thesis_bucket", label: "Bucket" },
    { key: "discovery_score", label: "Discovery", render: (v) => fmtNum(v, 2) },
    { key: "owner_elasticity_score", label: "Elasticity", render: (v) => fmtPct(v) },
    { key: "owner_elasticity_bucket", label: "Owner" },
    { key: "composite_score", label: "Composite", render: (v) => fmtNum(v, 2) },
    { key: "statement_score", label: "Stmt", render: (v) => fmtPct(v) },
    { key: "earnings_cash_kernel_score", label: "Kernel", render: (v) => fmtPct(v) },
    { key: "earnings_cash_kernel_bucket", label: "Cash view" },
    { key: "valuation_gap", label: "Valuation gap", render: (v) => fmtPct(v) },
    { key: "momentum_6m", label: "Momentum", render: (v) => fmtPct(v) },
    { key: "quality_score", label: "Quality", render: (v) => fmtNum(v, 2) },
    { key: "suggested_position", label: "Suggested", render: (v) => fmtPct(v) },
    { key: "analyst_consensus", label: "Consensus" },
  ], rows);
}

function renderAll() {
  renderTopStrip();
  renderWarnings();
  renderCommand();
  renderPerformance();
  renderHedges();
  renderSectors();
  renderInternational();
  renderPortfolio();
  renderRegimes();
  loadScreener();
}

async function refreshSnapshot(showBusy = true) {
  const refreshBtn = document.getElementById("refresh-btn");
  if (showBusy) refreshBtn.textContent = "Refreshing...";
  try {
    state.snapshot = await fetchJson("/api/snapshot");
    renderAll();
  } finally {
    refreshBtn.textContent = "Refresh";
  }
}

async function triggerRefresh() {
  const refreshBtn = document.getElementById("refresh-btn");
  refreshBtn.textContent = "Refreshing...";
  try {
    await fetchJson("/api/refresh", { method: "POST" });
    state.snapshot = await fetchJson("/api/snapshot");
    renderAll();
    state.countdown = 300;
  } finally {
    refreshBtn.textContent = "Refresh";
  }
}

function attachEvents() {
  document.getElementById("refresh-btn").addEventListener("click", triggerRefresh);
  document.getElementById("density-btn").addEventListener("click", () => {
    document.body.classList.toggle("compact");
    state.density = document.body.classList.contains("compact") ? "compact" : "dense";
    document.getElementById("density-btn").textContent = state.density === "compact" ? "Full" : "Dense";
  });
  document.getElementById("screener-search").addEventListener("input", (event) => {
    state.screener.search = event.target.value;
    loadScreener();
  });
  document.getElementById("screener-sort").addEventListener("change", (event) => {
    state.screener.sort_by = event.target.value;
    loadScreener();
  });
  document.getElementById("screener-direction").addEventListener("click", (event) => {
    state.screener.direction = state.screener.direction === "desc" ? "asc" : "desc";
    event.target.textContent = state.screener.direction === "desc" ? "Desc" : "Asc";
    loadScreener();
  });
  document.querySelectorAll("[data-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const panelName = button.getAttribute("data-focus");
      document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("panel-focus-mode"));
      document.querySelector(`.panel[data-panel="${panelName}"]`)?.classList.add("panel-focus-mode");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r") triggerRefresh();
    if (event.key === "Escape") document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("panel-focus-mode"));
  });
}

function startCountdown() {
  if (state.countdownId) clearInterval(state.countdownId);
  state.countdown = state.snapshot?.status?.auto_refresh_seconds || 300;
  const countdownEl = document.getElementById("countdown");
  state.countdownId = setInterval(async () => {
    state.countdown -= 1;
    countdownEl.textContent = `${state.countdown}s`;
    if (state.countdown <= 0) {
      await triggerRefresh();
      state.countdown = state.snapshot?.status?.auto_refresh_seconds || 300;
    }
  }, 1000);
}

async function boot() {
  attachEvents();
  await refreshSnapshot(false);
  startCountdown();
}

boot();
