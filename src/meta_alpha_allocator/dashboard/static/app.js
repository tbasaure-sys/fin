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

const API_BASE = (window.META_ALLOCATOR_CONFIG && window.META_ALLOCATOR_CONFIG.API_BASE) || "";

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

function structuralBadge(structuralState) {
  if (structuralState === "compressed") return `<span class="state-pill state-compressed">Compressed</span>`;
  if (structuralState === "open") return `<span class="state-pill state-open">Open</span>`;
  return `<span class="state-pill state-transition">${structuralState || "transition"}</span>`;
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
  const pathFor = (key) => {
    let started = false;
    return rows.map((row, idx) => {
      const x = padding + (idx / Math.max(rows.length - 1, 1)) * (width - padding * 2);
      const value = Number(row[key]);
      if (Number.isNaN(value)) return "";
      const y = height - padding - ((value - minValue) / span) * (height - padding * 2);
      const segment = `${started ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      started = true;
      return segment;
    }).join(" ");
  };
  const grid = [0.25, 0.5, 0.75].map((ratio) => {
    const y = padding + ratio * (height - padding * 2);
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(255,255,255,0.06)" />`;
  }).join("");
  const paths = seriesDefs.map((series) => `<path d="${pathFor(series.key)}" fill="none" stroke="${series.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />`).join("");
  const legend = `<div class="legend">${seriesDefs.map((series) => `<span class="legend-item"><span class="legend-swatch" style="background:${series.color}"></span>${series.label}</span>`).join("")}</div>`;
  return `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">${grid}${paths}</svg>${legend}`;
}

function fanChart(rows, { height = 190, color = COLORS.gold } = {}) {
  if (!rows || !rows.length) return `<div class="muted">No scenario paths available.</div>`;
  const width = 900;
  const padding = 24;
  const values = [];
  rows.forEach((row) => ["p10", "p50", "p90"].forEach((key) => {
    const value = Number(row[key]);
    if (!Number.isNaN(value)) values.push(value);
  }));
  if (!values.length) return `<div class="muted">No scenario paths available.</div>`;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const span = maxValue - minValue || 1;
  const point = (idx, value) => {
    const x = padding + (idx / Math.max(rows.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((value - minValue) / span) * (height - padding * 2);
    return [x, y];
  };
  const upper = rows.map((row, idx) => point(idx, Number(row.p90)));
  const lower = [...rows].reverse().map((row, idx) => point(rows.length - 1 - idx, Number(row.p10)));
  const band = [...upper, ...lower].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const medianPath = rows.map((row, idx) => {
    const [x, y] = point(idx, Number(row.p50));
    return `${idx === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const grid = [0.25, 0.5, 0.75].map((ratio) => {
    const y = padding + ratio * (height - padding * 2);
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(255,255,255,0.06)" />`;
  }).join("");
  return `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg">
      ${grid}
      <polygon points="${band}" fill="${color}" opacity="0.18"></polygon>
      <path d="${medianPath}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"></path>
    </svg>
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch" style="background:${color};opacity:0.85"></span>Median path</span>
      <span class="legend-item"><span class="legend-swatch" style="background:${color};opacity:0.25"></span>10-90 percentile band</span>
    </div>
  `;
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
  const response = await fetch(`${API_BASE}${path}`, options);
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
    metricCard("Confidence", fmtPct(overview.confidence), `Utility ${fmtNum(overview.expected_utility, 4)}`),
    metricCard("Tail risk", fmtPct(overview.tail_risk_score), `Legitimacy ${fmtPct(overview.legitimacy_risk)}`),
    metricCard("Structure", fmtPct(overview.compression_score), `${overview.spectral_state || "transition"} | freedom ${fmtPct(overview.freedom_score)}`),
    metricCard("Consensus", fmtPct(overview.consensus_fragility_score), `Belief-capacity ${fmtPct(overview.belief_capacity_misalignment)}`),
    metricCard("Refresh", fmtDate(state.snapshot.generated_at), `Alt ${overview.alternative_action || "-"}`),
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
  const spectral = risk.spectral || {};
  const spectralLatest = spectral.latest || {};
  const scenario = overview.scenario_synthesis || {};
  const spyBaseline = forecast.latest?.SPY || {};
  const shyBaseline = forecast.latest?.SHY || {};
  const scenarioRows = Object.entries(scenario.posterior || {}).sort((left, right) => Number(right[1]) - Number(left[1])).slice(0, 3);
  const [regimeClass, regimeLabel] = regimeBadge(overview.regime);
  document.getElementById("command-panel").innerHTML = `
    <div class="grid-three">
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
      <div class="card">
        <h3>Structural State</h3>
        <div class="big-readout" style="font-size:28px;">${fmtPct(spectralLatest.compression_score)}</div>
        <div class="fact-list">
          <div class="fact-row"><span>State</span><span>${structuralBadge(spectralLatest.structural_state)}</span></div>
          <div class="fact-row"><span>Freedom</span><span class="mono">${fmtPct(spectralLatest.freedom_score)}</span></div>
          <div class="fact-row"><span>Beta ceiling</span><span class="mono">${fmtPct(overview.structural_beta_ceiling)}</span></div>
          <div class="fact-row"><span>Eig1 share</span><span class="mono">${fmtPct(spectralLatest.eig1_share)}</span></div>
          <div class="fact-row"><span>Eff. dimension</span><span class="mono">${fmtNum(spectralLatest.effective_dimension, 1)}</span></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Why this action</h3>
      <div class="small-list">${(overview.why_this_action || []).map((item) => `<div>${item}</div>`).join("") || "<div class='muted'>No explanation available.</div>"}</div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Spectral narrative</h3>
      <div class="small-list">${(spectralLatest.structural_narrative || []).map((item) => `<div>${item}</div>`).join("") || "<div class='muted'>No structural narrative available.</div>"}</div>
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

function renderStructural() {
  const spectral = state.snapshot.risk?.spectral || {};
  const latest = spectral.latest || {};
  const history = spectral.history || [];
  const mc21 = spectral.monte_carlo?.["21"] || {};
  const mc63 = spectral.monte_carlo?.["63"] || {};
  const recentHistory = history.slice(-120);
  const compressionChart = lineChart(recentHistory, [
    { key: "compression_score", label: "Compression", color: COLORS.drawdown },
    { key: "freedom_score", label: "Freedom", color: COLORS.green },
    { key: "avg_corr", label: "Avg corr", color: COLORS.blue },
  ], { min: 0, max: 1 });
  const fan21 = fanChart(mc21.path_percentiles || [], { color: COLORS.gold });
  const fan63 = fanChart(mc63.path_percentiles || [], { color: COLORS.blue });

  document.getElementById("structural-panel").innerHTML = `
    <div class="grid-three">
      <div class="card">
        <h3>State</h3>
        <div class="big-readout" style="font-size:28px;">${fmtPct(latest.compression_score)}</div>
        <div class="note-block" style="margin-top:10px;">${structuralBadge(latest.structural_state)}</div>
        <div class="subtle-metric"><span>Suggested stance</span><span class="mono">${latest.suggested_stance || "-"}</span></div>
        <div class="subtle-metric"><span>Beta ceiling</span><span class="mono">${fmtPct(latest.structural_beta_ceiling)}</span></div>
      </div>
      <div class="card">
        <h3>Primary mode</h3>
        <div class="big-readout" style="font-size:28px;">${fmtPct(latest.eig1_share)}</div>
        <div class="muted">Correlation mass captured by the first mode</div>
      </div>
      <div class="card">
        <h3>Eff. dimension</h3>
        <div class="big-readout" style="font-size:28px;">${fmtNum(latest.effective_dimension, 1)}</div>
        <div class="muted">Functional degrees of freedom still available</div>
      </div>
    </div>
    <div class="card" style="margin-top:10px;">
      <h3>Structural compression history ${statusBadge("risk")}</h3>
      <div class="chart chart-small">${compressionChart}</div>
      <div class="spark-grid" style="margin-top:10px;">
        <div class="note-block">${(latest.structural_narrative || [])[0] || "No structural narrative available."}</div>
        <div class="note-block">${(latest.structural_narrative || [])[1] || "Monte Carlo is conditioned on open vs compressed structural worlds."}</div>
      </div>
    </div>
    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>21d path space</h3>
        <div class="chart chart-small">${fan21}</div>
        <div class="subtle-metric"><span>Expected return</span><span class="mono">${fmtPct(mc21.expected_return)}</span></div>
        <div class="subtle-metric"><span>Probability of loss</span><span class="mono">${fmtPct(mc21.probability_loss)}</span></div>
        <div class="subtle-metric"><span>CVaR 95</span><span class="mono">${fmtPct(mc21.cvar_95)}</span></div>
      </div>
      <div class="card">
        <h3>63d path space</h3>
        <div class="chart chart-small">${fan63}</div>
        <div class="subtle-metric"><span>Expected return</span><span class="mono">${fmtPct(mc63.expected_return)}</span></div>
        <div class="subtle-metric"><span>Probability of loss</span><span class="mono">${fmtPct(mc63.probability_loss)}</span></div>
        <div class="subtle-metric"><span>CVaR 95</span><span class="mono">${fmtPct(mc63.cvar_95)}</span></div>
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

async function renderAudit() {
  const el = document.getElementById("audit-panel");
  if (!el) return;

  let audit;
  try {
    audit = await fetchJson("/api/audit");
  } catch (_) {
    el.innerHTML = `<div class="muted">Audit data not yet available.</div>`;
    return;
  }

  if (!audit || audit.available === false) {
    el.innerHTML = `<div class="muted">${audit?.error || "Decision history insufficient for calibration."}</div>`;
    return;
  }

  const penalty = audit.confidence_penalty ?? 0;
  const penaltyActive = penalty > 0.01;
  const errShort = audit.rolling_error_rate_63d ?? null;
  const errLong  = audit.rolling_error_rate_252d ?? null;
  const streak   = audit.recent_consecutive_errors ?? 0;
  const totalDec   = audit.total_decisions ?? 0;
  const accuracy = audit.accuracy_overall ?? null;
  const totalWrong = accuracy !== null && totalDec ? Math.round((1 - accuracy) * totalDec) : 0;
  const utilGap  = audit.mean_utility_gap_63d ?? audit.mean_utility_gap_252d ?? null;
  const confBias = audit.calibration_gap ?? null;
  const calibDrift = null; // not in current schema
  const blameObj = audit.blame ?? {};
  const blameFeatures = {};
  (blameObj.feature_blame || []).forEach((entry) => {
    blameFeatures[entry.feature] = entry.correlation ?? entry.blame_score ?? 0;
  });
  const recentDecisions = (audit.recent_decisions ?? []).map((d) => ({
    date: d.date,
    recommended_action: d.recommended,
    confidence: d.confidence,
    best_action_ex_post: d.best_ex_post,
    utility: d.utility_achieved,
    utility_gap: d.utility_gap,
    correct: d.was_correct,
  }));

  // Sort blame features by absolute magnitude
  const blameEntries = Object.entries(blameFeatures)
    .filter(([, v]) => v !== null && !Number.isNaN(Number(v)))
    .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])))
    .slice(0, 8);

  function blameBar(value) {
    const v = Number(value);
    const pct = Math.abs(v) * 100;
    const color = v > 0 ? COLORS.drawdown : COLORS.teal;
    const dir = v > 0 ? "↑ hurt" : "↓ helped";
    return `
      <div class="blame-row">
        <div class="blame-label">${this}</div>
        <div class="blame-track">
          <div class="blame-fill" style="width:${Math.min(pct * 2, 100)}%;background:${color}"></div>
        </div>
        <div class="blame-value mono">${v >= 0 ? "+" : ""}${v.toFixed(3)} <span class="muted">${dir}</span></div>
      </div>
    `;
  }

  const blameHtml = blameEntries.length
    ? blameEntries.map(([feat, val]) => {
        const v = Number(val);
        const pct = Math.abs(v) * 100;
        const color = v > 0 ? COLORS.drawdown : COLORS.teal;
        const dir = v > 0 ? "↑ hurt" : "↓ helped";
        return `
          <div class="blame-row">
            <div class="blame-label">${feat}</div>
            <div class="blame-track">
              <div class="blame-fill" style="width:${Math.min(pct * 2, 100)}%;background:${color}"></div>
            </div>
            <div class="blame-value mono">${v >= 0 ? "+" : ""}${v.toFixed(3)} <span class="muted">${dir}</span></div>
          </div>
        `;
      }).join("")
    : `<div class="muted">Insufficient wrong decisions for blame attribution.</div>`;

  const recentHtml = recentDecisions.length ? table([
    { key: "date",               label: "Date",      render: (v) => v ? v.slice(0, 10) : "-" },
    { key: "recommended_action", label: "Action",    mono: true },
    { key: "confidence",         label: "Conf",      render: (v) => fmtPct(v) },
    { key: "best_action_ex_post",label: "Best ex-post", mono: true },
    { key: "utility",            label: "Utility",   render: (v) => fmtNum(v, 4) },
    { key: "utility_gap",        label: "Gap",       render: (v) => {
        if (v === null || v === undefined) return "-";
        const n = Number(v);
        const cls = n < -0.01 ? "text-red" : n > 0.01 ? "text-green" : "";
        return `<span class="${cls}">${fmtNum(v, 4)}</span>`;
    }},
    { key: "correct",            label: "✓",         render: (v) => v ? `<span class="badge badge-green">✓</span>` : `<span class="badge badge-red">✗</span>` },
  ], recentDecisions.slice(-20).reverse()) : `<div class="muted">No decision history available yet.</div>`;

  el.innerHTML = `
    <div class="audit-kpi-strip">
      ${metricCard("Error rate (1m)", errShort !== null ? fmtPct(errShort) : "-", errLong !== null ? `3m avg ${fmtPct(errLong)}` : "")}
      ${metricCard("Consec. errors", streak, streak >= 3 ? "⚠ streak active" : "ok")}
      ${metricCard("Wrong / total", `${totalWrong} / ${totalDec}`, totalDec ? `${fmtPct(totalDec ? totalWrong/totalDec : null)} miss` : "")}
      ${metricCard("Mean utility gap", utilGap !== null ? fmtNum(utilGap, 4) : "-", "avg cost of errors")}
      ${metricCard("Confidence bias", confBias !== null ? fmtNum(confBias, 3) : "-", "> 0 = overconfident")}
      ${metricCard("Penalty active", penaltyActive ? `<span class="badge badge-red">${fmtPct(penalty)}</span>` : `<span class="badge badge-green">None</span>`, penaltyActive ? (audit.penalty_reason || "") : "model calibrated")}
      ${calibDrift !== null ? metricCard("Calib. drift", fmtNum(calibDrift, 3), calibDrift > 0.05 ? "⚠ degrading" : "stable") : ""}
    </div>

    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Blame vector — what signals hurt most</h3>
        <div class="blame-chart">${blameHtml}</div>
        <div class="muted" style="margin-top:8px;font-size:11px;">
          Pearson correlation of each context feature vs utility gap on wrong decisions.
          Positive = signal was high when we erred; negative = signal helped.
        </div>
      </div>
      <div class="card">
        <h3>Audit narrative</h3>
        <div class="small-list">
          ${((audit.calibration_narrative || audit.narrative) || []).map((line) => `<div>${line}</div>`).join("") || `<div class="muted">No narrative available.</div>`}
          ${(blameObj.narrative || []).map((line) => `<div class="muted">${line}</div>`).join("")}
        </div>
        ${penaltyActive ? `
          <div class="audit-penalty-box">
            <strong>Confidence penalty: −${fmtPct(penalty)}</strong>
            <div>${audit.penalty_reason || ""}</div>
          </div>
        ` : ""}
      </div>
    </div>

    <div class="card" style="margin-top:10px;">
      <h3>Recent decisions log</h3>
      ${recentHtml}
    </div>
  `;
}

