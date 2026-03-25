import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";
import styles from "@/app/public-home.module.css";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = getServerConfig();
  const session = await getServerAuthSession();
  const primaryHref = session ? "/app" : "/login";
  const secondaryHref = session ? "/app" : "/";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroMedia} aria-hidden="true">
          <div className={styles.heroPhoto} />
          <div className={styles.heroVeil} />
          <div className={styles.heroGlow} />
        </div>

        <header className={styles.header}>
          <Link className={styles.brand} href="/">
            <span className={styles.brandName}>{config.appName}</span>
          </Link>
          <div className={styles.headerActions}>
            {session ? (
              <form action="/api/auth/logout" method="post">
                <button className={styles.ghostButton} type="submit">Sign out</button>
              </form>
            ) : (
              <Link className={styles.ghostButton} href="/login">Member sign in</Link>
            )}
          </div>
        </header>

        <div className={styles.heroBody}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Private workspace</p>
            <p className={styles.wordmark}>{config.appName}</p>
            <h1>Portfolio, state, and action in one place.</h1>
            <p className={styles.lead}>
              Open the workspace, see what changed, and decide what to do next.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href={primaryHref}>
                {session ? "Return to workspace" : "Open workspace"}
              </Link>
              <Link className={styles.secondaryButton} href={secondaryHref}>
                {session ? "Stay on home" : "Back"}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.support}>
        <div className={styles.supportLead}>
          <p className={styles.sectionKicker}>What you get</p>
          <h2>The essentials, without the noise.</h2>
        </div>
        <div className={styles.supportRail}>
          <article>
            <strong>Portfolio</strong>
            <p>Current holdings, weights, and exposure in one view.</p>
          </article>
          <article>
            <strong>Decision</strong>
            <p>The current call, sizing, and reason to act or wait.</p>
          </article>
          <article>
            <strong>Freshness</strong>
            <p>A clear signal for whether the read is current.</p>
          </article>
        </div>
      </section>

      <section className={styles.closer}>
        <div className={styles.closerCopy}>
          <p className={styles.sectionKicker}>Open it</p>
          <h2>Go straight to the workspace.</h2>
          <p>
            {config.appName} is built to keep the book and the current read in the same place.
          </p>
        </div>
        <div className={styles.closerActions}>
          <Link className={styles.primaryButton} href={primaryHref}>
            {session ? "Return to workspace" : "Enter workspace"}
          </Link>
          {!session ? <Link className={styles.ghostButton} href="/login">Sign in</Link> : null}
        </div>
      </section>
    </main>
  );
}
