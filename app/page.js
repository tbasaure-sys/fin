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
          <a href="#workspace">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href="#cta">Start</a>
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
          <p className={styles.eyebrow}>Personal finance, portfolio clarity, and research</p>
          <h1 className={styles.headline}>A calmer way to manage cash and investments.</h1>
          <p className={styles.subheadline}>
            Follow monthly cashflow, understand what is really driving the portfolio, and keep
            research close to the decision it is meant to support.
          </p>

          <div className={styles.heroActions}>
            <Link className={styles.btnPrimary} href={primaryHref}>
              {primaryLabel}
            </Link>
            <a className={styles.btnGhost} href="#workspace">
              View the platform
            </a>
          </div>
        </div>

        <div className={styles.workspaceStage} id="workspace">
          <WorkspacePreview brand={publicBrand} />
        </div>
      </section>

      <section className={styles.section} id="workflow">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionTag}>One operating model</p>
          <h2 className={styles.sectionTitle}>Cashflow, portfolio, and research should inform the same decision.</h2>
          <p className={styles.sectionBody}>
            The monthly plan funds the portfolio. The portfolio shapes the research. The research
            returns to a cleaner action. BLS Prime keeps that loop in one place.
          </p>
        </div>

        <SupportStrip />
      </section>

      <section className={styles.finalBand} id="cta">
        <p className={styles.sectionTag}>BLS Prime</p>
        <h2 className={styles.finalTitle}>Keep the full picture in one workspace.</h2>
        <p className={styles.finalBody}>
          A cleaner daily rhythm for saving, investing, and studying what you own.
        </p>

        <div className={styles.heroActions}>
          <Link className={styles.btnPrimary} href={primaryHref}>
            {primaryLabel}
          </Link>
          <a className={styles.btnGhost} href="#workflow">
            See the workflow
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          (c) {new Date().getFullYear()} {publicBrand}. Personal finance, portfolio clarity, and
          research in one workspace. Not financial advice.
        </p>
        <Link href="/terms">Terms of Service</Link>
      </footer>
    </main>
  );
}
