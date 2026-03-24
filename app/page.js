import Link from "next/link";

import { getServerAuthSession } from "@/lib/server/auth/session";
import styles from "@/app/public-home.module.css";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerAuthSession();
  const primaryHref = session ? "/app" : "/login";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.backdrop} aria-hidden="true">
          <div className={styles.photo} />
          <div className={styles.scan} />
        </div>

        <header className={styles.header}>
          <Link className={styles.lockup} href="/">
            <span className={styles.lockupName}>BLS Prime</span>
          </Link>

          <div className={styles.headerActions}>
            {session ? (
              <form action="/api/auth/logout" method="post">
                <button className={styles.secondaryButton} type="submit">Sign out</button>
              </form>
            ) : (
              <Link className={styles.secondaryButton} href="/login">Member sign in</Link>
            )}
          </div>
        </header>

        <div className={styles.composition}>
          <div className={styles.copy}>
            <p className={styles.kicker}>Decision OS for capital under uncertainty</p>
            <p className={styles.wordmark}>BLS Prime</p>
            <h1>Operate your portfolio with one clear daily surface.</h1>
            <p className={styles.support}>
              Keep the private book current, know what to do today, and stage decisions before you act.
            </p>
            <div className={styles.ctaRow}>
              <Link className={styles.primaryButton} href={primaryHref}>
                Open workspace
              </Link>
              <Link className={styles.secondaryButton} href={primaryHref}>
                {session ? "View portfolio" : "Member sign in"}
              </Link>
            </div>
            <p className={styles.caption}>
              {session ? "Your private workspace is ready." : "Simple sign in, private workspace, everything available from day one."}
            </p>
          </div>

          <div className={styles.heroPanel}>
            <div className={styles.heroPanelTop}>
              <span>Freshness</span>
              <strong>Railway-backed analysis with private portfolio overlays</strong>
            </div>
            <div className={styles.heroStack}>
              <article>
                <span>Private holdings</span>
                <strong>Real book context</strong>
                <p>Track the actual positions, the current weights, and the history behind the book instead of a demo surface.</p>
              </article>
              <article>
                <span>Today&apos;s call</span>
                <strong>One explicit next action</strong>
                <p>Open the workspace and see what to do now, why it matters, and what would invalidate the read.</p>
              </article>
              <article>
                <span>Staged execution</span>
                <strong>Prepare before acting</strong>
                <p>Queue a move, keep the decision log, and let freshness state tell you when the setup has improved.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.supportStrip}>
        <article>
          <span>Private portfolio</span>
          <p>See the actual book, the current weights, and live holdings updates without leaving the operating surface.</p>
        </article>
        <article>
          <span>Decision clarity</span>
          <p>One serious daily call: what to do now, why it is justified, and what has to change before risk expands.</p>
        </article>
        <article>
          <span>Live state</span>
          <p>Railway remains the source of truth, while the app shows freshness, stale state, and refresh progress honestly.</p>
        </article>
      </section>

      <section className={styles.proofSection}>
        <div className={styles.sectionIntro}>
          <p className={styles.sectionKicker}>Why it holds attention</p>
          <h2>Everything important is visible before the first click.</h2>
        </div>
        <div className={styles.proofGrid}>
          <article>
            <span>Book state</span>
            <strong>Live holdings, current weights, stored history</strong>
            <p>The workspace opens on the actual portfolio context instead of dropping you into a generic overview.</p>
          </article>
          <article>
            <span>Decision state</span>
            <strong>One recommendation with explicit invalidation</strong>
            <p>The product stays persuasive because it tells you what changed, what to do, and what would make the read wrong.</p>
          </article>
          <article>
            <span>Freshness state</span>
            <strong>Manual refresh, scheduled refresh, live status</strong>
            <p>You never need to guess whether the screen is current. Freshness is part of the product, not hidden plumbing.</p>
          </article>
        </div>
      </section>

      <section className={styles.workflowSection}>
        <div className={styles.workflowLead}>
          <p className={styles.sectionKicker}>Operator flow</p>
          <h2>Read. stage. update. come back tomorrow.</h2>
          <p>
            The experience is designed like a repeated daily ritual: open the workspace, absorb the live state in seconds,
            stage a move if the read is legitimate, and keep the book current with a natural-language trade note.
          </p>
        </div>

        <div className={styles.workflowRail}>
          <article>
            <span>01</span>
            <div>
              <strong>Open on the right surface</strong>
              <p>The first screen is already the operating surface, not a dashboard of unrelated widgets.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <strong>Absorb the current call</strong>
              <p>The decision panel tells you the next move, the current size logic, and the invalidation path without extra hunting.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <strong>Keep the portfolio honest</strong>
              <p>Update the book naturally, see the effect on the workspace, and keep the history coherent over time.</p>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div>
          <p className={styles.sectionKicker}>Ready</p>
          <h2>Stay inside one surface that knows what matters today.</h2>
          <p>
            BLS Prime is most useful when it becomes the page you return to first and the page you leave open longest.
          </p>
        </div>
        <div className={styles.ctaRow}>
          <Link className={styles.primaryButton} href={primaryHref}>
            {session ? "Return to workspace" : "Enter workspace"}
          </Link>
          {!session ? <Link className={styles.secondaryButton} href="/login">Use access code</Link> : null}
        </div>
      </section>
    </main>
  );
}
