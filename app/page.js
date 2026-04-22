import Link from "next/link";

import {
  AgentDebateGraph,
  CounterfactualMode,
  ExposureContrast,
  RealityGapHero,
} from "@/components/public-home-experience";
import styles from "@/app/home-page.module.css";
import { getServerAuthSession } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

const principles = [
  {
    title: "Reality vs perception",
    description: "Separate the allocation story from the structure that actually drives behavior.",
  },
  {
    title: "Hidden structure",
    description: "Expose overlap, crowding, and dependency clusters before they break under stress.",
  },
  {
    title: "Decision",
    description: "Turn the analysis into a judgment layer with consequences, tradeoffs, and action.",
  },
];

const decisions = [
  {
    title: "AI cyclicality is hiding inside a balanced-looking book.",
    gap: "2.4x more exposed than the sector map implies",
    consequence: "Expected drawdown rises to -18% in a crowded-growth unwind",
    action: "Reduce NVDA concentration and rebuild the position through less correlated cashflow names.",
  },
  {
    title: "Two defensive wrappers are carrying the same duration shock.",
    gap: "Rate sensitivity clusters in assets that look unrelated on paper",
    consequence: "The portfolio de-risks less than expected when policy volatility spikes",
    action: "Swap one wrapper for shorter-duration ballast before adding new equity risk.",
  },
  {
    title: "A new idea fits the narrative, but not the portfolio.",
    gap: "Correlation adds to an existing cluster instead of diversifying it",
    consequence: "The next dollar increases fragility more than expected return",
    action: "Stage the research, then fund only if the holding changes the structure rather than decorates it.",
  },
];

const financeSignals = [
  {
    label: "Burn rate",
    value: "$7.8K / month",
    body: "Monthly spending sets the floor for how much capital the portfolio is allowed to risk.",
  },
  {
    label: "Investment runway",
    value: "14 months",
    body: "Cash flow determines how long the current plan can keep compounding without forced decisions.",
  },
  {
    label: "Risk capacity drift",
    value: "Rising",
    body: "When income, savings, or obligations move, the portfolio should change size before it changes opinions.",
  },
];

