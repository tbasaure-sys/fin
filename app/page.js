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
          <a href="#workflow">Plain English</a>
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
          <p className={styles.eyebrow}>Rules, visibility, and real repair</p>
          <h1 className={styles.headline}>Know when a money move is actually allowed.</h1>
          <p className={styles.subheadline}>
            BLS Prime checks three things before you act: do your rules allow it,
            can the market see the reason for the bet, and is the rebound real or just cosmetic.
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
          <p className={styles.sectionTag}>Plain-English system</p>
          <h2 className={styles.sectionTitle}>Three checks before capital moves.</h2>
          <p className={styles.sectionBody}>
            No finance background needed. The workspace translates complex market structure
            into simple answers: allowed, hidden, fake calm, or real repair.
          </p>
        </div>

        <SupportStrip />
      </section>

      <section className={styles.finalBand} id="cta">
        <p className={styles.sectionTag}>BLS Prime</p>
        <h2 className={styles.finalTitle}>Move only when the answer has standing.</h2>
        <p className={styles.finalBody}>
          Set the rules once, let the workspace review every decision, and keep a record
          of what happened after you acted or waited.
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

      <footer className={styles.footer}>
        <p>
          (c) {new Date().getFullYear()} {publicBrand}. Rules, visibility, and repair
          before action. Not financial advice.
        </p>
        <Link href="/terms">Terms of Service</Link>
      </footer>
    </main>
  );
}
