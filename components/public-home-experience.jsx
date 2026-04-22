import styles from "@/app/home-page.module.css";

const DASHBOARD_SERIES = [100, 102, 104, 103, 107, 110, 109, 113, 116, 115, 118, 121];

const DASHBOARD_ROWS = [
  { label: "Technology", mix: 28, exposure: 42 },
  { label: "Financials", mix: 18, exposure: 9 },
  { label: "Healthcare", mix: 15, exposure: 8 },
  { label: "Consumer", mix: 12, exposure: 7 },
  { label: "Other", mix: 27, exposure: 34 },
];

const DASHBOARD_HOLDINGS = [
  { ticker: "AAPL", weight: "14.2%" },
  { ticker: "MSFT", weight: "12.3%" },
  { ticker: "AMZN", weight: "9.8%" },
  { ticker: "GOOGL", weight: "7.0%" },
];

const PORTFOLIO_MIX = [
  { label: "Technology", value: 28, color: "#4e79ff" },
  { label: "Financials", value: 18, color: "#6b7a90" },
  { label: "Healthcare", value: 15, color: "#4bc1ae" },
  { label: "Consumer", value: 12, color: "#ef9c68" },
  { label: "Industrials", value: 9, color: "#8fa0b7" },
  { label: "Other", value: 18, color: "#c6a14c" },
];

const UNDERLYING_EXPOSURE = [
  { label: "AI and growth", value: 42, color: "#cfa24b" },
  { label: "Rate sensitivity", value: 19, color: "#4e79ff" },
  { label: "Consumer cyclicality", value: 14, color: "#4bc1ae" },
  { label: "Healthcare", value: 10, color: "#6b7a90" },
  { label: "True ballast", value: 15, color: "#8fa0b7" },
];

const RESEARCH_NODES = [
  { label: "Valuation", x: 140, y: 52, tone: "gold" },
  { label: "Macro", x: 252, y: 112, tone: "blue" },
  { label: "Sentiment", x: 228, y: 236, tone: "teal" },
  { label: "Structure", x: 76, y: 236, tone: "gold" },
  { label: "Risk", x: 52, y: 112, tone: "slate" },
  { label: "Decision", x: 140, y: 148, tone: "core", center: true },
];

