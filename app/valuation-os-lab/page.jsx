"use client";

import { useMemo, useState } from "react";
import styles from "./valuation-os-lab.module.css";

const companies = {
  compounder: {
    ticker: "CONST",
    name: "Constellation Software",
    sector: "Vertical market software",
    price: 3320,
    baseFcf: 112,
    revenueCagr: 0.095,
    margin: 0.295,
    roic: 0.24,
    terminalRoic: 0.17,
    wacc: 0.085,
    terminalGrowth: 0.027,
    reinvestment: 0.43,
    dilution: -0.006,
    moatHalfLife: 11,
    thesisQuality: 0.84,
    demandSupply: 0.76,
    bottleneckPower: 0.63,
    dataQuality: 0.81,
    modelRisk: 0.23,
    beta: 0.76,
  },
  cyclical: {
    ticker: "CYCLE",
    name: "Semiconductor Equipment",
    sector: "Capacity-cycle industrial tech",
    price: 178,
    baseFcf: 8.6,
    revenueCagr: 0.065,
    margin: 0.225,
    roic: 0.19,
    terminalRoic: 0.13,
    wacc: 0.091,
    terminalGrowth: 0.024,
    reinvestment: 0.52,
    dilution: 0.003,
    moatHalfLife: 6,
    thesisQuality: 0.82,
    demandSupply: 0.88,
    bottleneckPower: 0.91,
    dataQuality: 0.74,
    modelRisk: 0.36,
    beta: 1.18,
  },
  bank: {
    ticker: "COREB",
    name: "Regional Bank",
    sector: "Credit and deposit beta",
    price: 48,
    baseFcf: 4.2,
    revenueCagr: 0.035,
    margin: 0.165,
    roic: 0.12,
    terminalRoic: 0.105,
    wacc: 0.102,
    terminalGrowth: 0.018,
    reinvestment: 0.36,
    dilution: 0.007,
    moatHalfLife: 3.8,
    thesisQuality: 0.52,
    demandSupply: 0.46,
    bottleneckPower: 0.28,
    dataQuality: 0.69,
    modelRisk: 0.44,
    beta: 1.34,
  },
};

const assumptionSchema = [
  {
    key: "revenueCagr",
    label: "Revenue CAGR Y1-Y5",
    fmt: "pct",
    low: 0.01,
    high: 0.18,
    falsifier: "Two reports below cohort and unit growth bridge",
    source: "Segment revenue, backlog, customer disclosures",
  },
  {
    key: "margin",
    label: "EBIT margin Y5",
    fmt: "pct",
    low: 0.08,
    high: 0.42,
    falsifier: "Mix improves while contribution margin falls",
    source: "Reported EBIT, SBC, leases, R&D capitalization",
  },
  {
    key: "roic",
    label: "ROIC Y5",
    fmt: "pct",
    low: 0.06,
    high: 0.34,
    falsifier: "Incremental capital earns below WACC for 6 quarters",
    source: "Adjusted NOPAT and invested capital tie-out",
  },
  {
    key: "terminalRoic",
    label: "Terminal ROIC",
    fmt: "pct",
    low: 0.06,
    high: 0.24,
    falsifier: "Competitor supply enters without pricing response",
    source: "Comparable fade priors and industry structure",
  },
  {
    key: "wacc",
    label: "After-tax WACC",
    fmt: "pct",
    low: 0.055,
    high: 0.14,
    falsifier: "Leverage spreads detach from operating risk",
    source: "Rates, beta, spread, leverage regime",
  },
  {
    key: "terminalGrowth",
    label: "Terminal growth",
    fmt: "pct",
    low: 0.005,
    high: 0.04,
    falsifier: "Growth requires reinvestment above steady ROIIC",
    source: "Inflation, volume runway, saturation checks",
  },
  {
    key: "reinvestment",
    label: "Reinvestment rate",
    fmt: "pct",
    low: 0.15,
    high: 0.72,
    falsifier: "Growth continues while working capital and capex shrink",
    source: "Capex, working capital, acquisition split",
  },
  {
    key: "dilution",
    label: "Net dilution",
    fmt: "pct",
    low: -0.02,
    high: 0.035,
    falsifier: "Buybacks offset SBC but share count still rises",
    source: "SBC, repurchases, options, RSUs",
  },
  {
    key: "thesisQuality",
    label: "Qualitative thesis",
    fmt: "score",
    low: 0.2,
    high: 0.95,
    falsifier: "Narrative remains intact while customer behavior, product edge, or unit economics deteriorate",
    source: "Moat evidence, customer pull, management execution, optionality",
  },
  {
    key: "demandSupply",
    label: "Demand / supply setup",
    fmt: "score",
    low: 0.15,
    high: 0.95,
    falsifier: "Demand slows or new supply enters faster than pricing can adjust",
    source: "Backlog, capacity additions, utilization, inventory, pricing",
  },
  {
    key: "bottleneckPower",
    label: "Bottleneck power",
    fmt: "score",
    low: 0.1,
    high: 0.98,
    falsifier: "Customers find substitutes or capacity ceases to constrain the system",
    source: "Scarcity, substitute availability, switching cost, lead times",
  },
  {
    key: "moatHalfLife",
    label: "Moat half-life",
    fmt: "yrs",
    low: 1,
    high: 15,
    falsifier: "ROIC spread decays faster than sector analogues",
    source: "Historical excess ROIC persistence",
  },
];

