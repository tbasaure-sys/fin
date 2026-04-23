import styles from "@/app/home-page.module.css";

const SUGGESTIONS = [
  "How much is available to invest this month?",
  "Where is overlap highest right now?",
  "Summarize NVDA in one brief.",
  "What should change before adding risk?",
];

const SUPPORT_ITEMS = [
  {
    title: "Money plan",
    body: "Monthly income, fixed costs, variable spending, and available-to-invest all stay in the same view.",
  },
  {
    title: "Portfolio read",
    body: "The portfolio summary starts simple, then opens into structure, overlap, and the names carrying the book.",
  },
  {
    title: "Research brief",
    body: "Company work reads like a concise answer first, with references and details one layer below.",
  },
];

const MONEY_METRICS = [
  { label: "Monthly income", value: "$14.8K" },
  { label: "Fixed costs", value: "$4.2K" },
  { label: "Variable spending", value: "$2.1K" },
  { label: "Available to invest", value: "$5.4K" },
];

const PORTFOLIO_SERIES = [100, 101, 103, 102, 105, 107, 109, 108, 111, 114, 113, 116];

const EXPOSURE_SEGMENTS = [
  { label: "AI and growth", value: 38, color: "#d6aa4b" },
  { label: "Rate sensitivity", value: 22, color: "#4e79ff" },
  { label: "Consumer beta", value: 16, color: "#4bc1ae" },
  { label: "Healthcare", value: 11, color: "#7b8798" },
  { label: "True ballast", value: 13, color: "#96a5ba" },
];

const RESEARCH_TAGS = ["Revenue growth", "Valuation", "Portfolio fit", "Sources attached"];

const REFERENCES = [
  { title: "Portfolio data", detail: "Current holdings and weights" },
  { title: "Monthly plan", detail: "Income, bills, and investable cash" },
  { title: "Company sources", detail: "Filings, earnings, and research notes" },
  { title: "Decision memory", detail: "What changed and why" },
];

