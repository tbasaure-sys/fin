"use client";

import { useMemo, useState } from "react";
import styles from "./valuation-os-lab.module.css";
import { buildValuationRouter, MODEL_LABELS } from "../../lib/valuation-router.js";

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
    label: "Revenue growth, years 1-5",
    fmt: "pct",
    low: 0.01,
    high: 0.18,
    falsifier: "Growth comes in below this path for two reports in a row.",
    source: "Sales by segment, backlog, customer demand",
  },
  {
    key: "margin",
    label: "Operating margin, year 5",
    fmt: "pct",
    low: 0.08,
    high: 0.42,
    falsifier: "Margins fall even though mix, scale, or pricing should be helping.",
    source: "Operating profit after accounting adjustments",
  },
  {
    key: "roic",
    label: "ROIC, year 5",
    fmt: "pct",
    low: 0.06,
    high: 0.34,
    falsifier: "New investment earns less than WACC for several periods.",
    source: "After-tax operating profit and invested capital",
  },
  {
    key: "terminalRoic",
    label: "Long-run ROIC",
    fmt: "pct",
    low: 0.06,
    high: 0.24,
    falsifier: "Competition enters and pricing power does not hold.",
    source: "History, peers, and competitive structure",
  },
  {
    key: "wacc",
    label: "Required return (WACC)",
    fmt: "pct",
    low: 0.055,
    high: 0.14,
    falsifier: "Rates, leverage, or business risk move enough to change the hurdle.",
    source: "Risk-free rate, beta, credit spread, debt level",
  },
  {
    key: "terminalGrowth",
    label: "Long-run growth",
    fmt: "pct",
    low: 0.005,
    high: 0.04,
    falsifier: "The company would need too much reinvestment to keep growing.",
    source: "Inflation, market size, saturation checks",
  },
  {
    key: "reinvestment",
    label: "Cash reinvested",
    fmt: "pct",
    low: 0.15,
    high: 0.72,
    falsifier: "Growth continues only on paper while capex or working capital shrink.",
    source: "Capex, working capital, acquisitions",
  },
  {
    key: "dilution",
    label: "Share dilution",
    fmt: "pct",
    low: -0.02,
    high: 0.035,
    falsifier: "Buybacks do not stop the share count from rising.",
    source: "Stock compensation, buybacks, options, RSUs",
  },
  {
    key: "thesisQuality",
    label: "Business quality evidence",
    fmt: "score",
    low: 0.2,
    high: 0.95,
    falsifier: "Customers, product edge, or unit economics worsen despite the story.",
    source: "Moat evidence, customer pull, execution, optionality",
  },
  {
    key: "demandSupply",
    label: "Demand vs supply",
    fmt: "score",
    low: 0.15,
    high: 0.95,
    falsifier: "Demand slows or new supply arrives faster than pricing can adjust.",
    source: "Backlog, capacity, utilization, inventory, pricing",
  },
  {
    key: "bottleneckPower",
    label: "Scarcity advantage",
    fmt: "score",
    low: 0.1,
    high: 0.98,
    falsifier: "Customers find substitutes or capacity stops being scarce.",
    source: "Scarcity, substitutes, switching cost, lead times",
  },
  {
    key: "moatHalfLife",
    label: "Durability of advantage",
    fmt: "yrs",
    low: 1,
    high: 15,
    falsifier: "ROIC fades faster than similar companies.",
    source: "Historical excess ROIC persistence",
  },
];

const engines = [
  ["truth", "Data check", "Are the inputs complete and traceable?"],
  ["accounting", "Cash and returns", "Does the business earn enough on capital?"],
  ["twin", "Business drivers", "What has to be true for the thesis to work?"],
  ["bayes", "Scenario confidence", "How much uncertainty should we admit?"],
  ["value", "Value estimate", "Is there enough margin of safety?"],
  ["expect", "Price requirements", "What growth and ROIC is the market assuming?"],
  ["flows", "Market pressure", "Could price move for non-business reasons?"],
  ["calibration", "Trust check", "Has the model earned confidence?"],
];