const engines = [
  ["truth", "Data Truth", "Checks source quality before the model speaks"],
  ["accounting", "Accounting", "Connects reported numbers to economic FCF"],
  ["twin", "Business Twin", "Maps the thesis into linked business drivers"],
  ["bayes", "Bayesian", "Turns uncertainty into probabilities and priors"],
  ["value", "Valuation", "Compares intrinsic value with market price"],
  ["expect", "Expectations", "Shows what growth and ROIC the price requires"],
  ["flows", "Price Formation", "Separates fundamentals from market flows"],
  ["calibration", "Calibration", "Scores model trust and walk-forward risk"],
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function scaleDriver(value, factor, offset = 0) {
  return isFiniteNumber(value) ? value * factor + offset : value;
}

function fmtPct(value, digits = 1) {
  if (!isFiniteNumber(value)) return "N/A";
  return `${(value * 100).toFixed(digits)}%`;
}

function fmtMoney(value) {
  if (!isFiniteNumber(value)) return "N/A";
  if (value >= 1000) return `$${value.toFixed(0)}`;
  if (value >= 100) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}

function fmtValue(value, fmt) {
  if (!isFiniteNumber(value)) return "N/A";
  if (fmt === "pct") return fmtPct(value);
  if (fmt === "yrs") return `${value.toFixed(1)}y`;
  if (fmt === "score") return `${Math.round(value * 100)}/100`;
  return value.toFixed(2);
}

function driverOr(current, key) {
  return isFiniteNumber(current?.[key]) ? current[key] : companies.compounder[key];
}

function valueAt(drivers) {
  const required = [
    drivers.baseFcf,
    drivers.revenueCagr,
    drivers.margin,
    drivers.terminalRoic,
    drivers.wacc,
    drivers.terminalGrowth,
    drivers.reinvestment,
    drivers.moatHalfLife,
    drivers.dilution,
    drivers.thesisQuality,
    drivers.demandSupply,
    drivers.bottleneckPower,
  ];
  if (required.some((value) => !isFiniteNumber(value))) return null;
  const thesisMultiplier = 0.88 + drivers.thesisQuality * 0.24;
  const demandMultiplier = 0.9 + drivers.demandSupply * 0.22;
  const bottleneckMultiplier = 0.94 + drivers.bottleneckPower * 0.16;
  const effectiveCagr = clamp(drivers.revenueCagr * demandMultiplier * bottleneckMultiplier, -0.04, 0.24);
  const growthPower = Math.pow(1 + effectiveCagr, 5);
  const marginQuality = 0.72 + drivers.margin * 1.25;
  const roicSpread = Math.max(0, drivers.terminalRoic - drivers.wacc);
  const reinvestmentRelief = 1 - drivers.bottleneckPower * 0.08;
  const reinvestmentDrag = 1 - clamp(drivers.reinvestment * 0.34 * reinvestmentRelief, 0.035, 0.28);
  const moatMultiplier = 1 + clamp((drivers.moatHalfLife / 30) * thesisMultiplier, 0.03, 0.62);
  const terminalDenominator = Math.max(0.026, drivers.wacc - drivers.terminalGrowth);
  const steadyFcf = drivers.baseFcf * growthPower * marginQuality * reinvestmentDrag;
  const terminal = steadyFcf * (1 + drivers.terminalGrowth) / terminalDenominator;
  const structuralBonus = 1 + (drivers.thesisQuality + drivers.demandSupply + drivers.bottleneckPower - 1.5) * 0.08;
  const fadeBonus = (1 + roicSpread * 2.5 * moatMultiplier) * structuralBonus;
  const dilutionPenalty = Math.pow(1 + drivers.dilution, 5);
  return (steadyFcf * 4.2 + terminal * 0.62 * fadeBonus) / dilutionPenalty;
}

function impliedCagrForPrice(drivers) {
  if (!isFiniteNumber(drivers.price) || !isFiniteNumber(drivers.baseFcf)) return null;
  let best = drivers.revenueCagr;
  let bestGap = Infinity;
  for (let cagr = -0.02; cagr <= 0.22; cagr += 0.001) {
    const candidate = valueAt({ ...drivers, revenueCagr: cagr });
    const gap = Math.abs(candidate - drivers.price);
    if (gap < bestGap) {
      best = cagr;
      bestGap = gap;
    }
  }
  return best;
}

function buildDistribution(drivers, valuation) {
  if (!isFiniteNumber(valuation) || !isFiniteNumber(drivers.price)) {
    return { rows: [], p10: null, p50: null, p90: null, probAbovePrice: null };
  }
  const rows = Array.from({ length: 41 }, (_, index) => {
    const z = (index - 20) / 6;
    const x = valuation * (1 + z * (0.08 + drivers.modelRisk * 0.14));
    const shape = Math.exp(-0.5 * z * z) * (0.72 + Math.sin(index * 1.8) * 0.06);
    return { x, y: Math.max(0.03, shape) };
  });
  const sorted = rows.map((row) => row.x).sort((a, b) => a - b);
  return {
    rows,
    p10: sorted[4],
    p50: sorted[20],
    p90: sorted[36],
    probAbovePrice: clamp(0.5 + (valuation / drivers.price - 1) * 0.9, 0.03, 0.97),
  };
}

function buildSurface(drivers) {
  const cagrValues = Array.from({ length: 7 }, (_, i) => 0.02 + i * 0.025);
  const roicValues = Array.from({ length: 6 }, (_, i) => 0.08 + i * 0.025);
  return roicValues
    .slice()
    .reverse()
    .map((roic) =>
      cagrValues.map((cagr) => {
        const v = valueAt({ ...drivers, revenueCagr: cagr, terminalRoic: roic });
        const ratio =
          isFiniteNumber(v) && isFiniteNumber(drivers.price)
            ? clamp((v / drivers.price - 0.55) / 1.4, 0, 1)
            : null;
        return { cagr, roic, v, ratio };
      }),
    );
}

function SparkBars({ rows, price }) {
  if (!rows.length) {
    return <div className={styles.emptyChart}>Valuation disabled until required drivers are loaded.</div>;
  }
  const max = Math.max(...rows.map((row) => row.y));
  return (
    <div className={styles.histogram} aria-label="Valuation distribution">
      {rows.map((row, index) => (
        <span
          key={index}
          style={{
            height: `${Math.max(6, (row.y / max) * 100)}%`,
            opacity: row.x > price ? 0.98 : 0.42,
          }}
          title={`${fmtMoney(row.x)} per share`}
        />
      ))}
      <i style={{ left: "50%" }} />
    </div>
  );
}

function Surface({ surface, price }) {
  const hasValidSurface = surface.flat().some((cell) => isFiniteNumber(cell.v) && isFiniteNumber(price));
  return (
    <div className={styles.surfaceWrap}>
      <div className={styles.yAxis}>Terminal ROIC</div>
      <div className={`${styles.surfaceGrid} ${hasValidSurface ? "" : styles.surfaceGridDisabled}`}>
        {surface.flat().map((cell) => {
          const validCell = isFiniteNumber(cell.v) && isFiniteNumber(price);
          const ratio = validCell ? cell.ratio : 0;
          const hue = 24 + ratio * 160;
          const alpha = 0.2 + ratio * 0.58;
          return (
            <div
              key={`${cell.cagr}-${cell.roic}`}
              className={`${styles.surfaceCell} ${validCell ? "" : styles.surfaceCellDisabled}`}
              style={{ background: `hsla(${hue}, 62%, 48%, ${alpha})` }}
              title={`CAGR ${fmtPct(cell.cagr)} / ROIC ${fmtPct(cell.roic)} -> ${fmtMoney(cell.v)}`}
            >
              <span>{validCell ? Math.round((cell.v / price) * 100) : "N/A"}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.xAxis}>Revenue CAGR Y1-Y5</div>
    </div>
  );
}

function MiniLine({ points, tone = "teal" }) {
  const width = 220;
  const height = 72;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const d = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((value - min) / Math.max(0.001, max - min)) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className={styles.miniLine} viewBox={`0 0 ${width} ${height}`} role="img">
      <path d={d} data-tone={tone} />
    </svg>
  );
}

function RangeBar({ value, low, high }) {
  const pos = clamp((value - low) / Math.max(0.001, high - low), 0, 1) * 100;
  return (
    <div className={styles.rangeBar}>
      <span style={{ left: `${pos}%` }} />
    </div>
  );
}

function fmtOptional(value, formatter) {
  return isFiniteNumber(value) ? formatter(value) : "Missing";
}

function factMoney(value) {
  if (!isFiniteNumber(value)) return "Missing";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  return fmtMoney(value);
}

function statusCopy(status) {
  if (status === "ok") return "Final editor complete";
  if (status === "rate_limited") return "Local verdict active; final editor cooling down";
  if (status === "error") return "Local verdict active; final editor failed";
  if (status === "unavailable") return "Local verdict active; no LLM key needed";
  return "Local verdict active";
}

function plainDecision(upside, feasibility, missingDrivers) {
  if (missingDrivers.length) return "Incomplete";
  if (!isFiniteNumber(upside)) return "Needs inputs";
  if (upside > 0.15 && feasibility > 0.55) return "Attractive but verify";
  if (upside < -0.1) return "Price looks demanding";
  return "Close call";
}

function EngineMetric({ label, value, tone }) {
  return (
    <div className={styles.engineMetric} data-tone={tone || "neutral"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BulletList({ items }) {
  const visibleItems = items.filter(Boolean).slice(0, 5);
  if (!visibleItems.length) return null;
  return (
    <ul className={styles.bulletList}>
      {visibleItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function EngineConsole({
  activeEngine,
  adjustedDrivers,
  distribution,
  expectedIrr,
  feasibility,
  impliedCagr,
  liveSnapshot,
  missingDrivers,
  mode,
  onRunDebate,
  quality,
  tripwires,
  upside,
  valuation,
  debate,
  debateStatus,
}) {
  const coverage = liveSnapshot?.coverage || {};
  const facts = liveSnapshot?.facts || {};
  const assumptions = liveSnapshot?.assumptions || {};
  const fiscalYear = liveSnapshot?.company?.fiscalYear || "latest";
  const activeFalsifiers = tripwires.map((item) => item.falsifier || item.label);
  const panels = {
    truth: {
      eyebrow: "Source confidence",
      title: "Data Truth",
      copy:
        missingDrivers.length > 0
          ? "The model has live data, but the missing fields make the output provisional."
          : "The inputs are complete enough to treat the next views as source-backed.",
      plain: "This answers: can we trust the inputs before debating value?",
      technical: "Checks SEC companyfacts, quote source, FRED rate, missing drivers, and data lineage.",
      metrics: [
        ["SEC filing", liveSnapshot ? `${liveSnapshot.company?.form || "SEC"} / FY${fiscalYear}` : "Local kernel"],
        ["Industry policy", assumptions.industry?.label || "Local prior"],
        ["Quote", coverage.quoteSource || "Missing"],
        ["Data quality", fmtPct(quality, 0), quality >= 0.65 ? "good" : "warn"],
      ],
      bullets: [
        liveSnapshot
          ? `Companyfacts status: ${coverage.secCompanyFacts ? "loaded" : "not loaded"}`
          : "Using local thesis kernel until a SEC snapshot is loaded.",
        assumptions.riskFree
          ? `Risk-free anchor: ${fmtOptional(assumptions.riskFree.value, fmtPct)} from ${assumptions.riskFree.source}.`
          : coverage.fredConfigured
            ? "Risk-free rate source is configured."
            : "Risk-free rate source is not configured.",
        assumptions.industry?.sicDescription ? `SEC industry hint: ${assumptions.industry.sicDescription}.` : null,
        coverage.quoteSource ? `Market quote source is available: ${coverage.quoteSource}.` : "Market quote provider is missing or unavailable.",
        isFiniteNumber(facts.revenue) ? `Revenue fact: ${factMoney(facts.revenue)}` : null,
        missingDrivers.length ? `Missing: ${missingDrivers.join(", ")}` : null,
      ],
    },
    accounting: {
      eyebrow: "Accounting bridge",
      title: "Accounting",
      copy:
        "Reported accounting is converted into the economics that matter for valuation.",
      plain: "This answers: is the business really producing cash at attractive returns?",
      technical: "Compares FCF/share, margin, ROIC, WACC, reinvestment, and terminal growth consistency.",
      metrics: [
        ["FCF / share", fmtMoney(adjustedDrivers.baseFcf)],
        ["Revenue CAGR", fmtOptional(adjustedDrivers.revenueCagr, fmtPct)],
        ["Margin", fmtOptional(adjustedDrivers.margin, fmtPct)],
        ["ROIC - WACC", fmtOptional(adjustedDrivers.roic - adjustedDrivers.wacc, fmtPct), adjustedDrivers.roic >= adjustedDrivers.wacc ? "good" : "bad"],
      ],
      bullets: [
        assumptions.wacc && isFiniteNumber(assumptions.wacc.beta)
          ? `WACC build: beta ${assumptions.wacc.beta.toFixed(2)}, ERP ${fmtPct(assumptions.wacc.equityRiskPremium)}, debt weight ${fmtPct(assumptions.wacc.debtWeight)}.`
          : null,
        `Reinvestment rate: ${fmtOptional(adjustedDrivers.reinvestment, fmtPct)}.`,
        `Terminal growth: ${fmtOptional(adjustedDrivers.terminalGrowth, fmtPct)}.`,
        isFiniteNumber(adjustedDrivers.roic) && isFiniteNumber(adjustedDrivers.wacc) && adjustedDrivers.roic < adjustedDrivers.wacc
          ? "Accounting warning: ROIC does not clear WACC."
          : "Accounting bridge clears the basic ROIC hurdle.",
        isFiniteNumber(facts.operatingCashFlow) ? `Operating cash flow fact: ${factMoney(facts.operatingCashFlow)}.` : null,
        isFiniteNumber(facts.capex) ? `Capex fact: ${factMoney(facts.capex)}.` : null,
      ],
    },
    twin: {
      eyebrow: "Thesis mechanics",
      title: "Business Twin",
      copy:
        "The thesis is expressed as linked drivers instead of a single fair-value number.",
      plain: "This answers: what must be true about the business for the thesis to work?",
      technical: "Connects revenue CAGR, reinvestment, ROIC fade, moat half-life, and falsifiers.",
      metrics: [
        ["Scenario", mode],
        ["Thesis quality", fmtValue(adjustedDrivers.thesisQuality, "score")],
        ["Demand / supply", fmtValue(adjustedDrivers.demandSupply, "score")],
        ["Bottleneck", fmtValue(adjustedDrivers.bottleneckPower, "score")],
        ["Tripwires", String(tripwires.length), tripwires.length > 3 ? "warn" : "neutral"],
      ],
      bullets: [
        `Current value path: ${fmtMoney(valuation)} versus price ${fmtMoney(adjustedDrivers.price)}.`,
        `Fade anchor: terminal ROIC ${fmtOptional(adjustedDrivers.terminalRoic, fmtPct)} and WACC ${fmtOptional(adjustedDrivers.wacc, fmtPct)}.`,
        `Qualitative thesis ${fmtValue(adjustedDrivers.thesisQuality, "score")} modifies fade confidence; demand/supply ${fmtValue(adjustedDrivers.demandSupply, "score")} modifies growth feasibility.`,
        `Bottleneck power ${fmtValue(adjustedDrivers.bottleneckPower, "score")} captures whether scarcity and substitution risk support pricing.`,
        activeFalsifiers[0] || "No boundary falsifier is currently at the edge of its range.",
        activeFalsifiers[1] || null,
      ],
    },
    bayes: {
      eyebrow: "Uncertainty layer",
      title: "Bayesian",
      copy:
        "The model weighs the thesis against what the market already seems to believe.",
      plain: "This answers: how confident should we be, given uncertainty and market expectations?",
      technical: "Uses feasibility, implied CAGR, probability above price, and model-risk penalties.",
      metrics: [
        ["Feasibility", fmtPct(feasibility, 0), feasibility >= 0.55 ? "good" : "warn"],
        ["Above price", fmtPct(distribution.probAbovePrice, 0)],
        ["Implied CAGR", fmtPct(impliedCagr)],
        ["Structural support", fmtValue((adjustedDrivers.thesisQuality + adjustedDrivers.demandSupply + adjustedDrivers.bottleneckPower) / 3, "score")],
      ],
      bullets: [
        `Expected 5Y IRR: ${fmtPct(expectedIrr)}.`,
        `Upside/downside: ${fmtPct(upside)}.`,
        isFiniteNumber(impliedCagr) && isFiniteNumber(adjustedDrivers.revenueCagr) && impliedCagr > adjustedDrivers.revenueCagr
          ? "Market-implied growth is above the current thesis input."
          : "Thesis growth is not below market-implied growth.",
        missingDrivers.length ? "Posterior should stay wide because live data is incomplete." : null,
      ],
    },
    value: {
      eyebrow: "Intrinsic value",
      title: "Valuation",
      copy: "Intrinsic value is compared with price, expected IRR, and model disagreement.",
      plain: "This answers: does the current price leave enough margin of safety?",
      technical: "Anchors on fade DCF, then checks residual income, APV, SOTP, and downside floor.",
      metrics: [
        ["Value / share", fmtMoney(valuation)],
        ["Market price", fmtMoney(adjustedDrivers.price)],
        ["Upside", fmtPct(upside), upside >= 0 ? "good" : "bad"],
        ["Expected IRR", fmtPct(expectedIrr)],
      ],
      bullets: [
        "Fade DCF remains the primary lens; residual income and APV are used as disagreement checks.",
        `Probability above price: ${fmtPct(distribution.probAbovePrice, 0)}.`,
      ],
    },
    expect: {
      eyebrow: "Market expectations",
      title: "Expectations",
      copy: "The surface shows which growth and ROIC combinations would justify today's price.",
      plain: "This answers: what is the market already pricing in?",
      technical: "Reverse DCF solves for implied revenue CAGR against terminal ROIC and WACC assumptions.",
      metrics: [
        ["Implied CAGR", fmtPct(impliedCagr)],
        ["Thesis CAGR", fmtOptional(adjustedDrivers.revenueCagr, fmtPct)],
        ["Feasibility", fmtPct(feasibility, 0)],
        ["Falsifiers", String(tripwires.length)],
      ],
      bullets: [
        "Use the surface below to see where market expectations become plausible or fragile.",
        assumptions.wacc ? `WACC is bounded by the ${assumptions.industry?.label || "selected"} policy before the reverse DCF is read.` : null,
        activeFalsifiers[0] || null,
      ],
    },
    flows: {
      eyebrow: "Market plumbing",
      title: "Price Formation",
      copy: "Market flows are kept separate from the company-value estimate.",
      plain: "This answers: could price move for reasons unrelated to intrinsic value?",
      technical: "Tracks beta, dilution/buybacks, passive pressure, short pressure, and liquidity support.",
      metrics: [
        ["Beta", isFiniteNumber(adjustedDrivers.beta) ? adjustedDrivers.beta.toFixed(2) : "N/A"],
        ["Buyback proxy", adjustedDrivers.dilution < 0 ? "Supportive" : "Dilutive"],
        ["Net dilution", fmtOptional(adjustedDrivers.dilution, fmtPct)],
        ["Price gap", fmtPct(upside)],
      ],
      bullets: [
        "A good business can still be a bad entry if flow support is already exhausted.",
        "Flow checks are deliberately kept separate from intrinsic value.",
      ],
    },
    calibration: {
      eyebrow: "Model trust",
      title: "Calibration",
      copy: "Calibration decides how much confidence the model deserves.",
      plain: "This answers: should the output be read as a signal, a watch item, or noise?",
      technical: "Combines data quality, model risk, walk-forward checks, and final-agent status.",
      metrics: [
        ["Data quality", fmtPct(quality, 0)],
        ["Model risk", fmtPct(adjustedDrivers.modelRisk, 0)],
        ["Feasibility", fmtPct(feasibility, 0)],
        ["Final checks", debate?.agents?.length ? "Debated" : "Pending"],
      ],
      bullets: [
        "Model risk penalizes confidence even when the point estimate looks attractive.",
        debate?.final_orchestrator ? statusCopy(debate.final_orchestrator.status) : "Run the debate to add the final orchestrator layer.",
      ],
    },
  };
  const panel = panels[activeEngine] || panels.expect;
  const final = debate?.final_orchestrator;
  const finalAnalysis = final?.analysis || debate?.deterministic_verdict;
  const researchability = finalAnalysis?.researchability || debate?.researchability;
  const quickKill = finalAnalysis?.quick_kill || debate?.quick_kill;
  const scorecard = finalAnalysis?.scorecard || debate?.agents || [];
  const bullCase = finalAnalysis?.bull_case || finalAnalysis?.strongest_points || [];
  const bearCase = finalAnalysis?.bear_case || finalAnalysis?.red_team || [];
  const killCriteria = finalAnalysis?.kill_criteria || quickKill?.checks?.filter((item) => item.status !== "pass").map((item) => `${item.label}: ${item.note}`) || [];
  const engineIndex = engines.findIndex(([key]) => key === activeEngine);

  return (
    <section className={styles.engineConsole} aria-label="Valuation engine console">
      <div className={styles.engineConsoleTop}>
        <div>
          <span>{panel.eyebrow}</span>
          <h2>
            {String(engineIndex + 1).padStart(2, "0")} {panel.title}
          </h2>
          <p>{panel.copy}</p>
          <div className={styles.explainPair}>
            <span>Plain read</span>
            <strong>{panel.plain}</strong>
            <span>Technical read</span>
            <strong>{panel.technical}</strong>
          </div>
        </div>
        <div className={styles.debateActions}>
          <button type="button" onClick={onRunDebate} disabled={debateStatus.state === "loading"}>
            {debateStatus.state === "loading" ? "Running debate" : "Run valuation debate"}
          </button>
          <small>0 specialist LLM calls / 1 final call max</small>
        </div>
      </div>
      <div className={styles.engineMetrics}>
        {panel.metrics.map(([label, value, tone]) => (
          <EngineMetric key={label} label={label} value={value} tone={tone} />
        ))}
      </div>
      <div className={styles.engineGrid}>
        <div className={styles.engineCard}>
          <strong>Current read</strong>
          <BulletList items={panel.bullets} />
        </div>
        <div className={styles.engineCard}>
          <strong>Debate status</strong>
          <p>{debateStatus.message || "Run the valuation debate to restore the specialist panel and final verdict."}</p>
          {debate?.agents?.length ? (
            <div className={styles.agentVotes}>
              {debate.agents.slice(0, 5).map((item) => (
                <span key={item.id} data-vote={item.vote}>
                  {item.label.replace(/^\d+\s*/, "")}: {item.vote}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {debate?.agents?.length ? (
        <div className={styles.debatePanel}>
          <div className={styles.debateHeader}>
            <div>
              <span>Investment committee</span>
              <h3>{finalAnalysis?.decision || "Final verdict"}</h3>
              <p>{finalAnalysis?.one_line_conclusion || finalAnalysis?.executive_judgment}</p>
            </div>
            <div className={styles.verdictBadges}>
              <mark>{final ? statusCopy(final.status) : "Local verdict"}</mark>
              {researchability?.grade ? <mark>Research file {researchability.grade}</mark> : null}
              {finalAnalysis?.composite_score ? <mark>{finalAnalysis.composite_score}/5</mark> : null}
            </div>
          </div>
          <div className={styles.committeeStrip}>
            <div>
              <span>Researchability</span>
              <strong>{researchability?.label || "Source file pending"}</strong>
              <p>{researchability?.strategy || "Run the committee after loading a ticker."}</p>
            </div>
            <div>
              <span>Quick kill</span>
              <strong>{quickKill?.hard_fail ? "Hard gate tripped" : `${quickKill?.tally?.fail || 0} fails / ${quickKill?.tally?.warn || 0} warns`}</strong>
              <p>{quickKill?.hard_fail ? "The model blocks sizing until the flagged item is repaired." : "No hard stop; read the warnings before sizing."}</p>
            </div>
          </div>
          <div className={styles.agentGrid}>
            {scorecard.map((item) => (
              <article key={item.id || item.label} className={styles.agentCard} data-vote={item.vote}>
                <span>{item.label}</span>
                <strong>{item.stance || item.role}</strong>
                <small>{item.role || item.lens}</small>
                <p>{item.summary}</p>
                {item.score_5 ? <mark>{item.score_5}/5</mark> : null}
              </article>
            ))}
          </div>
          <div className={styles.caseGrid}>
            <article className={styles.orchestratorCard}>
              <span>Team lead</span>
              <p>{finalAnalysis?.executive_judgment}</p>
              <div>
                <strong>Bull case</strong>
                <BulletList items={bullCase} />
              </div>
            </article>
            <article className={styles.orchestratorCard}>
              <span>Red team</span>
              <div>
                <strong>Bear case</strong>
                <BulletList items={bearCase} />
              </div>
              <div>
                <strong>What would break it</strong>
                <BulletList items={killCriteria.length ? killCriteria : finalAnalysis?.open_questions || []} />
              </div>
            </article>
          </div>
          {quickKill?.checks?.length ? (
            <div className={styles.quickKillGrid}>
              {quickKill.checks.map((item) => (
                <span key={item.id} data-status={item.status}>
                  <strong>{item.label}</strong>
                  {item.note}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function ValuationOsLabPage() {
  const [companyKey, setCompanyKey] = useState("compounder");
  const [liveCompany, setLiveCompany] = useState(null);
  const [missingDrivers, setMissingDrivers] = useState([]);
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [liveSnapshot, setLiveSnapshot] = useState(null);
  const [liveStatus, setLiveStatus] = useState({ state: "idle", message: "" });
  const [debate, setDebate] = useState(null);
  const [debateStatus, setDebateStatus] = useState({ state: "idle", message: "" });
  const [activeEngine, setActiveEngine] = useState("expect");
  const [mode, setMode] = useState("base");
  const [drivers, setDrivers] = useState(companies.compounder);

  const companyOptions = useMemo(
    () => ({
      ...companies,
      ...(liveCompany ? { live: liveCompany } : {}),
    }),
    [liveCompany],
  );

  function selectCompany(key) {
    const nextCompany = companyOptions[key];
    if (!nextCompany) return;
    setCompanyKey(key);
    setDrivers(nextCompany);
  }

  const adjustedDrivers = useMemo(() => {
    if (mode === "bear") {
      return {
        ...drivers,
        revenueCagr: scaleDriver(drivers.revenueCagr, 0.62),
        margin: scaleDriver(drivers.margin, 0.91),
        terminalRoic: scaleDriver(drivers.terminalRoic, 0.86),
        wacc: scaleDriver(drivers.wacc, 1, 0.012),
        moatHalfLife: scaleDriver(drivers.moatHalfLife, 0.72),
        thesisQuality: clamp(scaleDriver(drivers.thesisQuality, 0.78), 0.05, 0.98),
        demandSupply: clamp(scaleDriver(drivers.demandSupply, 0.72), 0.05, 0.98),
        bottleneckPower: clamp(scaleDriver(drivers.bottleneckPower, 0.7), 0.05, 0.98),
      };
    }
    if (mode === "bull") {
      return {
        ...drivers,
        revenueCagr: scaleDriver(drivers.revenueCagr, 1.24, 0.01),
        margin: scaleDriver(drivers.margin, 1.06),
        terminalRoic: scaleDriver(drivers.terminalRoic, 1.1),
        wacc: scaleDriver(drivers.wacc, 1, -0.006),
        moatHalfLife: scaleDriver(drivers.moatHalfLife, 1.22),
        thesisQuality: clamp(scaleDriver(drivers.thesisQuality, 1.12, 0.03), 0.05, 0.98),
        demandSupply: clamp(scaleDriver(drivers.demandSupply, 1.16, 0.02), 0.05, 0.98),
        bottleneckPower: clamp(scaleDriver(drivers.bottleneckPower, 1.18, 0.02), 0.05, 0.98),
      };
    }
    return drivers;
  }, [drivers, mode]);

  const valuation = useMemo(() => valueAt(adjustedDrivers), [adjustedDrivers]);
  const impliedCagr = useMemo(() => impliedCagrForPrice(adjustedDrivers), [adjustedDrivers]);
  const distribution = useMemo(
    () => buildDistribution(adjustedDrivers, valuation),
    [adjustedDrivers, valuation],
  );
  const surface = useMemo(() => buildSurface(adjustedDrivers), [adjustedDrivers]);
  const selectedEngine = engines.find((engine) => engine[0] === activeEngine);
  const upside =
    isFiniteNumber(valuation) && isFiniteNumber(adjustedDrivers.price)
      ? valuation / adjustedDrivers.price - 1
      : null;
  const expectedIrr =
    isFiniteNumber(upside) && isFiniteNumber(adjustedDrivers.price)
      ? Math.pow(valuation / adjustedDrivers.price, 1 / 5) - 1
      : null;
  const feasibility = clamp(
    isFiniteNumber(impliedCagr) &&
      isFiniteNumber(adjustedDrivers.revenueCagr) &&
      isFiniteNumber(adjustedDrivers.reinvestment) &&
      isFiniteNumber(adjustedDrivers.modelRisk) &&
      isFiniteNumber(adjustedDrivers.thesisQuality) &&
      isFiniteNumber(adjustedDrivers.demandSupply) &&
      isFiniteNumber(adjustedDrivers.bottleneckPower)
      ? 1 -
          Math.abs(adjustedDrivers.revenueCagr - impliedCagr) * 2.8 -
          Math.max(0, adjustedDrivers.reinvestment - 0.6) * 0.7 -
          adjustedDrivers.modelRisk * 0.28 -
          (1 - adjustedDrivers.thesisQuality) * 0.16 -
          (1 - adjustedDrivers.demandSupply) * 0.14 -
          (1 - adjustedDrivers.bottleneckPower) * 0.1
      : 0.05,
    0.05,
    0.95,
  );
  const quality = clamp(
    adjustedDrivers.dataQuality -
      adjustedDrivers.modelRisk * 0.12 +
      (adjustedDrivers.thesisQuality - 0.5) * 0.08 +
      (adjustedDrivers.demandSupply - 0.5) * 0.05,
    0.2,
    0.95,
  );
  const tripwires = assumptionSchema.filter((item) => {
    const value = adjustedDrivers[item.key];
    if (!isFiniteNumber(value)) return true;
    const span = item.high - item.low;
    return value < item.low + span * 0.12 || value > item.high - span * 0.12;
  });
  const plainRead = plainDecision(upside, feasibility, missingDrivers);
  const assumptionPolicy = liveSnapshot?.assumptions || null;
  const assumptionCards = assumptionPolicy
    ? [
        {
          label: "Industry policy",
          value: assumptionPolicy.industry?.label || "Broad operating company",
          note: assumptionPolicy.industry?.sicDescription || "Ticker and SEC profile",
        },
        {
          label: "Risk-free anchor",
          value: fmtOptional(assumptionPolicy.riskFree?.value, fmtPct),
          note: assumptionPolicy.riskFree?.date
            ? `${assumptionPolicy.riskFree.source} / ${assumptionPolicy.riskFree.date}`
            : assumptionPolicy.riskFree?.source || "Explicit fallback",
        },
        {
          label: "WACC build",
          value: fmtOptional(assumptionPolicy.wacc?.value, fmtPct),
          note: isFiniteNumber(assumptionPolicy.wacc?.beta)
            ? `Beta ${assumptionPolicy.wacc.beta.toFixed(2)} + ERP ${fmtPct(assumptionPolicy.wacc.equityRiskPremium)}`
            : "Rate, beta, spread, tax",
        },
        {
          label: "Policy confidence",
          value: fmtOptional(assumptionPolicy.industry?.confidence, (value) => fmtPct(value, 0)),
          note: "Facts loaded + sector cyclicality",
        },
      ]
    : [];

  const fadePath = Array.from({ length: 20 }, (_, index) => {
    const phi = Math.pow(0.5, 1 / adjustedDrivers.moatHalfLife);
    return Math.pow(phi, index) * 100;
  });
  const posteriorPath = Array.from({ length: 24 }, (_, index) => {
    const x = (index - 11.5) / 4.2;
    return Math.exp(-0.5 * x * x) * (1 + Math.sin(index) * 0.04);
  });

  function updateDriver(key, nextValue) {
    setDrivers((current) => ({ ...current, [key]: Number(nextValue) }));
    setDebate(null);
    setDebateStatus({ state: "idle", message: "Driver changed; rerun the debate for a fresh verdict." });
  }

  async function loadLiveSnapshot(event) {
    event?.preventDefault();
    const ticker = tickerInput.trim().toUpperCase();
    if (!ticker) return;
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) {
      setLiveStatus({
        state: "error",
        message: "Ticker must be 1-12 letters, numbers, dots, or dashes.",
      });
      return;
    }

    setLiveStatus({ state: "loading", message: `Loading ${ticker} from SEC/FRED/FMP...` });
    try {
      const response = await fetch(`/valuation-os-lab/api/snapshot?ticker=${encodeURIComponent(ticker)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Snapshot failed for ${ticker}`);
      }

      const nextCompany = {
        ...companies.compounder,
        ticker: payload.company?.ticker || ticker,
        name: payload.company?.entityName || payload.company?.name || ticker,
        sector: payload.company?.fiscalYear
          ? `Latest SEC snapshot FY${payload.company.fiscalYear}`
          : "Latest SEC snapshot",
        price: payload.drivers?.price,
        baseFcf: payload.drivers?.baseFcf,
        revenueCagr: payload.drivers?.revenueCagr,
        margin: payload.drivers?.margin,
        roic: payload.drivers?.roic,
        terminalRoic: payload.drivers?.terminalRoic,
        wacc: payload.drivers?.wacc,
        terminalGrowth: payload.drivers?.terminalGrowth,
        reinvestment: payload.drivers?.reinvestment,
        dilution: payload.drivers?.dilution,
        moatHalfLife: payload.drivers?.moatHalfLife,
        thesisQuality: payload.drivers?.thesisQuality ?? driverOr(drivers, "thesisQuality"),
        demandSupply: payload.drivers?.demandSupply ?? driverOr(drivers, "demandSupply"),
        bottleneckPower: payload.drivers?.bottleneckPower ?? driverOr(drivers, "bottleneckPower"),
        dataQuality: payload.drivers?.dataQuality,
        modelRisk: payload.drivers?.modelRisk,
        beta: payload.drivers?.beta ?? driverOr(drivers, "beta"),
      };

      setLiveCompany(nextCompany);
      setCompanyKey("live");
      setDrivers(nextCompany);
      setLiveSnapshot(payload);
      setMissingDrivers(payload.missingDrivers || []);
      setDebate(null);
      setDebateStatus({ state: "idle", message: "Live snapshot loaded; run the debate for a final verdict." });
      setLiveStatus({
        state: "ready",
        message: `${nextCompany.ticker} loaded: latest SEC ${payload.company?.fiscalYear || "snapshot"}${
          payload.quote?.source ? ` + ${payload.quote.source}` : " without live quote"
        }${payload.riskFree?.value ? " + FRED rate" : ""}${
          payload.valuationReady ? "." : `; missing ${payload.missingDrivers.join(", ")}.`
        }`,
      });
    } catch (error) {
      setLiveStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Snapshot load failed.",
      });
    }
  }

  async function runValuationDebate() {
    setDebateStatus({ state: "loading", message: "Running local specialists and final orchestrator..." });
    try {
      const response = await fetch("/valuation-os-lab/api/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ticker: adjustedDrivers.ticker,
          mode,
          drivers: adjustedDrivers,
          snapshot: liveSnapshot,
          missingDrivers,
          tripwires: tripwires.map((item) => ({
            key: item.key,
            label: item.label,
            falsifier: item.falsifier,
          })),
          valuation,
          upside,
          expectedIrr,
          impliedCagr,
          feasibility,
          quality,
          probabilityAbovePrice: distribution.probAbovePrice,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Valuation debate failed.");
      }
      setDebate(payload.debate);
      setDebateStatus({
        state: "ready",
        message: `${payload.ticker} debate ready: ${statusCopy(payload.debate.final_orchestrator?.status)}${
          payload.cached ? " (cached)" : ""
        }.`,
      });
    } catch (error) {
      setDebateStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Valuation debate failed.",
      });
    }
  }

  return (
    <main className={`${styles.shell} valuation-os-lab-route`}>
      <style jsx global>{`
        body:has(.valuation-os-lab-route) .global-language-dock {
          display: none;
        }
      `}</style>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span>Valuation</span>
          <strong>OS</strong>
        </div>
        <div className={styles.companyCard}>
          <span>Thesis</span>
          <strong>{adjustedDrivers.ticker}</strong>
          <small>{adjustedDrivers.name}</small>
          <em>{adjustedDrivers.sector}</em>
        </div>
        <nav className={styles.engineNav} aria-label="Valuation engines">
          {engines.map(([key, label, description], index) => (
            <button
              key={key}
              type="button"
              data-active={activeEngine === key}
              onClick={() => setActiveEngine(key)}
            >
              <i>{String(index + 1).padStart(2, "0")}</i>
              <span>{label}</span>
              <small>{description}</small>
            </button>
          ))}
        </nav>
        <div className={styles.healthPanel}>
          <span>Thesis health</span>
          <strong>{plainRead}</strong>
          <p>
            Combines valuation gap, feasibility, source quality, qualitative thesis, supply/demand, and falsifiers.
          </p>
          <dl>
            <div>
              <dt>Falsifiers</dt>
              <dd>{tripwires.length} / {assumptionSchema.length}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{fmtPct(feasibility, 0)}</dd>
            </div>
            <div>
              <dt>Data quality</dt>
              <dd>{fmtPct(quality, 0)}</dd>
            </div>
          </dl>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <h1>Reverse DCF + ROIC Fade</h1>
            <p>
              A valuation workspace that shows the assumptions behind the price: source quality,
              ROIC economics, qualitative thesis, supply/demand, bottlenecks, and the falsifiers that would break the thesis.
            </p>
            <div className={styles.heroSummary}>
              <span>Decision read</span>
              <strong>{plainRead}</strong>
              <span>{fmtPct(upside)} value gap</span>
              <span>{fmtPct(feasibility, 0)} feasibility</span>
            </div>
          </div>
          <div className={styles.controls}>
            <form className={styles.liveLoader} onSubmit={loadLiveSnapshot}>
              <input
                value={tickerInput}
                onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
                aria-label="Ticker to load"
                placeholder="AAPL"
              />
              <button type="submit" disabled={liveStatus.state === "loading"}>
                {liveStatus.state === "loading" ? "Loading" : "Load SEC"}
              </button>
            </form>
            <select value={companyKey} onChange={(event) => selectCompany(event.target.value)}>
              <option value="compounder">Compounder kernel</option>
              <option value="cyclical">Semiconductor cycle</option>
              <option value="bank">Bank residual income</option>
              {liveCompany ? <option value="live">Live SEC snapshot</option> : null}
            </select>
            <div className={styles.segmented} aria-label="Scenario mode">
              {["bear", "base", "bull"].map((item) => (
                <button
                  key={item}
                  type="button"
                  data-active={mode === item}
                  onClick={() => setMode(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            {liveStatus.message ? (
              <div className={styles.liveStatus} data-state={liveStatus.state}>
                {liveStatus.message}
              </div>
            ) : null}
          </div>
        </header>

        <section className={styles.orientationStrip} aria-label="Valuation OS reading guide">
          <div>
            <span>1 Source</span>
            <strong>SEC, quote, rate</strong>
            <p>Confirms whether the inputs are usable.</p>
          </div>
          <div>
            <span>2 Economics</span>
            <strong>FCF, ROIC, WACC</strong>
            <p>Shows whether growth earns enough.</p>
          </div>
          <div>
            <span>3 Structure</span>
            <strong>Thesis, supply, bottleneck</strong>
            <p>Shows whether qualitative support makes the numbers plausible.</p>
          </div>
          <div>
            <span>4 Expectations</span>
            <strong>Reverse DCF + verdict</strong>
            <p>Separates market requirements from failure points.</p>
          </div>
        </section>

        <EngineConsole
          activeEngine={activeEngine}
          adjustedDrivers={adjustedDrivers}
          distribution={distribution}
          expectedIrr={expectedIrr}
          feasibility={feasibility}
          impliedCagr={impliedCagr}
          liveSnapshot={liveSnapshot}
          missingDrivers={missingDrivers}
          mode={mode}
          onRunDebate={runValuationDebate}
          quality={quality}
          tripwires={tripwires}
          upside={upside}
          valuation={valuation}
          debate={debate}
          debateStatus={debateStatus}
        />

        <section className={styles.heroGrid}>
          <article className={styles.surfacePanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Expectation Engine</span>
                <h2>Reverse DCF feasibility surface</h2>
                <p>
                  Each cell shows value as a percentage of market price. Higher cells require stronger growth and ROIC.
                </p>
              </div>
              <mark>Market price {fmtMoney(adjustedDrivers.price)}</mark>
            </div>
            <Surface surface={surface} price={adjustedDrivers.price} />
            <div className={styles.surfaceLegend}>
              <span>Below price</span>
              <b>White contour approximates price parity</b>
              <span>Above price</span>
            </div>
          </article>

          <article className={styles.ledgerPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Assumption Ledger</span>
                <h2>Drivers, sources, falsifiers</h2>
                <p>
                  Sliders are the controllable assumptions. The line under each driver is the test that would disprove it.
                </p>
              </div>
              <mark>{tripwires.length} tripped</mark>
            </div>
            {missingDrivers.length ? (
              <div className={styles.missingData}>
                Missing live drivers: {missingDrivers.join(", ")}. Outputs use no prior ticker fallback; fill the
                missing assumptions manually before reading the valuation.
              </div>
            ) : null}
            {assumptionCards.length ? (
              <div className={styles.policyStrip} aria-label="Assumption policy">
                {assumptionCards.map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.note}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.policyStrip} aria-label="Assumption policy">
                <div>
                  <span>Assumption policy</span>
                  <strong>Local prior</strong>
                  <small>Load a ticker to replace generic priors with industry-aware rates.</small>
                </div>
              </div>
            )}
            <div className={styles.assumptionList}>
              {assumptionSchema.map((item) => (
                <label key={item.key} className={styles.assumptionRow}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.source}</small>
                  </div>
                  <input
                    type="range"
                    min={item.low}
                    max={item.high}
                    step={item.fmt === "yrs" ? 0.1 : 0.001}
                    value={isFiniteNumber(drivers[item.key]) ? drivers[item.key] : item.low}
                    onChange={(event) => updateDriver(item.key, event.target.value)}
                  />
                  <em>{fmtValue(adjustedDrivers[item.key], item.fmt)}</em>
                  <span>{item.falsifier}</span>
                </label>
              ))}
            </div>
          </article>
        </section>

        <section className={styles.metricsGrid}>
          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Valuation distribution</span>
                <h3>{fmtMoney(distribution.p50)} median value</h3>
                <p>Range of plausible values after model-risk widening.</p>
              </div>
              <mark>{fmtPct(distribution.probAbovePrice, 0)} above price</mark>
            </div>
            <SparkBars rows={distribution.rows} price={adjustedDrivers.price} />
            <dl className={styles.statStrip}>
              <div>
                <dt>P10</dt>
                <dd>{fmtMoney(distribution.p10)}</dd>
              </div>
              <div>
                <dt>P50</dt>
                <dd>{fmtMoney(distribution.p50)}</dd>
              </div>
              <div>
                <dt>P90</dt>
                <dd>{fmtMoney(distribution.p90)}</dd>
              </div>
            </dl>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Moat half-life</span>
                <h3>{adjustedDrivers.moatHalfLife.toFixed(1)} years</h3>
                <p>How long excess ROIC is assumed to persist.</p>
              </div>
              <mark>Excess ROIC fade</mark>
            </div>
            <MiniLine points={fadePath} />
            <p>
              Competitive advantage decays through an explicit fade path instead of a terminal
              margin typed by hand.
            </p>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>ROIIC posterior</span>
                <h3>{fmtPct(adjustedDrivers.roic)} Y5 ROIC</h3>
                <p>Checks whether new capital can fund growth.</p>
              </div>
              <mark>Prior to posterior</mark>
            </div>
            <MiniLine points={posteriorPath} tone="amber" />
            <p>
              The system asks whether new capital plausibly earns enough to fund the modeled
              growth path.
            </p>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Market-implied expectations</span>
                <h3>{fmtPct(impliedCagr)} implied CAGR</h3>
                <p>Compares market-required growth with the thesis input.</p>
              </div>
              <mark>{isFiniteNumber(upside) && upside >= 0 ? "Discount" : "Premium"}</mark>
            </div>
            <table className={styles.compactTable}>
              <tbody>
                <tr>
                  <th>Revenue CAGR</th>
                  <td>{fmtPct(impliedCagr)}</td>
                  <td>{fmtPct(adjustedDrivers.revenueCagr)}</td>
                </tr>
                <tr>
                  <th>Terminal ROIC</th>
                  <td>{fmtPct(adjustedDrivers.terminalRoic * 0.86)}</td>
                  <td>{fmtPct(adjustedDrivers.terminalRoic)}</td>
                </tr>
                <tr>
                  <th>WACC</th>
                  <td>{fmtPct(adjustedDrivers.wacc + 0.006)}</td>
                  <td>{fmtPct(adjustedDrivers.wacc)}</td>
                </tr>
              </tbody>
            </table>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Model disagreement</span>
                <h3>{fmtPct(adjustedDrivers.modelRisk, 0)} risk flag</h3>
                <p>Higher disagreement means the point estimate deserves less trust.</p>
              </div>
              <mark>Ensemble</mark>
            </div>
            {["Fade DCF", "Residual income", "APV", "SOTP check", "Liquidation floor"].map(
              (label, index) => {
                const spread = [1, 0.94, 1.08, 0.88, 0.62][index];
                return (
                  <div key={label} className={styles.modelRow}>
                    <span>{label}</span>
                    <RangeBar value={valuation * spread} low={valuation * 0.52} high={valuation * 1.26} />
                    <strong>{fmtMoney(valuation * spread)}</strong>
                  </div>
                );
              },
            )}
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Data quality</span>
                <h3>{fmtPct(quality, 0)} usable</h3>
                <p>Shows whether the system is using live, traceable inputs.</p>
              </div>
              <mark>Latest SEC</mark>
            </div>
            <div className={styles.qualityDial} style={{ "--score": `${quality * 100}%` }}>
              <strong>{fmtPct(quality, 0)}</strong>
              <span>lineage</span>
            </div>
            {liveSnapshot ? (
              <div className={styles.coverageList}>
                <div>
                  <span>SEC companyfacts</span>
                  <strong>loaded</strong>
                </div>
                <div>
                  <span>FRED</span>
                  <strong>{liveSnapshot.coverage?.fredConfigured ? "configured" : "missing"}</strong>
                </div>
                <div>
                  <span>Quote source</span>
                  <strong>{liveSnapshot.coverage?.quoteSource || "missing"}</strong>
                </div>
                <div>
                  <span>FMP key</span>
                  <strong>{liveSnapshot.coverage?.fmpConfigured ? "configured" : "missing local key"}</strong>
                </div>
              </div>
            ) : (
              <p>SEC filings are treated as primary truth; convenience feeds remain reconcilable.</p>
            )}
          </article>
        </section>

        <section className={styles.bottomGrid}>
          <article className={styles.outputPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Decision Engine</span>
                <h2>Return distribution and permanent-loss discipline</h2>
                <p>The decision read combines valuation gap, feasibility, and active falsifiers.</p>
              </div>
              <mark>{selectedEngine?.[1]}</mark>
            </div>
            <div className={styles.outputStrip}>
              <div>
                <span>Value / share</span>
                <strong>{fmtMoney(valuation)}</strong>
              </div>
              <div data-tone={isFiniteNumber(upside) && upside >= 0 ? "good" : "bad"}>
                <span>Upside / downside</span>
                <strong>{fmtPct(upside)}</strong>
              </div>
              <div>
                <span>Expected 5Y IRR</span>
                <strong>{fmtPct(expectedIrr)}</strong>
              </div>
              <div>
                <span>Feasibility</span>
                <strong>{fmtPct(feasibility, 0)}</strong>
              </div>
              <div>
                <span>Falsifiers active</span>
                <strong>{tripwires.length}</strong>
              </div>
            </div>
            <p>
              The output is not a one-number target price. It shows what the market demands, which
              assumptions support the thesis, and which falsifier should be watched first.
            </p>
          </article>

          <article className={styles.flowPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Price Formation Engine</span>
                <h2>Separated from intrinsic value</h2>
              </div>
              <mark>Reflexivity gate</mark>
            </div>
            <div className={styles.flowStack}>
              {[
                ["ETF / passive pressure", "Neutral", 0.48],
                ["Insider and issuance flows", "Watch", 0.38],
                ["Buyback support", "Positive", 0.64],
                ["Short and option pressure", "Elevated", 0.57],
              ].map(([label, state, score]) => (
                <div key={label} className={styles.flowRow}>
                  <span>{label}</span>
                  <RangeBar value={score} low={0} high={1} />
                  <strong>{state}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}