async function renderChrono() {
  const el = document.getElementById("chrono-panel");
  if (!el) return;

  let c;
  try {
    c = await fetchJson("/api/chrono");
  } catch (_) {
    el.innerHTML = `<div class="muted">Chrono fragility panel not available yet.</div>`;
    return;
  }

  if (!c || c.available === false) {
    el.innerHTML = `<div class="muted">${c?.error || "No chrono panel found — run chrono fragility research first."}</div>`;
    return;
  }

  const level   = c.alert_level || "NORMAL";
  const ceiling = c.beta_ceiling ?? 0.85;
  const frag    = c.fragility_score ?? null;
  const frag20  = c.frag_20d_mean ?? null;
  const trend   = c.frag_trend || "stable";
  const state   = c.chrono_state || "unknown";
  const streak  = c.surprise_streak ?? 0;
  const surp    = c.surprise ?? null;
  const days    = c.alert_days_persisted ?? 1;
  const asOf    = c.as_of_date || "";

  // Level → colour
  const levelColor = {
    NORMAL_PERMISSIVE: COLORS.teal,
    NORMAL:            COLORS.muted || "#888",
    ELEVATED:          COLORS.equity || "#f0a500",
    HIGH:              "#e07830",
    EXTREME:           COLORS.drawdown,
  }[level] || "#888";

  const trendArrow = trend === "rising" ? "↑" : trend === "falling" ? "↓" : "→";
  const trendColor = trend === "rising" ? COLORS.drawdown : trend === "falling" ? COLORS.teal : "";

  // Build level bar — 5 levels, highlight current
  const LEVELS = ["NORMAL_PERMISSIVE","NORMAL","ELEVATED","HIGH","EXTREME"];
  const CEILINGS = [1.00, 0.85, 0.60, 0.40, 0.25];
  const levelBarHtml = LEVELS.map((lvl, i) => {
    const active = lvl === level;
    const col = {
      NORMAL_PERMISSIVE: COLORS.teal,
      NORMAL:            "#888",
      ELEVATED:          COLORS.equity || "#f0a500",
      HIGH:              "#e07830",
      EXTREME:           COLORS.drawdown,
    }[lvl];
    return `<div class="chrono-level-cell ${active ? 'chrono-level-active' : ''}" style="${active ? `background:${col};color:#fff;` : `border-color:${col};color:${col};`}">
      <div class="chrono-level-name">${lvl.replace('_',' ')}</div>
      <div class="chrono-level-ceil">β ≤ ${(CEILINGS[i]*100).toFixed(0)}%</div>
    </div>`;
  }).join("");

  const narrativeHtml = (c.narrative || [])
    .map((line) => `<div style="margin-bottom:4px;">${line}</div>`)
    .join("") || `<div class="muted">No narrative available.</div>`;

  el.innerHTML = `
    <div class="chrono-header-row">
      <div class="chrono-badge" style="background:${levelColor};">
        ${level.replace(/_/g," ")}
      </div>
      <div class="chrono-ceiling-box">
        <span class="muted">Beta ceiling</span>
        <strong class="mono" style="font-size:1.6rem;">${(ceiling*100).toFixed(0)}%</strong>
      </div>
      <div class="chrono-meta">
        <div>Fragility <strong>${frag !== null ? frag.toFixed(3) : "—"}</strong>
          <span style="color:${trendColor}">${trendArrow}</span>
          <span class="muted">(20d avg ${frag20 !== null ? frag20.toFixed(3) : "—"})</span>
        </div>
        <div>State <strong>${state}</strong> · Surprise <strong>${surp !== null ? surp.toFixed(2) : "—"}</strong>${streak > 0 ? ` · <span style="color:${COLORS.drawdown}">Streak ${streak}d</span>` : ""}</div>
        <div class="muted">Alert for ${days} day${days===1?'':'s'} · As of ${asOf}</div>
      </div>
    </div>

    <div class="chrono-level-bar">${levelBarHtml}</div>

    <div class="grid-two" style="margin-top:10px;">
      <div class="card">
        <h3>Alert narrative</h3>
        <div class="small-list">${narrativeHtml}</div>
      </div>
      <div class="card">
        <h3>Beta ceiling by level</h3>
        ${LEVELS.map((lvl, i) => {
          const active = lvl === level;
          const col = {NORMAL_PERMISSIVE:COLORS.teal,NORMAL:"#888",ELEVATED:COLORS.equity||"#f0a500",HIGH:"#e07830",EXTREME:COLORS.drawdown}[lvl];
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <div style="width:10px;height:10px;border-radius:50%;background:${col};flex-shrink:0;"></div>
            <div style="flex:1;font-size:12px;${active?'font-weight:700;':''}">${lvl.replace(/_/g,' ')}</div>
            <div class="mono" style="font-size:12px;">β ≤ ${(CEILINGS[i]*100).toFixed(0)}%</div>
            ${active ? `<div class="badge badge-active" style="background:${col};color:#fff;">NOW</div>` : ''}
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function renderAll() {
  renderTopStrip();
  renderWarnings();
  renderCommand();
  renderPerformance();
  renderStructural();
  renderHedges();
  renderSectors();
  renderInternational();
  renderPortfolio();
  renderRegimes();
  renderAudit();
  renderChrono();
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
