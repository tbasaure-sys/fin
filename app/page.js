import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";
import { getServerConfig } from "@/lib/server/config";
import styles from "@/app/public-home.module.css";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = getServerConfig();
  const session = await getServerAuthSession();
  const primaryHref = session ? "/app" : "/login";

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
            <p className={styles.kicker}>Decision OS for private capital</p>
            <p className={styles.wordmark}>{config.appName}</p>
            <h1>One beautiful surface for the book, the call, and the next move.</h1>
            <p className={styles.lead}>
              Keep the portfolio current, read the state fast, and stage action without breaking focus.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href={primaryHref}>
                {session ? "Return to workspace" : "Open workspace"}
              </Link>
              <Link className={styles.secondaryButton} href={primaryHref}>
                {session ? "View portfolio" : "Use access code"}
              </Link>
            </div>
          </div>

          <div className={styles.heroAside}>
            <div className={styles.asideRow}>
              <span>Private holdings</span>
              <p>The actual book, current weights, and live overlays stay in one place.</p>
            </div>
            <div className={styles.asideRow}>
              <span>One clear read</span>
              <p>The workspace tells you what matters now and what would reopen the decision.</p>
            </div>
            <div className={styles.asideRow}>
              <span>Stage before acting</span>
              <p>Queue the move, keep the memory, and let freshness state confirm the setup.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.support}>
        <div className={styles.supportLead}>
          <p className={styles.sectionKicker}>Why it sticks</p>
          <h2>Fast enough for every morning. Serious enough to leave open all day.</h2>
        </div>
        <div className={styles.supportRail}>
          <article>
            <span>01</span>
            <strong>Book state</strong>
            <p>Open on the real portfolio instead of a generic dashboard.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Decision state</strong>
            <p>See the current call, the size logic, and the invalidation path immediately.</p>
          </article>
          <article>
            <span>03</span>
            <strong>Freshness state</strong>
            <p>Know whether the read is live, aging, stale, or already refreshed.</p>
          </article>
        </div>
      </section>

      <section className={styles.detail}>
        <div className={styles.detailImage} aria-hidden="true" />
        <div className={styles.detailCopy}>
          <p className={styles.sectionKicker}>Operator flow</p>
          <h2>Read. stage. return.</h2>
          <div className={styles.flowList}>
            <div>
              <strong>Open on the right context</strong>
              <p>The first screen already knows the holdings, the structure, and the current pressure.</p>
            </div>
            <div>
              <strong>Absorb the call in seconds</strong>
              <p>One primary action, a few supporting reads, and a visible reason not to overtrade.</p>
            </div>
            <div>
              <strong>Keep the memory honest</strong>
              <p>Staged moves, decision history, and counterfactuals make the surface sharper over time.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.closer}>
        <div className={styles.closerCopy}>
          <p className={styles.sectionKicker}>Daily surface</p>
          <h2>Make this the first tab you trust.</h2>
          <p>
            {config.appName} works best when the book, the state, and the next decision all live in the same calm place.
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
