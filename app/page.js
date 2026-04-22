import Link from "next/link";

import {
  ExposureComparison,
  HeroDashboard,
  ResearchSystem,
} from "@/components/public-home-experience";
import styles from "@/app/home-page.module.css";
import { getServerAuthSession } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

const FEATURE_STRIP = [
  {
    title: "Personal finance",
    detail: "Monthly cashflow, fixed costs, variable spending, and investable cash in one place.",
  },
  {
    title: "Portfolio clarity",
    detail: "See portfolio mix, underlying exposure, and concentration with cleaner context.",
  },
  {
    title: "Research desk",
    detail: "Turn company work into a living memo instead of scattered notes.",
  },
  {
    title: "Decision support",
    detail: "Keep the next move tied to what the portfolio can actually absorb.",
  },
  {
    title: "Private by design",
    detail: "A calm workspace for your own finances, portfolio, and research.",
  },
];

const CLARITY_POINTS = [
  "Compare portfolio mix and underlying exposure side by side.",
  "Spot overlap before a small concentration becomes the whole story.",
  "Connect each read to a decision that still makes sense in real life.",
];

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
          <a href="#product">Product</a>
          <a href="#clarity">Portfolio clarity</a>
          <a href="#research">Research</a>
          <a href="#cta">About</a>
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
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Personal finance. Portfolio clarity. Research.</p>
          <h1 className={styles.headline}>Clarity for your money. Confidence for your portfolio.</h1>
          <p className={styles.subheadline}>
            {publicBrand} brings together monthly cashflow, portfolio oversight, and research in one
            calm workspace, so each decision starts with context instead of clutter.
          </p>

          <div className={styles.heroActions}>
            <Link className={styles.btnPrimary} href={primaryHref}>
              {primaryLabel}
            </Link>
            <a className={styles.btnGhost} href="#product">
              See the platform
            </a>
          </div>
        </div>

        <div className={styles.heroVisual} id="product">
          <HeroDashboard brand={publicBrand} />
        </div>
      </section>

      <section className={styles.featureStrip} aria-label="Core capabilities">
        {FEATURE_STRIP.map((item) => (
          <article className={styles.featureItem} key={item.title}>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className={styles.section} id="clarity">
        <div className={styles.sectionGrid}>
          <div className={styles.editorialBlock}>
            <p className={styles.sectionTag}>A clearer view of diversification</p>
            <h2 className={styles.sectionTitle}>See portfolio mix and underlying exposure in the same frame.</h2>
            <p className={styles.sectionBody}>
              The goal is not to overwhelm with metrics. It is to make the portfolio easier to read,
              easier to explain, and easier to improve.
            </p>
            <ul className={styles.bulletList}>
              {CLARITY_POINTS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <ExposureComparison />
        </div>
      </section>

      <section className={styles.section} id="research">
        <ResearchSystem />
      </section>

      <section className={styles.finalBand} id="cta">
        <p className={styles.sectionTag}>BLS Prime</p>
        <h2 className={styles.finalBandTitle}>
          Bring your finances and investing into one calm, intelligent workspace.
        </h2>
        <p className={styles.finalBandBody}>
          Follow the cash, understand the portfolio, and keep research close to the decision it is
          meant to support.
        </p>
        <div className={styles.heroActions}>
          <Link className={styles.btnPrimary} href={primaryHref}>
            {primaryLabel}
          </Link>
          <a className={styles.btnGhost} href="#clarity">
            Explore portfolio clarity
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
