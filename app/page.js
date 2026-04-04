import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";
import styles from "@/app/public-home.module.css";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = getServerConfig();
  const session = await getServerAuthSession();
  const ctaHref = session ? "/app" : "/login";
  const ctaLabel = session ? "Return to workspace" : "Open your workspace";
  const offering = [
    {
      title: "Portfolio home base",
      description:
        "See your holdings, weights, performance, concentration, and exposure in one place instead of piecing it together across tabs.",
    },
    {
      title: "Market context for your portfolio",
      description:
        "Understand what current market conditions mean for your specific book, not just the headline story on financial news.",
    },
    {
      title: "Clear decision guidance",
      description:
        "Get structured guidance on whether a position looks like a hold, trim, hedge, rotate, or wait instead of vague commentary.",
    },
    {
      title: "Recoverability balance sheet",
      description:
        "See how much room your portfolio still has for mistakes, repairs, and new opportunities before you take more risk.",
    },
    {
      title: "Decision journal and staged actions",
      description:
        "Save ideas, record why they matter, and keep promising moves on deck until the setup is actually ready.",
    },
    {
      title: "Watchlist and alerts",
      description:
        "Track names you care about and surface the moments that deserve attention without living in your broker all day.",
    },
  ];
  const plainEnglishGuide = [
    {
      term: "Recoverability",
      meaning:
        "How likely your portfolio is to absorb stress and still recover instead of getting trapped.",
    },
    {
      term: "Optionality reserve",
      meaning:
        "How much flexibility you still have after a plausible wrong move. Think of it as your portfolio's room to adapt.",
    },
    {
      term: "Phantom tax",
      meaning:
        "A warning that a rebound may look healthy on the surface before the underlying structure really improves.",
    },
    {
      term: "Legitimacy slack",
      meaning:
        "How much room the current setup gives you to act without forcing low-quality trades.",
    },
  ];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBg} aria-hidden="true" />

        <nav className={styles.nav}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandName}>{config.appName}</span>
          </Link>
          <div className={styles.navActions}>
            {session ? (
              <>
                <Link className={styles.btnSecondary} href="/app">
                  Go to workspace
                </Link>
                <form action="/api/auth/logout" method="post" style={{ display: "contents" }}>
                  <button className={styles.btnGhost} type="submit">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link className={styles.btnGhost} href="/login">
                Sign in
              </Link>
            )}
          </div>
        </nav>

        <div className={styles.heroBody}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Private investing workspace
          </p>

          <h1 className={styles.headline}>
            See what you own,
            <br />
            <em className={styles.headlineAccent}>what is changing,</em>
            <br />
            and what deserves action.
          </h1>

          <p className={styles.sub}>
            One private place to track your portfolio, understand hidden risk,
            decide whether a move is worth making, and keep a clean record of
            your investing decisions.
          </p>

          <div className={styles.heroActions}>
            <Link className={styles.btnPrimary} href={ctaHref}>
              {ctaLabel}
            </Link>
            {!session && (
              <Link className={styles.btnSecondary} href="#how-it-works">
                How it works
              </Link>
            )}
          </div>

          <div className={styles.heroProof}>
            <span>One screen for holdings, risk, and next moves</span>
            <span>Private by default and built around your actual portfolio</span>
            <span>Explains unusual market risk in plain language</span>
          </div>
        </div>

        <div className={styles.scrollHint} aria-hidden="true">
          <span className={styles.scrollLine} />
          <span>Scroll to explore</span>
        </div>
      </section>

      <div className={styles.sectionDivider} aria-hidden="true" />

      <div id="how-it-works" className={styles.section}>
        <div className={styles.stepsSection}>
          <div className={styles.stepsLeft}>
            <p className={styles.tag}>How it works</p>
            <h2 className={styles.sectionTitle}>
              What happens after you <em>open the workspace</em>
            </h2>
            <p className={styles.sectionLead}>
              The product is designed to answer three questions every investor
              cares about: what do I own, what matters right now, and what
              should I consider next?
            </p>

            <div className={styles.stepsList}>
              <div className={styles.step}>
                <div className={styles.stepNum}>1</div>
                <div className={styles.stepContent}>
                  <strong>Create your account</strong>
                  <p>
                    Your private workspace is created automatically, so you begin
                    with one place dedicated to your portfolio alone.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNum}>2</div>
                <div className={styles.stepContent}>
                  <strong>Add your holdings</strong>
                  <p>
                    Enter the stocks, ETFs, or funds you own. The workspace turns
                    them into a live picture of concentration, exposure, and
                    performance.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNum}>3</div>
                <div className={styles.stepContent}>
                  <strong>Review risk, choices, and next steps</strong>
                  <p>
                    Open the workspace to see your portfolio, the market forces
                    shaping it, the risk building underneath it, and the actions
                    worth considering.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.stepsRight} aria-hidden="true">
            <div className={styles.mockPanel}>
              <div className={styles.mockHeader}>
                <span className={styles.mockDot} />
                <span className={styles.mockDot} />
                <span className={styles.mockDot} />
                <span className={styles.mockTitle}>Your workspace</span>
              </div>
              <div className={styles.mockRows}>
                <div className={styles.mockRow}>
                  <div className={styles.mockRowBody}>
                    <span className={styles.mockRowLabel}>Net freedom</span>
                    <span className={styles.mockRowSub}>How much room the portfolio still has</span>
                  </div>
                  <span className={styles.mockRowValue} data-tone="green">
                    61%
                  </span>
                </div>
                <div className={styles.mockRow}>
                  <div className={styles.mockRowBody}>
                    <span className={styles.mockRowLabel}>Phantom tax</span>
                    <span className={styles.mockRowSub}>Surface rebound still needs proof</span>
                  </div>
                  <span className={styles.mockRowValue} data-tone="red">
                    34%
                  </span>
                </div>
                <div className={styles.mockRow}>
                  <div className={styles.mockRowBody}>
                    <span className={styles.mockRowLabel}>Largest concentration</span>
                    <span className={styles.mockRowSub}>One position is driving more of the risk</span>
                  </div>
                  <span className={styles.mockRowValue} data-tone="gold">
                    TSLA
                  </span>
                </div>
                <div className={styles.mockRow}>
                  <div className={styles.mockRowBody}>
                    <span className={styles.mockRowLabel}>Optionality reserve</span>
                    <span className={styles.mockRowSub}>Flexibility left after a wrong move</span>
                  </div>
                  <span className={styles.mockRowValue} data-tone="green">
                    48%
                  </span>
                </div>
              </div>
              <div className={styles.mockDecisionBanner}>
                <div className={styles.mockDecisionText}>
                  <span className={styles.mockDecisionLabel}>Suggested next move</span>
                  <span className={styles.mockDecisionValue}>
                    Trim concentration before adding new risk to the book
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.sectionDivider} aria-hidden="true" />

      <div className={`${styles.section} ${styles.featuresSection}`}>
        <div className={styles.featuresIntro}>
          <div>
            <p className={styles.tag}>What you get</p>
            <h2 className={styles.sectionTitle}>
              A plain-English operating view
              <br />
              <em>for your investing life</em>
            </h2>
          </div>
          <p className={styles.sectionLead}>
            If you are not technical, this is the simplest way to read the
            product: it helps you understand the portfolio you already have, the
            risk sitting inside it, and the moves that are worth your attention.
          </p>
        </div>

        <div className={styles.offeringList}>
          {offering.map((item) => (
            <article className={styles.offeringRow} key={item.title}>
              <h3 className={styles.offeringTitle}>{item.title}</h3>
              <p className={styles.offeringDesc}>{item.description}</p>
            </article>
          ))}
        </div>

        <div className={styles.explainerSection}>
          <div>
            <p className={styles.tag}>Plain-English guide</p>
            <h2 className={styles.sectionTitle}>
              What the unusual terms
              <br />
              <em>actually mean</em>
            </h2>
          </div>
          <div className={styles.glossary}>
            {plainEnglishGuide.map((item) => (
              <div className={styles.glossaryRow} key={item.term}>
                <strong className={styles.glossaryTerm}>{item.term}</strong>
                <p className={styles.glossaryDesc}>{item.meaning}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.trustStrip}>
          <div className={styles.trustItem}>
            Private by default and centered on your own portfolio
          </div>
          <div className={styles.trustItem}>
            Manual holdings entry works if you do not want a broker connection
          </div>
          <div className={styles.trustItem}>
            Built to support better decisions, not push constant trading
          </div>
          <div className={styles.trustItem}>
            Designed so a serious investor can understand it in one sitting
          </div>
        </div>
      </div>

      <div className={styles.sectionDivider} aria-hidden="true" />

      <div className={styles.closerSection}>
        <h2 className={styles.closerTitle}>
          One place to understand
          <br />
          <em>what your portfolio is really doing.</em>
        </h2>
        <p className={styles.closerSub}>
          Open the workspace when you want a cleaner read on risk, clearer next
          steps, and a better record of how you invest over time.
        </p>
        <div className={styles.closerActions}>
          <Link className={styles.btnPrimary} href={ctaHref}>
            {ctaLabel}
          </Link>
          {!session && (
            <Link className={styles.btnSecondary} href="/login">
              New or returning users -&gt;
            </Link>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <p>
          (c) {new Date().getFullYear()} {config.appName}. A private workspace
          for investors who want clarity before action.
        </p>
      </footer>
    </main>
  );
}