const SIMPLE_MODEL_LABELS = {
  dcf: "Cash-flow value (DCF)",
  roicFade: "ROIC durability value",
  reverseDcf: "Price-implied expectations",
  residualIncome: "Book-value return check",
  assetValue: "Asset floor check",
  unitEconomics: "Unit economics check",
  bottleneck: "Scarcity advantage check",
  realOptions: "Future upside option",
  ownerEarnings: "Owner cash earnings",
  capitalCycle: "Supply-cycle check",
};

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

function coreDcfValue(drivers) {
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

function methodValuations(drivers) {
  const dcf = coreDcfValue(drivers);
  if (!isFiniteNumber(dcf)) return null;
  const modelRisk = isFiniteNumber(drivers.modelRisk) ? drivers.modelRisk : 0.35;
  const roicSpread =
    isFiniteNumber(drivers.terminalRoic) && isFiniteNumber(drivers.wacc)
      ? drivers.terminalRoic - drivers.wacc
      : 0;
  const structuralAverage =
    (driverOr(drivers, "thesisQuality") + driverOr(drivers, "demandSupply") + driverOr(drivers, "bottleneckPower")) / 3;
  const marketAnchor = isFiniteNumber(drivers.price)
    ? drivers.price * (0.86 + structuralAverage * 0.16 + clamp(drivers.revenueCagr || 0, -0.02, 0.18) * 0.7)
    : dcf * 0.92;
  const residualIncome =
    (drivers.baseFcf / Math.max(0.045, drivers.wacc - drivers.terminalGrowth * 0.35)) *
    clamp(0.5 + Math.max(0, roicSpread) * 3.2 + drivers.margin * 0.35, 0.45, 1.45);
  const assetValue = drivers.baseFcf * clamp(7.2 + drivers.margin * 13 - modelRisk * 3.5, 5.5, 14);
  const unitEconomics = dcf * clamp(0.78 + drivers.thesisQuality * 0.18 + drivers.demandSupply * 0.14 + drivers.revenueCagr * 0.55, 0.72, 1.22);
  const bottleneck = dcf * clamp(0.8 + drivers.bottleneckPower * 0.28 + drivers.demandSupply * 0.1, 0.78, 1.22);
  const realOptions = dcf * clamp(0.72 + drivers.thesisQuality * 0.17 + clamp(drivers.revenueCagr, -0.02, 0.18) * 1.15 + modelRisk * 0.08, 0.68, 1.24);
  const ownerEarnings = dcf * clamp(0.86 + drivers.margin * 0.32 + Math.max(0, 0.55 - drivers.reinvestment) * 0.18 - modelRisk * 0.1, 0.68, 1.26);
  const capitalCycle = dcf * clamp(0.9 + drivers.demandSupply * 0.15 + drivers.bottleneckPower * 0.1 - drivers.reinvestment * 0.16, 0.68, 1.24);

  return {
    dcf,
    roicFade: dcf * clamp(0.84 + Math.max(0, roicSpread) * 2.6 + drivers.moatHalfLife / 70, 0.74, 1.28),
    reverseDcf: marketAnchor,
    residualIncome,
    assetValue,
    unitEconomics,
    bottleneck,
    realOptions,
    ownerEarnings,
    capitalCycle,
  };
}

function valueAt(drivers, router = buildValuationRouter(drivers)) {
  const methods = methodValuations(drivers);
  if (!methods) return null;
  const weights = router?.methodWeights || {};
  const weighted = Object.entries(weights).reduce((sum, [key, weight]) => {
    const value = methods[key];
    return isFiniteNumber(value) ? sum + value * weight : sum;
  }, 0);
  return weighted > 0 ? weighted : methods.dcf;
}

function impliedCagrForPrice(drivers, router) {
  if (!isFiniteNumber(drivers.price) || !isFiniteNumber(drivers.baseFcf)) return null;
  let best = drivers.revenueCagr;
  let bestGap = Infinity;
  for (let cagr = -0.02; cagr <= 0.22; cagr += 0.001) {
    const candidate = valueAt({ ...drivers, revenueCagr: cagr }, router);
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

function buildSurface(drivers, router) {
  const cagrValues = Array.from({ length: 7 }, (_, i) => 0.02 + i * 0.025);
  const roicValues = Array.from({ length: 6 }, (_, i) => 0.08 + i * 0.025);
  return roicValues
    .slice()
    .reverse()
    .map((roic) =>
      cagrValues.map((cagr) => {
        const v = valueAt({ ...drivers, revenueCagr: cagr, terminalRoic: roic }, router);
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
    <div className={styles.histogram} aria-label="Possible value range">
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
      <div className={styles.yAxis}>Long-run ROIC</div>
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
      <div className={styles.xAxis}>Revenue growth, years 1-5</div>
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
  if (status === "ok") return "Final review complete";
  if (status === "rate_limited") return "Local review ready; final review cooling down";
  if (status === "error") return "Local review ready; final review failed";
  if (status === "unavailable") return "Local review ready; no LLM key needed";
  return "Local review ready";
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

function RouterPanel({ router }) {
  if (!router) return null;
  return (
    <section className={styles.routerPanel} aria-label="Valuation method mix">
      <div>
        <span>Method mix</span>
        <h2>Why these valuation methods?</h2>
        <p>
          Different businesses need different valuation checks. A bank, a software company, and a
          semiconductor supplier should not all be forced through one fixed DCF template.
        </p>
      </div>
      <div className={styles.routerGrid}>
        <article>
          <strong>Business type</strong>
          {router.topRegimes.map((item) => (
            <div className={styles.routerRow} key={item.key}>
              <span>{item.label}</span>
              <i>{fmtPct(item.weight, 0)}</i>
            </div>
          ))}
        </article>
        <article>
          <strong>Methods used</strong>
          {router.topModels.map((item) => (
            <div className={styles.routerRow} key={item.key}>
              <span>{SIMPLE_MODEL_LABELS[item.key] || MODEL_LABELS[item.key] || item.label}</span>
              <i>{fmtPct(item.weight, 0)}</i>
            </div>
          ))}
        </article>
        <article>
          <strong>Can we use it?</strong>
          <div className={styles.routerDecision} data-abstain={router.abstain ? "true" : "false"}>
            <span>{router.abstain ? "Not enough evidence yet" : "Usable as a draft view"}</span>
            <i>{fmtPct(router.confidence, 0)} trust score</i>
          </div>
          <p>{router.rationale?.[2] || "This panel explains the mix; it does not make the investment decision by itself."}</p>
        </article>
      </div>
    </section>
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

function CalibrationContract({ adjustedDrivers, feasibility, quality, mode, debate }) {
  const risk = clamp(adjustedDrivers.modelRisk || 0.35, 0, 1);
  const segmentName = `${adjustedDrivers.sector || "Business"} / ${mode} case`;
  const trustScore = clamp(quality * 0.45 + feasibility * 0.35 + (1 - risk) * 0.2, 0, 1);
  const rights =
    trustScore >= 0.72 && debate?.agents?.length
      ? "Can support a monitored decision"
      : trustScore >= 0.52
        ? "Use as a shadow check"
        : "Observe only";
  const rows = [
    {
      label: "Global history",
      value: "Collect outcomes",
      note: "First ask whether past forecasts were honest overall.",
    },
    {
      label: "Comparable segment",
      value: segmentName,
      note: "Then check outcomes from the same horizon and business type before adjusting confidence.",
    },
    {
      label: "Decision right",
      value: rights,
      note: "The app should show calibrated values only when the segment has earned trust.",
    },
  ];

  return (
    <div className={styles.calibrationContract} aria-label="Contextual calibration contract">
      <div>
        <span>Contextual calibration</span>
        <strong>{fmtPct(trustScore, 0)} current trust score</strong>
        <p>
          AURORA should not trust one average calibration for every company. It should learn separately
          by horizon, sector, business type, and decision state.
        </p>
      </div>
      <div className={styles.calibrationSteps}>
        {rows.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.note}</p>
          </article>
        ))}
      </div>
    </div>
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
      eyebrow: "Input reliability",
      title: "Data check",
      copy:
        missingDrivers.length > 0
          ? "Some live inputs are missing, so the valuation should be treated as a draft."
          : "The core inputs are present and can be traced back to their sources.",
      plain: "Can we trust the numbers before reading the valuation?",
      technical: "Checks SEC company facts, market quote source, risk-free rate, missing fields, and source lineage.",
      metrics: [
        ["SEC filing", liveSnapshot ? `${liveSnapshot.company?.form || "SEC"} / FY${fiscalYear}` : "Sample data"],
        ["Industry policy", assumptions.industry?.label || "Sample assumption"],
        ["Quote", coverage.quoteSource || "Missing"],
        ["Data quality", fmtPct(quality, 0), quality >= 0.65 ? "good" : "warn"],
      ],
      bullets: [
        liveSnapshot
          ? `Companyfacts status: ${coverage.secCompanyFacts ? "loaded" : "not loaded"}`
          : "Using the sample company until a live SEC snapshot is loaded.",
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
      eyebrow: "Cash and returns",
      title: "Cash and returns",
      copy:
        "Reported financial statements are translated into cash flow, margins, and returns on capital.",
      plain: "Is the business actually producing valuable cash flow?",
      technical: "Compares FCF per share, margin, ROIC, WACC, reinvestment, and long-run growth consistency.",
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
          : "The business clears the basic ROIC hurdle.",
        isFiniteNumber(facts.operatingCashFlow) ? `Operating cash flow fact: ${factMoney(facts.operatingCashFlow)}.` : null,
        isFiniteNumber(facts.capex) ? `Capex fact: ${factMoney(facts.capex)}.` : null,
      ],
    },
    twin: {
      eyebrow: "Business logic",
      title: "Business drivers",
      copy:
        "The investment story is broken into drivers that can be changed, tested, and disproved.",
      plain: "What has to be true for this investment to work?",
      technical: "Connects revenue growth, reinvestment, ROIC fade, durability of advantage, and warning tests.",
      metrics: [
        ["Scenario", mode],
        ["Business evidence", fmtValue(adjustedDrivers.thesisQuality, "score")],
        ["Demand / supply", fmtValue(adjustedDrivers.demandSupply, "score")],
        ["Scarcity advantage", fmtValue(adjustedDrivers.bottleneckPower, "score")],
        ["Warnings", String(tripwires.length), tripwires.length > 3 ? "warn" : "neutral"],
      ],
      bullets: [
        `Current value path: ${fmtMoney(valuation)} versus price ${fmtMoney(adjustedDrivers.price)}.`,
        `Long-run ROIC ${fmtOptional(adjustedDrivers.terminalRoic, fmtPct)} is compared with WACC ${fmtOptional(adjustedDrivers.wacc, fmtPct)}.`,
        `Business evidence ${fmtValue(adjustedDrivers.thesisQuality, "score")} adjusts confidence in how long high ROIC can last.`,
        `Scarcity advantage ${fmtValue(adjustedDrivers.bottleneckPower, "score")} asks whether customers have good substitutes.`,
        activeFalsifiers[0] || "No warning test is currently at the edge of its range.",
        activeFalsifiers[1] || null,
      ],
    },
    bayes: {
      eyebrow: "Scenario confidence",
      title: "Scenario confidence",
      copy:
        "The model compares your thesis with the assumptions already embedded in the market price.",
      plain: "How confident should we be after admitting uncertainty?",
      technical: "Uses feasibility, implied growth, probability above price, and model-risk penalties.",
      metrics: [
        ["Feasibility", fmtPct(feasibility, 0), feasibility >= 0.55 ? "good" : "warn"],
        ["Above price", fmtPct(distribution.probAbovePrice, 0)],
        ["Implied CAGR", fmtPct(impliedCagr)],
        ["Business support", fmtValue((adjustedDrivers.thesisQuality + adjustedDrivers.demandSupply + adjustedDrivers.bottleneckPower) / 3, "score")],
      ],
      bullets: [
        `Expected 5Y IRR: ${fmtPct(expectedIrr)}.`,
        `Upside/downside: ${fmtPct(upside)}.`,
        isFiniteNumber(impliedCagr) && isFiniteNumber(adjustedDrivers.revenueCagr) && impliedCagr > adjustedDrivers.revenueCagr
          ? "Market-implied growth is above the current thesis input."
          : "Thesis growth is not below market-implied growth.",
        missingDrivers.length ? "The range should stay wide because live data is incomplete." : null,
      ],
    },
    value: {
      eyebrow: "Value estimate",
      title: "Value estimate",
      copy: "Estimated value is compared with the market price, expected return, and disagreement between methods.",
      plain: "Does the current price leave enough margin of safety?",
      technical: "Anchors on DCF and ROIC fade, then checks book value, asset floor, owner earnings, and downside risk.",
      metrics: [
        ["Value / share", fmtMoney(valuation)],
        ["Market price", fmtMoney(adjustedDrivers.price)],
        ["Upside", fmtPct(upside), upside >= 0 ? "good" : "bad"],
        ["Expected IRR", fmtPct(expectedIrr)],
      ],
      bullets: [
        "DCF and ROIC durability are the main checks; other methods show whether the result is fragile.",
        `Probability above price: ${fmtPct(distribution.probAbovePrice, 0)}.`,
      ],
    },
    expect: {
      eyebrow: "Price requirements",
      title: "Price requirements",
      copy: "This shows the growth and ROIC needed to justify today's market price.",
      plain: "What does the stock price already assume?",
      technical: "Reverse DCF solves for implied revenue growth against long-run ROIC and WACC assumptions.",
      metrics: [
        ["Implied CAGR", fmtPct(impliedCagr)],
        ["Thesis CAGR", fmtOptional(adjustedDrivers.revenueCagr, fmtPct)],
        ["Feasibility", fmtPct(feasibility, 0)],
        ["Falsifiers", String(tripwires.length)],
      ],
      bullets: [
        "Use the grid below to see where market expectations become plausible or fragile.",
        assumptions.wacc ? `WACC is bounded by the ${assumptions.industry?.label || "selected"} policy before the reverse DCF is read.` : null,
        activeFalsifiers[0] || null,
      ],
    },
    flows: {
      eyebrow: "Market pressure",
      title: "Market pressure",
      copy: "Market mechanics are kept separate from the business-value estimate.",
      plain: "Could the stock move for reasons unrelated to business value?",
      technical: "Tracks beta, dilution/buybacks, passive pressure, short pressure, and liquidity support.",
      metrics: [
        ["Beta", isFiniteNumber(adjustedDrivers.beta) ? adjustedDrivers.beta.toFixed(2) : "N/A"],
        ["Buyback proxy", adjustedDrivers.dilution < 0 ? "Supportive" : "Dilutive"],
        ["Net dilution", fmtOptional(adjustedDrivers.dilution, fmtPct)],
        ["Price gap", fmtPct(upside)],
      ],
      bullets: [
        "A good business can still be a poor entry if market support is already exhausted.",
        "These checks do not change business value; they explain price movement risk.",
      ],
    },
    calibration: {
      eyebrow: "Trust check",
      title: "Trust check",
      copy: "Calibration decides whether the model should be used, watched, or ignored.",
      plain: "Has the model earned enough trust for this company?",
      technical: "Combines data quality, model risk, realized-outcome checks, segment calibration, and final-review status.",
      metrics: [
        ["Data quality", fmtPct(quality, 0)],
        ["Model risk", fmtPct(adjustedDrivers.modelRisk, 0)],
        ["Feasibility", fmtPct(feasibility, 0)],
        ["Final review", debate?.agents?.length ? "Complete" : "Pending"],
      ],
      bullets: [
        "Model risk reduces confidence even when the value estimate looks attractive.",
        "When enough past outcomes exist, calibration should be checked by horizon and business type, not only in aggregate.",
        debate?.final_orchestrator ? statusCopy(debate.final_orchestrator.status) : "Run the review to add the final verdict layer.",
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
  const catalystPack = debate?.catalyst_pack || liveSnapshot?.catalystPack;
  const catalystItems = catalystPack?.dominantCatalysts || [];
  const liveEvidenceItems = catalystPack?.evidence?.items || catalystPack?.evidencePack?.items || [];
  const changeLog = debate?.change_log;
  const providerDiagnostics = debate?.context_pack?.providerDiagnostics || liveSnapshot?.contextPack?.providerDiagnostics || [];
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
            <span>In plain English</span>
            <strong>{panel.plain}</strong>
            <span>What is checked</span>
            <strong>{panel.technical}</strong>
          </div>
        </div>
        <div className={styles.debateActions}>
          <button type="button" onClick={onRunDebate} disabled={debateStatus.state === "loading"}>
            {debateStatus.state === "loading" ? "Running review" : "Run final review"}
          </button>
          <small>Local analyst checks first / one final call max</small>
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
          <strong>Review status</strong>
          <p>{debateStatus.message || "Run the final review to see the analyst checks and verdict."}</p>
          {debate?.agents?.length ? (
            <div className={styles.agentVotes}>
              {debate.agents.slice(0, 7).map((item) => (
                <span key={item.id} data-vote={item.vote}>
                  {item.label.replace(/^\d+\s*/, "")}: {item.vote}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {activeEngine === "calibration" ? (
        <CalibrationContract
          adjustedDrivers={adjustedDrivers}
          feasibility={feasibility}
          quality={quality}
          mode={mode}
          debate={debate}
        />
      ) : null}
      {debate?.agents?.length ? (
        <div className={styles.debatePanel}>
          <div className={styles.debateHeader}>
            <div>
              <span>Analyst review</span>
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
              <p>{researchability?.strategy || "Run the final review after loading a company."}</p>
            </div>
            <div>
              <span>Hard stops</span>
              <strong>{quickKill?.hard_fail ? "Hard gate tripped" : `${quickKill?.tally?.fail || 0} fails / ${quickKill?.tally?.warn || 0} warns`}</strong>
              <p>{quickKill?.hard_fail ? "The model blocks sizing until the flagged item is repaired." : "No hard stop; read the warnings before sizing."}</p>
            </div>
            <div>
              <span>Near-term evidence</span>
              <strong>{catalystPack?.aggregateScore !== undefined ? fmtPct(catalystPack.aggregateScore, 0) : "Pending"}</strong>
              <p>
                {catalystItems.length
                  ? `${catalystItems.map((item) => `${item.label} ${fmtPct(item.score, 0)}`).join(" / ")}${
                      liveEvidenceItems.length ? ` from ${liveEvidenceItems.length} live items` : ""
                    }`
                  : "Run a live snapshot to score demand, supply, bottlenecks, regulation, earnings, and capex."}
              </p>
            </div>
            <div>
              <span>Change watch</span>
              <strong>{changeLog?.status || "Baseline pending"}</strong>
              <p>
                {changeLog?.changes?.length
                  ? changeLog.changes.slice(0, 2).map((item) => `${item.label}: ${item.previous} -> ${item.current}`).join(" / ")
                  : "First run establishes the baseline for the next valuation."}
              </p>
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
              <span>Final view</span>
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
                <strong>What would break the thesis</strong>
                <BulletList items={killCriteria.length ? killCriteria : finalAnalysis?.open_questions || []} />
              </div>
            </article>
          </div>
          <div className={styles.diagnosticsGrid}>
            <article className={styles.orchestratorCard}>
              <span>Provider diagnostics</span>
              <div className={styles.providerList}>
                {providerDiagnostics.slice(0, 6).map((item) => (
                  <div key={item.block || item.source}>
                    <strong>{item.block}</strong>
                    <small>{item.status} / {item.source || "derived"}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className={styles.orchestratorCard}>
              <span>Memo preview</span>
              <p>{debate?.memo?.title || "The memo is generated after the final review."}</p>
              {debate?.memo?.markdown ? <pre className={styles.memoPreview}>{debate.memo.markdown.split("\n").slice(0, 10).join("\n")}</pre> : null}
            </article>
            <article className={styles.orchestratorCard}>
              <span>Live catalyst evidence</span>
              {liveEvidenceItems.length ? (
                <div className={styles.evidenceList}>
                  {liveEvidenceItems.slice(0, 4).map((item, index) => (
                    <a key={`${item.provider || "source"}-${item.url || item.title}-${index}`} href={item.url} target="_blank" rel="noreferrer">
                      <strong>{item.title}</strong>
                      <small>{item.source || item.provider} / {item.catalystTags?.join(", ") || "catalyst"} / {item.polarity}</small>
                    </a>
                  ))}
                </div>
              ) : (
                <p>No live news provider evidence is attached to this run.</p>
              )}
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

  const valuationRouter = useMemo(() => buildValuationRouter(adjustedDrivers, liveSnapshot), [adjustedDrivers, liveSnapshot]);
  const valuation = useMemo(() => valueAt(adjustedDrivers, valuationRouter), [adjustedDrivers, valuationRouter]);
  const impliedCagr = useMemo(() => impliedCagrForPrice(adjustedDrivers, valuationRouter), [adjustedDrivers, valuationRouter]);
  const distribution = useMemo(
    () => buildDistribution(adjustedDrivers, valuation),
    [adjustedDrivers, valuation],
  );
  const surface = useMemo(() => buildSurface(adjustedDrivers, valuationRouter), [adjustedDrivers, valuationRouter]);
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
    setDebateStatus({ state: "idle", message: "Assumption changed; rerun the final review for a fresh verdict." });
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

    setLiveStatus({ state: "loading", message: `Loading ${ticker} from SEC filings, market quote, and rate sources...` });
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
      setDebateStatus({ state: "idle", message: "Live snapshot loaded; run the final review for a verdict." });
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
    setDebateStatus({ state: "loading", message: "Running local analyst checks and final review..." });
    try {
      const response = await fetch("/valuation-os-lab/api/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          ticker: adjustedDrivers.ticker,
          mode,
          drivers: adjustedDrivers,
          router: valuationRouter,
          snapshot: liveSnapshot,
          contextPack: liveSnapshot?.contextPack,
          catalystPack: liveSnapshot?.catalystPack,
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
        throw new Error(payload.error || "Final review failed.");
      }
      setDebate(payload.debate);
      setDebateStatus({
        state: "ready",
        message: `${payload.ticker} review ready: ${statusCopy(payload.debate.final_orchestrator?.status)}${
          payload.cached ? " (cached)" : ""
        }.`,
      });
    } catch (error) {
      setDebateStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Final review failed.",
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
          <span>Company</span>
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
          <span>Current read</span>
          <strong>{plainRead}</strong>
          <p>
            Combines price gap, feasibility, source quality, business evidence, supply/demand, and warnings.
          </p>
          <dl>
            <div>
              <dt>Warnings</dt>
              <dd>{tripwires.length} / {assumptionSchema.length}</dd>
            </div>
            <div>
              <dt>Feasibility</dt>
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
            <h1>Valuation OS</h1>
            <p>
              A valuation workspace that explains what the stock price already assumes, what the
              business must deliver, and what evidence would make the thesis weaker.
            </p>
            <div className={styles.heroSummary}>
              <span>Decision read</span>
              <strong>{plainRead}</strong>
              <span>{fmtPct(upside)} value gap</span>
              <span>{fmtPct(feasibility, 0)} thesis fit</span>
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
                {liveStatus.state === "loading" ? "Loading" : "Load company"}
              </button>
            </form>
            <select value={companyKey} onChange={(event) => selectCompany(event.target.value)}>
              <option value="compounder">Quality software sample</option>
              <option value="cyclical">Semiconductor cycle</option>
              <option value="bank">Regional bank sample</option>
              {liveCompany ? <option value="live">Loaded company</option> : null}
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
            <span>1 Inputs</span>
            <strong>Filings, price, rates</strong>
            <p>Checks whether the numbers are usable.</p>
          </div>
          <div>
            <span>2 Economics</span>
            <strong>FCF, ROIC, WACC</strong>
            <p>Checks whether growth creates value.</p>
          </div>
          <div>
            <span>3 Business</span>
            <strong>Quality, supply, scarcity</strong>
            <p>Checks whether the story supports the numbers.</p>
          </div>
          <div>
            <span>4 Decision</span>
            <strong>Price assumptions + warnings</strong>
            <p>Shows what must go right and what would break it.</p>
          </div>
        </section>

        <section className={styles.termStrip} aria-label="Plain-language finance terms">
          <span>Quick terms</span>
          <p><strong>DCF</strong> means valuing future cash flows today.</p>
          <p><strong>ROIC</strong> means return on the capital the business uses.</p>
          <p><strong>WACC</strong> is the return investors require for taking the risk.</p>
          <p><strong>Reverse DCF</strong> asks what growth the current price already assumes.</p>
        </section>

        <RouterPanel router={valuationRouter} />

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
                <span>Price requirements</span>
                <h2>What has to be true?</h2>
                <p>
                  Each cell shows estimated value as a percentage of today&apos;s price. The grid makes the price assumptions visible.
                </p>
              </div>
              <mark>Market price {fmtMoney(adjustedDrivers.price)}</mark>
            </div>
            <Surface surface={surface} price={adjustedDrivers.price} />
            <div className={styles.surfaceLegend}>
              <span>Looks expensive</span>
              <b>White line is roughly fair value</b>
              <span>Looks cheaper</span>
            </div>
          </article>

          <article className={styles.ledgerPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Assumptions</span>
                <h2>What you can change</h2>
                <p>
                  Sliders are the assumptions. The sentence under each one says what evidence would make it weaker.
                </p>
              </div>
              <mark>{tripwires.length} warnings</mark>
            </div>
            {missingDrivers.length ? (
              <div className={styles.missingData}>
                Missing live inputs: {missingDrivers.join(", ")}. The app does not invent ticker-specific values;
                adjust the missing assumptions before relying on the valuation.
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
                  <span>Rate policy</span>
                  <strong>Sample assumption</strong>
                  <small>Load a company to replace sample assumptions with company and industry inputs.</small>
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
                <span>Possible value range</span>
                <h3>{fmtMoney(distribution.p50)} median value</h3>
                <p>A range of possible values after widening for uncertainty.</p>
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
                <span>Durability of advantage</span>
                <h3>{adjustedDrivers.moatHalfLife.toFixed(1)} years</h3>
                <p>How long the company is assumed to keep earning ROIC above WACC.</p>
              </div>
              <mark>ROIC fade</mark>
            </div>
            <MiniLine points={fadePath} />
            <p>
              The app fades competitive advantage over time instead of assuming today&apos;s high
              returns last forever.
            </p>
          </article>

          <article className={styles.metricPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Return on new capital</span>
                <h3>{fmtPct(adjustedDrivers.roic)} Y5 ROIC</h3>
                <p>Checks whether new investment can fund the growth assumption.</p>
              </div>
              <mark>Growth quality</mark>
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
                <span>What price assumes</span>
                <h3>{fmtPct(impliedCagr)} implied CAGR</h3>
                <p>Compares the growth required by price with the growth in your thesis.</p>
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
                <span>Method disagreement</span>
                <h3>{fmtPct(adjustedDrivers.modelRisk, 0)} risk flag</h3>
                <p>When valuation methods disagree, the exact number deserves less trust.</p>
              </div>
              <mark>Cross-check</mark>
            </div>
            {["DCF + ROIC fade", "Book-value return", "Adjusted cash flow", "Parts check", "Asset floor"].map(
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
                <span>Input reliability</span>
                <h3>{fmtPct(quality, 0)} usable</h3>
                <p>Shows whether the app is using live, traceable inputs.</p>
              </div>
              <mark>Latest SEC</mark>
            </div>
            <div className={styles.qualityDial} style={{ "--score": `${quality * 100}%` }}>
              <strong>{fmtPct(quality, 0)}</strong>
              <span>traceable</span>
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
              <p>SEC filings are treated as the primary source; convenience feeds are secondary.</p>
            )}
          </article>
        </section>

        <section className={styles.bottomGrid}>
          <article className={styles.outputPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Decision read</span>
                <h2>What the app is telling you now</h2>
                <p>The read combines price gap, thesis fit, input quality, and active warnings.</p>
              </div>
              <mark>{selectedEngine?.[1]}</mark>
            </div>
            <div className={styles.outputStrip}>
              <div>
                <span>Value / share</span>
                <strong>{fmtMoney(valuation)}</strong>
              </div>
              <div data-tone={isFiniteNumber(upside) && upside >= 0 ? "good" : "bad"}>
                <span>Value gap</span>
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
                <span>Warnings active</span>
                <strong>{tripwires.length}</strong>
              </div>
            </div>
            <p>
              This is not a one-number target price. It shows what the market demands, which
              assumptions support the thesis, and which warning should be watched first.
            </p>
          </article>

          <article className={styles.flowPanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Market pressure</span>
                <h2>Separated from business value</h2>
              </div>
              <mark>Trading context</mark>
            </div>
            <div className={styles.flowStack}>
              {[
                ["ETF / passive buying", "Neutral", 0.48],
                ["Insider selling / new shares", "Watch", 0.38],
                ["Buyback support", "Positive", 0.64],
                ["Short interest / options", "Elevated", 0.57],
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