export default async function HomePage() {
  const config = getServerConfig();
  const session = await getServerAuthSession();
  const publicBrand = /allocator workspace/i.test(config.appName) ? "BLS Prime" : config.appName;
  const ctaHref = session ? "/app" : "/login";
  const ctaLabel = session ? "Open my workspace" : "Analyze my portfolio";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBg} aria-hidden="true" />

        <nav className={styles.nav}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandName}>{publicBrand}</span>
          </Link>

          <div className={styles.navLinks} aria-label="Primary">
            <a href="#phantom">Phantom diversification</a>
            <a href="#engine">Engine</a>
            <a href="#decision">Decision layer</a>
            <a href="#counterfactual">Counterfactual</a>
          </div>

          <div className={styles.navActions}>
            {session ? (
              <>
                <Link className={styles.btnSecondary} href="/app">
                  Workspace
                </Link>
                <form action="/api/auth/logout" method="post" style={{ display: "contents" }}>
                  <button className={styles.btnGhost} type="submit">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link className={styles.btnGhost} href="/login">
                  Log in
                </Link>
                <Link className={styles.btnSecondary} href="/login">
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>

        <div className={styles.heroShell}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Structural investing interface</p>
            <h1 className={styles.headline}>Your portfolio is not what you think it is.</h1>
            <p className={styles.subheadline}>
              Surface diversification is not real diversification. {publicBrand} reveals the hidden
              structure underneath so the next decision starts with reality instead of cosmetics.
            </p>

            <div className={styles.heroActions}>
              <Link className={styles.btnPrimary} href={ctaHref}>
                {ctaLabel}
              </Link>
              <a className={styles.btnGhost} href="#phantom">
                See a real example
              </a>
            </div>

            <div className={styles.principleRail}>
              {principles.map((item) => (
                <div className={styles.principleItem} key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <RealityGapHero />
        </div>
      </section>

      <section id="phantom" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionTag}>The core insight</p>
            <h2 className={styles.sectionTitle}>Most portfolios fail in ways no dashboard shows.</h2>
          </div>
          <p className={styles.sectionLead}>
            Classic allocation tells a story about wrappers, sectors, and labels. Structural exposure
            tells a story about what actually breaks together under stress.
          </p>
        </div>

        <ExposureContrast />

        <div className={styles.sectionBanner}>
          <span className={styles.bannerLabel}>Phantom diversification</span>
          <p>Two portfolios can look identical and behave oppositely under stress.</p>
        </div>
      </section>

      <section id="engine" className={`${styles.section} ${styles.engineSection}`}>
        <div className={styles.engineCopy}>
          <p className={styles.sectionTag}>Multi-agent system</p>
          <h2 className={styles.sectionTitle}>Not one model. A system that argues.</h2>
          <p className={styles.sectionLead}>
            Valuation, risk, macro, sentiment, and structural exposure do not vote quietly. Every
            conclusion is pushed through disagreement before it becomes a judgment.
          </p>
          <div className={styles.argumentList}>
            <div className={styles.argumentItem}>
              <strong>Competing lenses</strong>
              <p>Each agent sees a different failure mode and a different path to conviction.</p>
            </div>
            <div className={styles.argumentItem}>
              <strong>Cross-examination</strong>
              <p>The output is not a prediction. It is a defended position that survived challenge.</p>
            </div>
            <div className={styles.argumentItem}>
              <strong>Structural memory</strong>
              <p>What mattered before stays visible, so new research is added to context rather than replacing it.</p>
            </div>
          </div>
        </div>

        <AgentDebateGraph />
      </section>

      <section id="decision" className={`${styles.section} ${styles.decisionSection}`}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionTag}>Decision layer</p>
            <h2 className={styles.sectionTitle}>The product is organized around decisions, not insights.</h2>
          </div>
          <p className={styles.sectionLead}>
            Most apps stop at information. This interface goes one step further: reality gap,
            stress consequence, and the action that follows from both.
          </p>
        </div>

        <div className={styles.decisionGrid}>
          {decisions.map((item) => (
            <article className={styles.decisionCard} key={item.title}>
              <p className={styles.cardTag}>Example output</p>
              <h3>{item.title}</h3>
              <dl className={styles.decisionFacts}>
                <div>
                  <dt>Reality gap</dt>
                  <dd>{item.gap}</dd>
                </div>
                <div>
                  <dt>Stress consequence</dt>
                  <dd>{item.consequence}</dd>
                </div>
                <div>
                  <dt>Suggested action</dt>
                  <dd>{item.action}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.financeSection}`}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionTag}>Personal finance layer</p>
            <h2 className={styles.sectionTitle}>Your portfolio does not exist in isolation.</h2>
          </div>
          <p className={styles.sectionLead}>
            Cash flow, burn rate, and changing obligations shape the risk the portfolio is actually
            allowed to take. Allocation should answer to life, not hide from it.
          </p>
        </div>

        <div className={styles.financeFlow}>
          <div className={styles.financeTrack} aria-hidden="true">
            <span>Cash flow</span>
            <i />
            <span>Deployable capital</span>
            <i />
            <span>Risk capacity</span>
          </div>

          <div className={styles.financeGrid}>
            {financeSignals.map((item) => (
              <article className={styles.financeCard} key={item.label}>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                <span>{item.body}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="counterfactual" className={`${styles.section} ${styles.counterSection}`}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionTag}>Counterfactual mode</p>
            <h2 className={styles.sectionTitle}>Run the portfolio through the shocks it has not earned the right to forget.</h2>
          </div>
          <p className={styles.sectionLead}>
            What the portfolio looks like today and how it behaves in a regime break are different
            questions. This mode makes the divergence visible.
          </p>
        </div>

        <CounterfactualMode />
      </section>

      <section className={styles.finalCta}>
        <p className={styles.sectionTag}>Start with the structure</p>
        <h2 className={styles.finalTitle}>Stop managing what you see. Start managing what matters.</h2>
        <p className={styles.finalBody}>
          Open the workspace when you want hidden dependency, structural exposure, and judgment to
          speak before a trade does.
        </p>
        <div className={styles.heroActions}>
          <Link className={styles.btnPrimary} href={ctaHref}>
            {ctaLabel}
          </Link>
          <a className={styles.btnGhost} href="#counterfactual">
            Explore counterfactual mode
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          (c) {new Date().getFullYear()} {publicBrand}. Structural investing interface for reality,
          hidden structure, and decision. Not financial advice.
        </p>
        <Link href="/terms">Terms of Service</Link>
      </footer>
    </main>
  );
}
