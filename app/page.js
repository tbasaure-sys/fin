import Link from "next/link";

import { SupportStrip, WorkspacePreview } from "@/components/public-home-experience";
import styles from "@/app/home-page.module.css";
import { getServerAuthSession } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = getServerConfig();
  const session = await getServerAuthSession();
  const publicBrand = /allocator workspace/i.test(config.appName) ? "BLS Prime" : config.appName;
  const primaryHref = session ? "/app" : "/login";
  const primaryLabel = session ? "Open workspace" : "Get started";

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandName}>{publicBrand}</span>
        </Link>

        <div className={styles.navLinks} aria-label="Primary">
          <a href="#workspace">Product</a>
          <a href="#workflow">Solutions</a>
          <a href="#research">Research Layers</a>
          <a href="#cta">Start</a>
          <a href="#about">About</a>
        </div>

        <div className={styles.navActions}>
          {session ? (
            <>
              <Link className={styles.btnGhost} href="/app">
                Workspace
              </Link>
              <form action="/api/auth/logout" method="post" style={{ display: "contents" }}>
                <button className={styles.btnSecondary} type="submit">
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

      <section className={styles.hero}>
        <div className={styles.heroIntro}>
          <p className={styles.eyebrow}>AI-powered investment intelligence</p>
          <h1 className={styles.headline}>
            We do not just analyze your portfolio. We <span className={styles.headlineAccent}>understand it.</span>
          </h1>
          <p className={styles.subheadline}>
            BLS Prime uses a multi-layer transformer structure to read market data,
            weigh evidence, and turn complex portfolio signals into a clear next action.
          </p>

          <div className={styles.heroActions}>
            <Link className={styles.btnPrimary} href={primaryHref}>
              {primaryLabel}
            </Link>
            <a className={styles.btnGhost} href="#workspace">
              See the workspace
            </a>
          </div>
        </div>

        <div className={styles.workspaceStage} id="workspace">
          <WorkspacePreview brand={publicBrand} />
        </div>
      </section>

      <section className={styles.section} id="workflow">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionTag}>Transformer operating model</p>
          <h2 className={styles.sectionTitle}>Signals become decisions through layers.</h2>
          <p className={styles.sectionBody}>
            No finance background needed. Each layer has a simple job: collect the evidence,
            find what matters, stress-test the disagreement, combine the views, and show the action.
          </p>
        </div>

        <SupportStrip />
      </section>

      <section className={styles.finalBand} id="research">
        <p className={styles.sectionTag}>Research layers</p>
        <h2 className={styles.finalTitle}>Many analytical layers. One accountable answer.</h2>
        <p className={styles.finalBody}>
          The system does not ask one model for an opinion. It routes the decision through
          layers for valuation, risk, macro, flows, and policy, then shows why the final call won.
        </p>

        <div className={styles.heroActions}>
          <a className={styles.btnPrimary} href="#workspace">
            View the engine
          </a>
          <a className={styles.btnGhost} href="#cta">
            Start with your portfolio
          </a>
        </div>
      </section>

      <section className={styles.finalBand} id="cta">
        <p className={styles.sectionTag}>BLS Prime</p>
        <h2 className={styles.finalTitle}>Move only when the layers agree enough.</h2>
        <p className={styles.finalBody}>
          Set your rules once, let the layers review every decision, and keep a record
          of which signals, weights, and checks led to action or restraint.
        </p>

        <div className={styles.heroActions}>
          <Link className={styles.btnPrimary} href={primaryHref}>
            {primaryLabel}
          </Link>
          <a className={styles.btnGhost} href="#workflow">
            See how it works
          </a>
        </div>
      </section>

      <footer className={styles.footer} id="about">
        <p>
          (c) {new Date().getFullYear()} {publicBrand}. Multi-layer portfolio intelligence.
          Not financial advice.
        </p>
        <Link href="/terms">Terms of Service</Link>
      </footer>
    </main>
  );
}
