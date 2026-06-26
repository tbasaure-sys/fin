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
  ["truth", "Data Truth", "Point-in-time filings, vintages, restatements"],
  ["accounting", "Accounting", "Economic balance sheet and FCF bridge"],
  ["twin", "Business Twin", "Driver DAG with sector kernel"],
  ["bayes", "Bayesian", "Priors, regimes, dependence, scenarios"],
  ["value", "Valuation", "Fade DCF, residual income, APV"],
  ["expect", "Expectations", "Reverse DCF and market-implied surface"],
  ["flows", "Price Formation", "Float, flows, shorts, buybacks"],
  ["calibration", "Calibration", "Walk-forward scores and model risk"],
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
  ];
  if (required.some((value) => !isFiniteNumber(value))) return null;
  const growthPower = Math.pow(1 + drivers.revenueCagr, 5);
  const marginQuality = 0.72 + drivers.margin * 1.25;
  const roicSpread = Math.max(0, drivers.terminalRoic - drivers.wacc);
  const reinvestmentDrag = 1 - clamp(drivers.reinvestment * 0.34, 0.04, 0.28);
  const moatMultiplier = 1 + clamp(drivers.moatHalfLife / 30, 0.03, 0.52);
  const terminalDenominator = Math.max(0.026, drivers.wacc - drivers.terminalGrowth);
  const steadyFcf = drivers.baseFcf * growthPower * marginQuality * reinvestmentDrag;
  const terminal = steadyFcf * (1 + drivers.terminalGrowth) / terminalDenominator;
  const fadeBonus = 1 + roicSpread * 2.5 * moatMultiplier;
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

export default function ValuationOsLabPage() {
  const [companyKey, setCompanyKey] = useState("compounder");
  const [liveCompany, setLiveCompany] = useState(null);
  const [missingDrivers, setMissingDrivers] = useState([]);
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [liveSnapshot, setLiveSnapshot] = useState(null);
  const [liveStatus, setLiveStatus] = useState({ state: "idle", message: "" });
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
      isFiniteNumber(adjustedDrivers.modelRisk)
      ? 1 -
          Math.abs(adjustedDrivers.revenueCagr - impliedCagr) * 2.8 -
          Math.max(0, adjustedDrivers.reinvestment - 0.6) * 0.7 -
          adjustedDrivers.modelRisk * 0.28
      : 0.05,
    0.05,
    0.95,
  );
  const quality = clamp(adjustedDrivers.dataQuality - adjustedDrivers.modelRisk * 0.12, 0.2, 0.95);
  const tripwires = assumptionSchema.filter((item) => {
    const value = adjustedDrivers[item.key];
    if (!isFiniteNumber(value)) return true;
    const span = item.high - item.low;
    return value < item.low + span * 0.12 || value > item.high - span * 0.12;
  });

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
        sector: `Latest SEC snapshot FY${payload.company?.fiscalYear || "latest"}`,
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
        dataQuality: payload.drivers?.dataQuality,
        modelRisk: payload.drivers?.modelRisk,
        beta: driverOr(drivers, "beta"),
      };

      setLiveCompany(nextCompany);
      setCompanyKey("live");
      setDrivers(nextCompany);
      setLiveSnapshot(payload);
      setMissingDrivers(payload.missingDrivers || []);
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
          <strong>{isFiniteNumber(upside) && upside >= 0 ? "Constructive" : "Demanding"}</strong>
          <dl>
            <div>
              <dt>Falsifiers</dt>
              <dd>{tripwires.length} / 9</dd>
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
              A local prototype for translating qualitative thesis claims into traceable drivers,
              distributions, feasibility checks, and falsifiers.
            </p>
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

        <section className={styles.heroGrid}>
          <article className={styles.surfacePanel}>
            <div className={styles.panelHead}>
              <div>
                <span>Expectation Engine</span>
                <h2>Reverse DCF feasibility surface</h2>
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
              </div>
              <mark>{tripwires.length} tripped</mark>
            </div>
            {missingDrivers.length ? (
              <div className={styles.missingData}>
                Missing live drivers: {missingDrivers.join(", ")}. Outputs use no prior ticker fallback; fill the
                missing assumptions manually before reading the valuation.
              </div>
            ) : null}
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
              This prototype deliberately refuses a single fair-value answer. It shows what the
              market is demanding, which drivers explain the valuation, and which assumption would
              invalidate the thesis first.
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
