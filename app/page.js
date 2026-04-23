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
          <a href="#workspace">Workspace</a>
          <a href="#layers">Layers</a>
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
          <p className={styles.eyebrow}>Personal finance. Portfolio clarity. Research.</p>
          <h1 className={styles.headline}>One workspace for your finances, portfolio, and research.</h1>
          <p className={styles.subheadline}>
            Ask about monthly cashflow, review the portfolio, read a company, and keep everything in
            the same calm decision workspace.
          </p>

          <div className={styles.heroActions}>
            <Link className={styles.btnPrimary} href={primaryHref}>
              {primaryLabel}
            </Link>
            <a className={styles.btnGhost} href="#workspace">
              See the platform
            </a>
          </div>
        </div>

        <div className={styles.workspaceStage} id="workspace">
          <WorkspacePreview brand={publicBrand} />
        </div>
      </section>

      <section className={styles.section} id="layers">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionTag}>One question, layered answers</p>
          <h2 className={styles.sectionTitle}>Start with the answer, then open the layers that matter.</h2>
          <p className={styles.sectionBody}>
            BLS Prime keeps the current read simple first, then lets you open the money plan, the
            portfolio structure, the company brief, and the supporting references without losing the thread.
          </p>
        </div>

        <SupportStrip />
      </section>

      <section className={styles.finalBand} id="cta">
        <p className={styles.sectionTag}>BLS Prime</p>
        <h2 className={styles.finalTitle}>A calmer way to manage personal finance and investing together.</h2>
        <p className={styles.finalBody}>
          Follow the cash, understand the portfolio, and keep research close to the decision it is
          supposed to support.
        </p>

        <div className={styles.heroActions}>
          <Link className={styles.btnPrimary} href={primaryHref}>
            {primaryLabel}
          </Link>
          <a className={styles.btnGhost} href="#layers">
            Explore the layers
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