const RESEARCH_BULLETS = [
  "Valuation, macro, risk, sentiment, and structure each contribute their own lens.",
  "The output reads like a team briefing, not a loose pile of observations.",
  "Research stays connected to the portfolio and the cash plan around it.",
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
  const path = buildLinePath(values, width, height, padding);
  const firstX = padding.left;
  const lastX = width - padding.right;
  const baseY = height - padding.bottom;
  return `${path} L ${lastX.toFixed(1)} ${baseY.toFixed(1)} L ${firstX.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

function buildTickLines(center, radius, count) {
  return Array.from({ length: count }, (_, index) => {
    const angle = ((Math.PI * 2) / count) * index - (Math.PI / 2);
    return {
      x1: center + Math.cos(angle) * (radius + 8),
      y1: center + Math.sin(angle) * (radius + 8),
      x2: center + Math.cos(angle) * (radius + 14),
      y2: center + Math.sin(angle) * (radius + 14),
    };
  });
}

function SegmentDonut({ title, subtitle, segments, score, scoreLabel }) {
  const size = 212;
  const center = size / 2;
  const radius = 70;
  const strokeWidth = 18;
  const total = segments.reduce((sum, item) => sum + item.value, 0) || 1;
  const circumference = 2 * Math.PI * radius;
  const gap = 6;
  let consumed = 0;

  const arcs = segments.map((item) => {
    const length = circumference * (item.value / total);
    const dash = Math.max(length - gap, 0);
    const arc = {
      ...item,
      dash,
      offset: consumed,
    };
    consumed += length;
    return arc;
  });

  const ticks = buildTickLines(center, radius, 24);

  return (
    <article className={styles.chartPanel}>
      <div className={styles.chartHeader}>
        <div>
          <span>{title}</span>
          <strong>{subtitle}</strong>
        </div>
      </div>

      <div className={styles.chartBody}>
        <div className={styles.segmentDonut}>
          <svg aria-label={subtitle} viewBox={`0 0 ${size} ${size}`} role="img">
            <g className={styles.donutTicks}>
              {ticks.map((tick, index) => (
                <line
                  key={`tick-${index}`}
                  x1={tick.x1}
                  x2={tick.x2}
                  y1={tick.y1}
                  y2={tick.y2}
                />
              ))}
            </g>
            <circle
              className={styles.donutTrack}
              cx={center}
              cy={center}
              r={radius}
              strokeWidth={strokeWidth}
            />
            <g transform={`rotate(-90 ${center} ${center})`}>
              {arcs.map((item) => (
                <circle
                  key={item.label}
                  className={styles.donutSegment}
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
            <circle className={styles.donutInnerMask} cx={center} cy={center} r={46} />
            <text className={styles.donutScore} x={center} y={center - 4}>
              {score}
            </text>
            <text className={styles.donutLabel} x={center} y={center + 18}>
              {scoreLabel}
            </text>
          </svg>
        </div>

        <div className={styles.chartLegend}>
          {segments.map((item) => (
            <div className={styles.chartLegendRow} key={item.label}>
              <div>
                <span className={styles.chartLegendDot} style={{ background: item.color }} />
                <strong>{item.label}</strong>
              </div>
              <small>{item.value}%</small>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function ScoreRing({ score, label, note }) {
  const size = 146;
  const center = size / 2;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dash = (circumference * score) / 100;
  const ticks = buildTickLines(center, radius, 20);

  return (
    <div className={styles.scoreRing}>
      <svg aria-label={label} viewBox={`0 0 ${size} ${size}`} role="img">
        <g className={styles.scoreRingTicks}>
          {ticks.map((tick, index) => (
            <line
              key={`score-tick-${index}`}
              x1={tick.x1}
              x2={tick.x2}
              y1={tick.y1}
              y2={tick.y2}
            />
          ))}
        </g>
        <circle className={styles.scoreRingTrack} cx={center} cy={center} r={radius} strokeWidth="14" />
        <g transform={`rotate(-90 ${center} ${center})`}>
          <circle
            className={styles.scoreRingProgress}
            cx={center}
            cy={center}
            r={radius}
            strokeWidth="14"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </g>
        <circle className={styles.scoreRingInner} cx={center} cy={center} r="34" />
        <text className={styles.gaugeValue} x={center} y={center - 2}>
          {score}
        </text>
        <text className={styles.gaugeLabel} x={center} y={center + 18}>
          {label}
        </text>
      </svg>
      <small className={styles.gaugeNote}>{note}</small>
    </div>
  );
}

export function HeroDashboard({ brand }) {
  const linePath = buildLinePath(DASHBOARD_SERIES, 520, 220, {
    left: 24,
    right: 16,
    top: 20,
    bottom: 24,
  });
  const areaPath = buildAreaPath(DASHBOARD_SERIES, 520, 220, {
    left: 24,
    right: 16,
    top: 20,
    bottom: 24,
  });

  return (
    <div className={styles.heroDashboard}>
      <aside className={styles.dashboardSidebar}>
        <div className={styles.dashboardBrand}>{brand}</div>
        <div className={styles.dashboardNav}>
          <span className={styles.dashboardNavItem} data-active="true">Overview</span>
          <span className={styles.dashboardNavItem}>Portfolio</span>
          <span className={styles.dashboardNavItem}>Analytics</span>
          <span className={styles.dashboardNavItem}>Research</span>
          <span className={styles.dashboardNavItem}>Settings</span>
        </div>
      </aside>

      <div className={styles.dashboardMain}>
        <div className={styles.dashboardTopRow}>
          <section className={styles.dashboardChartCard}>
            <div className={styles.dashboardCardHeader}>
              <div>
                <span>Portfolio overview</span>
                <strong>All accounts</strong>
              </div>
              <div className={styles.dashboardRangeRow}>
                <span>1D</span>
                <span>1W</span>
                <span data-active="true">1M</span>
                <span>1Y</span>
              </div>
            </div>

            <div className={styles.dashboardValueRow}>
              <strong>$128,450.75</strong>
              <small>+7.35%</small>
            </div>

            <svg className={styles.dashboardChart} viewBox="0 0 520 220" role="img" aria-label="Portfolio performance">
              <defs>
                <linearGradient id="dashboardArea" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(232, 184, 75, 0.22)" />
                  <stop offset="100%" stopColor="rgba(232, 184, 75, 0)" />
                </linearGradient>
              </defs>
              {[52, 96, 140, 184].map((y) => (
                <line className={styles.dashboardGridLine} key={y} x1="24" x2="504" y1={y} y2={y} />
              ))}
              <path className={styles.dashboardArea} d={areaPath} />
              <path className={styles.dashboardLine} d={linePath} />
            </svg>
          </section>

          <div className={styles.dashboardSideStack}>
            <section className={styles.gaugeCard}>
              <div className={styles.dashboardCardHeader}>
                <div>
                  <span>Diversification</span>
                  <strong>Current read</strong>
                </div>
              </div>
              <ScoreRing note="Underlying exposure reads concentrated." score={72} label="Score" />
            </section>

            <section className={styles.insightCard}>
              <div className={styles.dashboardCardHeader}>
                <div>
                  <span>Top insight</span>
                  <strong>Portfolio note</strong>
                </div>
              </div>
              <ul className={styles.insightList}>
                <li>Technology remains the largest real concentration.</li>
                <li>Monthly contribution room is healthy.</li>
                <li>Research queue is focused on existing positions.</li>
              </ul>
            </section>
          </div>
        </div>

        <div className={styles.dashboardBottomRow}>
          <section className={styles.dashboardBarsCard}>
            <div className={styles.dashboardBarsHeader}>
              <span>Portfolio mix vs underlying exposure</span>
            </div>

            {DASHBOARD_ROWS.map((row) => (
              <div className={styles.dashboardBarRow} key={row.label}>
                <div className={styles.dashboardBarLabel}>
                  <strong>{row.label}</strong>
                  <small>{row.mix}% / {row.exposure}%</small>
                </div>
                <div className={styles.dashboardBarTrack}>
                  <span className={styles.dashboardBarFill} style={{ width: `${row.mix}%` }} />
                  <span className={styles.dashboardBarFillExposure} style={{ width: `${row.exposure}%` }} />
                </div>
              </div>
            ))}
          </section>

          <section className={styles.dashboardHoldingsCard}>
            <div className={styles.dashboardCardHeader}>
              <div>
                <span>Top holdings</span>
                <strong>Current weights</strong>
              </div>
            </div>

            {DASHBOARD_HOLDINGS.map((holding) => (
              <div className={styles.holdingRow} key={holding.ticker}>
                <div className={styles.holdingMeta}>
                  <strong>{holding.ticker}</strong>
                  <small>Position</small>
                </div>
                <span className={styles.holdingValue}>{holding.weight}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

export function ExposureComparison() {
  return (
    <div className={styles.exposureVisual}>
      <div className={styles.exposureCharts}>
        <SegmentDonut
          score="72"
          scoreLabel="Mix"
          segments={PORTFOLIO_MIX}
          subtitle="What appears in the portfolio"
          title="Portfolio mix"
        />
        <SegmentDonut
          score="48"
          scoreLabel="Exposure"
          segments={UNDERLYING_EXPOSURE}
          subtitle="What the structure is carrying"
          title="Underlying exposure"
        />
      </div>

      <div className={styles.exposureNote}>
        <strong>What changes in practice</strong>
        <p>
          The wrappers look broad, but a larger share of the book still leans on the same growth and
          rate-sensitive structure underneath.
        </p>
      </div>
    </div>
  );
}

export function ResearchSystem() {
  return (
    <div className={styles.researchSystem}>
      <div className={styles.researchGraphCard}>
        <svg className={styles.researchGraph} viewBox="0 0 300 300" role="img" aria-label="Multi-agent research graph">
          {RESEARCH_NODES.filter((node) => !node.center).map((node) => (
            <line
              className={styles.researchLine}
              key={`${node.label}-line`}
              x1="140"
              x2={node.x}
              y1="148"
              y2={node.y}
            />
          ))}

          {RESEARCH_NODES.map((node) => (
            <g key={node.label}>
              <circle className={styles.researchAura} cx={node.x} cy={node.y} data-tone={node.tone} r={node.center ? 28 : 22} />
              <circle className={styles.researchNode} cx={node.x} cy={node.y} data-tone={node.tone} r={node.center ? 16 : 10} />
              <text className={styles.researchLabel} x={node.x} y={node.y + (node.center ? 4 : 38)}>
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className={styles.researchCopy}>
        <p className={styles.sectionTag}>Research desk</p>
        <h2 className={styles.sectionTitle}>Research that works like a team.</h2>
        <p className={styles.sectionBody}>
          BLS Prime keeps valuation, macro, risk, and structural context close to the same decision,
          so a new idea is easier to read before it becomes a new position.
        </p>
        <ul className={styles.researchList}>
          {RESEARCH_BULLETS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className={styles.researchCard}>
        <div className={styles.dashboardCardHeader}>
          <div>
            <span>NVIDIA Corporation</span>
            <strong>NVDA</strong>
          </div>
          <small className={styles.researchConviction}>High conviction</small>
        </div>

        <div className={styles.researchPrice}>
          <div>
            <span>Price</span>
            <strong>$1,024.86</strong>
          </div>
          <div>
            <span>Target</span>
            <strong>$1,250.00</strong>
          </div>
        </div>

        <p className={styles.researchSummary}>
          Demand remains firm, but the position still needs to be read in the context of the
          portfolio’s existing AI and growth exposure.
        </p>

        <div className={styles.researchTags}>
          <span className={styles.researchTag}>Revenue growth</span>
          <span className={styles.researchTag}>AI leadership</span>
          <span className={styles.researchTag}>Supply chain</span>
          <span className={styles.researchTag}>Portfolio fit</span>
        </div>
      </div>
    </div>
  );
}
