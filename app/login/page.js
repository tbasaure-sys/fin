import Link from "next/link";
import styles from "@/app/login-page.module.css";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }) {
  const next = typeof searchParams?.next === "string" ? searchParams.next : "/app";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";

  return (
    <main className={styles.page}>
      <div className={styles.stage}>
        <section className={styles.copy}>
          <p className={styles.kicker}>Private workspace access</p>
          <p className={styles.wordmark}>BLS Prime</p>
          <h1>Enter your private decision workspace.</h1>
          <p className={styles.support}>
            Your holdings, staged actions, counterfactual ledger, and mandate stay scoped to your signed-in workspace.
          </p>

          <div className={styles.copyNotes}>
            <article>
              <span>Private book</span>
              <p>The authenticated workspace resolves to your portfolio context, not a shared demo state.</p>
            </article>
            <article>
              <span>Fresh analysis</span>
              <p>Railway remains the analysis source of truth and the app shows freshness state directly.</p>
            </article>
            <article>
              <span>Daily ritual</span>
              <p>Sign in once, return to the same calm surface, and keep the book, decision history, and freshness state aligned.</p>
            </article>
          </div>
        </section>

        <form className={styles.panel} method="post" action="/api/auth/login">
          <input type="hidden" name="next" value={next} />
          <p className={styles.panelKicker}>Member sign in</p>
          <h2>Open BLS Prime.</h2>
          <p className={styles.panelSupport}>Use the private access code configured for this deployment.</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.form}>
            <label className={styles.field}>
              <span>Name</span>
              <input name="name" type="text" placeholder="Tomas" autoComplete="name" />
            </label>
            <label className={styles.field}>
              <span>Email</span>
              <input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
            </label>
            <label className={styles.field}>
              <span>Access code</span>
              <input name="accessCode" type="password" placeholder="Private access code" required />
            </label>
          </div>
          <div className={styles.panelFootnote}>
            <span>Private routing</span>
            <p>Your session opens the workspace directly and keeps holdings, staging, and refresh state scoped to your account context.</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.primaryButton} type="submit">Enter workspace</button>
            <Link className={styles.secondaryButton} href="/">Back</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
