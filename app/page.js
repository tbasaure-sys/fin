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

  return (
    <main className={styles.page}>

      {/* ── HERO ──────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBg} aria-hidden="true" />

        <nav className={styles.nav}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandMark} aria-hidden="true">
              <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 12 L8 4 L14 12" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span className={styles.brandName}>{config.appName}</span>
          </Link>
          <div className={styles.navActions}>
            {session ? (
              <>
                <Link className={styles.btnSecondary} href="/app">Go to workspace</Link>
                <form action="/api/auth/logout" method="post" style={{ display: "contents" }}>
                  <button className={styles.btnGhost} type="submit">Sign out</button>
                </form>
              </>
            ) : (
              <Link className={styles.btnGhost} href="/login">Sign in</Link>
            )}
          </div>
        </nav>

        <div className={styles.heroBody}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Private investment workspace
          </p>

          <h1 className={styles.headline}>
            Your portfolio,<br />
            <em className={styles.headlineAccent}>always clear.</em>
          </h1>

          <p className={styles.sub}>
            See your holdings, understand the market, and know what to consider
            doing next — all in one private workspace built for you.
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
        </div>

        <div className={styles.scrollHint} aria-hidden="true">
          <span className={styles.scrollLine} />
          <span>Scroll to explore</span>
        </div>
      </section>

      <div className={styles.sectionDivider} aria-hidden="true" />

      {/* ── HOW IT WORKS ──────────────────────────── */}
      <div id="how-it-works" className={styles.section}>
        <div className={styles.stepsSection}>
          <div className={styles.stepsLeft}>
            <p className={styles.tag}>How it works</p>
            <h2 className={styles.sectionTitle}>
              Up and running <em>in minutes</em>
            </h2>
            <p className={styles.sectionLead}>
              No complicated setup. Add your holdings once and your workspace
              stays current automatically.
            </p>

            <div className={styles.stepsList}>
              <div className={styles.step}>
                <div className={styles.stepNum}>1</div>
                <div className={styles.stepContent}>
                  <strong>Create your account</strong>
                  <p>Sign in with your email and private access code. Your personal workspace is created automatically on first visit.</p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNum}>2</div>
                <div className={styles.stepContent}>
                  <strong>Add your holdings</strong>
                  <p>Enter the stocks, ETFs, or funds you own. Your workspace keeps track of weights, performance, and exposure.</p>
                </div>
              </div>
              <div className={styles.step}>
                <div className={styles.stepNum}>3</div>
                <div className={styles.stepContent}>
                  <strong>See the full picture</strong>
                  <p>Open your workspace and get a clear view of your portfolio alongside market context and what to think about next.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Decorative mock panel */}
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
                  <div className={styles.mockRowIcon} data-tone="gold">📊</div>
                  <div className={styles.mockRowBody}>
                    <span className={styles.mockRowLabel}>AAPL</span>
                    <span className={styles.mockRowSub}>28.4% of portfolio</span>
                  </div>
                  <span className={styles.mockRowValue} data-tone="green">+14.2%</span>
                </div>
                <div className={styles.mockRow}>
                  <div className={styles.mockRowIcon} data-tone="teal">📈</div>
                  <div className={styles.mockRowBody}>
                    <span className={styles.mockRowLabel}>SPY</span>
                    <span className={styles.mockRowSub}>18.1% of portfolio</span>
                  </div>
                  <span className={styles.mockRowValue} data-tone="green">+7.6%</span>
                </div>
                <div className={styles.mockRow}>
                  <div className={styles.mockRowIcon} data-tone="red">⚠️</div>
                  <div className={styles.mockRowBody}>
                    <span className={styles.mockRowLabel}>TSLA</span>
                    <span className={styles.mockRowSub}>11.2% of portfolio</span>
                  </div>
                  <span className={styles.mockRowValue} data-tone="red">−8.4%</span>
                </div>
                <div className={styles.mockRow}>
                  <div className={styles.mockRowIcon} data-tone="green">🛡</div>
                  <div className={styles.mockRowBody}>
                    <span className={styles.mockRowLabel}>SGOV</span>
                    <span className={styles.mockRowSub}>9.0% · Cash-like</span>
                  </div>
                  <span className={styles.mockRowValue} data-tone="neutral">+0.4%</span>
                </div>
              </div>
              <div className={styles.mockDecisionBanner}>
                <span className={styles.mockDecisionIcon}>💡</span>
                <div className={styles.mockDecisionText}>
                  <span className={styles.mockDecisionLabel}>Suggested action</span>
                  <span className={styles.mockDecisionValue}>Consider trimming TSLA — concentration risk elevated</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.sectionDivider} aria-hidden="true" />

      {/* ── FEATURES ──────────────────────────────── */}
      <div className={`${styles.section} ${styles.featuresSection}`}>
        <div className={styles.featuresIntro}>
          <div>
            <p className={styles.tag}>What you get</p>
            <h2 className={styles.sectionTitle}>
              Everything you need,<br /><em>nothing you don't</em>
            </h2>
          </div>
          <p className={styles.sectionLead}>
            A focused set of tools for investors who want clarity — not noise.
            Built around the decisions you actually make.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon} data-tone="gold">📋</div>
            <h3 className={styles.featureTitle}>Portfolio overview</h3>
            <p className={styles.featureDesc}>
              All your holdings in one view. See exactly how much you own of each position,
              how they're performing, and how they fit together.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon} data-tone="gold">🎯</div>
            <h3 className={styles.featureTitle}>Next move guidance</h3>
            <p className={styles.featureDesc}>
              Get structured suggestions on what to consider — whether that's trimming
              a position, adding protection, or simply holding steady.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon} data-tone="teal">🌐</div>
            <h3 className={styles.featureTitle}>Market context</h3>
            <p className={styles.featureDesc}>
              Understand how current market conditions are specifically affecting
              your portfolio — not just generic news headlines.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon} data-tone="green">📝</div>
            <h3 className={styles.featureTitle}>Decision journal</h3>
            <p className={styles.featureDesc}>
              Keep a running log of every investment decision you make. Review
              your reasoning later and learn from both wins and mistakes.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon} data-tone="teal">👁</div>
            <h3 className={styles.featureTitle}>Watchlist</h3>
            <p className={styles.featureDesc}>
              Track stocks you're following without having to own them yet.
              Stay on top of opportunities without losing focus on your portfolio.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon} data-tone="blue">🔔</div>
            <h3 className={styles.featureTitle}>Alerts</h3>
            <p className={styles.featureDesc}>
              Set conditions and get notified when something important changes —
              so you never miss a moment that matters to your portfolio.
            </p>
          </div>
        </div>

        <div className={styles.trustStrip}>
          <div className={styles.trustItem}>
            <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 1L9.8 5.8L15 6.3L11.1 9.7L12.4 15L8 12.1L3.6 15L4.9 9.7L1 6.3L6.2 5.8L8 1Z"/></svg>
            Private by default — your data stays yours
          </div>
          <div className={styles.trustItem}>
            <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 1L9.8 5.8L15 6.3L11.1 9.7L12.4 15L8 12.1L3.6 15L4.9 9.7L1 6.3L6.2 5.8L8 1Z"/></svg>
            No brokerage connection required
          </div>
          <div className={styles.trustItem}>
            <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 1L9.8 5.8L15 6.3L11.1 9.7L12.4 15L8 12.1L3.6 15L4.9 9.7L1 6.3L6.2 5.8L8 1Z"/></svg>
            Works for individual investors at any level
          </div>
          <div className={styles.trustItem}>
            <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M8 1L9.8 5.8L15 6.3L11.1 9.7L12.4 15L8 12.1L3.6 15L4.9 9.7L1 6.3L6.2 5.8L8 1Z"/></svg>
            Always up to date — no manual refreshing
          </div>
        </div>
      </div>

      <div className={styles.sectionDivider} aria-hidden="true" />

      {/* ── CLOSER CTA ────────────────────────────── */}
      <div className={styles.closerSection}>
        <h2 className={styles.closerTitle}>
          Stop guessing.<br />
          <em>Start deciding with clarity.</em>
        </h2>
        <p className={styles.closerSub}>
          Your workspace is waiting. Set it up once, and you'll always know
          where your portfolio stands and what to think about next.
        </p>
        <div className={styles.closerActions}>
          <Link className={styles.btnPrimary} href={ctaHref}>
            {ctaLabel}
          </Link>
          {!session && (
            <Link className={styles.btnSecondary} href="/login">
              New or returning users →
            </Link>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <p>© {new Date().getFullYear()} {config.appName}. A private workspace for thoughtful investors.</p>
      </footer>

    </main>
  );
}
