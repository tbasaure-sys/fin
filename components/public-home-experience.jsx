import styles from "@/app/home-page.module.css";

const WORKSPACE_ITEMS = [
  "Today",
  "Money plan",
  "Portfolio",
  "Research",
  "Holdings",
];

const TABS = ["Overview", "Portfolio", "Research"];

const LEAD_STATS = [
  { label: "Monthly room", value: "$5.4K" },
  { label: "Real diversification", value: "48" },
  { label: "Top contributor", value: "NVDA" },
];

const REFERENCES = [
  { title: "Monthly plan", detail: "Income, fixed costs, variable spending, reserve." },
  { title: "Portfolio data", detail: "Current weights, cost basis, performance snapshots." },
  { title: "Research memory", detail: "Filings, earnings notes, and company briefs." },
];

const POSITION_ROWS = [
  { ticker: "SGOV", type: "Cash sleeve", weight: "7.6%" },
  { ticker: "TLT", type: "Rates", weight: "7.1%" },
  { ticker: "UNH", type: "Healthcare", weight: "6.1%" },
  { ticker: "NVDA", type: "AI and growth", weight: "5.4%" },
];

const SUPPORT_ITEMS = [
  {
    title: "Money plan first",
    body: "See what is truly available to invest after income, fixed costs, variable spending, and reserve.",
  },
  {
    title: "Portfolio with context",
    body: "Read performance, hidden overlap, and top contributors in the same operating view.",
  },
  {
    title: "Research that stays close",
    body: "Open the current company brief without losing the portfolio and cashflow context around it.",
  },
];

const PORTFOLIO_SERIES = [100, 101, 103, 102, 104, 106, 108, 107, 109, 111, 112, 114];

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

export function WorkspacePreview({ brand }) {
  const padding = { left: 18, right: 12, top: 16, bottom: 22 };
  const linePath = buildLinePath(PORTFOLIO_SERIES, 420, 180, padding);
  const areaPath = buildAreaPath(PORTFOLIO_SERIES, 420, 180, padding);

  return (
    <div className={styles.previewShell}>
      <aside className={styles.previewSidebar}>
        <div>
          <div className={styles.previewSidebarBrand}>{brand}</div>
          <div className={styles.previewSidebarHint}>Decision workspace</div>
        </div>

        <nav className={styles.previewSidebarNav} aria-label="Workspace navigation">
          {WORKSPACE_ITEMS.map((item, index) => (
            <span
              className={styles.previewSidebarItem}
              data-active={index === 0}
              key={item}
            >
              {item}
            </span>
          ))}
        </nav>

        <div className={styles.previewSidebarMeta}>
          <span>Monthly plan connected</span>
          <span>Connected holdings</span>
          <span>Research memory active</span>
        </div>
      </aside>

      <div className={styles.previewMain}>
        <div className={styles.previewTopRow}>
          <div>
            <span className={styles.previewSectionLabel}>BLS Prime workspace</span>
            <strong>Current answer and the operating layers behind it</strong>
          </div>

          <div className={styles.previewTopMeta}>
            <span>Apr 22</span>
            <span>Current session</span>
          </div>
        </div>

        <div className={styles.previewToolbar}>
          <div className={styles.previewTabs}>
            {TABS.map((item, index) => (
              <span className={styles.previewTab} data-active={index === 0} key={item}>
                {item}
              </span>
            ))}
          </div>

          <div className={styles.previewSearch}>Ask about cashflow, the portfolio, or a company</div>
        </div>

        <div className={styles.previewHeroGrid}>
          <section className={styles.previewLeadPanel}>
            <p className={styles.previewModuleTag}>Current answer</p>
            <h3>New capital is available this month, but portfolio fit should improve first.</h3>
            <p>
              Cashflow is funding fresh capital, while overlap in growth and rate-sensitive exposures
              still deserves attention before adding size.
            </p>

            <div className={styles.previewLeadStats}>
              {LEAD_STATS.map((item) => (
                <div className={styles.previewLeadStat} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <aside className={styles.previewReferencePanel}>
            <p className={styles.previewModuleTag}>References</p>
            <h3>What the workspace is drawing from</h3>
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

        <div className={styles.previewDetailGrid}>
          <section className={styles.previewChartPanel}>
            <p className={styles.previewModuleTag}>Portfolio path</p>
            <h3>Performance stays readable next to the decision.</h3>
            <div className={styles.previewChartWrap}>
              <svg className={styles.previewChart} viewBox="0 0 420 180" role="img" aria-label="Portfolio chart">
                {[34, 74, 114, 154].map((y) => (
                  <line className={styles.previewChartGrid} key={y} x1="18" x2="408" y1={y} y2={y} />
                ))}
                <path className={styles.previewChartArea} d={areaPath} />
                <path className={styles.previewChartLine} d={linePath} />
              </svg>
            </div>
            <div className={styles.previewChartMeta}>
              <span>Portfolio +8.4%</span>
              <span>Since tracking began</span>
            </div>
          </section>

          <section className={styles.previewTablePanel}>
            <p className={styles.previewModuleTag}>Top positions</p>
            <h3>Largest weights in the current book.</h3>
            <div className={styles.previewTable}>
              {POSITION_ROWS.map((item) => (
                <div className={styles.previewTableRow} key={item.ticker}>
                  <div>
                    <strong>{item.ticker}</strong>
                    <span>{item.type}</span>
                  </div>
                  <strong>{item.weight}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.previewResearchPanel}>
            <p className={styles.previewModuleTag}>Research brief</p>
            <h3>Company work should read like a clear answer, not a stack of disconnected notes.</h3>
            <p>
              Each brief starts concise, keeps the main conclusion visible, and lets the supporting
              sources sit one layer below instead of flooding the screen.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function SupportStrip() {
  return (
    <div className={styles.supportStrip}>
      {SUPPORT_ITEMS.map((item, index) => (
        <article className={styles.supportItem} key={item.title}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{item.title}</strong>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}