function buildLinePath(values, width, height, padding) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeRange = max - min || 1;
  return values
    .map((value, index) => {
      const x = padding.left + (((width - padding.left - padding.right) / (values.length - 1)) * index);
      const y = height - padding.bottom - (((value - min) / safeRange) * (height - padding.top - padding.bottom));
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildAreaPath(values, width, height, padding) {
  const line = buildLinePath(values, width, height, padding);
  const baseY = height - padding.bottom;
  const firstX = padding.left;
  const lastX = width - padding.right;
  return `${line} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

function buildTickLines(center, radius, count) {
  return Array.from({ length: count }, (_, index) => {
    const angle = ((Math.PI * 2) / count) * index - (Math.PI / 2);
    return {
      x1: center + Math.cos(angle) * (radius + 7),
      y1: center + Math.sin(angle) * (radius + 7),
      x2: center + Math.cos(angle) * (radius + 13),
      y2: center + Math.sin(angle) * (radius + 13),
    };
  });
}

function ExposureRing() {
  const size = 196;
  const center = size / 2;
  const radius = 62;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;
  const ticks = buildTickLines(center, radius, 24);
  const total = EXPOSURE_SEGMENTS.reduce((sum, item) => sum + item.value, 0) || 1;
  let consumed = 0;

  const arcs = EXPOSURE_SEGMENTS.map((item) => {
    const arcLength = circumference * (item.value / total);
    const dash = Math.max(arcLength - 5, 0);
    const current = {
      ...item,
      dash,
      offset: consumed,
    };
    consumed += arcLength;
    return current;
  });

  return (
    <div className={styles.previewRingBlock}>
      <svg aria-label="Underlying exposure" className={styles.previewRingSvg} viewBox={`0 0 ${size} ${size}`} role="img">
        <g className={styles.previewRingTicks}>
          {ticks.map((tick, index) => (
            <line key={`tick-${index}`} x1={tick.x1} x2={tick.x2} y1={tick.y1} y2={tick.y2} />
          ))}
        </g>
        <circle className={styles.previewRingTrack} cx={center} cy={center} r={radius} strokeWidth={strokeWidth} />
        <g transform={`rotate(-90 ${center} ${center})`}>
          {arcs.map((item) => (
            <circle
              key={item.label}
              className={styles.previewRingArc}
              cx={center}
              cy={center}
              r={radius}
              stroke={item.color}
              strokeDasharray={`${item.dash} ${circumference}`}
              strokeDashoffset={-item.offset}
              strokeWidth={strokeWidth}
            />
          ))}
        </g>
        <circle className={styles.previewRingInner} cx={center} cy={center} r="41" />
        <text className={styles.previewRingScore} x={center} y={center - 2}>
          48
        </text>
        <text className={styles.previewRingLabel} x={center} y={center + 18}>
          Real score
        </text>
      </svg>

      <div className={styles.previewRingLegend}>
        {EXPOSURE_SEGMENTS.map((item) => (
          <div className={styles.previewLegendRow} key={item.label}>
            <div>
              <i style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
            <strong>{item.value}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkspacePreview({ brand }) {
  const padding = { left: 18, right: 10, top: 16, bottom: 18 };
  const linePath = buildLinePath(PORTFOLIO_SERIES, 310, 146, padding);
  const areaPath = buildAreaPath(PORTFOLIO_SERIES, 310, 146, padding);

  return (
    <div className={styles.previewShell}>
      <aside className={styles.previewSidebar}>
        <div className={styles.previewSidebarBrand}>{brand}</div>
        <div className={styles.previewSidebarNav}>
          <span className={styles.previewSidebarItem} data-active="true">Home</span>
          <span className={styles.previewSidebarItem}>Money plan</span>
          <span className={styles.previewSidebarItem}>Portfolio</span>
          <span className={styles.previewSidebarItem}>Research</span>
          <span className={styles.previewSidebarItem}>Decisions</span>
          <span className={styles.previewSidebarItem}>Settings</span>
        </div>
      </aside>

      <div className={styles.previewMain}>
        <div className={styles.previewContextRow}>
          <div>
            <span className={styles.previewContextLabel}>BLS Prime workspace</span>
            <strong>Current state: live and ready</strong>
          </div>
          <div className={styles.previewContextPills}>
            <span>Cashflow connected</span>
            <span>Portfolio loaded</span>
            <span>Research active</span>
          </div>
        </div>

        <button className={styles.previewComposer} type="button">
          Ask about cashflow, portfolio, or a company
        </button>

        <div className={styles.previewSuggestions}>
          {SUGGESTIONS.map((item) => (
            <button className={styles.previewSuggestion} key={item} type="button">
              {item}
            </button>
          ))}
        </div>

        <div className={styles.previewAnswerGrid}>
          <div className={styles.previewAnswerColumn}>
            <section className={styles.previewAnswerCard}>
              <p className={styles.previewAnswerTag}>Current answer</p>
              <h3>There is room to invest this month, but overlap is still the main portfolio constraint.</h3>
              <p>
                The monthly plan supports new capital, yet the portfolio is still leaning on the same
                growth and rate-sensitive structure. The next move should improve fit before it adds size.
              </p>
              <div className={styles.previewAnswerActions}>
                <span>Review monthly plan</span>
                <span>Check overlap</span>
                <span>Open current brief</span>
              </div>
            </section>

            <div className={styles.previewModuleGrid}>
              <article className={styles.previewModuleCard}>
                <p className={styles.previewModuleTag}>Money plan</p>
                <h4>Monthly room to invest</h4>
                <div className={styles.previewMetricList}>
                  {MONEY_METRICS.map((item) => (
                    <div className={styles.previewMetricRow} key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <article className={styles.previewModuleCard}>
                <p className={styles.previewModuleTag}>Portfolio structure</p>
                <h4>Current portfolio read</h4>
                <div className={styles.previewChartWrap}>
                  <svg className={styles.previewChart} viewBox="0 0 310 146" role="img" aria-label="Portfolio chart">
                    <defs>
                      <linearGradient id="previewArea" x1="0%" x2="0%" y1="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(214, 170, 75, 0.22)" />
                        <stop offset="100%" stopColor="rgba(214, 170, 75, 0)" />
                      </linearGradient>
                    </defs>
                    {[34, 66, 98, 130].map((y) => (
                      <line className={styles.previewChartGrid} key={y} x1="18" x2="300" y1={y} y2={y} />
                    ))}
                    <path className={styles.previewChartArea} d={areaPath} />
                    <path className={styles.previewChartLine} d={linePath} />
                  </svg>
                </div>
                <ExposureRing />
              </article>

              <article className={styles.previewModuleCard}>
                <p className={styles.previewModuleTag}>Research brief</p>
                <h4>NVDA remains compelling, but fit matters more than excitement.</h4>
                <p className={styles.previewResearchBody}>
                  Demand is still strong, yet the position should be judged against the portfolio's
                  existing AI and growth exposure before adding more size.
                </p>
                <div className={styles.previewTagRow}>
                  {RESEARCH_TAGS.map((item) => (
                    <span className={styles.previewTag} key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </article>
            </div>
          </div>

          <aside className={styles.previewSourcesCard}>
            <p className={styles.previewModuleTag}>References</p>
            <h4>What the answer is drawing from</h4>
            <div className={styles.previewReferenceList}>
              {REFERENCES.map((item) => (
                <article className={styles.previewReferenceRow} key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function SupportStrip() {
  return (
    <div className={styles.supportStrip}>
      {SUPPORT_ITEMS.map((item) => (
        <article className={styles.supportItem} key={item.title}>
          <strong>{item.title}</strong>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}
